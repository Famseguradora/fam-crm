'use client'

import { useEffect, useState } from 'react'

interface Quote {
  label: string
  value: string
  pct: number | null
  kind: string
}

interface Aviso {
  id: string
  mensagem: string
  tipo: 'parabens' | 'info' | 'alerta'
}

// Ícone por tipo de aviso — destaque visual bem diferente dos números.
const AVISO_ICONE: Record<Aviso['tipo'], string> = {
  parabens: '🎉',
  info: '📢',
  alerta: '⚠️',
}

// Espaço normal entre itens.
const GAP = 30
// Folga maior na emenda do loop (entre o fim "Fontes…" e o próximo "Dólar"):
// dá a separação visual pedida, mas é curta — bem menor que a largura da
// faixa — então o início reaparece à direita antes de o fim sair à esquerda
// (nunca fica tela vazia).
const FOLGA = 600

export default function MarketTicker() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    let active = true
    const load = () => {
      fetch('/api/market')
        .then(r => (r.ok ? r.json() : { quotes: [] }))
        .then(d => { if (active) setQuotes(Array.isArray(d.quotes) ? d.quotes : []) })
        .catch(() => {})
    }
    load()
    // Atualiza as cotações a cada 2 min, sem recarregar a página.
    const id = setInterval(load, 2 * 60 * 1000)
    return () => { active = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    let active = true
    const load = () => {
      fetch('/api/avisos')
        .then(r => (r.ok ? r.json() : { avisos: [] }))
        .then(d => { if (active) setAvisos(Array.isArray(d.avisos) ? d.avisos : []) })
        .catch(() => {})
    }
    load()
    // Avisos entram/expiram em prazo curto — recarrega a cada 1 min.
    const id = setInterval(load, 60 * 1000)
    return () => { active = false; clearInterval(id) }
  }, [])

  // Nada para mostrar (sem cotações E sem avisos) — não renderiza nada.
  if (quotes.length === 0 && avisos.length === 0) return null

  // Velocidade ~70px/s. A animação anda 1 cópia (-50%); estimamos a largura
  // de uma cópia pelos caracteres para manter a velocidade constante.
  const totalChars =
    quotes.reduce((n, q) => n + q.label.length + q.value.length + 8, 0) +
    avisos.reduce((n, a) => n + a.mensagem.length + 4, 0)
  const groupPx = totalChars * 6.5 + (quotes.length + avisos.length) * GAP + FOLGA
  const duration = Math.max(20, Math.round(groupPx / 70))

  // Uma cópia: avisos (destaque dourado) primeiro, depois as cotações e o crédito.
  const grupo = (
    <>
      {avisos.map((a) => (
        <span
          key={a.id}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 700,
            color: '#0a1628',
            background: 'linear-gradient(135deg,#f4d06a,#e8b84b)',
            border: '1px solid #f4d06a',
            borderRadius: 5,
            padding: '2px 12px',
            marginRight: GAP,
            letterSpacing: '0.2px',
            boxShadow: '0 0 10px rgba(232,184,75,.35)',
          }}
        >
          <span style={{ fontSize: 13 }}>{AVISO_ICONE[a.tipo]}</span>
          {a.mensagem}
        </span>
      ))}
      {quotes.map((q, i) => {
        const up = q.pct != null && q.pct >= 0
        // Verde sobe, vermelho cai; dourado para indicadores sem variação (Selic, IPCA).
        const color = q.pct == null ? '#c9a84a' : up ? '#3ad07a' : '#e0533a'
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, fontSize: 12, marginRight: GAP }}>
            <span style={{ color: '#7e9fc0' }}>{q.label}</span>
            <span style={{ color: '#dce9f5', fontWeight: 600 }}>{q.value}</span>
            {q.pct != null && (
              <span style={{ color, fontSize: 11, fontWeight: 700 }}>
                {up ? '▲' : '▼'}{Math.abs(q.pct).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
              </span>
            )}
          </span>
        )
      })}
      {quotes.length > 0 && (
        <span style={{ color: '#54708f', fontSize: 10, fontStyle: 'italic', marginRight: FOLGA }}>
          Fontes: Banco Central · Yahoo Finance
        </span>
      )}
    </>
  )

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: '#0a1628',
      borderBottom: '1px solid #1a3560',
      height: 26,
      overflow: 'hidden',
      fontFamily: "'Calibri','Segoe UI',sans-serif",
    }}>
      {/* Rótulo fixo */}
      <div style={{
        flexShrink: 0,
        padding: '0 12px',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 10,
        fontWeight: 700,
        color: '#e8b84b',
        letterSpacing: '1px',
        textTransform: 'uppercase' as const,
        borderRight: '1px solid #1a3560',
        whiteSpace: 'nowrap' as const,
      }}>
        💹 Mercado
      </div>

      {/* Área que rola — passar o mouse pausa para leitura */}
      <div
        style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', overflow: 'hidden' }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          className="fam-marquee-track"
          style={{
            flexShrink: 0,
            animation: `fam-marquee ${duration}s linear infinite`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        >
          <span className="fam-marquee-group">{grupo}</span>
          <span className="fam-marquee-group" aria-hidden>{grupo}</span>
        </div>
      </div>
    </div>
  )
}
