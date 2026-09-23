'use client'

// ============================================================================
//  ABA 2: OS ARQUIVOS, E O QUE ELES CONTAM SOBRE A EMPRESA
//
//  Porte do `painelArquivos` do card.js, na ordem que é a prioridade dele:
//  dinheiro (os demonstrativos do ano corrente), depois quem é a empresa (o
//  retrato do bibliotecário), depois como os documentos se ligam, e por
//  último a lista de arquivos com a seleção do que entra na análise.
//
//  A SELEÇÃO É POR EXCLUSÃO, como no arquivos.mjs: o que ele desmarca vai
//  para `analise_fila.arquivos_fora`, e o agente do notebook aplica na
//  seleção do motor. Documento novo entra por padrão; só fica de fora o que
//  ele tirou com a mão. Num sistema de crédito, esquecer um documento é pior
//  do que ler um a mais.
//
//  A LISTA VEM DO DISCO pelo agente (`analise_fila.arquivos`). Pasta que já
//  saiu do disco mostra o retrato guardado, e diz que é retrato.
//
//  E DESDE 23/09/2026 HÁ UM SEGUNDO BLOCO, "Abrir o documento". Ao abrir a
//  Análise para a equipe, apareceu o furo: a lista de arquivos é do DISCO do
//  Marco, e os botões de abrir apontavam para `127.0.0.1:7311` — na máquina de
//  qualquer colega, botão morto. O que dá para abrir de qualquer lugar é o que
//  entrou pelo CRM, pela triagem, e mora no Storage. É menos do que a lista de
//  cima, e o bloco DIZ que é menos: lista pela metade que se apresenta como
//  inteira é pior do que lista nenhuma numa mesa de crédito.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { dataCurta } from '@/lib/analise/mesa'
import type { ArquivoFila, BibliotecaFila } from '@/lib/analise/mesa'
import { type PropsAba } from './comum'

function semNumero(t: unknown) { return !/\d/.test(String(t ?? '')) }

export default function Arquivos({ f, quem, recarregar, aoMandar }: PropsAba & { aoMandar: (ordem: 'ler_pasta') => Promise<void> }) {
  const a = f.arquivos
  const B: BibliotecaFila | null = f.biblioteca
  const [salvando, setSalvando] = useState(false)
  const fora = new Set(f.arquivos_fora ?? [])
  // O que vale na tela: a decisão do CRM quando existe, senão a marca do disco.
  const usar = (x: ArquivoFila) => (f.arquivos_fora_em ? (!fora.has(x.rel) && !x.ignorado) : x.usar)
  const retrato = a?.fonte === 'retrato'
  const arquivada = a?.onde === 'concluidas'
  const soLeitura = !quem.podeEscrever || retrato || arquivada
  const lendo = f.ordem === 'ler_pasta'

  /* OS DOCUMENTOS QUE ABREM DE QUALQUER MÁQUINA. Endereço assinado vale 5
     minutos, então é buscado na abertura da aba e renovado pelo botão — guardar
     no estado por mais tempo daria link morto na mão de quem clicasse depois. */
  const [doc, setDoc] = useState<{ nome: string; url: string; bytes: number | null }[] | null>(null)
  const [docErro, setDocErro] = useState('')
  const [docCarregando, setDocCarregando] = useState(false)

  const buscarDocumentos = useCallback(async () => {
    setDocCarregando(true)
    setDocErro('')
    try {
      const r = await fetch(`/api/analise/documentos?id=${encodeURIComponent(f.id)}`)
      const j = await r.json()
      if (!r.ok) { setDocErro(j.erro ?? 'Não consegui buscar os documentos.'); setDoc([]) }
      else setDoc(j.documentos ?? [])
    } catch {
      setDocErro('A conexão caiu ao buscar os documentos.')
      setDoc([])
    }
    setDocCarregando(false)
  }, [f.id])

  useEffect(() => { buscarDocumentos() }, [buscarDocumentos])

  const gravarFora = async (novaFora: string[]) => {
    setSalvando(true)
    const supabase = createClient()
    await supabase.from('analise_fila').update({ arquivos_fora: novaFora, arquivos_fora_em: new Date().toISOString() }).eq('id', f.id)
    setSalvando(false)
    await recarregar()
  }
  const alternar = (x: ArquivoFila, marcado: boolean) => {
    const atual = new Set(f.arquivos_fora_em ? fora : (a?.arquivos ?? []).filter(y => !y.usar && !y.ignorado).map(y => y.rel))
    if (marcado) atual.delete(x.rel); else atual.add(x.rel)
    gravarFora([...atual])
  }
  const lote = (classe: string, marcar: boolean, so = false) => {
    const lista = a?.arquivos ?? []
    let atual = new Set(f.arquivos_fora_em ? fora : lista.filter(y => !y.usar && !y.ignorado).map(y => y.rel))
    if (so) atual = new Set(lista.filter(y => !y.ignorado).map(y => y.rel))
    for (const y of lista) {
      if (y.ignorado) continue
      if (classe && y.classe !== classe) continue
      if (marcar) atual.delete(y.rel); else atual.add(y.rel)
    }
    gravarFora([...atual])
  }

  const escolhidos = (a?.arquivos ?? []).filter(x => usar(x)).length
  const porDoc: Record<string, NonNullable<NonNullable<BibliotecaFila['leitura']>['documentos']>[number]> = {}
  for (const d of B?.leitura?.documentos ?? []) porDoc[d.rel] = d

  return (
    <div>
      {/* ── 0. o que abre de qualquer máquina ── */}
      <div className="an-bloco">
        <h4>Abrir o documento
          <span className="dir">
            {docCarregando ? <span className="an-pensando"><i className="an-girando" />buscando…</span> : (
              <button type="button" className="an-bt mini" onClick={buscarDocumentos}
                title="Os endereços valem 5 minutos. Se um link parar de abrir, peça de novo aqui.">↻ renovar os links</button>
            )}
          </span>
        </h4>
        {docErro && <div className="an-aviso aviso"><span>⚠</span><span>{docErro}</span></div>}
        {doc === null ? null : doc.length === 0 ? (
          <div className="an-vazio">
            Nenhum documento desta empresa está guardado no CRM. Os documentos das análises
            feitas antes da triagem do Comercial existem só na pasta do computador do Marco,
            e por isso não abrem daqui. A lista completa do que a análise leu está abaixo.
          </div>
        ) : (
          <>
            <div className="an-dica">
              São os documentos que entraram pelo CRM, pela triagem. A lista completa do que a
              análise leu está mais abaixo, e o que não estiver aqui está só na pasta do Marco.
            </div>
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 5 }}>
              {doc.map((d, i) => (
                <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13.5 }}>
                  <a href={d.url} target="_blank" rel="noopener" style={{ color: '#1e4080', fontWeight: 600 }}>{d.nome}</a>
                  {d.bytes ? <span style={{ fontSize: 11.5, color: '#6080a0' }}>{Math.max(1, Math.round(d.bytes / 1024))} KB</span> : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* ── 1. os demonstrativos financeiros do ano corrente ── */}
      {B?.demonstrativos && (
        <div className="an-bloco">
          <h4>Demonstrativos financeiros de {String(B.demonstrativos.ano)}
            <span className="dir">2024 e 2025 estão dentro da análise</span></h4>
          {B.demonstrativos.tabelas?.length ? B.demonstrativos.tabelas.map((t, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <b style={{ fontSize: 13.5, color: '#0a1628' }}>{t.titulo || 'Exercício corrente'}</b>
                {t.em && <span style={{ fontSize: 11.5, color: '#6080a0' }}>{dataCurta(t.em)}</span>}
              </div>
              {t.texto && <div style={{ fontSize: 13, color: '#26374a', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginTop: 4 }}>{t.texto}</div>}
              {t.tabela?.colunas?.length ? (
                <div className="mt-tab-wrap"><table className="an-cp-tab">
                  <thead><tr>{t.tabela.colunas.map((c, j) => <th key={j}>{c}</th>)}</tr></thead>
                  <tbody>{t.tabela.linhas.map((l, j) => <tr key={j}>{l.map((v, k) => <td key={k}>{v}</td>)}</tr>)}</tbody>
                </table></div>
              ) : null}
            </div>
          )) : <div className="an-vazio">{B.demonstrativos.quando_vazio || 'Nenhum demonstrativo do ano corrente lido ainda.'}</div>}
          {B.demonstrativos.contabeis?.length ? (
            <div className="an-dica">Documentos contábeis desta pasta: {B.demonstrativos.contabeis.map(c => c.nome).join(' · ')}
              {(B.demonstrativos.contabeis_total ?? 0) > B.demonstrativos.contabeis.length ? ` e mais ${(B.demonstrativos.contabeis_total ?? 0) - B.demonstrativos.contabeis.length} na lista abaixo` : ''}</div>
          ) : null}
        </div>
      )}

      {/* ── 2. a empresa, lida dos documentos ── */}
      <div className="an-bloco">
        <h4>A empresa
          <span className="dir">
            {lendo ? <span className="an-pensando"><i className="an-girando" />lendo a pasta…</span>
              : (quem.podeEscrever && (B?.pode_ler || (!retrato && a?.total)) ? (
                <button type="button" className="an-bt mini" onClick={() => aoMandar('ler_pasta')}
                  title="O bibliotecário abre todos os documentos da pasta e escreve o resumo e as ligações. Leva alguns minutos.">
                  {B?.leitura ? '↻ ler de novo' : '📖 ler a pasta'}
                </button>
              ) : null)}
          </span>
        </h4>
        {B?.leitura ? (
          <>
            {B.leitura_velha && <div className="an-aviso aviso"><span>⚠</span><span>Chegou documento novo depois desta leitura. O que está aqui embaixo não inclui o que chegou por último.</span></div>}
            {(() => {
              const e = (B.leitura?.empresa ?? {}) as Record<string, unknown>
              const fichas = Object.entries(e).filter(([k, v]) => typeof v === 'string' && String(v).trim() && !['retrato', 'resumo'].includes(k)).slice(0, 10)
              return (
                <>
                  {typeof e.retrato === 'string' && <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#26374a', marginBottom: 10 }}>{e.retrato}</div>}
                  {fichas.length > 0 && (
                    <div className="an-emp-fichas">
                      {fichas.map(([k, v]) => <div key={k}><span>{k.replace(/_/g, ' ')}</span>{String(v)}</div>)}
                    </div>
                  )}
                </>
              )
            })()}
            {B.leitura.socios?.length ? (
              <>
                <div className="mt-lab" style={{ marginBottom: 5 }}>Sócios e administradores</div>
                <div className="an-emp-fichas">
                  {B.leitura.socios.map((s, i) => (
                    <div key={i}><span>{s.papel || 'sócio'}{s.participacao && !semNumero(s.participacao) ? ` · ${s.participacao}` : ''}</span>{s.nome}</div>
                  ))}
                </div>
              </>
            ) : null}
            {B.leitura.grupo?.length ? (
              <>
                <div className="mt-lab" style={{ marginBottom: 5 }}>Grupo econômico</div>
                <div className="an-emp-fichas">
                  {B.leitura.grupo.map((g, i) => <div key={i}><span>{g.relacao || 'ligada'}</span>{g.nome}</div>)}
                </div>
              </>
            ) : null}
            {B.leitura.em && <div className="an-dica">Lido pelo bibliotecário em {dataCurta(B.leitura.em)}.</div>}
          </>
        ) : (
          <div className="an-vazio">
            {lendo ? 'O bibliotecário está abrindo os documentos desta pasta agora. Leva alguns minutos, e esta aba avisa quando terminar.'
              : <>Ninguém leu esta pasta ainda. A análise de crédito lê os documentos para calcular Score e limite, mas não guarda o que eles contam sobre a empresa. {quem.podeEscrever ? <>Clique em <b>ler a pasta</b> e o bibliotecário abre todos eles, inclusive os que ficaram fora da análise.</> : ''}</>}
          </div>
        )}
      </div>

      {/* ── 3. as ligações entre os documentos ── */}
      {B?.leitura?.ligacoes?.length ? (
        <div className="an-bloco">
          <h4>As ligações entre os documentos</h4>
          <ul className="an-ativ">
            {B.leitura.ligacoes.map((l, i) => (
              <li key={i}><i className="pt" style={{ ['--cor' as string]: '#3070c8' }} /><div className="tx"><b>{l.de}</b> → <b>{l.para}</b>{l.como ? `: ${l.como}` : ''}</div></li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── 4. os arquivos da pasta ── */}
      <div className="an-bloco">
        <h4>Arquivos da pasta<span className="dir">{a ? `${a.total} arquivo${a.total === 1 ? '' : 's'}` : ''}</span></h4>
        {!a || !a.total ? (
          <div className="an-vazio">
            {a ? 'A pasta existe e está vazia. Solte os documentos dentro dela e clique em Reler a pasta na aba Análise.'
              : 'A lista de arquivos ainda não chegou do notebook. O agente da esteira (node scripts/esteira.mjs) manda a cada sincronização; sem ele rodando, esta aba fica vazia.'}
          </div>
        ) : (
          <>
            {retrato ? (
              <div className="an-fonte"><span>🗄</span><span><b>Retrato guardado{a.retrato_em ? ` em ${dataCurta(a.retrato_em)}` : ''}.</b> A pasta não está mais no disco, saiu do sistema depois da análise. Esta é a lista exatamente como ela era, com o que a triagem tinha classificado. Não dá para mudar a seleção.</span></div>
            ) : arquivada ? (
              <div className="an-fonte"><span>📦</span><span>A análise já foi entregue e a pasta está em <b>_concluidas</b>. Mudar a seleção agora não muda a análise que já saiu: para isso, use <b>Refazer</b> na aba Análise.</span></div>
            ) : (
              <p className="an-explica">Marcado é o que entra na análise de crédito. O que você desmarcar vai junto na ordem, com o nome, para a análise não usar nem citar aquele arquivo como fonte.</p>
            )}

            <div className="an-arq-topo">
              <span className="conta"><b>{escolhidos}</b> de {a.total} escolhidos</span>
              {salvando && <span className="an-pensando"><i className="an-girando" />guardando</span>}
              {!soLeitura && (
                <span className="an-lote">
                  <button type="button" onClick={() => lote('', true)}>marcar tudo</button>
                  <button type="button" onClick={() => lote('', false)}>desmarcar tudo</button>
                  <button type="button" onClick={() => lote('contabil', true, true)}>só os contábeis</button>
                </span>
              )}
            </div>

            {a.por_classe?.length ? (
              <div className="an-familias">
                {a.por_classe.map(c => (
                  <span key={c.classe} className="an-familia" style={{ ['--cor' as string]: c.cor }}>
                    <i className="an-bola" />{c.rotulo} <b>{(a.arquivos ?? []).filter(x => x.classe === c.classe && usar(x)).length}</b>/{c.total}
                  </span>
                ))}
              </div>
            ) : null}

            {(a.avisos ?? []).map((v, i) => (
              <div key={i} className={`an-aviso ${v.nivel === 'erro' ? 'erro' : 'aviso'}`}><span>{v.nivel === 'erro' ? '⛔' : '⚠'}</span><span>{v.txt}</span></div>
            ))}
            {f.arquivos_fora_em && !soLeitura && (
              <div className="an-dica">A seleção foi mudada aqui em {dataCurta(f.arquivos_fora_em)}; o notebook aplica na próxima volta do agente.</div>
            )}

            <ul className="an-arqs">
              {a.arquivos.map(x => {
                const doc = porDoc[x.rel]
                const marcado = usar(x)
                return (
                  <li key={x.rel} className={`an-arq${marcado ? '' : ' fora'}`}>
                    {x.ignorado ? (
                      <span className="caixa" title="O nome começa com _, então a triagem, a extração e a análise pulam este arquivo. Renomeie na pasta para ele entrar.">🔒</span>
                    ) : soLeitura ? (
                      <span className="caixa" title={marcado ? 'Entrou na análise.' : 'Ficou de fora da análise.'}>{marcado ? '✓' : '·'}</span>
                    ) : (
                      <input type="checkbox" checked={marcado} onChange={e => alternar(x, e.target.checked)}
                        title={marcado ? 'Está entrando na análise. Desmarque para deixar de fora.' : 'Está fora da análise. Marque para incluir.'} />
                    )}
                    <div className="an-arq-meio">
                      <div className="an-arq-nome" title={x.rel}>{x.nome}</div>
                      <div className="an-arq-sub">
                        {x.classe && x.classe !== 'outro' && <span className="an-classe" style={{ ['--cor' as string]: x.classe_cor }}><i className="an-bola" />{x.classe_rotulo}</span>}
                        {x.subpasta && <span>{x.subpasta}/</span>}
                        <span>{x.tamanho}</span>
                        {x.ignorado && <span className="an-certeza nao-lido">o sistema está ignorando</span>}
                        {x.nao_lido ? <span className="an-certeza nao-lido">não deu para ler</span>
                          : (x.certeza && x.certeza !== 'alta' ? <span className="an-certeza">certeza {x.certeza}</span> : null)}
                        {(x.atende ?? []).map(t => <span key={t.id} className="an-atende">✓ {t.chip}</span>)}
                        {x.tirado_por_voce && <span style={{ color: '#a02020' }}>tirado por você</span>}
                      </div>
                      {doc && (doc.e || doc.resumo) && (
                        <span className="an-arq-leitura">
                          {doc.e && <b>{doc.e}</b>}{doc.data_base ? ` · ${doc.data_base}` : ''}
                          {doc.resumo && <><br />{doc.resumo}</>}
                          {doc.achados?.length ? <div>{doc.achados.map((h, i) => <span key={i} className="an-achado">{h}</span>)}</div> : null}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
