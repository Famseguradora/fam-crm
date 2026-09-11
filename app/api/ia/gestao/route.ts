// ============================================================================
//  POST /api/ia/gestao  ·  a IA de Gestão (o acervo inteiro) pela API
//
//  Ordem do Marco em 11/09/2026: toda IA do CRM tem que funcionar nos notebooks
//  da equipe quando a API está ligada. A IA de Gestão (o botão "✦ IA de Gestão"
//  de Análises) só respondia pelo claude.exe do notebook dele: de qualquer
//  outro computador, a pergunta ficava "na fila do notebook" para sempre.
//
//  AGORA: com a API ligada e a chave no ambiente, responde aqui, pela mesma
//  função da IA Gestor (lib/ia/servidor.ts: Sonnet 5, inferência nos EUA,
//  prefixo cacheado, custo em `ia_pedidos`). Sem API, a rota responde
//  `motor: 'notebook'` e a tela manda a pergunta para a fila, como sempre foi.
//
//  A CONVERSA É A MESMA do notebook: as falas vão para `ia_mensagens`, e é de
//  lá que a tela lê. A memória da API são as últimas 10 falas daquele assunto,
//  lidas do banco (nunca do que o navegador mandou).
//
//  GOVERNANÇA: o cliente que desce para a IA é o DA SESSÃO. A IA lê o que a
//  pessoa leria abrindo a tela.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { perguntarAoServidor } from '@/lib/ia/servidor'
import { novoIdConversa, tituloDe } from '@/lib/ia/gestao'
import { fecharPedido, QUEDA_NO_MEIO, semApi, travasDaIA } from '@/lib/ia/travas'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'

export const runtime = 'nodejs'
export const maxDuration = 120

const TELA = 'Análises de Crédito, no painel "IA de Gestão": perguntas sobre o ACERVO INTEIRO de análises de crédito (tabelas analises e analise_exercicios), comparando empresas, grupos, corretoras, decisões e limites'
const ID_CONVERSA = /^c[0-9a-z]{6,24}$/

export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  const { data: quem } = await supabase.from('usuarios').select('nome, perfil').eq('auth_id', user.id).maybeSingle()
  if (!quem || quem.perfil === 'leitura') {
    return NextResponse.json({ erro: 'Perguntar é de quem escreve no CRM.' }, { status: 403 })
  }

  const corpo = await req.json().catch(() => ({})) as Record<string, unknown>
  const pergunta = String(corpo.pergunta ?? '').trim()
  if (!pergunta) return NextResponse.json({ erro: 'Pergunta vazia.' }, { status: 422 })
  if (pergunta.length > 4000) return NextResponse.json({ erro: 'Pergunta muito longa (o limite é 4000 caracteres).' }, { status: 422 })

  const t = await travasDaIA(supabase)
  if (!t.ok) return NextResponse.json(semApi(t), { status: t.status })

  const nome = quem.nome ?? user.email ?? 'alguém da FAM'

  // ── o assunto: o que veio, se existe; senão nasce um ──────────────────────
  let conversaId = typeof corpo.conversa_id === 'string' && ID_CONVERSA.test(corpo.conversa_id) ? corpo.conversa_id : null
  let conversa: { id: string; titulo: string; trocas: number } | null = null
  if (conversaId) {
    const { data } = await supabase.from('ia_conversas').select('id, titulo, trocas').eq('id', conversaId).eq('escopo', 'gestao').maybeSingle()
    conversa = data
    if (!conversa) conversaId = null
  }
  if (!conversaId) {
    const id = novoIdConversa()
    const { error } = await supabase.from('ia_conversas').insert({
      id, titulo: tituloDe(pergunta), escopo: 'gestao', origem: 'crm', criado_por_nome: nome, criado_por_auth_id: user.id,
    })
    if (error) return NextResponse.json({ erro: 'Não consegui abrir o assunto.' }, { status: 500 })
    conversaId = id
  }

  let historico: { quem: 'pessoa' | 'ia'; texto: string }[] = []
  if (conversa) {
    const { data: fio } = await supabase.from('ia_mensagens').select('quem, texto, em')
      .eq('conversa_id', conversaId).order('em', { ascending: false }).limit(10)
    historico = (fio ?? []).reverse().map((m) => ({ quem: m.quem === 'ia' ? 'ia' as const : 'pessoa' as const, texto: m.texto }))
  }

  /* O pedido nasce antes da chamada: se a API travar, fica o rastro de que
     alguém perguntou. `motor: 'servidor'` é o que impede o agente do notebook
     de pegar a mesma pergunta. */
  const { data: pedido, error: erroPedido } = await supabase.from('ia_pedidos').insert({
    pergunta, escopo: 'gestao', motor: 'servidor', estado: 'respondendo', modelo: t.modelo,
    conversa_id: conversaId, criado_por_auth_id: user.id, criado_por_nome: nome, pegue_em: new Date().toISOString(),
  }).select('id').single()
  if (erroPedido || !pedido) return NextResponse.json({ erro: 'Não consegui registrar a pergunta. Nada foi enviado à IA.' }, { status: 500 })

  let r: Awaited<ReturnType<typeof perguntarAoServidor>>
  try {
    r = await perguntarAoServidor({
      pergunta, historico, modelo: t.modelo, esforco: t.esforco, sb: supabase,
      contexto: { nome, perfil: quem.perfil ?? 'usuario', tela: TELA, tomador: null },
    })
  } catch (e) {
    console.error('[ia/gestao]', e instanceof Error ? e.message : e)
    r = { ok: false, erro: QUEDA_NO_MEIO, status: 502 }
  }

  if (!r.ok) {
    await fecharPedido(supabase, pedido.id, { estado: 'erro', erro: r.erro, respondido_em: new Date().toISOString() })
    return NextResponse.json({ erro: r.erro, conversa_id: conversaId }, { status: r.status })
  }

  await fecharPedido(supabase, pedido.id, {
    estado: 'pronta', resposta: r.texto,
    tokens_entrada: r.uso.entrada, tokens_saida: r.uso.saida, cache_escrita: r.uso.cache_escrita, cache_leitura: r.uso.cache_leitura,
    custo_usd: r.uso.custo_usd, ferramentas: r.uso.ferramentas, respondido_em: new Date().toISOString(),
  })
  if (r.blocos.length) {
    await supabase.from('ia_blocos').insert(r.blocos.map((b, i) => ({
      pedido_id: pedido.id, ordem: i, tipo: b.tipo, titulo: b.titulo, formato: b.formato ?? null, dados: b.dados, origem: b.origem ?? null,
    })))
  }

  const agora = Date.now()
  await supabase.from('ia_mensagens').insert([
    { id: `crm:${conversaId}:${agora}:p`, conversa_id: conversaId, quem: 'pessoa', texto: pergunta, em: new Date(agora).toISOString(), autor_nome: nome, origem: 'crm' },
    { id: `crm:${conversaId}:${agora}:i`, conversa_id: conversaId, quem: 'ia', texto: r.texto, em: new Date(agora + 1).toISOString(), origem: 'crm', pedido_id: pedido.id },
  ])
  /* `trocas` relido agora, e não o lido antes da resposta: o assunto de Gestão
     é da equipe, e duas pessoas perguntando juntas perderiam a conta. */
  const { data: atual } = await supabase.from('ia_conversas').select('trocas').eq('id', conversaId).maybeSingle()
  await supabase.from('ia_conversas').update({
    ultima: new Date().toISOString(),
    trocas: Number(atual?.trocas ?? 0) + 1,
    // O assunto criado vazio ("+ Novo assunto") ganha o nome da primeira pergunta.
    ...(conversa && !conversa.titulo ? { titulo: tituloDe(pergunta) } : {}),
  }).eq('id', conversaId)

  return NextResponse.json({ ok: true, motor: 'servidor', conversa_id: conversaId, pedido_id: pedido.id, texto: r.texto, custo_usd: r.uso.custo_usd })
}
