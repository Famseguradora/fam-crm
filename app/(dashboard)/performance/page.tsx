'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

// ── Types ──────────────────────────────────────────────────────────────────────

interface RawOperacao {
  id: string
  created_at: string
  status: string | null
  premio_previsto: number | null
  lmg: number | null
  temperatura: string | null
  prioridade: string | null
  modalidade: string | null
  tomador_id: string | null
  corretora: { id: string; razao_social: string } | null
}

interface RawTomador {
  id: string
  created_at: string
  status: string | null
  porte: string | null
}

// ── Indicators config ──────────────────────────────────────────────────────────

const INDICADORES = [
  { id: 'novas_operacoes',     bloco: 'producao',   label: 'Novas Operações',            icon: '📋' },
  { id: 'ops_emitidas',        bloco: 'producao',   label: 'Operações Emitidas',          icon: '✅' },
  { id: 'ops_recusadas',       bloco: 'producao',   label: 'Operações Recusadas/Perdidas',icon: '❌' },
  { id: 'premio_total',        bloco: 'financeiro', label: 'Prêmio Previsto Total',       icon: '💰' },
  { id: 'lmg_total',           bloco: 'financeiro', label: 'LMG Total',                  icon: '📊' },
  { id: 'ticket_medio',        bloco: 'financeiro', label: 'Ticket Médio (LMG/Op.)',      icon: '🎯' },
  { id: 'taxa_aprovacao',      bloco: 'eficiencia', label: 'Taxa de Aprovação',           icon: '📈' },
  { id: 'taxa_perda',          bloco: 'eficiencia', label: 'Taxa de Perda',               icon: '📉' },
  { id: 'temperatura',         bloco: 'pipeline',   label: 'Temperatura do Pipeline',     icon: '🌡' },
  { id: 'prioridade',          bloco: 'pipeline',   label: 'Prioridade da Fila',          icon: '⚡' },
  { id: 'funil_texto',         bloco: 'pipeline',   label: 'Etapas do Funil',             icon: '🔻' },
  { id: 'novos_tomadores',     bloco: 'carteira',   label: 'Novos Tomadores',             icon: '👥' },
  { id: 'tomadores_ativos',    bloco: 'carteira',   label: 'Tomadores Ativos no Período', icon: '✨' },
  { id: 'porte_tomadores',     bloco: 'carteira',   label: 'Porte dos Tomadores',         icon: '🏢' },
  { id: 'grafico_funil',       bloco: 'graficos',   label: 'Gráfico — Funil de Conversão',icon: '📊' },
  { id: 'grafico_modalidades', bloco: 'graficos',   label: 'Gráfico — Mix de Modalidades',icon: '📊' },
  { id: 'grafico_corretoras',  bloco: 'graficos',   label: 'Gráfico — Top Corretoras',   icon: '📊' },
] as const

type IndicadorId = typeof INDICADORES[number]['id']
type IndicadoresState = Record<IndicadorId, boolean>

const STORAGE_KEY = 'fam-performance-indicadores'
const DEFAULT_STATE: IndicadoresState = Object.fromEntries(
  INDICADORES.map(i => [i.id, true])
) as IndicadoresState

// ── Period helpers ─────────────────────────────────────────────────────────────

type PeriodoTipo = 'semanal' | 'mensal' | 'semestral' | 'anual' | 'personalizado'

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function getPeriodo(tipo: PeriodoTipo, customInicio: string, customFim: string): { inicio: Date; fim: Date } {
  const hoje = new Date()
  hoje.setHours(23, 59, 59, 999)
  switch (tipo) {
    case 'semanal': {
      const ini = new Date(hoje); ini.setDate(ini.getDate() - 6); ini.setHours(0, 0, 0, 0)
      return { inicio: ini, fim: new Date(hoje) }
    }
    case 'mensal': {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0, 0)
      return { inicio: ini, fim: new Date(hoje) }
    }
    case 'semestral': {
      const ini = new Date(hoje); ini.setMonth(ini.getMonth() - 6); ini.setHours(0, 0, 0, 0)
      return { inicio: ini, fim: new Date(hoje) }
    }
    case 'anual': {
      const ini = new Date(hoje.getFullYear(), 0, 1, 0, 0, 0, 0)
      return { inicio: ini, fim: new Date(hoje) }
    }
    case 'personalizado': {
      return {
        inicio: new Date(customInicio + 'T00:00:00'),
        fim: new Date(customFim + 'T23:59:59'),
      }
    }
  }
}

function getPeriodoAnterior(inicio: Date, fim: Date): { inicio: Date; fim: Date } {
  const dur = fim.getTime() - inicio.getTime()
  const fimAnt = new Date(inicio.getTime() - 1)
  return { inicio: new Date(fimAnt.getTime() - dur), fim: fimAnt }
}

function inRange(dateStr: string, inicio: Date, fim: Date): boolean {
  const d = new Date(dateStr)
  return d >= inicio && d <= fim
}

function fmtPeriodoLabel(inicio: Date, fim: Date): string {
  return `${inicio.toLocaleDateString('pt-BR')} – ${fim.toLocaleDateString('pt-BR')}`
}

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtBRL(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function fmtNum(v: number): string {
  return new Intl.NumberFormat('pt-BR').format(v)
}

interface Delta { pct: number; sinal: '↑' | '↓' | '→'; cor: string }

function calcDelta(curr: number, prev: number): Delta | null {
  if (curr === 0 && prev === 0) return null
  if (prev === 0) return { pct: 100, sinal: '↑', cor: '#16a34a' }
  const pct = ((curr - prev) / Math.abs(prev)) * 100
  if (Math.abs(pct) < 0.5) return { pct: 0, sinal: '→', cor: '#6080a0' }
  return { pct: Math.abs(pct), sinal: pct > 0 ? '↑' : '↓', cor: pct > 0 ? '#16a34a' : '#d64545' }
}

// For rates like taxaAprovacao, delta semantics invert for taxaPerda
function calcDeltaRate(curr: number, prev: number, higherIsBetter = true): Delta | null {
  const d = calcDelta(curr, prev)
  if (!d) return null
  if (!higherIsBetter) {
    return { ...d, sinal: d.sinal === '↑' ? '↓' : d.sinal === '↓' ? '↑' : '→', cor: d.cor === '#16a34a' ? '#d64545' : d.cor === '#d64545' ? '#16a34a' : '#6080a0' }
  }
  return d
}

// ── Style constants ────────────────────────────────────────────────────────────

const cardBase: React.CSSProperties = {
  background: 'white',
  borderRadius: 12,
  padding: '18px 20px',
  boxShadow: '0 2px 12px rgba(30,64,128,.08)',
  border: '1px solid #dde8f4',
}

const kpiLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#6080a0',
  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6,
}

const AZUIS  = ['#1e4080','#2255a4','#3070c8','#4a90d8','#6ab0e8','#8acaf8','#aadaff','#c0e8ff']
const VERDES = ['#065f46','#047857','#15803d','#16a34a','#22c55e','#4ade80','#86efac','#bbf7d0']

const FUNIL_STATUS = ['Triagem','Documentação','Em Análise','Subscrição','Comitê','Aprovado','Emitido']
const FUNIL_CORES  = ['#3070c8','#2255a4','#1e4080','#e8b84b','#d4a030','#16a34a','#047857']

const TEMP_CONFIG = [
  { key: 'Quente', cor: '#d64545', bg: '#fef2f2' },
  { key: 'Morno',  cor: '#e8b84b', bg: '#fffbeb' },
  { key: 'Frio',   cor: '#3070c8', bg: '#eff6ff' },
]

const PRIO_CONFIG = [
  { key: 'Urgente',      cor: '#d64545', bg: '#fef2f2' },
  { key: 'Prioridade',   cor: '#e8b84b', bg: '#fffbeb' },
  { key: 'Fluxo Normal', cor: '#16a34a', bg: '#f0fdf4' },
]

const PORTE_CORES: Record<string, string> = {
  'Pequeno': '#3070c8', 'Médio': '#e8b84b', 'Grande': '#16a34a',
  'Micro': '#6ab0e8', 'Não informado': '#a0b8d0',
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionTitle({ icon, label, cor }: { icon: string; label: string; cor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: '#102040', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
        {icon} {label}
      </span>
    </div>
  )
}

function KPICard({
  label, value, delta, accent = '#2255a4', isBRL = false,
}: {
  label: string
  value: string
  delta: Delta | null
  accent?: string
  isBRL?: boolean
}) {
  return (
    <div style={{ ...cardBase, borderTop: `3px solid ${accent}` }}>
      <div style={kpiLabel}>{label}</div>
      <div style={{ fontSize: isBRL ? 15 : 22, fontWeight: 800, color: '#102040', lineHeight: 1.2 }}>{value}</div>
      {delta ? (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          <span style={{ color: delta.cor, fontWeight: 700 }}>{delta.sinal} {delta.pct.toFixed(1)}%</span>
          <span style={{ color: '#a0b8d0' }}>vs período anterior</span>
        </div>
      ) : (
        <div style={{ marginTop: 6, fontSize: 11, color: '#a0b8d0' }}>Sem dados anteriores</div>
      )}
    </div>
  )
}

function BreakdownBar({ items, total }: { items: { key: string; value: number; cor: string; bg: string }[]; total: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(({ key, value, cor, bg }) => {
        const pct = total > 0 ? (value / total) * 100 : 0
        return (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: '#304060' }}>{key}</span>
              <span style={{ color: '#6080a0' }}>{fmtNum(value)} ({pct.toFixed(0)}%)</span>
            </div>
            <div style={{ height: 6, background: '#eef2f8', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 3, transition: 'width .4s' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const supabase = createClient()

  const [loading, setLoading]           = useState(true)
  const [operacoes, setOperacoes]       = useState<RawOperacao[]>([])
  const [tomadores, setTomadores]       = useState<RawTomador[]>([])
  const [mounted, setMounted]           = useState(false)
  const [periodo, setPeriodo]           = useState<PeriodoTipo>('mensal')
  const hoje                            = toDateStr(new Date())
  const [customInicio, setCustomInicio] = useState(hoje)
  const [customFim, setCustomFim]       = useState(hoje)
  const [indicadores, setIndicadores]   = useState<IndicadoresState>(DEFAULT_STATE)
  const [drawerOpen, setDrawerOpen]     = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setIndicadores({ ...DEFAULT_STATE, ...JSON.parse(saved) })
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    async function carregar() {
      setLoading(true)
      const [{ data: ops }, { data: toms }] = await Promise.all([
        supabase.from('operacoes').select(
          'id, created_at, status, premio_previsto, lmg, temperatura, prioridade, modalidade, tomador_id, corretora:corretoras(id,razao_social)'
        ),
        supabase.from('tomadores').select('id, created_at, status, porte'),
      ])
      setOperacoes((ops ?? []) as unknown as RawOperacao[])
      setTomadores((toms ?? []) as RawTomador[])
      setLoading(false)
    }
    carregar()
  }, [])

  function toggleIndicador(id: IndicadorId) {
    setIndicadores(prev => {
      const next = { ...prev, [id]: !prev[id] }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  // ── Compute metrics ──────────────────────────────────────────────────────────

  const m = useMemo(() => {
    const { inicio, fim } = getPeriodo(periodo, customInicio, customFim)
    const { inicio: iniAnt, fim: fimAnt } = getPeriodoAnterior(inicio, fim)

    const opsA  = operacoes.filter(o => inRange(o.created_at, inicio, fim))
    const opsB  = operacoes.filter(o => inRange(o.created_at, iniAnt, fimAnt))
    const tomsA = tomadores.filter(t => inRange(t.created_at, inicio, fim))
    const tomsB = tomadores.filter(t => inRange(t.created_at, iniAnt, fimAnt))

    // Bloco 1 — Produção
    const novasOps    = opsA.length
    const emitidas    = opsA.filter(o => o.status === 'Emitido').length
    const recusadas   = opsA.filter(o => ['Recusado','Perdido'].includes(o.status ?? '')).length
    const novasOpsB   = opsB.length
    const emitidasB   = opsB.filter(o => o.status === 'Emitido').length
    const recusadasB  = opsB.filter(o => ['Recusado','Perdido'].includes(o.status ?? '')).length

    // Bloco 2 — Financeiro
    const premioTotal   = opsA.reduce((s, o) => s + (o.premio_previsto ?? 0), 0)
    const lmgTotal      = opsA.reduce((s, o) => s + (o.lmg ?? 0), 0)
    const ticketMedio   = novasOps > 0 ? lmgTotal / novasOps : 0
    const premioTotalB  = opsB.reduce((s, o) => s + (o.premio_previsto ?? 0), 0)
    const lmgTotalB     = opsB.reduce((s, o) => s + (o.lmg ?? 0), 0)
    const ticketMedioB  = novasOpsB > 0 ? lmgTotalB / novasOpsB : 0

    // Bloco 3 — Eficiência
    const txAprov   = novasOps  > 0 ? (emitidas  / novasOps)  * 100 : 0
    const txPerda   = novasOps  > 0 ? (recusadas / novasOps)  * 100 : 0
    const txAprovB  = novasOpsB > 0 ? (emitidasB / novasOpsB) * 100 : 0
    const txPerdaB  = novasOpsB > 0 ? (recusadasB / novasOpsB)* 100 : 0

    // Bloco 4 — Pipeline
    const tempCount: Record<string, number> = { 'Quente': 0, 'Morno': 0, 'Frio': 0 }
    const prioCount: Record<string, number> = { 'Urgente': 0, 'Prioridade': 0, 'Fluxo Normal': 0 }
    for (const o of opsA) {
      if (o.temperatura && o.temperatura in tempCount) tempCount[o.temperatura]++
      if (o.prioridade  && o.prioridade  in prioCount) prioCount[o.prioridade]++
    }

    const funilData = FUNIL_STATUS.map((s, i) => ({
      name: s,
      value: opsA.filter(o => o.status === s).length,
      fill: FUNIL_CORES[i],
    }))

    // Bloco 5 — Carteira
    const novosToms     = tomsA.length
    const nomsTomsB     = tomsB.length
    const ativoIds      = new Set(opsA.map(o => o.tomador_id).filter(Boolean))
    const ativoIdsB     = new Set(opsB.map(o => o.tomador_id).filter(Boolean))
    const tomAtivos     = ativoIds.size
    const tomAtivosB    = ativoIdsB.size

    const porteCount: Record<string, number> = {}
    for (const t of tomsA) {
      const p = t.porte ?? 'Não informado'
      porteCount[p] = (porteCount[p] ?? 0) + 1
    }

    // Bloco 6 — Gráficos
    const modCount: Record<string, number> = {}
    for (const o of opsA) {
      const m = o.modalidade ?? 'Não informada'
      modCount[m] = (modCount[m] ?? 0) + 1
    }
    const topModalidades = Object.entries(modCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([nome, valor]) => ({ nome: nome.length > 20 ? nome.slice(0, 18) + '…' : nome, valor }))
      .reverse()

    const corretoraPremio: Record<string, number> = {}
    for (const o of opsA) {
      const nome = (o.corretora as { razao_social: string } | null)?.razao_social ?? 'Sem Corretora'
      corretoraPremio[nome] = (corretoraPremio[nome] ?? 0) + (o.premio_previsto ?? 0)
    }
    const topCorretoras = Object.entries(corretoraPremio)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([nome, valor]) => ({ nome: nome.length > 24 ? nome.slice(0, 22) + '…' : nome, valor }))
      .reverse()

    return {
      periodoLabel: fmtPeriodoLabel(inicio, fim),
      novasOps, emitidas, recusadas, novasOpsB, emitidasB, recusadasB,
      premioTotal, lmgTotal, ticketMedio, premioTotalB, lmgTotalB, ticketMedioB,
      txAprov, txPerda, txAprovB, txPerdaB,
      tempCount, prioCount, funilData,
      novosToms, nomsTomsB, tomAtivos, tomAtivosB,
      porteCount,
      topModalidades, topCorretoras,
      totalOpsA: novasOps,
      totalTomsA: tomsA.length,
    }
  }, [operacoes, tomadores, periodo, customInicio, customFim])

  // ── Render ───────────────────────────────────────────────────────────────────

  const ind = indicadores
  const show = (id: IndicadorId) => ind[id]

  const PERIODO_BTNS: { label: string; value: PeriodoTipo }[] = [
    { label: 'Semanal',     value: 'semanal' },
    { label: 'Mensal',      value: 'mensal' },
    { label: 'Semestral',   value: 'semestral' },
    { label: 'Anual',       value: 'anual' },
    { label: '📅 Datas',    value: 'personalizado' },
  ]

  return (
    <div style={{ fontFamily: "'Calibri','Segoe UI',sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#102040' }}>Performance</div>
          <div style={{ fontSize: 12, color: '#6080a0', marginTop: 3 }}>
            {loading ? 'Carregando…' : `Período: ${m.periodoLabel}`}
          </div>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          style={{
            background: '#f0f6ff', border: '1px solid #c0d4e8', color: '#2255a4',
            borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}
        >
          ⚙ Configurar Indicadores
        </button>
      </div>

      {/* ── Period selector ── */}
      <div style={{
        display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
        background: 'white', borderRadius: 10, padding: '10px 14px',
        border: '1px solid #dde8f4', marginBottom: 20, boxShadow: '0 1px 6px rgba(30,64,128,.06)',
      }}>
        {PERIODO_BTNS.map(btn => {
          const active = periodo === btn.value
          return (
            <button
              key={btn.value}
              onClick={() => setPeriodo(btn.value)}
              style={{
                padding: '6px 18px', borderRadius: 7, border: 'none', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all .15s',
                background: active ? '#0a1628' : '#f0f4f8',
                color: active ? 'white' : '#304060',
              }}
            >
              {btn.label}
            </button>
          )
        })}
        {periodo === 'personalizado' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8, flexWrap: 'wrap' }}>
            <input
              type="date" value={customInicio}
              onChange={e => setCustomInicio(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #c0d4e8', fontSize: 13, color: '#304060', background: '#f8faff' }}
            />
            <span style={{ color: '#6080a0', fontSize: 13 }}>até</span>
            <input
              type="date" value={customFim} min={customInicio}
              onChange={e => setCustomFim(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #c0d4e8', fontSize: 13, color: '#304060', background: '#f8faff' }}
            />
          </div>
        )}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#6080a0', fontSize: 16, gap: 12 }}>
          <span style={{ fontSize: 24 }}>📊</span> Carregando indicadores…
        </div>
      )}

      {!loading && (
        <>
          {/* ════════════════════════════════════════════
              BLOCO 1 — PRODUÇÃO
          ════════════════════════════════════════════ */}
          {(show('novas_operacoes') || show('ops_emitidas') || show('ops_recusadas')) && (
            <div style={{ marginBottom: 28 }}>
              <SectionTitle icon="📋" label="Produção" cor="#2255a4" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                {show('novas_operacoes') && (
                  <KPICard
                    label="Novas Operações"
                    value={fmtNum(m.novasOps)}
                    delta={calcDelta(m.novasOps, m.novasOpsB)}
                    accent="#2255a4"
                  />
                )}
                {show('ops_emitidas') && (
                  <KPICard
                    label="Operações Emitidas"
                    value={fmtNum(m.emitidas)}
                    delta={calcDelta(m.emitidas, m.emitidasB)}
                    accent="#16a34a"
                  />
                )}
                {show('ops_recusadas') && (
                  <KPICard
                    label="Recusadas / Perdidas"
                    value={fmtNum(m.recusadas)}
                    delta={calcDeltaRate(m.recusadas, m.recusadasB, false)}
                    accent="#d64545"
                  />
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════
              BLOCO 2 — FINANCEIRO
          ════════════════════════════════════════════ */}
          {(show('premio_total') || show('lmg_total') || show('ticket_medio')) && (
            <div style={{ marginBottom: 28 }}>
              <SectionTitle icon="💰" label="Financeiro" cor="#e8b84b" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                {show('premio_total') && (
                  <KPICard
                    label="Prêmio Previsto Total"
                    value={fmtBRL(m.premioTotal)}
                    delta={calcDelta(m.premioTotal, m.premioTotalB)}
                    accent="#e8b84b"
                    isBRL
                  />
                )}
                {show('lmg_total') && (
                  <KPICard
                    label="LMG Total"
                    value={fmtBRL(m.lmgTotal)}
                    delta={calcDelta(m.lmgTotal, m.lmgTotalB)}
                    accent="#e8b84b"
                    isBRL
                  />
                )}
                {show('ticket_medio') && (
                  <KPICard
                    label="Ticket Médio (LMG / Op.)"
                    value={fmtBRL(m.ticketMedio)}
                    delta={calcDelta(m.ticketMedio, m.ticketMedioB)}
                    accent="#e8b84b"
                    isBRL
                  />
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════
              BLOCO 3 — EFICIÊNCIA
          ════════════════════════════════════════════ */}
          {(show('taxa_aprovacao') || show('taxa_perda')) && (
            <div style={{ marginBottom: 28 }}>
              <SectionTitle icon="📈" label="Eficiência" cor="#16a34a" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                {show('taxa_aprovacao') && (
                  <div style={{ ...cardBase, borderTop: '3px solid #16a34a' }}>
                    <div style={kpiLabel}>Taxa de Aprovação</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                      <div style={{ fontSize: 36, fontWeight: 900, color: '#16a34a', lineHeight: 1 }}>
                        {m.txAprov.toFixed(1)}%
                      </div>
                      <div style={{ marginBottom: 4 }}>
                        {calcDeltaRate(m.txAprov, m.txAprovB, true) && (() => {
                          const d = calcDeltaRate(m.txAprov, m.txAprovB, true)!
                          return <span style={{ fontSize: 12, fontWeight: 700, color: d.cor }}>{d.sinal} {d.pct.toFixed(1)}%</span>
                        })()}
                      </div>
                    </div>
                    <div style={{ marginTop: 10, height: 8, background: '#eef2f8', borderRadius: 4 }}>
                      <div style={{ height: '100%', width: `${Math.min(m.txAprov, 100)}%`, background: '#16a34a', borderRadius: 4, transition: 'width .4s' }} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: '#6080a0' }}>{m.emitidas} emitidas de {m.novasOps} operações</div>
                  </div>
                )}
                {show('taxa_perda') && (
                  <div style={{ ...cardBase, borderTop: '3px solid #d64545' }}>
                    <div style={kpiLabel}>Taxa de Perda</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                      <div style={{ fontSize: 36, fontWeight: 900, color: '#d64545', lineHeight: 1 }}>
                        {m.txPerda.toFixed(1)}%
                      </div>
                      <div style={{ marginBottom: 4 }}>
                        {calcDeltaRate(m.txPerda, m.txPerdaB, false) && (() => {
                          const d = calcDeltaRate(m.txPerda, m.txPerdaB, false)!
                          return <span style={{ fontSize: 12, fontWeight: 700, color: d.cor }}>{d.sinal} {d.pct.toFixed(1)}%</span>
                        })()}
                      </div>
                    </div>
                    <div style={{ marginTop: 10, height: 8, background: '#eef2f8', borderRadius: 4 }}>
                      <div style={{ height: '100%', width: `${Math.min(m.txPerda, 100)}%`, background: '#d64545', borderRadius: 4, transition: 'width .4s' }} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: '#6080a0' }}>{m.recusadas} recusadas/perdidas de {m.novasOps} operações</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════
              BLOCO 4 — PIPELINE
          ════════════════════════════════════════════ */}
          {(show('temperatura') || show('prioridade') || show('funil_texto')) && (
            <div style={{ marginBottom: 28 }}>
              <SectionTitle icon="🔻" label="Pipeline" cor="#3070c8" />
              <div style={{
                display: 'grid',
                gridTemplateColumns: [show('temperatura'), show('prioridade'), show('funil_texto')].filter(Boolean).length === 3
                  ? 'repeat(3,1fr)' : [show('temperatura'), show('prioridade'), show('funil_texto')].filter(Boolean).length === 2
                  ? 'repeat(2,1fr)' : '1fr',
                gap: 14,
              }}>
                {show('temperatura') && (
                  <div style={cardBase}>
                    <div style={kpiLabel}>🌡 Temperatura do Pipeline</div>
                    <BreakdownBar
                      total={m.novasOps}
                      items={TEMP_CONFIG.map(t => ({ key: t.key, value: m.tempCount[t.key] ?? 0, cor: t.cor, bg: t.bg }))}
                    />
                  </div>
                )}
                {show('prioridade') && (
                  <div style={cardBase}>
                    <div style={kpiLabel}>⚡ Prioridade da Fila</div>
                    <BreakdownBar
                      total={m.novasOps}
                      items={PRIO_CONFIG.map(p => ({ key: p.key, value: m.prioCount[p.key] ?? 0, cor: p.cor, bg: p.bg }))}
                    />
                  </div>
                )}
                {show('funil_texto') && (
                  <div style={cardBase}>
                    <div style={kpiLabel}>🔻 Etapas do Funil</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {m.funilData.map((item, i) => (
                        <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 2, background: FUNIL_CORES[i], flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: '#304060', flex: 1 }}>{item.name}</span>
                          <span style={{
                            fontSize: 12, fontWeight: 700, color: 'white',
                            background: FUNIL_CORES[i], borderRadius: 5,
                            padding: '1px 8px', minWidth: 28, textAlign: 'center',
                          }}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════
              BLOCO 5 — CARTEIRA
          ════════════════════════════════════════════ */}
          {(show('novos_tomadores') || show('tomadores_ativos') || show('porte_tomadores')) && (
            <div style={{ marginBottom: 28 }}>
              <SectionTitle icon="👥" label="Carteira" cor="#6030a0" />
              <div style={{
                display: 'grid',
                gridTemplateColumns: [show('novos_tomadores'), show('tomadores_ativos'), show('porte_tomadores')].filter(Boolean).length === 3
                  ? 'repeat(3,1fr)' : [show('novos_tomadores'), show('tomadores_ativos'), show('porte_tomadores')].filter(Boolean).length === 2
                  ? 'repeat(2,1fr)' : '1fr',
                gap: 14,
              }}>
                {show('novos_tomadores') && (
                  <KPICard
                    label="Novos Tomadores Cadastrados"
                    value={fmtNum(m.novosToms)}
                    delta={calcDelta(m.novosToms, m.nomsTomsB)}
                    accent="#6030a0"
                  />
                )}
                {show('tomadores_ativos') && (
                  <KPICard
                    label="Tomadores com Operação no Período"
                    value={fmtNum(m.tomAtivos)}
                    delta={calcDelta(m.tomAtivos, m.tomAtivosB)}
                    accent="#6030a0"
                  />
                )}
                {show('porte_tomadores') && (
                  <div style={cardBase}>
                    <div style={kpiLabel}>🏢 Porte dos Tomadores (novos)</div>
                    {Object.keys(m.porteCount).length === 0 ? (
                      <div style={{ fontSize: 13, color: '#a0b8d0', marginTop: 8 }}>Sem dados no período</div>
                    ) : (
                      <BreakdownBar
                        total={m.novosToms}
                        items={Object.entries(m.porteCount).map(([key, value]) => ({
                          key, value,
                          cor: PORTE_CORES[key] ?? '#a0b8d0',
                          bg: '#f0f6ff',
                        }))}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════
              BLOCO 6 — GRÁFICOS
          ════════════════════════════════════════════ */}
          {(show('grafico_funil') || show('grafico_modalidades') || show('grafico_corretoras')) && (
            <div style={{ marginBottom: 28 }}>
              <SectionTitle icon="📊" label="Gráficos" cor="#1e4080" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {show('grafico_funil') && (
                  <div style={cardBase}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#102040', marginBottom: 16 }}>
                      Funil de Conversão — Operações por Etapa
                    </div>
                    {!mounted || m.funilData.every(d => d.value === 0) ? (
                      <div style={{ textAlign: 'center', color: '#a0b8d0', padding: '36px 0', fontSize: 13 }}>Sem dados no período</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={m.funilData} margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#304060' }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => [v, 'Operações']} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {m.funilData.map((entry, idx) => (
                              <Cell key={idx} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: show('grafico_modalidades') && show('grafico_corretoras') ? '1fr 1fr' : '1fr', gap: 14 }}>
                  {show('grafico_modalidades') && (
                    <div style={cardBase}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#102040', marginBottom: 16 }}>
                        Mix de Modalidades (por n.º de Operações)
                      </div>
                      {!mounted || m.topModalidades.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#a0b8d0', padding: '36px 0', fontSize: 13 }}>Sem dados no período</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={Math.max(m.topModalidades.length * 38, 80)}>
                          <BarChart data={m.topModalidades} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                            <XAxis type="number" allowDecimals={false} hide />
                            <YAxis type="category" dataKey="nome" width={155} tick={{ fontSize: 11, fill: '#304060' }} />
                            <Tooltip formatter={(v) => [v, 'Operações']} />
                            <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                              {m.topModalidades.map((_, idx) => (
                                <Cell key={idx} fill={AZUIS[idx % AZUIS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  )}

                  {show('grafico_corretoras') && (
                    <div style={cardBase}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#102040', marginBottom: 16 }}>
                        Top 5 Corretoras por Prêmio Previsto
                      </div>
                      {!mounted || m.topCorretoras.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#a0b8d0', padding: '36px 0', fontSize: 13 }}>Sem dados no período</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={Math.max(m.topCorretoras.length * 44, 80)}>
                          <BarChart data={m.topCorretoras} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="nome" width={155} tick={{ fontSize: 11, fill: '#304060' }} />
                            <Tooltip formatter={(v) => [fmtBRL(Number(v ?? 0)), 'Prêmio']} />
                            <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                              {m.topCorretoras.map((_, idx) => (
                                <Cell key={idx} fill={VERDES[idx % VERDES.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Empty state ── */}
          {Object.values(indicadores).every(v => !v) && (
            <div style={{ textAlign: 'center', color: '#6080a0', padding: '80px 0', fontSize: 14 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
              Todos os indicadores estão desativados.<br />
              Clique em <strong>⚙ Configurar Indicadores</strong> para reativá-los.
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════
          DRAWER — Configurar Indicadores
      ════════════════════════════════════════════ */}
      {drawerOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            style={{
              width: 360, height: '100%', background: 'white', overflow: 'auto',
              boxShadow: '-4px 0 24px rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #dde8f4',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#0a1628',
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'white' }}>⚙ Configurar Indicadores</div>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{ background: 'none', border: 'none', color: '#a0c0e8', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}
              >×</button>
            </div>
            <div style={{ padding: '12px 16px', fontSize: 12, color: '#6080a0', borderBottom: '1px solid #eef2f8' }}>
              Ative ou desative os indicadores que deseja exibir. Configuração salva automaticamente.
            </div>

            {/* Group by bloco */}
            {(['producao','financeiro','eficiencia','pipeline','carteira','graficos'] as const).map(bloco => {
              const blocoLabel: Record<string, string> = {
                producao: '📋 Produção', financeiro: '💰 Financeiro', eficiencia: '📈 Eficiência',
                pipeline: '🔻 Pipeline', carteira: '👥 Carteira', graficos: '📊 Gráficos',
              }
              const items = INDICADORES.filter(i => i.bloco === bloco)
              return (
                <div key={bloco}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.5px',
                    textTransform: 'uppercase', padding: '14px 24px 6px',
                  }}>
                    {blocoLabel[bloco]}
                  </div>
                  {items.map(item => {
                    const ativo = indicadores[item.id]
                    return (
                      <label
                        key={item.id}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 24px', cursor: 'pointer',
                          background: ativo ? '#f0f6ff' : 'transparent',
                          borderLeft: `3px solid ${ativo ? '#2255a4' : 'transparent'}`,
                          transition: 'all .15s',
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: ativo ? '#1e4080' : '#a0b8d0' }}>
                          {item.icon} {item.label}
                        </span>
                        <div
                          onClick={() => toggleIndicador(item.id)}
                          style={{
                            width: 40, height: 22, borderRadius: 11, flexShrink: 0,
                            background: ativo ? '#2255a4' : '#c0d4e8',
                            position: 'relative', transition: 'background .2s', cursor: 'pointer',
                          }}
                        >
                          <div style={{
                            position: 'absolute', top: 3, left: ativo ? 21 : 3,
                            width: 16, height: 16, borderRadius: '50%',
                            background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,.2)',
                            transition: 'left .2s',
                          }} />
                        </div>
                      </label>
                    )
                  })}
                </div>
              )
            })}

            {/* Drawer footer */}
            <div style={{ marginTop: 'auto', padding: '16px 24px', borderTop: '1px solid #dde8f4', display: 'flex', gap: 10 }}>
              <button
                onClick={() => {
                  const all = Object.fromEntries(INDICADORES.map(i => [i.id, true])) as IndicadoresState
                  setIndicadores(all)
                  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)) } catch { /* ignore */ }
                }}
                style={{ flex: 1, padding: '9px', fontSize: 12, fontWeight: 600, color: '#2255a4', background: '#f0f6ff', border: '1px solid #c0d4e8', borderRadius: 8, cursor: 'pointer' }}
              >
                Mostrar todos
              </button>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{ flex: 1, padding: '9px', fontSize: 13, fontWeight: 700, color: 'white', background: '#0a1628', border: 'none', borderRadius: 8, cursor: 'pointer' }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
