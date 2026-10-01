/* O que aparece no site publicado no lugar da caixa de e-mail (01/10/2026).
   A regra mora em lib/email/so-no-notebook.ts. */

import Link from 'next/link'
import { Aviso } from '@/components/painel/Painel'
import { cor } from '@/lib/ui/painel'
import { RECADO_CAIXA_SO_NO_NOTEBOOK } from '@/lib/email/so-no-notebook'

export default function CaixaFechadaNoAr({ titulo }: { titulo: string }) {
  return (
    <div style={{ padding: '20px 0', maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: cor.tinta, margin: '0 0 14px' }}>{titulo}</h1>
      <Aviso>
        {RECADO_CAIXA_SO_NO_NOTEBOOK}{' '}
        Os casos que já viraram demanda seguem na <Link href="/comercial/entrada">Entrada de pedidos</Link>,
        no Funil e na ficha do tomador.
      </Aviso>
    </div>
  )
}
