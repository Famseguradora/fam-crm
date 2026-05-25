'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  AreaChart, Area, CartesianGrid, ResponsiveContainer, RadialBarChart, RadialBar,
} from 'recharts'
import { C, fmtBRL, fmtPct, type OperacaoReal, type Filtros } from './types'
import type { useCockpit } from './useCockpit'
import type { Tomador } from '../FilaTomadores'

type CockpitHook = ReturnType<typeof useCockpit>
interface Props { cockpit: CockpitHook; tomador: Tomador }

const META_PREMIO = 1_000_000

const STATUS_COLORS: Record<string, string> = {
  'Aprovado': '#4ade80',
  'Em Análise': '#38bdf8',
  'Recusado': '#f87171',
  'Aguardando': '#fb923c',
}

const MODAL_COLORS = ['#38bdf8', '#e8b84b', '#a78bfa', '#4ade80', '#fb923c', '#f87171']

export default function PainelDashboardBP({ cockpit, tomador }: Props) {
  const supabase = createClient()
  const [operacoes, setOperacoes] = useState<OperacaoReal[]>([])
  const [loading, setLoading] = useState(true)
  const filtros = cockpit.filtrosBP
  const setFiltros = cockpit.setFiltrosBP

  useEffect(() => {
    carregarOperacoes()
  }, [])

  async function carregarOperacoes() {
    setLoading(true)
    const { data } = await supabase
      .from('operacoes')
      .select('id, tomador_id, tomadores(razao_social), modalidade, lmg, taxa, vigencia_anos, premio_previsto, status, data_entrada')
      .eq('ativo', true)
      .order('data_entrada', { ascending: false })
    setOperacoes((data as unknown as OperacaoReal[]) || [])
    setLoading(false)
  }

  // Combine real + manual
  const todasOps = useMemo(() => {
    const manuais = cockpit.bookManual.map(b => ({
      id: b.id,
      tomador_id: null,
      tomadores: { razao_social: b.tomador_nome },
      modalidade: b.modalidade || 'Manual',
      lmg: b.lmg || 0,
      taxa: b.taxa || 0,
      vigencia_anos: (b.vigencia_meses || 12) / 12,
      premio_previsto: Math.round((b.lmg || 0) * (b.taxa || 0) * ((b.vigencia_meses || 12) / 12)),
      status: b.status,
      data_entrada: b.data_inicio,
    } as OperacaoReal))
    return [...operacoes, ...manuais]
  }, [operacoes, cockpit.bookManual])

  // Filtrar operações
  const opsFiltradas = useMemo(() => {
    let ops = todasOps
    if (filtros.modalidade) ops = ops.filter(o => o.modalidade === filtros.modalidade)
    if (filtros.status) ops = ops.filter(o => o.status === filtros.status)
    if (filtros.periodo !== 'all') {
      const meses = filtros.periodo === '12m' ? 12 : 24
      const corte = new Date()
      corte.setMonth(corte.getMonth() - meses)
      ops = ops.filter(o => !o.data_entrada || new Date(o.data_entrada) >= corte)
    }
    return ops
  }, [todasOps, filtros])

  // KPIs
  const isTotal = useMemo(() => opsFiltradas.reduce((s, o) => s + (o.lmg || 0), 0), [opsFiltradas])
  const premioTotal = useMemo(() => opsFiltradas.reduce((s, o) => s + (o.premio_previsto || 0), 0), [opsFiltradas])
  const taxaMedia = useMemo(() => {
    const sumIS = opsFiltradas.reduce((s, o) => s + (o.lmg || 0), 0)
    if (!sumIS) return 0
    return opsFiltradas.reduce((s, o) => s + (o.taxa || 0) * (o.lmg || 0), 0) / sumIS
  }, [opsFiltradas])
  const pctMeta = Math.min(100, Math.round((premioTotal / META_PREMIO) * 100))

  // Dados gráficos
  const modalidades = useMemo(() => {
    const map: Record<string, number> = {}
    opsFiltradas.forEach(o => { map[o.modalidade] = (map[o.modalidade] || 0) + (o.lmg || 0) })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [opsFiltradas])

  const porTomador = useMemo(() => {
    const map: Record<string, number> = {}
    opsFiltradas.forEach(o => {
      const nome = o.tomadores?.razao_social || 'Desconhecido'
      map[nome] = (map[nome] || 0) + (o.lmg || 0)
    })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [opsFiltradas])

  const statusDist = useMemo(() => {
    const map: Record<string, number> = {}
    opsFiltradas.forEach(o => { map[o.status] = (map[o.status] || 0) + 1 })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [opsFiltradas])

  // Evolução mensal (prêmio acumulado)
  const evolucao = useMemo(() => {
    const hoje = new Date()
    const meses: { name: string; premio: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      const corte = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      const premio = opsFiltradas
        .filter(o => !o.data_entrada || new Date(o.data_entrada) <= corte)
        .reduce((s, o) => s + (o.premio_previsto || 0), 0)
      meses.push({ name: label, premio })
    }
    return meses
  }, [opsFiltradas])

  const modalidadesUnicas = [...new Set(todasOps.map(o => o.modalidade))]
  const statusUnicos = [...new Set(todasOps.map(o => o.status))]

  // Operação atual em análise
  const opAtual = operacoes.find(o => o.tomador_id === tomador.id)
  const impactoIS = opAtual ? isTotal + (opAtual.lmg || 0) - isTotal : 0
  const impactoPremio = opAtual ? premioTotal + (opAtual.premio_previsto || 0) - premioTotal : 0

  const tooltipStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, color: C.text }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ color: C.muted, fontSize: 14 }}>Carregando operações…</div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: C.bg, padding: '16px 20px' }}>

      {/* Slicers */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: C.muted, marginRight: 4 }}>Filtros:</span>

        {/* Modalidade */}
        {modalidadesUnicas.map(m => (
          <Pill key={m} label={m} active={filtros.modalidade === m}
            onClick={() => setFiltros({ ...filtros, modalidade: filtros.modalidade === m ? null : m })} />
        ))}

        <div style={{ width: 1, height: 20, background: C.border }} />

        {/* Status */}
        {statusUnicos.map(s => (
          <Pill key={s} label={s} active={filtros.status === s}
            onClick={() => setFiltros({ ...filtros, status: filtros.status === s ? null : s })} />
        ))}

        <div style={{ width: 1, height: 20, background: C.border }} />

        {/* Período */}
        {(['12m', '24m', 'all'] as const).map(p => (
          <Pill key={p} label={p === 'all' ? 'Tudo' : p} active={filtros.periodo === p}
            onClick={() => setFiltros({ ...filtros, periodo: p })} gold />
        ))}

        {(filtros.modalidade || filtros.status || filtros.periodo !== '12m') && (
          <button onClick={() => setFiltros({ modalidade: null, status: null, periodo: '12m' })}
            style={{ fontSize: 10, color: C.danger, background: 'none', border: `1px solid ${C.dangerBg}`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
            ✕ Limpar
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'IS Total', valor: fmtBRL(isTotal), cor: C.accent },
          { label: 'Prêmio Total', valor: fmtBRL(premioTotal), cor: C.gold },
          { label: 'Taxa Média Pond.', valor: fmtPct(taxaMedia), cor: '#a78bfa', hint: 'Σ(IS×Taxa) / Σ(IS)' },
          { label: '% da Meta', valor: `${pctMeta}%`, cor: pctMeta >= 80 ? C.success : pctMeta >= 50 ? C.gold : C.warning },
          { label: 'Meta Restante', valor: fmtBRL(Math.max(0, META_PREMIO - premioTotal)), cor: C.muted },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: kpi.cor }} title={kpi.hint}>{kpi.valor}</div>
          </div>
        ))}
      </div>

      {/* Impacto desta operação */}
      {opAtual && (
        <div style={{ background: C.goldBg, border: `1px solid ${C.goldBorder}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.gold }}>⭐ Esta Operação ({tomador.razao_social})</span>
          <span style={{ fontSize: 12, color: C.muted }}>IS: <span style={{ color: C.accent }}>{fmtBRL(opAtual.lmg)}</span></span>
          <span style={{ fontSize: 12, color: C.muted }}>Prêmio: <span style={{ color: C.gold }}>{fmtBRL(opAtual.premio_previsto)}</span></span>
          <span style={{ fontSize: 12, color: C.muted }}>Taxa: <span style={{ color: '#a78bfa' }}>{fmtPct(opAtual.taxa)}</span></span>
        </div>
      )}

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

        {/* Gauge Meta */}
        <ChartCard title="Meta de Prêmio">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height={140}>
              <RadialBarChart innerRadius="60%" outerRadius="80%" data={[{ value: pctMeta, fill: pctMeta >= 80 ? C.success : pctMeta >= 50 ? C.gold : C.warning }]} startAngle={180} endAngle={0}>
                <RadialBar dataKey="value" background={{ fill: 'rgba(255,255,255,0.04)' }} cornerRadius={4} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div style={{ marginTop: -20, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: pctMeta >= 80 ? C.success : pctMeta >= 50 ? C.gold : C.warning }}>{pctMeta}%</div>
              <div style={{ fontSize: 11, color: C.muted }}>{fmtBRL(premioTotal)} / {fmtBRL(META_PREMIO)}</div>
            </div>
          </div>
        </ChartCard>

        {/* Rosca modalidade */}
        <ChartCard title="IS por Modalidade">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={modalidades} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35}
                onClick={d => { const n = d.name ?? null; setFiltros({ ...filtros, modalidade: filtros.modalidade === n ? null : n }) }}
                style={{ cursor: 'pointer' }}>
                {modalidades.map((_, i) => <Cell key={i} fill={MODAL_COLORS[i % MODAL_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => fmtBRL(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 }}>
            {modalidades.map((m, i) => (
              <span key={m.name} style={{ fontSize: 10, color: MODAL_COLORS[i % MODAL_COLORS.length], display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: MODAL_COLORS[i % MODAL_COLORS.length], display: 'inline-block' }} />
                {m.name}
              </span>
            ))}
          </div>
        </ChartCard>

      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12, marginBottom: 12 }}>

        {/* IS por Tomador */}
        <ChartCard title="IS por Tomador (Top 8)">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={porTomador} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: C.muted }} tickFormatter={v => (v / 1e6).toFixed(1) + 'M'} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: C.muted }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => fmtBRL(Number(v))} />
              <Bar dataKey="value" fill={C.accent} radius={[0, 3, 3, 0]}
                onClick={d => setFiltros({ ...filtros, modalidade: null })} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Status */}
        <ChartCard title="Status das Operações">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                onClick={d => { const n = d.name ?? null; setFiltros({ ...filtros, status: filtros.status === n ? null : n }) }}
                style={{ cursor: 'pointer' }}>
                {statusDist.map((s) => <Cell key={s.name} fill={STATUS_COLORS[s.name] || C.muted} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>

      {/* Evolução prêmio */}
      <ChartCard title="Evolução do Prêmio Previsto (12 meses)">
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={evolucao} margin={{ left: 8, right: 8 }}>
            <defs>
              <linearGradient id="gradPremio" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.gold} stopOpacity={0.25} />
                <stop offset="95%" stopColor={C.gold} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.muted }} />
            <YAxis tick={{ fontSize: 10, fill: C.muted }} tickFormatter={v => (v / 1e3).toFixed(0) + 'k'} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => fmtBRL(Number(v))} />
            <Area type="monotone" dataKey="premio" stroke={C.gold} fill="url(#gradPremio)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Tabela */}
      <div style={{ marginTop: 12 }}>
        <ChartCard title={`Operações Filtradas (${opsFiltradas.length})`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Tomador', 'Modalidade', 'IS', 'Taxa', 'Prêmio', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: C.muted, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {opsFiltradas.slice(0, 20).map(op => {
                  const isCurrentTomador = op.tomador_id === tomador.id
                  return (
                    <tr key={op.id}
                      style={{ borderBottom: `1px solid rgba(255,255,255,0.04)`, background: isCurrentTomador ? C.goldBg : 'transparent' }}
                    >
                      <td style={{ padding: '7px 10px', color: isCurrentTomador ? C.gold : C.text, fontWeight: isCurrentTomador ? 700 : 400, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {op.tomadores?.razao_social || '—'}
                      </td>
                      <td style={{ padding: '7px 10px', color: C.muted }}>{op.modalidade}</td>
                      <td style={{ padding: '7px 10px', color: C.accent }}>{fmtBRL(op.lmg)}</td>
                      <td style={{ padding: '7px 10px', color: '#a78bfa', fontFamily: 'monospace' }}>{fmtPct(op.taxa)}</td>
                      <td style={{ padding: '7px 10px', color: C.gold }}>{fmtBRL(op.premio_previsto)}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLORS[op.status] || C.muted }}>{op.status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {opsFiltradas.length > 20 && (
              <div style={{ padding: '8px 10px', fontSize: 11, color: C.muted }}>+{opsFiltradas.length - 20} operações não exibidas</div>
            )}
          </div>
        </ChartCard>
      </div>

    </div>
  )
}

function Pill({ label, active, onClick, gold }: { label: string; active: boolean; onClick: () => void; gold?: boolean }) {
  const col = gold ? C.gold : C.accent
  const borderCol = gold ? C.goldBorder : C.accentBorder
  const bgCol = gold ? C.goldBg : C.accentBg
  return (
    <button onClick={onClick} style={{
      padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s',
      background: active ? bgCol : 'transparent',
      border: `1px solid ${active ? borderCol : C.border}`,
      color: active ? col : C.muted,
    }}>
      {label}
    </button>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}
