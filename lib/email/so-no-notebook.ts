/* A CAIXA DE E-MAIL SÓ ABRE NO NOTEBOOK  ·  01/10/2026

   Ordem do Marco, por segurança: "o e-mail que eu consigo acessar via sistema
   que está no ar, retire do ar; somente conseguirei acessar no meu notebook".

   No site publicado (Vercel) a tela da caixa e as rotas que leem ou mexem no
   conteúdo dos e-mails recusam. No notebook (`localhost:3000`, o mesmo que o
   Carteiro usa) tudo segue igual.

   O QUE ISTO NÃO FECHA, e precisa estar escrito: os e-mails que o Carteiro
   sobe continuam no Supabase, porque a esteira precisa deles (o caso nasce de
   lá). Quem protege essa linha é a RLS (`fam_ve_caixa`: só o dono e quem ele
   pôr na lista). Esta trava tira o CAMINHO pelo site, não o dado do banco.

   Uma regra, num lugar só: tela e rota perguntam aqui. */

import { NextResponse } from 'next/server'

/** Verdadeiro no site publicado. A Vercel define `VERCEL=1` em todo deploy;
 *  no notebook a variável não existe. É o mesmo critério do botão do Carteiro. */
export const caixaForaDoAr = (): boolean => !!process.env.VERCEL

export const RECADO_CAIXA_SO_NO_NOTEBOOK =
  'Por segurança, a caixa de e-mail só abre no notebook do Comercial (localhost:3000). No site publicado ela fica fechada.'

/** Para o começo das rotas da caixa: devolve a recusa no ar, `null` no notebook. */
export function recusarCaixaNoAr(): NextResponse | null {
  if (!caixaForaDoAr()) return null
  return NextResponse.json({ erro: RECADO_CAIXA_SO_NO_NOTEBOOK }, { status: 403 })
}
