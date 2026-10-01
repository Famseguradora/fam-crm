/* ENTRADA DO COMERCIAL. A tela mora em ComercialCliente.tsx; aqui só se decide,
   no servidor, se ela abre. No site publicado a caixa de e-mail fica fechada
   (ordem de 01/10/2026, lib/email/so-no-notebook.ts). */

import { caixaForaDoAr } from '@/lib/email/so-no-notebook'
import CaixaFechadaNoAr from '@/components/comercial/CaixaFechadaNoAr'
import ComercialCliente from './ComercialCliente'

export const dynamic = 'force-dynamic'

export default function ComercialPage() {
  if (caixaForaDoAr()) return <CaixaFechadaNoAr titulo="Entrada do Comercial" />
  return <ComercialCliente />
}
