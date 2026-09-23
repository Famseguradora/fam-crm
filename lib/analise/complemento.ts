// ============================================================================
//  A ANÁLISE COMPLEMENTAR  ·  o formato e as contas
//
//  Pedido do Marco em 17/09/2026: "as análises na grande maioria das vezes têm
//  que ter complemento". O tomador já analisado manda documento novo (o
//  balancete de 2026) e a pergunta é uma só: a empresa manteve o rumo que a
//  análise enxergou, ou mudou?
//
//  QUEM FAZ O QUÊ, e a regra é a mesma da IA Gestor:
//    a IA ......... LÊ os documentos novos, tira os números deles e escreve a
//                   leitura qualitativa, contra a análise anterior;
//    este arquivo . FAZ AS CONTAS: variação, anualização, liquidez,
//                   endividamento, margem. Número que diretor lê não sai de
//                   dentro do modelo.
//
//  Os exercícios anteriores vêm do banco (`analise_exercicios`, já em reais),
//  e não da IA: ela não redigita número que o CRM já tem.
// ============================================================================

import type { ExercicioFicha } from './ficha'

/** As dez contas da análise, as mesmas colunas de `analise_exercicios`. */
export const CONTAS = [
  'ativo_total', 'ativo_circulante', 'passivo_circulante', 'exigivel_total',
  'patrimonio_liquido', 'receita_operacional', 'ebitda', 'lucro_liquido', 'caixa', 'estoques',
] as const
export type Conta = typeof CONTAS[number]

export const NOME_CONTA: Record<Conta, string> = {
  ativo_total: 'Ativo total',
  ativo_circulante: 'Ativo circulante',
  passivo_circulante: 'Passivo circulante',
  exigivel_total: 'Exigível total',
  patrimonio_liquido: 'Patrimônio líquido',
  receita_operacional: 'Receita operacional',
  ebitda: 'EBITDA',
  lucro_liquido: 'Lucro líquido',
  caixa: 'Caixa',
  estoques: 'Estoques',
}

/** Conta de resultado se acumula no período: balancete de 6 meses tem meia
 *  receita. Para comparar com o exercício fechado, anualiza. Saldo não. */
export const FLUXO: Conta[] = ['receita_operacional', 'ebitda', 'lucro_liquido']

export type Veredito = 'mantem' | 'melhora' | 'piora' | 'mudou_de_rumo' | 'inconclusivo'
export type AcaoRecomendada = 'manter' | 'revisar_limite' | 'reduzir_limite' | 'ampliar_limite' | 'suspender' | 'pedir_documentos'

export const NOME_VEREDITO: Record<Veredito, string> = {
  mantem: 'Manteve o rumo',
  melhora: 'Melhorou',
  piora: 'Piorou',
  mudou_de_rumo: 'Mudou de rumo',
  inconclusivo: 'Inconclusivo',
}

export const NOME_ACAO: Record<AcaoRecomendada, string> = {
  manter: 'Manter a análise',
  revisar_limite: 'Revisar o limite',
  reduzir_limite: 'Reduzir o limite',
  ampliar_limite: 'Ampliar o limite',
  suspender: 'Suspender novas emissões',
  pedir_documentos: 'Pedir documentos',
}

/** Um período que a IA leu nos documentos novos. */
export interface PeriodoLido {
  rotulo: string
  /** AAAA-MM-DD, o último dia do período. */
  data_base: string | null
  /** Quantos meses o resultado acumula (1 a 12). */
  meses: number | null
  tipo: 'balancete' | 'balanco' | 'dre' | 'outro'
  auditado: boolean | null
  arquivo: string | null
  base: string | null
  valores: Partial<Record<Conta, number | null>>
}

export interface DocumentoLido {
  arquivo: string
  tipo: string
  periodo: string | null
  assinado: boolean | null
  consistencia: 'ok' | 'atencao' | 'problema'
  observacao: string
}

/** O que a IA devolve. Validado por `normalizarResultado` antes de gravar. */
export interface ResultadoComplemento {
  veredito: Veredito
  titulo: string
  resumo: string
  recomendacao: { acao: AcaoRecomendada; texto: string }
  periodos: PeriodoLido[]
  leitura_quantitativa: { tema: string; texto: string }[]
  confirma: string[]
  contradiz: string[]
  novos_riscos: string[]
  documentos: DocumentoLido[]
  pendencias: string[]
}

export interface ArquivoComplemento { nome: string; storage_path: string; bytes: number; anexo_id: string | null }

export interface Complemento {
  id: string
  analise_id: string
  tomador_id: string | null
  cnpj: string | null
  estado: 'pendente' | 'lendo' | 'pronta' | 'erro'
  instrucoes: string | null
  arquivos: ArquivoComplemento[]
  resultado: ResultadoComplemento | null
  mensagem: string | null
  erro: string | null
  segundos: number | null
  criado_por_nome: string | null
  criado_em: string
  pego_em: string | null
  concluido_em: string | null
}

// ── validação do que a IA escreveu ──────────────────────────────────────────

const txt = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const lst = (v: unknown, max = 12) => (Array.isArray(v) ? v.map(x => txt(x, 600)).filter(Boolean).slice(0, max) : [])
const bool = (v: unknown) => (typeof v === 'boolean' ? v : null)
function numero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(/\s/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}
const um = <T extends string>(v: unknown, ok: readonly T[], padrao: T): T =>
  (ok as readonly string[]).includes(String(v)) ? (v as T) : padrao

/** Recebe o JSON cru da IA e devolve o formato garantido, ou lança dizendo o
 *  que faltou. Um campo torto vira vazio; o que não dá para aceitar é não ter
 *  veredito nem resumo. */
export function normalizarResultado(cru: unknown): ResultadoComplemento {
  const r = (cru ?? {}) as Record<string, unknown>
  const resumo = txt(r.resumo, 3000)
  if (!resumo) throw new Error('A leitura veio sem resumo.')
  const rec = (r.recomendacao ?? {}) as Record<string, unknown>
  return {
    veredito: um(r.veredito, ['mantem', 'melhora', 'piora', 'mudou_de_rumo', 'inconclusivo'] as const, 'inconclusivo'),
    titulo: txt(r.titulo, 240),
    resumo,
    recomendacao: {
      acao: um(rec.acao, ['manter', 'revisar_limite', 'reduzir_limite', 'ampliar_limite', 'suspender', 'pedir_documentos'] as const, 'manter'),
      texto: txt(rec.texto, 1500),
    },
    periodos: (Array.isArray(r.periodos) ? r.periodos : []).slice(0, 8).map((p0) => {
      const p = (p0 ?? {}) as Record<string, unknown>
      const vals = (p.valores ?? {}) as Record<string, unknown>
      const valores: Partial<Record<Conta, number | null>> = {}
      for (const k of CONTAS) valores[k] = numero(vals[k])
      const meses = numero(p.meses)
      const data = txt(p.data_base, 10)
      return {
        rotulo: txt(p.rotulo, 40) || data || 'período',
        data_base: /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null,
        meses: meses !== null && meses >= 1 && meses <= 12 ? Math.round(meses) : null,
        tipo: um(p.tipo, ['balancete', 'balanco', 'dre', 'outro'] as const, 'outro'),
        auditado: bool(p.auditado),
        arquivo: txt(p.arquivo, 240) || null,
        base: txt(p.base, 240) || null,
        valores,
      }
    }),
    leitura_quantitativa: (Array.isArray(r.leitura_quantitativa) ? r.leitura_quantitativa : []).slice(0, 10).map((x0) => {
      const x = (x0 ?? {}) as Record<string, unknown>
      return { tema: txt(x.tema, 80), texto: txt(x.texto, 900) }
    }).filter(x => x.texto),
    confirma: lst(r.confirma),
    contradiz: lst(r.contradiz),
    novos_riscos: lst(r.novos_riscos),
    documentos: (Array.isArray(r.documentos) ? r.documentos : []).slice(0, 30).map((d0) => {
      const d = (d0 ?? {}) as Record<string, unknown>
      return {
        arquivo: txt(d.arquivo, 240),
        tipo: txt(d.tipo, 80),
        periodo: txt(d.periodo, 60) || null,
        assinado: bool(d.assinado),
        consistencia: um(d.consistencia, ['ok', 'atencao', 'problema'] as const, 'atencao'),
        observacao: txt(d.observacao, 600),
      }
    }).filter(d => d.arquivo),
    pendencias: lst(r.pendencias),
  }
}

// ── as contas ───────────────────────────────────────────────────────────────

/** Uma coluna da tabela no tempo: exercício fechado da análise ou período novo. */
export interface ColunaTempo {
  rotulo: string
  origem: 'analise' | 'complemento'
  meses: number
  parcial: boolean
  valores: Partial<Record<Conta, number | null>>
  /** Data para ordenar. */
  ordem: string
}

/** Os exercícios da análise anterior, do mais antigo ao mais novo, e os
 *  períodos novos depois, na ordem da data-base. */
export function linhaDoTempo(exercicios: ExercicioFicha[], periodos: PeriodoLido[]): ColunaTempo[] {
  const antigas: ColunaTempo[] = exercicios.map(e => ({
    rotulo: e.rotulo,
    origem: 'analise' as const,
    meses: 12,
    parcial: false,
    valores: Object.fromEntries(CONTAS.map(k => [k, e[k]])) as Partial<Record<Conta, number | null>>,
    ordem: `${e.exercicio ?? e.rotulo}-12-31`,
  }))
  const novas: ColunaTempo[] = periodos.map(p => ({
    rotulo: p.rotulo,
    origem: 'complemento' as const,
    meses: p.meses ?? 12,
    parcial: (p.meses ?? 12) < 12,
    valores: p.valores,
    ordem: p.data_base ?? '9999-12-31',
  }))
  return [...antigas, ...novas].sort((a, b) => a.ordem.localeCompare(b.ordem))
}

/** O valor comparável com um exercício fechado: resultado anualizado, saldo
 *  como está. Anualizar é linear (valor ÷ meses × 12), e a tela diz isso. */
export function comparavel(col: ColunaTempo, k: Conta): number | null {
  const v = col.valores[k]
  if (v === null || v === undefined) return null
  return FLUXO.includes(k) && col.meses < 12 ? (v / col.meses) * 12 : v
}

/** Variação percentual, ou null quando a base é zero, negativa ou falta.
 *  Base negativa (PL a descoberto) faz o sinal mentir, então não se calcula. */
export function variacao(de: number | null, para: number | null): number | null {
  if (de === null || para === null || de <= 0) return null
  return (para - de) / de
}

export interface Indices {
  liquidez_corrente: number | null
  endividamento: number | null
  margem_liquida: number | null
  margem_ebitda: number | null
}

const div = (a: number | null | undefined, b: number | null | undefined) =>
  a === null || a === undefined || b === null || b === undefined || b === 0 ? null : a / b

export function indices(col: ColunaTempo): Indices {
  const v = col.valores
  return {
    liquidez_corrente: div(v.ativo_circulante, v.passivo_circulante),
    // Exigível sobre PL. PL negativo não gera índice: o número sairia negativo e leria como "bom".
    endividamento: (v.patrimonio_liquido ?? 0) > 0 ? div(v.exigivel_total, v.patrimonio_liquido) : null,
    margem_liquida: div(v.lucro_liquido, v.receita_operacional),
    margem_ebitda: div(v.ebitda, v.receita_operacional),
  }
}

/** A comparação que abre a tela: o período novo mais recente contra o último
 *  exercício fechado da análise. */
export function comparacaoPrincipal(colunas: ColunaTempo[]) {
  const base = [...colunas].reverse().find(c => c.origem === 'analise') ?? null
  const novo = [...colunas].reverse().find(c => c.origem === 'complemento') ?? null
  return { base, novo }
}
