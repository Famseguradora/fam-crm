'use client'

import { useState } from 'react'

export interface Tomador {
  id: string
  razao_social: string
  cnpj?: string | null
  prioridade?: string | null
  status?: string | null
  created_at?: string
}

interface Props {
  tomadores: Tomador[]
  statusMap?: Record<string, string>
  selecionado: Tomador | null
  onSelect: (t: Tomador) => void
}

const c = {
  bg: '#0a1220',
  card: '#0d1428',
  border: 'rgba(255,255,255,0.07)',
  text: 'rgba(255,255,255,0.85)',
  muted: 'rgba(255,255,255,0.35)',
  accent: '#38bdf8',
  accentBg: 'rgba(56,189,248,0.08)',
  accentBorder: 'rgba(56,189,248,0.2)',
  danger: '#f87171',
  dangerBg: 'rgba(248,113,113,0.08)',
  warning: '#fb923c',
  warningBg: 'rgba(251,146,60,0.08)',
  success: '#4ade80',
}

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  'Comitê':      { label: '🏛 Comitê',      color: '#e8b84b', bg: 'rgba(232,184,75,0.1)',   border: 'rgba(232,184,75,0.3)' },
  'Subscrição':  { label: '📋 Subscrição',  color: '#a78bfa', bg: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.3)' },
  'Em Análise':  { label: '🔍 Em Análise',  color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.3)' },
  'Documentação':{ label: '📁 Documentação',color: '#fb923c', bg: 'rgba(251,146,60,0.1)',   border: 'rgba(251,146,60,0.3)' },
  'Triagem':     { label: '🔍 Triagem',     color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' },
}

function prioBadge(p?: string | null) {
  if (p === 'Urgente') return { label: 'U', bg: c.dangerBg, color: c.danger, border: 'rgba(248,113,113,0.25)' }
  if (p === 'Prioridade') return { label: 'P', bg: c.warningBg, color: c.warning, border: 'rgba(251,146,60,0.25)' }
  return { label: 'N', bg: c.accentBg, color: c.accent, border: c.accentBorder }
}

function prioOrder(p?: string | null) {
  if (p === 'Urgente') return 1
  if (p === 'Prioridade') return 2
  return 3
}

export default function FilaTomadores({ tomadores, statusMap = {}, selecionado, onSelect }: Props) {
  const [busca, setBusca] = useState('')

  const filtrados = tomadores
    .filter(t => t.razao_social.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => prioOrder(a.prioridade) - prioOrder(b.prioridade))

  return (
    <div style={{ width: 220, minWidth: 220, display: 'flex', flexDirection: 'column', background: c.bg, borderRight: `1px solid ${c.border}`, height: '100%' }}>
      <div style={{ padding: '12px 10px 8px', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: c.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>Fila</span>
        </div>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar tomador..."
          style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: c.text, border: `0.5px solid ${c.border}`, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtrados.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: c.muted, fontSize: 12 }}>Nenhum tomador</div>
        )}
        {filtrados.map(t => {
          const badge = prioBadge(t.prioridade)
          const ativo = selecionado?.id === t.id
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              style={{
                width: '100%', textAlign: 'left', padding: '11px 10px',
                background: ativo ? 'rgba(56,189,248,0.07)' : 'transparent',
                borderLeft: ativo ? `3px solid ${c.accent}` : '3px solid transparent',
                border: 'none', borderBottom: `0.5px solid ${c.border}`,
                cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 8,
              }}
            >
              <div style={{ width: 20, height: 20, borderRadius: 4, background: badge.bg, color: badge.color, border: `0.5px solid ${badge.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
                {badge.label}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: ativo ? 'white' : c.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.razao_social}
                </div>
                {(() => {
                  const st = statusMap[t.id]
                  const badge = st ? STATUS_BADGE[st] : null
                  if (!badge && !t.cnpj) return null
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      {badge && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.6px',
                          color: badge.color, background: badge.bg,
                          border: `0.5px solid ${badge.border}`,
                          borderRadius: 3, padding: '1px 5px', flexShrink: 0,
                        }}>
                          {badge.label}
                        </span>
                      )}
                      {t.cnpj && (
                        <span style={{ fontSize: 10, color: c.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.cnpj}</span>
                      )}
                    </div>
                  )
                })()}
              </div>
            </button>
          )
        })}
      </div>

    </div>
  )
}
