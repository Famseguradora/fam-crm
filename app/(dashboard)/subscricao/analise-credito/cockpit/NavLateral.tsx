'use client'

import { C, type PainelId } from './types'

const ITENS = [
  { id: 'analise',    icon: '📄', label: 'Análise de Crédito' },
  { id: 'perfil',     icon: '🏢', label: 'Perfil da Empresa' },
  { id: 'juridico',   icon: '⚖️', label: 'Jurídico' },
  { id: 'destaques',  icon: '⭐', label: 'Destaques & Pitch' },
  { id: 'dashboard',  icon: '📊', label: 'Dashboard BP' },
  { id: 'simulador',  icon: '🧮', label: 'Simulador' },
] as const

interface Props {
  painelAtivo: PainelId
  onSelect: (p: PainelId) => void
}

export default function NavLateral({ painelAtivo, onSelect }: Props) {
  return (
    <div style={{
      width: 190,
      minWidth: 190,
      background: '#080f1f',
      borderRight: `1px solid ${C.border}`,
      display: 'flex',
      flexDirection: 'column',
      paddingTop: 12,
      flexShrink: 0,
      overflowY: 'auto',
    }}>
      {ITENS.map(item => {
        const active = painelAtivo === item.id
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id as PainelId)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              background: active ? C.goldBg : 'transparent',
              border: 'none',
              borderLeft: active ? `3px solid ${C.gold}` : '3px solid transparent',
              color: active ? C.gold : C.muted,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: active ? 700 : 500,
              textAlign: 'left',
              width: '100%',
              transition: 'all 0.15s',
              lineHeight: 1.3,
            }}
            onMouseEnter={e => {
              if (!active) {
                e.currentTarget.style.color = C.text
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                e.currentTarget.style.color = C.muted
                e.currentTarget.style.background = 'transparent'
              }
            }}
          >
            <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1 }}>{item.icon}</span>
            <span style={{ whiteSpace: 'normal', lineHeight: 1.3 }}>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
