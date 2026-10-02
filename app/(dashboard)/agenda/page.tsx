'use client'

/* /agenda  ·  a mesma agenda do sino, em tela cheia (01/10/2026).
   Serve para deixar aberta numa aba e para mandar o link a um colega. */

import Agenda from '@/components/lembretes/Agenda'
import { cor, raio } from '@/lib/ui/painel'

export default function PaginaAgenda() {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <h1 style={{ margin: 0, fontSize: 20, color: cor.tinta }}>Agenda de lembretes</h1>
      <div style={{ height: 'calc(100dvh - 170px)', minHeight: 520, border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, overflow: 'hidden' }}>
        <Agenda />
      </div>
    </div>
  )
}
