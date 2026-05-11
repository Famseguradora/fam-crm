import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nome, email, telefone, cargo, perfil, status } = body

    if (!nome || !email) {
      return NextResponse.json({ erro: 'Nome e e-mail são obrigatórios.' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')

    // Envia convite por e-mail — Supabase dispara o e-mail automaticamente
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: `${appUrl}/alterar-senha` }
    )

    if (inviteError) {
      if (inviteError.message.toLowerCase().includes('already')) {
        return NextResponse.json({ erro: 'Este e-mail já está cadastrado no sistema.' }, { status: 409 })
      }
      return NextResponse.json({ erro: inviteError.message }, { status: 400 })
    }

    // Insere na tabela pública de usuários
    const { error: dbError } = await supabaseAdmin.from('usuarios').insert({
      auth_id: inviteData.user.id,
      nome,
      email,
      telefone: telefone || null,
      cargo: cargo || null,
      perfil,
      status,
      primeiro_acesso: true,
    })

    if (dbError) {
      // Rollback: remove o usuário do auth se falhou no banco
      await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id)
      return NextResponse.json({ erro: 'Erro ao salvar dados do usuário: ' + dbError.message }, { status: 500 })
    }

    return NextResponse.json({ sucesso: true })
  } catch {
    return NextResponse.json({ erro: 'Erro interno do servidor.' }, { status: 500 })
  }
}
