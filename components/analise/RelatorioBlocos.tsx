'use client'

// ============================================================================
//  AS SEÇÕES QUE FALTAVAM NO RELATÓRIO  ·  09/09/2026
//
//  Pergunta dele, olhando o card da Renova: "cadê o relatório que consta da
//  análise de crédito?". Estava certo. O CRM mostrava a decisão, os 3 C's, o
//  Serasa, o grupo econômico e as demonstrações, e parava ali. O que ele
//  escreveu sobre resseguro, sobre como o Score foi formado, a ficha da
//  empresa, a história e o caixa ficava só no disco da máquina — e para ler
//  isso ele tinha que abrir o sistema antigo.
//
//  Estas quatro seções vivem em arquivo próprio, e não dentro do
//  `Relatorio.tsx`, por tamanho: aquele arquivo já é a fonte única das seções
//  antigas e passaria de mil linhas. As peças pequenas (Bloco, Campo, fmtScore)
//  são importadas de lá — continuam com um dono só.
//
//  TUDO AQUI É LEITURA. A análise escreveu, o CRM mostra. Bloco que a análise
//  não trouxe não vira seção vazia com cara de defeito: a tela diz que aquela
//  análise não tem aquele bloco, e por quê.
// ============================================================================

import { fmtData } from '@/lib/utils'
import { Bloco, Campo, fmtScore } from './Relatorio'
import type { FichaAnalise } from '@/lib/analise/ficha'

/** Número da memória de cálculo: até três casas, sem zeros pendurados. */
function num(v: number | null): string {
  if (v === null) return '—'
  const t = v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  return t.replace('.', ',')
}

// ── 1. o resseguro ──────────────────────────────────────────────────────────

/* É a seção que decide o que a subscrição pode emitir, e vivia como UMA FRASE
   dentro da conclusão ("no resseguro enquadra-se nas modalidades gerais e no
   Judicial Cível e Trabalhista; Judicial Fiscal e Arbitral ficam bloqueados").
   Responder "posso emitir judicial fiscal para este tomador?" obrigava a ler um
   parágrafo e torcer para não ter passado batido. Aqui é linha a linha. */
export function SecaoResseguro({ ficha }: { ficha: FichaAnalise | null }) {
  if (!ficha) return null

  if (!ficha.resseguro.length) {
    return (
      <Bloco titulo="Enquadramento no contrato de resseguro">
        <div className="mt-vazio">Esta análise não trouxe o quadro de resseguro.</div>
        <div className="mt-nota">
          O quadro existe no relatório desde o template v13. Análise mais antiga que isso não o tem,
          e o que aparece sobre resseguro fica dentro da conclusão.
        </div>
      </Bloco>
    )
  }

  const cor = (st: string | null) => {
    const t = (st ?? '').toLowerCase()
    if (t.includes('bloqu')) return { fundo: '#fbeaea', texto: '#a02020', borda: '#f5b8b8' }
    if (t.includes('especial') || t.includes('aten')) return { fundo: '#fdf6e3', texto: '#8a6410', borda: '#ecdfb4' }
    if (t.includes('enquadr')) return { fundo: '#e6f9f0', texto: '#1a7a50', borda: '#a7e9c8' }
    return { fundo: '#eef3f9', texto: '#26374a', borda: '#dbe6f3' }
  }
  const bloqueios = ficha.resseguro.filter(l => (l.status ?? '').toLowerCase().includes('bloqu')).length

  return (
    <Bloco titulo="Enquadramento no contrato de resseguro" cor="#1e4080">
      <div className="mt-nota" style={{ marginTop: 0, marginBottom: 12 }}>
        {ficha.resseguro.length} linha{ficha.resseguro.length === 1 ? '' : 's'} do contrato automático,
        como a análise de {fmtData(ficha.data_analise)} as apurou
        {bloqueios ? ` · ${bloqueios} bloqueio${bloqueios === 1 ? '' : 's'}` : ' · nenhum bloqueio'}.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ficha.resseguro.map((l, i) => {
          const c = cor(l.status)
          return (
            <div key={i} style={{ border: `1px solid ${c.borda}`, borderRadius: 10, padding: '10px 13px', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13.5, color: '#0a1628' }}>{l.item}</b>
                {l.status && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 7,
                    background: c.fundo, color: c.texto, whiteSpace: 'nowrap',
                  }}>{l.status}</span>
                )}
                {l.regra && (
                  <span style={{ fontSize: 12, color: '#6080a0', marginLeft: 'auto', textAlign: 'right' }}>{l.regra}</span>
                )}
              </div>
              {l.resultado && <div style={{ fontSize: 13, color: '#26374a', marginTop: 5, lineHeight: 1.5 }}>{l.resultado}</div>}
              {l.obs && <div style={{ fontSize: 12, color: '#6080a0', marginTop: 4, lineHeight: 1.5 }}>{l.obs}</div>}
            </div>
          )
        })}
      </div>
    </Bloco>
  )
}

// ── 2. a memória de cálculo do Score ────────────────────────────────────────

/* Sem esta seção o Score é um número que ninguém pode conferir. Cada indicador
   traz o valor bruto, A FÓRMULA que o produziu, a classificação, os pontos, o
   peso e o score parcial; no fim, a conta que junta objetivo e subjetivo.
   A fórmula fica à vista e não num `title`: é ela que permite refazer o cálculo
   sem abrir o outro sistema, que era o ponto. */
export function SecaoScore({ ficha }: { ficha: FichaAnalise | null }) {
  if (!ficha) return null
  const m = ficha.scoreMemoria

  if (!m) {
    return (
      <Bloco titulo="Como o Score foi formado">
        <div className="mt-vazio">Esta análise não trouxe a memória de cálculo.</div>
        <div className="mt-nota">
          O Score de {fmtScore(ficha.score_final)} está publicado, mas o detalhe indicador a
          indicador só existe nas análises feitas com o template que o grava.
        </div>
      </Bloco>
    )
  }

  return (
    <>
      <Bloco titulo={`Como o Score ${fmtScore(ficha.score_final)} foi formado`} cor="#1e4080">
        {m.calculo && (
          <div style={{
            fontSize: 13, color: '#26374a', lineHeight: 1.6, background: '#f7fafd',
            border: '1px solid #dbe6f3', borderRadius: 9, padding: '10px 13px', marginBottom: 14,
          }}>{m.calculo}</div>
        )}
        <div className="mt-campos">
          <Campo rotulo="Score objetivo" valor={num(m.scoreObjetivo)} cls="az" />
          <Campo rotulo="Score final" valor={num(m.scoreFinal)} cls="az" />
          <Campo rotulo="Peso objetivo" valor={m.pesoObj === null ? null : `${m.pesoObj}%`} />
          <Campo rotulo="Peso subjetivo" valor={m.pesoSubj === null ? null : `${m.pesoSubj}%`} />
        </div>
      </Bloco>

      {m.grupos.map(g => (
        <Bloco key={g.id} titulo={`${g.nome}${g.subtotal !== null ? ` · subtotal ${num(g.subtotal)}` : ''}`} cor="#6080a0">
          <div className="mt-nota" style={{ marginTop: 0, marginBottom: 10 }}>{g.dica}</div>
          {/* A tabela rola dentro da própria caixa: a página nunca rola de lado. */}
          <div style={{ overflowX: 'auto' }}>
            <table className="mt-tab" style={{ minWidth: 660 }}>
              <thead>
                <tr>
                  <th>Indicador</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                  <th>Classificação</th>
                  <th style={{ textAlign: 'right' }}>Pontos</th>
                  <th style={{ textAlign: 'right' }}>Peso</th>
                  <th style={{ textAlign: 'right' }}>Parcial</th>
                </tr>
              </thead>
              <tbody>
                {g.indicadores.map(i => (
                  <tr key={i.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0a1628' }}>{i.rotulo}</div>
                      {i.formula && <div style={{ fontSize: 11.5, color: '#6080a0', marginTop: 2, lineHeight: 1.45 }}>{i.formula}</div>}
                      {i.obs && <div style={{ fontSize: 11.5, color: '#8a6410', marginTop: 2, lineHeight: 1.45 }}>{i.obs}</div>}
                    </td>
                    <td className="n">{i.valor ?? '—'}</td>
                    <td>{i.classificacao ?? '—'}</td>
                    <td className="n">{i.pontos ?? '—'}</td>
                    <td className="n">{i.peso === null ? '—' : `${String(i.peso).replace('.', ',')}%`}</td>
                    <td className="n">{num(i.parcial)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloco>
      ))}
    </>
  )
}

// ── 3. a empresa ────────────────────────────────────────────────────────────

/* Quatro blocos pequenos que não valem uma aba cada; juntos são "a empresa":
   a ficha cadastral que a análise apurou, o enquadramento com a conta do
   limite, o caixa e a história. */
export function SecaoEmpresa({ ficha }: { ficha: FichaAnalise | null }) {
  if (!ficha) return null
  const id = ficha.identificacao
  const enq = ficha.enquadramento
  const cxe = ficha.caixaEstoque
  const tl = ficha.linhaTempo

  if (!id && !enq && !cxe && !tl.length && !ficha.limite_base && !ficha.base_df) {
    return (
      <Bloco titulo="A empresa">
        <div className="mt-vazio">Esta análise não trouxe a ficha da empresa.</div>
        <div className="mt-nota">
          Fundação, capital, endereço, CNAE e a história vêm do relatório. Análise publicada antes
          de 09/09/2026 não tem esses campos no banco até a próxima carga.
        </div>
      </Bloco>
    )
  }

  return (
    <>
      {id && (
        <Bloco titulo="A empresa" cor="#1e4080">
          <div className="mt-campos">
            <Campo rotulo="Fundação" valor={id.fundacao} />
            <Campo rotulo="Capital social" valor={id.capital} />
            <Campo rotulo="Funcionários" valor={id.funcionarios} />
            <Campo rotulo="Filiais" valor={id.filiais} />
            <Campo rotulo="Regime tributário" valor={id.regime} largo />
            <Campo rotulo="CNAE" valor={id.cnae} largo />
            <Campo rotulo="Endereço" valor={id.endereco} largo />
          </div>
        </Bloco>
      )}

      {(enq || ficha.limite_base || ficha.base_df) && (
        <Bloco titulo="Enquadramento e base do limite" cor="#6080a0">
          <div className="mt-campos">
            <Campo rotulo="Classe" valor={enq?.classe ?? ficha.classe} />
            <Campo rotulo="Porte" valor={enq?.porte ?? ficha.porte} />
            <Campo
              rotulo="Ponderação"
              valor={enq && enq.pesoObj !== null ? `${enq.pesoObj}% objetivo · ${enq.pesoSubj}% subjetivo` : null}
            />
            <Campo rotulo="Base das demonstrações" valor={ficha.base_df} />
            <Campo rotulo="Tipo de avaliação" valor={enq?.tipo ?? null} largo />
            {/* COMO O LIMITE FOI CALCULADO: é a primeira pergunta de quem
                discorda do número, e estava só no relatório do disco. */}
            <Campo rotulo="Base do limite" valor={ficha.limite_base} largo />
          </div>
          {enq?.obs && <div className="mt-nota">{enq.obs}</div>}
          {ficha.base_df_obs && <div className="mt-nota">{ficha.base_df_obs}</div>}
        </Bloco>
      )}

      {cxe && (
        <Bloco titulo="Caixa e estoques" cor="#27a96c">
          <div className="mt-nota" style={{ marginTop: 0, marginBottom: 10 }}>
            Valores como a análise os escreveu{ficha.unidade ? ` · ${ficha.unidade}` : ''}.
          </div>
          <div className="mt-campos">
            <Campo rotulo="Caixa · exercício anterior" valor={cxe.caixaA1} />
            <Campo rotulo="Caixa · último exercício" valor={cxe.caixaA2} />
            <Campo rotulo="Estoques · exercício anterior" valor={cxe.estoquesA1} />
            <Campo rotulo="Estoques · último exercício" valor={cxe.estoquesA2} />
          </div>
          {cxe.observacao && <div className="mt-nota">{cxe.observacao}</div>}
        </Bloco>
      )}

      {tl.length > 0 && (
        <Bloco titulo="A história da empresa" cor="#8a6410">
          <div>
            {tl.map((e, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '58px 1fr', gap: 12, alignItems: 'start' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#8a6410', paddingTop: 9, fontVariantNumeric: 'tabular-nums' }}>
                  {e.ano}
                </div>
                <div style={{
                  borderLeft: '2px solid #ecdfb4', paddingLeft: 14, paddingTop: 9,
                  paddingBottom: i === tl.length - 1 ? 0 : 14,
                  fontSize: 13, color: '#26374a', lineHeight: 1.55, position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', left: -5, top: 13, width: 8, height: 8,
                    borderRadius: '50%', background: '#e8b84b',
                  }} />
                  {e.evento}
                </div>
              </div>
            ))}
          </div>
        </Bloco>
      )}
    </>
  )
}
