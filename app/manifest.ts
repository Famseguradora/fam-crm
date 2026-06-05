import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FAM Seguradora — Controle Comercial',
    short_name: 'FAM CRM',
    description: 'CRM da FAM Seguradora — controle comercial de operações de garantia.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a1628',
    theme_color: '#0a1628',
    lang: 'pt-BR',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
