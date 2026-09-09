'use client'

// ============================================================================
//  ABA 6: ENCAMINHAR ESTE CASO
//
//  Porte do `painelEncaminhar` do card.js e do pessoas.mjs: o caso continua
//  na mesa, e passa a aparecer como ESPERANDO ALGUÉM, com o pedido escrito e
//  o tempo correndo. É o "mover para outro pipe" e o "assignee" do Pipefy,
//  reduzidos ao que faz sentido.
//
//  A DIFERENÇA PARA O COCKPIT, e ela é a graça de estar no CRM: os destinos
//  não são uma lista de nomes escrita a mão num JSON. As áreas são as cinco do
//  card (lib/card/secoes.ts) e as pessoas são as de `usuarios`, com a área que
//  cada uma tem. E a resposta pode ser escrita por quem recebeu, logado, e não
//  só por ele anotando o que voltou pelo corredor.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AREAS, nomeArea } from '@/lib/card/secoes'
import { ESTADO_ENC, idadeDoEncaminhamento, iniciaisDe, corDoNome, dataCurta, type Encaminhamento } from '@/lib/analise/mesa'
import { type PropsAba } from './comum'

interface Pessoa { auth_id: string; nome: string; areas: string[] | null; cargo: string | null }

export default function Encaminhar({ f, quem, recarregar }: PropsAba) {
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [lista, setLista] = useState<Encaminhamento[]>([])
  const [todos, setTodos] = useState<Encaminhamento[]>([])
  const [destino, setDestino] = useState<{ area: string; pessoa: Pessoa | null }>({ area: '', pessoa: null })
  const [pedido, setPedido] = useState('')
  const [prazo, setPrazo] = useState('')
  const [respondendo, setRespondendo] = useState<string | null>(null)
  const [resposta, setResposta] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const [p, l, t] = await Promise.all([
      supabase.from('usuarios').select('auth_id, nome, areas, cargo').neq('perfil', 'leitura').order('nome'),
      supabase.from('analise_encaminhamentos').select('*').eq('fila_id', f.id).order('criado_em', { ascending: false }),
      supabase.from('analise_encaminhamentos').select('*').neq('estado', 'fechado').order('criado_em', { ascending: false }).limit(300),
    ])
    setPessoas((p.data ?? []) as Pessoa[])
    setLista((l.data ?? []) as Encaminhamento[])
    setTodos((t.data ?? []) as Encaminhamento[])
  }, [f.id])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  const encaminhar = async () => {
    const txt = pedido.trim()
    if (!txt || (!destino.area && !destino.pessoa) || ocupado) return
    setOcupado(true); setErro('')
    const supabase = createClient()
    const { error } = await supabase.from('analise_encaminhamentos').insert({
      fila_id: f.id, chave: f.chave, tomador_id: f.tomador_id, pasta: f.pasta, tomador: f.nome || f.razao_social || f.pasta,
      para_area: destino.pessoa ? (destino.pessoa.areas?.[0] ?? null) : destino.area,
      para_nome: destino.pessoa?.nome ?? null, para_auth_id: destino.pessoa?.auth_id ?? null,
      pedido: txt, prazo: prazo || null, de_nome: quem.nome, de_auth_id: quem.authId,
    })
    if (error) setErro(error.message)
    else { setPedido(''); setPrazo(''); setDestino({ area: '', pessoa: null }); await carregar(); await recarregar() }
    setOcupado(false)
  }

  const salvarResposta = async (e: Encaminhamento, fechar: boolean) => {
    setOcupado(true)
    const supabase = createClient()
    await supabase.from('analise_encaminhamentos').update({
      resposta: resposta.trim() || e.resposta, respondido_em: new Date().toISOString(),
      estado: fechar ? 'fechado' : 'respondido', ...(fechar ? { fechado_em: new Date().toISOString() } : {}),
    }).eq('id', e.id)
    setRespondendo(null); setResposta(''); setOcupado(false)
    await carregar(); await recarregar()
  }
  const encerrar = async (e: Encaminhamento) => {
    const supabase = createClient()
    await supabase.from('analise_encaminhamentos').update({ estado: 'fechado', fechado_em: new Date().toISOString() }).eq('id', e.id)
    await carregar(); await recarregar()
  }

  /* O QUE ESTÁ COM QUEM, NA CASA INTEIRA: a pergunta que não existia em lugar
     nenhum antes do encaminhamento, e que é metade do valor de um Pipefy. */
  const painel = useMemo(() => {
    const abertos = todos.filter(x => x.estado === 'aberto')
    const por: Record<string, { nome: string; total: number; atrasados: number }> = {}
    for (const e of abertos) {
      const k = e.para_nome || nomeArea(e.para_area)
      por[k] = por[k] || { nome: k, total: 0, atrasados: 0 }
      por[k].total++
      if (idadeDoEncaminhamento(e).atrasado) por[k].atrasados++
    }
    return { abertos: abertos.length, atrasados: abertos.filter(e => idadeDoEncaminhamento(e).atrasado).length, por: Object.values(por).sort((a, b) => b.total - a.total) }
  }, [todos])

  const Avatar = ({ nome }: { nome: string }) => (
    <span className="an-av" style={{ ['--cor' as string]: corDoNome(nome), width: 24, height: 24, fontSize: 10.5 }}>{iniciaisDe(nome)}</span>
  )

  return (
    <div>
      <div className="an-bloco">
        <h4>Encaminhar este caso</h4>
        <p className="an-explica">O caso continua sendo seu e continua na mesa. O que muda é que ele passa a aparecer como <b>esperando alguém</b>, com o pedido escrito e o tempo correndo. Quem recebe pode responder aqui mesmo, logado; e se a resposta chegar por Teams, telefone ou corredor, você anota o que voltou.</p>

        {quem.podeEscrever ? (
          <>
            <div className="an-destinos">
              {AREAS.map(a => (
                <button key={a.id} type="button" className={`an-destino${destino.area === a.id && !destino.pessoa ? ' viva' : ''}`}
                  onClick={() => setDestino({ area: a.id, pessoa: null })}>
                  <Avatar nome={a.nome} />{a.icone} {a.nome}
                </button>
              ))}
            </div>
            <div className="an-destinos">
              {pessoas.map(p => (
                <button key={p.auth_id} type="button" className={`an-destino${destino.pessoa?.auth_id === p.auth_id ? ' viva' : ''}`}
                  onClick={() => setDestino({ area: '', pessoa: p })}>
                  <Avatar nome={p.nome} />{p.nome}
                  <span className="area">{p.areas?.length ? p.areas.map(nomeArea).join(', ') : (p.cargo ?? '')}</span>
                </button>
              ))}
            </div>
            <div className="an-campo">
              <label htmlFor="an-pedido">O que você está pedindo</label>
              <textarea id="an-pedido" value={pedido} onChange={e => setPedido(e.target.value)}
                placeholder="Ex.: conferir se a cláusula 12 do contrato social permite dar garantia judicial sem assembleia." />
            </div>
            <div className="an-campo" style={{ maxWidth: 220 }}>
              <label htmlFor="an-prazo">Até quando (opcional)</label>
              <input id="an-prazo" type="date" value={prazo} onChange={e => setPrazo(e.target.value)} />
            </div>
            {erro && <div className="an-aviso erro"><span>⛔</span><span>{erro}</span></div>}
            <div className="an-bt-linha">
              <button type="button" className="an-bt grande azul" disabled={ocupado || !pedido.trim() || (!destino.area && !destino.pessoa)} onClick={encaminhar}>Encaminhar</button>
              <span className="an-bt-nota">Vai para a linha de processos deste tomador e para o painel de quem está com o quê.</span>
            </div>
          </>
        ) : <div className="an-dica">Só quem escreve no CRM encaminha. Você está acompanhando.</div>}
      </div>

      {lista.length > 0 && (
        <div className="an-bloco">
          <h4>Encaminhamentos deste caso</h4>
          {lista.map(e => {
            const { dias, atrasado } = idadeDoEncaminhamento(e)
            const quemRecebe = e.para_nome || nomeArea(e.para_area)
            const est = ESTADO_ENC[e.estado]
            return (
              <div key={e.id} className={`an-enc ${e.estado}`}>
                <div className="an-enc-cab">
                  <Avatar nome={quemRecebe} />
                  <span className="quem">{quemRecebe}</span>
                  <span className="est" style={{ color: est.cor }}>{est.rotulo}</span>
                  <span className={`dias${atrasado ? ' atrasado' : ''}`}>{dataCurta(e.criado_em)} · {dias === 0 ? 'hoje' : `${dias}d`}{e.prazo ? ` · prazo ${e.prazo.split('-').reverse().join('/')}` : ''}{atrasado ? ' · passou do prazo' : ''}</span>
                </div>
                <div className="an-enc-ped">{e.pedido}</div>
                {e.de_nome && <div className="an-dica" style={{ marginTop: 4 }}>pedido por {e.de_nome}</div>}
                {e.resposta && <div className="an-enc-resp"><b>Voltou:</b> {e.resposta}{e.respondido_em ? <span style={{ color: '#6080a0' }}> · {dataCurta(e.respondido_em)}</span> : null}</div>}
                {quem.podeEscrever && (respondendo === e.id ? (
                  <>
                    <div className="an-campo" style={{ marginTop: 8 }}>
                      <textarea value={resposta} onChange={ev => setResposta(ev.target.value)} placeholder="O que ele respondeu?" autoFocus />
                    </div>
                    <div className="an-enc-bts">
                      <button type="button" className="an-bt mini" disabled={ocupado} onClick={() => salvarResposta(e, false)}>salvar a resposta</button>
                      <button type="button" className="an-bt mini" disabled={ocupado} onClick={() => salvarResposta(e, true)}>salvar e encerrar</button>
                      <button type="button" className="an-bt mini" onClick={() => setRespondendo(null)}>cancelar</button>
                    </div>
                  </>
                ) : e.estado !== 'fechado' ? (
                  <div className="an-enc-bts">
                    <button type="button" className="an-bt mini" onClick={() => { setRespondendo(e.id); setResposta('') }}>{e.para_auth_id === quem.authId ? 'responder' : 'anotar o que voltou'}</button>
                    <button type="button" className="an-bt mini" onClick={() => encerrar(e)}>encerrar</button>
                  </div>
                ) : null)}
              </div>
            )
          })}
        </div>
      )}

      {painel.abertos > 0 && (
        <div className="an-bloco">
          <h4>O que está com quem, na casa inteira{painel.atrasados > 0 && <span className="dir" style={{ color: '#a02020' }}>{painel.atrasados} passou do prazo</span>}</h4>
          <div className="an-quem-tem">
            {painel.por.map(q => (
              <div key={q.nome} className={`an-quem${q.atrasados ? ' atrasado' : ''}`}>
                <span className="an-av" style={{ ['--cor' as string]: corDoNome(q.nome), width: 32, height: 32, fontSize: 12 }}>{iniciaisDe(q.nome)}</span>
                <span><b>{q.total}</b> caso{q.total === 1 ? '' : 's'}<small>{q.nome}{q.atrasados ? ` · ${q.atrasados} atrasado${q.atrasados === 1 ? '' : 's'}` : ''}</small></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
