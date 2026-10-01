'use client'

/* A RÉGUA DO E-MAIL · os parâmetros do Carteiro gerencial.
   A tela inteira mora em components/comercial/ReguaEmail.tsx; a página só
   dá o lugar dela no CRM, ao lado da Entrada do Comercial. */

import ReguaEmail from '@/components/comercial/ReguaEmail'

export default function ReguaDoEmailPage() {
  return (
    <div style={{ padding: '20px 0' }}>
      <ReguaEmail />
    </div>
  )
}
