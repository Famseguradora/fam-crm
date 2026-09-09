'use client'

// ============================================================================
//  ABA 3: A ANÁLISE  ·  rodar, e saber por que parou
//
//  Porte do `painelAnalise` do card.js, bloco por bloco e na mesma ordem:
//
//    1. Precisa da sua autorização ...... os pedidos de alçada (agente_pedidos)
//       e a pergunta do motor (analise_pedidos), ANTES de tudo: enquanto há
//       pedido aberto nada mais nesta aba importa
//    2. Análise em andamento ............ a etapa e a barra
//    3. Por que parou ................... o erro, e quando
//    4. A triagem ....................... N de M conferidos, o que falta, produto
//    5. O portão do cadastro ............ bloqueada: Reler a pasta / Analisar mesmo assim
//    6. Rodar a análise de crédito ...... o resumo do que vai ser lido, o modo,
//       "o que observar", e o botão que muda de nome com o estado
//
//  OS BOTÕES NÃO EXECUTAM: gravam uma ORDEM que o agente do notebook busca e
//  executa pelo mesmo caminho do cockpit (POST /api/analisar, /api/destravar).
//  A tela diz que está esperando o notebook, e escreve o que voltou.
// ============================================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ORDEM, ETAPAS, andamentoDaEtapa, SITUACAO, type Ordem } from '@/lib/analise/esteira'
import { dataCurta, desde } from '@/lib/analise/mesa'
import { type PropsAba } from './comum'

interface PedidoAlcada {
  id: string; acao: string; acao_rotulo: string | null; motivo: string | null; quem: string
  pedido_em: string; status: string; args: Record<string, unknown> | null; decisao_crm: string | null
}
interface PedidoMotor {
  id: string; pasta: string; motivo: string; razao: string | null
  opcoes: { id: string; rotulo: string; detalhe: string | null }[]
  estado: string; resposta: string | null; observacao: string | null; respondido_em: string | null; respondido_por: string | null
}

export default function AbaAnalise({ f, quem, recarregar, aoMandar }: PropsAba & {
  aoMandar: (ordem: Ordem, dados?: Record<string, unknown>) => Promise<void>
}) {
  const [pedidos, setPedidos] = useState<PedidoAlcada[]>([])
  const [pedidoMotor, setPedidoMotor] = useState<PedidoMotor | null>(null)
  const [instrucao, setInstrucao] = useState(f.instrucao ?? '')
  const [modo, setModo] = useState(f.modo ?? '')
  const [obs, setObs] = useState('')
  const [ocupado, setOcupado] = useState('')

  useEffect(() => {
    let vivo = true
    const supabase = createClient()
    const ler = async () => {
      const [a, m] = await Promise.all([
        supabase.from('agente_pedidos').select('id, acao, acao_rotulo, motivo, quem, pedido_em, status, args, decisao_crm')
          .eq('status', 'aberto').or(`pasta.eq.${JSON.stringify(f.pasta)},chave.eq.${JSON.stringify(f.chave ?? '')}`)
          .order('pedido_em', { ascending: false }).limit(10),
        supabase.from('analise_pedidos').select('*').eq('pasta', f.pasta).order('criado_em', { ascending: false }).limit(1),
      ])
      if (!vivo) return
      setPedidos((a.data ?? []) as PedidoAlcada[])
      setPedidoMotor(((m.data ?? [])[0] ?? null) as PedidoMotor | null)
    }
    ler()
    const canal = supabase.channel(`card-analise-${f.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agente_pedidos' }, ler)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analise_pedidos' }, ler)
      .subscribe()
    return () => { vivo = false; supabase.removeChannel(canal) }
  }, [f.id, f.pasta, f.chave])

  const decidirAlcada = async (p: PedidoAlcada, decisao: 'autorizar' | 'autorizar_sempre' | 'negar') => {
    let motivo = ''
    if (decisao === 'negar') motivo = window.prompt('Por que não? (ele lê isto, e é assim que ele aprende o seu critério)') ?? ''
    setOcupado(p.id)
    const supabase = createClient()
    await supabase.from('agente_pedidos').update({
      decisao_crm: decisao, decisao_crm_por: quem.nome ?? 'marco', decisao_crm_em: new Date().toISOString(), decisao_crm_motivo: motivo || null,
    }).eq('id', p.id)
    setOcupado('')
  }

  const responderMotor = async (opcaoId: string) => {
    if (!pedidoMotor) return
    setOcupado(opcaoId)
    const supabase = createClient()
    await supabase.from('analise_pedidos').update({
      estado: 'respondido', resposta: opcaoId, observacao: obs.trim() || null,
      respondido_em: new Date().toISOString(), respondido_por: quem.nome,
    }).eq('id', pedidoMotor.id)
    setObs(''); setOcupado('')
    // A opção que manda seguir vira a ordem de analisar, pelo mesmo caminho.
    if (opcaoId !== 'deixar') await aoMandar('iniciar', { instrucao, modo })
    await recarregar()
  }

  const rodando = f.situacao === 'em_andamento'
  const parou = f.situacao === 'erro'
  const cad = f.cadastro
  const bloqueado = cad?.status === 'bloqueado' && f.situacao !== 'concluida'
  const a = f.arquivos
  const escolhidos = a ? a.arquivos.filter(x => f.arquivos_fora_em ? !(f.arquivos_fora ?? []).includes(x.rel) && !x.ignorado : x.usar) : []
  const contabeis = escolhidos.filter(x => x.classe === 'contabil')
  const forasDaLista = a ? a.arquivos.filter(x => !escolhidos.includes(x)) : []
  const temPasta = !f.arquivada && a?.onde !== null && !!a
  const podeMandar = quem.podeEscrever && !f.ordem
  const impedido = rodando || (a ? escolhidos.length === 0 : false)
  const oks = (cad?.itens ?? []).filter(i => i.situacao === 'ok' || i.situacao === 'dispensado').length
  const faltam = (cad?.itens ?? []).filter(i => !(i.situacao === 'ok' || i.situacao === 'dispensado'))
  const ordemPrincipal: Ordem = bloqueado ? 'forcar' : (f.situacao === 'concluida' ? 'refazer' : 'iniciar')
  const rotuloPrincipal = bloqueado ? 'Analisar mesmo assim' : parou ? '▶ Reiniciar a análise' : f.situacao === 'concluida' ? 'Refazer a análise' : 'Analisar agora'

  const mandar = async (ordem: Ordem, extra?: Record<string, unknown>) => {
    setOcupado(ordem)
    await aoMandar(ordem, { instrucao, modo, ...extra })
    setOcupado('')
  }

  return (
    <div>
      {/* ── 1. precisa da sua autorização ── */}
      {pedidos.length > 0 && (
        <div className="an-bloco">
          <h4>Precisa da sua autorização{pedidos.length > 1 && <span className="dir">{pedidos.length} pedidos</span>}</h4>
          {pedidos.map(p => (
            <div key={p.id} className="an-pedido">
              <div className="cab">{p.acao_rotulo || p.acao}</div>
              <div style={{ fontSize: 12, color: '#6080a0', marginBottom: 6 }}>pedido por <b>{p.quem || 'a IA'}</b> · {dataCurta(p.pedido_em)}</div>
              {p.motivo && <div className="raz">{p.motivo}</div>}
              {p.decisao_crm ? (
                <div className="an-aviso bom" style={{ marginTop: 10 }}><span>✓</span><span>Você decidiu: <b>{p.decisao_crm === 'negar' ? 'negar' : p.decisao_crm === 'autorizar_sempre' ? 'autorizar e liberar sempre' : 'autorizar'}</b>. O notebook aplica em segundos.</span></div>
              ) : quem.analista ? (
                <div className="an-bt-linha" style={{ marginTop: 10 }}>
                  <button type="button" className="an-bt ouro" disabled={!!ocupado} onClick={() => decidirAlcada(p, 'autorizar')}>Autorizar</button>
                  <button type="button" className="an-bt" disabled={!!ocupado} onClick={() => decidirAlcada(p, 'autorizar_sempre')}>Autorizar e liberar sempre</button>
                  <button type="button" className="an-bt forcar" disabled={!!ocupado} onClick={() => decidirAlcada(p, 'negar')}>Negar</button>
                </div>
              ) : <div className="an-dica">A decisão é do analista de crédito. Você está acompanhando.</div>}
            </div>
          ))}
        </div>
      )}

      {pedidoMotor && pedidoMotor.estado === 'aberto' && (
        <div className="an-bloco">
          <h4>A análise parou e precisa de você</h4>
          <div className="an-pedido">
            <div className="mot">{pedidoMotor.motivo}</div>
            {pedidoMotor.razao && <div className="raz">{pedidoMotor.razao}</div>}
            {quem.analista ? (
              <>
                <div className="an-campo" style={{ marginTop: 10, marginBottom: 8 }}>
                  <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Quer dizer alguma coisa junto? (opcional)" />
                </div>
                <div className="an-bt-linha">
                  {pedidoMotor.opcoes.map(o => (
                    <button key={o.id} type="button" className="an-bt" title={o.detalhe ?? undefined} disabled={!!ocupado} onClick={() => responderMotor(o.id)}>
                      {ocupado === o.id ? 'Enviando…' : o.rotulo}
                    </button>
                  ))}
                </div>
              </>
            ) : <div className="an-dica">A decisão é do analista de crédito. Você está acompanhando.</div>}
          </div>
        </div>
      )}
      {pedidoMotor && pedidoMotor.estado === 'respondido' && (
        <div className="an-aviso"><span>✓</span><span><b>Você decidiu:</b> {pedidoMotor.opcoes.find(o => o.id === pedidoMotor.resposta)?.rotulo ?? pedidoMotor.resposta}
          {pedidoMotor.respondido_em ? ` · ${dataCurta(pedidoMotor.respondido_em)}` : ''}{pedidoMotor.observacao ? ` · “${pedidoMotor.observacao}”` : ''}</span></div>
      )}

      {/* ── 2. em andamento ── */}
      {rodando && (
        <div className="an-bloco">
          <h4>Análise em andamento</h4>
          <div className="an-pensando"><i className="an-girando" /><span><b>{f.etapa_texto || 'Trabalhando…'}</b>{f.trava_maquina ? ` · ${f.trava_maquina}` : ''}{f.etapa_em ? ` · ${desde(f.etapa_em)}` : ''}</span></div>
          <div className="an-barra"><i style={{ width: `${andamentoDaEtapa(f.etapa)}%` }} /></div>
          <div className="an-dica">Etapa {Math.max(1, ETAPAS.findIndex(([id]) => id === f.etapa) + 1)} de {ETAPAS.length - 1}. O andamento aparece na Mesa, na faixa de cima.</div>
          {quem.podeEscrever && (
            <div className="an-bt-linha" style={{ marginTop: 10 }}>
              <button type="button" className="an-bt forcar" disabled={!podeMandar || !!ocupado} onClick={() => mandar('parar')}>Interromper agora</button>
              <span className="an-bt-nota">Derruba a execução e devolve a pasta para a fila, sem apagar nada.</span>
            </div>
          )}
        </div>
      )}

      {/* ── 3. por que parou ── */}
      {parou && (
        <div className="an-bloco">
          <h4>Por que parou</h4>
          <div className="an-aviso erro"><span>⛔</span><span>{f.erro || f.motivo || 'A análise terminou em erro, sem motivo registrado.'}</span></div>
          <div className="an-dica">O que já tinha sido lido continua na pasta: reiniciar não joga fora o trabalho feito.</div>
        </div>
      )}
      {f.situacao === 'pausada' && (
        <div className="an-bloco">
          <h4>Parada por você</h4>
          <div className="an-aviso aviso"><span>⏸</span><span>{f.motivo}</span></div>
          {quem.podeEscrever && <div className="an-bt-linha" style={{ marginTop: 8 }}>
            <button type="button" className="an-bt" disabled={!podeMandar || !!ocupado} onClick={() => mandar('retomar')}>Voltar para a fila</button>
          </div>}
        </div>
      )}

      {/* ── 4. a triagem ── */}
      {cad && cad.itens?.length > 0 && (
        <div className="an-bloco">
          <h4>A triagem</h4>
          <div className="an-resumo">
            <b>{oks} de {cad.itens.length}</b> conferidos · {faltam.length ? <>falta {faltam.map(i => i.nome).join(', ')}</> : 'nada faltando'}.
            {(cad.produto || f.produto) && <><br />Produto: <b>{cad.produto || f.produto}</b></>}
            {(cad.corretora || f.corretora) && <> · Corretora: <b>{cad.corretora || f.corretora}</b></>}
          </div>
          {cad.itens.map(i => {
            const ok = i.situacao === 'ok' || i.situacao === 'dispensado'
            return (
              <div key={i.id} className="an-fam">
                <b>{i.nome}</b>
                <span className="n">{i.exigencia === 'bloqueia' ? 'obrigatório' : 'sinaliza'}</span>
                <span className={`est ${ok ? 'ok' : i.situacao === 'duvida' ? 'duvida' : i.situacao === 'a_caminho' ? 'a_caminho' : 'falta'}`}>
                  {i.situacao === 'ok' ? 'recebido' : i.situacao === 'dispensado' ? 'dispensado' : i.situacao === 'duvida' ? 'a confirmar' : i.situacao === 'a_caminho' ? 'vai chegar' : 'faltando'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 5. o portão do cadastro ── */}
      {bloqueado && (
        <div className="an-bloco">
          <h4>Análise</h4>
          <div className="an-aviso erro"><span>⛔</span><span>{cad?.motivo || 'Falta documento obrigatório.'}</span></div>
          <div className="an-explica">Se o documento <b>já está na pasta</b>, é a conferência que está velha: eu releio a pasta agora, abro o e-mail que estiver dentro e refaço a lista. Se você quer analisar assim mesmo, com o que tem, a decisão é sua.</div>
          {quem.podeEscrever && (
            <div className="an-bt-linha">
              <button type="button" className="an-bt" disabled={!podeMandar || !!ocupado} onClick={() => mandar('reconferir')}>Reler a pasta agora</button>
              <button type="button" className="an-bt forcar" disabled={!podeMandar || !!ocupado}
                onClick={() => { if (window.confirm(`Analisar sem ${(cad?.bloqueios ?? []).map(b => b.nome).join(' e ') || 'os documentos obrigatórios'}?\n\nVou reler a pasta primeiro. Se mesmo assim não achar, começo a análise do mesmo jeito e ela sai apontando o que faltou. Fica registrado que a liberação foi sua.`)) mandar('forcar') }}>
                Analisar mesmo assim
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── 6. rodar ── */}
      <div className="an-bloco">
        <h4>{temPasta || !a ? 'Rodar a análise de crédito' : 'Refazer a análise'}</h4>
        {a && !temPasta && f.situacao !== 'concluida' ? (
          <div className="an-vazio">A pasta deste tomador não está na raiz. Use o <b>Refazer</b>: ele traz a pasta de volta de <b>_concluidas</b>, junta o que chegou e devolve para a fila.</div>
        ) : null}

        {a && (
          <div className="an-resumo">
            Vou ler <b>{escolhidos.length}</b> arquivo{escolhidos.length === 1 ? '' : 's'}
            {contabeis.length ? <>, sendo <b>{contabeis.length}</b> {contabeis.length === 1 ? 'contábil' : 'contábeis'}</> : null}.
            {forasDaLista.length ? (
              <ul>{forasDaLista.slice(0, 5).map(x => <li key={x.rel}>fora: {x.nome}</li>)}{forasDaLista.length > 5 && <li>e mais {forasDaLista.length - 5}</li>}</ul>
            ) : ' Nada foi deixado de fora.'}
          </div>
        )}
        {(a?.avisos ?? []).filter(v => v.nivel === 'erro').map((v, i) => (
          <div key={i} className="an-aviso erro"><span>⛔</span><span>{v.txt}</span></div>
        ))}
        {!a && <div className="an-explica">A lista de arquivos chega pelo agente do notebook. Sem ela, a análise roda com tudo o que estiver na pasta.</div>}

        {quem.podeEscrever && (
          <>
            <div className="an-campo">
              <label htmlFor="an-modo">Como rodar</label>
              <select id="an-modo" value={modo} onChange={e => setModo(e.target.value)}>
                <option value="">Completa, no modelo forte (o de sempre)</option>
                <option value="rapida">Rápida, no modelo veloz</option>
              </select>
              <div className="an-dica" style={{ marginTop: 3 }}>A rápida serve para ver o retrato antes de decidir. Análise que vai para o comitê roda no forte.</div>
            </div>
            <div className="an-campo">
              <label htmlFor="an-instrucao">O que observar nesta análise</label>
              <textarea id="an-instrucao" value={instrucao} onChange={e => setInstrucao(e.target.value)}
                placeholder="Opcional. Ex.: o balanço de 2025 é consolidado, use o da controladora. A obra é em consórcio, considere só a parte da tomadora." />
              <div className="an-dica" style={{ marginTop: 3 }}>Isto vai junto com a sua seleção de arquivos, no mesmo recado que a análise lê antes de começar.</div>
            </div>

            <div className="an-bt-linha">
              <button type="button" className={`an-bt grande ${bloqueado ? 'forcar' : 'ouro'}`} disabled={!podeMandar || impedido || !!ocupado}
                onClick={() => {
                  if (ordemPrincipal === 'forcar' && !window.confirm('Analisar mesmo faltando documento obrigatório? Fica registrado que a liberação foi sua.')) return
                  mandar(ordemPrincipal, ordemPrincipal === 'refazer' ? { escopo: 'completa' } : {})
                }}>
                {ocupado === ordemPrincipal ? 'Mandando…' : rotuloPrincipal}
              </button>
              <span className="an-bt-nota">
                {rodando ? 'Já tem uma análise desta pasta rodando.'
                  : f.ordem ? `Esperando o notebook executar "${ORDEM[f.ordem].rotulo.toLowerCase()}".`
                    : a && !escolhidos.length ? 'Marque ao menos um arquivo na aba Arquivos.'
                      : bloqueado ? 'Vou reler a pasta, registrar o que você dispensou e começar.'
                        : parou ? 'Começa de novo, do zero, e você acompanha pela faixa da Mesa.'
                          : 'Começa agora e você acompanha pela faixa da Mesa. Quem executa é o notebook do analista.'}
              </span>
            </div>
            {f.situacao === 'concluida' && !f.ordem && (
              <div className="an-bt-linha" style={{ marginTop: 6 }}>
                <button type="button" className="an-bt mini" disabled={!!ocupado} onClick={() => mandar('refazer', { escopo: 'parcial' })}>Refazer só as partes relacionadas</button>
                <span className="an-bt-nota">Reaproveita a leitura dos documentos. Score, limite, rating e conclusão são sempre recalculados.</span>
              </div>
            )}
            {!bloqueado && !rodando && f.situacao !== 'concluida' && (
              <div className="an-bt-linha" style={{ marginTop: 6 }}>
                <button type="button" className="an-bt mini" disabled={!podeMandar || !!ocupado} onClick={() => mandar('reconferir')}>Reler a pasta agora</button>
                {f.situacao !== 'pausada' && <button type="button" className="an-bt mini" disabled={!podeMandar || !!ocupado} onClick={() => mandar('pausar')}>Parar</button>}
              </div>
            )}
          </>
        )}

        {f.ordem && (
          <div className="an-ordem">
            <b>{ORDEM[f.ordem].rotulo}</b> pedido por {f.ordem_por ?? 'alguém'} {desde(f.ordem_em)}. Quem executa é o notebook do analista, então isto leva alguns segundos. Com ele desligado, o pedido fica guardado e acontece assim que o agente subir.
          </div>
        )}
        {f.ultima_ordem_resultado && (
          <div className={`an-aviso ${f.ultima_ordem_resultado.startsWith('Não deu') ? 'erro' : 'bom'}`}>
            <span>{f.ultima_ordem_resultado.startsWith('Não deu') ? '⛔' : '✓'}</span>
            <span>{f.ultima_ordem_resultado}<br /><small style={{ opacity: .8 }}>{dataCurta(f.ultima_ordem_em)}</small></span>
          </div>
        )}
        <div className="an-dica">Situação no motor: <b>{SITUACAO[f.situacao]?.rotulo ?? f.situacao}</b>{f.motivo ? ` · ${f.motivo}` : ''}{f.sincronizado_em ? ` · sincronizado ${desde(f.sincronizado_em)}` : ''}</div>
      </div>
    </div>
  )
}
