'use client'

import { useEffect, useState } from 'react'

const DISMISS_KEY = 'fam-install-dismissed'

interface BIPEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Banner que convida o usuário a instalar o app na tela inicial.
// Android/Chrome: botão "Instalar" (prompt nativo). iOS: instrução de Compartilhar.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return // já instalado
    if (localStorage.getItem(DISMISS_KEY)) return // já dispensado
    const isMobile = window.matchMedia('(max-width: 768px), (max-height: 600px)').matches
    if (!isMobile) return // foco no celular

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(ios)

    const onBIP = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BIPEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onBIP)

    // iOS não dispara beforeinstallprompt — mostramos a instrução direto.
    if (ios) setShow(true)

    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [])

  function dismiss() {
    setShow(false)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice.catch(() => {})
    dismiss()
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 300,
      background: '#0d1e3a', border: '1px solid #2255a4', borderRadius: 12,
      boxShadow: '0 8px 28px rgba(0,0,0,.45)', color: 'white',
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 9, flexShrink: 0,
        background: 'linear-gradient(135deg,#3070c8,#a0c0e8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 900, fontSize: 20, color: 'white',
      }}>F</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Instalar o app FAM CRM</div>
        {isIOS ? (
          <div style={{ fontSize: 12, color: '#a0c0e8', lineHeight: 1.35 }}>
            Toque em <b>Compartilhar</b> ⎋ e depois em <b>“Adicionar à Tela de Início”</b>.
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#a0c0e8' }}>Acesso rápido, em tela cheia, direto da tela inicial.</div>
        )}
      </div>
      {!isIOS && deferred && (
        <button onClick={install} style={{
          background: '#e8b84b', color: '#0a1628', border: 'none', borderRadius: 8,
          padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0,
        }}>Instalar</button>
      )}
      <button onClick={dismiss} aria-label="Dispensar" style={{
        background: 'transparent', border: 'none', color: '#6090b8', fontSize: 20,
        cursor: 'pointer', lineHeight: 1, padding: 4, flexShrink: 0,
      }}>✕</button>
    </div>
  )
}
