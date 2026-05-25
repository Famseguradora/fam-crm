'use client'

import { useState } from 'react'
import { C, fmtBRL, fmtPct } from './types'
import type { useCockpit } from './useCockpit'
import type { Tomador } from '../FilaTomadores'

type CockpitHook = ReturnType<typeof useCockpit>
interface Props { cockpit: CockpitHook; tomador: Tomador }

export default function PainelDestaques({ cockpit, tomador }: Props) {
  const meta = cockpit.sessao?.meta || {}
  const [showPitch, setShowPitch] = useState(false)
  const [novoDestaque, setNovoDestaque] = useState('')
  const [secaoManual, setSecaoManual] = useState('')

  const kpisAuto = [
    { label: 'Score FAM',      valor: meta.score_fam != null ? String(meta.score_fam) : null,      icon: '📊', cor: '#38bdf8' },
    { label: 'Rating',         valor: meta.rating || null,                                          icon: '🏆', cor: ratingColor(meta.rating) },
    { label: 'Serasa',         valor: meta.serasa_score != null ? String(meta.serasa_score) : null, icon: '📋', cor: '#38bdf8' },
    { label: 'Liquidez',       valor: meta.pefin != null ? (meta.pefin === 0 ? 'OK' : '⚠️') : null, icon: '💧', cor: meta.pefin === 0 ? '#4ade80' : '#fb923c' },
    { label: 'Recomendação',   valor: meta.recomendacao || null,                                    icon: '✅', cor: recomColor(meta.recomendacao) },
    { label: 'Limite',         valor: meta.limite != null ? fmtBRL(meta.limite) : null,             icon: '💰', cor: '#e8b84b' },
    { label: 'Rec. Judicial',  valor: meta.rec_judicial != null ? (meta.rec_judicial ? '⚠️ Sim' : '✓ Não') : null, icon: '⚖️', cor: meta.rec_judicial ? '#f87171' : '#4ade80' },
  ].filter(k => k.valor)

  function gerarPitch(): string {
    const nome = tomador.razao_social
    const rating = meta.rating || 'N/A'
    const score = meta.score_fam != null ? String(meta.score_fam) : 'N/A'
    const limite = meta.limite != null ? fmtBRL(meta.limite) : 'N/A'
    const recom = meta.recomendacao || 'Em Análise'
    const destaques = cockpit.destaques.slice(0, 3).map(d => `- ${d.texto}`).join('\n')

    return `PITCH — ${nome.toUpperCase()}

Rating FAM: ${rating} | Score FAM: ${score}
Limite Sugerido: ${limite}
Recomendação: ${recom}

Principais Destaques:
${destaques || '(sem destaques registrados)'}

Análise preparada pela equipe FAM Seguradora.`
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: C.bg }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Destaques & Pitch</h2>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>KPIs automáticos, destaques marcados e pitch de defesa</div>
          </div>
          <button
            onClick={() => setShowPitch(true)}
            style={{ padding: '8px 18px', borderRadius: 7, border: `1px solid ${C.goldBorder}`, background: C.goldBg, color: C.gold, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            🎤 Gerar Pitch
          </button>
        </div>

        {/* KPI Cards automáticos */}
        {kpisAuto.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 14 }}>
              KPIs da Análise
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
              {kpisAuto.map(kpi => (
                <div key={kpi.label} style={{ background: '#080f1f', borderRadius: 8, padding: '10px 12px', border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{kpi.icon}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{kpi.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: kpi.cor }}>{kpi.valor}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Adicionar destaque manual */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 14 }}>
            Adicionar Destaque Manual
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={secaoManual}
              onChange={e => setSecaoManual(e.target.value)}
              placeholder="Seção (opcional)"
              style={{ width: 140, background: C.card2, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontSize: 12, padding: '7px 10px', outline: 'none', fontFamily: 'inherit', flexShrink: 0 }}
            />
            <input
              value={novoDestaque}
              onChange={e => setNovoDestaque(e.target.value)}
              placeholder="Texto do destaque…"
              style={{ flex: 1, background: C.card2, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontSize: 12, padding: '7px 10px', outline: 'none', fontFamily: 'inherit' }}
              onKeyDown={e => {
                if (e.key === 'Enter' && novoDestaque.trim()) {
                  cockpit.adicionarDestaque(novoDestaque.trim(), secaoManual.trim() || undefined)
                  setNovoDestaque('')
                  setSecaoManual('')
                }
              }}
            />
            <button
              onClick={() => {
                if (novoDestaque.trim()) {
                  cockpit.adicionarDestaque(novoDestaque.trim(), secaoManual.trim() || undefined)
                  setNovoDestaque('')
                  setSecaoManual('')
                }
              }}
              style={{ padding: '7px 14px', borderRadius: 5, border: `1px solid ${C.goldBorder}`, background: C.goldBg, color: C.gold, cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
            >
              + Adicionar
            </button>
          </div>
        </div>

        {/* Lista de destaques */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 14 }}>
            Destaques Registrados ({cockpit.destaques.length})
          </div>
          {cockpit.destaques.length === 0 ? (
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
              Nenhum destaque ainda. Clique com botão direito em texto da análise ou adicione manualmente acima.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cockpit.destaques.map(d => (
                <div key={d.id} style={{ background: '#080f1f', borderRadius: 7, padding: '10px 14px', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>⭐</span>
                  <div style={{ flex: 1 }}>
                    {d.secao && (
                      <div style={{ fontSize: 9, color: C.gold, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 3 }}>{d.secao}</div>
                    )}
                    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{d.texto}</div>
                  </div>
                  <button
                    onClick={() => cockpit.removerDestaque(d.id)}
                    style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}
                    title="Remover"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Modal Pitch */}
      {showPitch && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowPitch(false)}>
          <div style={{ background: C.card, border: `1px solid ${C.goldBorder}`, borderRadius: 12, padding: 28, maxWidth: 560, width: '90%', boxShadow: '0 16px 64px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>🎤 Pitch de Defesa</div>
              <button onClick={() => setShowPitch(false)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>
            <pre style={{ background: '#080f1f', borderRadius: 8, padding: 16, color: C.text, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: "'Calibri','Segoe UI',sans-serif", border: `1px solid ${C.border}`, maxHeight: 400, overflowY: 'auto' }}>
              {gerarPitch()}
            </pre>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => navigator.clipboard.writeText(gerarPitch())}
                style={{ padding: '8px 18px', borderRadius: 7, border: `1px solid ${C.accentBorder}`, background: C.accentBg, color: C.accent, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                📋 Copiar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
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
  const l = r.toLowerCase()
  if (l.includes('aprovad') || l.includes('recomend')) return '#4ade80'
  if (l.includes('restri') || l.includes('parcial') || l.includes('anális')) return '#fb923c'
  return '#f87171'
}
