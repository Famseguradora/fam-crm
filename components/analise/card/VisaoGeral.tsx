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
//  O DESENHO DE 30/09/2026, pedido dele olhando esta aba: "repare o tamanho dos
//  botões do lado direito, temos que melhorar isso, essa tela é muito
//  importante para mim como analista". A referência foi a Mesa da Subscrição:
//  em cima a FAIXA do Crédito (decisão e limite, com o que falta e o botão do
//  template), embaixo os INSTRUMENTOS (Score, Rating, Grupo, Documentos) e as
//  duas colunas. Os seis botões de largura inteira viraram um principal na
//  faixa e atalhos compactos. Os dados são os mesmos de antes, nenhum a mais.
//  A faixa e os instrumentos são as peças de components/painel/Faixa.tsx, as
//  mesmas da bancada de Cadastro e triagem.
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
import { FaixaDaArea, Instrumentos, Instrumento } from '@/components/painel/Faixa'
import { ScoreFormado, EvolucaoExercicios, LimiteFormado } from './GraficosCredito'

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
    createClient().from('analise_colunas').select('id, titulo, fase, dica, cor, ordem, arquivada, regra').order('ordem')
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

  /* ── O QUE A FAIXA DIZ ─────────────────────────────────────────────────
     Tudo do que esta aba JÁ lia (a ficha, os itens do cadastro, o substatus).
     O que falta é dito em linha curta; o texto longo da análise mora na aba
     Relatório, e na faixa viraria parede. */
  const pendentesCad = itens.filter(i => !['ok', 'dispensado'].includes(i.situacao))
  const pontosFaixa: string[] = []
  if (ficha) {
    if (!ficha.revisada) pontosFaixa.push('Gerada pela máquina: falta a sua revisão')
    // O aviso do limite anulado já vai no meio da faixa, embaixo de "ver a análise".
    for (const i of pendentesCad) pontosFaixa.push(`${i.nome}: ${SITUACAO_ITEM[i.situacao]?.rotulo ?? i.situacao}`)
    if (f.substatus) pontosFaixa.push(`Recado: ${f.substatus}`)
    // "Checklist do cadastro", e não "documento": a conferência da pasta é
    // outra conta (o cartão Documentos), e as duas podem discordar.
    if (!pontosFaixa.length) pontosFaixa.push('Revisada, sem pendência no checklist do cadastro')
  }
  const veredito = !ficha
    ? (f.situacao === 'concluida' ? <>Análise <i className="at">a publicar</i></> : <>Análise <i className="at">ainda não feita</i></>)
    : dec.cor === 'ok' ? <i>{dec.txt}</i>
      : dec.cor === 'res' ? <>Aprovar <i className="at">com ressalvas</i></>
        : dec.cor === 'nao' ? <i className="al">{dec.txt}</i>
          : <>{dec.txt}</>
  const detalhesScore = [ficha?.classe ? `classe ${ficha.classe}` : '', ficha?.porte ? `porte ${ficha.porte}` : ''].filter(Boolean).join(' · ')

  const salvarSubstatus = async () => {
    setSalvando(true); setErroSub('')
    const supabase = createClient()
    const t = subTexto.trim().slice(0, 120)
    const agora = new Date().toISOString()
    /* A coluna do código (id `fase:...`) só aparece quando o banco não
       respondeu; ela não é gravável, então vale como "o sistema decide". */
    const coluna = colunaEscolhida && !colunaEscolhida.startsWith('fase:') ? colunaEscolhida : null
    const mudou = coluna !== (f.coluna_id ?? null)
    /* CARD SEM PASTA (28/09/2026): a análise do acervo não tem linha na
       esteira, então a coluna escolhida mora nela (`analises.mesa_coluna_id`).
       Escolher uma coluna também a devolve à Mesa, se tinha sido tirada. */
    if (f.semEsteira && f.analise_id) {
      const { error } = await supabase.from('analises').update({
        mesa_coluna_id: coluna, mesa_por: coluna ? quem.nome : null, mesa_em: coluna ? agora : null,
        ...(coluna ? { fora_da_mesa_em: null, fora_da_mesa_por: null } : {}),
      }).eq('id', f.analise_id)
      setSalvando(false)
      if (error) { setErroSub(error.message); return }
      setSubAberto(false); await recarregar()
      return
    }
    const { error } = await supabase.from('analise_fila').update({
      substatus: t || null, substatus_por: quem.nome, substatus_em: agora,
      ...(mudou ? { coluna_id: coluna, coluna_por: coluna ? quem.nome : null, coluna_em: coluna ? agora : null } : {}),
    }).eq('id', f.id)
    setSalvando(false)
    if (error) { setErroSub(error.message); return }
    setSubAberto(false); await recarregar()
  }

  return (
    <>
      <FaixaDaArea
        rotulo={ficha
          ? `Crédito · análise de ${fmtData(ficha.data_analise)} · ${ficha.revisada ? 'revisada por você' : 'gerada, ainda não revisada por você'}`
          : 'Crédito'}
        veredito={veredito}
        pontos={ficha ? pontosFaixa : f.situacao === 'concluida'
          ? ['A análise foi concluída, mas o resultado ainda não está no banco do CRM',
            'Quem publica é a carga (npm run publicar) ou o botão Finalizar no template']
          : ['Este tomador ainda não tem análise no banco',
            'O que chegou até agora está na aba Arquivos; rodar a análise é na aba Análise']}
        meio={ficha ? {
          rotulo: 'Limite recomendado',
          titulo: ficha.limiteNum !== null ? fmtMoeda(ficha.limiteNum) : 'ver a análise',
          sub: ficha.limiteNum === null ? (ficha.limiteAviso || undefined) : undefined,
        } : undefined}
        acoes={(chaveAnalise && local) || ficha ? (
          <>
            {/* EDITAR É DO ANALISTA (30/09/2026): o template e o "Editar a
                análise" só aparecem para ele e para quem ele liberou em
                /usuarios. Os outros leem o relatório. A trava de verdade é a
                RLS de `analises` (`fam_e_analista()`). */}
            {chaveAnalise && local && quem.analista && (
              <a className="pf-bt ouro" href={`${SISTEMA_LOCAL}/analise/${encodeURIComponent(chaveAnalise)}`} target="_blank" rel="noopener"
                title="Abre a análise no template, onde ela é editada. Só nesta máquina.">Abrir no template</a>
            )}
            {ficha && (!local || !quem.analista) && (
              <button type="button" className="pf-bt ouro" onClick={() => aoIrParaAba('relatorio')}
                title="O relatório inteiro, lendo o banco do CRM">Abrir o relatório</button>
            )}
            {ficha && quem.analista && (
              <button type="button" className="pf-bt" onClick={() => router.push(`/analises/${ficha.id}`)}
                title="Corrigir os dados desta análise (limite, decisão, rating) e ler o relatório inteiro, sem abrir o template.">Editar a análise</button>
            )}
          </>
        ) : undefined}
      />

      {ficha && (
        <Instrumentos>
          <Instrumento titulo="Score FAM" numero={fmtScore(ficha.score_final)} apoio={detalhesScore || undefined}
            origem="memória de cálculo da análise" />
          <Instrumento titulo="Rating" numero={ficha.rating_cod ?? ficha.rating_txt ?? '—'}
            apoio={ficha.nivel_risco ? `risco ${ficha.nivel_risco.toLowerCase()}` : undefined} origem="rating FAM da análise" />
          <Instrumento titulo="Grupo econômico" numero={ficha.grupo ?? 'Não se aplica'}
            apoio={ficha.grupo ? 'a análise considera o grupo' : 'a análise é só do tomador'} origem="estrutura societária da análise" />
          <Instrumento titulo="Documentos" marca="na pasta"
            numero={f.docs ? `${f.docs.feitos} de ${f.docs.total}` : '—'}
            tom={f.docs && f.docs.total > 0 && f.docs.feitos === f.docs.total ? 'ok' : ''}
            apoio={f.docs ? 'conferidos' : 'a lista chega do notebook'} origem="pasta do tomador" />
        </Instrumentos>
      )}

      {/* OS GRÁFICOS (30/09/2026): por que o Score, como a empresa anda, de
          onde saiu o limite. Ver o cabeçalho de GraficosCredito.tsx. */}
      {ficha && (
        <div className="an-duas">
          {/* minWidth 0: sem ele a coluna da grade cresce até o texto mais longo
              e o celular ganha rolagem lateral. */}
          <div className="an-bloco" style={{ minWidth: 0 }}>
            <h4>Como o Score foi formado
              {ficha.score_final !== null && <span className="dir">Score {fmtScore(ficha.score_final)}</span>}
            </h4>
            <ScoreFormado memoria={ficha.scoreMemoria} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="an-bloco">
              <h4>Como o limite foi formado</h4>
              <LimiteFormado ficha={ficha} />
            </div>
            <div className="an-bloco">
              <h4>Evolução dos exercícios</h4>
              <EvolucaoExercicios exercicios={ficha.exercicios} />
            </div>
          </div>
        </div>
      )}

    <div className="an-duas">
      {/* ── esquerda: o que se lê e escreve ── */}
      <div>
        {/* O antigo bloco "A análise" saiu: com análise, os números estão na
            faixa e nos instrumentos; sem ela, a faixa diz por quê e quem publica. */}
        <div className="an-bloco">
          <h4>O que eu sei deste tomador</h4>
          <Notas chave={f.chave || f.pasta} filaId={f.semEsteira ? null : f.id} tomadorId={f.tomador_id} cnpj={f.cnpj}
            podeEscrever={quem.podeEscrever} nomeUsuario={quem.nome} />
        </div>
      </div>

      {/* ── direita: o que se faz e confere ── */}
      <div>
        {/* OS ATALHOS  ·  30/09/2026. Eram seis botões de largura inteira, todos
            com o mesmo peso, ocupando meia tela. O principal (template ou
            relatório) subiu para a faixa; o resto virou esta grade compacta, na
            mesma ordem de antes. Nenhum botão sumiu. */}
        <div className="an-bloco">
          <h4>Atalhos da análise</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
            {chaveAnalise && local && (
              <a className="an-bt mini contorno" style={{ textAlign: 'center' }} href={`${SISTEMA_LOCAL}/analise/${encodeURIComponent(chaveAnalise)}?versao=gerada`} target="_blank" rel="noopener"
                title="A análise do jeito que eu entreguei, antes da sua edição. Somente leitura: não tem como salvar por cima da sua.">Como eu entreguei</a>
            )}
            {chaveAnalise && local && (
              <a className="an-bt mini" style={{ textAlign: 'center' }} href={`${SISTEMA_LOCAL}/gerencial/${encodeURIComponent(chaveAnalise)}`} target="_blank" rel="noopener"
                title="Relatório de uma página, com a conclusão em destaque, para anexar no e-mail">Relatório gerencial</a>
            )}
            {ficha && (
              <button type="button" className="an-bt mini" onClick={() => router.push(`/analises/${ficha.id}`)}
                title="O relatório fracionado, seção por seção, lendo o banco">Relatório no CRM</button>
            )}
            {f.caso_id && (
              <button type="button" className="an-bt mini" onClick={() => router.push(`/comercial/${f.caso_id}`)}
                title="A estação anterior da esteira: o CNPJ, o cadastro do tomador e os documentos que o Comercial recebeu por e-mail.">Triagem e cadastro</button>
            )}
            {quem.podeEscrever && (
              <button type="button" className={`an-bt mini${f.substatus || f.coluna_id ? ' contorno' : ''}`}
                onClick={() => { setColunaEscolhida(f.coluna_id ?? null); setSubTexto(f.substatus ?? ''); setSubAberto(true) }}
                title="Escolha a coluna da Mesa onde este card fica (Interrompido, ou outra que você criou) e deixe um recado">
                {f.substatus || f.coluna_id ? 'Mudar o substatus' : 'Substatus'}
              </button>
            )}
          </div>
          <div className="an-acoes">
            {f.substatus && (
              <div className="an-aviso aviso" style={{ margin: '10px 0 0' }}>
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
    </>
  )
}
