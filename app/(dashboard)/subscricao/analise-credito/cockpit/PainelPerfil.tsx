'use client'

import { useState, useEffect } from 'react'
import { C, fmtBRL } from './types'
import type { useCockpit } from './useCockpit'
import type { Tomador } from '../FilaTomadores'

type CockpitHook = ReturnType<typeof useCockpit>
interface Props { cockpit: CockpitHook; tomador: Tomador }

export default function PainelPerfil({ cockpit, tomador }: Props) {
  const meta = cockpit.sessao?.meta || {}
  const [form, setForm] = useState({
    razao_social: meta.razao_social || tomador.razao_social,
    cnpj: meta.cnpj || tomador.cnpj || '',
    fundacao: meta.fundacao || '',
    cidade: meta.cidade || '',
    setor: meta.setor || '',
    serasa_score: meta.serasa_score != null ? String(meta.serasa_score) : '',
    score_fam: meta.score_fam != null ? String(meta.score_fam) : '',
    rating: meta.rating || '',
    limite: meta.limite != null ? String(meta.limite) : '',
    recomendacao: meta.recomendacao || '',
  })
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    const m = cockpit.sessao?.meta || {}
    setForm({
      razao_social: m.razao_social || tomador.razao_social,
      cnpj: m.cnpj || tomador.cnpj || '',
      fundacao: m.fundacao || '',
      cidade: m.cidade || '',
      setor: m.setor || '',
      serasa_score: m.serasa_score != null ? String(m.serasa_score) : '',
      score_fam: m.score_fam != null ? String(m.score_fam) : '',
      rating: m.rating || '',
      limite: m.limite != null ? String(m.limite) : '',
      recomendacao: m.recomendacao || '',
    })
  }, [cockpit.sessao?.id])

  async function salvar() {
    setSalvando(true)
    await cockpit.salvarMeta({
      ...cockpit.sessao?.meta,
      razao_social: form.razao_social,
      cnpj: form.cnpj,
      fundacao: form.fundacao,
      cidade: form.cidade,
      setor: form.setor,
      serasa_score: form.serasa_score ? Number(form.serasa_score) : undefined,
      score_fam: form.score_fam ? Number(form.score_fam) : undefined,
      rating: form.rating || undefined,
      limite: form.limite ? Number(form.limite) : undefined,
      recomendacao: form.recomendacao || undefined,
    })
    setSalvando(false)
    setOk(true)
    setTimeout(() => setOk(false), 2000)
  }

  const Campo = ({ label, field, type = 'text', hint }: { label: string; field: keyof typeof form; type?: string; hint?: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 10, color: '#4a7ab5', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</label>
      <input
        type={type}
        value={form[field]}
        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        placeholder={hint}
        style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 5,
          color: C.text, fontSize: 13, padding: '7px 10px', outline: 'none',
          fontFamily: 'inherit',
        }}
        onFocus={e => e.currentTarget.style.borderColor = C.accent}
        onBlur={e => e.currentTarget.style.borderColor = C.border}
      />
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: C.bg }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Perfil da Empresa</h2>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Dados extraídos da análise e editáveis</div>
          </div>
          <button
            onClick={salvar}
            disabled={salvando}
            style={{
              padding: '8px 20px', borderRadius: 7, border: `1px solid ${ok ? '#4ade8044' : C.accentBorder}`,
              background: ok ? 'rgba(74,222,128,0.08)' : C.accentBg,
              color: ok ? '#4ade80' : C.accent, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            {ok ? '✓ Salvo' : salvando ? 'Salvando…' : '💾 Salvar'}
          </button>
        </div>

        {/* Identificação */}
        <Section title="Identificação">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Campo label="Razão Social" field="razao_social" />
            </div>
            <Campo label="CNPJ" field="cnpj" hint="00.000.000/0001-00" />
            <Campo label="Fundação" field="fundacao" hint="ex: 2005" />
            <Campo label="Cidade / Estado" field="cidade" hint="ex: São Paulo / SP" />
            <Campo label="Setor" field="setor" hint="ex: Construção Civil" />
          </div>
        </Section>

        {/* Score & Rating */}
        <Section title="Score & Rating FAM">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Campo label="Score FAM" field="score_fam" type="number" hint="0–1000" />
            <Campo label="Serasa Score" field="serasa_score" type="number" hint="0–1000" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: '#4a7ab5', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Rating</label>
              <select
                value={form.rating}
                onChange={e => setForm(f => ({ ...f, rating: e.target.value }))}
                style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontSize: 13, padding: '7px 10px', outline: 'none', fontFamily: 'inherit' }}
              >
                <option value="">— selecionar —</option>
                {['AAA','AA','A','BBB','BB','B','CCC','CC','C','D'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
        </Section>

        {/* Limite & Recomendação */}
        <Section title="Limite & Recomendação">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Campo label="Limite Sugerido (R$)" field="limite" type="number" hint="ex: 5000000" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: '#4a7ab5', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Recomendação</label>
              <select
                value={form.recomendacao}
                onChange={e => setForm(f => ({ ...f, recomendacao: e.target.value }))}
                style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontSize: 13, padding: '7px 10px', outline: 'none', fontFamily: 'inherit' }}
              >
                <option value="">— selecionar —</option>
                <option>Aprovado</option>
                <option>Aprovado com Restrições</option>
                <option>Em Análise</option>
                <option>Não Recomendado</option>
                <option>Recusado</option>
              </select>
            </div>
          </div>
        </Section>

      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  )
}
