// ============================================================================
//  "O funcionário X está fazendo Y agora" — `POST /api/agente/evento`
//
//  Ordem do Marco, 31/08/2026: "eu preciso ver os agentes trabalhando, mostre
//  na tela como se fosse avatar".
//
//  Irmã da `/api/analise/evento`, e de propósito: mesmo segredo, mesmo service
//  role, mesma forma. O que muda é o destino e a frequência.
//
//     motor local ──POST──▶ esta rota ──insert──▶ agente_eventos
//                                                       │ Realtime
//                                    o chão de fábrica ◀┘  (os avatares)
//
//  POR QUE NÃO REUSEI A ROTA DO AVISO: lá cada linha vira um balão na tela de
//  todo mundo. Aqui é um evento por etapa, e virar toast encheria o CRM da
//  empresa inteira. São públicos diferentes da mesma máquina.
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { soDigitos } from '@/lib/analise/cnpj'

const ACOES = ['comecou', 'passo', 'terminou', 'falhou']

interface Evento {
  agente?: string
  acao?: string
  tarefa?: string
  alvo?: string
  detalhe?: string
  /** A chave que liga o evento ao card do tomador. O nome da pasta não serve:
   *  a triagem chuta e a análise renomeia depois. */
  cnpj?: string
}

export async function POST(req: Request) {
  const segredo = process.env.ANALISE_EVENTO_TOKEN
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Trava ausente tem que significar "não passa", nunca "passa geral": um
  // deploy que esqueceu a variável não pode virar endpoint público de escrita.
  if (!segredo || !url || !chave) {
    return Response.json(
      { erro: 'Rota não configurada (ANALISE_EVENTO_TOKEN / chaves do Supabase).' },
      { status: 503 })
  }

  if (req.headers.get('x-analise-token') !== segredo) {
    return Response.json({ erro: 'Segredo inválido.' }, { status: 401 })
  }

  let corpo: Evento = {}
  try { corpo = await req.json() } catch { /* corpo vazio cai na validação */ }

  const agente = String(corpo.agente ?? '').trim().slice(0, 60)
  const tarefa = String(corpo.tarefa ?? '').trim().slice(0, 200)

  // Sem agente não há avatar para acender, e sem tarefa o avatar acende mudo.
  // Os dois são o mínimo para a tela dizer alguma coisa.
  if (!agente) return Response.json({ erro: 'Falta o agente.' }, { status: 422 })
  if (!tarefa) return Response.json({ erro: 'Falta a tarefa.' }, { status: 422 })

  const acao = ACOES.includes(String(corpo.acao)) ? String(corpo.acao) : 'passo'

  const supabase = createClient(url, chave, { auth: { persistSession: false } })

  const { data, error } = await supabase
    .from('agente_eventos')
    .insert({
      agente,
      acao,
      tarefa,
      alvo: corpo.alvo?.slice(0, 200) ?? null,
      detalhe: corpo.detalhe?.slice(0, 500) ?? null,
      cnpj: soDigitos(corpo.cnpj),
    })
    .select('id, criado_em')
    .single()

  if (error) return Response.json({ erro: error.message }, { status: 500 })

  return Response.json({ ok: true, ...data })
}
