'use client'

// ============================================================================
//  ABA 1: VISÃO GERAL  ·  a página do tomador do cockpit, em duas colunas
//
//  À esquerda o que se LÊ E ESCREVE: a ficha da análise (Score, Rating,
//  Decisão, Limite, Grupo, Última análise, com o Editar) e as notas dele.
//  À direita o que se FAZ E CONFERE: os botões (Abrir no template, Como eu
//  entreguei, Relatório gerencial, Substatus) e os documentos do tomador, com
//  a porta da pasta. Cada bloco no lugar onde ele cai no cockpit.
//
//  OS BOTÕES DO TEMPLATE só aparecem quando o Sistema de Análise responde nesta
//  máquina: o relatório continua sendo EDITADO lá (ordem dele de 01/09/2026, o
//  v13.html não se mexe). Fora da máquina dele, o botão vira "Abrir o
//  relatório no CRM", que é a leitura nativa.
// ============================================================================

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtMoeda, fmtData } from '@/lib/utils'
import { fmtScore } from '@/components/analise/Relatorio'
import Notas from './Notas'
import { SISTEMA_LOCAL, decisaoLimpa, type PropsAba } from './comum'
import { dataCurta, colunasVisiveis, colunaDoCard, type ColunaMesa } from '@/lib/analise/mesa'
import { faseDe, type Fase } from '@/lib/analise/esteira'

const SITUACAO_ITEM: Record<string, { rotulo: string; cls: string }> = {
  ok: { rotulo: 'recebido', cls: 'ok' },
  duvida: { rotulo: 'a confirmar', cls: 'duvida' },
  faltando: { rotulo: 'faltando', cls: 'falta' },
  a_caminho: { rotulo: 'vai chegar', cls: 'a_caminho' },
  dispensado: { rotulo: 'dispensado', cls: 'dispensado' },
}

export default function VisaoGeral({ f, ficha, quem, local, recarregar, aoIrParaAba }: PropsAba & { aoIrParaAba: (a: string) => void }) {
  const router = useRouter()
  const [subAberto, setSubAberto] = useState(false)
  const [subTexto, setSubTexto] = useState(f.substatus ?? '')
  const [salvando, setSalvando] = useState(false)
  /* AS COLUNAS DA MESA, dentro do botão do substatus (17/09/2026). Pedido
     dele: "dentro desse botão irá aparecer uma lista com os status das colunas
     da Mesa". Escolher uma coluna manda o card para ela no quadro; "deixar o
     sistema decidir" devolve o card à coluna da fase. */
  const [colunas, setColunas] = useState<ColunaMesa[]>([])
  const [colunaEscolhida, setColunaEscolhida] = useState<string | null>(f.coluna_id ?? null)
  const [erroSub, setErroSub] = useState('')

  useEffect(() => {
    if (!subAberto) return
    let vivo = true
    createClient().from('analise_colunas').select('id, titulo, fase, dica, cor, ordem, arquivada').order('ordem')
      .then(({ data, error }) => { if (vivo) setColunas(colunasVisiveis(error ? null : (data as ColunaMesa[]))) })
    return () => { vivo = false }
  }, [subAberto])

  const faseAgora = ((f.fase as Fase) || faseDe(f.situacao, f.cadastro?.status)) as Fase
  const colunaAutomatica = colunas.find(c => c.fase === faseAgora)
  const colunaAtual = colunas.length ? colunaDoCard(f, faseAgora, colunas) : null

  const chaveAnalise = ficha?.chave_local ?? f.analise_chave ?? null
  const dec = decisaoLimpa(ficha?.recomendacao)
  const itens = f.cadastro?.itens ?? []
  const docsPorFamilia = (() => {
    const arqs = f.arquivos?.arquivos ?? []
    const conta = (classe: string) => arqs.filter(a => a.classe === classe)
    const anos = conta('contabil').map(a => (a.nome.match(/20\d\d/g) ?? []).map(Number)).flat().filter(n => n >= 2015 && n <= 2035)
    const anoTxt = anos.length ? (Math.min(...anos) === Math.max(...anos) ? String(anos[0]) : `${Math.min(...anos)}–${Math.max(...anos)}`) : ''
    return [
      { id: 'contabil', titulo: 'Balanços e DRE', n: conta('contabil').length, escolhidos: conta('contabil').filter(a => a.usar).length, anos: anoTxt },
      { id: 'serasa', titulo: 'Serasa', n: conta('serasa').length, escolhidos: conta('serasa').filter(a => a.usar).length, anos: '' },
      { id: 'societario', titulo: 'Societário e contratos', n: conta('societario').length + conta('contrato').length, escolhidos: [...conta('societario'), ...conta('contrato')].filter(a => a.usar).length, anos: '' },
      { id: 'outro', titulo: 'Outros documentos', n: arqs.filter(a => !['contabil', 'serasa', 'societario', 'contrato'].includes(a.classe)).length, escolhidos: arqs.filter(a => !['contabil', 'serasa', 'societario', 'contrato'].includes(a.classe) && a.usar).length, anos: '' },
    ].filter(x => x.n > 0)
  })()

  const salvarSubstatus = async () => {
    setSalvando(true); setErroSub('')
    const supabase = createClient()
    const t = subTexto.trim().slice(0, 120)
    const agora = new Date().toISOString()
    /* A coluna do código (id `fase:...`) só aparece quando o banco não
       respondeu; ela não é gravável, então vale como "o sistema decide". */
    const coluna = colunaEscolhida && !colunaEscolhida.startsWith('fase:') ? colunaEscolhida : null
    const mudou = coluna !== (f.coluna_id ?? null)
    const { error } = await supabase.from('analise_fila').update({
      substatus: t || null, substatus_por: quem.nome, substatus_em: agora,
      ...(mudou ? { coluna_id: coluna, coluna_por: coluna ? quem.nome : null, coluna_em: coluna ? agora : null } : {}),
    }).eq('id', f.id)
    setSalvando(false)
    if (error) { setErroSub(error.message); return }
    setSubAberto(false); await recarregar()
  }

  return (
    <div className="an-duas">
      {/* ── esquerda: o que se lê e escreve ── */}
      <div>
        <div className="an-bloco">
          <h4>A análise
            {ficha && (
              <span className="dir">
                <button type="button" className="an-bt mini" onClick={() => router.push(`/analises/${ficha.id}`)}
                  title="Corrigir os dados desta análise (limite, decisão, rating) e ler o relatório inteiro, sem abrir o template.">Editar</button>
              </span>
            )}
          </h4>
          {ficha ? (
            <dl className="an-dados">
              <dt>Score FAM</dt><dd>{fmtScore(ficha.score_final)}</dd>
              <dt>Rating</dt><dd>{ficha.rating_cod ?? ficha.rating_txt ?? '—'}</dd>
              <dt>Decisão</dt><dd className={`dec ${dec.cor}`}>{dec.txt}</dd>
              <dt>Limite recomendado</dt>
              <dd>{ficha.limiteNum !== null ? fmtMoeda(ficha.limiteNum) : <span style={{ color: '#a07b1e' }}>ver a análise</span>}
                {ficha.limiteNum === null && ficha.limiteAviso && <small>{ficha.limiteAviso}</small>}</dd>
              <dt>Grupo econômico</dt><dd>{ficha.grupo ?? 'Não se aplica'}</dd>
              <dt>Última análise</dt><dd>{fmtData(ficha.data_analise)}{!ficha.revisada && <small>gerada, ainda não revisada por você</small>}</dd>
            </dl>
          ) : (
            <div className="an-vazio">
              {f.situacao === 'concluida'
                ? <>A análise foi concluída, mas o resultado ainda não está no banco do CRM. Quem publica é a carga (<b>npm run publicar</b>) ou o botão Finalizar no template.</>
                : <>Este tomador ainda não tem análise no banco. O que chegou até agora está na aba <b>Arquivos</b>; rodar a análise é na aba <b>Análise</b>.</>}
            </div>
          )}
        </div>

        <div className="an-bloco">
          <h4>O que eu sei deste tomador</h4>
          <Notas chave={f.chave || f.pasta} filaId={f.semEsteira ? null : f.id} tomadorId={f.tomador_id} cnpj={f.cnpj}
            podeEscrever={quem.podeEscrever} nomeUsuario={quem.nome} />
        </div>
      </div>

      {/* ── direita: o que se faz e confere ── */}
      <div>
        <div className="an-bloco">
          <div className="an-acoes">
            {chaveAnalise && local && (
              <a className="an-bt ouro" href={`${SISTEMA_LOCAL}/analise/${encodeURIComponent(chaveAnalise)}`} target="_blank" rel="noopener"
                title="Abre a análise no template, onde ela é editada. Só nesta máquina.">Abrir no template</a>
            )}
            {ficha && !local && (
              <button type="button" className="an-bt ouro" onClick={() => aoIrParaAba('relatorio')}
                title="O relatório inteiro, lendo o banco do CRM">Abrir o relatório</button>
            )}
            {chaveAnalise && local && (
              <a className="an-bt contorno" href={`${SISTEMA_LOCAL}/analise/${encodeURIComponent(chaveAnalise)}?versao=gerada`} target="_blank" rel="noopener"
                title="A análise do jeito que eu entreguei, antes da sua edição. Somente leitura: não tem como salvar por cima da sua.">Como eu entreguei</a>
            )}
            {chaveAnalise && local && (
              <a className="an-bt" href={`${SISTEMA_LOCAL}/gerencial/${encodeURIComponent(chaveAnalise)}`} target="_blank" rel="noopener"
                title="Relatório de uma página, com a conclusão em destaque, para anexar no e-mail">Relatório gerencial</a>
            )}
            {ficha && (
              <button type="button" className="an-bt" onClick={() => router.push(`/analises/${ficha.id}`)}
                title="O relatório fracionado, seção por seção, lendo o banco">Relatório no CRM</button>
            )}
            {f.caso_id && (
              <button type="button" className="an-bt" onClick={() => router.push(`/comercial/${f.caso_id}`)}
                title="A estação anterior da esteira: o CNPJ, o cadastro do tomador e os documentos que o Comercial recebeu por e-mail.">Triagem e cadastro</button>
            )}
            {quem.podeEscrever && (
              <button type="button" className={`an-bt${f.substatus || f.coluna_id ? ' contorno' : ''}`}
                onClick={() => { setColunaEscolhida(f.coluna_id ?? null); setSubTexto(f.substatus ?? ''); setSubAberto(true) }}
                title="Escolha a coluna da Mesa onde este card fica (Interrompido, ou outra que você criou) e deixe um recado">
                {f.substatus || f.coluna_id ? 'Mudar o substatus' : 'Substatus'}
              </button>
            )}
            {f.substatus && (
              <div className="an-aviso aviso" style={{ margin: 0 }}>
                <span>📌</span>
                <span><b>{f.substatus}</b><br /><small style={{ color: '#8a6410' }}>{f.substatus_por ?? 'Marco'}{f.substatus_em ? ` · ${dataCurta(f.substatus_em)}` : ''}</small></span>
              </div>
            )}
            {/* O QUE SÓ RODA NA MÁQUINA DELE TEM QUE DIZER ISSO  ·  23/09/2026
                Ordem dele ao abrir a Análise para a equipe: "o que só roda no
                computador do Marco Dragone, informe isso quando alguém tentar
                acessar a função."

                Antes daqui os botões do template simplesmente SUMIAM fora da
                máquina dele, e só havia aviso quando não existia análise — ou
                seja, justamente no caso em que faltava menos coisa. Com uma
                análise publicada, que é o caso comum, o colega via três botões
                a menos e nenhuma palavra sobre o porquê. Sumir não é avisar. */}
            {!local && (
              <div className="an-dica">
                {chaveAnalise ? (
                  <><b>Abrir no template, Como eu entreguei e o Relatório gerencial</b> não aparecem aqui:
                  eles abrem o motor da análise, que roda só no computador do Marco (<code>127.0.0.1:7311</code>)
                  e não responde de outra máquina. O relatório inteiro está no botão <b>Abrir o relatório</b>,
                  lido do banco do CRM, e vale de qualquer lugar.</>
                ) : (
                  <>Os botões do template aparecem só no computador do Marco, onde o Sistema de
                  Análise está de pé. Desta máquina, o que existe desta empresa é o que já foi
                  publicado no banco.</>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="an-bloco">
          <h4>Documentos do tomador
            <span className="dir">{f.docs ? `${f.docs.feitos} de ${f.docs.total} conferidos` : ''}</span>
          </h4>
          {docsPorFamilia.length > 0 ? docsPorFamilia.map(d => (
            <div key={d.id} className="an-fam">
              <b>{d.titulo}</b>
              <span className="n">{d.escolhidos} de {d.n}</span>
              {d.anos && <span className="anos">{d.anos}</span>}
            </div>
          )) : (
            <div className="an-vazio">
              {f.arquivos ? 'A pasta está vazia.' : 'A lista de arquivos ainda não chegou do notebook. O agente da esteira manda a cada sincronização.'}
            </div>
          )}

          {itens.length > 0 && (
            <div className="an-chips" style={{ marginTop: 10 }}>
              {itens.map(i => {
                const s = SITUACAO_ITEM[i.situacao] ?? { rotulo: i.situacao, cls: '' }
                return <span key={i.id} className={`an-chip ${s.cls === 'ok' ? 'ok' : s.cls === 'falta' ? 'falta' : s.cls === 'duvida' ? 'duvida' : ''}`}
                  title={`${i.nome}: ${s.rotulo}`}>{i.chip}</span>
              })}
            </div>
          )}

          <div className="an-bt-linha" style={{ marginTop: 12 }}>
            <button type="button" className="an-bt" onClick={() => aoIrParaAba('arquivos')}>Ver os arquivos</button>
            {local && f.chave && (
              <a className="an-bt" href={`${SISTEMA_LOCAL}/#tomador/${encodeURIComponent(f.chave)}`} target="_blank" rel="noopener"
                title="Abre este tomador no Sistema de Análise, onde o botão abre a pasta no Windows">Abrir a pasta do tomador</a>
            )}
            {!local && f.chave && (
              <span className="an-dica" style={{ margin: 0 }}
                title="127.0.0.1:7311 é o endereço do motor, e endereço local só existe na própria máquina">
                Abrir a pasta no Windows é só no computador do Marco.
              </span>
            )}
          </div>
          <div className="an-dica">
            Chegou documento? Solte o arquivo na pasta do tomador no OneDrive e clique em <b>Reler a pasta</b> na aba Análise. Ele entra aqui e o Refazer parte dele.
          </div>
        </div>
      </div>

      {subAberto && (
        <div className="an-modal" onClick={e => { if (e.target === e.currentTarget) setSubAberto(false) }}>
          <div className="an-modal-caixa" role="dialog" aria-label="Substatus da análise">
            <h3>Substatus de {f.nome || f.razao_social || f.pasta}</h3>
            <p className="an-explica">
              Escolha a coluna da Mesa onde este card fica. A sua escolha vence o sistema: o card não sai
              dela sozinho, nem quando a análise andar. Para criar uma coluna nova, use o <b>+ Nova coluna</b> no fim da Mesa.
            </p>

            <div className="an-campo">
              <label>Coluna na Mesa</label>
              {!colunas.length ? (
                <div className="an-dica">Lendo as colunas…</div>
              ) : (
                <div className="an-colunas-escolha" role="radiogroup" aria-label="Coluna na Mesa">
                  <label className={`an-col-op${!colunaEscolhida ? ' on' : ''}`}>
                    <input type="radio" name="coluna" checked={!colunaEscolhida} onChange={() => setColunaEscolhida(null)} />
                    <span className="pt" style={{ background: colunaAutomatica?.cor ?? '#8a95a3' }} />
                    <span><b>Deixar o sistema decidir</b>
                      <small>hoje cai em {colunaAutomatica?.titulo ?? 'Entrada'}, pela fase da análise</small></span>
                  </label>
                  {colunas.map(c => (
                    <label key={c.id} className={`an-col-op${colunaEscolhida === c.id ? ' on' : ''}`}>
                      <input type="radio" name="coluna" checked={colunaEscolhida === c.id} onChange={() => setColunaEscolhida(c.id)} />
                      <span className="pt" style={{ background: c.cor }} />
                      <span><b>{c.titulo}</b>
                        <small>{c.fase ? 'coluna do sistema' : 'coluna sua'}{colunaAtual?.id === c.id ? ' · está aqui agora' : ''}</small></span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="an-campo">
              <label htmlFor="sub-recado">Recado (opcional)</label>
              <input id="sub-recado" type="text" value={subTexto} onChange={e => setSubTexto(e.target.value)} maxLength={120}
                placeholder="Ex.: interrompido a pedido do corretor, aguardando o balancete de junho"
                onKeyDown={e => { if (e.key === 'Enter') salvarSubstatus() }} />
            </div>
            {erroSub && <div className="an-aviso erro" style={{ margin: '4px 0 0' }}>{erroSub}</div>}
            <div className="an-modal-bts">
              <button type="button" className="an-bt" onClick={() => setSubAberto(false)}>Cancelar</button>
              <button type="button" className="an-bt azul" onClick={salvarSubstatus} disabled={salvando}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
