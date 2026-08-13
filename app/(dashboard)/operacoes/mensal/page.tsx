'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtMoeda, fmtPercent, fmtData } from '@/lib/utils'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, Cell,
} from 'recharts'
import { taxaMediaMensal, TAXA_MENSAL_INFO, type OpTaxaLike } from '@/lib/corretoras/agregacoes'
import { CAP_LMG } from '@/lib/operacoes/kpis'
import {
  premioMensalizado, premioPorMesDeVigencia, PREMIO_VIGENCIA_INFO, type OpPremioLike,
} from '@/lib/operacoes/premio-vigencia'
import { vigenciaTxt } from '@/lib/comite/calculo'
import { gerarPdfKpisMensais } from '@/lib/operacoes/pdf-mensal'
import RacionalTaxaBox from '@/components/RacionalTaxaBox'
import PdfPreview, { type PdfGerado } from '@/components/PdfPreview'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RowMensal {
  mesKey: string     // 'YYYY-MM'
  mesLabel: string   // 'Jan/26'
  qtd: number
  lmg: number
  premio: number
  premioMes: number  // prêmio por MÊS DE VIGÊNCIA da safra do mês
  taxaMedia: number  // taxa média MENSAL / competência (mesma escala que op.taxa, ex: 2.40)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function mesLabel(key: string): string {
  const [yyyy, mm] = key.split('-')
  return `${MESES_PT[parseInt(mm, 10) - 1]}/${yyyy.slice(2)}`
}

// Operação com os campos mínimos p/ os cálculos (taxa e prêmio mensalizado)
// + os de exibição no relatório gerencial em linhas.
type OpMensalRow = OpTaxaLike & OpPremioLike & {
  id: string
  data_emissao: string | null
  premio_previsto: number | null
  modalidade: string | null
  estado: string | null
  tomador: { razao_social: string | null } | null
  corretora: { razao_social: string | null; nome_fantasia: string | null } | null
}

const nomeTomador = (o: OpMensalRow) => o.tomador?.razao_social?.trim() || 'Sem tomador'
const nomeCorretora = (o: OpMensalRow) =>
  (o.corretora?.nome_fantasia || o.corretora?.razao_social)?.trim() || 'Sem corretora'

// Agrupa por mês de EMISSÃO usando as FONTES ÚNICAS da taxa média (agregacoes.ts)
// e do prêmio por mês de vigência (premio-vigencia.ts). LMG limitado a 80M por op.
function agruparPorMes(ops: OpMensalRow[]): RowMensal[] {
  const mapa = new Map<string, OpMensalRow[]>()
  for (const op of ops) {
    if (!op.data_emissao) continue
    const key = op.data_emissao.substring(0, 7)
    const arr = mapa.get(key) ?? []
    arr.push(op)
    mapa.set(key, arr)
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, opsMes]) => ({
      mesKey: key,
      mesLabel: mesLabel(key),
      qtd: opsMes.length,
      lmg: opsMes.reduce((s, o) => s + Math.min(o.lmg ?? 0, CAP_LMG), 0),
      premio: opsMes.reduce((s, o) => s + (o.premio_previsto ?? 0), 0),
      premioMes: premioMensalizado(opsMes),
      taxaMedia: taxaMediaMensal(opsMes),
    }))
}

// Totais de um conjunto de operações, sempre pelas fontes únicas.
function totaisDe(ops: OpMensalRow[]) {
  return {
    qtd: ops.length,
    lmg: ops.reduce((s, o) => s + Math.min(o.lmg ?? 0, CAP_LMG), 0),
    premio: ops.reduce((s, o) => s + (o.premio_previsto ?? 0), 0),
    premioMensalizado: premioMensalizado(ops),
    taxaMedia: taxaMediaMensal(ops),
  }
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #d0e4f5', borderRadius: 8, padding: '10px 14px', fontFamily: "'Calibri','Segoe UI',sans-serif", fontSize: 13 }}>
      <div style={{ fontWeight: 700, color: '#1e4080', marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name === 'Taxa Méd. Mensal' ? fmtPercent(p.value / 100) : fmtMoeda(p.value)}
          <span style={{ color: '#6080a0', marginLeft: 6, fontSize: 11 }}>{p.name}</span>
        </div>
      ))}
      <div style={{ color: '#a0b0c8', fontSize: 11, marginTop: 6, borderTop: '1px solid #eef2f8', paddingTop: 5 }}>
        Clique para ver as operações · Ctrl+clique soma meses
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KpisMensaisPage() {
  const router = useRouter()
  const supabase = createClient()

  const [ops, setOps] = useState<OpMensalRow[]>([])
  const [mostrarFormula, setMostrarFormula] = useState(false)
  const [mostrarFormulaMes, setMostrarFormulaMes] = useState(false)
  const [loading, setLoading] = useState(true)
  const [anoSelecionado, setAnoSelecionado] = useState<string>(String(new Date().getFullYear()))
  const [anosDisponiveis, setAnosDisponiveis] = useState<string[]>([])
  const [mesesSel, setMesesSel] = useState<string[]>([])
  const [exportando, setExportando] = useState(false)
  const [pdf, setPdf] = useState<PdfGerado | null>(null)

  const graficoRef = useRef<HTMLDivElement>(null)
  const relatorioRef = useRef<HTMLDivElement>(null)
  // O onClick do Recharts nem sempre entrega o evento nativo com as teclas
  // modificadoras. Guardamos o último estado de Ctrl/Cmd visto pelo documento,
  // para que o gráfico e a tabela respondam ao MESMO gesto.
  const ctrlRef = useRef(false)

  useEffect(() => {
    const marcar = (e: MouseEvent | KeyboardEvent) => { ctrlRef.current = e.ctrlKey || e.metaKey }
    document.addEventListener('pointerdown', marcar, true)
    document.addEventListener('keydown', marcar, true)
    document.addEventListener('keyup', marcar, true)
    return () => {
      document.removeEventListener('pointerdown', marcar, true)
      document.removeEventListener('keydown', marcar, true)
      document.removeEventListener('keyup', marcar, true)
    }
  }, [])

  useEffect(() => {
    async function carregar() {
      setLoading(true)
      const { data, error } = await supabase
        .from('operacoes')
        .select(`
          id, data_emissao, lmg, premio_previsto, taxa, modalidade, estado,
          vigencia_dias, vigencia_anos, periodicidade_vigencia,
          tomador:tomadores(razao_social),
          corretora:corretoras(razao_social, nome_fantasia)
        `)
        .eq('status', 'Emitido')
        .eq('ativo', true)
        .not('data_emissao', 'is', null)
        .order('data_emissao', { ascending: false })

      if (error || !data) {
        setLoading(false)
        return
      }

      const lista = data as unknown as OpMensalRow[]
      const anos = [...new Set(lista.map(o => (o.data_emissao ?? '').substring(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a))
      setAnosDisponiveis(anos)
      if (!anos.includes(anoSelecionado) && anos.length > 0) setAnoSelecionado(anos[0])
      setOps(lista)
      setLoading(false)
    }
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = useMemo(() => agruparPorMes(ops), [ops])
  const rowsFiltradas = useMemo(() => rows.filter(r => r.mesKey.startsWith(anoSelecionado)), [rows, anoSelecionado])

  // Total do ano pelas FONTES ÚNICAS (não dá para reconstruir a ponderada a
  // partir das médias mensais).
  const opsAno = useMemo(
    () => ops.filter(o => (o.data_emissao ?? '').startsWith(anoSelecionado)),
    [ops, anoSelecionado],
  )
  const totais = useMemo(() => totaisDe(opsAno), [opsAno])

  // Trocar de ano zera a seleção: um mês de 2025 marcado sumiria da tela sem
  // deixar rastro, e o relatório abaixo mostraria operações que não estão no
  // gráfico. Zera no próprio handler do seletor, não num efeito, para não
  // disparar uma renderização em cascata.
  const trocarAno = useCallback((novo: string) => {
    setAnoSelecionado(novo)
    setMesesSel([])
  }, [])

  // ─── Seleção de meses ──────────────────────────────────────────────────────
  // Clique simples troca o mês; Ctrl (ou ⌘) acumula. Mesmo gesto do comparador
  // de Corretoras. Clicar de novo no único mês marcado limpa a seleção.
  const alternarMes = useCallback((mesKey: string, comCtrl: boolean) => {
    setMesesSel(atual => {
      if (comCtrl) {
        return atual.includes(mesKey) ? atual.filter(m => m !== mesKey) : [...atual, mesKey]
      }
      return atual.length === 1 && atual[0] === mesKey ? [] : [mesKey]
    })
  }, [])

  const opsSelecionadas = useMemo(() => {
    if (mesesSel.length === 0) return []
    const set = new Set(mesesSel)
    return opsAno
      .filter(o => set.has((o.data_emissao ?? '').substring(0, 7)))
      .sort((a, b) => (b.data_emissao ?? '').localeCompare(a.data_emissao ?? ''))
  }, [opsAno, mesesSel])

  const totaisSel = useMemo(() => totaisDe(opsSelecionadas), [opsSelecionadas])

  // Rótulo da seleção em ordem cronológica, com "e" antes do último.
  const rotuloSelecao = useMemo(() => {
    const labels = [...mesesSel].sort().map(mesLabel)
    if (labels.length === 0) return ''
    if (labels.length === 1) return labels[0]
    return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`
  }, [mesesSel])

  // Rola até o relatório quando a seleção nasce (não a cada mês somado).
  const tinhaSelecao = useRef(false)
  useEffect(() => {
    const tem = mesesSel.length > 0
    if (tem && !tinhaSelecao.current) {
      relatorioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    tinhaSelecao.current = tem
  }, [mesesSel])

  // ─── Exportar PDF ──────────────────────────────────────────────────────────
  async function exportarPdf() {
    setExportando(true)
    try {
      let chart: { dataUrl: string; w: number; h: number } | null = null
      try {
        const { toPng } = await import('html-to-image')
        const node = graficoRef.current
        if (node) {
          const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
          chart = { dataUrl, w: node.clientWidth || 900, h: node.clientHeight || 320 }
        }
      } catch { /* segue sem a imagem do gráfico */ }

      const { url, filename } = await gerarPdfKpisMensais({
        ano: anoSelecionado,
        linhasMes: rowsFiltradas.map(r => ({
          mesLabel: r.mesLabel, qtd: r.qtd, lmg: r.lmg,
          premio: r.premio, premioMensalizado: r.premioMes, taxaMedia: r.taxaMedia,
        })),
        totais: {
          qtd: totais.qtd, lmg: totais.lmg, premio: totais.premio,
          premioMensalizado: totais.premioMensalizado, taxaMedia: totais.taxaMedia,
        },
        chart,
        selecao: opsSelecionadas.length > 0 ? {
          rotulo: rotuloSelecao,
          operacoes: opsSelecionadas.map(o => ({
            dataEmissao: o.data_emissao ? fmtData(o.data_emissao) : '—',
            mesLabel: mesLabel((o.data_emissao ?? '').substring(0, 7)),
            tomador: nomeTomador(o),
            corretora: nomeCorretora(o),
            modalidade: o.modalidade ?? '—',
            uf: o.estado ?? '—',
            lmg: Math.min(o.lmg ?? 0, CAP_LMG),
            taxa: Number(o.taxa) || 0,
            vigencia: vigenciaTxt(o),
            premio: o.premio_previsto ?? 0,
            premioMensalizado: premioPorMesDeVigencia(o),
          })),
          totais: {
            qtd: totaisSel.qtd, lmg: totaisSel.lmg, premio: totaisSel.premio,
            premioMensalizado: totaisSel.premioMensalizado, taxaMedia: totaisSel.taxaMedia,
          },
        } : null,
      })
      setPdf({ url, filename })
    } catch (err) {
      console.error('PDF KPIs por Mês:', err)
    } finally {
      setExportando(false)
    }
  }

  // ─── Styles ────────────────────────────────────────────────────────────────

  const font = "'Calibri','Segoe UI',sans-serif"
  const th: React.CSSProperties = {
    padding: '10px 14px', fontFamily: font, fontSize: 12, fontWeight: 700,
    color: '#1e4080', background: '#e8f0fb', textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: '2px solid #d0e4f5',
  }
  const thL: React.CSSProperties = { ...th, textAlign: 'left' }
  const td: React.CSSProperties = {
    padding: '9px 14px', fontFamily: font, fontSize: 13, color: '#2a3a5a',
    borderBottom: '1px solid #eef2f8', textAlign: 'right',
  }
  const tdL: React.CSSProperties = { ...td, textAlign: 'left', fontWeight: 600 }
  const tdTotal: React.CSSProperties = { ...td, fontWeight: 800, color: '#1e4080', background: '#f0f5ff', borderTop: '2px solid #d0e4f5', borderBottom: 'none' }
  const tdTotalL: React.CSSProperties = { ...tdTotal, textAlign: 'left' }
  const cardBox: React.CSSProperties = {
    background: 'white', borderRadius: 12, border: '1.5px solid #d0e4f5',
    boxShadow: '0 1px 4px rgba(30,64,128,0.06)',
  }
  const btn: React.CSSProperties = {
    padding: '7px 14px', borderRadius: 8, border: '1.5px solid #d0e4f5',
    background: 'white', color: '#1e4080', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: font, display: 'flex', alignItems: 'center', gap: 6,
  }
  const btnInfo: React.CSSProperties = {
    border: '1.5px solid #d0e4f5', background: 'white', color: '#1e4080',
    borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', fontFamily: font,
  }

  return (
    <div style={{ fontFamily: font, maxWidth: 1100, margin: '0 auto', padding: '24px 20px 48px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <button onClick={() => router.back()} style={btn}>← Voltar</button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1e4080' }}>📅 KPIs por Mês</div>
          <div style={{ fontSize: 13, color: '#6080a0' }}>Operações Emitidas</div>
        </div>
        <button
          onClick={exportarPdf}
          disabled={exportando || loading || rowsFiltradas.length === 0}
          style={{
            ...btn,
            background: exportando ? '#eef4fc' : '#1e4080', color: exportando ? '#6080a0' : 'white',
            borderColor: '#1e4080',
            cursor: exportando || loading || rowsFiltradas.length === 0 ? 'not-allowed' : 'pointer',
            opacity: loading || rowsFiltradas.length === 0 ? 0.5 : 1,
          }}
        >
          {exportando ? 'Gerando...' : '📄 Exportar PDF'}
        </button>
        {anosDisponiveis.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: '#6080a0', fontWeight: 600 }}>Ano:</label>
            <select
              value={anoSelecionado}
              onChange={e => trocarAno(e.target.value)}
              style={{
                padding: '6px 12px', borderRadius: 8, border: '1.5px solid #d0e4f5',
                fontFamily: font, fontSize: 14, fontWeight: 700, color: '#1e4080',
                background: 'white', cursor: 'pointer',
              }}
            >
              {anosDisponiveis.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#6080a0', fontSize: 15 }}>Carregando...</div>
      ) : rowsFiltradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#6080a0', fontSize: 15 }}>
          Nenhuma operação emitida em {anoSelecionado}.
        </div>
      ) : (
        <>
          {/* KPI Cards topo */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
            {[
              { label: 'Operações Emitidas', value: String(totais.qtd), sub: `em ${rowsFiltradas.length} ${rowsFiltradas.length === 1 ? 'mês' : 'meses'}` },
              { label: 'Prêmio Total', value: fmtMoeda(totais.premio), sub: `lançado na emissão · ${anoSelecionado}` },
              { label: 'Prêmio / Mês de Vigência', value: fmtMoeda(totais.premioMensalizado), sub: 'quanto a carteira rende por mês' },
              { label: 'LMG Total', value: fmtMoeda(totais.lmg), sub: anoSelecionado },
              { label: 'Taxa Média Mensal', value: fmtPercent(totais.taxaMedia / 100), sub: 'competência · sobre LMG' },
            ].map(c => (
              <div key={c.label} data-kpi-ano={c.label} style={{ ...cardBox, flex: '1 1 170px', padding: '14px 18px' }}>
                <div style={{ fontSize: 11, color: '#6080a0', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: '#1e4080' }}>{c.value}</div>
                <div style={{ fontSize: 11, color: '#a0b0c8' }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Gráfico */}
          <div style={{ ...cardBox, padding: '20px 16px 8px', marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, paddingLeft: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e4080' }}>Prêmio Emitido &amp; Taxa Média Mensal por Mês</div>
              <button
                onClick={() => setMostrarFormula(v => !v)}
                title="Como a taxa média mensal é calculada"
                style={{ ...btnInfo, background: mostrarFormula ? '#e8f0fb' : 'white' }}
              >
                ⓘ como é calculada
              </button>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6080a0' }}>
                Clique numa barra para ver as operações · <b>Ctrl+clique</b> soma meses
              </div>
            </div>
            {mostrarFormula && (
              <div style={{ margin: '0 8px 16px' }}>
                <RacionalTaxaBox info={TAXA_MENSAL_INFO} tema="claro" />
              </div>
            )}
            <div ref={graficoRef} style={{ background: 'white' }}>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart
                  data={rowsFiltradas}
                  margin={{ top: 4, right: 40, left: 10, bottom: 4 }}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f8" />
                  <XAxis dataKey="mesLabel" tick={{ fontFamily: font, fontSize: 12, fill: '#6080a0' }} />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={v => {
                      if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
                      if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`
                      return `R$ ${v}`
                    }}
                    tick={{ fontFamily: font, fontSize: 11, fill: '#6080a0' }}
                    width={80}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={v => `${v.toFixed(2)}%`}
                    tick={{ fontFamily: font, fontSize: 11, fill: '#6080a0' }}
                    width={55}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(30,64,128,0.05)' }} />
                  <Legend wrapperStyle={{ fontFamily: font, fontSize: 12, paddingTop: 8 }} />
                  {/* O clique mora no Bar, não no ComposedChart: o handler do
                      gráfico depende do activeLabel do hover, que não é confiável
                      (uma barra clicada não selecionava nada). Aqui o payload da
                      própria barra diz qual mês foi clicado. */}
                  <Bar
                    yAxisId="left" dataKey="premio" name="Prêmio" fill="#3070c8" radius={[4, 4, 0, 0]}
                    onClick={(dados: unknown) => {
                      const mesKey = (dados as { payload?: RowMensal })?.payload?.mesKey
                        ?? (dados as RowMensal)?.mesKey
                      if (mesKey) alternarMes(mesKey, ctrlRef.current)
                    }}
                  >
                    {rowsFiltradas.map(r => (
                      <Cell
                        key={r.mesKey}
                        fill={mesesSel.includes(r.mesKey) ? '#e8b84b' : '#3070c8'}
                        opacity={mesesSel.length === 0 || mesesSel.includes(r.mesKey) ? 1 : 0.35}
                      />
                    ))}
                  </Bar>
                  <Line yAxisId="right" dataKey="taxaMedia" name="Taxa Méd. Mensal" stroke="#e8b84b" strokeWidth={2.5} dot={{ r: 4, fill: '#e8b84b' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabela mensal */}
          <div style={{ ...cardBox, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e4080' }}>
                Detalhamento por Mês — {anoSelecionado}
              </div>
              <button
                onClick={() => setMostrarFormulaMes(v => !v)}
                title="Como o prêmio por mês de vigência é calculado"
                style={{ ...btnInfo, background: mostrarFormulaMes ? '#e8f0fb' : 'white' }}
              >
                ⓘ prêmio por mês de vigência
              </button>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6080a0' }}>
                Clique num mês para abrir as operações
              </div>
            </div>
            {mostrarFormulaMes && (
              <div style={{ margin: '0 18px 16px' }}>
                <RacionalTaxaBox info={PREMIO_VIGENCIA_INFO} tema="claro" />
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thL}>Mês</th>
                    <th style={th}>Qtd. Ops</th>
                    <th style={th}>LMG Total</th>
                    <th style={th}>Prêmio na Emissão</th>
                    <th style={th}>Prêmio / Mês de Vigência</th>
                    <th style={th}>Taxa Méd. Mensal</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsFiltradas.map(r => {
                    const sel = mesesSel.includes(r.mesKey)
                    return (
                      <tr
                        key={r.mesKey}
                        onClick={e => alternarMes(r.mesKey, e.ctrlKey || e.metaKey)}
                        title="Clique para ver as operações emitidas · Ctrl+clique soma meses"
                        style={{
                          cursor: 'pointer',
                          background: sel ? '#fff8e8' : undefined,
                          boxShadow: sel ? 'inset 3px 0 0 #e8b84b' : undefined,
                        }}
                      >
                        <td style={{ ...tdL, color: sel ? '#1e4080' : tdL.color }}>
                          {sel ? '● ' : ''}{r.mesLabel}
                        </td>
                        <td style={td}>{r.qtd}</td>
                        <td style={td}>{fmtMoeda(r.lmg)}</td>
                        <td style={td}>{fmtMoeda(r.premio)}</td>
                        <td style={td}>{fmtMoeda(r.premioMes)}</td>
                        <td style={td}>{r.taxaMedia > 0 ? fmtPercent(r.taxaMedia / 100) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={tdTotalL}>Total {anoSelecionado}</td>
                    <td style={tdTotal}>{totais.qtd}</td>
                    <td style={tdTotal}>{fmtMoeda(totais.lmg)}</td>
                    <td style={tdTotal}>{fmtMoeda(totais.premio)}</td>
                    <td style={tdTotal}>{fmtMoeda(totais.premioMensalizado)}</td>
                    <td style={tdTotal}>{totais.taxaMedia > 0 ? fmtPercent(totais.taxaMedia / 100) : '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Relatório gerencial da seleção ───────────────────────────── */}
          <div ref={relatorioRef} style={{ scrollMarginTop: 16 }}>
            {mesesSel.length === 0 ? (
              <div style={{
                marginTop: 28, padding: '18px 20px', borderRadius: 12,
                border: '1.5px dashed #d0e4f5', background: '#f8fbff',
                fontSize: 13.5, color: '#6080a0', textAlign: 'center',
              }}>
                Clique num mês da tabela ou numa barra do gráfico para abrir as operações emitidas.
                Segure <b style={{ color: '#1e4080' }}>Ctrl</b> para somar vários meses.
              </div>
            ) : (
              <div style={{ ...cardBox, overflow: 'hidden', marginTop: 28 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  padding: '16px 18px 14px', background: '#f8fbff', borderBottom: '1.5px solid #d0e4f5',
                }}>
                  <div style={{ minWidth: 220, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e4080' }}>
                      Operações Emitidas — {rotuloSelecao}
                    </div>
                    <div style={{ fontSize: 12, color: '#6080a0' }}>
                      {mesesSel.length === 1
                        ? 'Um mês selecionado'
                        : `${mesesSel.length} meses somados`}
                      {' · '}{totaisSel.qtd} {totaisSel.qtd === 1 ? 'operação' : 'operações'}
                    </div>
                  </div>
                  <button onClick={() => setMesesSel([])} style={btn}>✕ Limpar seleção</button>
                </div>

                {/* KPIs da seleção */}
                <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', borderBottom: '1px solid #eef2f8' }}>
                  {[
                    { label: 'Operações', value: String(totaisSel.qtd) },
                    { label: 'Prêmio na Emissão', value: fmtMoeda(totaisSel.premio) },
                    { label: 'Prêmio / Mês de Vigência', value: fmtMoeda(totaisSel.premioMensalizado) },
                    { label: 'LMG Total', value: fmtMoeda(totaisSel.lmg) },
                    { label: 'Taxa Média Mensal', value: fmtPercent(totaisSel.taxaMedia / 100) },
                  ].map(c => (
                    <div key={c.label} data-kpi-selecao={c.label} style={{ flex: '1 1 170px', padding: '13px 18px', borderRight: '1px solid #eef2f8' }}>
                      <div style={{ fontSize: 10.5, color: '#6080a0', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 }}>{c.label}</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#1e4080' }}>{c.value}</div>
                    </div>
                  ))}
                </div>

                {/* Linhas: uma operação por linha */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
                    <thead>
                      <tr>
                        <th style={thL}>Emissão</th>
                        {mesesSel.length > 1 && <th style={thL}>Mês</th>}
                        <th style={thL}>Tomador</th>
                        <th style={thL}>Corretora</th>
                        <th style={thL}>Modalidade</th>
                        <th style={{ ...th, textAlign: 'center' }}>UF</th>
                        <th style={th}>LMG</th>
                        <th style={th}>Taxa</th>
                        <th style={{ ...th, textAlign: 'center' }}>Vigência</th>
                        <th style={th}>Prêmio</th>
                        <th style={th}>Prêmio / Mês</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opsSelecionadas.map(o => (
                        <tr key={o.id}>
                          <td style={{ ...td, textAlign: 'left', whiteSpace: 'nowrap' }}>
                            {o.data_emissao ? fmtData(o.data_emissao) : '—'}
                          </td>
                          {mesesSel.length > 1 && (
                            <td style={{ ...td, textAlign: 'left', color: '#6080a0', whiteSpace: 'nowrap' }}>
                              {mesLabel((o.data_emissao ?? '').substring(0, 7))}
                            </td>
                          )}
                          <td style={{ ...tdL, maxWidth: 260 }}>{nomeTomador(o)}</td>
                          <td style={{ ...td, textAlign: 'left', color: '#6080a0', maxWidth: 190 }}>{nomeCorretora(o)}</td>
                          <td style={{ ...td, textAlign: 'left', maxWidth: 170 }}>{o.modalidade ?? '—'}</td>
                          <td style={{ ...td, textAlign: 'center' }}>{o.estado ?? '—'}</td>
                          <td style={td}>{fmtMoeda(Math.min(o.lmg ?? 0, CAP_LMG))}</td>
                          <td style={td}>{fmtPercent((Number(o.taxa) || 0) / 100)}</td>
                          <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>{vigenciaTxt(o)}</td>
                          <td style={{ ...td, fontWeight: 700, color: '#1e4080' }}>{fmtMoeda(o.premio_previsto ?? 0)}</td>
                          <td style={td}>{fmtMoeda(premioPorMesDeVigencia(o))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        {/* Rótulo cobre até UF; daí em diante uma célula por coluna
                            (LMG, Taxa, Vigência vazia, Prêmio, Prêmio/Mês). */}
                        <td style={tdTotalL} colSpan={mesesSel.length > 1 ? 6 : 5}>
                          Total — {rotuloSelecao}
                        </td>
                        <td style={tdTotal}>{fmtMoeda(totaisSel.lmg)}</td>
                        <td style={tdTotal}>{fmtPercent(totaisSel.taxaMedia / 100)}</td>
                        <td style={tdTotal}></td>
                        <td style={tdTotal}>{fmtMoeda(totaisSel.premio)}</td>
                        <td style={tdTotal}>{fmtMoeda(totaisSel.premioMensalizado)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <PdfPreview pdf={pdf} titulo={`KPIs por Mês · ${anoSelecionado}`} onFechar={() => setPdf(null)} />
    </div>
  )
}
