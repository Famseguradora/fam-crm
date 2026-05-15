'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const c = {
  bg: '#060b18',
  card: '#0d1428',
  border: 'rgba(255,255,255,0.08)',
  text: 'rgba(255,255,255,0.85)',
  muted: 'rgba(255,255,255,0.35)',
  accent: '#e8b84b',
  accentBg: 'rgba(232,184,75,0.08)',
  accentBorder: 'rgba(232,184,75,0.25)',
  blue: '#38bdf8',
  blueBg: 'rgba(56,189,248,0.08)',
  success: '#4ade80',
  successBg: 'rgba(74,222,128,0.08)',
}

const BLOCOS = [
  { nome: 'Identidade', icon: '👤' },
  { nome: 'Estilo', icon: '🎯' },
  { nome: 'Critérios', icon: '📊' },
  { nome: 'Preferências', icon: '⚙️' },
]

type Pergunta = { campo: string; texto: string; bloco: number }

const PERGUNTAS: Pergunta[] = [
  { campo: 'nome', texto: 'Qual é o seu nome completo?', bloco: 0 },
  { campo: 'cargo', texto: 'Qual é o seu cargo?', bloco: 0 },
  { campo: 'empresa', texto: 'Em qual empresa você atua?', bloco: 0 },
  { campo: 'anos_experiencia', texto: 'Há quantos anos você trabalha com análise de crédito?', bloco: 0 },
  { campo: 'perfil_analista', texto: 'Como você descreveria seu perfil de análise: conservador, moderado ou arrojado? Pode explicar brevemente.', bloco: 1 },
  { campo: 'setores_expertise', texto: 'Em quais setores você tem mais expertise? (pode listar separados por vírgula)', bloco: 2 },
  { campo: 'setores_cautela', texto: 'Em quais setores você prefere ter cautela extra?', bloco: 2 },
  { campo: 'indicador_critico', texto: 'Qual é o indicador financeiro mais crítico para você em uma análise de crédito?', bloco: 2 },
  { campo: 'regras_pessoais', texto: 'Você tem regras próprias que sempre aplica nas suas análises? Quais são elas?', bloco: 2 },
  { campo: 'preferencia_detalhe', texto: 'Para finalizar: você prefere análises mais detalhadas e fundamentadas, ou mais objetivas e diretas? E para quem normalmente as destina?', bloco: 3 },
]

const ACKS = ['Entendido.', 'Anotado.', 'Perfeito.', 'Ótimo.', 'Registrado.', 'Certo.', 'Compreendido.']

type Msg = { from: 'bot' | 'user'; text: string }

function extractPerfilAnalista(resposta: string): 'conservador' | 'moderado' | 'arrojado' | null {
  const r = resposta.toLowerCase()
  if (r.includes('conservador')) return 'conservador'
  if (r.includes('moderado')) return 'moderado'
  if (r.includes('arrojado')) return 'arrojado'
  return null
}

function splitLista(texto: string): string[] {
  return texto
    .split(/[,;\/\n]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

export default function OnboardingPage() {
  const supabase = createClient()
  const router = useRouter()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [perguntaIdx, setPerguntaIdx] = useState(0)
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'conversando' | 'gerando' | 'completo'>('conversando')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const blocoAtual = perguntaIdx < PERGUNTAS.length ? PERGUNTAS[perguntaIdx].bloco : 3

  useEffect(() => {
    addBot('Olá! Sou o assistente de configuração da FAM Seguradora. Vou fazer algumas perguntas para personalizar as análises de crédito para o seu perfil.')
    setTimeout(() => addBot(PERGUNTAS[0].texto), 600)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  function addBot(text: string) {
    setMsgs(prev => [...prev, { from: 'bot', text }])
  }

  function addUser(text: string) {
    setMsgs(prev => [...prev, { from: 'user', text }])
  }

  async function enviar() {
    if (!input.trim() || status !== 'conversando') return
    const resposta = input.trim()
    setInput('')
    addUser(resposta)

    const pergunta = PERGUNTAS[perguntaIdx]
    const novasRespostas = { ...respostas, [pergunta.campo]: resposta }
    setRespostas(novasRespostas)

    const proximoIdx = perguntaIdx + 1

    if (proximoIdx >= PERGUNTAS.length) {
      await finalizar(novasRespostas)
      return
    }

    const ack = ACKS[perguntaIdx % ACKS.length]
    const proximaPergunta = PERGUNTAS[proximoIdx]
    const blocoMudou = proximaPergunta.bloco !== pergunta.bloco

    setTimeout(() => {
      if (blocoMudou) {
        const bloco = BLOCOS[proximaPergunta.bloco]
        addBot(`${ack} Agora vamos para o bloco ${bloco.icon} ${bloco.nome}.`)
        setTimeout(() => {
          addBot(proximaPergunta.texto)
          setPerguntaIdx(proximoIdx)
          inputRef.current?.focus()
        }, 500)
      } else {
        addBot(`${ack} ${proximaPergunta.texto}`)
        setPerguntaIdx(proximoIdx)
        inputRef.current?.focus()
      }
    }, 300)
  }

  async function finalizar(todasRespostas: Record<string, string>) {
    setStatus('gerando')
    addBot('Perfeito! Estou condensando seu perfil...')

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respostas: todasRespostas }),
      })
      const json = await res.json()
      const contextoIA: string = json.contexto_ia || ''

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const perfil = extractPerfilAnalista(todasRespostas.perfil_analista || '')
      const anos = parseInt(todasRespostas.anos_experiencia || '0', 10)

      await supabase.from('user_profiles').upsert({
        user_id: user.id,
        nome: todasRespostas.nome,
        cargo: todasRespostas.cargo,
        empresa: todasRespostas.empresa,
        anos_experiencia: isNaN(anos) ? null : anos,
        perfil_analista: perfil,
        setores_expertise: splitLista(todasRespostas.setores_expertise || ''),
        setores_cautela: splitLista(todasRespostas.setores_cautela || ''),
        indicador_critico: todasRespostas.indicador_critico,
        regras_pessoais: todasRespostas.regras_pessoais,
        preferencia_detalhe: todasRespostas.preferencia_detalhe,
        onboarding_completo: true,
        contexto_ia: contextoIA,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'user_id' })

      setStatus('completo')
      addBot(`Configuração concluída! Seu perfil de analista está pronto. Redirecionando para a tela de Análise de Crédito...`)

      setTimeout(() => router.push('/subscricao/analise-credito'), 2000)
    } catch {
      addBot('Houve um erro ao salvar seu perfil. Tente novamente.')
      setStatus('conversando')
    }
  }

  const progresso = Math.round((perguntaIdx / PERGUNTAS.length) * 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 110px)', background: c.bg, margin: '-28px -32px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>

      {/* Progresso */}
      <div style={{ padding: '16px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          {BLOCOS.map((b, i) => {
            const feito = i < blocoAtual
            const ativo = i === blocoAtual
            return (
              <div key={b.nome} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 20,
                  background: feito ? c.successBg : ativo ? c.accentBg : 'rgba(255,255,255,0.03)',
                  border: `0.5px solid ${feito ? 'rgba(74,222,128,0.3)' : ativo ? c.accentBorder : c.border}`,
                  color: feito ? c.success : ativo ? c.accent : c.muted,
                  fontSize: 11, fontWeight: ativo ? 700 : 400,
                  transition: 'all 0.3s',
                }}>
                  <span style={{ fontSize: 12 }}>{feito ? '✓' : b.icon}</span>
                  <span>{b.nome}</span>
                </div>
                {i < BLOCOS.length - 1 && (
                  <div style={{ width: 20, height: 1, background: feito ? 'rgba(74,222,128,0.3)' : c.border }} />
                )}
              </div>
            )
          })}
          <div style={{ marginLeft: 'auto', fontSize: 11, color: c.muted }}>{progresso}%</div>
        </div>
        <div style={{ height: 2, background: c.border, borderRadius: 1, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${status === 'completo' ? 100 : progresso}%`, background: c.accent, borderRadius: 1, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      {/* Chat */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {msgs.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start' }}>
            {msg.from === 'bot' && (
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#3070c8,#a0c0e8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0, marginRight: 10, marginTop: 2 }}>
                F
              </div>
            )}
            <div style={{
              maxWidth: '70%',
              padding: '10px 14px',
              borderRadius: msg.from === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: msg.from === 'user' ? c.accentBg : c.card,
              border: `0.5px solid ${msg.from === 'user' ? c.accentBorder : c.border}`,
              color: c.text,
              fontSize: 13,
              lineHeight: 1.55,
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {status === 'gerando' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#3070c8,#a0c0e8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white' }}>F</div>
            <div style={{ padding: '8px 14px', borderRadius: '14px 14px 14px 4px', background: c.card, border: `0.5px solid ${c.border}`, color: c.muted, fontSize: 13 }}>
              ···
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 24px 16px', borderTop: `1px solid ${c.border}`, flexShrink: 0 }}>
        {status === 'completo' ? (
          <div style={{ textAlign: 'center', fontSize: 13, color: c.success, padding: 12 }}>
            ✓ Configuração concluída — redirecionando...
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
              placeholder="Digite sua resposta... (Enter para enviar)"
              disabled={status === 'gerando'}
              rows={2}
              style={{
                flex: 1, fontSize: 13, padding: '10px 14px', borderRadius: 10, resize: 'none',
                background: 'rgba(255,255,255,0.05)', color: c.text,
                border: `0.5px solid rgba(255,255,255,0.15)`, outline: 'none',
                fontFamily: 'inherit', lineHeight: 1.5,
                opacity: status === 'gerando' ? 0.5 : 1,
              }}
            />
            <button
              onClick={enviar}
              disabled={!input.trim() || status === 'gerando'}
              style={{
                padding: '10px 18px', borderRadius: 10, cursor: !input.trim() || status === 'gerando' ? 'not-allowed' : 'pointer',
                background: input.trim() && status === 'conversando' ? c.accentBg : 'rgba(255,255,255,0.03)',
                color: input.trim() && status === 'conversando' ? c.accent : c.muted,
                border: `0.5px solid ${input.trim() && status === 'conversando' ? c.accentBorder : c.border}`,
                fontSize: 16, opacity: !input.trim() || status === 'gerando' ? 0.4 : 1,
                transition: 'all 0.15s',
              }}
            >
              ↑
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
