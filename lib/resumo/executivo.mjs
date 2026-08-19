// ============================================================================
//  Núcleo do Resumo Executivo Diário do FAM CRM ("Vigia FAM").
//
//  Lógica PURA (sem I/O, sem rede): recebe operações/corretoras/tomadores e
//  devolve um resumo estruturado do negócio (KPIs gerais, por status, top
//  corretoras e variação vs. mês anterior). É usada pelo runner agendado
//  (scripts/resumo-executivo.mjs) e foi escrita em JS puro (com JSDoc) para,
//  no futuro, poder ser importada direto pelo CRM.
//
//  IMPORTANTE — números batem 1:1 com os dashboards:
//  As fórmulas abaixo são CÓPIA VERBATIM de lib/corretoras/agregacoes.ts
//  (capLmg, taxaMediaPonderada, kpisDeOperacoes, agregarPorCorretora,
//  evolucaoMensal, deltaUltimoMes). O runner Node não consegue importar aquele
//  .ts (usa alias @/ e tipos), então replicamos aqui — mantendo o mesmo teto de
//  R$ 80M e a mesma taxa ponderada. Ao alterar a regra num lado, alterar no outro.
// ============================================================================

import { CAP_LMG, fmtBR } from '../financeiro/analise.mjs'

// ── Helpers de fórmula (espelham agregacoes.ts) ─────────────────────────────
const capLmg = (lmg) => Math.min(Number(lmg) || 0, CAP_LMG)

// Taxa média ponderada por min(lmg,80M) × min(vigencia_anos,1) — agregacoes.ts:27
export function taxaMediaPonderada(ops) {
  let numer = 0
  let denom = 0
  for (const o of ops) {
    const peso = capLmg(o.lmg) * Math.min(Number(o.vigencia_anos) || 1, 1)
    numer += (Number(o.taxa) || 0) * peso
    denom += capLmg(o.lmg)
  }
  return denom > 0 ? numer / denom : 0
}

// KPIs de um conjunto de operações — agregacoes.ts:47
export function kpisDeOperacoes(ops) {
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

// Ranking por corretora (nome + KPIs + nº de tomadores) — agregacoes.ts:70
function agregarPorCorretora(corretoras, tomadores, operacoes) {
  const tomPorCorretora = new Map()
  for (const t of tomadores) {
    if (!t.corretora_id) continue
    tomPorCorretora.set(t.corretora_id, (tomPorCorretora.get(t.corretora_id) ?? 0) + 1)
  }
  const opsPorCorretora = new Map()
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

// Série mensal (qtd + prêmio) usando data_emissao senão data_entrada — agregacoes.ts:182
function evolucaoMensal(operacoes) {
  const acc = new Map()
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
  return [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, v]) => ({ mes, qtd: v.qtd, premio: v.premio }))
}

// Delta do último mês vs o penúltimo (selo ▲/▼) — agregacoes.ts:264
function deltaUltimoMes(operacoes) {
  const serie = evolucaoMensal(operacoes)
  if (serie.length === 0) return { atual: 0, anterior: 0, variacao: null }
  const atual = serie[serie.length - 1].premio
  const anterior = serie.length > 1 ? serie[serie.length - 2].premio : 0
  const variacao = anterior > 0 ? (atual - anterior) / anterior : null
  return { atual, anterior, variacao }
}

// Totais por status (qtd, LMG limitado, prêmio) — ordenados por prêmio desc.
function totaisPorStatus(operacoes) {
  const acc = new Map()
  for (const o of operacoes) {
    const nome = o.status || 'Sem status'
    const cur = acc.get(nome) ?? { status: nome, count: 0, lmg: 0, premio: 0 }
    cur.count += 1
    cur.lmg += capLmg(o.lmg)
    cur.premio += Number(o.premio_previsto) || 0
    acc.set(nome, cur)
  }
  return [...acc.values()].sort((a, b) => b.premio - a.premio)
}

/**
 * Monta o Resumo Executivo do negócio.
 *
 * @param {Array<Object>} operacoes  linhas de `operacoes`
 * @param {Array<Object>} corretoras linhas de `corretoras`
 * @param {Array<Object>} tomadores  linhas de `tomadores`
 * @param {{ somenteAtivas?: boolean, topN?: number }} [opts]
 * @returns {{ geral, porStatus, topCorretoras, variacaoMes, meta }}
 */
export function resumoExecutivo(operacoes, corretoras, tomadores, opts = {}) {
  const somenteAtivas = opts.somenteAtivas !== false
  const topN = opts.topN ?? 5
  // Mesmo critério dos dashboards: operações com ativo === true (o Painel de
  // Corretoras carrega `.eq('ativo', true)` — components/corretoras/PainelGerencial.tsx:122).
  // Garante que os números batam 1:1 com a tela.
  const ops = (operacoes ?? []).filter((o) => (somenteAtivas ? o.ativo === true : true))
  const cors = corretoras ?? []
  const toms = tomadores ?? []

  const geral = kpisDeOperacoes(ops)

  const ranking = agregarPorCorretora(cors, toms, ops)
    .filter((c) => c.nOperacoes > 0)
    .sort((a, b) => b.premioTotal - a.premioTotal)
  const totalPremio = ranking.reduce((s, c) => s + c.premioTotal, 0)
  const topCorretoras = ranking.slice(0, topN).map((c) => ({
    nome: c.nome,
    nOperacoes: c.nOperacoes,
    premioTotal: c.premioTotal,
    lmgTotal: c.lmgTotal,
    taxaMediaPond: c.taxaMediaPond,
    participacaoPct: totalPremio > 0 ? c.premioTotal / totalPremio : 0,
  }))

  return {
    geral,
    porStatus: totaisPorStatus(ops),
    topCorretoras,
    variacaoMes: deltaUltimoMes(ops),
    meta: { operacoesAtivas: ops.length, corretorasComProducao: ranking.length, teto: CAP_LMG },
  }
}

// ── Formatação ──────────────────────────────────────────────────────────────

/** Moeda BR compacta para o banner: "R$ 12,3 mi", "R$ 1,20 bi". */
export function fmtCompactoBRL(n) {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1e9) return `R$ ${(v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bi`
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`
  if (Math.abs(v) >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} mil`
  return `R$ ${fmtBR(v)}`
}

const fmtPct = (fr, casas = 2) => `${((Number(fr) || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`

/**
 * Linha curta para o banner (ticker) do CRM. Uma frase, sem quebras.
 * Ex.: "📊 Resumo 19/07 · 152 op · Prêmio R$ 12,3 mi · LMG R$ 480,0 mi · Taxa média 1,85% · Top: Corretora X"
 */
export function montarLinhaBanner(resumo, dataLabel) {
  const g = resumo.geral
  const top = resumo.topCorretoras[0]
  const v = resumo.variacaoMes.variacao
  const partes = [
    `📊 Resumo ${dataLabel}`,
    `${g.nOperacoes} operações ativas`,
    `Prêmio ${fmtCompactoBRL(g.premioTotal)}`,
    `LMG ${fmtCompactoBRL(g.lmgTotal)}`,
    `Taxa média ${fmtPct(g.taxaMediaPond / 100)}`,
  ]
  if (top) partes.push(`Top: ${top.nome} (${fmtPct(top.participacaoPct, 0)})`)
  if (v != null) partes.push(`Prêmio no mês ${v >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(v), 1)} vs. mês anterior`)
  return partes.join(' · ')
}

/** Relatório completo em texto (para o arquivo .txt no SharePoint). */
export function montarTxt(resumo, geradoEm, dataLabel) {
  const g = resumo.geral
  const L = []
  L.push('====================================================================')
  L.push(' FAM CRM — Resumo Executivo Diário')
  L.push(` Data: ${dataLabel}   |   Gerado em: ${geradoEm}`)
  L.push('====================================================================')
  L.push('')
  L.push('--- Panorama (operações ativas) ---')
  L.push(`  Operações ativas:      ${g.nOperacoes}`)
  L.push(`  Prêmio total:          R$ ${fmtBR(g.premioTotal)}`)
  L.push(`  LMG total (teto 80M):  R$ ${fmtBR(g.lmgTotal)}`)
  L.push(`  Ticket médio:          R$ ${fmtBR(g.ticketMedio)}`)
  L.push(`  Taxa média ponderada:  ${fmtPct(g.taxaMediaPond / 100)}`)
  const v = resumo.variacaoMes
  if (v.variacao != null) {
    L.push(`  Prêmio do mês:         R$ ${fmtBR(v.atual)} (${v.variacao >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(v.variacao), 1)} vs. R$ ${fmtBR(v.anterior)} no mês anterior)`)
  }
  L.push('')
  L.push('--- Por status ---')
  for (const s of resumo.porStatus) {
    L.push(`  ${String(s.status).padEnd(16)} ${String(s.count).padStart(4)} op | LMG R$ ${fmtBR(s.lmg)} | prêmio R$ ${fmtBR(s.premio)}`)
  }
  L.push('')
  L.push(`--- Top ${resumo.topCorretoras.length} corretoras (por prêmio) ---`)
  resumo.topCorretoras.forEach((c, i) => {
    L.push(`  ${String(i + 1).padStart(2)}. ${c.nome}`)
    L.push(`      ${c.nOperacoes} op | prêmio R$ ${fmtBR(c.premioTotal)} (${fmtPct(c.participacaoPct, 1)}) | LMG R$ ${fmtBR(c.lmgTotal)} | taxa média ${fmtPct(c.taxaMediaPond / 100)}`)
  })
  L.push('')
  L.push(`Corretoras com produção: ${resumo.meta.corretorasComProducao}`)
  L.push('')
  return L.join('\n')
}
