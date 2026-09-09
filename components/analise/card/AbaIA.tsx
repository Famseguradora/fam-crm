'use client'

// ============================================================================
//  ABA 5: A IA DO CARD  ·  "o mesmo agente que fica dentro do relatório"
//
//  Porte do `painelIA` do card.js. A régua de quem responde é a do ia-card.mjs:
//  com análise no banco, é o auditor do relatório (a MESMA conversa, mesmo
//  histórico); sem análise, o auditor ancorado na pasta do tomador, que lê o
//  que chegou até agora.
//
//  A PERGUNTA VAI PARA `ia_pedidos` com escopo `analise`, e quem responde é o
//  claude.exe do notebook, pelo agente da esteira. A tela não fala com
//  127.0.0.1: é o que faz a pergunta poder sair do celular e a resposta ficar
//  para a equipe. Gasto de IA: zero.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ATALHOS_CARD, esperandoDemais, type PedidoIA } from '@/lib/ia/gestao'
import { dataCurta } from '@/lib/analise/mesa'
import { type PropsAba } from './comum'

const CAMPOS = 'id, pergunta, resposta, erro, estado, motor, maquina, criado_por_nome, criado_em, respondido_em'

export default function AbaIA({ f, ficha, quem }: PropsAba) {
  const [pedidos, setPedidos] = useState<PedidoIA[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const fim = useRef<HTMLDivElement>(null)

  const temAnalise = !!(ficha?.id || f.analise_id)
  const temMaterial = temAnalise || (!!f.arquivos && f.arquivos.onde === 'raiz')

  const carregar = useCallback(async () => {
    const supabase = createClient()
    // A conversa é do card (fila_id) e, com análise, também a do relatório (analise_id).
    const ou = [`fila_id.eq.${f.id}`]
    if (f.analise_id) ou.push(`analise_id.eq.${f.analise_id}`)
    const { data, error } = await supabase.from('ia_pedidos').select(CAMPOS)
      .eq('escopo', 'analise').or(ou.join(',')).order('criado_em', { ascending: true }).limit(60)
    if (error) { setErro(error.message); return }
    setPedidos((data ?? []) as PedidoIA[])
  }, [f.id, f.analise_id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    const esperando = pedidos.some(p => p.estado === 'pendente' || p.estado === 'respondendo')
    if (!esperando) return
    const t = setInterval(carregar, 4000)
    return () => clearInterval(t)
  }, [pedidos, carregar])
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }) }, [pedidos.length])

  const perguntar = async (q: string) => {
    const pergunta = q.trim()
    if (!pergunta || enviando) return
    setEnviando(true); setErro('')
    const supabase = createClient()
    const { error } = await supabase.from('ia_pedidos').insert({
      pergunta, escopo: 'analise', motor: 'notebook',
      analise_id: f.analise_id, fila_id: f.id, pasta: f.pasta, chave: f.chave,
      criado_por_auth_id: quem.authId, criado_por_nome: quem.nome,
    })
    if (error) setErro(error.message)
    setTexto('')
    await carregar()
    setEnviando(false)
  }

  return (
    <div className="an-bloco">
      <h4>Perguntar sobre este tomador</h4>
      <div className="an-ia-onde">
        {temAnalise
          ? <><b>É o mesmo auditor que fica dentro do relatório desta análise.</b> Mesma conversa, mesmo histórico: o que você perguntar aqui aparece lá, e o que perguntou lá aparece aqui. Ele lê o dossiê inteiro, com o texto dos documentos página a página.</>
          : <><b>É o mesmo agente do relatório, lendo a pasta deste tomador.</b> Esta análise ainda não existe, então ele responde pelo que chegou até agora: os documentos da pasta e o texto que a triagem já extraiu. Quando a análise ficar pronta, a conversa passa a ser a do relatório.</>}
        {' '}Quem responde é o Claude do notebook do analista, sem custo de API.
      </div>

      {!temMaterial && (
        <div className="an-aviso aviso"><span>⚠</span><span>Sem pasta na raiz e sem análise no banco, não há material para ele ler.</span></div>
      )}
      {erro && <div className="an-aviso erro"><span>⛔</span><span>{erro}</span></div>}

      <div className="an-fio">
        {pedidos.length === 0 && <div className="an-vazio">Nada perguntado ainda sobre este tomador.</div>}
        {pedidos.map(p => (
          <div key={p.id} style={{ display: 'contents' }}>
            <div className="an-balao eu">{p.pergunta}<span className="q">{p.criado_por_nome ?? 'alguém'} · {dataCurta(p.criado_em)}</span></div>
            {p.estado === 'pronta' && <div className="an-balao ia">{p.resposta}<span className="q">{dataCurta(p.respondido_em)}{p.maquina ? ` · ${p.maquina}` : ''}</span></div>}
            {p.estado === 'erro' && <div className="an-balao ruim">{p.erro || 'A IA não conseguiu responder.'}</div>}
            {(p.estado === 'pendente' || p.estado === 'respondendo') && (
              <div className="an-balao ia"><span className="an-pensando"><i className="an-girando" />{p.estado === 'respondendo' ? 'Lendo os documentos…' : 'Na fila do notebook…'}</span>
                {esperandoDemais(p) && <span className="q">Está demorando mais que o normal. O agente da esteira precisa estar rodando no notebook do analista.</span>}
              </div>
            )}
          </div>
        ))}
        <div ref={fim} />
      </div>

      {pedidos.length === 0 && quem.podeEscrever && temMaterial && (
        <div className="an-atalhos">
          {ATALHOS_CARD.map(t => <button key={t.id} type="button" className="an-atalho" onClick={() => perguntar(t.pergunta)} disabled={enviando}>{t.txt}</button>)}
        </div>
      )}

      {quem.podeEscrever && (
        <div className="an-perguntar">
          <textarea value={texto} onChange={e => setTexto(e.target.value)} disabled={enviando || !temMaterial}
            placeholder="Pergunte sobre os documentos deste tomador. Ctrl+Enter manda."
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') perguntar(texto) }} />
          <button type="button" className="an-bt azul" onClick={() => perguntar(texto)} disabled={enviando || !texto.trim() || !temMaterial}>Perguntar</button>
        </div>
      )}
    </div>
  )
}
