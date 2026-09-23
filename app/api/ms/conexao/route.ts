// ============================================================================
//  /api/ms/conexao  ·  a caixa do Outlook ligada (ou não) a esta pessoa
//
//    GET     diz se está conectada, com qual conta, e o que falta para poder
//    DELETE  desliga: apaga o consentimento guardado
//
//  A tela pergunta aqui antes de desenhar o botão. Sem esta rota, a área de
//  soltura teria que adivinhar — e adivinhar, na prática, é oferecer um botão
//  que não vai funcionar.
//
//  A LINHA DE `ms_conexoes` NÃO É DADO DE TELA: ela guarda o refresh_token
//  cifrado, e a tabela não tem policy nenhuma (só o servidor chega). Por isso
//  esta rota usa a chave de serviço e devolve apenas o que a tela precisa:
//  conectado sim ou não, e o nome da conta.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'
import { configMS } from '@/lib/ms/graph'
import { lerApp } from '@/lib/ms/app'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const admin = await createAdminClient()
  const cfg = configMS(undefined, await lerApp(admin))
  if (!cfg.ok) {
    /* SEM CONFIGURAÇÃO, A TELA DIZ O QUE FALTA. É o mesmo princípio do
       interruptor da IA: botão que liga o que não existe é um botão mentindo. */
    return NextResponse.json({ possivel: false, falta: cfg.falta, conectado: false })
  }

  const { data } = await admin
    .from('ms_conexoes')
    .select('conta, nome, conectado_em, usado_em, falha')
    .eq('auth_id', user.id)
    .maybeSingle()

  /* O LINK DA APROVAÇÃO DO ADMINISTRADOR. A FAM restringe consentimento de
     usuário (achado em 23/09/2026: "Necessidade de aprovação de administrador"),
     e essa tela da Microsoft NÃO manda e-mail para ninguém — ela só avisa quem
     clicou. Sem este link, o pedido ao administrador seria "entra no portal e
     procura"; com ele, é abrir, entrar e aceitar.

     Ele não é segredo: é o identificador público do aplicativo e as permissões
     que ele pede, exatamente as que a tela mostra. Quem abre sem ser
     administrador não consegue aprovar nada. */
  const escopos = [
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.Read.Shared',
    'https://graph.microsoft.com/User.Read',
    'offline_access',
  ]
  const aprovacao = `https://login.microsoftonline.com/${cfg.cfg.tenant}/v2.0/adminconsent`
    + `?client_id=${cfg.cfg.clientId}`
    + `&scope=${encodeURIComponent(escopos.join(' '))}`
    + `&redirect_uri=${encodeURIComponent(cfg.cfg.redirect)}`

  return NextResponse.json({
    possivel: true,
    aprovacao,
    conectado: !!data,
    conta: data?.conta ?? null,
    nome: data?.nome ?? null,
    conectado_em: data?.conectado_em ?? null,
    falha: data?.falha ?? null,
  })
}

export async function DELETE(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const admin = await createAdminClient()
  const { error } = await admin.from('ms_conexoes').delete().eq('auth_id', user.id)
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

  /* O CRM esquece o consentimento; quem revoga do lado da Microsoft é a
     própria pessoa, em myapplications.microsoft.com. A tela diz isso. */
  return NextResponse.json({ ok: true })
}
