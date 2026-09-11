// ============================================================================
//  POST /api/email/classificar-ia  ·  a IA lê os pedidos que a régua não leu
//
//  Fase 2 do Carteiro gerencial (plano aprovado em 11/09/2026). A tela manda
//  os e-mails dos pedidos "sem classificação"; a IA diz o tipo, a modalidade,
//  o CNPJ e o trecho que sustenta, e grava com recibo. Quem decide o apetite
//  continua sendo a régua, e quem soma a ponte continua sendo o código.
//
//  O MODELO é o da casa (`ia_config.modelo`, Sonnet 5), com esforço baixo. O
//  plano falava em Haiku 4.5; a troca é de propósito: a FAM decidiu inferência
//  só nos Estados Unidos por LGPD (`inference_geo: 'us'`), e esse controle é
//  dos modelos a partir da geração 4.6. Com esforço baixo, classificar um
//  e-mail sai por volta de US$ 0,003, e o custo real fica medido em `ia_pedidos`.
//
//  AS TRAVAS, na ordem da IA Gestor (app/api/ia/perguntar/route.ts):
//    origem · sessão · perfil que escreve · interruptor · chave · teto do dia
//
//  O TETO NÃO FURA (achado da revisão de segurança de 11/09/2026). Antes de
//  chamar a IA, a rota RESERVA o custo máximo do lote em `ia_pedidos` e só
//  depois chama; no fim acerta para o custo real. Dois lotes ao mesmo tempo
//  não passam juntos pela conferência: enquanto um lote está "respondendo",
//  outro espera. E "refazer" (mandar de novo o que a IA já leu) é só do
//  proprietário.
//
//  QUEM LÊ E QUEM GRAVA: os e-mails são lidos com a SESSÃO de quem pediu (a IA
//  só vê o que a pessoa vê). A gravação da decisão da IA e o acerto do custo
//  usam a service role, porque a RLS proíbe, com razão, qualquer pessoa gravar
//  como se fosse a IA, e o banco não deixa a sessão diminuir gasto registrado:
//  e só grava para os e-mails que a sessão leu nesta mesma chamada.
//
//  O QUE NÃO VAI PARA `ia_pedidos`: o conteúdo. Aquela tabela é lida pela
//  equipe inteira; ali fica só "classificou N e-mails" e o custo.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as criarSupabase } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { custoDoUso, PRECO } from '@/lib/ia/servidor'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'
import {
  conferirSaida, esquemaDaSaida, mensagemDoEmail, paraIA, reciboDaIA, sistemaDoClassificador,
  type EmailParaIA, type SaidaIA,
} from '@/lib/email/ia-saida'

export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_POR_VEZ = 40
const EM_PARALELO = 4
const MAX_TOKENS_SAIDA = 4000
/** O pior caso de entrada por e-mail (sistema + e-mail), para a reserva. */
const ENTRADA_MAXIMA_POR_EMAIL = 4000
const LOTE_VIVO_MS = 3 * 60_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Falha = { status: number; erro: string; parar: boolean }

function traduzirErro(e: unknown): Falha {
  if (e instanceof Anthropic.AuthenticationError) return { status: 502, erro: 'A chave da API da Anthropic foi recusada. Confira a ANTHROPIC_API_KEY.', parar: true }
  if (e instanceof Anthropic.RateLimitError) return { status: 429, erro: 'A API está com limite estourado agora. Tente de novo em um minuto.', parar: true }
  if (e instanceof Anthropic.BadRequestError) {
    const msg = e.message.toLowerCase()
    if (msg.includes('credit balance')) return { status: 402, erro: 'Acabou o crédito da conta da API. Adicione crédito no Console da Anthropic.', parar: true }
    if (msg.includes('usage limits')) return { status: 402, erro: 'A conta da API atingiu o limite de gasto definido nela.', parar: true }
    return { status: 502, erro: 'A API recusou o pedido.', parar: true }
  }
  if (e instanceof Anthropic.APIError) return { status: 502, erro: `A API respondeu ${e.status}.`, parar: false }
  return { status: 502, erro: 'Não consegui falar com a API da Anthropic.', parar: false }
}

export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const { data: quem } = await supabase.from('usuarios').select('nome, perfil, proprietario').eq('auth_id', user.id).maybeSingle()
  if (!quem || quem.perfil === 'leitura') {
    return NextResponse.json({ erro: 'Pedir à IA grava a classificação para todos: é preciso perfil que escreve.' }, { status: 403 })
  }

  const corpo = await req.json().catch(() => ({})) as Record<string, unknown>
  const ids = [...new Set((Array.isArray(corpo.ids) ? corpo.ids : []).map((x) => String(x ?? '')).filter((x) => UUID.test(x)))]
  // Mandar de novo o que a IA já leu custa de novo: decisão do proprietário.
  const refazer = corpo.refazer === true && !!quem.proprietario
  if (!ids.length) return NextResponse.json({ erro: 'Falta dizer quais e-mails.' }, { status: 422 })
  if (ids.length > MAX_POR_VEZ) {
    return NextResponse.json({ erro: `No máximo ${MAX_POR_VEZ} e-mails por vez: a tela manda o resto em seguida.` }, { status: 413 })
  }

  // ── o interruptor e a chave: os mesmos da IA Gestor ───────────────────────
  const { data: cfg } = await supabase.from('ia_config').select('api_ligada, modelo, teto_diario_usd').eq('id', 1).maybeSingle()
  if (!cfg?.api_ligada) {
    return NextResponse.json({ erro: 'A IA pela API está desligada. Quem liga é o proprietário, no painel da IA (Ctrl+I).', desligada: true }, { status: 409 })
  }
  const chave = process.env.ANTHROPIC_API_KEY
  if (!chave) {
    return NextResponse.json({ erro: 'A IA está ligada, mas a chave não está no ambiente deste CRM (ANTHROPIC_API_KEY).', sem_chave: true }, { status: 503 })
  }

  // ── um lote de cada vez ────────────────────────────────────────────────────
  const { data: emCurso } = await supabase.from('ia_pedidos').select('id')
    .eq('estado', 'respondendo').contains('contexto', { origem: 'carteiro_gerencial' })
    .gte('criado_em', new Date(Date.now() - LOTE_VIVO_MS).toISOString()).limit(1)
  if (emCurso?.length) {
    return NextResponse.json({ erro: 'A IA já está lendo um lote agora. Espere ele terminar: a tela atualiza sozinha.' }, { status: 429 })
  }

  // ── o que a sessão vê, e o que ainda precisa da IA ─────────────────────────
  const [{ data: linhas, error: erroLinhas }, { data: jaTem }, { data: mods }, { data: regua }] = await Promise.all([
    supabase.from('painel_pedidos')
      .select('id, assunto, email_de, anexos, previa, serve, eh_pedido, caso_id, estado, analisado_fora_em')
      .in('id', ids),
    supabase.from('email_classificacao').select('email_id, origem').in('email_id', ids),
    supabase.from('modalidades').select('nome'),
    supabase.from('email_regua').select('versao').order('versao', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (erroLinhas) return NextResponse.json({ erro: 'Não consegui ler os e-mails.' }, { status: 500 })

  const humano = new Set((jaTem ?? []).filter((c) => c.origem === 'humano').map((c) => c.email_id))
  const daIA = new Set((jaTem ?? []).filter((c) => c.origem === 'ia').map((c) => c.email_id))
  const elegiveis = (linhas ?? []).filter((l) =>
    !l.caso_id && l.estado !== 'trazido' && !l.analisado_fora_em &&
    l.eh_pedido !== false && (l.serve || l.eh_pedido === true) &&
    !humano.has(l.id) && (refazer || !daIA.has(l.id)))

  if (!elegiveis.length) {
    return NextResponse.json({ ok: true, classificados: 0, pulados: ids.length, custo_usd: 0 })
  }

  const modelo = String(cfg.modelo || 'claude-sonnet-5')

  // ── o teto do dia, contando a RESERVA deste lote ──────────────────────────
  const preco = PRECO[modelo] ?? PRECO['claude-sonnet-5']
  const reserva = Number((elegiveis.length * (ENTRADA_MAXIMA_POR_EMAIL * preco.entrada + MAX_TOKENS_SAIDA * preco.saida) / 1_000_000).toFixed(6))
  const teto = Number(cfg.teto_diario_usd ?? 0)
  if (teto > 0) {
    const desde = new Date(Date.now() - 86_400_000).toISOString()
    const { data: gastos } = await supabase.from('ia_pedidos').select('custo_usd').gte('criado_em', desde).not('custo_usd', 'is', null)
    const gasto = (gastos ?? []).reduce((s, g) => s + Number(g.custo_usd ?? 0), 0)
    if (gasto + reserva > teto) {
      return NextResponse.json({
        erro: `Este lote pode custar até US$ ${reserva.toFixed(2)} e passaria do teto do dia (US$ ${teto.toFixed(2)}, já gastos US$ ${gasto.toFixed(2)}). Mande menos pedidos, ou aumente o teto.`,
        teto_estourado: true,
      }, { status: 402 })
    }
  }

  const admin = criarSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: pedido, error: erroReserva } = await admin.from('ia_pedidos').insert({
    pergunta: `Carteiro gerencial: classificar ${elegiveis.length} e-mail${elegiveis.length === 1 ? '' : 's'}`,
    escopo: 'crm',
    motor: 'servidor',
    estado: 'respondendo',
    modelo,
    custo_usd: reserva,
    criado_por_auth_id: user.id,
    criado_por_nome: quem.nome ?? null,
    contexto: { origem: 'carteiro_gerencial', emails: elegiveis.length, reserva: true },
  }).select('id').single()
  if (erroReserva || !pedido) {
    return NextResponse.json({ erro: 'Não consegui registrar o gasto antes de chamar a IA. Nada foi enviado.' }, { status: 500 })
  }

  const modalidades = [...new Set((mods ?? []).map((m) => String(m.nome)))]
  const sistema = sistemaDoClassificador(modalidades)
  const esquema = esquemaDaSaida(modalidades)
  const client = new Anthropic({ apiKey: chave })

  const uso = { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 }
  const resultados: { e: EmailParaIA; s: SaidaIA }[] = []
  const falhas: string[] = []
  // `as`: a falha é marcada dentro das chamadas em paralelo, e sem ele o
  // TypeScript acha que ela nunca deixa de ser nula.
  let parada = null as Falha | null

  const classificarUm = async (e: EmailParaIA) => {
    if (parada) return
    try {
      const resposta = await client.messages.create({
        model: modelo,
        max_tokens: MAX_TOKENS_SAIDA,
        // Classificar um e-mail não pede raciocínio fundo: esforço baixo é o que o
        // mercado usa para alto volume, e é o que segura o custo por e-mail.
        output_config: { effort: 'low', format: { type: 'json_schema', schema: esquema } },
        inference_geo: 'us',
        system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral', ttl: '1h' } }],
        messages: [{ role: 'user', content: mensagemDoEmail(e) }],
      })
      uso.entrada += resposta.usage.input_tokens ?? 0
      uso.saida += resposta.usage.output_tokens ?? 0
      uso.cacheEscrita += resposta.usage.cache_creation_input_tokens ?? 0
      uso.cacheLeitura += resposta.usage.cache_read_input_tokens ?? 0
      if (resposta.stop_reason === 'refusal') { falhas.push('recusa'); return }
      const texto = resposta.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
      let bruto: unknown = null
      try { bruto = JSON.parse(texto) } catch { falhas.push('resposta sem JSON'); return }
      resultados.push({ e, s: conferirSaida(bruto, e, modalidades) })
    } catch (erro) {
      const f = traduzirErro(erro)
      if (f.parar) parada = f
      else falhas.push(f.erro)
    }
  }

  const fila = elegiveis.map((l) => paraIA(l))
  for (let i = 0; i < fila.length && !parada; i += EM_PARALELO) {
    await Promise.all(fila.slice(i, i + EM_PARALELO).map(classificarUm))
  }

  const custo = custoDoUso(modelo, uso)

  // ── gravar: só o que a sessão leu nesta chamada ────────────────────────────
  let gravados = 0
  if (resultados.length) {
    const custoPorEmail = custo / Math.max(1, resultados.length)
    const agora = new Date().toISOString()
    const { data: gravadas, error: erroGravar } = await admin
      .from('email_classificacao')
      .upsert(resultados.map(({ e, s }) => ({
        email_id: e.id,
        origem: 'ia',
        tipo: s.tipo,
        modalidade: s.modalidade,
        cnpj: s.cnpj,
        tomador: s.tomador,
        confianca: s.confianca,
        motivo: s.justificativa || null,
        recibo: reciboDaIA(s, modelo),
        regua_versao: regua?.versao ?? null,
        modelo,
        custo_usd: Number(custoPorEmail.toFixed(6)),
        classificado_por: `IA (pedido de ${quem.nome ?? 'alguém'})`,
        classificado_por_auth_id: user.id,
        classificado_em: agora,
      })), { onConflict: 'email_id,origem' })
      .select('email_id')
    if (erroGravar) {
      console.error('[email/classificar-ia] gravar:', erroGravar.message)
      falhas.push('não gravou as classificações')
    }
    gravados = gravadas?.length ?? 0
  }

  // ── acertar a reserva para o custo real (sem conteúdo de e-mail) ──────────
  const semCerteza = resultados.filter((r) => r.s.tipo === 'indefinido' || r.s.confianca === 'incerto').length
  const { error: erroAcerto } = await admin.from('ia_pedidos').update({
    estado: parada && !gravados ? 'erro' : 'pronta',
    erro: parada?.erro ?? null,
    resposta: `${gravados} classificados · ${semCerteza} sem certeza`,
    tokens_entrada: uso.entrada,
    tokens_saida: uso.saida,
    cache_escrita: uso.cacheEscrita,
    cache_leitura: uso.cacheLeitura,
    custo_usd: Number(custo.toFixed(6)),
    respondido_em: new Date().toISOString(),
    contexto: { origem: 'carteiro_gerencial', emails: elegiveis.length },
  }).eq('id', pedido.id)
  // Se o acerto falhar, fica a reserva (o custo máximo): conta a mais, nunca a menos.
  if (erroAcerto) console.error('[email/classificar-ia] acerto do custo:', erroAcerto.message)

  if (parada && !gravados) return NextResponse.json({ erro: parada.erro }, { status: parada.status })

  return NextResponse.json({
    ok: true,
    classificados: gravados,
    sem_certeza: semCerteza,
    pulados: ids.length - elegiveis.length,
    falhas: falhas.length,
    parou: parada?.erro ?? null,
    custo_usd: Number(custo.toFixed(4)),
    cache_lido: uso.cacheLeitura,
  })
}
