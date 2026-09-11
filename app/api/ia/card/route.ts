// ============================================================================
//  POST /api/ia/card  ·  "Perguntar sobre este tomador" pela API
//
//  A aba IA do card da análise só respondia pelo claude.exe do notebook do
//  analista. Ordem do Marco em 11/09/2026: com a API ligada, toda IA do CRM
//  funciona nos notebooks da equipe. Então: API ligada e chave no ambiente,
//  responde aqui; sem API, a rota diz `motor: 'notebook'` e a tela manda a
//  pergunta para a fila, como antes.
//
//  O QUE MUDA DE UM MOTOR PARA O OUTRO, e a tela diz isso: o notebook abre os
//  arquivos da pasta, página a página. A API não tem o disco: ela responde com
//  o que está no BANCO (a análise publicada e os exercícios, o retrato da
//  biblioteca e a lista de documentos da fila, o caso, o tomador, as
//  operações), e é instruída a dizer quando a pergunta precisa de um documento.
//
//  GOVERNANÇA: cliente da sessão, como toda IA do CRM.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { perguntarAoServidor } from '@/lib/ia/servidor'
import { comoDado, fecharPedido, QUEDA_NO_MEIO, semApi, travasDaIA } from '@/lib/ia/travas'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'

export const runtime = 'nodejs'
export const maxDuration = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  const filaId = String(corpo.fila_id ?? '')
  const pergunta = String(corpo.pergunta ?? '').trim()
  if (!UUID.test(filaId)) return NextResponse.json({ erro: 'Falta dizer qual card.' }, { status: 422 })
  if (!pergunta) return NextResponse.json({ erro: 'Pergunta vazia.' }, { status: 422 })
  if (pergunta.length > 4000) return NextResponse.json({ erro: 'Pergunta muito longa (o limite é 4000 caracteres).' }, { status: 422 })

  const { data: fila } = await supabase.from('analise_fila')
    .select('id, pasta, chave, nome, razao_social, cnpj, analise_id, tomador_id, caso_id')
    .eq('id', filaId).maybeSingle()
  if (!fila) return NextResponse.json({ erro: 'Esse card não existe mais.' }, { status: 404 })

  const t = await travasDaIA(supabase)
  if (!t.ok) return NextResponse.json(semApi(t), { status: t.status })

  const nome = quem.nome ?? user.email ?? 'alguém da FAM'
  const empresa = fila.razao_social || fila.nome || fila.pasta || 'tomador sem nome'

  /* A memória do card são as últimas 5 perguntas respondidas dele, do banco. */
  const { data: anteriores } = await supabase.from('ia_pedidos').select('pergunta, resposta')
    .eq('escopo', 'analise').eq('fila_id', fila.id).eq('estado', 'pronta').not('resposta', 'is', null)
    .order('criado_em', { ascending: false }).limit(5)
  const historico = (anteriores ?? []).reverse().flatMap((p) => [
    { quem: 'pessoa' as const, texto: String(p.pergunta) },
    { quem: 'ia' as const, texto: String(p.resposta) },
  ])

  /* O nome da empresa vem do banco e é editável: entra entre aspas e limpo,
     como dado (a mesma cautela do <pedido> da régua). */
  const tela = [
    `card da análise de crédito da empresa ${comoDado(empresa)}`,
    `(CNPJ ${comoDado(fila.cnpj ?? 'sem CNPJ', 20)}; analise_fila.id ${fila.id}`,
    fila.tomador_id ? `; tomadores.id ${fila.tomador_id}` : '',
    fila.caso_id ? `; casos.id ${fila.caso_id}` : '',
    fila.analise_id ? `; analises.id ${fila.analise_id})` : '; a análise ainda não foi publicada)',
    '. Quando a pergunta não disser de quem é, é desta empresa.',
    ' Pela API você NÃO abre os arquivos da pasta: responda com o que está no banco',
    ' (a análise publicada e os exercícios, analise_fila.biblioteca e a lista de documentos, o caso, o tomador e as operações)',
    ' e diga com clareza quando a resposta depender de ler um documento que só existe na pasta.',
  ].join('')

  const { data: pedido, error: erroPedido } = await supabase.from('ia_pedidos').insert({
    pergunta, escopo: 'analise', motor: 'servidor', estado: 'respondendo', modelo: t.modelo,
    analise_id: fila.analise_id, fila_id: fila.id, pasta: fila.pasta, chave: fila.chave,
    criado_por_auth_id: user.id, criado_por_nome: nome, pegue_em: new Date().toISOString(),
  }).select('id').single()
  if (erroPedido || !pedido) return NextResponse.json({ erro: 'Não consegui registrar a pergunta. Nada foi enviado à IA.' }, { status: 500 })

  let r: Awaited<ReturnType<typeof perguntarAoServidor>>
  try {
    r = await perguntarAoServidor({
      pergunta, historico, modelo: t.modelo, esforco: t.esforco, sb: supabase,
      contexto: { nome, perfil: quem.perfil ?? 'usuario', tela, tomador: null },
    })
  } catch (e) {
    console.error('[ia/card]', e instanceof Error ? e.message : e)
    r = { ok: false, erro: QUEDA_NO_MEIO, status: 502 }
  }

  if (!r.ok) {
    await fecharPedido(supabase, pedido.id, { estado: 'erro', erro: r.erro, respondido_em: new Date().toISOString() })
    return NextResponse.json({ erro: r.erro }, { status: r.status })
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

  return NextResponse.json({ ok: true, motor: 'servidor', pedido_id: pedido.id, texto: r.texto, custo_usd: r.uso.custo_usd })
}
