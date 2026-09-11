// ============================================================================
//  POST /api/ia/perguntar  ·  a IA Gestor responde, de qualquer tela do CRM
//
//  Esta é a porta do motor 'servidor'. O motor 'notebook' continua existindo e
//  continua sendo o padrão enquanto a API estiver desligada: quem decide é a
//  linha única de `ia_config`, e não uma variável de ambiente, porque desligar
//  tem que ser um clique.
//
//  A ORDEM DAS TRAVAS, e cada uma existe por um motivo diferente:
//
//    1. sessão        sem login não há IA, e é a sessão que carrega a RLS
//    2. api_ligada    o interruptor dele
//    3. chave         API ligada sem chave no ambiente é promessa vazia
//    4. teto do dia   um laço mal feito não pode virar conta de centenas de
//                     dólares enquanto ninguém olha
//
//  GOVERNANÇA: o cliente Supabase que desce para a IA é o DA SESSÃO. Não existe
//  neste arquivo nenhum caminho para a service role, e é de propósito: a IA lê
//  exatamente o que a pessoa leria abrindo a tela na mão.
//
//  O HISTÓRICO É LIDO DO BANCO, e não do que o navegador mandou (09/09/2026).
//  Parece detalhe e não é: se o fio viesse da tela, qualquer um poderia
//  inventar uma conversa anterior ("você já me autorizou a ver o Financeiro")
//  e a IA a trataria como memória verdadeira. Vindo do banco, o passado é o
//  que foi realmente dito, por aquela pessoa, naquela conversa.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { perguntarAoServidor } from '@/lib/ia/servidor'
import { novoIdConversa, tituloDe } from '@/lib/ia/gestao'
import { fecharPedido, QUEDA_NO_MEIO, semApi, travasDaIA } from '@/lib/ia/travas'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  // Uma página de outro site não pode gastar a IA em nome de quem está logado.
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const corpo = await req.json().catch(() => ({}))
  const pergunta = String(corpo.pergunta ?? '').trim()
  if (!pergunta) return NextResponse.json({ erro: 'Pergunta vazia.' }, { status: 422 })
  if (pergunta.length > 4000) {
    return NextResponse.json({ erro: 'Pergunta muito longa (o limite é 4000 caracteres).' }, { status: 422 })
  }

  /* ── 2, 3 e 4. interruptor, chave e teto do dia ─────────────────────────
     As mesmas travas de toda IA do CRM (lib/ia/travas.ts). O teto é o da
     empresa inteira, somado pelo banco. 409 e não 500 quando desligada: não é
     falha, é escolha, e a tela usa o `desligada` para voltar ao robô. */
  const cfg = await travasDaIA(supabase)
  if (!cfg.ok) return NextResponse.json(semApi(cfg), { status: cfg.status })

  const { data: quem } = await supabase
    .from('usuarios')
    .select('nome, perfil')
    .eq('auth_id', user.id)
    .maybeSingle()

  const contexto = {
    nome: quem?.nome ?? user.email ?? 'alguém da FAM',
    perfil: quem?.perfil ?? 'usuario',
    tela: String(corpo.tela ?? 'CRM'),
    tomador: corpo.tomador ?? null,
  }

  /* ── A CONVERSA ──────────────────────────────────────────────────────────
     Veio um id? Continua nela. Não veio? Nasce uma, batizada pela própria
     pergunta. Nenhum dos dois caminhos falha a resposta: se o banco recusar a
     conversa (migration não aplicada, por exemplo), a IA responde assim mesmo
     e a resposta é que não fica guardada. Perder o histórico é ruim; perder a
     resposta que a pessoa esperou meio minuto é pior. */
  let conversaId: string | null = corpo.conversa_id ? String(corpo.conversa_id) : null
  let conversaNova = false

  if (conversaId) {
    const { data: existe } = await supabase
      .from('ia_conversas').select('id').eq('id', conversaId).maybeSingle()
    if (!existe) conversaId = null
  }

  if (!conversaId) {
    const id = novoIdConversa()
    const { data: criada } = await supabase
      .from('ia_conversas')
      .insert({
        id,
        titulo: tituloDe(pergunta),
        escopo: 'crm',
        origem: 'crm',
        tela: contexto.tela,
        criado_por_nome: contexto.nome,
        criado_por_auth_id: user.id,
      })
      .select('id')
      .maybeSingle()
    conversaId = criada?.id ?? null
    conversaNova = !!conversaId
  }

  /* O FIO VEM DO BANCO. As últimas 10 falas daquela conversa, na ordem em que
     aconteceram. O que o navegador mandou em `historico` é ignorado: ele não
     é fonte de verdade sobre o que já foi dito. */
  let historico: { quem: 'pessoa' | 'ia'; texto: string }[] = []
  if (conversaId && !conversaNova) {
    const { data: fio } = await supabase
      .from('ia_mensagens')
      .select('quem, texto, em')
      .eq('conversa_id', conversaId)
      .order('em', { ascending: false })
      .limit(10)
    historico = (fio ?? [])
      .reverse()
      .map((m) => ({ quem: m.quem === 'ia' ? 'ia' as const : 'pessoa' as const, texto: m.texto }))
  }

  /* O PEDIDO NASCE ANTES DA CHAMADA. Se a API travar ou o servidor cair no
     meio, fica o registro de que alguém perguntou e não foi respondido, em vez
     de a pergunta sumir sem rastro. */
  const { data: pedido } = await supabase
    .from('ia_pedidos')
    .insert({
      pergunta,
      escopo: 'crm',
      motor: 'servidor',
      estado: 'respondendo',
      modelo: cfg.modelo,
      contexto,
      conversa_id: conversaId,
      criado_por_auth_id: user.id,
      criado_por_nome: contexto.nome,
      pegue_em: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()

  /* Uma exceção no meio (a ferramenta que lê o banco, a rede) não pode deixar a
     pergunta em "respondendo" para sempre: vira erro, e o pedido fecha. */
  let r: Awaited<ReturnType<typeof perguntarAoServidor>>
  try {
    r = await perguntarAoServidor({
      pergunta,
      historico,
      contexto,
      modelo: String(cfg.modelo),
      esforco: String(cfg.esforco),
      sb: supabase,
    })
  } catch (e) {
    console.error('[ia/perguntar]', e instanceof Error ? e.message : e)
    r = { ok: false, erro: QUEDA_NO_MEIO, status: 502 }
  }

  if (!r.ok) {
    if (pedido) await fecharPedido(supabase, pedido.id, { estado: 'erro', erro: r.erro, respondido_em: new Date().toISOString() })
    return NextResponse.json({ erro: r.erro }, { status: r.status })
  }

  if (pedido) {
    await fecharPedido(supabase, pedido.id, {
      estado: 'pronta',
      resposta: r.texto,
      tokens_entrada: r.uso.entrada,
      tokens_saida: r.uso.saida,
      cache_escrita: r.uso.cache_escrita,
      cache_leitura: r.uso.cache_leitura,
      custo_usd: r.uso.custo_usd,
      ferramentas: r.uso.ferramentas,
      respondido_em: new Date().toISOString(),
    })

    if (r.blocos.length) {
      await supabase.from('ia_blocos').insert(
        r.blocos.map((b, i) => ({
          pedido_id: pedido.id,
          ordem: i,
          tipo: b.tipo,
          titulo: b.titulo,
          formato: b.formato ?? null,
          dados: b.dados,
          origem: b.origem ?? null,
        })),
      )
    }
  }

  /* ── O FIO GUARDADO ──────────────────────────────────────────────────────
     As duas falas entram juntas, e a resposta aponta para o pedido: é assim
     que reabrir a conversa amanhã traz de volta o gráfico, e não só o texto
     que falava dele.

     O ID DA MENSAGEM É TEXTO E TEM QUE SER ÚNICO. O formato imita o do
     notebook ("motor:<conversa>:<índice>") para as duas origens conviverem na
     mesma tabela sem colidir. */
  if (conversaId && pedido) {
    const agora = Date.now()
    await supabase.from('ia_mensagens').insert([
      {
        id: `crm:${conversaId}:${agora}:p`,
        conversa_id: conversaId,
        quem: 'pessoa',
        texto: pergunta,
        em: new Date(agora).toISOString(),
        autor_nome: contexto.nome,
        origem: 'crm',
      },
      {
        id: `crm:${conversaId}:${agora}:i`,
        conversa_id: conversaId,
        quem: 'ia',
        texto: r.texto,
        em: new Date(agora + 1).toISOString(),
        origem: 'crm',
        pedido_id: pedido.id,
      },
    ])

    /* `trocas` é lido de volta e somado aqui, e não por um `+1` cego: duas
       abas perguntando na mesma conversa fariam a conta errar, e o número é
       o que a lista mostra. */
    const { data: c } = await supabase
      .from('ia_conversas').select('trocas').eq('id', conversaId).maybeSingle()
    await supabase
      .from('ia_conversas')
      .update({ ultima: new Date().toISOString(), trocas: Number(c?.trocas ?? 0) + 1 })
      .eq('id', conversaId)
  }

  return NextResponse.json({
    ok: true,
    pedido_id: pedido?.id ?? null,
    conversa_id: conversaId,
    conversa_nova: conversaNova,
    texto: r.texto,
    blocos: r.blocos,
    uso: r.uso,
  })
}
