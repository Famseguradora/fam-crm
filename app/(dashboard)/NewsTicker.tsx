'use client'

import { useEffect, useState } from 'react'

interface NewsItem {
  title: string
  source: string
}

interface Props {
  userId: string
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

  useEffect(() => {
    setEnabled(readPref(userId))
    setHydrated(true)
  }, [userId])

  useEffect(() => {
    if (!hydrated || !enabled) return
    fetch('/api/news-ticker')
      .then(r => (r.ok ? r.json() : { items: [] }))
      .then(d => setItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => {})
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

  const tickerText = items.map(i => `${i.source}  ·  ${i.title}`).join('          ')

  // ~80px/s at 12px font (≈5px per char). Container ≈ 1200px.
  const duration = Math.round((1200 + tickerText.length * 5) / 80)

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

      {/* Scrolling area */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <span
          className="fam-ticker-scroll"
          style={{
            animation: `fam-ticker ${duration}s linear infinite`,
            color: '#8ab0d0',
            fontSize: 12,
            fontFamily: "'Calibri','Segoe UI',sans-serif",
            cursor: 'default',
          }}
        >
          {tickerText}
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
