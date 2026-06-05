'use client'

import { useEffect } from 'react'

// Registra o service worker da PWA. O navegador só permite SW em contexto
// seguro (HTTPS) ou em localhost — em outros casos a chamada falha e é ignorada.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((err) => console.warn('SW register falhou:', err))
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
