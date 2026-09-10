'use client'

// ============================================================================
//  ✦ IA DE GESTÃO  ·  o painel flutuante, com as conversas por assunto
//
//  A IA que olha o ACERVO INTEIRO — irmã, e não extensão, do auditor de UMA
//  análise: lá o mundo é a pasta de uma empresa, aqui é o acervo todo.
//
//  AS CONVERSAS SÃO SEPARADAS POR ASSUNTO, como no sistema dele desde
//  12/08/2026: "eu quero isso para separar a memória e não confundir o
//  conteúdo". A separação não é de fachada — cada conversa carrega a própria
//  sessão do lado do motor, e trocar de conversa troca a memória junto. As 37
//  que ele já tinha no notebook aparecem aqui, com o fio inteiro.
//
//  O PAINEL É FLUTUANTE, e não uma aba: ele pediu para tirar dúvida, e dúvida
//  aparece no meio de outra coisa. Aba obrigaria a sair da Mesa para perguntar
//  e voltar depois para ver a resposta.
//
//  O GATILHO DEIXOU DE FLUTUAR EM 09/09/2026. Com a IA Gestor passando a
//  existir em toda tela do CRM, o canto inferior direito tinha DOIS botões de
//  IA, um por cima do outro. Um canto, um botão: o flutuante do CRM é o da IA
//  Gestor, e esta aqui virou um botão do cabeçalho de Análises, onde ela é o
//  que sempre foi (uma ferramenta daquela tela).
//
//  AS DUAS NÃO SÃO A MESMA COISA, e por isso as duas ficaram:
//    IA de Gestão (esta)   o acervo de análises, pelo notebook, custo zero
//    IA Gestor             o CRM inteiro, pela API, custo por token
//
//  A TELA NÃO FALA COM 127.0.0.1. Ela escreve no banco e espera: é isso que faz
//  a pergunta poder ser feita do celular, a resposta ficar para a equipe, e o
//  dia em que a resposta vier da API não mudar uma linha daqui.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import {
  SUGESTOES, esperandoDemais, novoIdConversa, tituloDe,
  type PedidoIA, type Conversa, type MensagemIA,
} from '@/lib/ia/gestao'
import { desde, dataCurta, corta } from '@/lib/analise/mesa'

const CAMPOS = 'id, pergunta, resposta, erro, estado, motor, maquina, criado_por_nome, criado_em, respondido_em, conversa_id'

export default function IaGestao() {
  const { somenteLeitura } = usePermissoes()
  const [aberto, setAberto] = useState(false)
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [mensagens, setMensagens] = useState<MensagemIA[]>([])
  const [pedidos, setPedidos] = useState<PedidoIA[]>([])
  const [atual, setAtual] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [verLista, setVerLista] = useState(true)
  const [quem, setQuem] = useState<{ nome: string | null; authId: string | null }>({ nome: null, authId: null })
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
        .then(({ data }) => setQuem({ nome: data?.nome ?? user.email ?? null, authId: user.id }))
    })
  }, [aberto])

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const [c, p] = await Promise.all([
      supabase.from('ia_conversas').select('*').eq('escopo', 'gestao').eq('arquivada', false).order('ultima', { ascending: false }).limit(200),
      supabase.from('ia_pedidos').select(CAMPOS).eq('escopo', 'gestao').order('criado_em', { ascending: false }).limit(40),
    ])
    if (c.error) { setErro(c.error.message); return }
    setConversas((c.data ?? []) as Conversa[])
    setPedidos((p.data ?? []) as PedidoIA[])
  }, [])

  /* O FIO É BUSCADO POR CONVERSA, e não tudo de uma vez: são ~160 falas hoje e
     cada resposta da IA tem alguns milhares de caracteres. Carregar o acervo
     inteiro para mostrar um assunto é pagar caro por nada. */
  const carregarFio = useCallback(async (id: string) => {
    const supabase = createClient()
    const { data, error } = await supabase.from('ia_mensagens').select('*').eq('conversa_id', id).order('em').limit(400)
    if (error) { setErro(error.message); return }
    setMensagens((data ?? []) as MensagemIA[])
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (aberto) carregar() }, [aberto, carregar])

  // A conversa aberta: a última mexida, como o `atualOuUltima()` do motor.
  useEffect(() => {
    if (!aberto || atual || !conversas.length) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAtual(conversas[0].id)
  }, [aberto, atual, conversas])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (atual) carregarFio(atual) }, [atual, carregarFio])

  /* Enquanto houver pergunta esperando, olha o banco a cada 4 segundos. Sem
     pergunta aberta o relógio para: ninguém precisa de tráfego contínuo para
     olhar uma conversa antiga. */
  const emVoo = useMemo(
    () => pedidos.filter(p => p.estado === 'pendente' || p.estado === 'respondendo'),
    [pedidos])
  useEffect(() => {
    if (!aberto || !emVoo.length) return
    const t = setInterval(() => { carregar(); if (atual) carregarFio(atual) }, 4000)
    return () => clearInterval(t)
  }, [aberto, emVoo.length, atual, carregar, carregarFio])

  // A resposta chega sozinha para quem está com a tela aberta, inclusive para
  // quem não perguntou: é o ponto de a conversa ficar para a equipe.
  useEffect(() => {
    if (!aberto) return
    const supabase = createClient()
    const canal = supabase.channel('ia-gestao')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ia_mensagens' }, () => { carregar(); if (atual) carregarFio(atual) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ia_pedidos' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [aberto, atual, carregar, carregarFio])

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensagens.length, emVoo.length, aberto])

  /* O FIO DA TELA: as falas guardadas mais o que está em voo NESTA conversa.
     A pergunta em voo ainda não é fala (o motor é quem escreve no jsonl), e
     sem ela a tela ficaria muda entre o clique e a resposta. */
  const fio = useMemo(() => {
    const guardadas = mensagens.map(m => ({ tipo: 'fala' as const, m }))
    const voando = pedidos
      .filter(p => (p.conversa_id ?? null) === atual && (p.estado === 'pendente' || p.estado === 'respondendo' || p.estado === 'erro'))
      .filter(p => !mensagens.some(m => m.quem === 'marco' && m.texto.trim() === p.pergunta.trim()))
      .map(p => ({ tipo: 'voo' as const, p }))
    return [...guardadas, ...voando]
  }, [mensagens, pedidos, atual])

  const perguntar = async (q: string) => {
    const pergunta = q.trim()
    if (!pergunta || enviando || somenteLeitura) return
    setEnviando(true); setErro('')
    const supabase = createClient()

    // Sem conversa aberta, a pergunta abre uma — e o título dela nasce da
    // própria pergunta, que é como ele reconhece o assunto depois.
    let alvo = atual
    if (!alvo) {
      alvo = novoIdConversa()
      const { error } = await supabase.from('ia_conversas').insert({
        id: alvo, titulo: tituloDe(pergunta), escopo: 'gestao', origem: 'crm',
        criado_por_nome: quem.nome, criado_por_auth_id: quem.authId,
      })
      if (error) { setErro(error.message); setEnviando(false); return }
      setAtual(alvo)
    }

    const { error } = await supabase.from('ia_pedidos').insert({
      pergunta, escopo: 'gestao', motor: 'notebook', conversa_id: alvo,
      criado_por_auth_id: quem.authId, criado_por_nome: quem.nome,
    })
    if (error) setErro(error.message)
    else {
      // A conversa sobe para o topo da lista na hora, sem esperar o agente.
      await supabase.from('ia_conversas').update({ ultima: new Date().toISOString() }).eq('id', alvo)
    }
    setTexto('')
    await carregar()
    setEnviando(false)
  }

  const novaConversa = async () => {
    if (somenteLeitura) return
    const id = novoIdConversa()
    const supabase = createClient()
    const { error } = await supabase.from('ia_conversas').insert({
      id, titulo: '', escopo: 'gestao', origem: 'crm',
      criado_por_nome: quem.nome, criado_por_auth_id: quem.authId,
    })
    if (error) { setErro(error.message); return }
    setAtual(id); setMensagens([])
    await carregar()
  }

  const renomear = async (c: Conversa) => {
    const novo = window.prompt('Nome deste assunto', c.titulo)
    if (novo === null) return
    const supabase = createClient()
    await supabase.from('ia_conversas').update({ titulo: novo.trim().slice(0, 80), titulo_dele: true }).eq('id', c.id)
    await carregar()
  }

  const excluir = async (c: Conversa) => {
    if (!window.confirm(`Apagar o assunto “${c.titulo || 'sem nome'}” e as falas dele? Não tem volta aqui no CRM.\n\nO que está no notebook continua lá.`)) return
    const supabase = createClient()
    const { error } = await supabase.from('ia_conversas').delete().eq('id', c.id)
    if (error) { setErro(error.message); return }
    if (atual === c.id) { setAtual(null); setMensagens([]) }
    await carregar()
  }

  const conversaAtual = conversas.find(c => c.id === atual) ?? null

  return (
    <>
      {/* O GATILHO, agora no cabeçalho e não no canto. O dourado é o mesmo da
          tela dele: o que mudou foi o lugar, não a identidade. */}
      <button type="button" onClick={() => setAberto(v => !v)}
        title="Pergunte sobre o acervo inteiro de análises. Responde pelo notebook, sem custo de API."
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid ' + (aberto ? '#b8851f' : '#e0cd94'),
          background: aberto ? 'linear-gradient(135deg, #e8b84b, #d9a72f)' : '#fdf8e6',
          color: '#5c460a', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
        }}>
        ✦ IA de Gestão
      </button>

      {aberto && (
        <div style={{
          /* O painel continua flutuando: a dúvida nasce olhando a lista, e ele
             não pode empurrar o conteúdo da Mesa para baixo. Subiu para 84 para
             não encostar no botão da IA Gestor, que mora no mesmo canto. */
          position: 'fixed', right: 22, bottom: 84, zIndex: 50,
          width: 'min(900px, calc(100vw - 44px))', maxHeight: 'min(76vh, 720px)',
          display: 'flex', flexDirection: 'column',
          background: '#fff', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 18px 50px rgba(10,22,40,.22)', overflow: 'hidden',
        }}>
          <div style={{
            padding: '11px 14px', borderBottom: '1px solid var(--border)', background: '#f5f9fd',
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            <b style={{ fontSize: 13.5, color: '#1a3560' }}>IA de Gestão</b>
            <span style={{ fontSize: 11.5, color: 'var(--soft)' }}>olha as suas análises todas, não uma</span>
            <button type="button" className="an-bt mini" style={{ marginLeft: 'auto' }} onClick={() => setVerLista(v => !v)}
              title="Mostrar ou esconder a lista de assuntos">{verLista ? '‹ assuntos' : 'assuntos ›'}</button>
            {!somenteLeitura && <button type="button" className="an-bt mini" onClick={novaConversa} title="Começar um assunto novo, com memória própria">+ Novo assunto</button>}
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6080a0', fontSize: 16 }}>✕</button>
          </div>

          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* ── a lista de assuntos ── */}
            {verLista && (
              <div style={{ width: 250, flex: 'none', borderRight: '1px solid var(--border)', overflowY: 'auto', background: '#fbfdff' }}>
                {conversas.length === 0 && (
                  <div style={{ padding: 14, fontSize: 12, color: 'var(--soft)', lineHeight: 1.55 }}>
                    Nenhum assunto ainda. As conversas do seu notebook aparecem aqui quando o agente
                    da esteira sincroniza (<b>ESTEIRA.cmd</b>).
                  </div>
                )}
                {conversas.map(c => (
                  <div key={c.id}
                    style={{
                      padding: '9px 12px', borderBottom: '1px solid #f2f6fb', cursor: 'pointer',
                      borderLeft: `3px solid ${atual === c.id ? '#1e4080' : 'transparent'}`,
                      background: atual === c.id ? '#eef5fd' : 'transparent',
                    }}
                    onClick={() => setAtual(c.id)}>
                    <div style={{ fontSize: 12.5, fontWeight: atual === c.id ? 700 : 600, color: '#0a1628', lineHeight: 1.35 }}>
                      {c.titulo || 'sem nome'}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--soft)', marginTop: 2, display: 'flex', gap: 6 }}>
                      <span>{c.trocas || 0} pergunta{(c.trocas || 0) === 1 ? '' : 's'}</span>
                      <span style={{ marginLeft: 'auto' }}>{desde(c.ultima)}</span>
                    </div>
                    {atual === c.id && !somenteLeitura && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                        <button type="button" onClick={e => { e.stopPropagation(); renomear(c) }}
                          style={{ font: 'inherit', fontSize: 11, color: '#3070c8', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>renomear</button>
                        <button type="button" onClick={e => { e.stopPropagation(); excluir(c) }}
                          style={{ font: 'inherit', fontSize: 11, color: '#a02020', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>apagar</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── o fio ── */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              {conversaAtual && (
                <div style={{ padding: '8px 14px', borderBottom: '1px solid #f2f6fb', fontSize: 11.5, color: 'var(--soft)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ color: '#1a3560', fontSize: 12.5 }}>{conversaAtual.titulo || 'sem nome'}</b>
                  <span>· {conversaAtual.trocas || 0} pergunta{(conversaAtual.trocas || 0) === 1 ? '' : 's'}</span>
                  <span>· começou {dataCurta(conversaAtual.criada)}</span>
                  {conversaAtual.origem === 'motor' && <span title="Veio do Sistema de Análise, no seu notebook">· do sistema</span>}
                </div>
              )}

              <div style={{ padding: 14, overflowY: 'auto', flex: 1, minHeight: 0 }}>
                {erro && <div className="alert-error" style={{ marginBottom: 10 }}>{erro}</div>}

                {fio.length === 0 && (
                  <>
                    <div style={{ fontSize: 12.5, color: 'var(--soft)', lineHeight: 1.55, marginBottom: 10 }}>
                      Ela compara as análises entre si: concentração, grupo econômico, o que se repete
                      nas suas ressalvas. Quem responde é o Claude do seu notebook, então ele precisa
                      estar ligado com o agente rodando.
                    </div>
                    {!somenteLeitura && SUGESTOES.map(s => (
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

                {fio.map(item => item.tipo === 'fala' ? (
                  <div key={item.m.id} style={{ marginBottom: 12 }}>
                    <div style={{
                      background: item.m.quem === 'ia' ? '#f7fafd' : '#e8f0fa',
                      border: item.m.quem === 'ia' ? '1px dashed var(--border)' : 'none',
                      borderRadius: item.m.quem === 'ia' ? '10px 10px 10px 2px' : '10px 10px 2px 10px',
                      padding: '10px 13px', fontSize: 13, lineHeight: 1.6, color: '#1a2a3a',
                      whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                      marginLeft: item.m.quem === 'ia' ? 0 : 'auto', maxWidth: '92%',
                    }}>
                      {item.m.texto}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--soft)', margin: '3px 0 0', textAlign: item.m.quem === 'ia' ? 'left' : 'right' }}>
                      {item.m.quem === 'ia' ? 'IA de Gestão' : (item.m.autor_nome ?? 'Marco')} · {dataCurta(item.m.em)}
                      {item.m.segundos ? ` · ${item.m.segundos}s` : ''}
                    </div>
                  </div>
                ) : (
                  <div key={item.p.id} style={{ marginBottom: 12 }}>
                    <div style={{
                      background: '#e8f0fa', borderRadius: '10px 10px 2px 10px', padding: '10px 13px',
                      fontSize: 13, color: '#0a1628', lineHeight: 1.5, marginLeft: 'auto', maxWidth: '92%',
                    }}>
                      {item.p.pergunta}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--soft)', margin: '3px 0 7px', textAlign: 'right' }}>
                      {item.p.criado_por_nome ?? 'alguém'} · {dataCurta(item.p.criado_em)}
                    </div>
                    {item.p.estado === 'erro' ? (
                      <div className="alert-error" style={{ margin: 0 }}>{item.p.erro || 'a IA não conseguiu responder'}</div>
                    ) : (
                      <div style={{
                        background: '#fdf8e6', border: '1px solid #ecdfb4', borderRadius: 10,
                        padding: '10px 12px', fontSize: 12.5, color: '#8a6410', lineHeight: 1.5,
                      }}>
                        {item.p.estado === 'respondendo' ? 'O notebook está respondendo…' : 'Na fila do notebook…'}
                        {esperandoDemais(item.p) && (
                          <div style={{ marginTop: 5 }}>
                            Está demorando mais que o normal. O agente da esteira precisa estar rodando
                            na máquina do analista: <b>ESTEIRA.cmd</b>.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={fim} />
              </div>

              {!somenteLeitura ? (
                <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                  <textarea value={texto} onChange={e => setTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); perguntar(texto) } }}
                    placeholder={conversaAtual ? `Continuar “${corta(conversaAtual.titulo || 'este assunto', 30)}”…` : 'Perguntar sobre o acervo…'}
                    rows={2}
                    style={{
                      flex: 1, minWidth: 0, padding: '9px 11px', fontSize: 16, resize: 'vertical',
                      border: '1px solid var(--border)', borderRadius: 8, background: '#fff',
                      fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 140,
                    }} />
                  <button type="button" onClick={() => perguntar(texto)} disabled={enviando || !texto.trim()}
                    style={{
                      padding: '9px 15px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: '#1e4080', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                      opacity: enviando || !texto.trim() ? 0.5 : 1, alignSelf: 'stretch',
                    }}>
                    Perguntar
                  </button>
                </div>
              ) : (
                <div style={{ padding: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--soft)' }}>
                  Você está lendo as conversas. Perguntar é de quem escreve no CRM.
                </div>
              )}
              <div style={{ padding: '0 12px 10px', fontSize: 10.5, color: 'var(--soft)', lineHeight: 1.45 }}>
                Enter envia, Shift+Enter pula linha. Cada assunto tem a própria memória. Ela lê o
                acervo e cita de onde tirou; não altera nada: propõe, e quem decide é você.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
