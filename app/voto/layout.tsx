// Layout próprio da cédula de votação: FORA do CRM (sem DashboardShell, sem
// menu, sem gate de login). O diretor abre pelo WhatsApp, no celular.
import type { Metadata, Viewport } from 'next'
import './voto.css'

export const metadata: Metadata = {
  title: 'Cédula do Comitê · FAM Seguradora',
  // Link sigiloso: nunca pode virar resultado de busca.
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a1628',
}

export default function VotoLayout({ children }: { children: React.ReactNode }) {
  return <div className="voto-body">{children}</div>
}
