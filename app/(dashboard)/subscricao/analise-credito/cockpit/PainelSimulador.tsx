'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { C, fmtBRL, fmtPct, type OperacaoReal } from './types'
import type { useCockpit } from './useCockpit'
import type { Tomador } from '../FilaTomadores'

type CockpitHook = ReturnType<typeof useCockpit>
interface Props { cockpit: CockpitHook; tomador: Tomador }

interface FormSim {
  nome: string
  is_valor: string
  taxa: string
  comissao: string
  vigencia_meses: string
  data_inicio: string
}

const FORM_VAZIO: FormSim = { nome: '', is_valor: '', taxa: '', comissao: '', vigencia_meses: '12', data_inicio: '' }

export default function PainelSimulador({ cockpit, tomador }: Props) {
  const supabase = createClient()
  const [opsBase, setOpsBase] = useState<OperacaoReal[]>([])
  const [form, setForm] = useState<FormSim>(FORM_VAZIO)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregarBase()
  }, [])

  async function carregarBase() {
    setLoading(true)
    const { data } = await supabase
      .from('operacoes')
      .select('id, tomador_id, tomadores(razao_social), modalidade, lmg, taxa, vigencia_anos, premio_previsto, status, data_entrada')
      .eq('ativo', true)
    setOpsBase((data as unknown as OperacaoReal[]) || [])
    setLoading(false)
  }

  async function adicionarSimulacao() {
    if (!form.nome || !form.is_valor || !form.taxa) return
    await cockpit.salvarSimulacao({
      nome: form.nome,
      is_valor: Number(form.is_valor),
      taxa: Number(form.taxa) / 100,
      comissao: form.comissao ? Number(form.comissao) : null,
      vigencia_meses: form.vigencia_meses ? Number(form.vigencia_meses) : null,
      data_inicio: form.data_inicio || null,
      ativo: true,
    })
    setForm(FORM_VAZIO)
  }

  // KPIs do book base
  const baseIS = useMemo(() => opsBase.reduce((s, o) => s + (o.lmg || 0), 0), [opsBase])
  const basePremio = useMemo(() => opsBase.reduce((s, o) => s + (o.premio_previsto || 0), 0), [opsBase])
  const baseTaxaMed = useMemo(() => {
    const sumIS = opsBase.reduce((s, o) => s + (o.lmg || 0), 0)
    if (!sumIS) return 0
    return opsBase.reduce((s, o) => s + (o.taxa || 0) * (o.lmg || 0), 0) / sumIS
  }, [opsBase])

  // Cenários ativos: base + simulações ativas (cascata)
  const simsAtivas = cockpit.simulacoes.filter(s => s.ativo)

  const simIS = useMemo(() => simsAtivas.reduce((s, sim) => s + (sim.is_valor || 0), 0), [simsAtivas])
  const simPremio = useMemo(() => simsAtivas.reduce((s, sim) => {
    const vig = (sim.vigencia_meses || 12) / 12
    return s + (sim.is_valor || 0) * (sim.taxa || 0) * vig
  }, 0), [simsAtivas])
  const totalIS = baseIS + simIS
  const totalPremio = basePremio + simPremio
  const totalTaxaMed = useMemo(() => {
    if (!totalIS) return 0
    const simContrib = simsAtivas.reduce((s, sim) => s + (sim.taxa || 0) * (sim.is_valor || 0), 0)
    return (baseTaxaMed * baseIS + simContrib) / totalIS
  }, [simsAtivas, baseIS, baseTaxaMed, totalIS])

  // Gráfico temporal 36 meses
  const grafData = useMemo(() => {
    const hoje = new Date()
    return Array.from({ length: 36 }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })

      // IS base ativo neste mês (simplificado: operações sem data_entrada contam sempre)
      const baseAtivo = opsBase
        .filter(o => !o.data_entrada || new Date(o.data_entrada) <= d)
        .reduce((s, o) => s + (o.lmg || 0), 0)

      // IS simulações ativas neste mês
      const simAtivo = simsAtivas.reduce((s, sim) => {
        if (!sim.data_inicio) return s + (sim.is_valor || 0)
        const ini = new Date(sim.data_inicio)
        const fim = new Date(ini)
        fim.setMonth(fim.getMonth() + (sim.vigencia_meses || 12))
        if (d >= ini && d <= fim) return s + (sim.is_valor || 0)
        return s
      }, 0)

      return { name: label, base: baseAtivo, simulado: simAtivo }
    })
  }, [opsBase, simsAtivas])

  const tooltipStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, color: C.text }

  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}><div style={{ color: C.muted }}>Carregando…</div></div>
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: C.bg, padding: '16px 20px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>

        {/* Antes / Depois */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <BeforeAfterCard title="Book Base (Atual)" is={baseIS} premio={basePremio} taxa={baseTaxaMed} cor={C.accent} />
          <BeforeAfterCard title="Com Simulações Ativas" is={totalIS} premio={totalPremio} taxa={totalTaxaMed} cor={C.gold}
            delta={{ is: simIS, premio: simPremio }} />
        </div>

        {/* Formulário nova simulação */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 14 }}>
            Nova Simulação
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Input label="Nome da simulação" value={form.nome} onChange={v => setForm(f => ({ ...f, nome: v }))} placeholder="ex: Nova operação Gabbai" />
            </div>
            <Input label="IS (R$)" type="number" value={form.is_valor} onChange={v => setForm(f => ({ ...f, is_valor: v }))} placeholder="5000000" />
            <Input label="Taxa (%)" type="number" value={form.taxa} onChange={v => setForm(f => ({ ...f, taxa: v }))} placeholder="1.5" />
            <Input label="Comissão (%)" type="number" value={form.comissao} onChange={v => setForm(f => ({ ...f, comissao: v }))} placeholder="30" />
            <Input label="Vigência (meses)" type="number" value={form.vigencia_meses} onChange={v => setForm(f => ({ ...f, vigencia_meses: v }))} placeholder="12" />
            <Input label="Data início" type="date" value={form.data_inicio} onChange={v => setForm(f => ({ ...f, data_inicio: v }))} />
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={adicionarSimulacao}
                disabled={!form.nome || !form.is_valor || !form.taxa || !cockpit.sessao}
                style={{
                  width: '100%', padding: '8px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${C.goldBorder}`, background: C.goldBg, color: C.gold,
                  opacity: (!form.nome || !form.is_valor || !form.taxa || !cockpit.sessao) ? 0.5 : 1,
                }}
              >
                + Adicionar Cenário
              </button>
            </div>
          </div>
          {!cockpit.sessao && (
            <div style={{ marginTop: 8, fontSize: 11, color: C.warning }}>⚠️ Importe uma análise HTML primeiro para salvar simulações.</div>
          )}
        </div>

        {/* Cenários salvos */}
        {cockpit.simulacoes.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 14 }}>
              Cenários Salvos ({cockpit.simulacoes.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cockpit.simulacoes.map(sim => {
                const premioSim = (sim.is_valor || 0) * (sim.taxa || 0) * ((sim.vigencia_meses || 12) / 12)
                return (
                  <div key={sim.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: sim.ativo ? C.goldBg : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${sim.ativo ? C.goldBorder : C.border}`,
                    borderRadius: 8, padding: '10px 14px',
                  }}>
                    <input type="checkbox" checked={sim.ativo}
                      onChange={e => cockpit.toggleSimulacao(sim.id, e.target.checked)}
                      style={{ accentColor: C.gold, width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: sim.ativo ? C.gold : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sim.nome}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        IS: {fmtBRL(sim.is_valor)} · Taxa: {fmtPct(sim.taxa)} · {sim.vigencia_meses}m · Prêmio: <span style={{ color: C.gold }}>{fmtBRL(premioSim)}</span>
                        {sim.comissao != null && ` · Com.: ${sim.comissao}%`}
                      </div>
                    </div>
                    <button onClick={() => cockpit.removerSimulacao(sim.id)}
                      style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0 }}
                      title="Excluir">×</button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Gráfico temporal */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 14 }}>
            IS Ativo — Próximos 36 meses
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={grafData} margin={{ left: 8, right: 8 }}>
              <defs>
                <linearGradient id="gradBase" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.accent} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradSim" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.gold} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C.gold} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.muted }} interval={5} />
              <YAxis tick={{ fontSize: 9, fill: C.muted }} tickFormatter={v => (v / 1e6).toFixed(1) + 'M'} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => fmtBRL(Number(v))} />
              <Area type="monotone" dataKey="base" name="Book Base" stroke={C.accent} fill="url(#gradBase)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="simulado" name="Simulado" stroke={C.gold} fill="url(#gradSim)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
            <Legend color={C.accent} label="Book Base" />
            <Legend color={C.gold} label="Simulações Ativas" />
          </div>
        </div>

      </div>
    </div>
  )
}

function BeforeAfterCard({ title, is, premio, taxa, cor, delta }: { title: string; is: number; premio: number; taxa: number; cor: string; delta?: { is: number; premio: number } }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <KpiRow label="IS Total" valor={fmtBRL(is)} cor={cor} delta={delta ? fmtBRL(delta.is) : undefined} />
        <KpiRow label="Prêmio Total" valor={fmtBRL(premio)} cor={cor} delta={delta ? fmtBRL(delta.premio) : undefined} />
        <KpiRow label="Taxa Média Pond." valor={fmtPct(taxa)} cor="#a78bfa" />
      </div>
    </div>
  )
}

function KpiRow({ label, valor, cor, delta }: { label: string; valor: string; cor: string; delta?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {delta && <span style={{ fontSize: 10, color: C.success }}>+{delta}</span>}
        <span style={{ fontSize: 15, fontWeight: 700, color: cor }}>{valor}</span>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 10, color: '#4a7ab5', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ background: '#080f1f', border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontSize: 12, padding: '7px 10px', outline: 'none', fontFamily: 'inherit' }}
        onFocus={e => e.currentTarget.style.borderColor = C.accent}
        onBlur={e => e.currentTarget.style.borderColor = C.border}
      />
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted }}>
      <span style={{ width: 12, height: 3, background: color, borderRadius: 2, display: 'inline-block' }} />
      {label}
    </span>
  )
}
