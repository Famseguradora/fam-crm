import type { Metadata, Viewport } from 'next'
import './globals.css'
import ServiceWorkerRegister from './ServiceWorkerRegister'

export const metadata: Metadata = {
  title: 'FAM Seguradora — Controle Comercial',
  description: 'CRM da FAM Seguradora',
  applicationName: 'FAM CRM',
  appleWebApp: {
    capable: true,
    title: 'FAM CRM',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  // iOS antigo (< 16.4) ainda lê o meta legado para modo standalone
  other: { 'apple-mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a1628',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  )
}
