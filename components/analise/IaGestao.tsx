'use client'

// ============================================================================
//  ✦ IA DE GESTÃO  ·  o botão da tela dele, dentro do CRM
//
//  A IA que olha o acervo inteiro. A pergunta é gravada em `ia_pedidos`, e quem
//  responde HOJE é o agente do notebook dele, com o claude.exe da assinatura:
//  gasto de IA zero. Quando o motor virar "servidor", esta tela não muda.
//
//  A TELA NÃO FALA COM 127.0.0.1. Ela escreve no banco e espera. É isso que faz
//  a pergunta poder ser feita do celular e a resposta ficar para a equipe.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SUGESTOES, esperandoDemais, type PedidoIA } from '@/lib/ia/gestao'

const CAMPOS = 'id, pergunta, resposta, erro, estado, motor, maquina, criado_por_nome, criado_em, respondido_em'

export default function IaGestao() {
  const [aberto, setAberto] = useState(false)
  const [pedidos, setPedidos] = useState<PedidoIA[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const fim = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase.from('ia_pedidos').select(CAMPOS)
      .eq('escopo', 'gestao').order('criado_em', { ascending: false }).limit(20)
    if (error) { setErro(error.message); return }
    setPedidos(((data ?? []) as PedidoIA[]).reverse())
  }, [])

  useEffect(() => { if (aberto) carregar() }, [aberto, carregar])

  /* Enquanto houver pergunta esperando, olha o banco a cada 4 segundos. Sem
     pergunta aberta o relógio para: ninguém precisa de tráfego contínuo para
     olhar uma conversa antiga. */
  useEffect(() => {
    if (!aberto) return
    const esperando = pedidos.some(p => p.estado === 'pendente' || p.estado === 'respondendo')
    if (!esperando) return
    const t = setInterval(carregar, 4000)
    return () => clearInterval(t)
  }, [aberto, pedidos, carregar])

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }) }, [pedidos.length, aberto])

  const perguntar = async (q: string) => {
    const pergunta = q.trim()
    if (!pergunta) return
    setEnviando(true); setErro('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    let nome: string | null = null
    if (user) {
      const { data } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
      nome = (data as { nome: string | null } | null)?.nome ?? null
    }
    const { error } = await supabase.from('ia_pedidos').insert({
      pergunta, escopo: 'gestao', motor: 'notebook',
      criado_por_auth_id: user?.id ?? null, criado_por_nome: nome,
    })
    if (error) setErro(error.message)
    setTexto('')
    await carregar()
    setEnviando(false)
  }

  return (
    <>
      {/* o botão flutuante, como na tela dele */}
      <button type="button" onClick={() => setAberto(v => !v)}
        style={{
          position: 'fixed', right: 22, bottom: 22, zIndex: 50,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '12px 18px', borderRadius: 30, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #e8b84b, #d9a72f)', color: '#2a1f05',
          fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700,
          boxShadow: '0 6px 20px rgba(30,64,128,.22)',
        }}>
        ✦ IA de Gestão
      </button>

      {aberto && (
        <div style={{
          position: 'fixed', right: 22, bottom: 78, zIndex: 50, width: 'min(460px, calc(100vw - 44px))',
          maxHeight: 'min(70vh, 620px)', display: 'flex', flexDirection: 'column',
          background: '#fff', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 18px 50px rgba(10,22,40,.22)', overflow: 'hidden',
        }}>
          <div style={{
            padding: '11px 14px', borderBottom: '1px solid var(--border)', background: '#f5f9fd',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <b style={{ fontSize: 13.5, color: '#1a3560' }}>IA de Gestão</b>
            <span style={{ fontSize: 11.5, color: 'var(--soft)' }}>o acervo inteiro, não uma análise</span>
            <button type="button" onClick={() => setAberto(false)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#6080a0', fontSize: 16 }}>
              ✕
            </button>
          </div>

          <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
            {erro && <div className="alert-error" style={{ marginBottom: 10 }}>{erro}</div>}

            {pedidos.length === 0 && (
              <>
                <div style={{ fontSize: 12.5, color: 'var(--soft)', lineHeight: 1.55, marginBottom: 10 }}>
                  Ela compara as análises entre si: concentração, grupo econômico, o que se repete
                  nas suas ressalvas. Quem responde é o Claude do seu notebook, então ele precisa
                  estar ligado com o agente rodando.
                </div>
                {SUGESTOES.map(s => (
                  <button key={s} type="button" onClick={() => perguntar(s)} disabled={enviando}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', marginBottom: 7,
                      padding: '9px 11px', borderRadius: 8, cursor: 'pointer',
                      border: '1px solid var(--border)', background: '#fbfdff',
                      fontFamily: 'inherit', fontSize: 12.5, color: '#1a2a3a', lineHeight: 1.45,
                    }}>
                    {s}
                  </button>
                ))}
              </>
            )}

            {pedidos.map(p => (
              <div key={p.id} style={{ marginBottom: 14 }}>
                <div style={{
                  background: '#e8f0fa', borderRadius: '10px 10px 10px 2px', padding: '9px 12px',
                  fontSize: 13, color: '#0a1628', lineHeight: 1.5,
                }}>
                  {p.pergunta}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--soft)', margin: '3px 0 7px' }}>
                  {p.criado_por_nome ?? 'alguém'} · {new Date(p.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>

                {p.estado === 'pronta' && (
                  <div style={{
                    background: '#f7fafd', border: '1px dashed var(--border)', borderRadius: 10,
                    padding: '11px 13px', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#1a2a3a',
                  }}>
                    {p.resposta}
                    <div style={{ fontSize: 10.5, color: 'var(--soft)', marginTop: 8 }}>
                      respondido {p.motor === 'notebook' ? `no notebook${p.maquina ? ` (${p.maquina})` : ''}, sem custo de API` : 'pelo servidor'}
                    </div>
                  </div>
                )}

                {p.estado === 'erro' && (
                  <div className="alert-error" style={{ margin: 0 }}>
                    {p.erro || 'a IA não conseguiu responder'}
                  </div>
                )}

                {(p.estado === 'pendente' || p.estado === 'respondendo') && (
                  <div style={{
                    background: '#fdf8e6', border: '1px solid #ecdfb4', borderRadius: 10,
                    padding: '10px 12px', fontSize: 12.5, color: '#8a6410', lineHeight: 1.5,
                  }}>
                    {p.estado === 'respondendo' ? 'O notebook está respondendo…' : 'Na fila do notebook…'}
                    {esperandoDemais(p) && (
                      <div style={{ marginTop: 5 }}>
                        Está demorando mais que o normal. O agente da esteira precisa estar rodando
                        na sua máquina: <code>node scripts/esteira.mjs</code>.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={fim} />
          </div>

          <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input value={texto} onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !enviando) perguntar(texto) }}
              placeholder="Perguntar sobre o acervo…"
              style={{
                flex: 1, minWidth: 0, padding: '9px 11px', fontSize: 16,
                border: '1px solid var(--border)', borderRadius: 8, background: '#fff',
              }} />
            <button type="button" onClick={() => perguntar(texto)} disabled={enviando || !texto.trim()}
              style={{
                padding: '9px 15px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#1e4080', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                opacity: enviando || !texto.trim() ? 0.5 : 1,
              }}>
              Perguntar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
