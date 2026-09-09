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

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtMoeda, fmtData } from '@/lib/utils'
import { fmtScore } from '@/components/analise/Relatorio'
import Notas from './Notas'
import { SISTEMA_LOCAL, decisaoLimpa, type PropsAba } from './comum'
import { dataCurta } from '@/lib/analise/mesa'

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
    setSalvando(true)
    const supabase = createClient()
    const t = subTexto.trim().slice(0, 120)
    const { error } = await supabase.from('analise_fila').update({
      substatus: t || null, substatus_por: quem.nome, substatus_em: new Date().toISOString(),
    }).eq('id', f.id)
    setSalvando(false)
    if (!error) { setSubAberto(false); await recarregar() }
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
          <Notas chave={f.chave || f.pasta} filaId={f.id} tomadorId={f.tomador_id} cnpj={f.cnpj}
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
            {quem.podeEscrever && (
              <button type="button" className={`an-bt${f.substatus ? ' contorno' : ''}`} onClick={() => setSubAberto(true)}
                title="Seu recado por cima do status do sistema: aguardando documentos, aguardando reunião, o que for">
                {f.substatus ? 'Mudar o substatus' : 'Substatus'}
              </button>
            )}
            {f.substatus && (
              <div className="an-aviso aviso" style={{ margin: 0 }}>
                <span>📌</span>
                <span><b>{f.substatus}</b><br /><small style={{ color: '#8a6410' }}>{f.substatus_por ?? 'Marco'}{f.substatus_em ? ` · ${dataCurta(f.substatus_em)}` : ''}</small></span>
              </div>
            )}
            {!ficha && !local && (
              <div className="an-dica">Os botões do template aparecem na máquina do analista, quando o Sistema de Análise está de pé.</div>
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
          </div>
          <div className="an-dica">
            Chegou documento? Solte o arquivo na pasta do tomador no OneDrive e clique em <b>Varrer de Novo</b> na Mesa, ou em <b>Reler a pasta</b> na aba Análise. Ele entra aqui e o Refazer parte dele.
          </div>
        </div>
      </div>

      {subAberto && (
        <div className="an-modal" onClick={e => { if (e.target === e.currentTarget) setSubAberto(false) }}>
          <div className="an-modal-caixa" role="dialog" aria-label="Substatus da análise">
            <h3>Substatus de {f.nome || f.razao_social || f.pasta}</h3>
            <p className="an-explica">Seu recado por cima do status do sistema. Ele acompanha o status, não manda nele. Texto em branco retira a marcação.</p>
            <div className="an-campo">
              <input type="text" value={subTexto} onChange={e => setSubTexto(e.target.value)} maxLength={120}
                placeholder="Ex.: aguardando o balancete de junho, reunião com o corretor dia 12" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') salvarSubstatus() }} />
            </div>
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
