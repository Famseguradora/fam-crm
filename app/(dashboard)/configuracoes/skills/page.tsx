'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Skill {
  id: string
  titulo: string
  conteudo: string
  ativo: boolean
  ordem: number
}

interface GlobalSkill {
  id: string
  titulo: string
  versao: string
  ativo: boolean
}

const MAX_SKILLS = 3

export default function SkillsConfig() {
  const supabase = createClient()
  const [skills, setSkills] = useState<Skill[]>([])
  const [globals, setGlobals] = useState<GlobalSkill[]>([])
  const [editando, setEditando] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [form, setForm] = useState({ titulo: '', conteudo: '' })
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const c = {
    bg: '#060b18', card: '#0d1428',
    border: 'rgba(255,255,255,0.08)',
    text: 'rgba(255,255,255,0.85)',
    muted: 'rgba(255,255,255,0.35)',
    accent: '#38bdf8', accentBg: 'rgba(56,189,248,0.08)',
    accentBorder: 'rgba(56,189,248,0.2)',
    purple: '#a78bfa', purpleBg: 'rgba(139,92,246,0.08)',
    success: '#4ade80', successBg: 'rgba(74,222,128,0.08)',
    danger: '#f87171', dangerBg: 'rgba(248,113,113,0.08)',
  }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: pessoais }, { data: globais }] = await Promise.all([
      supabase.from('fam_skills_usuario').select('*').eq('user_id', user.id).order('ordem'),
      supabase.from('fam_skills_global').select('id, titulo, versao, ativo').order('criado_em'),
    ])
    setSkills(pessoais || [])
    setGlobals(globais || [])
    setLoading(false)
  }

  async function salvar() {
    if (!form.titulo.trim() || !form.conteudo.trim()) { setErro('Titulo e conteudo sao obrigatorios.'); return }
    setSalvando(true); setErro('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (editando) {
      const { error } = await supabase.from('fam_skills_usuario')
        .update({ titulo: form.titulo.trim(), conteudo: form.conteudo.trim() })
        .eq('id', editando).eq('user_id', user.id)
      if (error) { setErro(error.message); setSalvando(false); return }
    } else {
      const { error } = await supabase.from('fam_skills_usuario')
        .insert({ user_id: user.id, titulo: form.titulo.trim(), conteudo: form.conteudo.trim(), ordem: skills.length + 1 })
      if (error) {
        setErro(error.message.includes('Limite') ? 'Limite de 3 skills ativas atingido.' : error.message)
        setSalvando(false); return
      }
    }
    setForm({ titulo: '', conteudo: '' }); setEditando(null); setNovo(false)
    await load(); setSalvando(false)
  }

  async function toggleAtivo(skill: Skill) {
    await supabase.from('fam_skills_usuario').update({ ativo: !skill.ativo }).eq('id', skill.id)
    await load()
  }

  async function excluir(id: string) {
    await supabase.from('fam_skills_usuario').delete().eq('id', id)
    await load()
  }

  function abrirEdicao(skill: Skill) {
    setEditando(skill.id); setForm({ titulo: skill.titulo, conteudo: skill.conteudo })
    setNovo(false); setErro('')
  }

  function cancelar() {
    setEditando(null); setNovo(false)
    setForm({ titulo: '', conteudo: '' }); setErro('')
  }

  const podeAdicionar = skills.length < MAX_SKILLS
  const ativasCount = skills.filter(s => s.ativo).length

  if (loading) return <div style={{ padding: 24, color: c.muted, fontSize: 13 }}>Carregando...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24, maxWidth: 760 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 500, color: c.text, marginBottom: 4 }}>Skills de IA</div>
        <div style={{ fontSize: 13, color: c.muted }}>Conhecimento injetado automaticamente em cada analise. Skills ativas carregam no system prompt.</div>
      </div>

      <div style={{ background: c.card, border: `0.5px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `0.5px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.purple }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: c.text }}>Base Global FAM</span>
          <span style={{ fontSize: 11, color: c.muted, marginLeft: 4 }}>gerenciada pelo ADM Master — sempre ativa</span>
        </div>
        {globals.map((g, i) => (
          <div key={g.id} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < globals.length - 1 ? `0.5px solid ${c.border}` : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: c.text }}>{g.titulo}</div>
              <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>versao {g.versao}</div>
            </div>
            <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: g.ativo ? c.successBg : c.dangerBg, color: g.ativo ? c.success : c.danger, border: `0.5px solid ${g.ativo ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}` }}>
              {g.ativo ? 'Ativa' : 'Inativa'}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: c.card, border: `0.5px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `0.5px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.accent }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: c.text }}>Suas Skills Pessoais</span>
          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, marginLeft: 4, background: ativasCount > 0 ? c.accentBg : 'rgba(255,255,255,0.05)', color: ativasCount > 0 ? c.accent : c.muted, border: `0.5px solid ${ativasCount > 0 ? c.accentBorder : c.border}` }}>
            {skills.length}/{MAX_SKILLS}
          </span>
          <div style={{ marginLeft: 'auto' }}>
            {podeAdicionar && !novo && !editando && (
              <button onClick={() => { setNovo(true); setEditando(null); setForm({ titulo: '', conteudo: '' }) }}
                style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: c.accentBg, color: c.accent, border: `0.5px solid ${c.accentBorder}` }}>
                + Nova skill
              </button>
            )}
          </div>
        </div>

        {skills.length === 0 && !novo && (
          <div style={{ padding: 24, textAlign: 'center', color: c.muted, fontSize: 13 }}>
            Nenhuma skill pessoal configurada ainda.
          </div>
        )}

        {skills.map((skill, i) => (
          <div key={skill.id} style={{ borderBottom: i < skills.length - 1 || novo || editando === skill.id ? `0.5px solid ${c.border}` : 'none' }}>
            {editando === skill.id
              ? <FormSkill form={form} setForm={setForm} erro={erro} salvando={salvando} onSalvar={salvar} onCancelar={cancelar} c={c} />
              : (
                <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 3 }}>{skill.titulo}</div>
                    <div style={{ fontSize: 11, color: c.muted, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, lineHeight: 1.5 }}>{skill.conteudo}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => toggleAtivo(skill)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, cursor: 'pointer', background: skill.ativo ? c.successBg : 'rgba(255,255,255,0.05)', color: skill.ativo ? c.success : c.muted, border: `0.5px solid ${skill.ativo ? 'rgba(74,222,128,0.25)' : c.border}` }}>
                      {skill.ativo ? 'Ativa' : 'Inativa'}
                    </button>
                    <button onClick={() => abrirEdicao(skill)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: c.muted, border: `0.5px solid ${c.border}` }}>Editar</button>
                    <button onClick={() => excluir(skill.id)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 5, cursor: 'pointer', background: c.dangerBg, color: c.danger, border: '0.5px solid rgba(248,113,113,0.2)' }}>Excluir</button>
                  </div>
                </div>
              )}
          </div>
        ))}

        {novo && <FormSkill form={form} setForm={setForm} erro={erro} salvando={salvando} onSalvar={salvar} onCancelar={cancelar} c={c} />}
      </div>

      <div style={{ fontSize: 11, color: c.muted, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: `0.5px solid ${c.border}` }}>
        Skills inativas nao sao carregadas — zero consumo de tokens. A base global FAM e sempre injetada independentemente.
      </div>
    </div>
  )
}

function FormSkill({ form, setForm, erro, salvando, onSalvar, onCancelar, c }: {
  form: { titulo: string; conteudo: string }
  setForm: (f: { titulo: string; conteudo: string }) => void
  erro: string; salvando: boolean
  onSalvar: () => void; onCancelar: () => void
  c: Record<string, string>
}) {
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })}
        placeholder="Titulo da skill (ex: Especializacao Construcao Civil)" maxLength={80}
        style={{ fontSize: 13, padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: c.text, border: `0.5px solid rgba(255,255,255,0.15)`, outline: 'none' }} />
      <textarea value={form.conteudo} onChange={e => setForm({ ...form, conteudo: e.target.value })}
        placeholder="Cole sua metodologia, criterios especificos ou instrucoes de analise..." rows={8} maxLength={4000}
        style={{ fontSize: 12, padding: '10px 12px', borderRadius: 6, resize: 'vertical', background: 'rgba(255,255,255,0.05)', color: c.text, border: `0.5px solid rgba(255,255,255,0.15)`, outline: 'none', lineHeight: 1.6, fontFamily: 'inherit' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 10, color: c.muted }}>{form.conteudo.length}/4000</div>
        {erro && <div style={{ fontSize: 11, color: c.danger }}>{erro}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancelar} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: c.muted, border: `0.5px solid ${c.border}` }}>Cancelar</button>
        <button onClick={onSalvar} disabled={salvando} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, cursor: salvando ? 'not-allowed' : 'pointer', background: c.accentBg, color: c.accent, border: `0.5px solid ${c.accentBorder}`, opacity: salvando ? 0.6 : 1 }}>
          {salvando ? 'Salvando...' : 'Salvar skill'}
        </button>
      </div>
    </div>
  )
}
