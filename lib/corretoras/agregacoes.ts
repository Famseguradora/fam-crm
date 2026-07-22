// ============================================================
//  Motor de agregação da cadeia Corretora → Tomador → Operação.
//  Funções PURAS (sem I/O) — usadas pelo Painel Gerencial de Corretoras,
//  e reaproveitáveis no futuro Estúdio de Análises (E2).
//
//  Regras de negócio replicadas do painel:
//   - LMG sempre limitado a R$ 80M por operação (CAP_LMG).
//   - premio_previsto já vem limitado da origem (soma direta).
//   - taxa média ponderada por min(lmg,80M) × min(vigencia_anos,1).
// ============================================================
import { CAP_LMG } from '@/lib/operacoes/kpis'
import type { Corretora, Tomador, Operacao, StatusFluxo } from '@/types'

// Subconjuntos mínimos de campos que as agregações realmente usam — mantém as
// funções desacopladas do shape exato vindo do banco/joins.
export type OpAgg = Pick<
  Operacao,
  'id' | 'tomador_id' | 'corretora_id' | 'lmg' | 'taxa' | 'vigencia_anos' |
  'vigencia_dias' | 'periodicidade_vigencia' |
  'premio_previsto' | 'status' | 'data_entrada' | 'data_emissao' | 'modalidade' | 'estado'
>
export type TomAgg = Pick<Tomador, 'id' | 'razao_social' | 'nome_fantasia' | 'corretora_id' | 'status'>
export type CorAgg = Pick<Corretora, 'id' | 'razao_social' | 'nome_fantasia' | 'status'>

const capLmg = (lmg: number | null | undefined) => Math.min(Number(lmg) || 0, CAP_LMG)

// Vigência em ANOS — réplica fiel de `anosVig()` da tela de Operações
// (app/(dashboard)/operacoes/page.tsx). Respeita vigencia_dias e a
// periodicidade (Meses → /12, Dias/Data → /365); sem isso a taxa média
// ponderada do painel diverge da de Operações.
export function anosVigencia(o: Pick<OpAgg, 'vigencia_dias' | 'vigencia_anos' | 'periodicidade_vigencia'>): number {
  if (o.vigencia_dias != null) return Number(o.vigencia_dias) / 365
  const v = Number(o.vigencia_anos ?? 1)
  const p = o.periodicidade_vigencia
  if (p === 'Meses') return v / 12
  if (p === 'Dias' || p === 'Data') return v / 365
  return v
}

// Taxa média ponderada de um conjunto de operações — mesma fórmula de Operações:
// Σ(taxa × min(lmg,80M) × min(anosVig,1)) ÷ Σ min(lmg,80M).
export function taxaMediaPonderada(ops: OpAgg[]): number {
  let numer = 0
  let denom = 0
  for (const o of ops) {
    const peso = capLmg(o.lmg) * Math.min(anosVigencia(o), 1)
    numer += (Number(o.taxa) || 0) * peso
    denom += capLmg(o.lmg)
  }
  return denom > 0 ? numer / denom : 0
}

// ── KPIs de um conjunto de operações ────────────────────────────────────────
export interface KpisOperacoes {
  nOperacoes: number
  premioTotal: number
  lmgTotal: number
  ticketMedio: number
  taxaMediaPond: number
}

export function kpisDeOperacoes(ops: OpAgg[]): KpisOperacoes {
  const premioTotal = ops.reduce((s, o) => s + (Number(o.premio_previsto) || 0), 0)
  const lmgTotal = ops.reduce((s, o) => s + capLmg(o.lmg), 0)
  return {
    nOperacoes: ops.length,
    premioTotal,
    lmgTotal,
    ticketMedio: ops.length > 0 ? premioTotal / ops.length : 0,
    taxaMediaPond: taxaMediaPonderada(ops),
  }
}

// ── Agregação por corretora (linha do ranking / Panorama) ───────────────────
export interface CorretoraAgg extends KpisOperacoes {
  id: string
  nome: string
  ativa: boolean
  nTomadores: number
  // Preenchidos por `comParticipacao` / `comPareto`:
  participacaoPct?: number   // fração 0..1 do prêmio sobre o total
  acumuladoPct?: number      // fração 0..1 acumulada (curva de Pareto)
}

export function agregarPorCorretora(
  corretoras: CorAgg[],
  tomadores: TomAgg[],
  operacoes: OpAgg[],
): CorretoraAgg[] {
  const tomPorCorretora = new Map<string, number>()
  for (const t of tomadores) {
    if (!t.corretora_id) continue
    tomPorCorretora.set(t.corretora_id, (tomPorCorretora.get(t.corretora_id) ?? 0) + 1)
  }
  const opsPorCorretora = new Map<string, OpAgg[]>()
  for (const o of operacoes) {
    if (!o.corretora_id) continue
    const arr = opsPorCorretora.get(o.corretora_id) ?? []
    arr.push(o)
    opsPorCorretora.set(o.corretora_id, arr)
  }
  return corretoras.map((c) => {
    const ops = opsPorCorretora.get(c.id) ?? []
    return {
      id: c.id,
      nome: c.nome_fantasia || c.razao_social,
      ativa: c.status === 'ativo',
      nTomadores: tomPorCorretora.get(c.id) ?? 0,
      ...kpisDeOperacoes(ops),
    }
  })
}

// ── Participação (share) e Pareto ───────────────────────────────────────────
// Adiciona participacaoPct (sobre o prêmio total) a cada item.
export function comParticipacao<T extends { premioTotal: number }>(itens: T[]): (T & { participacaoPct: number })[] {
  const total = itens.reduce((s, i) => s + i.premioTotal, 0)
  return itens.map((i) => ({ ...i, participacaoPct: total > 0 ? i.premioTotal / total : 0 }))
}

// Ordena desc por prêmio e adiciona participacaoPct + acumuladoPct (curva 80/20).
export function comPareto(itens: CorretoraAgg[]): CorretoraAgg[] {
  const total = itens.reduce((s, i) => s + i.premioTotal, 0)
  const ordenado = [...itens].sort((a, b) => b.premioTotal - a.premioTotal)
  let acumulado = 0
  return ordenado.map((i) => {
    acumulado += i.premioTotal
    return {
      ...i,
      participacaoPct: total > 0 ? i.premioTotal / total : 0,
      acumuladoPct: total > 0 ? acumulado / total : 0,
    }
  })
}

// ── Ranking de tomadores dentro de uma corretora ────────────────────────────
export interface TomadorAgg {
  id: string
  nome: string
  status: string
  nOperacoes: number
  premioTotal: number
  lmgTotal: number
}

export function rankingTomadores(tomadores: TomAgg[], operacoes: OpAgg[]): TomadorAgg[] {
  const opsPorTomador = new Map<string, OpAgg[]>()
  for (const o of operacoes) {
    if (!o.tomador_id) continue
    const arr = opsPorTomador.get(o.tomador_id) ?? []
    arr.push(o)
    opsPorTomador.set(o.tomador_id, arr)
  }
  return tomadores
    .map((t) => {
      const ops = opsPorTomador.get(t.id) ?? []
      return {
        id: t.id,
        nome: t.nome_fantasia || t.razao_social,
        status: t.status,
        nOperacoes: ops.length,
        premioTotal: ops.reduce((s, o) => s + (Number(o.premio_previsto) || 0), 0),
        lmgTotal: ops.reduce((s, o) => s + capLmg(o.lmg), 0),
      }
    })
    .sort((a, b) => b.premioTotal - a.premioTotal)
}

// ── Distribuição por status (donut) ─────────────────────────────────────────
export interface FatiaStatus { name: string; value: number; premio: number; cor: string }

// Agrupa operações por status. As cores vêm de status_fluxo_operacao (dinâmico);
// status sem cor cadastrada caem num cinza padrão.
export function distribuicaoPorStatus(operacoes: OpAgg[], statusFluxo: Pick<StatusFluxo, 'nome' | 'cor'>[]): FatiaStatus[] {
  const corPorNome = new Map(statusFluxo.map((s) => [s.nome, s.cor]))
  const acc = new Map<string, { value: number; premio: number }>()
  for (const o of operacoes) {
    const nome = o.status || 'Sem status'
    const cur = acc.get(nome) ?? { value: 0, premio: 0 }
    cur.value += 1
    cur.premio += Number(o.premio_previsto) || 0
    acc.set(nome, cur)
  }
  return [...acc.entries()].map(([name, v]) => ({
    name,
    value: v.value,
    premio: v.premio,
    cor: corPorNome.get(name) ?? '#94a3b8',
  }))
}

// ── Evolução mensal (histórico) ─────────────────────────────────────────────
export interface PontoMensal { mes: string; label: string; qtd: number; premio: number }

// Série mensal de qtd de operações e prêmio. Usa data_emissao quando existir
// (operação materializada) senão data_entrada. Ordenado cronologicamente.
export function evolucaoMensal(operacoes: OpAgg[]): PontoMensal[] {
  const acc = new Map<string, { qtd: number; premio: number }>()
  for (const o of operacoes) {
    const iso = o.data_emissao || o.data_entrada
    if (!iso) continue
    const mes = String(iso).slice(0, 7) // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(mes)) continue
    const cur = acc.get(mes) ?? { qtd: 0, premio: 0 }
    cur.qtd += 1
    cur.premio += Number(o.premio_previsto) || 0
    acc.set(mes, cur)
  }
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return [...acc.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, v]) => {
      const m = Number(mes.slice(5, 7)) - 1
      return { mes, label: `${MESES[m] ?? mes}/${mes.slice(2, 4)}`, qtd: v.qtd, premio: v.premio }
    })
}

// Lista ordenada (asc) dos meses YYYY-MM presentes nas operações — eixo comum
// para o slicer mensal e para alinhar sparklines de diferentes corretoras.
export function mesesDisponiveis(operacoes: OpAgg[]): string[] {
  const set = new Set<string>()
  for (const o of operacoes) {
    const iso = o.data_emissao || o.data_entrada
    const mes = iso ? String(iso).slice(0, 7) : ''
    if (/^\d{4}-\d{2}$/.test(mes)) set.add(mes)
  }
  return [...set].sort()
}

// Rótulo curto de um mês YYYY-MM → "jun/26".
export function rotuloMes(mes: string): string {
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const m = Number(mes.slice(5, 7)) - 1
  return `${MESES[m] ?? mes}/${mes.slice(2, 4)}`
}

// Série de prêmio por mês, alinhada a uma lista fixa de meses (0 onde não há
// operação). Usada nos sparklines para que todas as corretoras compartilhem eixo.
export function serieMensalAlinhada(operacoes: OpAgg[], meses: string[]): number[] {
  const acc = new Map<string, number>()
  for (const o of operacoes) {
    const iso = o.data_emissao || o.data_entrada
    const mes = iso ? String(iso).slice(0, 7) : ''
    if (!/^\d{4}-\d{2}$/.test(mes)) continue
    acc.set(mes, (acc.get(mes) ?? 0) + (Number(o.premio_previsto) || 0))
  }
  return meses.map((m) => acc.get(m) ?? 0)
}

// ── Séries mensais para os mini-gráficos dos cards de KPI ────────────────────
// Uma série por métrica (LMG, nº de operações, nº de tomadores distintos, taxa
// média ponderada), alinhada a `meses` (0 onde não há operação). Pura: respeita
// o recorte já aplicado em `ops` (cross-filter de status/UF/corretora).
export interface SeriesMiniMetrica { lmg: number[]; operacoes: number[]; tomadores: number[]; taxa: number[] }
export function seriesMiniPorMetrica(ops: OpAgg[], meses: string[]): SeriesMiniMetrica {
  const idx = new Map(meses.map((m, i) => [m, i]))
  const lmg: number[] = new Array(meses.length).fill(0)
  const operacoes: number[] = new Array(meses.length).fill(0)
  const tomSets: Set<string>[] = meses.map(() => new Set<string>())
  const opsPorMes: OpAgg[][] = meses.map(() => [])
  for (const o of ops) {
    const i = idx.get(mesDeOperacao(o))
    if (i === undefined) continue
    lmg[i] += capLmg(o.lmg)
    operacoes[i] += 1
    if (o.tomador_id) tomSets[i].add(o.tomador_id)
    opsPorMes[i].push(o)
  }
  return {
    lmg,
    operacoes,
    tomadores: tomSets.map((s) => s.size),
    taxa: opsPorMes.map((a) => taxaMediaPonderada(a)),
  }
}

// Delta do último mês vs o penúltimo (para o selo ▲/▼ nos KPIs).
export interface DeltaMensal { atual: number; anterior: number; variacao: number | null }
export function deltaUltimoMes(operacoes: OpAgg[]): DeltaMensal {
  const serie = evolucaoMensal(operacoes)
  if (serie.length === 0) return { atual: 0, anterior: 0, variacao: null }
  const atual = serie[serie.length - 1].premio
  const anterior = serie.length > 1 ? serie[serie.length - 2].premio : 0
  const variacao = anterior > 0 ? (atual - anterior) / anterior : null
  return { atual, anterior, variacao }
}

// ── Fluxo Sankey (Corretora → Tomadores → Status) ───────────────────────────
export interface SankeyNode { name: string }
export interface SankeyLink { source: number; target: number; value: number }
export interface FluxoSankeyData { nodes: SankeyNode[]; links: SankeyLink[] }

// Monta os nós/links do prêmio fluindo da corretora para cada tomador e de cada
// tomador para o status das suas operações. Links de valor 0 são descartados
// (o Sankey do recharts não aceita valor não-positivo). Retorna null se não há
// prêmio para desenhar (o componente cai no fallback de árvore).
export function montarFluxoSankey(
  corretoraNome: string,
  tomadores: TomAgg[],
  operacoes: OpAgg[],
): FluxoSankeyData | null {
  const nodes: SankeyNode[] = [{ name: corretoraNome }]
  const corIdx = 0
  const links: SankeyLink[] = []

  const tomNodeIdx = new Map<string, number>()
  const statusNodeIdx = new Map<string, number>()
  const idxTomador = (t: TomAgg) => {
    if (!tomNodeIdx.has(t.id)) {
      nodes.push({ name: t.nome_fantasia || t.razao_social })
      tomNodeIdx.set(t.id, nodes.length - 1)
    }
    return tomNodeIdx.get(t.id)!
  }
  const idxStatus = (status: string) => {
    if (!statusNodeIdx.has(status)) {
      nodes.push({ name: status })
      statusNodeIdx.set(status, nodes.length - 1)
    }
    return statusNodeIdx.get(status)!
  }

  const tomById = new Map(tomadores.map((t) => [t.id, t]))
  // Acumula prêmio corretora→tomador e tomador→status.
  const corTom = new Map<number, number>()
  const tomStat = new Map<string, number>() // chave "tomIdx|statIdx"

  for (const o of operacoes) {
    const premio = Number(o.premio_previsto) || 0
    if (premio <= 0 || !o.tomador_id) continue
    const t = tomById.get(o.tomador_id)
    if (!t) continue
    const ti = idxTomador(t)
    const si = idxStatus(o.status || 'Sem status')
    corTom.set(ti, (corTom.get(ti) ?? 0) + premio)
    const key = `${ti}|${si}`
    tomStat.set(key, (tomStat.get(key) ?? 0) + premio)
  }

  for (const [ti, value] of corTom) links.push({ source: corIdx, target: ti, value })
  for (const [key, value] of tomStat) {
    const [ti, si] = key.split('|').map(Number)
    links.push({ source: ti, target: si, value })
  }

  if (links.length === 0) return null
  return { nodes, links }
}

// ── Desfecho das operações por corretora ─────────────────────────────────────
// Responde "que qualidade de negócio esta corretora traz?": do que ela apresentou,
// quanto EMITIU (ganhou), quanto foi PERDIDO, quanto foi RECUSADO e quanto ainda
// está EM ANDAMENTO. Usa a carteira INTEIRA (todos os status) — é justamente a
// análise que o funil ativo deixa de fora.
export interface Desfecho { n: number; premio: number }
export interface DesfechoCorretora {
  id: string
  nome: string
  total: number
  emitidas: Desfecho
  perdidas: Desfecho
  recusadas: Desfecho
  andamento: Desfecho
  /** Aproveitamento: emitidas ÷ (emitidas + perdidas + recusadas). 0..1 */
  conversao: number
  /** Total decidido (emitidas + perdidas + recusadas) — base da conversão. */
  decididas: number
}

export const ehEmitida = (s: string | null | undefined) => (s || '').toLowerCase().includes('emiti')
export const ehPerdida = (s: string | null | undefined) => (s || '').toLowerCase().startsWith('perdid')
export const ehRecusada = (s: string | null | undefined) => (s || '').toLowerCase().startsWith('recusad')

export function desfechoPorCorretora(corretoras: CorAgg[], operacoes: OpAgg[]): DesfechoCorretora[] {
  const vazio = (): Desfecho => ({ n: 0, premio: 0 })
  const acc = new Map<string, DesfechoCorretora>()
  for (const c of corretoras) {
    acc.set(c.id, {
      id: c.id, nome: c.nome_fantasia || c.razao_social, total: 0,
      emitidas: vazio(), perdidas: vazio(), recusadas: vazio(), andamento: vazio(),
      conversao: 0, decididas: 0,
    })
  }
  for (const o of operacoes) {
    if (!o.corretora_id) continue
    const d = acc.get(o.corretora_id)
    if (!d) continue
    const premio = Number(o.premio_previsto) || 0
    const alvo = ehEmitida(o.status) ? d.emitidas
      : ehPerdida(o.status) ? d.perdidas
      : ehRecusada(o.status) ? d.recusadas
      : d.andamento
    alvo.n += 1
    alvo.premio += premio
    d.total += 1
  }
  return [...acc.values()]
    .map((d) => {
      const decididas = d.emitidas.n + d.perdidas.n + d.recusadas.n
      return { ...d, decididas, conversao: decididas > 0 ? d.emitidas.n / decididas : 0 }
    })
    .filter((d) => d.total > 0)
    .sort((a, b) => b.emitidas.premio - a.emitidas.premio || b.total - a.total)
}

// ── Período (intervalo de meses YYYY-MM) ─────────────────────────────────────
// Mês de referência de uma operação (data_emissao senão data_entrada). '' = sem data.
export function mesDeOperacao(o: OpAgg): string {
  const iso = o.data_emissao || o.data_entrada
  const mes = iso ? String(iso).slice(0, 7) : ''
  return /^\d{4}-\d{2}$/.test(mes) ? mes : ''
}

// Filtra operações por intervalo [ini, fim] de meses (YYYY-MM). Limite vazio = aberto.
// Operações sem data ficam DE FORA quando há qualquer limite (não dá p/ situá-las no tempo).
export function filtrarPorPeriodo(ops: OpAgg[], ini: string, fim: string): OpAgg[] {
  if (!ini && !fim) return ops
  return ops.filter((o) => {
    const m = mesDeOperacao(o)
    if (!m) return false
    if (ini && m < ini) return false
    if (fim && m > fim) return false
    return true
  })
}

// ── Operações de um tomador (folha da cadeia vertical) ───────────────────────
export function operacoesDoTomador(ops: OpAgg[], tomadorId: string): OpAgg[] {
  return ops.filter((o) => o.tomador_id === tomadorId)
}

// ── Taxa de conversão (% de operações emitidas) ──────────────────────────────
// Considera "emitida" qualquer status que contenha "emiti" (Emitido/Emitida).
export function taxaConversao(ops: OpAgg[]): number {
  if (ops.length === 0) return 0
  const emitidas = ops.filter((o) => (o.status || '').toLowerCase().includes('emiti')).length
  return emitidas / ops.length
}

// ── Matriz Corretora × Mês (heatmap de prêmio) ───────────────────────────────
export interface MatrizLinha { id: string; nome: string; valores: number[]; total: number }
export interface MatrizCorretoraMes { meses: string[]; linhas: MatrizLinha[]; maxCelula: number }

// Linhas = corretoras (só as com prêmio, ordenadas desc), colunas = meses (na ordem dada),
// célula = soma do prêmio no mês. maxCelula serve para calcular a intensidade da cor.
export function matrizCorretoraMes(corretoras: CorAgg[], operacoes: OpAgg[], meses: string[]): MatrizCorretoraMes {
  const idx = new Map(meses.map((m, i) => [m, i]))
  const porCor = new Map<string, number[]>()
  for (const c of corretoras) porCor.set(c.id, new Array(meses.length).fill(0))
  for (const o of operacoes) {
    if (!o.corretora_id) continue
    const arr = porCor.get(o.corretora_id)
    if (!arr) continue
    const i = idx.get(mesDeOperacao(o))
    if (i === undefined) continue
    arr[i] += Number(o.premio_previsto) || 0
  }
  let maxCelula = 0
  const linhas: MatrizLinha[] = corretoras
    .map((c) => {
      const valores = porCor.get(c.id) ?? new Array(meses.length).fill(0)
      const total = valores.reduce((s, v) => s + v, 0)
      for (const v of valores) if (v > maxCelula) maxCelula = v
      return { id: c.id, nome: c.nome_fantasia || c.razao_social, valores, total }
    })
    .filter((l) => l.total > 0)
    .sort((a, b) => b.total - a.total)
  return { meses, linhas, maxCelula: maxCelula || 1 }
}

// ── Série temporal (mensal ou semanal) — prêmio ou LMG ───────────────────────
export type Granularidade = 'mensal' | 'semanal'
export type MetricaSerie = 'premio' | 'lmg'
export interface PontoSerie { chave: string; label: string; valor: number }

// Semana ISO 8601 (segunda a domingo) + data de início da semana de uma data.
function semanaISO(iso: string): { chave: string; label: string } {
  const dt = new Date(iso.slice(0, 10) + 'T00:00:00')
  const u = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()))
  const dia = (u.getUTCDay() + 6) % 7 // 0 = segunda
  const inicio = new Date(u); inicio.setUTCDate(u.getUTCDate() - dia)
  const quinta = new Date(u); quinta.setUTCDate(u.getUTCDate() - dia + 3)
  const ano = quinta.getUTCFullYear()
  const jan1 = new Date(Date.UTC(ano, 0, 1))
  const semana = Math.floor((quinta.getTime() - jan1.getTime()) / 86400000 / 7) + 1
  const label = `${String(inicio.getUTCDate()).padStart(2, '0')}/${String(inicio.getUTCMonth() + 1).padStart(2, '0')}`
  return { chave: `${ano}-W${String(semana).padStart(2, '0')}`, label }
}

// Agrupa operações por mês ou semana, somando prêmio (já capado na origem) ou
// LMG (capado a 80M). Usa data_emissao senão data_entrada. Ordenado no tempo.
export function serieTemporal(ops: OpAgg[], gran: Granularidade, metrica: MetricaSerie): PontoSerie[] {
  const acc = new Map<string, { label: string; valor: number }>()
  for (const o of ops) {
    const iso = o.data_emissao || o.data_entrada
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) continue
    const val = metrica === 'lmg' ? capLmg(o.lmg) : (Number(o.premio_previsto) || 0)
    let chave: string, label: string
    if (gran === 'mensal') {
      chave = String(iso).slice(0, 7)
      label = rotuloMes(chave)
    } else {
      const s = semanaISO(String(iso))
      chave = s.chave
      label = s.label
    }
    const cur = acc.get(chave) ?? { label, valor: 0 }
    cur.valor += val
    acc.set(chave, cur)
  }
  return [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([chave, v]) => ({ chave, label: v.label, valor: v.valor }))
}
