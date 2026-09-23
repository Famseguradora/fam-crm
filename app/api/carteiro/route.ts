// ============================================================================
//  A PONTE DO CARTEIRO  ·  /api/carteiro
//
//  Quem chama é o Carteiro: um processo Node que roda na máquina de um
//  profissional da FAM, lê o Outlook clássico dele por COM e não tem cookie de
//  login. Por isso a trava é um segredo combinado, e a escrita usa service
//  role, igual ao `/api/analise/evento`.
//
//  UMA CAIXA POR PROFISSIONAL (07/09/2026). Toda chamada diz DE QUAL CAIXA está
//  falando, e o CRM responde a régua daquela caixa. A caixa nasce sozinha na
//  primeira batida, e nasce DESLIGADA: varrer a caixa de alguém sem essa pessoa
//  ter ligado seria varrer a vida particular de um colega.
//
//  O CANO É BURRO DE PROPÓSITO. A máquina só sabe ler e obedecer:
//
//     GET   diz o que fazer   (a régua desta caixa, o que trazer, o que abrir)
//     POST  sincronizar       manda os cabeçalhos, o CRM aplica a régua
//     POST  corpo             entrega o texto de UM e-mail que alguém abriu
//     POST  erro              conta que não conseguiu, e a tela mostra isso
//
//  Assim, mudar uma regra não exige tocar em nada instalado na máquina de
//  ninguém, e o dia em que o Graph entrar nada disto muda.
//
//  NENHUMA IA AQUI. Régua determinística, auditável, sem chave de API. Máquina
//  de profissional da FAM nunca vai precisar de uma.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { avaliarEmail, REGRAS_PADRAO, type RegrasEmail } from '@/lib/email/regras'
import { normalizarMessageId } from '@/lib/email/ler-email'

export const runtime = 'nodejs'

/* O segredo próprio do Carteiro, com o do motor como reserva. O motor está
   sendo descartado e o segredo dele já está configurado nos dois lados; exigir
   uma variável nova só para uma máquina subir seria um passo a mais para dar
   errado numa sexta-feira. Quando o Carteiro estiver em várias máquinas, basta
   pôr CARTEIRO_TOKEN e o de reserva deixa de valer. */
const segredoEsperado = () => process.env.CARTEIRO_TOKEN || process.env.ANALISE_EVENTO_TOKEN || ''

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return null
  return createClient(url, chave, { auth: { persistSession: false } })
}

/* Sem segredo configurado a rota fica FECHADA, e não aberta: o default de uma
   trava ausente tem que ser "não passa". Um deploy que esqueceu a variável não
   pode virar um endpoint público de escrita. */
function porteiro(req: NextRequest) {
  const segredo = segredoEsperado()
  if (!segredo) return NextResponse.json({ erro: 'Rota não configurada (CARTEIRO_TOKEN).' }, { status: 503 })
  if (req.headers.get('x-carteiro-token') !== segredo) {
    return NextResponse.json({ erro: 'Segredo inválido.' }, { status: 401 })
  }
  return null
}

const enderecoLimpo = (s: string) => String(s ?? '').trim().toLowerCase().slice(0, 300)

/**
 * Acha a caixa, ou cria na primeira vez que aquela máquina bate aqui.
 *
 * NASCE DESLIGADA, sempre. E nasce com os valores de fábrica de
 * `email_regras`, que é o que aquela tabela passou a ser: não a régua em uso,
 * mas o ponto de partida de uma caixa nova.
 *
 * O dono é casado por e-mail com `usuarios`. Sem par, a caixa fica sem dono e
 * só quem administra o CRM mexe nela: é melhor do que chutar um dono, porque o
 * dono é quem decide varrer a própria caixa.
 */
async function acharOuCriarConta(sb: SupabaseClient, conta: string, maquina: string) {
  const endereco = enderecoLimpo(conta)
  if (!endereco || !endereco.includes('@')) return { erro: 'Falta dizer de qual caixa de e-mail.' }

  const { data: existe } = await sb.from('email_contas').select('*').eq('conta', endereco).maybeSingle()
  if (existe) {
    /* O "ESTOU VIVO" NÃO PRECISA SER DE 5 EM 5 SEGUNDOS (17/09/2026). O
       Carteiro bate aqui a cada 5 s para perguntar o que fazer, e cada batida
       reescrevia `ultimo_contato`: 54 mil UPDATEs numa tabela de DUAS linhas.
       A tela chama a caixa de parada com 15 minutos sem contato, então um
       minuto de granularidade é de sobra — e a máquina continua respondendo no
       mesmo ritmo, porque o que mudou foi a gravação, não a batida. */
    const agoraISO = new Date().toISOString()
    const velho = !existe.ultimo_contato || Date.now() - new Date(existe.ultimo_contato).getTime() > 60_000
    const maquinaMudou = !!maquina && maquina !== existe.maquina
    if (velho || maquinaMudou) {
      await sb
        .from('email_contas')
        .update({ ultimo_contato: agoraISO, maquina: maquina || existe.maquina })
        .eq('id', existe.id)
    }
    return { conta: existe }
  }

  const { data: dono } = await sb
    .from('usuarios')
    .select('auth_id, nome')
    .ilike('email', endereco)
    .maybeSingle()

  const { data: fabrica } = await sb.from('email_regras').select('*').eq('id', true).maybeSingle()
  const f = { ...REGRAS_PADRAO, ...(fabrica ?? {}) }

  const { data: nova, error } = await sb
    .from('email_contas')
    .insert({
      conta: endereco,
      apelido: dono?.nome ?? endereco.split('@')[0],
      dono_auth_id: dono?.auth_id ?? null,
      dono_nome: dono?.nome ?? null,
      ligado: false,
      pasta: f.pasta,
      so_com_anexo: f.so_com_anexo,
      so_nao_lidos: f.so_nao_lidos,
      so_remetente_interno: f.so_remetente_interno,
      dias_para_tras: f.dias_para_tras,
      max_por_rodada: f.max_por_rodada,
      remetentes: f.remetentes,
      assunto_contem: f.assunto_contem,
      assunto_ignora: f.assunto_ignora,
      maquina: maquina || null,
      ultimo_contato: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error || !nova) return { erro: error?.message ?? 'Não consegui registrar esta caixa.' }
  return { conta: nova }
}

/** A régua daquela caixa, no formato que `avaliarEmail` entende. */
const reguaDa = (c: Record<string, unknown>): RegrasEmail => ({ ...REGRAS_PADRAO, ...c }) as RegrasEmail

// ── GET: a ordem de serviço daquela caixa ───────────────────────────────────
export async function GET(req: NextRequest) {
  const barrado = porteiro(req)
  if (barrado) return barrado
  const sb = admin()
  if (!sb) return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 503 })

  const url = new URL(req.url)
  const achada = await acharOuCriarConta(sb, url.searchParams.get('conta') ?? '', url.searchParams.get('maquina') ?? '')
  if (achada.erro) return NextResponse.json({ erro: achada.erro }, { status: 422 })
  const conta = achada.conta!

  /* O QUE TRAZER. A tela marca 'a_trazer' e a máquina executa. É assim porque o
     CRM não fala com 127.0.0.1 (regra que não muda): o navegador não tem como
     pedir o .msg à máquina, então o pedido fica no banco e a máquina vem pegar.
     Só o que é DESTA caixa: cada máquina só alcança o Outlook dela. */
  const { data: aTrazer } = await sb
    .from('emails_caixa')
    /* O `message_id` VAI JUNTO, e nao e enfeite (17/09/2026): o EntryID do
       Outlook morre quando a mensagem muda de pasta, e o Message-ID nao. Com
       os dois na mao, a maquina reencontra o e-mail arrastado para uma
       subpasta em vez de responder "nao achei" com ele a vista na caixa. A
       `pasta` diz por qual caixa comecar a procurar. */
    .select('id, entry_id, message_id, pasta, assunto')
    .eq('estado', 'a_trazer')
    .eq('conta_id', conta.id)
    .not('entry_id', 'is', null)
    .order('estado_em', { ascending: true })
    .limit(20)

  /* DE QUEM FALTA O TEXTO. Só sobe cabeçalho e prévia (decisão de 07/09/2026:
     o Supabase não vira cópia da caixa de entrada de ninguém). O texto inteiro
     vem quando alguém abre o e-mail na tela, e fica em cache para o segundo
     clique não custar outra viagem. */
  const { data: precisaCorpo } = await sb
    .from('emails_caixa')
    .select('id, entry_id, message_id, pasta')
    .not('corpo_pedido_em', 'is', null)
    .is('corpo_em', null)
    .eq('conta_id', conta.id)
    .not('entry_id', 'is', null)
    .order('corpo_pedido_em', { ascending: true })
    .limit(10)

  return NextResponse.json({
    ok: true,
    conta: { id: conta.id, conta: conta.conta, apelido: conta.apelido, dono: conta.dono_nome, ligado: conta.ligado },
    regras: reguaDa(conta),
    a_trazer: aTrazer ?? [],
    precisa_corpo: precisaCorpo ?? [],
  })
}

// ── POST: o que a máquina traz de volta ─────────────────────────────────────
interface EmailDoCarteiro {
  entry_id?: string
  message_id?: string
  assunto?: string
  de?: string
  email_de?: string
  para?: string
  copia?: string
  recebido?: string
  nao_lido?: boolean
  anexos?: { nome?: string; kb?: number; tipo?: number }[]
  anexos_uteis?: number
  tamanho_kb?: number
  corpo?: string
}

const dataOuNulo = (t: string | undefined) => {
  if (!t) return null
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export async function POST(req: NextRequest) {
  const barrado = porteiro(req)
  if (barrado) return barrado
  const sb = admin()
  if (!sb) return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 503 })

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }
  const acao = String(corpo.acao ?? '')

  // ── sincronizar: os cabeçalhos de UMA caixa ───────────────────────────────
  if (acao === 'sincronizar') {
    const achada = await acharOuCriarConta(sb, String(corpo.conta ?? ''), String(corpo.maquina ?? ''))
    if (achada.erro) return NextResponse.json({ erro: achada.erro }, { status: 422 })
    const conta = achada.conta!

    /* CAIXA DESLIGADA NÃO ENTRA, e a recusa é aqui e não só na máquina. A trava
       tem que estar do lado do servidor: um Carteiro velho, ou uma máquina com
       o relógio da régua atrasado, mandaria a caixa inteira de alguém que nunca
       ligou nada. Quem decide varrer a própria caixa é o dono dela. */
    if (!conta.ligado) {
      return NextResponse.json(
        { erro: `A caixa ${conta.conta} está desligada. Quem liga é o dono dela, na tela do Comercial.`, desligada: true },
        { status: 409 },
      )
    }

    const entrada = Array.isArray(corpo.emails) ? (corpo.emails as EmailDoCarteiro[]) : []
    if (entrada.length > 400) {
      return NextResponse.json({ erro: 'Mais de 400 e-mails numa rodada.' }, { status: 413 })
    }
    const regras = reguaDa(conta)
    const agora = new Date().toISOString()

    const limpos = entrada
      .filter((e) => e.entry_id || e.message_id)
      .map((e) => {
        const cab = {
          assunto: String(e.assunto ?? '').slice(0, 500) || '(sem assunto)',
          de: String(e.de ?? '').slice(0, 300) || null,
          email_de: String(e.email_de ?? '').slice(0, 300) || null,
          nao_lido: !!e.nao_lido,
          anexos_uteis: Number(e.anexos_uteis ?? 0) || 0,
        }
        const v = avaliarEmail(cab, regras)
        return {
          conta_id: conta.id,
          entry_id: e.entry_id ? String(e.entry_id).slice(0, 500) : null,
          message_id: e.message_id ? normalizarMessageId(String(e.message_id)) || null : null,
          conta: conta.conta,
          pasta: String(corpo.pasta ?? '') || null,
          ...cab,
          para: String(e.para ?? '').slice(0, 500) || null,
          copia: String(e.copia ?? '').slice(0, 500) || null,
          recebido_em: dataOuNulo(e.recebido),
          tamanho_kb: Number(e.tamanho_kb ?? 0) || null,
          // A PRÉVIA, não o corpo. O suficiente para a lista dizer do que se trata.
          previa: String(e.corpo ?? '').replace(/\s+/g, ' ').trim().slice(0, 400) || null,
          anexos: (e.anexos ?? []).slice(0, 60).map((a) => ({
            nome: String(a?.nome ?? '').slice(0, 300),
            kb: Number(a?.kb ?? 0) || 0,
            tipo: Number(a?.tipo ?? 0) || 0,
          })),
          serve: v.serve,
          motivo: v.motivo,
          visto_em: agora,
        }
      })

    if (!limpos.length) {
      await sb.from('email_contas').update({ ultima_varredura: agora, ultimo_erro: null }).eq('id', conta.id)
      return NextResponse.json({ ok: true, novos: 0, atualizados: 0, total: 0 })
    }

    /* O QUE JÁ EXISTE, pelas DUAS identidades. O mesmo e-mail pode já estar aqui
       por outro cano (alguém subiu o .msg à mão antes de a máquina varrer), e
       nesse caso ele ganha o entry_id em vez de virar uma segunda linha. */
    const entryIds = limpos.map((x) => x.entry_id).filter(Boolean) as string[]
    const msgIds = limpos.map((x) => x.message_id).filter(Boolean) as string[]
    type JaEsta = Record<string, unknown> & { id: string; entry_id: string | null; message_id: string | null }
    const existentes = new Map<string, JaEsta>()
    for (const [coluna, valores] of [['entry_id', entryIds], ['message_id', msgIds]] as const) {
      if (!valores.length) continue
      /* Os campos comparáveis vêm JUNTO, e não só a identidade. É o que permite
         gravar apenas o que mudou: numa caixa de 200 e-mails, a segunda rodada
         em diante quase não muda nada, e sem esta lista o servidor mandava 200
         UPDATEs por minuto ao banco para reescrever o mesmo conteúdo. */
      const { data } = await sb
        .from('emails_caixa')
        .select('id, entry_id, message_id, conta_id, conta, pasta, assunto, de, email_de, para, copia, recebido_em, nao_lido, anexos, anexos_uteis, tamanho_kb, previa, serve, motivo')
        .in(coluna, valores)
      for (const r of (data ?? []) as JaEsta[]) {
        if (r.entry_id) existentes.set('e:' + r.entry_id, r)
        if (r.message_id) existentes.set('m:' + r.message_id, r)
      }
    }
    const achar = (x: { entry_id: string | null; message_id: string | null }) =>
      (x.entry_id ? existentes.get('e:' + x.entry_id) : undefined) ??
      (x.message_id ? existentes.get('m:' + x.message_id) : undefined)

    const novos = limpos.filter((x) => !achar(x))
    const jaTem = limpos.filter((x) => achar(x))

    /* O MESMO E-MAIL DUAS VEZES DENTRO DA MESMA RODADA. Acontece de verdade:
       regra do Outlook que copia a mensagem para uma subpasta, ou o mesmo fio
       aparecendo na Caixa e em Itens Enviados. As duas cópias têm EntryID
       diferente e o MESMO Message-ID, e o índice único derrubaria o INSERT
       inteiro: uma cópia repetida faria a caixa parar de sincronizar. */
    const vistosNoLote = new Set<string>()
    const novosUnicos = novos.filter((x) => {
      if (!x.message_id) return true
      if (vistosNoLote.has(x.message_id)) return false
      vistosNoLote.add(x.message_id)
      return true
    })

    let inseridos = 0
    if (novosUnicos.length) {
      const { data, error } = await sb.from('emails_caixa').insert(novosUnicos).select('id')
      // Escrita que volta sem linha é escrita que não aconteceu, com ou sem erro.
      if (error) {
        await sb.from('email_contas').update({ ultimo_erro: error.message.slice(0, 300) }).eq('id', conta.id)
        return NextResponse.json({ erro: error.message }, { status: 500 })
      }
      inseridos = data?.length ?? 0
      if (inseridos !== novosUnicos.length) {
        return NextResponse.json(
          { erro: `Gravou ${inseridos} de ${novosUnicos.length} e-mails novos.` },
          { status: 500 },
        )
      }
    }

    /* NA ATUALIZAÇÃO, O ESTADO NÃO SE TOCA. Só entram os campos que mudam
       sozinhos na caixa de e-mail (lido, anexos) e a régua reavaliada. Mexer em
       `estado` aqui desfaria o "tratado" que alguém marcou, e o e-mail
       reapareceria em "Para análise" na varredura seguinte. */
    let atualizados = 0
    const inalterados: string[] = []
    for (const x of jaTem) {
      const alvo = achar(x)!
      const novo = {
        conta_id: x.conta_id,
        entry_id: x.entry_id ?? alvo.entry_id,
        message_id: x.message_id ?? alvo.message_id,
        conta: x.conta, pasta: x.pasta,
        assunto: x.assunto, de: x.de, email_de: x.email_de,
        para: x.para, copia: x.copia, recebido_em: x.recebido_em,
        nao_lido: x.nao_lido, anexos: x.anexos, anexos_uteis: x.anexos_uteis,
        tamanho_kb: x.tamanho_kb, previa: x.previa,
        serve: x.serve, motivo: x.motivo,
      }
      /* SÓ ESCREVE O QUE MUDOU. `visto_em` fica de fora de propósito: ele muda
         sempre, e se entrasse aqui toda linha seria "diferente" e a economia
         inteira sumiria.

         DUAS COMPARAÇÕES SÃO ESPECIAIS, e as duas foram medidas em 08/09/2026
         numa varredura de verdade, não deduzidas:

           anexos       o Postgres guarda jsonb e DEVOLVE AS CHAVES EM OUTRA
                        ORDEM ({kb,nome,tipo} no lugar de {nome,kb,tipo}), então
                        comparar o texto do JSON dava "mudou" em todo e-mail com
                        anexo. Aqui vira uma linha canônica, campo a campo.
           recebido_em  vai como texto ISO e volta como texto do Postgres, com
                        outro formato do mesmo instante. */
      const anexosEmLinha = (v: unknown) =>
        (Array.isArray(v) ? v : [])
          .map((a) => {
            const x = (a ?? {}) as { nome?: unknown; kb?: unknown; tipo?: unknown }
            return `${String(x.nome ?? '')}|${Number(x.kb ?? 0)}|${Number(x.tipo ?? 0)}`
          })
          .join('§')

      const igual = Object.entries(novo).every(([k, v]) => {
        const antes = (alvo as Record<string, unknown>)[k]
        if (k === 'anexos') return anexosEmLinha(antes) === anexosEmLinha(v)
        if (k === 'recebido_em') {
          const a = antes ? new Date(String(antes)).getTime() : 0
          const b = v ? new Date(String(v)).getTime() : 0
          return a === b
        }
        return JSON.stringify(antes ?? null) === JSON.stringify(v ?? null)
      })
      if (igual) { inalterados.push(alvo.id); continue }

      const { data, error } = await sb
        .from('emails_caixa')
        .update({ ...novo, visto_em: x.visto_em })
        .eq('id', alvo.id)
        .select('id')
      if (!error && data?.length) atualizados++
    }

    /* "Ainda está na caixa" de quem não mudou nada, numa chamada só. Sem isto o
       `visto_em` de uma caixa de 200 e-mails custaria 200 viagens ao banco por
       rodada, e ele é justamente o campo que não precisa de nenhuma. */
    for (let i = 0; i < inalterados.length; i += 100) {
      await sb.from('emails_caixa').update({ visto_em: agora }).in('id', inalterados.slice(i, i + 100))
    }

    /* ── QUEM SAIU DA CAIXA DE ENTRADA (17/09/2026) ────────────────────────
       Ordem dele: "eu retiro alguns e-mails para outras caixas... tem que ser
       somente o que está na caixa de entrada".

       O Carteiro sempre leu só a Caixa de Entrada. O que faltava era a volta:
       mover a mensagem no Outlook não dizia nada ao CRM, e a caixa daqui ia
       ficando diferente da caixa de verdade.

       SÓ VALE NA VARREDURA COMPLETA, e a diferença é toda: a olhada rápida
       traz 25 e-mails de um dia, e tomá-la por completa marcaria a caixa
       inteira como "saiu" a cada 30 segundos. Por isso o Carteiro precisa
       dizer `completa: true` e de onde começou a janela (`janela_desde`); sem
       os dois, nada é marcado. Se a mensagem voltar para a caixa, a varredura
       seguinte zera o campo — por isso `saiu_em: null` sobe junto com quem
       apareceu no lote.

       NÃO APAGA NADA: o caso aberto, os documentos e a trilha continuam. */
    let sairam = 0
    let voltaram = 0
    // Quantos sumiram quando o teto barrou a rodada. A tela e o log precisam
    // saber a diferença entre "ninguém saiu" e "saiu gente demais para ser normal".
    let suspeita = 0
    const janelaDesde = dataOuNulo(String(corpo.janela_desde ?? ''))
    if (corpo.completa === true && janelaDesde) {
      const vistosAgora = new Set<string>()
      for (const x of limpos) {
        if (x.entry_id) vistosAgora.add('e:' + x.entry_id)
        if (x.message_id) vistosAgora.add('m:' + x.message_id)
      }

      const { data: naCaixa } = await sb
        .from('emails_caixa')
        .select('id, entry_id, message_id, saiu_em')
        .eq('conta_id', conta.id)
        .gte('recebido_em', janelaDesde)
        .limit(2000)

      const sumiram: string[] = []
      const reapareceram: string[] = []
      /* A TRAVA DE SANIDADE (17/09/2026). No mesmo dia em que isto nasceu, foi
         descoberto que a varredura de 7 dias voltava VAZIA por causa de um
         filtro de data ambíguo no Outlook (ver scripts/outlook.ps1). Com uma
         lista errada, "quem não veio saiu" apagaria a caixa inteira da tela de
         uma vez, calado.

         Duas defesas, e as duas são baratas:
           · lote vazio nunca marca nada (o `if (!limpos.length)` acima já
             devolve antes de chegar aqui);
           · mais de 100 sumindo numa rodada é sintoma, não rotina: o servidor
             recusa, devolve `saida_suspeita` e o Carteiro registra no log.
         Uma limpeza grande de verdade (a primeira, depois de meses movendo
         e-mail) passa em rodadas sucessivas de 100, ou com `forcar_saida`. */
      const TETO_POR_RODADA = 100
      for (const r of (naCaixa ?? []) as { id: string; entry_id: string | null; message_id: string | null; saiu_em: string | null }[]) {
        const veio =
          (r.entry_id && vistosAgora.has('e:' + r.entry_id)) ||
          (r.message_id && vistosAgora.has('m:' + r.message_id))
        if (veio && r.saiu_em) reapareceram.push(r.id)
        if (!veio && !r.saiu_em) sumiram.push(r.id)
      }

      const demais = sumiram.length > TETO_POR_RODADA && corpo.forcar_saida !== true
      const marcar = demais ? sumiram.slice(0, TETO_POR_RODADA) : sumiram
      for (let i = 0; i < marcar.length; i += 100) {
        const { data } = await sb
          .from('emails_caixa').update({ saiu_em: agora }).in('id', marcar.slice(i, i + 100)).select('id')
        sairam += data?.length ?? 0
      }
      if (demais) suspeita = sumiram.length
      for (let i = 0; i < reapareceram.length; i += 100) {
        const { data } = await sb
          .from('emails_caixa').update({ saiu_em: null }).in('id', reapareceram.slice(i, i + 100)).select('id')
        voltaram += data?.length ?? 0
      }
    }

    await sb.from('email_contas').update({ ultima_varredura: agora, ultimo_erro: null }).eq('id', conta.id)
    return NextResponse.json({
      ok: true, novos: inseridos, atualizados, iguais: inalterados.length, total: limpos.length,
      sairam, voltaram, saida_suspeita: suspeita,
    })
  }

  // ── corpo: o texto de UM, porque alguém abriu na tela ─────────────────────
  if (acao === 'corpo') {
    const id = String(corpo.id ?? '')
    const entryId = String(corpo.entry_id ?? '')
    if (!id && !entryId) return NextResponse.json({ erro: 'Falta dizer qual e-mail.' }, { status: 422 })

    const q = sb
      .from('emails_caixa')
      .update({
        corpo: String(corpo.texto ?? '').slice(0, 200_000) || null,
        corpo_em: new Date().toISOString(),
      })
    const { data, error } = id ? await q.eq('id', id).select('id') : await q.eq('entry_id', entryId).select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ erro: 'E-mail não está na caixa.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  /* ── inventario: a caixa INTEIRA, para o que saiu sair da tela ─────────────
     ═══════════════════════════════════════════════════════════════════════
     Pergunta dele em 17/09/2026: "eu nao entendo, porque ainda aparece e-mails
     que eu já tirei da caixa de entrada?" Medido na hora: 84 e-mails já fora
     da Caixa de Entrada continuavam na tela, e NENHUM era dos últimos 7 dias.

     Essa era a explicação inteira. A saída pela varredura (`sincronizar`) só
     conclui "saiu" sobre o que está DENTRO da janela da régua, que é de 7
     dias. E-mail de 3 de setembro, tirado da caixa em 10 de setembro, não era
     reavaliado por ninguém nunca mais: ficava na tela para sempre.

     O inventário responde sobre a caixa toda, sem janela. E é barato: só os
     dois identificadores de cada mensagem, 619 itens em 1,3 s pela tabela
     MAPI.

     NADA É APAGADO, E NENHUM KPI SE PERDE. Ordem dele no mesmo minuto: "não
     quero perder os KPIs". `saiu_em` é uma marca de onde a mensagem está
     hoje, não uma exclusão: a linha continua inteira no banco, com estado,
     caso, classificação e datas. O relatório gerencial e os números do painel
     leem `painel_pedidos` sem olhar `saiu_em` — quem olha são as LISTAS, que
     é justamente a poluição que ele quer fora.

     As travas, porque aqui se apaga e-mail da tela em lote:
       · inventário vazio ou cortado no teto não marca nada (lista incompleta
         marcaria a caixa inteira como saída, calada);
       · linha sem `message_id` nunca é marcada: o EntryID que a tabela MAPI
         devolve tem outro formato, então quem não tem Message-ID não tem como
         ser encontrado na lista, e ausência de prova não é prova de ausência;
       · teto de 100 por rodada, com o resto indo nas rodadas seguintes. */
  if (acao === 'inventario') {
    const achada = await acharOuCriarConta(sb, String(corpo.conta ?? ''), String(corpo.maquina ?? ''))
    if (achada.erro) return NextResponse.json({ erro: achada.erro }, { status: 422 })
    const conta = achada.conta!
    if (!conta.ligado) {
      return NextResponse.json({ erro: `A caixa ${conta.conta} está desligada.`, desligada: true }, { status: 409 })
    }
    const marcadoEm = new Date().toISOString()
    const itens = Array.isArray(corpo.itens) ? (corpo.itens as { eid?: string; mid?: string }[]) : []
    if (!itens.length) return NextResponse.json({ erro: 'Inventário vazio: não marquei nada.' }, { status: 422 })
    if (corpo.cortado === true) return NextResponse.json({ erro: 'Inventário cortado no teto: não marquei nada.' }, { status: 422 })

    const naCaixaAgora = new Set<string>()
    for (const x of itens) if (x.mid) naCaixaAgora.add(String(x.mid).replace(/^<|>$/g, ''))
    if (!naCaixaAgora.size) {
      return NextResponse.json({ erro: 'Inventário sem Message-ID: não marquei nada.' }, { status: 422 })
    }

    const { data: guardados, error: erroLer } = await sb
      .from('emails_caixa')
      .select('id, message_id, saiu_em')
      .eq('conta_id', conta.id)
      .not('message_id', 'is', null)
      .limit(5000)
    if (erroLer) return NextResponse.json({ erro: erroLer.message }, { status: 500 })

    const sumiram: string[] = []
    const voltaram: string[] = []
    for (const r of (guardados ?? []) as { id: string; message_id: string; saiu_em: string | null }[]) {
      const esta = naCaixaAgora.has(r.message_id.replace(/^<|>$/g, ''))
      if (!esta && !r.saiu_em) sumiram.push(r.id)
      if (esta && r.saiu_em) voltaram.push(r.id)
    }

    const TETO = 100
    const marcar = sumiram.slice(0, TETO)
    let sairam = 0
    let devolvidos = 0
    for (let i = 0; i < marcar.length; i += 100) {
      const { data } = await sb
        .from('emails_caixa').update({ saiu_em: marcadoEm }).in('id', marcar.slice(i, i + 100)).select('id')
      sairam += data?.length ?? 0
    }
    for (let i = 0; i < voltaram.length; i += 100) {
      const { data } = await sb
        .from('emails_caixa').update({ saiu_em: null }).in('id', voltaram.slice(i, i + 100)).select('id')
      devolvidos += data?.length ?? 0
    }
    return NextResponse.json({
      ok: true, na_caixa: naCaixaAgora.size, conferidos: guardados?.length ?? 0,
      sairam, voltaram: devolvidos, faltam: Math.max(0, sumiram.length - marcar.length),
    })
  }

  /* ── endereco: o e-mail mudou de pasta, e o CRM aprende o lugar novo ───────
     A maquina achou a mensagem pelo Message-ID depois do EntryID falhar. Sem
     gravar aqui, toda leitura seguinte pagaria a varredura de novo (20 s na
     maquina dele) e o CRM continuaria guardando um endereco morto.

     So mexe em `entry_id` e `pasta`: estado, caso e classificacao continuam
     onde estavam. Mudar de pasta nao e decisao sobre o pedido. */
  if (acao === 'endereco') {
    const id = String(corpo.id ?? '')
    const entryId = String(corpo.entry_id ?? '')
    if (!id || !entryId) return NextResponse.json({ erro: 'Falta o e-mail ou o endereço novo.' }, { status: 422 })
    const mudanca: Record<string, string> = { entry_id: entryId.slice(0, 500) }
    if (corpo.pasta) mudanca.pasta = String(corpo.pasta).slice(0, 500)
    const { data, error } = await sb.from('emails_caixa').update(mudanca).eq('id', id).select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ erro: 'E-mail não está na caixa.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  // ── erro: a máquina não conseguiu, e a tela precisa dizer isso ─────────────
  if (acao === 'erro') {
    const id = String(corpo.id ?? '')
    if (!id) return NextResponse.json({ erro: 'Falta dizer qual e-mail.' }, { status: 422 })
    const { data, error } = await sb
      .from('emails_caixa')
      .update({
        estado: 'erro',
        estado_em: new Date().toISOString(),
        estado_erro: String(corpo.erro ?? '').slice(0, 500) || 'Falhou sem dizer o motivo.',
      })
      .eq('id', id)
      .select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ erro: 'E-mail não está na caixa.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ erro: 'Ação desconhecida (sincronizar, inventario, corpo, endereco, erro).' }, { status: 422 })
}
