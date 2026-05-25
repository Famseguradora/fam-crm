'use client'

import { useState } from 'react'
import { C, fmtBRL, fmtPct } from './types'
import type { useCockpit } from './useCockpit'

type CockpitHook = ReturnType<typeof useCockpit>

interface Props { cockpit: CockpitHook }

export default function PainelLeiame({ cockpit }: Props) {
  const meta = cockpit.sessao?.meta
  const [notas, setNotas] = useState(cockpit.sessao?.notas || '')
  const [editandoNotas, setEditandoNotas] = useState(false)

  const kpis = [
    { label: 'Score FAM', valor: meta?.score_fam != null ? String(meta.score_fam) : null, cor: scoreColor(meta?.score_fam) },
    { label: 'Rating', valor: meta?.rating || null, cor: ratingColor(meta?.rating) },
    { label: 'Serasa', valor: meta?.serasa_score != null ? String(meta.serasa_score) : null, cor: scoreColor(meta?.serasa_score) },
    { label: 'Limite', valor: meta?.limite != null ? fmtBRL(meta.limite) : null, cor: C.accent },
    { label: 'Recomendação', valor: meta?.recomendacao || null, cor: recomColor(meta?.recomendacao) },
  ].filter(k => k.valor)

  return (
    <div style={{
      width: 240,
      minWidth: 240,
      background: '#080f1f',
      borderLeft: `1px solid ${C.border}`,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
        Leia-me Estratégico
      </div>

      {/* KPI Cards */}
      {kpis.length > 0 && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, borderBottom: `1px solid ${C.border}` }}>
          {kpis.map(k => (
            <div key={k.label} style={{ background: C.card, borderRadius: 6, padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: C.muted }}>{k.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: k.cor }}>{k.valor}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notas livres */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.2px', textTransform: 'uppercase' }}>Notas</span>
          <button
            onClick={() => {
              if (editandoNotas) cockpit.salvarNotas(notas)
              setEditandoNotas(e => !e)
            }}
            style={{ fontSize: 10, color: editandoNotas ? C.gold : C.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
          >
            {editandoNotas ? '✓ Salvar' : '✏️ Editar'}
          </button>
        </div>
        {editandoNotas ? (
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            style={{
              width: '100%', minHeight: 80, background: C.card2, border: `1px solid ${C.border}`,
              borderRadius: 5, color: C.text, fontSize: 12, padding: '6px 8px',
              resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
            }}
            placeholder="Anotações estratégicas…"
          />
        ) : (
          <div style={{ fontSize: 12, color: notas ? C.text : C.muted, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {notas || 'Nenhuma nota. Clique em Editar.'}
          </div>
        )}
      </div>

      {/* Destaques marcados */}
      <div style={{ padding: '10px 12px', flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 8 }}>
          Destaques ({cockpit.destaques.length})
        </div>
        {cockpit.destaques.length === 0 ? (
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
            Clique com o botão direito em qualquer texto da análise e escolha "⭐ Destacar".
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cockpit.destaques.map(d => (
              <div key={d.id} style={{ background: C.card, borderRadius: 6, padding: '6px 10px', position: 'relative' }}>
                {d.secao && <div style={{ fontSize: 9, color: C.gold, fontWeight: 700, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{d.secao}</div>}
                <div style={{ fontSize: 11, color: C.text, lineHeight: 1.5 }}>{d.texto}</div>
                <button
                  onClick={() => cockpit.removerDestaque(d.id)}
                  style={{ position: 'absolute', top: 4, right: 6, background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 12, lineHeight: 1 }}
                  title="Remover destaque"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function scoreColor(s?: number): string {
  if (s == null) return C.muted
  if (s >= 700) return C.success
  if (s >= 500) return C.gold
  if (s >= 300) return C.warning
  return C.danger
}

function ratingColor(r?: string): string {
  if (!r) return C.muted
  if (['AAA', 'AA', 'A'].includes(r)) return '#4ade80'
  if (['BBB', 'BB'].includes(r)) return '#38bdf8'
  if (r === 'B') return '#fb923c'
  return '#f87171'
}

function recomColor(r?: string): string {
  if (!r) return C.muted
  if (r.toLowerCase().includes('aprovad') || r.toLowerCase().includes('recomend')) return C.success
  if (r.toLowerCase().includes('restri') || r.toLowerCase().includes('parcial')) return C.warning
  return C.danger
}
