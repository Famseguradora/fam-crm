'use client'

// ============================================================================
//  AS SEÇÕES DO RELATÓRIO DE CRÉDITO — fonte única.
//
//  Este arquivo é o relatório da análise FRACIONADO em seções, que era a
//  palavra dele em 01/09/2026: o relatório rico vira campo, tabela e tela
//  dentro do CRM, seção por seção, em vez de um documento inteiro guardado
//  como arquivo numa máquina.
//
//  Estas peças nasceram dentro de `app/(dashboard)/tomadores/[id]/page.tsx` e
//  saíram de lá para cá SEM MUDANÇA DE COMPORTAMENTO, porque agora têm dois
//  leitores:
//
//   1. a Mesa do Tomador ......... a análise vigente daquele tomador;
//   2. o acervo, `/analises/<id>`  qualquer análise, inclusive as que nenhum
//                                  tomador do CRM alcança.
//
//  Duplicar isto seria criar duas verdades sobre a mesma análise — o defeito
//  que já queimou uma conversa em 31/08/2026.
//
//  O CSS é o `mt-*` do `app/globals.css`, que é global: as seções desenham
//  igual nas duas telas sem carregar folha própria.
// ============================================================================

import { fmtMoeda, fmtData } from '@/lib/utils'
import type { FichaAnalise, SerasaFicha } from '@/lib/analise/ficha'

/** O Score FAM escrito do MESMO jeito em toda parte: duas casas, vírgula.
 *
 *  O acervo já fazia `toFixed(2)` e a Mesa fazia `String(...)`, então um score
 *  gravado como 9,4050 saía "9,40" numa tela e "9,405" na outra — o mesmo
 *  número com duas caras. Duas casas é como a própria análise publica o Score. */
export function fmtScore(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : v.toFixed(2).replace('.', ',')
}

// ── peças pequenas ──────────────────────────────────────────────────────────

export function Campo({ rotulo, valor, cls, largo }: {
  rotulo: string; valor: React.ReactNode; cls?: string; largo?: boolean
}) {
  return (
    <div className={`mt-campo${largo ? ' largo' : ''}`}>
      <span className="mt-lab">{rotulo}</span>
      <span className={`v${cls ? ' ' + cls : ''}`}>{valor || '—'}</span>
    </div>
  )
}

export function Sub({ texto, cor }: { texto: string; cor: string }) {
  return <div className="mt-sub"><span className="pt" style={{ background: cor }} />{texto}</div>
}

export function Bloco({ titulo, cor, acao, onAcao, children }: {
  titulo: string; cor?: string; acao?: string; onAcao?: () => void; children: React.ReactNode
}) {
  return (
    <section className="mt-card mt-bloco">
      <header className="mt-bloco-cab">
        <span className="pt" style={cor ? { background: cor } : undefined} />
        <span className="mt-bloco-tit">{titulo}</span>
        {acao && <button type="button" className="mt-bloco-acao" onClick={onAcao}>{acao}</button>}
      </header>
      <div className="mt-bloco-corpo">{children}</div>
    </section>
  )
}

// ── a análise: score, rating, taxas, limite ─────────────────────────────────

/** O confronto do limite da análise contra o do cadastro. Só a Mesa do Tomador
 *  tem como montar isso (precisa do tomador); no acervo ele simplesmente não
 *  existe, e a seção continua correta sem ele. */
export interface ConfrontoLimite {
  limiteCadastro: number
  emitido: number
  dataCadastro: string | null
}

export function SecaoAnalise({ ficha, confronto }: {
  ficha: FichaAnalise | null
  confronto?: ConfrontoLimite | null
}) {
  if (!ficha) {
    return (
      <Bloco titulo="Análise de crédito">
        <div className="mt-vazio">
          Nenhuma análise publicada para este CNPJ.
        </div>
        <div className="mt-nota">
          A ficha procura a análise vigente pelo CNPJ. Se a análise existe no seu sistema mas não
          aparece aqui, ou o CNPJ do cadastro está diferente, ou ela ainda não foi publicada no banco.
        </div>
      </Bloco>
    )
  }

  const pct = (v: number | null) => v === null ? '—' : `${String(v).replace('.', ',')}%`

  return (
    <>
      <Bloco titulo={`Análise de crédito · ${fmtData(ficha.data_analise)}`} cor="#1e4080">
        <div className="mt-campos">
          <Campo rotulo="Score FAM" valor={fmtScore(ficha.score_final)} cls="az" />
          <Campo rotulo="Rating" valor={ficha.rating_cod ?? ficha.rating_txt} cls="az" />
          <Campo rotulo="Classe / Porte" valor={[ficha.classe, ficha.porte].filter(Boolean).join(' · ')} />
          <Campo rotulo="Nível de risco" valor={ficha.nivel_risco} />
          <Campo rotulo="Decisão" valor={ficha.recomendacao} cls="forte" />
          <Campo rotulo="Situação" valor={ficha.revisada ? 'Editada por você' : 'Gerada, a revisar'} />
          <Campo
            rotulo="Limite recomendado"
            valor={ficha.limiteNum !== null ? fmtMoeda(ficha.limiteNum) : ficha.limiteAviso}
            cls={ficha.limiteNum !== null ? 'vd' : 'ou'}
            largo={ficha.limiteNum === null}
          />
          <Campo rotulo="Taxa tradicional" valor={pct(ficha.taxa_tradicional)} />
          <Campo rotulo="Taxa judicial" valor={pct(ficha.taxa_judicial)} />
          <Campo rotulo="Taxa estruturada" valor={pct(ficha.taxa_estruturada)} />
        </div>

        {/* O confronto: o limite do cadastro contra o da análise. */}
        {confronto && ficha.limiteNum !== null && (
          <div className="mt-confronto">
            <div className="mt-conf-cab">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e8b84b' }} />
              Limite aprovado · dois valores, e a decisão é sua
            </div>
            <div className="mt-conf-lados">
              <div className="mt-lado">
                <div className="mt-lab">Está no cadastro</div>
                <div className="lv">{fmtMoeda(confronto.limiteCadastro)}</div>
                <div className="lq">
                  Cadastro do CRM{confronto.dataCadastro ? ` · desde ${fmtData(confronto.dataCadastro)}` : ''}
                </div>
              </div>
              <div className="mt-lado novo">
                <div className="mt-lab">A análise recomenda</div>
                <div className="lv">{fmtMoeda(ficha.limiteNum)}</div>
                <div className="lq">Análise de {fmtData(ficha.data_analise)}</div>
              </div>
            </div>
            <div className="mt-conf-acoes">
              <span className="mt-conf-obs">
                Emitido hoje: {fmtMoeda(confronto.emitido)}.
                {confronto.emitido <= Math.min(confronto.limiteCadastro, ficha.limiteNum)
                  ? ' Cabe nos dois.'
                  : ' NÃO cabe no menor dos dois.'}
              </span>
            </div>
            <div className="mt-nota" style={{ marginTop: 12 }}>
              A tela <b>não muda o limite sozinha</b>. Enquanto a regra de publicação não estiver
              ligada, o valor do cadastro continua valendo, e a mudança é feita por você na edição
              do tomador.
            </div>
          </div>
        )}
      </Bloco>

      {(ficha.pontos_positivos.length > 0 || ficha.pontos_atencao.length > 0) && (
        <Bloco titulo="Pontos da análise" cor="#e8b84b">
          {ficha.pontos_positivos.length > 0 && <>
            <Sub texto="Pontos positivos" cor="#27a96c" />
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55 }}>
              {ficha.pontos_positivos.map((p, i) => <li key={i} style={{ marginBottom: 5 }}>{p}</li>)}
            </ul>
          </>}
          {ficha.pontos_atencao.length > 0 && <>
            <Sub texto="Pontos de atenção" cor="#e8b84b" />
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55 }}>
              {ficha.pontos_atencao.map((p, i) => <li key={i} style={{ marginBottom: 5 }}>{p}</li>)}
            </ul>
          </>}
        </Bloco>
      )}

      {(ficha.conclusao || ficha.condicoes) && (
        <Bloco titulo="Conclusão e condições" cor="#1e4080">
          {ficha.conclusao && <>
            <Sub texto="Conclusão" cor="#3070c8" />
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '4px 0 0' }}>{ficha.conclusao}</p>
          </>}
          {ficha.condicoes && <>
            <Sub texto="Condições" cor="#e8b84b" />
            {/* O texto vem do editor antigo com marcação HTML dentro. Aqui ele é
                mostrado como TEXTO, sem interpretar as marcas: é conteúdo de
                banco, e não pode virar HTML numa tela do CRM. */}
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '4px 0 0' }}>
              {ficha.condicoes.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()}
            </p>
          </>}
        </Bloco>
      )}
    </>
  )
}

// ── os 3 C's ────────────────────────────────────────────────────────────────
//  Seção do relatório que NUNCA teve tela no CRM: até aqui, ler o fundamento de
//  Caráter, Capacidade e Capital só era possível abrindo o relatório na máquina
//  dele. O dado está em `analises.tres_cs` desde a carga de 30/08/2026.

/** A classe que a análise escreveu ("Forte", "Medio", "Fraco"), com a cor que
 *  ela merece. Classe que este mapa não conheça fica cinza, e não verde: dar
 *  cor boa a texto desconhecido seria afirmar o que o dado não diz. */
function corDaClasse(classe: string | undefined): string {
  const c = (classe ?? '').toLowerCase()
  if (/forte|[óo]tim|excel/.test(c)) return '#1a7a50'
  if (/bom|boa|adequad/.test(c)) return '#27a96c'
  if (/m[ée]di|moderad|regular/.test(c)) return '#a07b1e'
  if (/fraco|baix|ruim|cr[íi]tic/.test(c)) return '#a3282a'
  return '#8ba3c0'
}

const OS_TRES: { k: 'carater' | 'capacidade' | 'capital'; nome: string; oQueE: string }[] = [
  { k: 'carater', nome: 'Caráter', oQueE: 'histórico de pagamento e conduta: Serasa, protestos, ações, recuperação.' },
  { k: 'capacidade', nome: 'Capacidade', oQueE: 'condição de executar e honrar: tempo de mercado, porte, experiência na modalidade.' },
  { k: 'capital', nome: 'Capital', oQueE: 'a força do balanço: liquidez, endividamento, patrimônio, resultado.' },
]

export function SecaoTresCs({ ficha }: { ficha: FichaAnalise | null }) {
  const t = ficha?.tres_cs
  if (!ficha || !t) {
    return (
      <Bloco titulo="Os 3 C's do crédito" cor="#3070c8">
        <div className="mt-vazio">Esta análise não registrou os 3 C&apos;s.</div>
      </Bloco>
    )
  }

  return (
    <Bloco titulo="Os 3 C's do crédito" cor="#3070c8">
      <div style={{ display: 'grid', gap: 12 }}>
        {OS_TRES.map(({ k, nome, oQueE }) => {
          const c = t[k]
          const cor = corDaClasse(c?.classe)
          return (
            <div key={k} style={{
              border: '1px solid #e0ecf8', borderRadius: 9, padding: '12px 14px', background: '#fbfdff',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0a1628' }}>{nome}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
                  color: cor, border: `1px solid ${cor}`, borderRadius: 999, padding: '1px 9px',
                }}>
                  {c?.classe ?? 'não classificado'}
                </span>
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '7px 0 0', color: '#1a2a3a' }}>
                {c?.fundamento || 'A análise não escreveu o fundamento deste C.'}
              </p>
              <div style={{ fontSize: 11.5, color: '#6080a0', marginTop: 6 }}>{oQueE}</div>
            </div>
          )
        })}
      </div>
      <div className="mt-nota">
        Os três C&apos;s são a leitura qualitativa da análise, e cada um tem o fundamento escrito
        por quem analisou. <b>A classe aqui não é o Score</b>: o Score é o número calculado, este é
        o julgamento que o acompanha.
      </div>
    </Bloco>
  )
}

// ── demonstrações financeiras ───────────────────────────────────────────────

export function TabelaExercicios({ ficha }: { ficha: FichaAnalise }) {
  const LINHAS: { rot: string; k: keyof typeof ficha.exercicios[number] }[] = [
    { rot: 'Ativo total', k: 'ativo_total' },
    { rot: 'Ativo circulante', k: 'ativo_circulante' },
    { rot: 'Passivo circulante', k: 'passivo_circulante' },
    { rot: 'Exigível total', k: 'exigivel_total' },
    { rot: 'Patrimônio líquido', k: 'patrimonio_liquido' },
    { rot: 'Receita operacional', k: 'receita_operacional' },
    { rot: 'EBITDA', k: 'ebitda' },
    { rot: 'Lucro líquido', k: 'lucro_liquido' },
    { rot: 'Caixa', k: 'caixa' },
    { rot: 'Estoques', k: 'estoques' },
  ]
  const exs = ficha.exercicios

  return (
    <>
      <div className="mt-tab-wrap">
        <table className="mt-tab">
          <thead>
            <tr>
              <th>Conta</th>
              {exs.map(e => <th key={e.rotulo} style={{ textAlign: 'right' }}>{e.rotulo}</th>)}
            </tr>
          </thead>
          <tbody>
            {LINHAS.map(l => {
              // Conta que está vazia em TODOS os exercícios não vira linha em branco.
              if (exs.every(e => e[l.k] === null)) return null
              return (
                <tr key={l.rot}>
                  <td>{l.rot}</td>
                  {exs.map(e => {
                    const v = e[l.k] as number | null
                    return <td key={e.rotulo} className="n">{v === null ? '—' : fmtMoeda(v)}</td>
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-nota">
        <b>Valores em reais.</b> A carga converteu a escala de cada demonstração (havia balanço em
        milhares e em milhões no acervo), então as colunas podem ser comparadas direto.
        {exs.some(e => e.base) && <> A base de cada uma está no rótulo: {exs.filter(e => e.base).map(e => `${e.rotulo} (${e.base})`).join(', ')}.</>}
      </div>
    </>
  )
}

export function SecaoDemonstracoes({ ficha }: { ficha: FichaAnalise | null }) {
  return (
    <Bloco titulo="Demonstrações financeiras" cor="#27a96c">
      {!ficha || ficha.exercicios.length === 0
        ? <div className="mt-vazio">Nenhum exercício publicado para esta análise.</div>
        : <TabelaExercicios ficha={ficha} />}
    </Bloco>
  )
}

// ── documentos lidos ────────────────────────────────────────────────────────

export function SecaoDocumentos({ ficha }: { ficha: FichaAnalise | null }) {
  return (
    <Bloco titulo="Documentos lidos pela análise" cor="#27a96c">
      {!ficha || ficha.documentos.length === 0 ? (
        /* NUNCA escrever "esta análise não tem documento": seria mentira.
           Conferido em 07/09/2026 no banco: `analise_documentos` continua com
           ZERO linhas para as 146 análises. A tabela existe e a carga a limpa,
           mas nada nunca a preencheu. O dado está no disco, nos `_status.json`
           de cada pasta. */
        <div className="mt-nota at" style={{ marginTop: 0 }}>
          <b>Os documentos ainda não foram indexados.</b> A análise leu os arquivos da
          pasta, mas esse índice nunca foi publicado no banco: a tabela está vazia para
          <b> todas</b> as análises, não só para esta. É a próxima carga a rodar.
        </div>
      ) : (
        <div className="mt-tab-wrap">
          <table className="mt-tab">
            <thead><tr><th>Documento</th><th style={{ textAlign: 'right' }}>Tamanho</th><th style={{ textAlign: 'right' }}>Hash</th></tr></thead>
            <tbody>
              {ficha.documentos.map((d, i) => (
                <tr key={i}>
                  <td>{d.nome}</td>
                  <td className="n">{d.bytes ? `${Math.round(d.bytes / 1024).toLocaleString('pt-BR')} KB` : '—'}</td>
                  <td className="dim" style={{ fontFamily: 'Consolas, monospace', fontSize: 11.5 }}>{d.hash16 ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-nota">
        Estes são os arquivos que a análise LEU, com o retrato de quando ela começou.
        O arquivo em si fica no disco; aqui está o índice, com o hash para conferir que
        não mudou.
      </div>
    </Bloco>
  )
}

// ── Serasa ──────────────────────────────────────────────────────────────────
//  O Serasa passou a ter coluna no banco em 30/08/2026 (migration
//  `analises_serasa` + `scripts/carga-serasa.mjs`): 130 das 131 análises. O que
//  a análise NÃO registrou continua ficando de fora, escrito como tal: PEFIN,
//  protestos e ações só existem no vocabulário revisado, e inventar
//  "sem registros" onde a análise não olhou seria dizer que a empresa está
//  limpa sem prova.

export function faixaDoScore(score: number): { cor: string; texto: string } {
  if (score >= 700) return { cor: '#1a7a50', texto: 'faixa alta' }
  if (score >= 500) return { cor: '#27a96c', texto: 'faixa boa' }
  if (score >= 400) return { cor: '#a07b1e', texto: 'faixa média' }
  if (score >= 250) return { cor: '#c06a1e', texto: 'faixa baixa' }
  return { cor: '#a3282a', texto: 'faixa crítica' }
}

/** A análise escreveu que este campo está zerado? Serve para separar o que ela
 *  OLHOU e achou limpo do que ela simplesmente não olhou.
 *
 *  O acervo escreve isso de muitas formas ("R$ 0", "0 ação(ões)",
 *  "Sem registros", "Nada consta"), então a regra é a mais burra que funciona:
 *  frase de negação, ou nenhum algarismo diferente de zero no texto todo.
 *  "R$ 7.751,21" tem 7, logo NÃO está zerado. */
function zerado(v: string): boolean {
  const t = v.trim()
  if (/^(sem registro|nada consta|nenhum|não consta|nao consta|inexistente)/i.test(t)) return true
  return !/[1-9]/.test(t)
}

/** A cor do cabeçalho das anotações negativas, e ela diz TRÊS coisas
 *  diferentes: vermelho quando há anotação, verde quando a análise afirmou que
 *  está zerado, e cinza quando ela não registrou nada. O cinza é o ponto:
 *  campo em branco não é empresa limpa, e verde ali afirmaria o que o dado não
 *  sustenta. */
function corDasAnotacoes(s: SerasaFicha): string {
  const campos = [s.pefin, s.protestos, s.acoes].filter(Boolean) as string[]
  if (campos.length === 0) return '#8ba3c0'
  return campos.every(zerado) ? '#27a96c' : '#d64545'
}

export function SecaoSerasa({ ficha }: { ficha: FichaAnalise | null }) {
  if (!ficha) {
    return (
      <Bloco titulo="Serasa" cor="#e8b84b">
        <div className="mt-vazio">Nenhuma análise publicada para este CNPJ.</div>
        <div className="mt-nota">
          O Serasa que a Mesa mostra é o que a análise de crédito leu e registrou. Sem análise
          publicada, não há de onde tirar.
        </div>
      </Bloco>
    )
  }

  const s = ficha.serasa
  if (!s) {
    return (
      <Bloco titulo={`Serasa · análise de ${fmtData(ficha.data_analise)}`} cor="#e8b84b">
        <div className="mt-nota at" style={{ marginTop: 0 }}>
          <b>Esta análise não registrou Serasa.</b> Ela existe e está publicada, mas o bloco do
          Serasa veio vazio: ou o relatório não foi anexado, ou não foi preenchido.
        </div>
      </Bloco>
    )
  }

  const faixa = s.score !== null ? faixaDoScore(s.score) : null
  const naoOlhados = [
    !s.pefin && 'PEFIN',
    !s.protestos && 'protestos',
    !s.acoes && 'ações judiciais',
  ].filter(Boolean) as string[]

  return (
    <>
      <Bloco titulo={`Serasa · análise de ${fmtData(ficha.data_analise)}`} cor="#e8b84b">
        <div className="mt-serasa-topo">
          <div className="mt-serasa-score">
            <div className="mt-lab">Serasa Score Empresas</div>
            <div className="n" style={faixa ? { color: faixa.cor } : { color: '#8ba3c0' }}>
              {s.score !== null ? s.score : '—'}
            </div>
            <div className="t">{faixa ? `de 1.000 · ${faixa.texto}` : 'a análise não registrou o número'}</div>
          </div>
          <div className="mt-risca" />
          <div className="mt-campos" style={{ flex: '1 1 320px' }}>
            <Campo rotulo="Risco" valor={s.risco} cls="forte" />
            <Campo rotulo="Probabilidade de inadimplência" valor={s.prob} />
            <Campo rotulo="Limite sugerido pelo Serasa" valor={s.limite_num !== null ? fmtMoeda(s.limite_num) : s.limite_txt} />
            <Campo rotulo="Falência e recuperação" valor={s.recuperacao} />
          </div>
        </div>

        {s.interpretacao && (
          <>
            <Sub texto="Leitura da análise" cor="#3070c8" />
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '4px 0 0' }}>{s.interpretacao}</p>
          </>
        )}

        <div className="mt-nota">
          <b>Este Serasa é o que a análise tinha em mãos em {fmtData(ficha.data_analise)}</b>, e não uma
          consulta de hoje: o relatório em si pode ser mais velho que a análise. Score de crédito
          envelhece, e a data de quando ele foi puxado não é um campo que a análise registra.
        </div>
      </Bloco>

      <Bloco titulo="Anotações negativas" cor={corDasAnotacoes(s)}>
        {(s.pefin || s.protestos || s.acoes) ? (
          <div className="mt-campos">
            {s.pefin && <Campo rotulo="PEFIN" valor={s.pefin} />}
            {s.protestos && <Campo rotulo="Protestos" valor={s.protestos} />}
            {s.acoes && <Campo rotulo="Ações judiciais" valor={s.acoes} />}
            {s.recuperacao && <Campo rotulo="Falência / recuperação" valor={s.recuperacao} />}
          </div>
        ) : (
          <div className="mt-vazio" style={{ padding: '16px 20px' }}>
            A análise não registrou estes campos.
          </div>
        )}
        {naoOlhados.length > 0 && (
          <div className="mt-nota">
            Sem registro de <b>{naoOlhados.join(', ')}</b> nesta análise. Isso quer dizer que o campo
            não foi preenchido, e <b>não</b> que a empresa está limpa: para afirmar isso é preciso o
            relatório do Serasa em mãos.
          </div>
        )}
      </Bloco>

      <Bloco titulo={`Consultas recentes ao CNPJ · ${s.consultas.length}`} cor="#e8b84b">
        {s.consultas.length === 0 ? (
          <div className="mt-vazio">A análise não listou consultas.</div>
        ) : (
          <div className="mt-tab-wrap">
            <table className="mt-tab">
              <thead><tr><th>Data</th><th>Quem consultou</th><th>Segmento</th></tr></thead>
              <tbody>
                {s.consultas.map((c, i) => (
                  <tr key={i}>
                    <td className="dim" style={{ width: 110 }}>{c.data ?? '—'}</td>
                    <td>{c.empresa ?? '—'}</td>
                    <td className="dim" style={{ whiteSpace: 'normal' }}>{c.tipo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-nota">
          Esta é a lista que a análise transcreveu do relatório, e costuma ser <b>uma amostra</b> das
          consultas mais recentes, não o total do período. O número cheio, quando existe, está na
          leitura acima.
          {s.fonte && <> Origem: versão <b>{s.fonte === 'revisada' ? 'revisada por você' : 'gerada pela análise'}</b>.</>}
        </div>
      </Bloco>
    </>
  )
}
