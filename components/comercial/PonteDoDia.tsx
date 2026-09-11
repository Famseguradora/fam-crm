'use client'

/* A PONTE DO DIA · a cascata que vai dos e-mails recebidos até o que há a fazer
   ═══════════════════════════════════════════════════════════════════════════

   Ordem do Marco em 11/09/2026: "quando se trata do aspecto e-mail, é
   necessário um visual impactante, limpo e altamente performático".

   É um gráfico de ponte (waterfall) horizontal no padrão IBCS, e não um funil,
   por um motivo de conta: o funil mede quem SAIU entre etapas; a ponte divide
   o total em partes que não se repetem, e por isso fecha. Cada barra que tira
   começa onde a anterior terminou, e o olho confere a soma sem ler número.

   AS CORES DIZEM O PAPEL, NÃO ENFEITAM:
     marinho         total (recebidos, elegíveis, a fazer)
     cinza           o que saiu da conta por regra (não é pedido, continuação,
                     fora do apetite)
     contorno ouro   sem classificação: precisa de você
     verde           já resolvido
   Vermelho só no número de parados, que é onde há decisão atrasada.

   Clicar num degrau filtra a fila de baixo (o gráfico e a lista viram a mesma
   coisa, como no Linear Insights). */

import { cor, raio, texto } from '@/lib/ui/painel'
import { ROTULO_BALDE, type Balde, type Ponte } from '@/lib/email/ponte'

export type Selecao = Balde | 'elegiveis' | 'recebidos'

type Papel = 'total' | 'subtotal' | 'final' | 'saida' | 'pergunta' | 'feito'

interface Degrau {
  id: Selecao
  rotulo: string
  valor: number
  sinal: '' | '−' | '='
  papel: Papel
  /** Onde a barra começa e termina, em unidades de "recebidos". */
  de: number
  ate: number
  apoio: string
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export default function PonteDoDia({ ponte, selecionado, aoSelecionar, excluidas }: {
  ponte: Pick<Ponte, 'recebidos' | 'baldes' | 'elegiveis' | 'excecoes' | 'parados_a_fazer' | 'em_risco_a_fazer'>
  /* Sem estes dois, a ponte é só leitura: é como o relatório gerencial do mês a
     usa, onde não há fila embaixo para filtrar. */
  selecionado?: Selecao
  aoSelecionar?: (s: Selecao) => void
  excluidas: string[]
}) {
  const R = ponte.recebidos
  const b = ponte.baldes

  /* A cascata em números. Cada degrau que tira ocupa [o que sobra depois, o
     que sobrava antes]. Feito por redução, sem variável que muda: a tela
     inteira sai da mesma conta, de uma vez. */
  const cascata = (inicio: number, passos: { id: Balde; apoio: string; papel?: Papel }[]) =>
    passos.reduce<{ resto: number; lista: Degrau[] }>((acc, s) => {
      const de = acc.resto - b[s.id]
      return {
        resto: de,
        lista: [...acc.lista, { id: s.id, rotulo: ROTULO_BALDE[s.id], valor: b[s.id], sinal: '−', papel: s.papel ?? 'saida', de, ate: acc.resto, apoio: s.apoio }],
      }
    }, { resto: inicio, lista: [] })

  const judiciais = excluidas.filter((m) => /judicial/i.test(m)).length
  const outrasExcluidas = excluidas.length - judiciais
  const semApetiteTexto = excluidas.length
    ? [judiciais ? (judiciais === excluidas.length ? 'judicial' : `${judiciais} judiciais`) : '', outrasExcluidas ? plural(outrasExcluidas, 'outra modalidade', 'outras modalidades') : '']
        .filter(Boolean).join(' e ') + ' sem apetite na régua'
    : 'nenhuma modalidade sem apetite na régua'

  const saidas = cascata(R, [
    { id: 'nao_demanda', apoio: 'a régua da caixa recusou, ou alguém disse que não é' },
    { id: 'continuacao', apoio: 'RE e ENC de um pedido que já tinha chegado' },
    { id: 'fora_apetite', apoio: semApetiteTexto },
    { id: 'sem_classificacao', apoio: 'a régua não soube dizer o que é: precisa de você', papel: 'pergunta' },
  ])
  const E = saidas.resto
  const feitos = cascata(E, [{
    id: 'resolvido',
    apoio: ponte.excecoes
      ? `trazidos ou analisados por fora · ${plural(ponte.excecoes, 'por exceção', 'por exceção')}, fora do apetite`
      : 'trazidos para o sistema ou analisados por fora',
    papel: 'feito',
  }])

  const degraus: Degrau[] = [
    { id: 'recebidos', rotulo: 'Recebidos', valor: R, sinal: '', papel: 'total', de: 0, ate: R, apoio: 'e-mails no período' },
    ...saidas.lista,
    {
      id: 'elegiveis', rotulo: 'Elegíveis', valor: E, sinal: '=', papel: 'subtotal', de: 0, ate: E,
      apoio: `${ponte.elegiveis.operacao} com operação · ${ponte.elegiveis.credito} só crédito`,
    },
    ...feitos.lista,
    {
      id: 'a_fazer', rotulo: 'A fazer', valor: feitos.resto, sinal: '=', papel: 'final', de: 0, ate: feitos.resto,
      apoio: [
        ponte.parados_a_fazer ? `${plural(ponte.parados_a_fazer, 'parado', 'parados')} passando do prazo` : 'nenhum parado',
        ponte.em_risco_a_fazer ? `${ponte.em_risco_a_fazer} vence${ponte.em_risco_a_fazer === 1 ? '' : 'm'} em breve` : '',
      ].filter(Boolean).join(' · '),
    },
  ]

  const escala = Math.max(1, R)
  const pct = (x: number) => `${(x / escala) * 100}%`

  return (
    <div className="pt-ponte" role="group" aria-label="Ponte do período, dos recebidos até o que há a fazer">
      <style jsx>{`
        .pt-ponte { display: flex; flex-direction: column; gap: 2px; }
        .pt-linha {
          display: grid; grid-template-columns: minmax(170px, 250px) 64px 1fr;
          align-items: center; gap: 14px; width: 100%; text-align: left;
          padding: 7px 10px 7px 12px; border: none; border-radius: ${raio.controle}px;
          background: transparent; cursor: pointer; font: inherit; position: relative;
          transition: background-color .12s;
        }
        .pt-linha:hover { background: ${cor.papelZebra}; }
        .pt-linha:focus-visible { outline: 2px solid ${cor.bordaAtiva}; outline-offset: -2px; }
        .pt-linha[data-ativo='true'] { background: ${cor.destaque}; }
        .pt-linha[data-fixa='true'] { cursor: default; }
        .pt-linha[data-fixa='true']:hover { background: transparent; }
        .pt-linha[data-ativo='true']::before {
          content: ''; position: absolute; left: 0; top: 7px; bottom: 7px; width: 3px;
          border-radius: 2px; background: ${cor.ouro};
        }
        .pt-trilho { position: relative; height: 22px; }
        .pt-barra { position: absolute; top: 4px; height: 14px; border-radius: 3px; min-width: 2px; }
        .pt-guia { position: absolute; top: -9px; height: 13px; width: 0; border-left: 1px dashed ${cor.borda}; }
        .pt-num { font-variant-numeric: tabular-nums; text-align: right; }
        .pt-fina { height: 1px; background: ${cor.bordaSuave}; margin: 3px 10px; }
        @media (max-width: 640px) {
          .pt-linha { grid-template-columns: 1fr auto; gap: 4px 10px; }
          .pt-trilho { grid-column: 1 / -1; }
        }
      `}</style>

      {degraus.map((d, i) => {
        const ativo = !!aoSelecionar && selecionado === d.id
        const total = d.papel === 'total' || d.papel === 'subtotal' || d.papel === 'final'
        const vazio = d.valor === 0 && !total
        const barra: React.CSSProperties =
          d.papel === 'total' ? { background: cor.tinta2 }
          : d.papel === 'subtotal' ? { background: cor.acao }
          : d.papel === 'final' ? { background: cor.tinta, boxShadow: `inset 0 0 0 2px ${cor.ouro}` }
          : d.papel === 'pergunta' ? { background: cor.papel, border: `1.5px dashed ${cor.ouroTexto}` }
          : d.papel === 'feito' ? { background: cor.areaOperacao }
          : { background: cor.borda }
        const numeroCor =
          d.papel === 'pergunta' && d.valor > 0 ? cor.ouroTexto
          : d.papel === 'feito' && d.valor > 0 ? cor.areaOperacao
          : vazio ? cor.textoFraco
          : cor.tinta

        const miolo = (
          <>
              <span style={{ minWidth: 0 }}>
                <span style={{
                  display: 'block', fontSize: total ? 13.5 : 12.5, fontWeight: total ? 700 : 600,
                  color: vazio ? cor.textoFraco : cor.tinta, lineHeight: 1.3,
                }}>
                  {d.rotulo}
                </span>
                <span style={{ ...texto.nota, display: 'block', color: d.id === 'a_fazer' && ponte.parados_a_fazer ? cor.alerta : cor.textoFraco }}>
                  {d.apoio}
                </span>
              </span>

              <span className="pt-num" style={{
                fontSize: total ? 22 : 15, fontWeight: total ? 800 : 700, color: numeroCor, lineHeight: 1,
              }}>
                {d.sinal === '−' && d.valor > 0 ? <span style={{ color: cor.textoFraco, fontWeight: 600 }}>−</span> : null}
                {d.valor}
              </span>

              <span className="pt-trilho" aria-hidden>
                {/* A guia tracejada liga a barra à anterior: é ela que faz o
                    olho seguir a conta de cima para baixo. */}
                {i > 0 && !vazio && <span className="pt-guia" style={{ left: pct(d.ate) }} />}
                {!vazio && (
                  <span className="pt-barra" style={{ left: pct(d.de), width: pct(d.ate - d.de), ...barra }} />
                )}
              </span>
          </>
        )

        return (
          <div key={d.id}>
            {d.id === 'elegiveis' && <div className="pt-fina" aria-hidden />}
            {aoSelecionar ? (
              <button
                type="button"
                className="pt-linha painel-alvo"
                data-ativo={ativo}
                aria-pressed={ativo}
                onClick={() => aoSelecionar(d.id)}
                title={`Ver na lista: ${d.rotulo.toLowerCase()}`}
              >
                {miolo}
              </button>
            ) : (
              <div className="pt-linha" data-fixa="true">{miolo}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
