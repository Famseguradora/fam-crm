// ============================================================================
//  GET /api/esteira/documentos?id=<analise_fila>  ·  materializar a pasta
//
//  O caso da Triagem tem os documentos no Storage do CRM. O motor da análise lê
//  ARQUIVO, numa pasta do disco. Alguém tem que fazer a ponte, e esse alguém é
//  o agente do notebook: é ele que está na máquina onde o motor roda.
//
//  Esta rota entrega os endereços assinados para ele baixar. Endereço assinado,
//  e não o arquivo pela rota: um pedido de análise tem 14 anexos e passa de 30
//  MB, e trafegar isso por dentro do Next seria segurar tudo na memória do
//  servidor sem necessidade nenhuma. O Storage entrega direto.
//
//  A ASSINATURA VALE 15 MINUTOS. Tempo de baixar, e não mais: um endereço
//  assinado é uma porta aberta para o arquivo, e porta aberta tem que fechar.
//
//  A LISTA EM SI SAIU DAQUI em 23/09/2026, para `lib/analise/documentos.ts`.
//  Motivo: a equipe passou a abrir os mesmos documentos por
//  `/api/analise/documentos`, com a sessão dela, e duas listas montadas em dois
//  lugares acabariam divergindo — o agente baixando um conjunto para o motor e
//  a equipe lendo outro na tela, achando que são os mesmos.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { documentosDaAnalise, VALE_AGENTE } from '@/lib/analise/documentos'

export const runtime = 'nodejs'

const VALE_SEGUNDOS = VALE_AGENTE

export async function GET(req: NextRequest) {
  const segredo = process.env.CARTEIRO_TOKEN || process.env.ANALISE_EVENTO_TOKEN || ''
  if (!segredo) return NextResponse.json({ erro: 'Rota não configurada (CARTEIRO_TOKEN).' }, { status: 503 })
  if (req.headers.get('x-carteiro-token') !== segredo) {
    return NextResponse.json({ erro: 'Segredo inválido.' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 503 })
  const sb = createClient(url, chave, { auth: { persistSession: false } })

  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ erro: 'Falta dizer qual análise.' }, { status: 422 })

  const { data: fila } = await sb
    .from('analise_fila')
    .select('id, pasta, caso_id, tomador_id, cnpj, razao_social')
    .eq('id', id)
    .maybeSingle()
  if (!fila) return NextResponse.json({ erro: 'Análise não está na fila.' }, { status: 404 })

  const { documentos, falhas } = await documentosDaAnalise(sb, fila, VALE_SEGUNDOS)

  return NextResponse.json({
    ok: true,
    pasta: fila.pasta,
    cnpj: fila.cnpj,
    razao_social: fila.razao_social,
    documentos,
    falhas,
    vale_ate: new Date(Date.now() + VALE_SEGUNDOS * 1000).toISOString(),
  })
}
