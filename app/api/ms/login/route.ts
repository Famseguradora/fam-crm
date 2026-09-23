// ============================================================================
//  GET /api/ms/login  ·  manda a pessoa para o login da Microsoft
//
//  É um clique, uma vez. A Microsoft mostra o que o CRM está pedindo (ler o
//  e-mail DELA, e nada mais), ela autoriza, e volta para /api/ms/callback.
//
//  DUAS PROTEÇÕES, as duas em cookie de sessão (httpOnly, some ao fechar):
//    · `estado`  amarra a volta a esta ida. Sem ele, alguém poderia mandar um
//                link de callback forjado para a pessoa logada e ligar a caixa
//                dele a outra conta.
//    · PKCE      o código que volta só vale com o verificador que ficou aqui.
//                Mesmo com segredo no servidor, é a prática recomendada.
//
//  A volta guardada em `depois` faz a pessoa voltar para a tela onde estava —
//  ela clicou em "conectar" no meio de um arrasto, e tem que cair de volta no
//  arrasto, não numa página qualquer.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { configMS, parPKCE, urlDeLogin } from '@/lib/ms/graph'
import { caminhoInterno } from '@/lib/seguranca/volta-interna'
import { lerApp } from '@/lib/ms/app'
import crypto from 'node:crypto'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const base = `${req.nextUrl.protocol}//${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`
  const cfg = configMS(base, await lerApp(await createAdminClient()))
  if (!cfg.ok) {
    const volta = new URL('/comercial/entrada', base)
    volta.searchParams.set('ms', 'falta-config')
    return NextResponse.redirect(volta)
  }

  const estado = crypto.randomBytes(24).toString('base64url')
  const { verificador, desafio } = parPKCE()

  /* Só caminho interno na volta. `depois` vem da tela, e quem decide se ele é
     interno é `caminhoInterno` — olhar o começo do texto não basta, e o porquê
     está escrito lá (um TAB no meio transformava a conferência em nada). */
  const depois = caminhoInterno(req.nextUrl.searchParams.get('depois'), base, '/comercial/entrada')

  /* A DICA NÃO PODE SAIR DO LOGIN DO CRM (23/09/2026). O usuário do CRM pode
     ter e-mail pessoal — o do Marco é @gmail —, e mandar isso como dica fazia a
     Microsoft tentar entrar com a conta pessoal e recusar com AADSTS50020
     ("não existe neste diretório"). Só vale dica quando alguém disse qual é a
     caixa; fora isso, a Microsoft pergunta. */
  const dica = req.nextUrl.searchParams.get('caixa') ?? undefined
  const r = NextResponse.redirect(urlDeLogin(cfg.cfg, estado, desafio, dica || undefined))

  const cookie = { httpOnly: true, secure: base.startsWith('https'), sameSite: 'lax' as const, path: '/', maxAge: 600 }
  r.cookies.set('ms_estado', estado, cookie)
  r.cookies.set('ms_pkce', verificador, cookie)
  r.cookies.set('ms_depois', depois, cookie)
  return r
}
