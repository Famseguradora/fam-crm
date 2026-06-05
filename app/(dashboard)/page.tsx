'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useDateRange } from '@/lib/context/date-range-context'
import { fmtData, fmtPercent } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtBRL(v: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(v)
}

function fmtNum(v: number): string {
  return new Intl.NumberFormat('pt-BR').format(v)
}

function fmtDataExtenso(): string {
  return new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

// ── types ─────────────────────────────────────────────────────────────────────

interface RawTomador {
  id: string
  status: string | null
  corretora_id: string | null
  corretora: { id: string; razao_social: string } | null
  limite_aprovado: number | null
  data_entrada: string | null
}

interface RawOperacao {
  id: string
  corretora_id: string | null
  corretora: { id: string; razao_social: string } | null
  modalidade: string | null
  premio_previsto: number | null
  lmg: number | null
  taxa: number | null
  vigencia_anos: number | null
  status: string | null
  data_entrada: string | null
}

interface StatusFluxo {
  id: string
  nome: string
  cor: string
  base: boolean
  ordem: number
  ativo: boolean
}

interface DashDados {
  tomadores: RawTomador[]
  operacoes: RawOperacao[]
  totalCorretoras: number
  statusTomador: StatusFluxo[]
  statusOperacao: StatusFluxo[]
}

// ── color palettes ────────────────────────────────────────────────────────────

const AZUIS = ['#1e4080', '#2255a4', '#3070c8', '#4a90d8', '#6ab0e8', '#8acaf8', '#aadaff', '#c0e8ff']
const VERDES = ['#065f46', '#047857', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#166534', '#6ee7b7']

// ── card visibility config ────────────────────────────────────────────────────

const CARDS_CONFIG = [
  { id: 'destaque',       label: '🏆 Operações Fechadas — Destaque' },
  { id: 'kpisTomadores',  label: '👥 Tomadores — KPIs' },
  { id: 'kpisOperacoes',  label: '📋 Operações — KPIs' },
  { id: 'barCorretoras',  label: '📊 Top Corretoras por Limite Aprovado' },
  { id: 'donutTomadores', label: '🔵 Distribuição por Status (Tomadores)' },
  { id: 'barCorretores',  label: '📊 Top Corretoras por Prêmio Previsto' },
  { id: 'donutOperacoes', label: '🟢 Status das Operações' },
  { id: 'barModalidades', label: '📊 Prêmio Previsto por Modalidade' },
] as const

type CardId = typeof CARDS_CONFIG[number]['id']
type CartoesState = Record<CardId, boolean>

const STORAGE_KEY = 'fam-dashboard-cartoes'
const CARDS_DEFAULT: CartoesState = Object.fromEntries(
  CARDS_CONFIG.map(c => [c.id, true])
) as CartoesState

// ── component ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const supabase = createClient()
  const { dataInicio, isFiltered } = useDateRange()
  const [loading, setLoading] = useState(true)
  const [dados, setDados] = useState<DashDados | null>(null)
  const [mounted, setMounted] = useState(false)
  const [cartoes, setCartoes] = useState<CartoesState>(CARDS_DEFAULT)
  const [modalCartoes, setModalCartoes] = useState(false)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  const [gerandoPdf, setGerandoPdf] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setCartoes({ ...CARDS_DEFAULT, ...JSON.parse(saved) })
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!modalCartoes) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setModalCartoes(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modalCartoes])

  function toggleCard(id: CardId) {
    setCartoes(prev => {
      const next = { ...prev, [id]: !prev[id] }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  useEffect(() => {
    async function carregar() {
      setLoading(true)
      const [
        { data: tomadores },
        { data: operacoes },
        { count: totalCorretoras },
        { data: statusTomador },
        { data: statusOperacao },
      ] = await Promise.all([
        supabase
          .from('tomadores')
          .select('id, status, corretora_id, corretora:corretoras(id,razao_social), limite_aprovado, data_entrada'),
        supabase
          .from('operacoes')
          .select('id, corretora_id, corretora:corretoras(id,razao_social), modalidade, premio_previsto, lmg, taxa, vigencia_anos, status, data_entrada')
          .eq('ativo', true),
        supabase.from('corretoras').select('*', { count: 'exact', head: true }),
        supabase.from('status_fluxo_tomador').select('*').order('ordem'),
        supabase.from('status_fluxo_operacao').select('*').order('ordem'),
      ])

      setDados({
        tomadores: (tomadores ?? []) as unknown as RawTomador[],
        operacoes: (operacoes ?? []) as unknown as RawOperacao[],
        totalCorretoras: totalCorretoras ?? 0,
        statusTomador: (statusTomador ?? []) as StatusFluxo[],
        statusOperacao: (statusOperacao ?? []) as StatusFluxo[],
      })
      setLoading(false)
    }
    carregar()
  }, [])

  // ── loading ───────────────────────────────────────────────────────────────

  if (loading || !dados) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 320, color: '#6080a0', fontSize: 16, gap: 12,
      }}>
        <span style={{ fontSize: 24 }}>📊</span> Carregando dashboard…
      </div>
    )
  }

  const { tomadores: todosTomdores, operacoes: todasOps, totalCorretoras, statusTomador, statusOperacao } = dados

  // ── Filtro global de data de início dos cálculos ───────────────────────────
  const tomadores = isFiltered
    ? todosTomdores.filter(t => !t.data_entrada || t.data_entrada >= dataInicio)
    : todosTomdores
  const operacoes = isFiltered
    ? todasOps.filter(o => !o.data_entrada || o.data_entrada >= dataInicio)
    : todasOps

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const CAP_LMG = 80_000_000
  const opsFechadas = operacoes.filter(o => o.status === 'Emitido')
  const premioFechado = opsFechadas.reduce((s, o) => s + (o.premio_previsto ?? 0), 0)
  const lmgFechado = opsFechadas.reduce((s, o) => s + Math.min(o.lmg ?? 0, CAP_LMG), 0)
  const taxaMediaFechada = lmgFechado > 0
    ? opsFechadas.reduce((s, o) => s + (o.taxa ?? 0) * Math.min(o.lmg ?? 0, CAP_LMG) * Math.min(o.vigencia_anos ?? 1, 1), 0) / lmgFechado
    : 0

  const corretorasComTomadores = new Set(tomadores.map(t => t.corretora_id).filter(Boolean)).size
  const tomadoresAtivos = tomadores.filter(t => t.status !== 'Perdido' && t.status !== 'Recusado')
  const tomadoresCadastrados = tomadoresAtivos.length
  const limiteAprovadoTotal = tomadoresAtivos.reduce((s, t) => s + (t.limite_aprovado ?? 0), 0)

  const corretoresUnicos = new Set(operacoes.map(o => o.corretora_id).filter(Boolean)).size
  const lmgTotal = operacoes.reduce((s, o) => s + Math.min(o.lmg ?? 0, CAP_LMG), 0)
  const opsPotencial = operacoes.filter(o => !['Emitido', 'Recusado', 'Perdido'].includes(o.status ?? ''))
  const lmgLiquido = opsPotencial.reduce((s, o) => s + Math.min(o.lmg ?? 0, CAP_LMG), 0)
  const premioTotal = opsPotencial.reduce((s, o) => s + (o.premio_previsto ?? 0), 0)

  // ── chart data ────────────────────────────────────────────────────────────

  const corretoraPorLimite: Record<string, number> = {}
  for (const t of tomadores) {
    const nome = (t.corretora as { razao_social: string } | null)?.razao_social ?? 'Sem Corretora'
    corretoraPorLimite[nome] = (corretoraPorLimite[nome] ?? 0) + (t.limite_aprovado ?? 0)
  }
  const topCorretoras = Object.entries(corretoraPorLimite)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([nome, valor]) => ({ nome: nome.length > 24 ? nome.slice(0, 22) + '…' : nome, valor }))
    .reverse()

  const tmPorStatus: Record<string, number> = {}
  for (const t of tomadores) {
    const s = t.status ?? 'Sem Status'
    tmPorStatus[s] = (tmPorStatus[s] ?? 0) + 1
  }
  const statusTomadorChart = Object.entries(tmPorStatus).map(([name, value]) => ({
    name, value,
    cor: statusTomador.find(s => s.nome === name)?.cor ?? '#6080a0',
  }))

  const corretorPorPremio: Record<string, number> = {}
  for (const o of operacoes) {
    const nome = (o.corretora as { razao_social: string } | null)?.razao_social ?? 'Sem Corretora'
    corretorPorPremio[nome] = (corretorPorPremio[nome] ?? 0) + (o.premio_previsto ?? 0)
  }
  const topCorretores = Object.entries(corretorPorPremio)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([nome, valor]) => ({ nome: nome.length > 20 ? nome.slice(0, 18) + '…' : nome, valor }))
    .reverse()

  const opPorStatus: Record<string, number> = {}
  for (const o of operacoes) {
    const s = o.status ?? 'Sem Status'
    opPorStatus[s] = (opPorStatus[s] ?? 0) + 1
  }
  const statusOperacaoChart = Object.entries(opPorStatus).map(([name, value]) => ({
    name, value,
    cor: statusOperacao.find(s => s.nome === name)?.cor ?? '#6080a0',
  }))

  const premioPorMod: Record<string, number> = {}
  for (const o of operacoes) {
    const m = o.modalidade ?? 'Sem Modalidade'
    premioPorMod[m] = (premioPorMod[m] ?? 0) + (o.premio_previsto ?? 0)
  }
  const topModalidades = Object.entries(premioPorMod)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([nome, valor]) => ({ nome, valor }))

  // ── handlers ──────────────────────────────────────────────────────────────

  function fecharPreviewPdf() {
    if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl)
    setPreviewPdfUrl(null)
  }

  async function handleExportarPDF() {
    setGerandoPdf(true)
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ])

      const element = document.getElementById('dashboard-content')
      if (!element) return

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f0f4f8',
      })

      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = 210, pageH = 297, margin = 8
      const contentW = pageW - margin * 2
      const imgH = (canvas.height * contentW) / canvas.width

      let yOffset = 0
      while (yOffset < imgH) {
        if (yOffset > 0) pdf.addPage()
        pdf.addImage(imgData, 'JPEG', margin, margin - yOffset, contentW, imgH)
        yOffset += pageH - margin * 2
      }

      const blob = pdf.output('blob')
      const url = URL.createObjectURL(blob)
      setPreviewPdfUrl(url)
    } finally {
      setGerandoPdf(false)
    }
  }

  // ── style helpers ─────────────────────────────────────────────────────────

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

  const kpiSub: React.CSSProperties = { fontSize: 11, color: '#a0b8d0', marginTop: 6 }

  const dot = (color: string): React.CSSProperties => ({
    width: 8, height: 8, borderRadius: '50%', background: color,
    display: 'inline-block', flexShrink: 0,
  })

  const showLeftCol  = cartoes.barCorretoras || cartoes.donutTomadores
  const showRightCol = cartoes.barCorretores  || cartoes.donutOperacoes
  const showChartsGrid = showLeftCol || showRightCol

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div id="dashboard-content" style={{ fontFamily: "'Calibri','Segoe UI',sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#102040' }}>Painel Executivo</div>
          <div style={{ fontSize: 12, color: '#6080a0', marginTop: 3 }}>
            Visão consolidada — {fmtDataExtenso()}
          </div>
        </div>
        <div data-html2canvas-ignore="true" style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => setModalCartoes(true)}
            style={{ background: '#f0f6ff', border: '1px solid #c0d4e8', color: '#2255a4', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            ✏ Personalizar
          </button>
          <button
            onClick={handleExportarPDF}
            disabled={gerandoPdf}
            style={{ background: 'white', border: '1px solid #c0d4e8', color: '#1e4080', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: gerandoPdf ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: gerandoPdf ? 0.6 : 1 }}
          >
            {gerandoPdf ? '⏳ Gerando…' : '↓ Exportar PDF'}
          </button>
        </div>
      </div>

      {/* ── Badge filtro global ── */}
      {isFiltered && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(48,112,200,.08)', border: '1px solid #3070c8',
          borderRadius: 8, padding: '8px 16px', marginBottom: 20,
          fontSize: 13, color: '#3070c8', fontWeight: 600,
        }}>
          <span>📅</span>
          <span>Exibindo dados a partir de <strong>{fmtData(dataInicio)}</strong></span>
        </div>
      )}

      {/* ── Destaque ── */}
      {cartoes.destaque && (
        <div style={{
          background: 'linear-gradient(135deg,#0a1628 0%,#1a3560 70%,#2255a4 100%)',
          borderRadius: 14, padding: '20px 28px', marginBottom: 24,
          boxShadow: '0 4px 20px rgba(10,22,40,.3)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e8b84b', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 18 }}>
            🏆 Operações Fechadas — Destaque
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 20, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#a0c0e8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>QTD. Fechadas</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: 'white', lineHeight: 1 }}>{opsFechadas.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#a0c0e8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Prêmio Total Fechado</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#e8b84b', lineHeight: 1 }}>{fmtBRL(premioFechado)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#a0c0e8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>LMG Total Fechado</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#6ab0e8', lineHeight: 1 }}>{fmtBRL(lmgFechado)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#a0c0e8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Taxa Méd. Ponderada</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#e8b84b', lineHeight: 1 }}>{fmtPercent(taxaMediaFechada / 100)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tomadores KPIs ── */}
      {cartoes.kpisTomadores && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#102040', marginBottom: 10 }}>
            <span style={dot('#2255a4')} />
            Tomadores — Resumo
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Corretoras', value: fmtNum(totalCorretoras), sub: 'Total recebidas', accent: '#2255a4', gold: false },
              { label: 'Corretoras com Tomadores Cadastrados', value: fmtNum(corretorasComTomadores), sub: 'Cadastradas únicas', accent: '#2255a4', gold: false },
              { label: 'Tomadores Recebidos', value: fmtNum(tomadores.length), sub: 'Total recebidos', accent: '#2255a4', gold: false },
              { label: 'Limite Aprovado Total', value: fmtBRL(limiteAprovadoTotal), sub: 'Soma dos limites ativos', accent: '#e8b84b', gold: true },
            ].map((k, i) => (
              <div key={i} style={{ ...cardBase, borderTop: `3px solid ${k.accent}` }}>
                <div style={kpiLabel}>{k.label}</div>
                <div style={{ fontSize: k.gold ? 16 : 22, fontWeight: 800, color: k.gold ? '#b87a00' : '#102040', lineHeight: 1.1 }}>
                  {k.value}
                </div>
                <div style={kpiSub}>{k.sub}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Operações KPIs ── */}
      {cartoes.kpisOperacoes && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#102040', marginBottom: 10 }}>
            <span style={dot('#16a34a')} />
            Operações — Resumo
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12, marginBottom: 28 }}>
            {[
              { label: 'Corretoras', value: fmtNum(corretoresUnicos), sub: 'Únicas em operações', dark: false },
              { label: 'Total de Operações', value: fmtNum(operacoes.length), sub: 'Todas as operações', dark: false },
              { label: 'LMG Total', value: fmtBRL(lmgTotal), sub: 'Soma total LMG', dark: false },
              { label: 'LMG Total em Potencial', value: fmtBRL(lmgLiquido), sub: 'LMG Total menos Emitidas/Recusadas/Perdidas', dark: true },
              { label: 'Prêmio Previsto Total', value: fmtBRL(premioTotal), sub: 'Prêmios previstos menos Emitidas/Recusadas/Perdidas', dark: false },
            ].map((k, i) => (
              <div key={i} style={{
                ...cardBase,
                borderTop: '3px solid #16a34a',
                ...(k.dark ? {
                  background: 'linear-gradient(135deg,#0a1628,#1a3560)',
                  border: '1px solid #2255a4',
                  borderTop: '3px solid #e8b84b',
                } : {}),
              }}>
                <div style={{ ...kpiLabel, color: k.dark ? '#a0c0e8' : '#6080a0' }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1, color: k.dark ? '#e8b84b' : '#102040' }}>
                  {k.value}
                </div>
                <div style={{ ...kpiSub, color: k.dark ? '#6080a0' : '#a0b8d0' }}>{k.sub}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Charts 2-col ── */}
      {showChartsGrid && (
        <div style={{ display: 'grid', gridTemplateColumns: showLeftCol && showRightCol ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr', gap: 20, marginBottom: 20 }}>

          {/* LEFT: TOMADORES */}
          {showLeftCol && (
            <div style={{ ...cardBase, display: 'flex', flexDirection: 'column', gap: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#2255a4', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                ● TOMADORES
              </div>

              {cartoes.barCorretoras && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#102040', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ ...dot('#2255a4'), display: 'inline-block' }} />
                    Top Corretoras por Limite Aprovado
                  </div>
                  {!mounted || topCorretoras.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#a0b8d0', padding: '24px 0', fontSize: 13 }}>Sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(topCorretoras.length * 38, 80)}>
                      <BarChart data={topCorretoras} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="nome" width={155} tick={{ fontSize: 11, fill: '#304060' }} />
                        <Tooltip formatter={(v) => [fmtBRL(Number(v ?? 0)), 'Limite']} />
                        <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                          {topCorretoras.map((_, idx) => (
                            <Cell key={idx} fill={AZUIS[idx % AZUIS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}

              {cartoes.donutTomadores && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#102040', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ ...dot('#2255a4'), display: 'inline-block' }} />
                    Distribuição por Status
                  </div>
                  {!mounted || statusTomadorChart.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#a0b8d0', padding: '24px 0', fontSize: 13 }}>Sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={230}>
                      <PieChart>
                        <Pie data={statusTomadorChart} cx="50%" cy="46%" innerRadius={58} outerRadius={88} dataKey="value" nameKey="name">
                          {statusTomadorChart.map((entry, idx) => (
                            <Cell key={idx} fill={entry.cor} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, name) => [Number(v ?? 0), String(name)]} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
            </div>
          )}

          {/* RIGHT: OPERAÇÕES */}
          {showRightCol && (
            <div style={{ ...cardBase, display: 'flex', flexDirection: 'column', gap: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                ● OPERAÇÕES / SUBSCRIÇÃO
              </div>

              {cartoes.barCorretores && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#102040', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ ...dot('#16a34a'), display: 'inline-block' }} />
                    Top Corretoras por Prêmio Previsto
                  </div>
                  {!mounted || topCorretores.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#a0b8d0', padding: '24px 0', fontSize: 13 }}>Sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(topCorretores.length * 38, 80)}>
                      <BarChart data={topCorretores} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="nome" width={135} tick={{ fontSize: 11, fill: '#304060' }} />
                        <Tooltip formatter={(v) => [fmtBRL(Number(v ?? 0)), 'Prêmio']} />
                        <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                          {topCorretores.map((_, idx) => (
                            <Cell key={idx} fill={VERDES[idx % VERDES.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}

              {cartoes.donutOperacoes && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#102040', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ ...dot('#16a34a'), display: 'inline-block' }} />
                    Status das Operações
                  </div>
                  {!mounted || statusOperacaoChart.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#a0b8d0', padding: '24px 0', fontSize: 13 }}>Sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={230}>
                      <PieChart>
                        <Pie data={statusOperacaoChart} cx="50%" cy="46%" innerRadius={58} outerRadius={88} dataKey="value" nameKey="name">
                          {statusOperacaoChart.map((entry, idx) => (
                            <Cell key={idx} fill={entry.cor} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, name) => [Number(v ?? 0), String(name)]} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Prêmio por Modalidade ── */}
      {cartoes.barModalidades && (
        <div style={cardBase}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#102040', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ ...dot('#2255a4'), display: 'inline-block' }} />
            Prêmio Previsto por Modalidade (Top 6)
          </div>
          {!mounted || topModalidades.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#a0b8d0', padding: '48px 0', fontSize: 13 }}>Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topModalidades} margin={{ bottom: 48, left: 20, right: 20, top: 8 }}>
                <XAxis dataKey="nome" tick={{ fontSize: 11, fill: '#304060' }} angle={-18} textAnchor="end" interval={0} height={60} />
                <YAxis tickFormatter={(v) => `R$ ${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [fmtBRL(Number(v ?? 0)), 'Prêmio Previsto']} />
                <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                  {topModalidades.map((_, idx) => (
                    <Cell key={idx} fill={AZUIS[idx % AZUIS.length]} fillOpacity={0.5} stroke={AZUIS[idx % AZUIS.length]} strokeOpacity={0.5} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* ── Modal: Prévia PDF ── */}
      {previewPdfUrl && (
        <div className="modal-overlay" onClick={fecharPreviewPdf}>
          <div
            style={{ background: 'white', borderRadius: 14, width: '88vw', maxWidth: 960, height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #dde8f4', flexShrink: 0 }}>
              <div style={{ fontWeight: 700, color: '#102040', fontSize: 15 }}>Prévia do Relatório</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <a
                  href={previewPdfUrl}
                  download={`FAM-Dashboard-${new Date().toISOString().slice(0, 10)}.pdf`}
                  style={{ padding: '7px 16px', borderRadius: 8, background: '#1e4080', color: 'white', fontWeight: 600, fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  ⬇ Baixar PDF
                </a>
                <button
                  onClick={fecharPreviewPdf}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #dde8f4', background: 'white', color: '#6080a0', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  ✕ Fechar
                </button>
              </div>
            </div>
            <iframe src={previewPdfUrl} style={{ flex: 1, border: 'none', width: '100%' }} title="Prévia PDF" />
          </div>
        </div>
      )}

      {/* ── Modal: Personalizar cartões ── */}
      {modalCartoes && (
        <div className="modal-overlay" onClick={() => setModalCartoes(false)}>
          <div
            style={{ background: 'white', borderRadius: 16, padding: 28, maxWidth: 420, width: '92%', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#102040' }}>✏ Personalizar Dashboard</div>
              <button
                onClick={() => setModalCartoes(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, color: '#6080a0', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ fontSize: 12, color: '#6080a0', marginBottom: 16 }}>
              Ative ou desative os cartões que deseja exibir no dashboard. A configuração é salva automaticamente.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {CARDS_CONFIG.map((card) => {
                const ativo = cartoes[card.id]
                return (
                  <label
                    key={card.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                      background: ativo ? '#f0f6ff' : '#f8faff',
                      border: `1px solid ${ativo ? '#bfdbfe' : '#e8eef8'}`,
                      transition: 'all .15s',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: ativo ? '#1e4080' : '#a0b8d0' }}>
                      {card.label}
                    </span>
                    <div
                      onClick={() => toggleCard(card.id)}
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

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <button
                onClick={() => {
                  const all = Object.fromEntries(CARDS_CONFIG.map(c => [c.id, true])) as CartoesState
                  setCartoes(all)
                  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)) } catch { /* ignore */ }
                }}
                style={{ fontSize: 12, color: '#6080a0', background: '#f0f4f8', border: '1px solid #dde8f4', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 600 }}
              >
                Mostrar todos
              </button>
              <button
                className="btn-primary"
                onClick={() => setModalCartoes(false)}
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
