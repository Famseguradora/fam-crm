import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FAM Seguradora — Controle Comercial',
  description: 'CRM da FAM Seguradora',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
