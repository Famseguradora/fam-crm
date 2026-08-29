// ============================================================================
//  A trilha — `/api/financeiro/auditoria`
//
//  GET  ?desde=ISO      → os registros (o mais novo por último)
//  POST { registros }   → acrescenta. Só acrescenta.
//
//  QUEM ASSINOU VEM DO SERVIDOR. O navegador manda o que fez; o nome de quem
//  fez é sobrescrito aqui com o da sessão. Antes de entrar no CRM, a trilha era
//  assinada por um texto solto no navegador (`quemUsa = 'Aldeir (CFO)'`), que
//  qualquer um editava. Era registro, não auditoria.
//
//  No banco a tabela não tem policy de UPDATE nem de DELETE: nem o dono
//  reescreve nem apaga. Testado.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { quemFinanceiro, negado } from '@/lib/financeiro/acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Teto por chamada: a tela manda o que acumulou, não a trilha inteira. */
const MAX_POR_VEZ = 500

export async function GET(request: NextRequest) {
  const quem = await quemFinanceiro()
  if (!quem.ve) return negado()

  const desde = request.nextUrl.searchParams.get('desde')
  const supabase = await createClient()

  let q = supabase
    .from('financeiro_auditoria')
    .select('id, ts, quem, aba, tipo, acao, onde, de, para, detalhe')
    .order('ts', { ascending: true })
    .limit(8000)

  if (desde) q = q.gt('ts', desde)

  const { data, error } = await q
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

  return NextResponse.json({ registros: data ?? [] })
}

export async function POST(request: NextRequest) {
  const quem = await quemFinanceiro()
  if (!quem.ve) return negado()
  if (!quem.edita) return negado('Seu acesso ao Financeiro é somente de leitura.')

  let corpo: { registros?: unknown }
  try { corpo = await request.json() } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }) }

  const lista = Array.isArray(corpo.registros) ? corpo.registros : []
  if (!lista.length) return NextResponse.json({ gravados: 0 })
  if (lista.length > MAX_POR_VEZ) {
    return NextResponse.json({ erro: `Máximo de ${MAX_POR_VEZ} registros por vez.` }, { status: 400 })
  }

  const txt = (v: unknown, teto = 2000) => (typeof v === 'string' ? v.slice(0, teto) : '')

  const linhas = lista
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
    .map(r => ({
      id: txt(r.id, 60) || crypto.randomUUID(),
      // data do evento: se vier estranha, vale a hora de chegada
      ts: Number.isNaN(Date.parse(String(r.ts))) ? new Date().toISOString() : new Date(String(r.ts)).toISOString(),
      quem: quem.nome,                 // ← o navegador não escolhe quem assina
      quem_usuario_id: quem.usuarioId,
      aba: txt(r.aba, 120),
      tipo: txt(r.tipo, 40),
      acao: txt(r.acao, 300),
      onde: txt(r.onde), de: txt(r.de), para: txt(r.para), detalhe: txt(r.detalhe),
    }))

  // Mesmo id = mesmo registro: reenvio depois de queda de rede não duplica.
  // `ignoreDuplicates` também impede que um reenvio reescreva um registro já
  // gravado, que é o que faria a trilha mentir.
  const supabase = await createClient()
  const { error } = await supabase
    .from('financeiro_auditoria')
    .upsert(linhas, { onConflict: 'id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json({ gravados: linhas.length })
}
