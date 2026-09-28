// ============================================================================
//  O QUE MUDOU DE UMA ANÁLISE PARA A OUTRA  ·  24/09/2026
//
//  Pedido dele, depois da NC Holding: "se eu quiser um comparativo de análises,
//  ao fazer a análise, apresentar a diferença das análises e o motivo da nova
//  decisão".
//
//  QUEM CALCULA A DIFERENÇA É O CÓDIGO, e não a IA. A regra do projeto
//  (robo-sem-api-ia-com-api) vale aqui com força dobrada: a diferença entre
//  duas decisões de crédito é aritmética sobre duas linhas do banco, e é o
//  número que vai para o comitê. A IA escreve o PORQUÊ; o que mudou, quanto
//  mudou e para que lado, sai daqui. Três ganhos que não são pequenos:
//
//    · vale para trás. As 18 empresas que já têm duas versões ganham o
//      comparativo sem refazer nada;
//    · não depende de a análise lembrar de preencher um campo novo;
//    · não muda o `validar.mjs` nem o schema do JSON da skill.
//
//  A ANTERIOR É A CRONOLÓGICA, e não a `versao`. Medido em 24/09/2026: das 18
//  empresas com duas análises, 6 têm as duas gravadas como `versao = 1` (a NC,
//  a Setra, a S.A. Paulista, a Globalx, a Usiblend e a Obrascon). Confiar
//  naquele campo aqui mostraria "v1 contra v1" e escolheria a errada.
//
//  O SENTIDO (melhorou / piorou) É SEMPRE DO PONTO DE VISTA DO RISCO DA FAM:
//  limite maior, taxa menor e score maior são "melhorou" porque a empresa
//  ficou mais aceitável. Onde não existe lado melhor (porte, setor, corretora),
//  o sentido é `mudou`, em cinza, e ninguém precisa fingir julgamento.
// ============================================================================

import { fmtMoeda } from '@/lib/utils'
import { situacaoDe, nivelLimpo } from '@/lib/analise/retrato'

/** As colunas de `analises` que o comparativo lê. Uma constante, para as duas
 *  portas (tela e dossiê do notebook) pedirem exatamente o mesmo. */
export const COLUNAS_COMPARATIVO =
  'id, cnpj, razao_social, nome_curto, corretora, data_analise, versao, vigente, revisada, '
  + 'score_final, classe, porte, rating_txt, rating_numero, nivel_risco, '
  + 'recomendacao, decisao_cod, condicoes, conclusao, '
  + 'limite_recomendado_num, limite_recomendado_txt, limite_recomendado_motivo, limite_base, limite_perc, '
  + 'taxa_tradicional, taxa_judicial, taxa_estruturada, '
  + 'serasa_score, serasa_risco, serasa_pefin, serasa_protestos, serasa_acoes, '
  + 'pontos_positivos, pontos_atencao, tres_cs, base_df, pasta, arquivo, registrado_em'

export interface LinhaComparavel {
  id: string
  cnpj: string | null
  razao_social: string | null
  nome_curto: string | null
  corretora: string | null
  data_analise: string | null
  versao: number | null
  vigente: boolean | null
  revisada: boolean | null
  score_final: number | string | null
  classe: string | null
  porte: string | null
  rating_txt: string | null
  rating_numero: number | null
  nivel_risco: string | null
  recomendacao: string | null
  decisao_cod: string | null
  condicoes: string | null
  conclusao: string | null
  limite_recomendado_num: number | string | null
  limite_recomendado_txt: string | null
  limite_recomendado_motivo: string | null
  limite_base: string | null
  limite_perc: number | string | null
  taxa_tradicional: number | string | null
  taxa_judicial: number | string | null
  taxa_estruturada: number | string | null
  serasa_score: number | null
  serasa_risco: string | null
  serasa_pefin: string | null
  serasa_protestos: string | null
  serasa_acoes: string | null
  pontos_positivos: string[] | null
  pontos_atencao: string[] | null
  tres_cs: unknown
  base_df: string | null
  pasta: string | null
  arquivo: string | null
  registrado_em: string | null
}

export type Sentido = 'melhorou' | 'piorou' | 'mudou'

export interface Mudanca {
  campo: string
  rotulo: string
  antes: string
  depois: string
  sentido: Sentido
  /** `decisao` abre o comparativo e aparece em destaque; `numero` e `texto`
   *  vêm depois, na ordem em que a análise se lê. */
  peso: 'decisao' | 'numero' | 'texto'
  /** Só para texto longo: 0 a 1, o quanto a redação sobreviveu. */
  semelhanca?: number
}

export interface MudancaDeLista {
  rotulo: string
  entraram: string[]
  sairam: string[]
  mantidos: number
}

export interface Comparativo {
  anterior: LinhaComparavel
  atual: LinhaComparavel
  /** Dias entre as duas análises. */
  dias: number | null
  /** A virada da decisão, quando houve. É o título do comparativo. */
  viradaDaDecisao: { antes: string; depois: string; sentido: Sentido } | null
  mudancas: Mudanca[]
  listas: MudancaDeLista[]
  /** Quantos campos comparados ficaram idênticos. Dado honesto: análise que
   *  muda a decisão e não muda nada mais merece uma pergunta. */
  iguais: number
}

/* ──────────────────────────────────────────────────────────────────────────
   As réguas. Cada uma diz o que é "melhor" naquele campo, e só isso.
   ────────────────────────────────────────────────────────────────────────── */

/** Da pior para a melhor. `situacaoDe` já normaliza as grafias do acervo. */
const ESCALA_DECISAO = ['Bloqueio', 'Reprovar', 'Aprovar com ressalvas', 'Aprovar']

/** Do menor risco para o maior. `nivelLimpo` já normaliza as sete grafias. */
const ESCALA_NIVEL = ['Muito baixo', 'Baixo', 'Médio-Baixo', 'Médio', 'Médio-Alto', 'Alto', 'Muito alto']

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const txt = (v: unknown): string => String(v ?? '').trim()

/** Texto do relatório sem as marcas do template, para comparar o que se lê. */
const limpo = (v: unknown): string =>
  txt(v).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s{2,}/g, ' ').trim()

/** Semelhança por trigramas, a mesma ideia do `diferenca.mjs` do Sistema de
 *  Análise: separa "reescreveu a conclusão" de "trocou uma vírgula". */
export function semelhanca(a: string, b: string): number {
  const tri = (s: string) => {
    const t = ' ' + s.toLowerCase().replace(/[^\wà-ÿ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '
    const g = new Set<string>()
    for (let i = 0; i < t.length - 2; i++) g.add(t.slice(i, i + 3))
    return g
  }
  const A = tri(a), B = tri(b)
  if (!A.size || !B.size) return 0
  let comuns = 0
  for (const g of A) if (B.has(g)) comuns++
  return (2 * comuns) / (A.size + B.size)
}

/** O limite como a tela do CRM o lê: o motivo de anulação manda, e sem número
 *  confiável não existe número. A mesma trava de `ficha.ts` e `banco.ts`,
 *  repetida aqui de propósito: afrouxar em um lugar só já bastou para colocar
 *  número bonito onde não havia limite. */
function limiteDe(l: LinhaComparavel): { valor: number | null; texto: string } {
  const anulado = !!txt(l.limite_recomendado_motivo)
  const valor = anulado ? null : num(l.limite_recomendado_num)
  if (valor !== null) return { valor, texto: fmtMoeda(valor) }
  const escrito = limpo(l.limite_recomendado_txt)
  return { valor: null, texto: escrito ? (escrito.length > 120 ? escrito.slice(0, 117) + '…' : escrito) : 'sem limite' }
}

const pct = (v: number | string | null): string => {
  const n = num(v)
  return n === null ? 'sem taxa' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`
}

/** Compara duas posições numa escala. Fora da escala, vira `mudou`.
 *
 *  `subirEMelhor` NÃO É DETALHE, e o ensaio pegou isto em 24/09/2026: a escala
 *  da decisão sobe para o lado bom (Bloqueio → Aprovar), e a do nível de risco
 *  sobe para o lado ruim (Baixo → Alto). Com um único sentido, a NC saindo de
 *  risco Alto para Médio aparecia como PIORA, em vermelho, na mesma tela em
 *  que a decisão dizia que a empresa tinha sido aprovada. */
function porEscala(escala: string[], antes: string, depois: string, subirEMelhor: boolean): Sentido {
  const a = escala.indexOf(antes), b = escala.indexOf(depois)
  if (a < 0 || b < 0 || a === b) return 'mudou'
  return (b > a) === subirEMelhor ? 'melhorou' : 'piorou'
}

/** Compara dois números dizendo de que lado fica o melhor. */
function porNumero(a: number | null, b: number | null, maiorEMelhor: boolean): Sentido {
  if (a === null || b === null || a === b) return 'mudou'
  return (b > a) === maiorEMelhor ? 'melhorou' : 'piorou'
}

const lista = (v: string[] | null): string[] =>
  Array.isArray(v) ? v.map(x => limpo(x)).filter(Boolean) : []

/** Entraram, saíram e ficaram. Item reescrito conta como mantido quando a
 *  redação sobreviveu em 70%: sem isso, um ajuste de vírgula apareceria como
 *  um ponto de atenção removido e outro criado, e o comitê leria movimento
 *  onde não houve. */
function compararLista(rotulo: string, antes: string[], depois: string[]): MudancaDeLista | null {
  const sobrou = [...depois]
  const sairam: string[] = []
  let mantidos = 0
  for (const a of antes) {
    let melhor = -1, nota = 0
    for (let i = 0; i < sobrou.length; i++) {
      const s = semelhanca(a, sobrou[i])
      if (s > nota) { nota = s; melhor = i }
    }
    if (melhor >= 0 && nota >= 0.7) { sobrou.splice(melhor, 1); mantidos++ }
    else sairam.push(a)
  }
  if (!sairam.length && !sobrou.length) return null
  return { rotulo, entraram: sobrou, sairam, mantidos }
}

/* ──────────────────────────────────────────────────────────────────────────
   O comparativo.
   ────────────────────────────────────────────────────────────────────────── */

/** Qual das linhas é a anterior da `atual`: a mais recente entre as que vêm
 *  antes dela no tempo, pela data da análise e, no empate, pelo registro.
 *  `todas` são as análises do mesmo CNPJ, incluindo a atual. */
export function anteriorDe(todas: LinhaComparavel[], atualId: string): LinhaComparavel | null {
  const ordem = (l: LinhaComparavel) => `${l.data_analise ?? ''}|${l.registrado_em ?? ''}`
  const atual = todas.find(l => l.id === atualId)
  if (!atual) return null
  const antes = todas
    .filter(l => l.id !== atualId && ordem(l) < ordem(atual))
    .sort((a, b) => ordem(a) < ordem(b) ? 1 : -1)
  return antes[0] ?? null
}

export function compararAnalises(anterior: LinhaComparavel, atual: LinhaComparavel): Comparativo {
  const m: Mudanca[] = []
  let iguais = 0

  const por = (
    campo: string, rotulo: string, antes: string, depois: string,
    sentido: Sentido, peso: Mudanca['peso'], semel?: number,
  ) => {
    if (antes === depois) { iguais++; return }
    m.push({ campo, rotulo, antes, depois, sentido, peso, ...(semel === undefined ? {} : { semelhanca: semel }) })
  }

  // ── A decisão, que é o que o comitê lê primeiro ──────────────────────────
  const dAntes = situacaoDe(anterior.recomendacao)
  const dDepois = situacaoDe(atual.recomendacao)
  por('decisao', 'Decisão', dAntes, dDepois, porEscala(ESCALA_DECISAO, dAntes, dDepois, true), 'decisao')

  const lAntes = limiteDe(anterior), lDepois = limiteDe(atual)
  por('limite', 'Limite recomendado', lAntes.texto, lDepois.texto,
    porNumero(lAntes.valor, lDepois.valor, true), 'decisao')

  const nAntes = nivelLimpo(anterior.nivel_risco), nDepois = nivelLimpo(atual.nivel_risco)
  por('nivel_risco', 'Nível de risco', nAntes, nDepois, porEscala(ESCALA_NIVEL, nAntes, nDepois, false), 'decisao')

  // ── Os números da metodologia ────────────────────────────────────────────
  const sAntes = num(anterior.score_final), sDepois = num(atual.score_final)
  por('score_final', 'Score FAM',
    sAntes === null ? 'sem score' : sAntes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
    sDepois === null ? 'sem score' : sDepois.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
    porNumero(sAntes, sDepois, true), 'numero')

  /* CLASSE MENOR É MELHOR (Classe 3 é melhor que Classe 4), e foi assim que a
     NC subiu de 4 para 3 ao virar de Bloqueio para Aprovar. */
  const cAntes = num(anterior.classe), cDepois = num(atual.classe)
  por('classe', 'Classe', txt(anterior.classe) || 'sem classe', txt(atual.classe) || 'sem classe',
    porNumero(cAntes, cDepois, false), 'numero')

  // Porte é tamanho, não qualidade: mudar de C para B não é melhorar.
  por('porte', 'Porte', txt(anterior.porte) || 'sem porte', txt(atual.porte) || 'sem porte', 'mudou', 'numero')

  const rAntes = anterior.rating_numero, rDepois = atual.rating_numero
  por('rating', 'Rating FAM', txt(anterior.rating_txt) || 'sem rating', txt(atual.rating_txt) || 'sem rating',
    porNumero(rAntes, rDepois, true), 'numero')

  // Taxa menor é melhor para o tomador, e é sinal de risco menor lido pela FAM.
  por('taxa_tradicional', 'Taxa tradicional', pct(anterior.taxa_tradicional), pct(atual.taxa_tradicional),
    porNumero(num(anterior.taxa_tradicional), num(atual.taxa_tradicional), false), 'numero')
  por('taxa_judicial', 'Taxa judicial', pct(anterior.taxa_judicial), pct(atual.taxa_judicial),
    porNumero(num(anterior.taxa_judicial), num(atual.taxa_judicial), false), 'numero')
  por('taxa_estruturada', 'Taxa estruturada', pct(anterior.taxa_estruturada), pct(atual.taxa_estruturada),
    porNumero(num(anterior.taxa_estruturada), num(atual.taxa_estruturada), false), 'numero')

  por('serasa_score', 'Score Serasa',
    anterior.serasa_score === null ? 'sem consulta' : String(anterior.serasa_score),
    atual.serasa_score === null ? 'sem consulta' : String(atual.serasa_score),
    porNumero(anterior.serasa_score, atual.serasa_score, true), 'numero')

  // ── A base que sustenta tudo. Ela mudando, o resto tinha que mudar ───────
  por('base_df', 'Base das demonstrações', txt(anterior.base_df) || 'não informada', txt(atual.base_df) || 'não informada', 'mudou', 'texto')

  // ── Os textos. Aqui o que importa é quanto foi reescrito ─────────────────
  for (const [campo, rotulo] of [['conclusao', 'Conclusão'], ['condicoes', 'Condições']] as const) {
    const a = limpo(anterior[campo]), b = limpo(atual[campo])
    if (!a && !b) { iguais++; continue }
    if (a === b) { iguais++; continue }
    const s = semelhanca(a, b)
    m.push({
      campo, rotulo, sentido: 'mudou', peso: 'texto', semelhanca: s,
      antes: a || 'em branco', depois: b || 'em branco',
    })
  }

  const listas = [
    compararLista('Pontos de atenção', lista(anterior.pontos_atencao), lista(atual.pontos_atencao)),
    compararLista('Pontos positivos', lista(anterior.pontos_positivos), lista(atual.pontos_positivos)),
  ].filter((x): x is MudancaDeLista => x !== null)

  const dias = (() => {
    const a = Date.parse(`${anterior.data_analise ?? ''}T12:00:00`)
    const b = Date.parse(`${atual.data_analise ?? ''}T12:00:00`)
    return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null
  })()

  const viradaDaDecisao = dAntes === dDepois ? null
    : { antes: dAntes, depois: dDepois, sentido: porEscala(ESCALA_DECISAO, dAntes, dDepois, true) }

  /* A ORDEM DA LISTA É A DA LEITURA, e não a da construção: decisão, número,
     texto. Dentro de cada peso, a ordem em que foram comparados, que é a do
     relatório dele. */
  const ordemPeso = { decisao: 0, numero: 1, texto: 2 }
  m.sort((a, b) => ordemPeso[a.peso] - ordemPeso[b.peso])

  return { anterior, atual, dias, viradaDaDecisao, mudancas: m, listas, iguais }
}
