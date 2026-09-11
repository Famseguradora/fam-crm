// ============================================================================
//  POST /api/esteira/lote  ·  conferir os documentos de vários casos de uma vez
//
//  Fase 4 do Carteiro gerencial, pedido do Marco em 11/09/2026: "assim que eu
//  trouxer os 10 e-mails elegíveis de ontem para o sistema, o agente de
//  triagem entra em campo, eu forço que faça uma análise em todos, verificação
//  de documentos, igual é hoje, mas isso pode ser feito em lote".
//
//  É a ordem "reconferir" (reler a pasta e refazer a triagem) dada a cada caso,
//  pela MESMA regra da ordem de um só (lib/analise/dar-ordem.ts). Caso que não
//  pode receber a ordem agora (analisando, já com ordem esperando) é pulado, e
//  a resposta diz por quê. A triagem não é análise de crédito: é conferência
//  de documento, e por isso roda em lote sem pesar.
//
//  Nada executa aqui: o agente Esteira, no notebook, pega as ordens na próxima
//  volta, uma de cada vez. Trava: sessão + RLS.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { darOrdem } from '@/lib/analise/dar-ordem'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'

export const runtime = 'nodejs'

const LOTE_MAXIMO = 50
const ORDENS_EM_LOTE = ['reconferir'] as const

export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const corpo = await req.json().catch(() => ({})) as Record<string, unknown>
  const ordem = String(corpo.ordem ?? '')
  if (!(ORDENS_EM_LOTE as readonly string[]).includes(ordem)) {
    return NextResponse.json({ erro: 'Em lote, só a conferência de documentos (reconferir).' }, { status: 422 })
  }
  const ids = [...new Set((Array.isArray(corpo.ids) ? corpo.ids : []).map((x) => String(x ?? '')))]
    .filter((x) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x))
  if (!ids.length) return NextResponse.json({ erro: 'Falta dizer quais casos.' }, { status: 422 })
  if (ids.length > LOTE_MAXIMO) return NextResponse.json({ erro: `No máximo ${LOTE_MAXIMO} casos por lote.` }, { status: 413 })

  const { data: quem } = await supabase.from('usuarios').select('nome, perfil').eq('auth_id', user.id).maybeSingle()
  // Quem só lê levava 200 com "0 ordens dadas": a recusa tem que ser dita.
  if (!quem || quem.perfil === 'leitura') {
    return NextResponse.json({ erro: 'Você tem permissão só de leitura no CRM.' }, { status: 403 })
  }
  const nome = quem.nome ?? user.email ?? 'alguém'

  const dadas: string[] = []
  const recusadas: { id: string; erro: string }[] = []
  // Uma de cada vez: a trava da ordem pendente é por linha, e o lote não é urgente.
  for (const id of ids) {
    const r = await darOrdem(supabase, { id, ordem, nome, dados: { motivo: 'Conferência em lote pelo painel do e-mail' } })
    if (r.ok) dadas.push(id)
    else recusadas.push({ id, erro: r.erro })
  }
  return NextResponse.json({ ok: true, dadas: dadas.length, recusadas })
}
