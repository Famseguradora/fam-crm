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

// ── LEMBRETES NO CELULAR (30/09/2026) ─────────────────────────────────────
// O servidor do CRM cifra a mensagem (lib/push/webpush.ts, RFC 8291) e o
// navegador entrega aqui já decifrada. Mostrar é obrigatório: o navegador
// pune quem recebe push e não mostra nada.
self.addEventListener('push', (event) => {
  let dados = {}
  try { dados = event.data ? event.data.json() : {} } catch { dados = { titulo: event.data ? event.data.text() : '' } }
  const titulo = dados.titulo || 'FAM CRM'
  event.waitUntil(self.registration.showNotification(titulo, {
    body: dados.texto || '',
    tag: dados.tag || undefined,
    renotify: !!dados.tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { link: dados.link || '/' },
  }))
})

// Tocar na notificação abre o lembrete: reaproveita a aba do CRM se houver.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  let destino = new URL((event.notification.data && event.notification.data.link) || '/', self.location.origin)
  // Só abre páginas do próprio CRM, nunca um endereço de fora.
  destino = destino.origin === self.location.origin ? destino.href : self.location.origin + '/'
  event.waitUntil((async () => {
    const abas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const aba of abas) {
      if (aba.url.startsWith(self.location.origin) && 'focus' in aba) {
        await aba.focus()
        if ('navigate' in aba) { try { return await aba.navigate(destino) } catch { return self.clients.openWindow(destino) } }
        return
      }
    }
    return self.clients.openWindow(destino)
  })())
})
