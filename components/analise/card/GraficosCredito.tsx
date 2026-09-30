'use client'

// ============================================================================
//  OS TRÊS GRÁFICOS DA VISÃO GERAL DO CRÉDITO  ·  30/09/2026
//
//  Pedido dele: "é possível inserir algum gráfico, igual fez no mockup da
//  subscrição? Da um visual mais profissional, mas só faça se for realmente
//  coerente". Os três aprovados respondem, cada um, uma pergunta de comitê:
//
//    ScoreFormado ........ por que o Score deu este número?
//    EvolucaoExercicios .. a empresa cresce ou encolhe?
//    LimiteFormado ....... de onde saiu o limite, e o que o cortou ou elevou?
//
//  SÓ DADO QUE A ANÁLISE JÁ TEM. A memória de cálculo (187 das 188 vigentes em
//  30/09), os exercícios (todas têm dois) e o percentual da matriz. Nada é
//  inventado: sem o dado, o bloco diz que não tem (regra 5 do DESIGN-PAINEL).
//
//  Desenhados à mão, em HTML, sem biblioteca de gráfico: regra da casa
//  (memória "nunca componente externo"), e barra horizontal não precisa de
//  eixo, precisa ser lida. Cada linha leva o valor escrito ao lado, e o
//  `title` mostra o detalhe ao passar o mouse.
//
//  ENXUGADOS NO MESMO DIA. A primeira versão ocupava a tela e ele chamou de
//  "poluição total", pedindo a medida da Mesa da Subscrição. Ficou: Score em
//  duas colunas com barra curta, exercícios em tabela (sem barra) e o limite
//  com duas barras finas. No Score a cor segue os pontos na régua da
//  metodologia e o número está escrito ao lado: a cor nunca fala sozinha.
// ============================================================================

import { cor, AZUIS, raio } from '@/lib/ui/painel'
import type { FichaAnalise, ScoreMemoria, ExercicioFicha } from '@/lib/analise/ficha'

/* O teto de limite por tomador do contrato de resseguro. É o mesmo valor de
   `TETO_POR_TOMADOR` em scripts/carga-analises.mjs, que anula o número de um
   limite recomendado acima dele. O APROVADO pelo comitê pode passar; o
   recomendado pela análise, não. */
const TETO_POR_TOMADOR = 80_000_000

/** Valor em reais, curto: "R$ 837,2 mi", "R$ 1,25 bi", "R$ 850 mil". */
export function reaisCurto(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const s = v < 0 ? '−' : ''
  const a = Math.abs(v)
  if (a >= 1e9) return `${s}R$ ${(a / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi`
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`
  if (a >= 1e3) return `${s}R$ ${Math.round(a / 1e3).toLocaleString('pt-BR')} mil`
  return `${s}R$ ${a.toLocaleString('pt-BR')}`
}

const num1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/* ── peças comuns ─────────────────────────────────────────────────────────── */

/** A barra. `vazada` desenha só o contorno: é como o valor NEGATIVO aparece,
 *  para prejuízo de 10 mi não ter a mesma cara de lucro de 10 mi. */
function Trilho({ fracao, cor: c, alto = 8, titulo, vazada }: { fracao: number; cor: string; alto?: number; titulo?: string; vazada?: boolean }) {
  const f = Number.isFinite(fracao) ? Math.max(0, Math.min(1, fracao)) : 0
  return (
    <span aria-hidden title={titulo} style={{ display: 'block', height: alto, background: cor.bordaSuave, borderRadius: 4, overflow: 'hidden' }}>
      <span style={{
        display: 'block', height: '100%', width: `${f * 100}%`, minWidth: f > 0 ? 3 : 0, borderRadius: 4, boxSizing: 'border-box',
        background: vazada ? cor.papel : c, border: vazada ? `1.5px solid ${c}` : undefined,
      }} />
    </span>
  )
}

function SemDado({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: cor.textoFraco, lineHeight: 1.5 }}>{children}</div>
}

function Origem({ children, titulo }: { children: React.ReactNode; titulo?: string }) {
  return (
    <div title={titulo} style={{
      fontSize: 10.5, color: cor.textoFraco, marginTop: 10, paddingTop: 7, borderTop: `1px dashed ${cor.bordaSuave}`,
      lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
    }}>{children}</div>
  )
}

/* ══ 1 · COMO O SCORE FOI FORMADO ═══════════════════════════════════════════
   Cada indicador vale de 0 a 15 pontos em toda a metodologia (conferido nas 187
   memórias do banco em 30/09: máximo 15, mínimo 0, em todos os indicadores). A
   barra é pontos ÷ 15; o peso e a parcial vão no `title`, porque é a conta que
   o auditor refaz. Indicador com peso zero não pontua e aparece dizendo isso. */
const MAXIMO_PONTOS = 15

/* O TEXTO É O DA ANÁLISE. A classificação escrita ao lado da barra é a que a
   análise gravou, só com o acento que o motor tira ("Razoavel" vira
   "Razoável"). A COR vem dos pontos, na escala da metodologia (15 e 10 bons,
   5 razoável, 0 insatisfatório), que é a mesma régua que produziu aquela
   classificação; sem classificação gravada, a régua também dá o texto. */
const ACENTO: Record<string, string> = {
  otimo: 'Ótimo', bom: 'Bom', razoavel: 'Razoável', insatisfatorio: 'Insatisfatório',
  estavel: 'Estável', instavel: 'Instável', 'estavel/crescimento': 'Estável/crescimento',
}
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const NAO_SE_APLICA = /^n\/a\b|^n[ãa]o\s+(se\s+)?aplic/i

function leitura(pontos: number | null, peso: number | null, classificacao: string | null): { txt: string; c: string } {
  if (peso === 0) return { txt: 'não pontua', c: cor.borda }
  if (classificacao && NAO_SE_APLICA.test(classificacao.trim())) return { txt: 'não se aplica', c: cor.borda }
  const txt = classificacao ? (ACENTO[semAcento(classificacao)] ?? classificacao) : null
  if (pontos === null) return { txt: txt ?? '—', c: cor.borda }
  const c = pontos >= 10 ? cor.areaOperacao : pontos >= 5 ? cor.ouro : cor.alerta
  return { txt: txt ?? (pontos >= 15 ? 'Ótimo' : pontos >= 10 ? 'Bom' : pontos >= 5 ? 'Razoável' : 'Insatisfatório'), c }
}

/* AS DUAS COLUNAS COM A LINHA NO MEIO (30/09/2026). Pedido dele: "quando for
   quadro, separe por linhas". Folha e não estilo inline porque a coluna da
   direita é que leva a linha (`:nth-child`) e porque, no celular, o quadro vira
   uma coluna só e a linha some (`@container`, igual à Faixa). */
const FOLHA_SCORE = `
.gc-caixa { container-type: inline-size; }
.gc-ind { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); }
/* O respiro entre linhas é padding, não row-gap: com gap a linha vertical sai picotada. */
.gc-ind > * { padding-block: 3px; }
.gc-ind > :nth-child(odd) { padding-right: 16px; }
.gc-ind > :nth-child(even) { padding-left: 16px; border-left: 1px solid ${cor.borda}; }
@container (max-width: 460px) {
  .gc-ind { grid-template-columns: minmax(0,1fr); }
  .gc-ind > :nth-child(odd), .gc-ind > :nth-child(even) { padding-inline: 0; border-left: none; }
}
`

export function ScoreFormado({ memoria }: { memoria: ScoreMemoria | null }) {
  if (!memoria || !memoria.grupos.length) {
    return <SemDado>Esta análise foi publicada sem a memória de cálculo do Score. O número está no relatório, mas não dá para abrir de onde ele veio.</SemDado>
  }
  /* ENXUTO (30/09/2026). A primeira versão era uma linha de tela inteira por
     indicador, com barra longa, "15/15" e a palavra da classificação: dezessete
     linhas de barra, "poluição total" nas palavras dele. Agora os indicadores
     correm em duas colunas, a barra é curta e o número é só os pontos. A
     classificação da análise, o peso e a conta ficam no `title` de cada linha. */
  return (
    <div className="gc-caixa">
      <style href="graficos-credito" precedence="default">{FOLHA_SCORE}</style>
      <div style={{ fontSize: 11, color: cor.textoFraco, marginBottom: 8 }}>pontos de 0 a {MAXIMO_PONTOS} por indicador</div>
      {memoria.grupos.map((g) => (
        <div key={g.id} style={{ marginBottom: 10 }}>
          <div title={g.dica || undefined} style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingBottom: 4, marginBottom: 5, borderBottom: `1px solid ${cor.bordaSuave}` }}>
            <b style={{ fontSize: 13, fontWeight: 700, color: cor.tinta, flex: 1 }}>{g.nome}</b>
            {g.subtotal !== null && <span style={{ fontSize: 11.5, color: cor.textoSub, whiteSpace: 'nowrap' }}>subtotal <b style={{ fontSize: 12.5, color: cor.tinta }}>{num1(g.subtotal)}</b></span>}
          </div>
          <div role="list" className="gc-ind">
            {g.indicadores.map((i) => {
              const l = leitura(i.pontos, i.peso, i.classificacao)
              const titulo = [
                l.txt, i.valor ? `valor: ${i.valor}` : '', i.formula ? `conta: ${i.formula}` : '',
                i.peso !== null ? `peso ${String(i.peso).replace('.', ',')}%` : '',
                i.parcial !== null ? `parcial ${num1(i.parcial)}` : '',
              ].filter(Boolean).join(' · ')
              const pontua = i.pontos !== null && i.peso !== 0
              return (
                <div key={i.id} role="listitem" title={titulo || undefined}
                  style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 44px 20px', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: cor.texto, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.rotulo}</span>
                  <Trilho fracao={pontua ? (i.pontos as number) / MAXIMO_PONTOS : 0} cor={l.c} alto={5} />
                  <span style={{ fontSize: 12, color: pontua ? cor.tinta : cor.textoFraco, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {pontua ? i.pontos : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {/* Sem rodapé (30/09/2026): a conta cortada em uma linha não servia
          para ler, e ele mandou tirar. A conta inteira está no Relatório, em
          "Como o Score foi formado". */}
    </div>
  )
}

/* ══ 2 · EVOLUÇÃO DOS EXERCÍCIOS ════════════════════════════════════════════
   Os exercícios fechados (com ano), do mais antigo ao mais novo, até três
   (a carga de hoje grava dois por análise; o terceiro é para quando vier). O
   balancete do ano corrente fica de fora: semestre contra ano inteiro faria a
   receita "cair" pela metade só por ser meio ano. A variação é do último ano
   fechado contra o anterior, com a seta junto da cor. */
const CONTAS: { rot: string; k: keyof ExercicioFicha }[] = [
  { rot: 'Receita operacional', k: 'receita_operacional' },
  { rot: 'EBITDA', k: 'ebitda' },
  { rot: 'Lucro líquido', k: 'lucro_liquido' },
  { rot: 'Patrimônio líquido', k: 'patrimonio_liquido' },
]

/* O RÓTULO COMO A ANÁLISE ESCREVEU pode ser uma frase ("30/06/2026 (balancete
   de 6 meses, revisado mas não fechado nem auditado)"). No gráfico vale a data
   ou o ano; a frase inteira fica no `title`. */
export function rotuloCurto(r: string): string {
  const m = /^(\d{2}\/\d{2}\/\d{4}|\d{4})/.exec(r.trim())
  return m ? m[1] : r.length > 24 ? r.slice(0, 24) + '…' : r
}
/** Ano fechado: "2025", "2025 (auditado)" ou "31/12/2025". Balancete de meio de
 *  ano, ou o que se diz não fechado, não entra. */
const fechado = (e: ExercicioFicha) => {
  const r = e.rotulo.trim()
  return /^(\d{4}\b|31\/12\/)/.test(r) && !/balancete|n[ãa]o fechad/i.test(r)
}

export function EvolucaoExercicios({ exercicios }: { exercicios: ExercicioFicha[] }) {
  /* Um por ano. A carga já gravou o MESMO exercício duas vezes com rótulos
     diferentes (Yuny Stan, 30/09: "31/12/2025" e "31/12/2025 (fechado; ...)",
     com os mesmos números). Contar os dois desenharia um ano repetido e uma
     variação de 0% que não existe. Fica o de rótulo mais curto. */
  const porAno = new Map<number, ExercicioFicha>()
  for (const e of exercicios) {
    if (e.exercicio === null || !fechado(e)) continue
    const ja = porAno.get(e.exercicio)
    if (!ja || e.rotulo.length < ja.rotulo.length) porAno.set(e.exercicio, e)
  }
  const anos = [...porAno.values()]
    .sort((a, b) => (a.exercicio as number) - (b.exercicio as number))
    .slice(-3)
  if (anos.length < 2) {
    return <SemDado>A análise tem {anos.length ? 'um exercício fechado só' : 'nenhum exercício fechado'}: sem dois anos não há evolução para mostrar.</SemDado>
  }
  const valor = (e: ExercicioFicha, k: keyof ExercicioFicha) => (typeof e[k] === 'number' ? e[k] as number : null)
  const cab = anos[anos.length - 1], antes = anos[anos.length - 2]

  /* TABELA, NÃO BARRA (30/09/2026). Eram duas barras por conta, oito barras e
     uma legenda para dizer quatro números por ano: ele achou poluído. Uma
     tabela como a do Enquadramento da Subscrição diz o mesmo em cinco linhas,
     e a variação fica na última coluna, com a seta junto da cor. */
  /* Quadro com linha entre as colunas (pedido dele, 30/09): a borda da esquerda
     de cada célula, menos a da Conta, desenha a grade sem fechar a moldura. */
  const vertical: React.CSSProperties = { borderLeft: `1px solid ${cor.borda}` }
  const th: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: cor.tinta, textAlign: 'center', padding: '7px 10px', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { fontSize: 12, textAlign: 'center', padding: '7px 10px', borderTop: `1px solid ${cor.borda}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
  return (
    <div>
      <div style={{ border: `1px solid ${cor.borda}`, borderRadius: raio.controle, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: cor.papelZebra }}>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Conta</th>
              {anos.map((e) => <th key={e.rotulo} style={{ ...th, ...vertical }} title={e.rotulo}>{rotuloCurto(e.rotulo)}</th>)}
              <th style={{ ...th, ...vertical }} title={`${rotuloCurto(cab.rotulo)} contra ${rotuloCurto(antes.rotulo)}`}>Variação</th>
            </tr>
          </thead>
          <tbody>
            {CONTAS.map((c) => {
              const vs = anos.map((e) => valor(e, c.k))
              if (vs.every((v) => v === null)) return null
              const ult = vs[vs.length - 1], ant = vs[vs.length - 2]
              const variacao = ult !== null && ant !== null && ant !== 0 ? (ult - ant) / Math.abs(ant) : null
              return (
                <tr key={c.rot}>
                  <td style={{ ...td, textAlign: 'left', color: cor.tinta }}>{c.rot}</td>
                  {vs.map((v, i) => (
                    <td key={anos[i].rotulo} style={{ ...td, ...vertical, color: (v ?? 0) < 0 ? cor.alerta : cor.tinta }}>{reaisCurto(v)}</td>
                  ))}
                  <td style={{ ...td, ...vertical, fontWeight: 700, color: variacao === null ? cor.textoFraco : variacao >= 0 ? cor.areaOperacao : cor.alerta }}>
                    {variacao === null ? '—' : `${variacao >= 0 ? '▲' : '▼'} ${Math.abs(variacao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Origem>demonstrações da análise{anos[0].base ? ` · ${anos[0].base}` : ''}</Origem>
    </div>
  )
}

/* ══ 3 · COMO O LIMITE FOI FORMADO ══════════════════════════════════════════
   O técnico é o PL do último exercício fechado vezes o percentual da matriz,
   que é exatamente a conta que a análise escreve em `limite_base` ("67,5% do
   PL (483.971.603,00 * 0,675)"). Ele é refeito aqui com os números que já
   estão nas colunas, e NÃO lido do texto: nunca se extrai limite de frase.
   O `limite_rs` do banco não serve para isso, porque é o campo que ele edita
   no template para registrar a exceção (Heating e Cooling, 30/09: o técnico
   era 19,5 mi e o campo foi a 30 mi). A frase da análise vai no pé, para
   quem quiser conferir a conta. */
export function LimiteFormado({ ficha }: { ficha: FichaAnalise }) {
  const perc = ficha.limite_perc
  const recomendado = ficha.limiteNum
  const base = ficha.limite_base

  /* QUAL PL A ANÁLISE USOU. Não é sempre o do ano mais novo: há análise que
     fez a conta sobre o balancete do semestre, outra sobre o ano fechado.
     A frase da análise (`limite_base`) escreve o PL por extenso, então o
     exercício certo é aquele cujo PL aparece nela, comparando só os dígitos
     (nada é LIDO da frase, só conferido). Sem frase, vale o mais recente. Com
     frase e nenhum PL batendo, a análise usou outra base (o grupo, um valor
     ajustado): aí o gráfico não refaz a conta, para não mostrar um técnico
     que não é o dela. */
  const comPl = ficha.exercicios
    .filter((e) => e.exercicio !== null && e.patrimonio_liquido !== null)
    .sort((a, b) => (b.exercicio as number) - (a.exercicio as number))
  const digitosBase = (base ?? '').replace(/\D/g, '')
  const ultimo = base
    ? comPl.find((e) => { const d = String(Math.trunc(Math.abs(e.patrimonio_liquido as number))); return d.length >= 4 && digitosBase.includes(d) })
    : comPl[0]
  const nao = (texto: string) => (
    <SemDado>
      {texto}
      {base && <Origem titulo={base}>base da análise: {base}</Origem>}
    </SemDado>
  )
  if (recomendado === null) return nao('A análise não traz um limite recomendado em número (veja o aviso na faixa acima).')
  if (perc === null || !comPl.length) return nao('Falta o PL ou o percentual da matriz nesta análise: não dá para refazer o limite técnico.')
  // Percentual gravado como fração (0,6 em vez de 60) daria um técnico cem vezes menor.
  if (perc <= 1) return nao('O percentual da matriz está gravado fora de escala nesta análise: a conta fica só na frase abaixo.')
  if (!ultimo) return nao('A análise fez a conta do limite sobre outra base, que não é o PL de nenhum dos exercícios publicados. A conta dela está abaixo.')
  const pl = ultimo.patrimonio_liquido as number
  if (pl <= 0) return nao(`PL ${pl < 0 ? 'negativo' : 'zerado'} em ${rotuloCurto(ultimo.rotulo)}: a matriz não gera limite técnico.`)

  const tecnico = pl * perc / 100
  const tetoPesa = tecnico > TETO_POR_TOMADOR || recomendado >= TETO_POR_TOMADOR
  const escala = Math.max(tecnico, recomendado, tetoPesa ? TETO_POR_TOMADOR : 0)
  const percTxt = perc.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  // 1%: a análise arredonda o recomendado, e arredondar não é exceção nem redutor.
  const perto = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, b) * 0.01

  // Limite zero é a própria decisão (Aquamar, reprovada): não é "redutor".
  const leitura = recomendado === 0 ? { txt: 'Sem limite: a análise não libera crédito para este tomador.', c: cor.alerta }
    : perto(recomendado, tecnico) ?{ txt: 'O recomendado é o próprio limite técnico da matriz.', c: cor.textoSub }
    : recomendado < tecnico
      ? perto(recomendado, TETO_POR_TOMADOR)
        ? { txt: `O teto de ${reaisCurto(TETO_POR_TOMADOR)} por tomador do resseguro cortou o técnico.`, c: cor.ouroTexto }
        : { txt: 'Abaixo do técnico: redutor ou decisão de quem analisou (a análise explica).', c: cor.ouroTexto }
      : { txt: 'Acima do técnico: exceção à matriz, sujeita ao Comitê.', c: cor.ouroTexto }

  const linha = (rot: string, sub: string, v: number, c: string) => (
    <div title={`${rot}: ${reaisCurto(v)}`} style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <b style={{ fontSize: 13, fontWeight: 700, color: cor.tinta }}>{rot}</b>
        <span style={{ fontSize: 11, color: cor.textoFraco, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: cor.tinta, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{reaisCurto(v)}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <Trilho fracao={v / escala} cor={c} alto={6} />
        {tetoPesa && (
          <span aria-hidden title={`teto por tomador: ${reaisCurto(TETO_POR_TOMADOR)}`} style={{
            position: 'absolute', top: -3, bottom: -3, left: `${(TETO_POR_TOMADOR / escala) * 100}%`,
            borderLeft: `2px dashed ${cor.ouro}`,
          }} />
        )}
      </div>
    </div>
  )

  return (
    <div>
      {linha('Técnico', `${percTxt}% do PL de ${rotuloCurto(ultimo.rotulo)}${fechado(ultimo) ? '' : ' (não é ano fechado)'}`, tecnico, AZUIS[4])}
      {linha('Recomendado', 'o que a análise entregou', recomendado, cor.acao)}
      {tetoPesa && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: cor.textoSub, marginBottom: 6 }}>
          <span style={{ width: 0, height: 10, borderLeft: `2px dashed ${cor.ouro}` }} />
          teto de {reaisCurto(TETO_POR_TOMADOR)} por tomador do resseguro
        </div>
      )}
      {/* A leitura em texto simples: a caixa em volta dela era um enfeite a mais. */}
      <div style={{ fontSize: 12, fontWeight: 700, color: leitura.c, lineHeight: 1.45, marginTop: 2 }}>{leitura.txt}</div>
      <Origem titulo={ficha.limite_base ?? undefined}>
        {ficha.limite_base ? <>base da análise: {ficha.limite_base}</> : 'percentual da matriz e PL da análise'}
      </Origem>
    </div>
  )
}
