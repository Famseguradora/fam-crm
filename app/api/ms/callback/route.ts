// ============================================================================
//  GET /api/ms/callback  ·  a volta do login da Microsoft
//
//  Troca o código pelo par de tokens, descobre de quem é a caixa, guarda o
//  refresh_token CIFRADO em `ms_conexoes` e devolve a pessoa para a tela de
//  onde ela saiu.
//
//  O TOKEN DE ACESSO NÃO É GUARDADO. Ele vale uma hora; guardá-lo só
//  aumentaria a superfície do vazamento sem poupar nada — cada busca pede um
//  novo com o refresh.
//
//  QUALQUER PROBLEMA VOLTA COMO MENSAGEM NA TELA, e não como página de erro
//  crua: quem clicou em "conectar" está no meio de um arrasto, e precisa saber
//  o que fazer em seguida.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { configMS, trocarCodigo, quemSou, cifrar } from '@/lib/ms/graph'
import { caminhoInterno } from '@/lib/seguranca/volta-interna'
import { lerApp } from '@/lib/ms/app'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const base = `${req.nextUrl.protocol}//${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`
  /* A VOLTA É CONFERIDA DE NOVO AQUI, mesmo tendo sido conferida na ida. O
     cookie é escrito por nós, mas uma trava que depende de "o outro lado já
     olhou" para de valer no dia em que alguém escrever outro caminho até
     aqui. */
  const depois = caminhoInterno(req.cookies.get('ms_depois')?.value, base, '/comercial/entrada')
  const volta = (resultado: string, detalhe?: string) => {
    const u = new URL(depois, base)
    u.searchParams.set('ms', resultado)
    if (detalhe) u.searchParams.set('detalhe', detalhe.slice(0, 200))
    const r = NextResponse.redirect(u)
    for (const c of ['ms_estado', 'ms_pkce', 'ms_depois']) r.cookies.delete(c)
    return r
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // A sessão do CRM caiu no meio do caminho: leva para o login e não deixa
    // o estado do fluxo antigo para trás.
    const r = NextResponse.redirect(new URL('/login', base))
    for (const c of ['ms_estado', 'ms_pkce', 'ms_depois']) r.cookies.delete(c)
    return r
  }

  const erroMS = req.nextUrl.searchParams.get('error')
  if (erroMS) {
    return volta('recusado', req.nextUrl.searchParams.get('error_description') ?? erroMS)
  }

  const codigo = req.nextUrl.searchParams.get('code') ?? ''
  const estado = req.nextUrl.searchParams.get('state') ?? ''
  const esperado = req.cookies.get('ms_estado')?.value ?? ''
  const verificador = req.cookies.get('ms_pkce')?.value ?? ''

  /* A VOLTA TEM QUE SER DESTA IDA. Sem esta conferência, um link de callback
     forjado ligaria a caixa de outra pessoa à conta de quem clicasse. */
  if (!codigo || !estado || !esperado || estado !== esperado || !verificador) {
    return volta('erro', 'A volta do login não bateu com a ida. Tente conectar de novo.')
  }

  const admin = await createAdminClient()
  const cfg = configMS(base, await lerApp(admin))
  if (!cfg.ok) return volta('falta-config')

  const tok = await trocarCodigo(cfg.cfg, codigo, verificador)
  if (tok.error || !tok.access_token) {
    return volta('erro', tok.error_description ?? tok.error ?? 'A Microsoft não devolveu o token.')
  }
  if (!tok.refresh_token) {
    /* Sem refresh, a conexão duraria uma hora e morreria calada. É sinal de
       que faltou `offline_access` no consentimento. */
    return volta('erro', 'A Microsoft não deu permissão duradoura (offline_access). Conecte de novo e aceite tudo.')
  }

  const eu = await quemSou(tok.access_token)
  if (!eu.conta) return volta('erro', 'Consegui o token, mas não consegui ler de quem é a caixa.')

  const { error } = await admin.from('ms_conexoes').upsert({
    auth_id: user.id,
    conta: eu.conta,
    nome: eu.nome,
    refresh_cifrado: cifrar(tok.refresh_token),
    escopo: tok.scope ?? null,
    conectado_em: new Date().toISOString(),
    falha: null,
  })
  if (error) {
    /* O detalhe do banco fica no log do servidor. Na tela vai a frase que
       ajuda quem clicou — e que não vaza nome de coluna para a query string. */
    console.error('[ms/callback] não consegui guardar a conexão:', error.message)
    return volta('erro', 'Não consegui guardar a conexão. Tente de novo.')
  }

  return volta('conectado', eu.conta)
}
