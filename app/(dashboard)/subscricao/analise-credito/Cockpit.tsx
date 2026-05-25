'use client'

import { useEffect, useRef } from 'react'
import type { Tomador } from './FilaTomadores'
import { useCockpit } from './cockpit/useCockpit'
import { C } from './cockpit/types'
import PainelLeiame from './cockpit/PainelLeiame'
import PainelAnalise from './cockpit/PainelAnalise'
import PainelPerfil from './cockpit/PainelPerfil'
import PainelJuridico from './cockpit/PainelJuridico'
import PainelDestaques from './cockpit/PainelDestaques'
import PainelDashboardBP from './cockpit/PainelDashboardBP'
import PainelSimulador from './cockpit/PainelSimulador'
import type { PainelId } from './cockpit/types'

interface Props { tomador: Tomador | null }

const NAV_ITENS: { id: PainelId; icon: string; label: string }[] = [
  { id: 'analise',   icon: '📄', label: 'Análise de Crédito' },
  { id: 'perfil',    icon: '🏢', label: 'Perfil' },
  { id: 'juridico',  icon: '⚖️', label: 'Jurídico' },
  { id: 'destaques', icon: '⭐', label: 'Destaques & Pitch' },
  { id: 'dashboard', icon: '📊', label: 'Dashboard BP' },
  { id: 'simulador', icon: '🧮', label: 'Simulador' },
]

export default function Cockpit({ tomador }: Props) {
  const cockpit = useCockpit(tomador?.id ?? null)
  const lastTomadorId = useRef<string | null>(null)

  useEffect(() => {
    if (tomador?.id && tomador.id !== lastTomadorId.current) {
      lastTomadorId.current = tomador.id
      cockpit.loadSessao(tomador.id)
    }
  }, [tomador?.id])

  if (!tomador) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ color: C.muted, fontSize: 14 }}>Selecione um tomador na lista para iniciar</div>
        </div>
      </div>
    )
  }

  const painelProps = { cockpit, tomador }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg, minWidth: 0, overflow: 'hidden' }}>

      {/* ── TopBar ── */}
      <div style={{
        height: 48,
        background: C.card,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 12,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {tomador.razao_social}
          </span>
          {cockpit.sessao?.meta?.rating && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: ratingColor(cockpit.sessao.meta.rating),
              background: 'rgba(0,0,0,0.4)',
              padding: '1px 8px', borderRadius: 4,
              border: `0.5px solid ${ratingColor(cockpit.sessao.meta.rating)}40`,
              flexShrink: 0,
            }}>
              {cockpit.sessao.meta.rating}
            </span>
          )}
          {cockpit.sessao?.meta?.limite != null && (
            <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>
              Limite: <span style={{ color: C.accent }}>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(cockpit.sessao.meta.limite)}
              </span>
            </span>
          )}
          {cockpit.sessao?.meta?.recomendacao && (
            <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>
              · <span style={{ color: recomColor(cockpit.sessao.meta.recomendacao) }}>{cockpit.sessao.meta.recomendacao}</span>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {cockpit.salvando && <span style={{ fontSize: 11, color: C.muted }}>Salvando…</span>}
          {cockpit.loading && <span style={{ fontSize: 11, color: C.muted }}>Carregando…</span>}
          {cockpit.sessao && cockpit.sessao.id !== '__temp__' && (
            <span style={{ fontSize: 10, color: C.success, padding: '2px 8px', borderRadius: 4, border: `1px solid ${C.success}40`, background: C.successBg }}>
              ✓ Salvo
            </span>
          )}
        </div>
      </div>

      {/* ── NavBar (centralizada) ── */}
      <div style={{
        height: 48,
        background: '#080f1f',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        flexShrink: 0,
        padding: '0 16px',
        overflowX: 'auto',
      }}>
        {NAV_ITENS.map(item => {
          const active = cockpit.painelAtivo === item.id
          return (
            <button
              key={item.id}
              onClick={() => cockpit.setPainelAtivo(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 18px',
                borderRadius: 7,
                border: `1px solid ${active ? C.goldBorder : C.border}`,
                background: active ? C.goldBg : 'transparent',
                color: active ? C.gold : C.muted,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.color = C.text
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.borderColor = C.border
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.color = C.muted
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = C.border
                }
              }}
            >
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Body: Painel Central | Leia-me ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Painel Central */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {cockpit.painelAtivo === 'analise'    && <PainelAnalise {...painelProps} />}
          {cockpit.painelAtivo === 'perfil'     && <PainelPerfil {...painelProps} />}
          {cockpit.painelAtivo === 'juridico'   && <PainelJuridico {...painelProps} />}
          {cockpit.painelAtivo === 'destaques'  && <PainelDestaques {...painelProps} />}
          {cockpit.painelAtivo === 'dashboard'  && <PainelDashboardBP {...painelProps} />}
          {cockpit.painelAtivo === 'simulador'  && <PainelSimulador {...painelProps} />}
        </div>

        {/* Painel Leia-me */}
        <PainelLeiame cockpit={cockpit} />
      </div>
    </div>
  )
}

function ratingColor(r: string): string {
  if (['AAA', 'AA', 'A'].includes(r)) return '#4ade80'
  if (['BBB', 'BB'].includes(r)) return '#38bdf8'
  if (r === 'B') return '#fb923c'
  return '#f87171'
}

function recomColor(r: string): string {
  const l = r.toLowerCase()
  if (l.includes('aprovad') || l.includes('recomend')) return '#4ade80'
  if (l.includes('restri') || l.includes('parcial') || l.includes('anális')) return '#fb923c'
  return '#f87171'
}
