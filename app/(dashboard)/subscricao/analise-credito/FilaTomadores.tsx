'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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
  selecionado: Tomador | null
  onSelect: (t: Tomador) => void
  onRefresh: () => void
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

export default function FilaTomadores({ tomadores, selecionado, onSelect, onRefresh }: Props) {
  const supabase = createClient()
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ razao_social: '', cnpj: '', prioridade: 'Normal' })
  const [salvando, setSalvando] = useState(false)

  const filtrados = tomadores
    .filter(t => t.razao_social.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => prioOrder(a.prioridade) - prioOrder(b.prioridade))

  async function criarTomador() {
    if (!form.razao_social.trim()) return
    setSalvando(true)
    await supabase.from('tomadores').insert({
      razao_social: form.razao_social.trim(),
      cnpj: form.cnpj.trim() || null,
      prioridade: form.prioridade,
    })
    setModal(false)
    setForm({ razao_social: '', cnpj: '', prioridade: 'Normal' })
    setSalvando(false)
    onRefresh()
  }

  return (
    <div style={{ width: 220, minWidth: 220, display: 'flex', flexDirection: 'column', background: c.bg, borderRight: `1px solid ${c.border}`, height: '100%' }}>
      <div style={{ padding: '12px 10px 8px', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: c.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>Fila</span>
          <button
            onClick={() => setModal(true)}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', background: c.accentBg, color: c.accent, border: `0.5px solid ${c.accentBorder}` }}
          >
            + Novo
          </button>
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
                width: '100%', textAlign: 'left', padding: '10px 10px',
                background: ativo ? 'rgba(56,189,248,0.07)' : 'transparent',
                borderLeft: ativo ? `3px solid ${c.accent}` : '3px solid transparent',
                border: 'none', borderBottom: `0.5px solid ${c.border}`,
                cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 8,
              }}
            >
              <div style={{ width: 18, height: 18, borderRadius: 4, background: badge.bg, color: badge.color, border: `0.5px solid ${badge.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                {badge.label}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: ativo ? 'white' : c.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                  {t.razao_social}
                </div>
                {t.cnpj && (
                  <div style={{ fontSize: 10, color: c.muted, marginTop: 2 }}>{t.cnpj}</div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#0d1428', border: `1px solid ${c.border}`, borderRadius: 12, padding: 24, width: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: c.text }}>Novo Tomador</div>
            <input
              value={form.razao_social}
              onChange={e => setForm({ ...form, razao_social: e.target.value })}
              placeholder="Razão Social *"
              style={{ fontSize: 13, padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: c.text, border: `0.5px solid rgba(255,255,255,0.15)`, outline: 'none' }}
            />
            <input
              value={form.cnpj}
              onChange={e => setForm({ ...form, cnpj: e.target.value })}
              placeholder="CNPJ (opcional)"
              style={{ fontSize: 13, padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: c.text, border: `0.5px solid rgba(255,255,255,0.15)`, outline: 'none' }}
            />
            <select
              value={form.prioridade}
              onChange={e => setForm({ ...form, prioridade: e.target.value })}
              style={{ fontSize: 13, padding: '8px 12px', borderRadius: 6, background: '#0d1428', color: c.text, border: `0.5px solid rgba(255,255,255,0.15)`, outline: 'none' }}
            >
              <option value="Normal">Normal</option>
              <option value="Prioridade">Prioridade</option>
              <option value="Urgente">Urgente</option>
            </select>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: c.muted, border: `0.5px solid ${c.border}` }}>Cancelar</button>
              <button onClick={criarTomador} disabled={salvando || !form.razao_social.trim()} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 6, cursor: 'pointer', background: c.accentBg, color: c.accent, border: `0.5px solid ${c.accentBorder}`, opacity: salvando ? 0.6 : 1 }}>
                {salvando ? 'Salvando...' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
