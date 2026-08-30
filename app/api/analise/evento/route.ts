// ============================================================================
//  "A análise da empresa X começou" — `POST /api/analise/evento`
//
//  Quem chama é o MOTOR, que roda na máquina do Marco e não tem sessão de
//  navegador: ele não pode passar pela RLS como usuário. Por isso a rota é
//  server-side, confere um segredo combinado e grava com service role.
//
//  O caminho inteiro:
//     motor local  ──POST──▶  esta rota  ──insert──▶  analise_eventos
//                                                          │ Realtime
//                                     todo CRM aberto  ◀────┘  (o aviso)
//
//  Por que um segredo e não a sessão: o motor é um processo Node na máquina
//  dele, sem cookie de login. Sem o segredo, qualquer um que alcançasse a URL
//  poderia inventar avisos no CRM da empresa inteira.
// ============================================================================
import { createClient } from '@supabase/supabase-js'

/** Aviso sem empresa não diz nada a ninguém; é o único campo obrigatório. */
interface Evento {
  empresa?: string
  tipo?: string
  chave_local?: string
  detalhe?: string
  criado_por?: string
}

const TIPOS = ['iniciou', 'concluiu', 'falhou']

export async function POST(req: Request) {
  const segredo = process.env.ANALISE_EVENTO_TOKEN
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Sem segredo configurado a rota fica FECHADA, e não aberta. O default de
  // uma trava ausente tem que ser "não passa": um deploy que esqueceu a
  // variável não pode virar um endpoint público de escrita.
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

  const empresa = String(corpo.empresa ?? '').trim().slice(0, 200)
  if (!empresa) {
    return Response.json({ erro: 'Falta a empresa.' }, { status: 422 })
  }

  const tipo = TIPOS.includes(String(corpo.tipo)) ? String(corpo.tipo) : 'iniciou'

  const supabase = createClient(url, chave, { auth: { persistSession: false } })

  const { data, error } = await supabase
    .from('analise_eventos')
    .insert({
      tipo,
      empresa,
      chave_local: corpo.chave_local?.slice(0, 200) ?? null,
      detalhe: corpo.detalhe?.slice(0, 500) ?? null,
      criado_por: corpo.criado_por?.slice(0, 120) ?? 'motor local',
    })
    .select('id, criado_em')
    .single()

  if (error) return Response.json({ erro: error.message }, { status: 500 })

  return Response.json({ ok: true, ...data })
}
