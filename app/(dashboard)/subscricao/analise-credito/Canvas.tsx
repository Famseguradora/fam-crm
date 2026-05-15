'use client'

import { useEffect, useRef, useState } from 'react'
import type { Tomador } from './FilaTomadores'

export interface Indicador {
  nome: string
  valor: number | string
  unidade?: string
  status?: 'Otimo' | 'Bom' | 'Razoavel' | 'Insatisfatorio'
  educacional?: {
    formula: string
    valores_usados: string
    interpretacao: string
    benchmark_fam: string
    status: string
  }
}

export interface CanvasData {
  indicadores?: Indicador[]
  blocos?: Array<{ type: string; content: string; level?: number }>
  rating_fam?: string
  limite_sugerido?: number
}

interface Props {
  tomador: Tomador | null
  data: CanvasData | null
  onSalvar: (markdown: string) => void
}

const c = {
  bg: '#060b18',
  card: '#0d1428',
  border: 'rgba(255,255,255,0.08)',
  text: 'rgba(255,255,255,0.85)',
  muted: 'rgba(255,255,255,0.35)',
  accent: '#38bdf8',
  accentBg: 'rgba(56,189,248,0.08)',
  accentBorder: 'rgba(56,189,248,0.2)',
  success: '#4ade80',
  successBg: 'rgba(74,222,128,0.08)',
  warning: '#fb923c',
  warningBg: 'rgba(251,146,60,0.08)',
  danger: '#f87171',
  dangerBg: 'rgba(248,113,113,0.08)',
  purple: '#a78bfa',
}

function statusColor(s?: string) {
  if (s === 'Otimo') return { color: '#4ade80', bg: 'rgba(74,222,128,0.1)' }
  if (s === 'Bom') return { color: '#38bdf8', bg: 'rgba(56,189,248,0.1)' }
  if (s === 'Razoavel') return { color: '#fb923c', bg: 'rgba(251,146,60,0.1)' }
  if (s === 'Insatisfatorio') return { color: '#f87171', bg: 'rgba(248,113,113,0.1)' }
  return { color: c.muted, bg: 'rgba(255,255,255,0.05)' }
}

function ratingColor(r?: string) {
  if (!r) return c.muted
  if (['AAA', 'AA', 'A'].includes(r)) return '#4ade80'
  if (['BBB', 'BB'].includes(r)) return '#38bdf8'
  if (r === 'B') return '#fb923c'
  if (['CCC', 'CC', 'C'].includes(r)) return '#f87171'
  return '#ef4444'
}

function IndicadorCard({ ind }: { ind: Indicador }) {
  const [hovered, setHovered] = useState(false)
  const sc = statusColor(ind.status)

  return (
    <div style={{ position: 'relative', background: c.card, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: '10px 12px', minWidth: 130 }}>
      <div style={{ fontSize: 11, color: c.muted, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ind.nome}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: sc.color }}>{ind.valor}</span>
        {ind.unidade && <span style={{ fontSize: 10, color: c.muted }}>{ind.unidade}</span>}
      </div>
      {ind.status && (
        <div style={{ marginTop: 4, fontSize: 9, padding: '1px 6px', borderRadius: 10, background: sc.bg, color: sc.color, display: 'inline-block', fontWeight: 600 }}>
          {ind.status}
        </div>
      )}
      {ind.educacional && (
        <span
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{ position: 'absolute', top: 8, right: 8, fontSize: 12, color: c.accent, cursor: 'help', lineHeight: 1 }}
        >
          ⓘ
        </span>
      )}
      {hovered && ind.educacional && (
        <div style={{
          position: 'absolute', top: 0, right: 28, zIndex: 50,
          background: '#1a2a44', border: `1px solid ${c.accentBorder}`, borderRadius: 8,
          padding: 12, width: 240, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.accent, marginBottom: 8 }}>{ind.nome}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Fórmula', val: ind.educacional.formula },
              { label: 'Valores', val: ind.educacional.valores_usados },
              { label: 'Interpretação', val: ind.educacional.interpretacao },
              { label: 'Benchmark FAM', val: ind.educacional.benchmark_fam },
              { label: 'Status', val: ind.educacional.status },
            ].map(({ label, val }) => (
              <div key={label}>
                <div style={{ fontSize: 9, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 1 }}>{label}</div>
                <div style={{ fontSize: 11, color: c.text, lineHeight: 1.4 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Canvas({ tomador, data, onSalvar }: Props) {
  const [conteudo, setConteudo] = useState('')
  const salvando = useRef(false)

  useEffect(() => {
    if (!data?.blocos?.length) return
    const md = data.blocos.map(b => {
      if (b.type === 'heading') return `${'#'.repeat(b.level ?? 2)} ${b.content}`
      if (b.type === 'bulletListItem') return `- ${b.content}`
      return b.content
    }).join('\n\n')
    setConteudo(md)
  }, [data])

  function handleSalvar() {
    if (salvando.current) return
    salvando.current = true
    onSalvar(conteudo)
    salvando.current = false
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: c.bg, minWidth: 0, height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          {tomador
            ? <span style={{ fontSize: 14, fontWeight: 600, color: c.text }}>{tomador.razao_social}</span>
            : <span style={{ fontSize: 13, color: c.muted }}>Selecione um tomador para iniciar</span>
          }
          {data?.rating_fam && (
            <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 700, color: ratingColor(data.rating_fam), background: 'rgba(0,0,0,0.3)', padding: '1px 8px', borderRadius: 4, border: `0.5px solid ${ratingColor(data.rating_fam)}40` }}>
              {data.rating_fam}
            </span>
          )}
          {data?.limite_sugerido != null && (
            <span style={{ marginLeft: 8, fontSize: 11, color: c.muted }}>
              Limite: <span style={{ color: c.accent }}>R$ {Number(data.limite_sugerido).toLocaleString('pt-BR')}</span>
            </span>
          )}
        </div>
        <button
          onClick={() => window.print()}
          style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: c.muted, border: `0.5px solid ${c.border}` }}
        >
          ↓ PDF
        </button>
        <button
          onClick={handleSalvar}
          disabled={!tomador}
          style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: tomador ? 'pointer' : 'not-allowed', background: tomador ? c.accentBg : 'rgba(255,255,255,0.03)', color: tomador ? c.accent : c.muted, border: `0.5px solid ${tomador ? c.accentBorder : c.border}` }}
        >
          Salvar
        </button>
      </div>

      {/* Indicadores */}
      {data?.indicadores && data.indicadores.length > 0 && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c.border}`, overflowX: 'auto', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 10, minWidth: 'max-content' }}>
            {data.indicadores.map(ind => (
              <IndicadorCard key={ind.nome} ind={ind} />
            ))}
          </div>
        </div>
      )}

      {/* Editor */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        <textarea
          value={conteudo}
          onChange={e => setConteudo(e.target.value)}
          placeholder="A análise aparecerá aqui após perguntar ao assistente..."
          style={{
            width: '100%', height: '100%', minHeight: 300,
            background: 'transparent', border: 'none', outline: 'none',
            color: c.text, fontSize: 13, lineHeight: 1.7,
            fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  )
}
