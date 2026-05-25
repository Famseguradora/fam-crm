'use client'

import { useState, useEffect } from 'react'
import { C } from './types'
import type { useCockpit } from './useCockpit'
import type { Tomador } from '../FilaTomadores'

type CockpitHook = ReturnType<typeof useCockpit>
interface Props { cockpit: CockpitHook; tomador: Tomador }

const CHECKLIST_RESSEGURO = [
  'Histórico de inadimplência < 2%',
  'Sem recuperação judicial nos últimos 3 anos',
  'Patrimônio líquido > 20% IS',
  'Dívida/PL < 2,0x',
  'Liquidez corrente > 1,0x',
  'Sem protestos > R$ 50k',
  'Serasa PJ sem restrições críticas',
  'Sócios sem restrições relevantes',
  'Documentação completa e atualizada',
]

export default function PainelJuridico({ cockpit, tomador }: Props) {
  const meta = cockpit.sessao?.meta || {}
  const [form, setForm] = useState({
    acoes_judiciais: meta.acoes_judiciais != null ? String(meta.acoes_judiciais) : '',
    protestos: meta.protestos != null ? String(meta.protestos) : '',
    pefin: meta.pefin != null ? String(meta.pefin) : '',
    rec_judicial: meta.rec_judicial || false,
  })
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    Object.fromEntries(CHECKLIST_RESSEGURO.map(k => [k, false]))
  )
  const [processosExtra, setProcessosExtra] = useState('')
  const [novoProcesso, setNovoProcesso] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    const m = cockpit.sessao?.meta || {}
    setForm({
      acoes_judiciais: m.acoes_judiciais != null ? String(m.acoes_judiciais) : '',
      protestos: m.protestos != null ? String(m.protestos) : '',
      pefin: m.pefin != null ? String(m.pefin) : '',
      rec_judicial: m.rec_judicial || false,
    })
  }, [cockpit.sessao?.id])

  async function salvar() {
    setSalvando(true)
    await cockpit.salvarMeta({
      ...cockpit.sessao?.meta,
      acoes_judiciais: form.acoes_judiciais ? Number(form.acoes_judiciais) : undefined,
      protestos: form.protestos ? Number(form.protestos) : undefined,
      pefin: form.pefin ? Number(form.pefin) : undefined,
      rec_judicial: form.rec_judicial,
    })
    setSalvando(false)
    setOk(true)
    setTimeout(() => setOk(false), 2000)
  }

  const checkCount = Object.values(checklist).filter(Boolean).length
  const checkTotal = CHECKLIST_RESSEGURO.length

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: C.bg }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Jurídico & Compliance</h2>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Restrições, protestos e checklist de resseguro</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a
              href={`https://www.jusbrasil.com.br/consulta-processual/?q=${encodeURIComponent(tomador.cnpj || tomador.razao_social)}`}
              target="_blank" rel="noreferrer"
              style={{ fontSize: 11, padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.border}`, color: C.muted, textDecoration: 'none', background: 'transparent' }}
            >
              🔍 Jusbrasil
            </a>
            <button onClick={salvar} disabled={salvando}
              style={{ padding: '6px 16px', borderRadius: 7, border: `1px solid ${ok ? '#4ade8044' : C.accentBorder}`, background: ok ? 'rgba(74,222,128,0.08)' : C.accentBg, color: ok ? '#4ade80' : C.accent, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              {ok ? '✓ Salvo' : salvando ? 'Salvando…' : '💾 Salvar'}
            </button>
          </div>
        </div>

        {/* KPIs Jurídicos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Ações Judiciais', field: 'acoes_judiciais' as const, warn: 3 },
            { label: 'Protestos (R$k)', field: 'protestos' as const, warn: 50 },
            { label: 'PEFIN', field: 'pefin' as const, warn: 1 },
          ].map(kpi => {
            const val = form[kpi.field] ? Number(form[kpi.field]) : null
            const cor = val == null ? C.muted : val >= kpi.warn ? C.danger : C.success
            return (
              <div key={kpi.field} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '1px' }}>{kpi.label}</div>
                <input
                  type="number"
                  value={form[kpi.field]}
                  onChange={e => setForm(f => ({ ...f, [kpi.field]: e.target.value }))}
                  style={{ background: 'transparent', border: 'none', color: cor, fontSize: 22, fontWeight: 700, width: '100%', outline: 'none', padding: 0 }}
                  placeholder="0"
                />
              </div>
            )
          })}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '1px' }}>Rec. Judicial</div>
            <button
              onClick={() => setForm(f => ({ ...f, rec_judicial: !f.rec_judicial }))}
              style={{
                fontSize: 20, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer',
                color: form.rec_judicial ? C.danger : C.success,
                padding: 0,
              }}
            >
              {form.rec_judicial ? '⚠️ Sim' : '✓ Não'}
            </button>
          </div>
        </div>

        {/* Checklist Resseguro */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
              Checklist Resseguro
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: checkCount === checkTotal ? C.success : checkCount > checkTotal / 2 ? C.gold : C.warning }}>
              {checkCount}/{checkTotal}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CHECKLIST_RESSEGURO.map(item => (
              <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={checklist[item] || false}
                  onChange={e => setChecklist(c => ({ ...c, [item]: e.target.checked }))}
                  style={{ accentColor: C.success, width: 15, height: 15, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 12, color: checklist[item] ? C.text : C.muted, textDecoration: checklist[item] ? 'none' : 'none' }}>
                  {item}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Processos extras */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 14 }}>
            Processos / Pontos de Atenção
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={novoProcesso}
              onChange={e => setNovoProcesso(e.target.value)}
              placeholder="Descreva um processo ou ponto de atenção…"
              style={{ flex: 1, background: C.card2, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontSize: 12, padding: '7px 10px', outline: 'none', fontFamily: 'inherit' }}
              onKeyDown={e => {
                if (e.key === 'Enter' && novoProcesso.trim()) {
                  setProcessosExtra(p => p ? p + '\n' + novoProcesso.trim() : novoProcesso.trim())
                  setNovoProcesso('')
                }
              }}
            />
            <button
              onClick={() => {
                if (novoProcesso.trim()) {
                  setProcessosExtra(p => p ? p + '\n' + novoProcesso.trim() : novoProcesso.trim())
                  setNovoProcesso('')
                }
              }}
              style={{ padding: '7px 14px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 12 }}
            >
              + Adicionar
            </button>
          </div>
          {processosExtra && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {processosExtra.split('\n').map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(248,113,113,0.05)', border: `1px solid rgba(248,113,113,0.15)`, borderRadius: 6, padding: '7px 10px' }}>
                  <span style={{ color: C.danger, fontSize: 14, flexShrink: 0 }}>⚠️</span>
                  <span style={{ flex: 1, fontSize: 12, color: C.text, lineHeight: 1.5 }}>{item}</span>
                  <button
                    onClick={() => setProcessosExtra(p => p.split('\n').filter((_, j) => j !== i).join('\n'))}
                    style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          {!processosExtra && (
            <div style={{ fontSize: 12, color: C.muted }}>Nenhum processo registrado. Pressione Enter para adicionar.</div>
          )}
        </div>

      </div>
    </div>
  )
}
