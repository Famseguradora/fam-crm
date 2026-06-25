import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendConviteComite, toWhatsAppNumber } from '@/lib/whatsapp/client'
import type { Operacao } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { operacaoId } — envia o convite de votação para todos os membros do
// comitê (comite=true, ativos, com telefone). Chamado pelo botão "Enviar
// convite ao Comitê pelo WhatsApp" no CRM. Exige sessão autenticada.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })
    }

    const { operacaoId } = await request.json()
    if (!operacaoId) {
      return NextResponse.json({ erro: 'operacaoId é obrigatório.' }, { status: 400 })
    }

    const { data: op, error: opErr } = await supabase
      .from('operacoes')
      .select('*, tomador:tomadores(*), produto:produtos(*)')
      .eq('id', operacaoId)
      .maybeSingle()
    if (opErr || !op) {
      return NextResponse.json({ erro: 'Operação não encontrada.' }, { status: 404 })
    }

    const { data: membros } = await supabase
      .from('usuarios')
      .select('id, nome, telefone')
      .eq('comite', true)
      .eq('status', 'ativo')
      .not('telefone', 'is', null)

    const subscritorNome = (op as Operacao).subscritor_nome ?? 'Subscrição FAM'

    let enviados = 0
    for (const m of membros ?? []) {
      const to = toWhatsAppNumber(m.telefone)
      if (!to) continue
      await sendConviteComite(to, op as Operacao, m.nome, subscritorNome)
      enviados++
    }

    await supabase.from('operacoes').update({ comite_enviado_whatsapp: true }).eq('id', operacaoId)

    return NextResponse.json({ sucesso: true, enviados })
  } catch (e) {
    console.error('[comite/convidar] erro:', e)
    return NextResponse.json({ erro: 'Erro interno ao enviar convites.' }, { status: 500 })
  }
}
