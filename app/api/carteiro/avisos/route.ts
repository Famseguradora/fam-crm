// ============================================================================
//  /api/carteiro/avisos  ·  a ponte do aviso com o Outlook da máquina
//
//  GET   os avisos JÁ AUTORIZADOS que faltam sair (no máximo 3 por rodada),
//        cada um com destinatários, assunto, texto e a forma de entrega
//        (rascunho na pasta dele, ou enviar de verdade).
//  POST  { acao: 'pegar' | 'entregue' | 'falhou', id, ... }
//
//  AS DUAS TRAVAS QUE IMPORTAM, porque aqui sai e-mail em nome da FAM:
//    · só sai o que está `autorizado` (a autorização é dele, na tela, ou o nó
//      está em automático, o que também é decisão dele, na régua);
//    · `pegar` marca `enviando` com `.eq('estado','autorizado')`: duas máquinas
//      com o Carteiro de pé nunca mandam o mesmo aviso duas vezes.
//
//  Mesmo segredo do resto do Carteiro (x-carteiro-token) e service role: quem
//  chama é a máquina, sem sessão.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/** Aviso que ficou 'enviando' além disto é máquina que caiu no meio. Volta. */
const ENVIANDO_MORRE_MIN = 15

function abrir(req: NextRequest) {
  const segredo = process.env.CARTEIRO_TOKEN || process.env.ANALISE_EVENTO_TOKEN || ''
  if (!segredo) return { erro: NextResponse.json({ erro: 'Rota não configurada (CARTEIRO_TOKEN).' }, { status: 503 }) }
  if (req.headers.get('x-carteiro-token') !== segredo) return { erro: NextResponse.json({ erro: 'Segredo inválido.' }, { status: 401 }) }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return { erro: NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 503 }) }
  return { sb: createClient(url, chave, { auth: { persistSession: false } }) }
}

export async function GET(req: NextRequest) {
  const { sb, erro } = abrir(req)
  if (!sb) return erro

  const limite = new Date(Date.now() - ENVIANDO_MORRE_MIN * 60000).toISOString()
  await sb.from('avisos_pedido')
    .update({ estado: 'autorizado', maquina: null })
    .eq('estado', 'enviando').lt('autorizado_em', limite)

  const { data: avisos } = await sb
    .from('avisos_pedido')
    .select('id, no, empresa, cnpj, destinatarios, assunto, corpo')
    .eq('estado', 'autorizado')
    .order('criado_em', { ascending: true })
    .limit(3)

  // A forma de entrega é da régua, e não do aviso: ela pode mudar entre a
  // autorização e a saída, e o que vale é a última decisão dele.
  const { data: regua } = await sb.from('aviso_regras').select('no, entrega, titulo')
  const porNo = new Map((regua ?? []).map(r => [r.no as string, r]))

  return NextResponse.json({
    ok: true,
    avisos: (avisos ?? [])
      .filter(a => (a.destinatarios as string[] | null)?.length)
      .map(a => ({
        id: a.id,
        assunto: a.assunto,
        corpo: a.corpo,
        destino: (a.destinatarios as string[]).join('; '),
        modo: porNo.get(a.no as string)?.entrega === 'enviar' ? 'enviar' : 'rascunho',
        titulo: porNo.get(a.no as string)?.titulo ?? a.no,
        empresa: a.empresa,
      })),
  })
}

export async function POST(req: NextRequest) {
  const { sb, erro } = abrir(req)
  if (!sb) return erro
  const corpo = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = String(corpo.id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ erro: 'Falta o aviso.' }, { status: 422 })
  const maquina = String(corpo.maquina ?? '').slice(0, 120) || null
  const acao = String(corpo.acao ?? '')

  if (acao === 'pegar') {
    const { data } = await sb.from('avisos_pedido')
      .update({ estado: 'enviando', maquina })
      .eq('id', id).eq('estado', 'autorizado')
      .select('id')
    return NextResponse.json({ ok: true, pegou: !!data?.length })
  }

  if (acao === 'entregue') {
    const como = corpo.entregue_como === 'enviado' ? 'enviado' : 'rascunho'
    const { error } = await sb.from('avisos_pedido').update({
      estado: 'enviado', entregue_como: como, enviado_em: new Date().toISOString(), erro: null, maquina,
    }).eq('id', id)
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (acao === 'falhou') {
    await sb.from('avisos_pedido').update({
      estado: 'erro', erro: String(corpo.erro ?? 'falhou').slice(0, 1000), maquina,
    }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ erro: 'Ação desconhecida (pegar, entregue, falhou).' }, { status: 422 })
}
