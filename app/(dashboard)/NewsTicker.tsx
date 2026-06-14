'use client'

import { useEffect, useState } from 'react'

interface NewsItem {
  title: string
  source: string
  link: string
}

interface Props {
  userId: string
}

// Cor de destaque por fonte — diferencia visualmente os portais na faixa.
function sourceColor(source: string): string {
  switch (source) {
    case 'G1 Economia':  return '#e0533a'
    case 'G1 Política':  return '#b06bd0'
    case 'InfoMoney':    return '#3ad07a'
    case 'Ag. Brasil':   return '#4aa3e0'
    case 'CQCS Seguros': return '#e8b84b'
    default:             return '#8ab0d0'
  }
}

function storageKey(userId: string) {
  return `fam_ticker_${userId || 'global'}`
}

function readPref(userId: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId)) !== 'off'
  } catch {
    return true
  }
}

function savePref(userId: string, on: boolean) {
  try {
    localStorage.setItem(storageKey(userId), on ? 'on' : 'off')
  } catch {
    // incognito mode — silently ignore
  }
}

export default function NewsTicker({ userId }: Props) {
  const [enabled, setEnabled] = useState(true)
  const [items, setItems] = useState<NewsItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    // Lê a preferência salva no navegador só no cliente (localStorage não
    // existe no SSR). O setState aqui é proposital — sincroniza o estado
    // com o storage após a hidratação.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(readPref(userId))
    setHydrated(true)
  }, [userId])

  useEffect(() => {
    if (!hydrated || !enabled) return
    let active = true
    const load = () => {
      fetch('/api/news-ticker')
        .then(r => (r.ok ? r.json() : { items: [] }))
        .then(d => { if (active) setItems(Array.isArray(d.items) ? d.items : []) })
        .catch(() => {})
    }
    load()
    // Recarrega sozinho a cada 10 min — o banner se renova sem dar F5.
    const id = setInterval(load, 10 * 60 * 1000)
    return () => { active = false; clearInterval(id) }
  }, [hydrated, enabled])

  if (!hydrated) return null

  // Ticker disabled — show a thin reactivation strip
  if (!enabled) {
    return (
      <div style={{
        background: '#0a1628',
        borderBottom: '1px solid #1a3560',
        height: 24,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 12,
      }}>
        <button
          onClick={() => { savePref(userId, true); setEnabled(true) }}
          title="Reativar faixa de notícias"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#3a5070',
            cursor: 'pointer',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 8px',
            borderRadius: 4,
            transition: 'color 0.15s',
            fontFamily: "'Calibri','Segoe UI',sans-serif",
            letterSpacing: '0.3px',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#7090b0')}
          onMouseLeave={e => (e.currentTarget.style.color = '#3a5070')}
        >
          📰 reativar notícias
        </button>
      </div>
    )
  }

  // No news loaded yet or all sources failed — render nothing
  if (items.length === 0) return null

  // Comprimento aproximado do conteúdo (fonte + título) para calcular a
  // velocidade da rolagem. ~50px/s (mais lento = dá tempo de ler).
  const totalChars = items.reduce((n, i) => n + i.source.length + i.title.length + 6, 0)
  const duration = Math.max(60, Math.round((1200 + totalChars * 5) / 50))

  return (
    <div style={{
      background: '#0a1628',
      borderBottom: '1px solid #1a3560',
      height: 28,
      display: 'flex',
      alignItems: 'center',
      overflow: 'hidden',
    }}>

      {/* Label */}
      <div style={{
        flexShrink: 0,
        padding: '0 12px',
        borderRight: '1px solid #1a3560',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 10,
        fontWeight: 700,
        color: '#e8b84b',
        letterSpacing: '1px',
        textTransform: 'uppercase' as const,
        whiteSpace: 'nowrap' as const,
        fontFamily: "'Calibri','Segoe UI',sans-serif",
      }}>
        📰 AO VIVO
      </div>

      {/* Scrolling area — passar o mouse aqui PAUSA a rolagem para ler. */}
      <div
        style={{ flex: 1, overflow: 'hidden' }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <span
          className="fam-ticker-scroll"
          style={{
            animation: `fam-ticker ${duration}s linear infinite`,
            animationPlayState: paused ? 'paused' : 'running',
            fontSize: 12,
            fontFamily: "'Calibri','Segoe UI',sans-serif",
            cursor: 'default',
          }}
        >
          {items.map((item, idx) => {
            const color = sourceColor(item.source)
            const badge = (
              <span style={{
                color,
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: '0.6px',
                textTransform: 'uppercase' as const,
                padding: '1px 7px',
                borderRadius: 3,
                border: `1px solid ${color}44`,
                background: `${color}14`,
                marginRight: 9,
              }}>
                {item.source}
              </span>
            )
            // Com link válido → matéria abre em nova aba. Sem link → texto puro.
            return (
              <span key={idx} style={{ marginRight: 44 }}>
                {item.link ? (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Abrir matéria — ${item.source}`}
                    style={{ textDecoration: 'none', cursor: 'pointer' }}
                  >
                    {badge}
                    <span className="fam-ticker-title" style={{ color: '#9fc1e0' }}>{item.title}</span>
                  </a>
                ) : (
                  <>
                    {badge}
                    <span style={{ color: '#9fc1e0' }}>{item.title}</span>
                  </>
                )}
              </span>
            )
          })}
        </span>
      </div>

      {/* Disable button */}
      <button
        onClick={() => { savePref(userId, false); setEnabled(false) }}
        title="Ocultar notícias"
        style={{
          flexShrink: 0,
          background: 'transparent',
          border: 'none',
          color: '#3a5070',
          cursor: 'pointer',
          padding: '0 12px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          fontSize: 13,
          transition: 'color 0.15s',
          lineHeight: 1,
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#8ab0d0')}
        onMouseLeave={e => (e.currentTarget.style.color = '#3a5070')}
      >
        ✕
      </button>
    </div>
  )
}
