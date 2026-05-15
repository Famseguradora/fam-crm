'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tomador } from './FilaTomadores'
import type { CanvasData } from './Canvas'

interface Skill { id: string; titulo: string; fonte: 'global' | 'pessoal' }
interface Documento { nome: string; base64: string; mediaType: string }
interface Msg { role: 'user' | 'assistant'; content: string }

interface Props {
  tomador: Tomador | null
  onResposta: (data: CanvasData, rawText: string) => void
}

const c = {
  bg: '#070c1a',
  card: '#0d1428',
  border: 'rgba(255,255,255,0.07)',
  text: 'rgba(255,255,255,0.85)',
  muted: 'rgba(255,255,255,0.35)',
  accent: '#38bdf8',
  accentBg: 'rgba(56,189,248,0.08)',
  accentBorder: 'rgba(56,189,248,0.2)',
  purple: '#a78bfa',
  purpleBg: 'rgba(167,139,250,0.08)',
  success: '#4ade80',
  danger: '#f87171',
  dangerBg: 'rgba(248,113,113,0.08)',
  user: 'rgba(56,189,248,0.06)',
  assistant: 'rgba(255,255,255,0.03)',
}

const ACOES = [
  { label: 'Gerar Análise', prompt: 'Gere uma análise de crédito completa deste tomador seguindo o modelo 3Cs e a metodologia COD-EEC V001-2025. Retorne JSON com campos: empresa, indicadores (com educacional), rating_fam, limite_sugerido, blocos (texto da análise).' },
  { label: 'Detectar Riscos', prompt: 'Identifique e liste os principais riscos de crédito deste tomador. Retorne JSON com campos: riscos (array com: categoria, descricao, severidade), blocos.' },
  { label: 'Gerar Parecer', prompt: 'Redija um parecer técnico de crédito formal para este tomador. Retorne JSON com campos: parecer_texto, recomendacao, condicoes, blocos.' },
  { label: 'Resumo Executivo', prompt: 'Gere um resumo executivo deste tomador em linguagem objetiva para tomada de decisão. Retorne JSON com campos: pontos_positivos, pontos_negativos, conclusao, blocos.' },
]

function tryParseJSON(text: string): CanvasData | null {
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return null
  }
}

export default function AssistenteIA({ tomador, onResposta }: Props) {
  const supabase = createClient()
  const [skills, setSkills] = useState<Skill[]>([])
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [historico, setHistorico] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { carregarSkills() }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [historico])
  useEffect(() => { setHistorico([]); setDocumentos([]) }, [tomador?.id])

  async function carregarSkills() {
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data: globais }, { data: pessoais }] = await Promise.all([
      supabase.from('fam_skills_global').select('id, titulo').eq('ativo', true),
      user
        ? supabase.from('fam_skills_usuario').select('id, titulo').eq('user_id', user.id).eq('ativo', true)
        : Promise.resolve({ data: [] }),
    ])
    const lista: Skill[] = [
      ...(globais || []).map((g: { id: string; titulo: string }) => ({ ...g, fonte: 'global' as const })),
      ...(pessoais || []).map((p: { id: string; titulo: string }) => ({ ...p, fonte: 'pessoal' as const })),
    ]
    setSkills(lista)
  }

  async function enviar(mensagem: string) {
    if (!mensagem.trim() || carregando) return
    const msg = mensagem.trim()
    setInput('')
    setCarregando(true)

    const novaMsg: Msg = { role: 'user', content: msg }
    const historicoAtual = [...historico, novaMsg]
    setHistorico(historicoAtual)

    try {
      const res = await fetch('/api/analise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagem: msg,
          tomador_id: tomador?.id,
          tomadorNome: tomador?.razao_social,
          documentos,
          historico: historico.map(h => ({ role: h.role, content: h.content })),
        }),
      })
      const json = await res.json()
      const resposta: string = json.resposta || json.erro || 'Erro ao processar.'
      setHistorico([...historicoAtual, { role: 'assistant', content: resposta }])

      const parsed = tryParseJSON(resposta)
      if (parsed) onResposta(parsed, resposta)
    } catch {
      setHistorico([...historicoAtual, { role: 'assistant', content: 'Erro de conexão.' }])
    } finally {
      setCarregando(false)
    }
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        const b64 = (reader.result as string).split(',')[1]
        setDocumentos(prev => [...prev, { nome: file.name, base64: b64, mediaType: file.type }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  return (
    <div style={{ width: 280, minWidth: 280, display: 'flex', flexDirection: 'column', background: c.bg, borderLeft: `1px solid ${c.border}`, height: '100%' }}>

      {/* Skills pills */}
      <div style={{ padding: '10px 10px 8px', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: c.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>Skills ativas</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {skills.length === 0 && <span style={{ fontSize: 11, color: c.muted }}>Nenhuma</span>}
          {skills.map(s => (
            <span key={s.id} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: s.fonte === 'global' ? c.purpleBg : c.accentBg, color: s.fonte === 'global' ? c.purple : c.accent, border: `0.5px solid ${s.fonte === 'global' ? 'rgba(167,139,250,0.25)' : c.accentBorder}` }}>
              {s.titulo.length > 22 ? s.titulo.slice(0, 22) + '…' : s.titulo}
            </span>
          ))}
        </div>
      </div>

      {/* Upload */}
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }} onChange={handleUpload} />
        <button
          onClick={() => fileRef.current?.click()}
          style={{ width: '100%', fontSize: 11, padding: '6px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.03)', color: c.muted, border: `0.5px dashed ${c.border}`, textAlign: 'center' }}
        >
          ↑ Enviar documentos (PDF / imagem)
        </button>
        {documentos.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {documentos.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: c.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{d.nome}</span>
                <button onClick={() => setDocumentos(prev => prev.filter((_, j) => j !== i))} style={{ fontSize: 10, color: c.danger, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ações rápidas */}
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {ACOES.map(a => (
            <button
              key={a.label}
              onClick={() => enviar(a.prompt)}
              disabled={carregando || !tomador}
              style={{ fontSize: 10, padding: '6px 4px', borderRadius: 6, cursor: carregando || !tomador ? 'not-allowed' : 'pointer', background: c.accentBg, color: tomador ? c.accent : c.muted, border: `0.5px solid ${tomador ? c.accentBorder : c.border}`, textAlign: 'center', opacity: carregando ? 0.5 : 1 }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Histórico */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {historico.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: c.muted, fontSize: 12, lineHeight: 1.6 }}>
            {tomador ? `Análise de ${tomador.razao_social}. Use os botões acima ou digite uma pergunta.` : 'Selecione um tomador na fila para iniciar.'}
          </div>
        )}
        {historico.map((msg, i) => (
          <div key={i} style={{ padding: '10px 12px', background: msg.role === 'user' ? c.user : c.assistant, borderBottom: `0.5px solid ${c.border}` }}>
            <div style={{ fontSize: 9, color: msg.role === 'user' ? c.accent : c.muted, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              {msg.role === 'user' ? 'Você' : 'IA'}
            </div>
            <div style={{ fontSize: 12, color: c.text, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto' }}>
              {msg.content.length > 500 ? msg.content.slice(0, 500) + '…' : msg.content}
            </div>
          </div>
        ))}
        {carregando && (
          <div style={{ padding: '10px 12px', color: c.muted, fontSize: 12 }}>
            <span style={{ animation: 'pulse 1.5s infinite' }}>Analisando...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '8px 10px', borderTop: `1px solid ${c.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(input) } }}
            placeholder={tomador ? 'Pergunte algo...' : 'Selecione um tomador'}
            disabled={!tomador || carregando}
            rows={2}
            style={{ flex: 1, fontSize: 12, padding: '7px 10px', borderRadius: 6, resize: 'none', background: 'rgba(255,255,255,0.05)', color: c.text, border: `0.5px solid ${c.border}`, outline: 'none', fontFamily: 'inherit', lineHeight: 1.4 }}
          />
          <button
            onClick={() => enviar(input)}
            disabled={!tomador || carregando || !input.trim()}
            style={{ padding: '7px 10px', borderRadius: 6, cursor: 'pointer', background: c.accentBg, color: c.accent, border: `0.5px solid ${c.accentBorder}`, fontSize: 14, opacity: (!tomador || carregando || !input.trim()) ? 0.4 : 1 }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
