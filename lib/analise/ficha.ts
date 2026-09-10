// ============================================================
//  A FICHA COMPLETA DA ANÁLISE — tudo o que a Mesa do Tomador mostra.
//
//  `banco.ts` devolve os 6 números do bloco antigo. Este arquivo devolve a
//  análise INTEIRA: score, rating, taxas, os 3 C's, pontos, conclusão, os
//  exercícios e os documentos lidos. É o que enche as gavetas da Mesa.
//
//  A LIGAÇÃO É POR `tomador_id` PRIMEIRO, e por CNPJ como reserva. Até
//  07/09/2026 a coluna estava NULA nas 146 e só o CNPJ funcionava; naquele dia
//  ela foi preenchida para as 121 que casam com exatamente um tomador (as
//  outras 25 são 20 sem tomador no CRM e 5 sem CNPJ apurado). A reserva por
//  CNPJ fica: análise publicada depois disso nasce sem `tomador_id`.
//
//  A REGRA DO LIMITE é a mesma de `banco.ts`, e não pode ser afrouxada aqui:
//  `limite_recomendado_num` só vale quando existe E quando não há motivo de
//  anulação. Sem número, mostra-se o texto com o aviso do que ele é, nunca um
//  número bonito que não é limite.
// ============================================================

import { createClient } from '@/lib/supabase/client'
import { soDigitos } from './local'
import { semEntidadesHtml } from '@/lib/utils'

/* O MARCADOR DO TEMPLATE NÃO É DADO  ·  09/09/2026
   ---------------------------------------------------------------------------
   O relatório do sistema de análise nasce com marcadores entre colchetes no
   lugar do que ainda falta preencher: `[Corretora]`, `[Analista]`, `[Grupo]`.
   Quando o campo não é preenchido, o marcador viaja no JSON, a carga o grava
   ao pé da letra e o CRM o desenha como se fosse o nome da corretora. Foi o
   que ele viu no card da Renova: um "[Corretora]" onde devia estar um nome.

   Um marcador na tela é pior que um campo vazio: campo vazio se lê como "falta
   isso", e o marcador se lê como dado errado. Aqui ele volta a ser nada, e a
   tela diz "sem corretora na análise", que é a verdade. */
const MARCADOR = /^\s*[[【][^\]】]*[\]】]\s*$/
export const semMarcador = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return !t || MARCADOR.test(t) ? null : t
}
import type { EstruturaSocietaria } from '@/components/tomador/OrganogramaAnalise'

/** Um exercício do resumo financeiro. Valores SEMPRE em reais (a carga já
 *  converteu pela `escala`); `rotulo` é a chave porque a base nem sempre é
 *  um ano fechado ("Balancete 03/2026"). */
export interface ExercicioFicha {
  rotulo: string
  exercicio: number | null
  base: string | null
  ativo_total: number | null
  ativo_circulante: number | null
  passivo_circulante: number | null
  exigivel_total: number | null
  patrimonio_liquido: number | null
  receita_operacional: number | null
  ebitda: number | null
  lucro_liquido: number | null
  caixa: number | null
  estoques: number | null
}

export interface DocumentoFicha {
  nome: string
  bytes: number | null
  hash16: string | null
}

/** Uma consulta recente ao CNPJ, como a análise registrou. */
export interface ConsultaSerasa {
  data: string | null
  empresa: string | null
  tipo: string | null
}

/** O Serasa da análise. Cada campo pode faltar: a análise nem sempre recebeu
 *  o relatório completo, e campo que falta fica NULO, nunca "sem registros". */
export interface SerasaFicha {
  score: number | null
  risco: string | null
  interpretacao: string | null
  prob: string | null
  limite_txt: string | null
  limite_num: number | null
  pefin: string | null
  protestos: string | null
  acoes: string | null
  recuperacao: string | null
  consultas: ConsultaSerasa[]
  consultas_qtd: number | null
  /** `revisada` (a versão que ele salvou) ou `gerada`. */
  fonte: string | null
}

export interface TresCs {
  carater?: { fundamento?: string; classe?: string }
  capacidade?: { fundamento?: string; classe?: string }
  capital?: { fundamento?: string; classe?: string }
}

export interface FichaAnalise {
  id: string
  chave_local: string
  data_analise: string
  revisada: boolean
  versao: number
  /** Falsa nas versões antigas do mesmo CNPJ. A Mesa só pede a vigente; o
   *  acervo abre qualquer uma, e por isso precisa saber. */
  vigente: boolean

  /** Só dígitos, como a carga gravou. Pode faltar: há análise sem CNPJ apurado. */
  cnpj: string | null
  /** O tomador do CRM, quando a análise já está ligada a um. */
  tomador_id: string | null
  corretora: string | null

  razao_social: string
  nome_curto: string | null
  grupo: string | null
  segmento: string | null
  setor: string | null

  score_final: number | null
  classe: string | null
  porte: string | null
  rating_txt: string | null
  rating_cod: string | null
  nivel_risco: string | null
  recomendacao: string | null

  /** O limite pronto para a tela: número quando é confiável, senão null. */
  limiteNum: number | null
  /** A frase a mostrar quando não há número confiável. Vazia quando há. */
  limiteAviso: string
  limite_recomendado_txt: string | null

  taxa_tradicional: number | null
  taxa_judicial: number | null
  taxa_estruturada: number | null

  condicoes: string | null
  conclusao: string | null
  pontos_positivos: string[]
  pontos_atencao: string[]
  tres_cs: TresCs | null

  /** O Serasa, quando a análise registrou alguma coisa. */
  serasa: SerasaFicha | null

  /** O organograma que a análise mapeou (44 das 131 têm). */
  estrutura: EstruturaSocietaria | null

  exercicios: ExercicioFicha[]
  documentos: DocumentoFicha[]

  /* ── O RESTO DO RELATÓRIO (09/09/2026) ────────────────────────────────
     Pergunta dele: "cadê o relatório que consta da análise de crédito?".
     Estes blocos existiam só no disco. São de LEITURA: a análise os escreveu,
     e o CRM os mostra. Análise publicada antes da carga nova vem com null, e
     a tela simplesmente não desenha a seção. */
  identificacao: IdentificacaoFicha | null
  enquadramento: EnquadramentoFicha | null
  resseguro: LinhaResseguro[]
  scoreMemoria: ScoreMemoria | null
  linhaTempo: { ano: string; evento: string }[]
  caixaEstoque: CaixaEstoque | null
  limite_base: string | null
  limite_perc: number | null
  base_df: string | null
  base_df_obs: string | null
  unidade: string | null
}

/** A ficha da empresa como a análise a apurou. */
export interface IdentificacaoFicha {
  fundacao: string | null
  regime: string | null
  capital: string | null
  endereco: string | null
  cnae: string | null
  funcionarios: string | null
  filiais: string | null
}

/** Classe, porte, e COMO a ponderação objetivo/subjetivo foi decidida. */
export interface EnquadramentoFicha {
  classe: string | null
  porte: string | null
  tipo: string | null
  obs: string | null
  pesoObj: number | null
  pesoSubj: number | null
}

/** Uma linha do contrato automático de resseguro. */
export interface LinhaResseguro {
  item: string
  regra: string | null
  resultado: string | null
  /** Enquadrado · Bloqueio · Aceitação especial — como a análise escreveu. */
  status: string | null
  obs: string | null
}

/** Um indicador da memória de cálculo, com tudo o que uma auditoria pede. */
export interface IndicadorScore {
  id: string
  rotulo: string
  valor: string | null
  formula: string | null
  classificacao: string | null
  pontos: number | null
  peso: number | null
  parcial: number | null
  obs: string | null
}

/** A memória de cálculo do Score, em quatro grupos. */
export interface ScoreMemoria {
  grupos: { id: string; nome: string; dica: string; indicadores: IndicadorScore[]; subtotal: number | null }[]
  calculo: string | null
  scoreObjetivo: number | null
  scoreFinal: number | null
  pesoObj: number | null
  pesoSubj: number | null
}

export interface CaixaEstoque {
  caixaA1: string | null
  caixaA2: string | null
  estoquesA1: string | null
  estoquesA2: string | null
  observacao: string | null
}

/** O que a ficha escreve quando o número não é limite de verdade. */
/* ══════════════════════════════════════════════════════════════════════════
   OS LEITORES DOS BLOCOS NOVOS
   O banco guarda jsonb como a análise escreveu, com os nomes curtos do sistema
   de análise (`kal`, `car`, `cxe`, `pObj`). Aqui eles viram nome de gente, uma
   vez só, para nenhuma tela precisar saber o que é `kal`.
   Bloco que a análise não escreveu volta null, e a seção não é desenhada.
   ══════════════════════════════════════════════════════════════════════════ */

const txt = (v: unknown): string | null => {
  const t = typeof v === 'string' ? v.trim() : (v == null ? '' : String(v))
  return t ? semMarcador(semEntidadesHtml(t)) : null
}
const numeroOuNulo = (v: unknown): number | null => {
  const n = Number(v)
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n
}
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null

function leIdentificacao(v: unknown): IdentificacaoFicha | null {
  const o = obj(v); if (!o) return null
  const f = {
    fundacao: txt(o.fundacao), regime: txt(o.regime), capital: txt(o.capital),
    endereco: txt(o.endereco), cnae: txt(o.cnae),
    funcionarios: txt(o.funcionarios), filiais: txt(o.filiais),
  }
  return Object.values(f).some(Boolean) ? f : null
}

function leEnquadramento(v: unknown): EnquadramentoFicha | null {
  const o = obj(v); if (!o) return null
  const f = {
    classe: txt(o.classe), porte: txt(o.porte), tipo: txt(o.tipo), obs: txt(o.obs),
    pesoObj: numeroOuNulo(o.pObj), pesoSubj: numeroOuNulo(o.pSubj),
  }
  return Object.values(f).some(x => x !== null) ? f : null
}

function leResseguro(v: unknown): LinhaResseguro[] {
  if (!Array.isArray(v)) return []
  return v.map(x => {
    const o = obj(x); if (!o) return null
    const item = txt(o.item); if (!item) return null
    return { item, regra: txt(o.regra), resultado: txt(o.resultado), status: txt(o.status), obs: txt(o.obs) }
  }).filter((x): x is LinhaResseguro => x !== null)
}

function leLinhaTempo(v: unknown): { ano: string; evento: string }[] {
  if (!Array.isArray(v)) return []
  return v.map(x => {
    const o = obj(x); if (!o) return null
    const evento = txt(o.evento); if (!evento) return null
    return { ano: txt(o.ano) ?? '', evento }
  }).filter((x): x is { ano: string; evento: string } => x !== null)
}

function leCaixaEstoque(v: unknown): CaixaEstoque | null {
  const o = obj(v); if (!o) return null
  const f = {
    caixaA1: txt(o.caixa_a1), caixaA2: txt(o.caixa_a2),
    estoquesA1: txt(o.estoques_a1), estoquesA2: txt(o.estoques_a2),
    observacao: txt(o.observacao),
  }
  return Object.values(f).some(Boolean) ? f : null
}

/* A MEMÓRIA DE CÁLCULO. Os quatro grupos do relatório, com o nome que aparece
   na tela e a dica que explica o que cada um mede. A ORDEM É A DO RELATÓRIO:
   capacidade, indicadores financeiros, cadastral, subjetivo — é a ordem em que
   a metodologia soma, e trocar a ordem é tornar a conta difícil de conferir. */
const GRUPOS_SCORE: { chave: string; id: string; nome: string; dica: string }[] = [
  { chave: 'capacidade', id: 'capacidade', nome: 'Capacidade', dica: 'tempo de atividade e apólices já emitidas' },
  { chave: 'indicadores', id: 'indicadores', nome: 'Indicadores financeiros', dica: 'liquidez, endividamento, margem e crescimento' },
  { chave: 'cadastral', id: 'cadastral', nome: 'Cadastral', dica: 'protestos, PEFIN/REFIN e ações judiciais' },
  { chave: 'subjetivo', id: 'subjetivo', nome: 'Subjetivo', dica: 'mercado de garantia, ISO, sócios e o setor' },
]

/** "liq_corrente" vira "Liquidez corrente": o nome curto é do motor, não dele. */
const ROTULOS_SCORE: Record<string, string> = {
  tempo_atividade: 'Tempo de atividade', apolices_emitidas: 'Apólices emitidas',
  liq_corrente: 'Liquidez corrente', liq_geral: 'Liquidez geral',
  end_geral: 'Endividamento geral', end_oneroso: 'Endividamento oneroso',
  cresc_pl: 'Crescimento do PL', cresc_rol: 'Crescimento da receita',
  margem_ebitda: 'Margem EBITDA', cresc_ll: 'Crescimento do lucro líquido',
  protestos: 'Protestos', pefin_refin: 'PEFIN e REFIN', acoes_judiciais: 'Ações judiciais',
  tempo_mercado_garantia: 'Tempo no mercado de garantia', certificado_iso: 'Certificado ISO',
  tempo_socios_empresa: 'Tempo dos sócios na empresa', situacao_setor: 'Situação do setor',
}

function leScoreMemoria(v: unknown): ScoreMemoria | null {
  const o = obj(v); if (!o) return null
  const grupos = GRUPOS_SCORE.map(g => {
    const bloco = obj(o[g.chave]); if (!bloco) return null
    const indicadores: IndicadorScore[] = []
    for (const k of Object.keys(bloco)) {
      // `subtotal` é a soma, e `aplicavel` é uma bandeira: nenhum dos dois é indicador.
      if (k === 'subtotal' || k === 'aplicavel') continue
      const i = obj(bloco[k]); if (!i) continue
      const valor = i.valor_bruto ?? i.valor_rs ?? i.valor_anos ?? i.quantidade ?? i.possui
      indicadores.push({
        id: k,
        rotulo: ROTULOS_SCORE[k] ?? k.replace(/_/g, ' '),
        valor: typeof valor === 'boolean' ? (valor ? 'sim' : 'não') : (valor == null ? null : String(valor).replace('.', ',')),
        formula: txt(i.formula), classificacao: txt(i.classificacao),
        pontos: numeroOuNulo(i.pontos), peso: numeroOuNulo(i.peso_perc),
        parcial: numeroOuNulo(i.score_parcial), obs: txt(i.obs ?? i.fonte),
      })
    }
    if (!indicadores.length) return null
    return { id: g.id, nome: g.nome, dica: g.dica, indicadores, subtotal: numeroOuNulo(bloco.subtotal) }
  }).filter((g): g is NonNullable<typeof g> => g !== null)

  const calculo = txt(o.calculo)
  if (!grupos.length && !calculo) return null
  return {
    grupos, calculo,
    scoreObjetivo: numeroOuNulo(o.score_objetivo),
    scoreFinal: numeroOuNulo(o.score_final),
    pesoObj: numeroOuNulo(o.peso_obj),
    pesoSubj: numeroOuNulo(o.peso_subj),
  }
}

const AVISO_TIPO: Record<string, string> = {
  teorico: 'teórico',
  teto: 'teto da FAM',
  sem_limite: 'sem limite, por decisão',
  vazio: 'sem número',
}

const COLUNAS = `
  id, chave_local, cnpj, tomador_id, corretora,
  razao_social, nome_curto, grupo, segmento, setor,
  data_analise, versao, revisada, vigente,
  score_final, classe, porte, rating_txt, rating_cod, nivel_risco, recomendacao,
  limite_recomendado_txt, limite_recomendado_num, limite_recomendado_tipo,
  limite_recomendado_motivo,
  taxa_tradicional, taxa_judicial, taxa_estruturada,
  condicoes, conclusao, pontos_positivos, pontos_atencao, tres_cs,
  serasa_score, serasa_risco, serasa_interpretacao, serasa_prob,
  serasa_limite_txt, serasa_limite_num, serasa_pefin, serasa_protestos,
  serasa_acoes, serasa_recuperacao, serasa_consultas, serasa_consultas_qtd,
  serasa_fonte, estrutura_societaria,
  identificacao, enquadramento, resseguro, score_memoria, linha_tempo,
  caixa_estoque, limite_base, limite_perc, base_df, base_df_obs, unidade
`

interface LinhaCrua {
  id: string
  chave_local: string
  cnpj: string | null
  tomador_id: string | null
  corretora: string | null
  razao_social: string
  nome_curto: string | null
  grupo: string | null
  segmento: string | null
  setor: string | null
  data_analise: string
  versao: number
  revisada: boolean
  vigente: boolean
  score_final: number | string | null
  classe: string | null
  porte: string | null
  rating_txt: string | null
  rating_cod: string | null
  nivel_risco: string | null
  recomendacao: string | null
  limite_recomendado_txt: string | null
  limite_recomendado_num: number | string | null
  limite_recomendado_tipo: string | null
  limite_recomendado_motivo: string | null
  taxa_tradicional: number | string | null
  taxa_judicial: number | string | null
  taxa_estruturada: number | string | null
  condicoes: string | null
  conclusao: string | null
  pontos_positivos: string[] | null
  pontos_atencao: string[] | null
  tres_cs: TresCs | null
  serasa_score: number | null
  serasa_risco: string | null
  serasa_interpretacao: string | null
  serasa_prob: string | null
  serasa_limite_txt: string | null
  serasa_limite_num: number | string | null
  serasa_pefin: string | null
  serasa_protestos: string | null
  serasa_acoes: string | null
  serasa_recuperacao: string | null
  serasa_consultas: ConsultaSerasa[] | null
  serasa_consultas_qtd: number | null
  serasa_fonte: string | null
  estrutura_societaria: EstruturaSocietaria | null
  identificacao: Record<string, unknown> | null
  enquadramento: Record<string, unknown> | null
  resseguro: Record<string, unknown>[] | null
  score_memoria: Record<string, unknown> | null
  linha_tempo: Record<string, unknown>[] | null
  caixa_estoque: Record<string, unknown> | null
  limite_base: string | null
  limite_perc: number | string | null
  base_df: string | null
  base_df_obs: string | null
  unidade: string | null
}

/** O Postgres devolve `numeric` como string. Converter sem inventar zero. */
const num = (v: number | string | null): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const curto = (s: string, n = 150) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

/** A frase da análise já diz o que este tipo de limite é? Serve para não
 *  escrever "R$ 80.000.000,00 (Teto FAM) (teto da FAM)", que foi o que
 *  apareceu na tela da Engie: a análise já tinha dito, e o rótulo repetiu. */
function jaDizOTipo(txt: string, tipo: string): boolean {
  const t = txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (tipo === 'teto') return t.includes('teto')
  if (tipo === 'teorico') return t.includes('teorico')
  if (tipo === 'sem_limite') return t.includes('sem limite')
  return false
}

/**
 * A análise vigente deste tomador, inteira. `null` quando não há nenhuma.
 * Nunca lança: falha de rede devolve `null` e a Mesa mostra as gavetas vazias
 * em vez de quebrar.
 *
 * @param tomadorId  usado primeiro, quando a coluna já estiver preenchida
 * @param cnpj       o caminho que funciona hoje
 */
export async function fichaDaAnalise(
  tomadorId: string | null | undefined,
  cnpj: string | null | undefined,
): Promise<FichaAnalise | null> {
  const chave = soDigitos(cnpj)
  if (!tomadorId && chave.length !== 14) return null

  try {
    const supabase = createClient()

    // 1º por tomador_id (o dia em que o saneamento rodar, isto passa a valer),
    // 2º por CNPJ (o que funciona hoje).
    let linha: LinhaCrua | null = null

    if (tomadorId) {
      const { data } = await supabase
        .from('analises').select(COLUNAS)
        .eq('tomador_id', tomadorId).eq('vigente', true).maybeSingle()
      linha = (data as LinhaCrua | null) ?? null
    }
    if (!linha && chave.length === 14) {
      const { data } = await supabase
        .from('analises').select(COLUNAS)
        .eq('cnpj', chave).eq('vigente', true).maybeSingle()
      linha = (data as LinhaCrua | null) ?? null
    }
    if (!linha) return null
    return montarFicha(supabase, linha)
  } catch {
    return null
  }
}

/**
 * A análise de um `id`, VIGENTE OU NÃO, e sem precisar de tomador.
 *
 * É a porta do acervo (`/analises/<id>`): existe análise que nenhum tomador do
 * CRM alcança (CNPJ que não casa com cadastro nenhum, ou CNPJ que a análise
 * nem apurou), e existe versão antiga que continua valendo como histórico.
 * `fichaDaAnalise` não serve para isso porque ela procura sempre a vigente de
 * um tomador — o que, por definição, deixa essas duas de fora.
 */
export async function fichaPorId(id: string): Promise<FichaAnalise | null> {
  if (!id) return null
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('analises').select(COLUNAS).eq('id', id).maybeSingle()
    const linha = (data as LinhaCrua | null) ?? null
    if (!linha) return null
    return montarFicha(supabase, linha)
  } catch {
    return null
  }
}

/** O corpo comum: dada a linha de `analises`, busca os filhos e monta a ficha.
 *  Nunca lança, pela mesma razão das duas portas acima. */
async function montarFicha(
  supabase: ReturnType<typeof createClient>,
  linha: LinhaCrua,
): Promise<FichaAnalise | null> {
  try {
    // ── O LIMITE. A trava de `banco.ts`, repetida de propósito ──────────
    // O motivo manda: quando ele existe, a carga ANULOU o número, e o campo
    // sai como aviso escrito, jamais como valor confirmado. Um tipo novo que
    // este arquivo não conheça também cai no aviso: errar para o lado de
    // desconfiar custa um susto, errar para o outro custa dinheiro.
    const anulado = !!linha.limite_recomendado_motivo
    const limiteNum = anulado ? null : num(linha.limite_recomendado_num)
    const tipo = linha.limite_recomendado_tipo ?? 'vazio'

    let limiteAviso = ''
    if (limiteNum === null) {
      if (anulado) {
        limiteAviso = `Sem número confiável. ${linha.limite_recomendado_motivo}`
          + (linha.limite_recomendado_txt
            ? ` A análise escreveu: “${curto(linha.limite_recomendado_txt)}”` : '')
      } else if (linha.limite_recomendado_txt) {
        const frase = curto(semEntidadesHtml(linha.limite_recomendado_txt))
        limiteAviso = frase
          + (AVISO_TIPO[tipo] && !jaDizOTipo(frase, tipo) ? ` (${AVISO_TIPO[tipo]})` : '')
      } else {
        limiteAviso = 'A análise não registrou limite.'
      }
    }

    // Os filhos vão juntos: duas idas ao banco em paralelo, não em fila.
    const [{ data: exs }, { data: docs }] = await Promise.all([
      supabase.from('analise_exercicios')
        .select('rotulo, exercicio, base, ativo_total, ativo_circulante, passivo_circulante, exigivel_total, patrimonio_liquido, receita_operacional, ebitda, lucro_liquido, caixa, estoques')
        .eq('analise_id', linha.id)
        .order('rotulo', { ascending: false }),
      supabase.from('analise_documentos')
        .select('nome, bytes, hash16')
        .eq('analise_id', linha.id)
        .order('nome'),
    ])

    // O Serasa só existe quando a análise registrou ALGUMA coisa. Bloco todo
    // nulo vira `null`, e a gaveta diz que a análise não trouxe Serasa, em vez
    // de desenhar uma ficha de campos vazios.
    const temSerasa = linha.serasa_score !== null || !!linha.serasa_risco
      || !!linha.serasa_interpretacao || !!linha.serasa_limite_txt
      || (linha.serasa_consultas?.length ?? 0) > 0
    const serasa: SerasaFicha | null = temSerasa ? {
      score: linha.serasa_score,
      risco: linha.serasa_risco,
      interpretacao: linha.serasa_interpretacao,
      prob: linha.serasa_prob,
      limite_txt: linha.serasa_limite_txt,
      limite_num: num(linha.serasa_limite_num),
      pefin: linha.serasa_pefin,
      protestos: linha.serasa_protestos,
      acoes: linha.serasa_acoes,
      recuperacao: linha.serasa_recuperacao,
      consultas: linha.serasa_consultas ?? [],
      consultas_qtd: linha.serasa_consultas_qtd,
      fonte: linha.serasa_fonte,
    } : null

    type ExCrua = Record<keyof ExercicioFicha, string | number | null>
    const exercicios: ExercicioFicha[] = ((exs ?? []) as unknown as ExCrua[]).map(e => ({
      rotulo: String(e.rotulo ?? ''),
      exercicio: e.exercicio === null ? null : Number(e.exercicio),
      base: (e.base as string | null) ?? null,
      ativo_total: num(e.ativo_total as number | string | null),
      ativo_circulante: num(e.ativo_circulante as number | string | null),
      passivo_circulante: num(e.passivo_circulante as number | string | null),
      exigivel_total: num(e.exigivel_total as number | string | null),
      patrimonio_liquido: num(e.patrimonio_liquido as number | string | null),
      receita_operacional: num(e.receita_operacional as number | string | null),
      ebitda: num(e.ebitda as number | string | null),
      lucro_liquido: num(e.lucro_liquido as number | string | null),
      caixa: num(e.caixa as number | string | null),
      estoques: num(e.estoques as number | string | null),
    }))

    return {
      id: linha.id,
      chave_local: linha.chave_local,
      data_analise: linha.data_analise,
      revisada: !!linha.revisada,
      versao: linha.versao ?? 1,
      vigente: !!linha.vigente,

      cnpj: linha.cnpj,
      tomador_id: linha.tomador_id,
      // Mesma limpeza da razao social: e tudo texto do mesmo relatorio HTML,
      // e proteger um campo e deixar o vizinho de fora e so esperar a vez.
      corretora: semMarcador(linha.corretora ? semEntidadesHtml(linha.corretora) : null),

      razao_social: semEntidadesHtml(linha.razao_social),
      nome_curto: linha.nome_curto ? semEntidadesHtml(linha.nome_curto) : null,
      grupo: semMarcador(linha.grupo ? semEntidadesHtml(linha.grupo) : null),
      segmento: linha.segmento,
      setor: linha.setor,

      score_final: num(linha.score_final),
      classe: linha.classe,
      porte: linha.porte,
      rating_txt: linha.rating_txt,
      rating_cod: linha.rating_cod,
      nivel_risco: linha.nivel_risco,
      recomendacao: linha.recomendacao,

      limiteNum,
      limiteAviso,
      limite_recomendado_txt: linha.limite_recomendado_txt,

      taxa_tradicional: num(linha.taxa_tradicional),
      taxa_judicial: num(linha.taxa_judicial),
      taxa_estruturada: num(linha.taxa_estruturada),

      condicoes: linha.condicoes,
      conclusao: linha.conclusao,
      pontos_positivos: linha.pontos_positivos ?? [],
      pontos_atencao: linha.pontos_atencao ?? [],
      tres_cs: linha.tres_cs,
      serasa,
      estrutura: linha.estrutura_societaria?.entidades?.length ? linha.estrutura_societaria : null,

      // ── o resto do relatório ──────────────────────────────────────────
      identificacao: leIdentificacao(linha.identificacao),
      enquadramento: leEnquadramento(linha.enquadramento),
      resseguro: leResseguro(linha.resseguro),
      scoreMemoria: leScoreMemoria(linha.score_memoria),
      linhaTempo: leLinhaTempo(linha.linha_tempo),
      caixaEstoque: leCaixaEstoque(linha.caixa_estoque),
      limite_base: semMarcador(linha.limite_base),
      limite_perc: numeroOuNulo(linha.limite_perc),
      base_df: semMarcador(linha.base_df),
      base_df_obs: semMarcador(linha.base_df_obs),
      unidade: semMarcador(linha.unidade),

      exercicios,
      documentos: (docs ?? []) as DocumentoFicha[],
    }
  } catch {
    return null
  }
}
