// ============================================================================
//  "A análise parou e precisa de você" — `POST /api/analise/pedido`
//
//  Ordem do Marco, 31/08/2026: "quando terminar ou paralisar, dentro do card do
//  tomador deve apresentar os motivos e a razão da utilização do que foi feito
//  e pedir minha autorização para continuar".
//
//  Quem chama é o MOTOR, na máquina dele, quando esbarra numa decisão que não é
//  dele. Mesmo segredo e mesmo service role das outras duas rotas do motor.
//
//  A RESPOSTA NÃO PASSA POR AQUI. Ele responde pelo card, logado, e o UPDATE vai
//  direto pelo Supabase sob a RLS `fam_e_analista()`. Esta rota só ABRE pedido.
//  Separar as duas coisas é o que impede o segredo do motor de virar uma forma
//  de responder pedido sem ser o analista.
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { soDigitos } from '@/lib/analise/cnpj'

interface Opcao {
  id?: string
  rotulo?: string
  detalhe?: string
}

interface Pedido {
  pasta?: string
  motivo?: string
  razao?: string
  opcoes?: Opcao[]
  cnpj?: string
  empresa?: string
}

/** Um card com quinze botões não é uma decisão, é um labirinto. */
const MAX_OPCOES = 6

export async function POST(req: Request) {
  const segredo = process.env.ANALISE_EVENTO_TOKEN
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!segredo || !url || !chave) {
    return Response.json(
      { erro: 'Rota não configurada (ANALISE_EVENTO_TOKEN / chaves do Supabase).' },
      { status: 503 })
  }

  if (req.headers.get('x-analise-token') !== segredo) {
    return Response.json({ erro: 'Segredo inválido.' }, { status: 401 })
  }

  let corpo: Pedido = {}
  try { corpo = await req.json() } catch { /* corpo vazio cai na validação */ }

  const pasta = String(corpo.pasta ?? '').trim().slice(0, 200)
  const motivo = String(corpo.motivo ?? '').trim().slice(0, 2000)

  // Sem pasta o motor não acha o trabalho de volta; sem motivo o card mostra
  // uma caixa muda pedindo autorização para nada.
  if (!pasta) return Response.json({ erro: 'Falta a pasta.' }, { status: 422 })
  if (!motivo) return Response.json({ erro: 'Falta o motivo.' }, { status: 422 })

  // Só entra opção que dá para desenhar num botão: precisa de id e de rótulo.
  const opcoes = (Array.isArray(corpo.opcoes) ? corpo.opcoes : [])
    .filter(o => o && String(o.id ?? '').trim() && String(o.rotulo ?? '').trim())
    .slice(0, MAX_OPCOES)
    .map(o => ({
      id: String(o.id).trim().slice(0, 40),
      rotulo: String(o.rotulo).trim().slice(0, 80),
      detalhe: o.detalhe ? String(o.detalhe).slice(0, 300) : null,
    }))

  const supabase = createClient(url, chave, { auth: { persistSession: false } })

  // UM PEDIDO ABERTO POR PASTA. Se o motor tentar de novo (retomada, segunda
  // pista, análise refeita), o pedido velho é cancelado antes: dois cartões
  // perguntando a mesma coisa no card seria pior que nenhum.
  await supabase
    .from('analise_pedidos')
    .update({ estado: 'cancelado' })
    .eq('pasta', pasta)
    .eq('estado', 'aberto')

  const { data, error } = await supabase
    .from('analise_pedidos')
    .insert({
      pasta,
      motivo,
      razao: corpo.razao?.slice(0, 4000) ?? null,
      opcoes,
      cnpj: soDigitos(corpo.cnpj),
      empresa: corpo.empresa?.slice(0, 200) ?? null,
    })
    .select('id, criado_em')
    .single()

  if (error) return Response.json({ erro: error.message }, { status: 500 })

  return Response.json({ ok: true, ...data })
}


// ── O MOTOR PERGUNTA SE JÁ FOI RESPONDIDO ──────────────────────────────────
//  `GET /api/analise/pedido?pasta=<nome>` devolve o estado do pedido daquela
//  pasta. É assim que a análise parada descobre que ele decidiu, sem precisar
//  de nada aberto na máquina dele.
export async function GET(req: Request) {
  const segredo = process.env.ANALISE_EVENTO_TOKEN
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!segredo || !url || !chave) {
    return Response.json({ erro: 'Rota não configurada.' }, { status: 503 })
  }
  if (req.headers.get('x-analise-token') !== segredo) {
    return Response.json({ erro: 'Segredo inválido.' }, { status: 401 })
  }

  const pasta = new URL(req.url).searchParams.get('pasta')
  if (!pasta) return Response.json({ erro: 'Falta a pasta.' }, { status: 422 })

  const supabase = createClient(url, chave, { auth: { persistSession: false } })

  const { data, error } = await supabase
    .from('analise_pedidos')
    .select('id, estado, resposta, observacao, respondido_em, respondido_por, motivo')
    .eq('pasta', pasta)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return Response.json({ erro: error.message }, { status: 500 })

  return Response.json({ ok: true, pedido: data ?? null })
}
