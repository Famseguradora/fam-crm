// ============================================================================
//  /api/ms/registrar  ·  ligar o CRM ao Microsoft 365, pela própria tela
//
//    GET     como está o registro (e se há um login em andamento)
//    POST    começa: devolve o código que a pessoa digita na Microsoft
//    PUT     confere se ela já terminou; terminando, registra e guarda
//    DELETE  esquece o registro (o aplicativo continua lá no Entra)
//
//  Por que não é um script na máquina: a equipe usa o CRM PUBLICADO, e ele não
//  lê arquivo de máquina nenhuma. Ordem dele em 23/09/2026: "tem que ser feito
//  para todos os usuários, vão acessar somente o CRM e pronto".
//
//  QUEM PODE: só o dono do CRM (`proprietario`). Não é firula de tela — quem
//  registra o aplicativo decide para onde a Microsoft devolve as pessoas depois
//  do login, e isso não é decisão de qualquer um. A trava é conferida aqui, no
//  servidor, lendo `usuarios.proprietario`.
//
//  E quem não for admin do Microsoft 365? A Microsoft é que decide: se a FAM
//  não deixar a conta registrar aplicativos, a resposta vem com a frase certa
//  ("quem administra precisa fazer este passo") e nada é gravado.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'
import { cifrar } from '@/lib/ms/graph'
import { pedirCodigo, espiarLogin, registrarAplicativo, NOME_APP, PERMISSOES } from '@/lib/ms/registro'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Quem está pedindo, e se pode. */
async function quemPede() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 }) }

  const { data } = await supabase
    .from('usuarios')
    .select('nome, proprietario')
    .eq('auth_id', user.id)
    .maybeSingle()

  const eu = data as { nome: string | null; proprietario: boolean | null } | null
  if (!eu?.proprietario) {
    return { erro: NextResponse.json({ erro: 'Só o dono do CRM liga o Microsoft 365.' }, { status: 403 }) }
  }
  return { user, nome: eu.nome ?? user.email ?? 'alguém' }
}

/** Os dois endereços de volta: o CRM publicado e o CRM da máquina. */
function voltas(req: NextRequest): string[] {
  const aqui = `${req.nextUrl.protocol}//${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`
  const publicado = (process.env.NEXT_PUBLIC_APP_URL || 'https://fam-crm-five.vercel.app').replace(/\/+$/, '')
  return [...new Set([`${publicado}/api/ms/callback`, `${aqui.replace(/\/+$/, '')}/api/ms/callback`, 'http://localhost:3000/api/ms/callback'])]
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })

  const admin = await createAdminClient()
  const { data: app } = await admin
    .from('ms_app')
    .select('client_id, registrado_por, registrado_em, consentido, secret_expira')
    .eq('id', 'fam')
    .maybeSingle()

  const { data: eu } = await supabase.from('usuarios').select('proprietario').eq('auth_id', user.id).maybeSingle()

  /* O AMBIENTE AINDA VALE, para quem já tinha as variáveis de antes: a tela
     precisa dizer "ligado" nesse caso também, senão ofereceria registrar de
     novo o que já funciona. */
  const porAmbiente = !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET)

  const { data: pendente } = await admin
    .from('ms_registro_pendente')
    .select('user_code, verificacao, expira_em')
    .eq('id', 'fam')
    .maybeSingle()

  return NextResponse.json({
    ligado: !!app || porAmbiente,
    por: app?.registrado_por ?? (porAmbiente ? 'configuração do servidor' : null),
    em: app?.registrado_em ?? null,
    consentido: app?.consentido ?? false,
    secret_expira: app?.secret_expira ?? null,
    posso: !!(eu as { proprietario?: boolean } | null)?.proprietario,
    esperando: pendente && new Date(pendente.expira_em) > new Date() ? pendente : null,
    permissoes: PERMISSOES,
    nome_app: NOME_APP,
  })
}

// ── POST: começa o login (devolve o código para a tela mostrar) ──────────────
export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const pede = await quemPede()
  if (pede.erro) return pede.erro

  const r = await pedirCodigo()
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 })

  const admin = await createAdminClient()
  const { error } = await admin.from('ms_registro_pendente').upsert({
    id: 'fam',
    device_code: r.codigo.device_code,
    user_code: r.codigo.user_code,
    verificacao: r.codigo.verification_uri,
    intervalo: r.codigo.interval,
    expira_em: new Date(Date.now() + r.codigo.expires_in * 1000).toISOString(),
    pedido_por: pede.nome,
    pedido_auth: pede.user!.id,
    criado_em: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    codigo: r.codigo.user_code,
    onde: r.codigo.verification_uri,
    intervalo: r.codigo.interval,
    expira_em: new Date(Date.now() + r.codigo.expires_in * 1000).toISOString(),
  })
}

// ── PUT: a tela pergunta "já terminou?" a cada poucos segundos ───────────────
export async function PUT(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const pede = await quemPede()
  if (pede.erro) return pede.erro

  const admin = await createAdminClient()
  const { data: pendente } = await admin
    .from('ms_registro_pendente')
    .select('device_code, expira_em')
    .eq('id', 'fam')
    .maybeSingle()

  if (!pendente) return NextResponse.json({ estado: 'nada' })
  if (new Date(pendente.expira_em) <= new Date()) {
    await admin.from('ms_registro_pendente').delete().eq('id', 'fam')
    return NextResponse.json({ estado: 'erro', erro: 'O código expirou. Comece de novo.' })
  }

  const olhada = await espiarLogin(pendente.device_code as string)
  if (olhada.estado === 'esperando') return NextResponse.json({ estado: 'esperando' })
  if (olhada.estado === 'erro') {
    await admin.from('ms_registro_pendente').delete().eq('id', 'fam')
    return NextResponse.json({ estado: 'erro', erro: olhada.erro })
  }

  // Logou: agora o registro em si.
  const feito = await registrarAplicativo(olhada.token, voltas(req))
  await admin.from('ms_registro_pendente').delete().eq('id', 'fam')
  if (!feito.ok) return NextResponse.json({ estado: 'erro', erro: feito.erro })

  const agora = new Date().toISOString()
  const { error } = await admin.from('ms_app').upsert({
    id: 'fam',
    tenant_id: feito.registro.tenant_id,
    client_id: feito.registro.client_id,
    secret_cifrado: cifrar(feito.registro.secret),
    secret_expira: feito.registro.secret_expira,
    consentido: feito.registro.consentido,
    registrado_por: feito.registro.quem ?? pede.nome,
    registrado_em: agora,
    atualizado_em: agora,
  })
  if (error) {
    console.error('[ms/registrar] não consegui guardar o registro:', error.message)
    return NextResponse.json({ estado: 'erro', erro: 'O aplicativo foi criado, mas não consegui guardar aqui. Tente de novo.' })
  }

  return NextResponse.json({
    estado: 'pronto',
    consentido: feito.registro.consentido,
    por: feito.registro.quem,
  })
}

// ── DELETE: esquecer o registro ──────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const pede = await quemPede()
  if (pede.erro) return pede.erro

  const admin = await createAdminClient()
  await admin.from('ms_registro_pendente').delete().eq('id', 'fam')
  const { error } = await admin.from('ms_app').delete().eq('id', 'fam')
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

  /* As conexões das pessoas ficam: elas apontam para um aplicativo que ainda
     existe no Entra. Se o registro voltar igual, tudo volta a funcionar; se
     vier outro aplicativo, cada uma reconecta com um clique. */
  return NextResponse.json({ ok: true })
}
