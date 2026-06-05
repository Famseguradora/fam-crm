// Service worker mínimo da FAM CRM.
// Objetivo: tornar o app instalável (PWA) — NÃO cacheia dados, pois é um CRM
// financeiro e dados desatualizados seriam perigosos. Tudo vai sempre à rede.

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Passagem direta para a rede (sem cache). Mantém um handler de fetch presente
// para os critérios de instalabilidade, sem servir conteúdo defasado.
self.addEventListener('fetch', (event) => {
  // Deixa o navegador lidar normalmente; não respondemos com cache.
  return
})
