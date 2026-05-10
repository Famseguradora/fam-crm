import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Este endpoint usa a chave de serviço (SECRETA) para criar usuários no Auth
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nome, email, telefone, cargo, perfil, status, senha } = body

    if (!nome || !email || !senha) {
      return NextResponse.json({ erro: 'Nome, e-mail e senha são obrigatórios.' }, { status: 400 })
    }
    if (senha.length < 6) {
      return NextResponse.json({ erro: 'A senha deve ter no mínimo 6 caracteres.' }, { status: 400 })
    }

    // Cliente Admin com service role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Cria o usuário no Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    })

    if (authError) {
      if (authError.message.includes('already been registered')) {
        return NextResponse.json({ erro: 'Este e-mail já está cadastrado no sistema.' }, { status: 409 })
      }
      return NextResponse.json({ erro: authError.message }, { status: 400 })
    }

    // Insere na tabela pública de usuários
    const { error: dbError } = await supabaseAdmin.from('usuarios').insert({
      auth_id: authData.user.id,
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
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ erro: 'Erro ao salvar dados do usuário.' }, { status: 500 })
    }

    return NextResponse.json({ sucesso: true })
  } catch {
    return NextResponse.json({ erro: 'Erro interno do servidor.' }, { status: 500 })
  }
}
