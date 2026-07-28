'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtMoeda, fmtPercent } from '@/lib/utils'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { taxaMediaMensal, TAXA_MENSAL_INFO, type OpTaxaLike } from '@/lib/corretoras/agregacoes'
import { CAP_LMG } from '@/lib/operacoes/kpis'
import RacionalTaxaBox from '@/components/RacionalTaxaBox'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RowMensal {
  mesKey: string     // 'YYYY-MM'
  mesLabel: string   // 'Jan/26'
  qtd: number
  lmg: number
  premio: number
  taxaMedia: number  // taxa média MENSAL / competência (mesma escala que op.taxa, ex: 2.40)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function mesLabel(key: string): string {
  const [yyyy, mm] = key.split('-')
  return `${MESES_PT[parseInt(mm, 10) - 1]}/${yyyy.slice(2)}`
}

// Operação com os campos mínimos p/ o cálculo (taxa) + os de exibição.
type OpMensalRow = OpTaxaLike & { data_emissao: string | null; premio_previsto: number | null }

// Agrupa por mês de EMISSÃO usando a FONTE ÚNICA da taxa média ponderada
// (mesma função do cockpit e da tela de Operações). LMG limitado a 80M por op.
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
      taxaMedia: taxaMediaMensal(opsMes),
    }))
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #d0e4f5', borderRadius: 8, padding: '10px 14px', fontFamily: "'Calibri','Segoe UI',sans-serif", fontSize: 13 }}>
      <div style={{ fontWeight: 700, color: '#1e4080', marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name === 'Prêmio' ? fmtMoeda(p.value) : p.name === 'Taxa Méd. Mensal' ? fmtPercent(p.value / 100) : p.value}
          <span style={{ color: '#6080a0', marginLeft: 6, fontSize: 11 }}>{p.name}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KpisMensaisPage() {
  const router = useRouter()
  const supabase = createClient()

  const [ops, setOps] = useState<OpMensalRow[]>([])
  const [mostrarFormula, setMostrarFormula] = useState(false)
  const [loading, setLoading] = useState(true)
  const [anoSelecionado, setAnoSelecionado] = useState<string>(String(new Date().getFullYear()))
  const [anosDisponiveis, setAnosDisponiveis] = useState<string[]>([])

  useEffect(() => {
    async function carregar() {
      setLoading(true)
      const { data, error } = await supabase
        .from('operacoes')
        .select('data_emissao, lmg, premio_previsto, taxa, vigencia_dias, vigencia_anos, periodicidade_vigencia')
        .eq('status', 'Emitido')
        .eq('ativo', true)
        .not('data_emissao', 'is', null)

      if (error || !data) {
        setLoading(false)
        return
      }

      const lista = data as OpMensalRow[]
      const anos = [...new Set(lista.map(o => (o.data_emissao ?? '').substring(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a))
      setAnosDisponiveis(anos)
      if (!anos.includes(anoSelecionado) && anos.length > 0) setAnoSelecionado(anos[0])
      setOps(lista)
      setLoading(false)
    }
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = agruparPorMes(ops)
  const rowsFiltradas = rows.filter(r => r.mesKey.startsWith(anoSelecionado))
  // Total do ano pela FONTE ÚNICA (não dá para reconstruir a ponderada a partir das médias mensais).
  const opsAno = ops.filter(o => (o.data_emissao ?? '').startsWith(anoSelecionado))
  const totais = {
    qtd: opsAno.length,
    lmg: opsAno.reduce((s, o) => s + Math.min(o.lmg ?? 0, CAP_LMG), 0),
    premio: opsAno.reduce((s, o) => s + (o.premio_previsto ?? 0), 0),
  }
  const taxaMediaTotal = taxaMediaMensal(opsAno)

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

  return (
    <div style={{ fontFamily: font, maxWidth: 1100, margin: '0 auto', padding: '24px 20px 48px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <button
          onClick={() => router.back()}
          style={{
            padding: '7px 14px', borderRadius: 8, border: '1.5px solid #d0e4f5',
            background: 'white', color: '#1e4080', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ← Voltar
        </button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1e4080' }}>📅 KPIs por Mês</div>
          <div style={{ fontSize: 13, color: '#6080a0' }}>Operações Emitidas</div>
        </div>
        {anosDisponiveis.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: '#6080a0', fontWeight: 600 }}>Ano:</label>
            <select
              value={anoSelecionado}
              onChange={e => setAnoSelecionado(e.target.value)}
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
              { label: 'Prêmio Total', value: fmtMoeda(totais.premio), sub: anoSelecionado },
              { label: 'LMG Total', value: fmtMoeda(totais.lmg), sub: anoSelecionado },
              { label: 'Taxa Média Mensal', value: fmtPercent(taxaMediaTotal / 100), sub: 'competência · sobre LMG' },
            ].map(c => (
              <div key={c.label} style={{ flex: '1 1 180px', background: 'white', borderRadius: 12, padding: '14px 18px', border: '1.5px solid #d0e4f5', boxShadow: '0 1px 4px rgba(30,64,128,0.06)' }}>
                <div style={{ fontSize: 11, color: '#6080a0', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#1e4080' }}>{c.value}</div>
                <div style={{ fontSize: 11, color: '#a0b0c8' }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Gráfico */}
          <div style={{ background: 'white', borderRadius: 12, border: '1.5px solid #d0e4f5', padding: '20px 16px 8px', marginBottom: 28, boxShadow: '0 1px 4px rgba(30,64,128,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, paddingLeft: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e4080' }}>Prêmio Emitido &amp; Taxa Média Mensal por Mês</div>
              <button onClick={() => setMostrarFormula(v => !v)} title="Como a taxa média mensal é calculada"
                style={{ border: '1.5px solid #d0e4f5', background: mostrarFormula ? '#e8f0fb' : 'white', color: '#1e4080', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: font }}>
                ⓘ como é calculada
              </button>
            </div>
            {mostrarFormula && (
              <div style={{ margin: '0 8px 16px' }}>
                <RacionalTaxaBox info={TAXA_MENSAL_INFO} tema="claro" />
              </div>
            )}
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={rowsFiltradas} margin={{ top: 4, right: 40, left: 10, bottom: 4 }}>
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
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontFamily: font, fontSize: 12, paddingTop: 8 }} />
                <Bar yAxisId="left" dataKey="premio" name="Prêmio" fill="#3070c8" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" dataKey="taxaMedia" name="Taxa Méd. Mensal" stroke="#e8b84b" strokeWidth={2.5} dot={{ r: 4, fill: '#e8b84b' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Tabela */}
          <div style={{ background: 'white', borderRadius: 12, border: '1.5px solid #d0e4f5', overflow: 'hidden', boxShadow: '0 1px 4px rgba(30,64,128,0.06)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e4080', padding: '16px 18px 12px' }}>
              Detalhamento por Mês — {anoSelecionado}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thL}>Mês</th>
                    <th style={th}>Qtd. Ops</th>
                    <th style={th}>LMG Total</th>
                    <th style={th}>Prêmio Total</th>
                    <th style={th}>Taxa Méd. Mensal</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsFiltradas.map(r => (
                    <tr key={r.mesKey}>
                      <td style={tdL}>{r.mesLabel}</td>
                      <td style={td}>{r.qtd}</td>
                      <td style={td}>{fmtMoeda(r.lmg)}</td>
                      <td style={td}>{fmtMoeda(r.premio)}</td>
                      <td style={td}>{r.taxaMedia > 0 ? fmtPercent(r.taxaMedia / 100) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={tdTotalL}>Total {anoSelecionado}</td>
                    <td style={tdTotal}>{totais.qtd}</td>
                    <td style={tdTotal}>{fmtMoeda(totais.lmg)}</td>
                    <td style={tdTotal}>{fmtMoeda(totais.premio)}</td>
                    <td style={tdTotal}>{taxaMediaTotal > 0 ? fmtPercent(taxaMediaTotal / 100) : '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
