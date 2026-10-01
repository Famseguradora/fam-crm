/* A RÉGUA DO E-MAIL. A tela mora em ReguaCliente.tsx; no site publicado ela
   fica fechada junto com a caixa (lib/email/so-no-notebook.ts). */

import { caixaForaDoAr } from '@/lib/email/so-no-notebook'
import CaixaFechadaNoAr from '@/components/comercial/CaixaFechadaNoAr'
import ReguaCliente from './ReguaCliente'

export const dynamic = 'force-dynamic'

export default function ReguaDoEmailPage() {
  if (caixaForaDoAr()) return <CaixaFechadaNoAr titulo="Régua do e-mail" />
  return <ReguaCliente />
}
