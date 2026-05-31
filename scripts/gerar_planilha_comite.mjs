/**
 * Gerar Planilha Comitê de Subscrição — FAM CRM
 *
 * Como usar:
 *   node scripts/gerar_planilha_comite.mjs
 *
 * Gera: scripts/CockpitComite_FAM.xlsx
 *
 * Abas:
 *   1. Resumo           — KPIs principais do portfólio
 *   2. Cálculo Prêmio   — Demonstra LMG × Taxa × Vigência
 *   3. Taxa Méd Pond    — Demonstra TMP = Σ(taxa×LMG) / Σ(LMG)
 *   4. Meta vs Realizado — Progresso vs metas mensal e anual
 *   5. Composição Taxa  — Taxa técnica mínima e folga
 *   6. Simulação Impacto — Before/after de uma aprovação no portfólio
 */

import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function moeda(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function pct(v, decimais = 4) {
  return `${v.toFixed(decimais)}%`
}

// Cria uma célula com tipo, valor, fórmula e estilo
function c(value, opts = {}) {
  const cell = {}
  if (opts.formula) {
    cell.t = 'n'
    cell.f = opts.formula
    cell.v = value
  } else if (typeof value === 'number') {
    cell.t = 'n'
    cell.v = value
  } else if (value === null || value === undefined) {
    cell.t = 'z'
    cell.v = ''
  } else {
    cell.t = 's'
    cell.v = String(value)
  }

  // Estilo
  const s = {}
  const font = { name: 'Calibri', sz: 11 }
  if (opts.bold)  font.bold = true
  if (opts.white) font.color = { rgb: 'FFFFFFFF' }
  s.font = font

  if (opts.bg) s.fill = { patternType: 'solid', fgColor: { rgb: opts.bg } }

  s.alignment = { vertical: 'center', wrapText: !!opts.wrap }
  if (opts.center) s.alignment.horizontal = 'center'
  if (opts.right)  s.alignment.horizontal = 'right'

  if (opts.fmt) s.numFmt = opts.fmt
  else if (typeof value === 'number') {
    if (opts.moeda) s.numFmt = '"R$" #,##0.00'
    else if (opts.pct) s.numFmt = '0.0000%'
    else if (opts.pct2) s.numFmt = '0.00%'
    else if (opts.inteiro) s.numFmt = '#,##0'
  }

  if (opts.border) {
    const b = { style: 'thin', color: { rgb: 'FFccddee' } }
    s.border = { top: b, bottom: b, left: b, right: b }
  }

  cell.s = s
  return cell
}

// Define range de células como string: ex. {s:{r:0,c:0}, e:{r:0,c:5}}
function range(sr, sc, er, ec) {
  return { s: { r: sr, c: sc }, e: { r: er, c: ec } }
}

// Converte array r,c para endereço: ex. {r:0,c:0} → 'A1'
function addr(r, c_) {
  return XLSX.utils.encode_cell({ r, c: c_ })
}

// Preenche um objeto ws com uma matriz de células
function setRow(ws, row, cols) {
  cols.forEach((cell, ci) => {
    if (cell !== null && cell !== undefined) {
      ws[addr(row, ci)] = cell
    }
  })
}

function setRange(ws, r1, c1, r2, c2) {
  if (!ws['!ref']) ws['!ref'] = XLSX.utils.encode_range(range(r1, c1, r2, c2))
  else {
    const cur = XLSX.utils.decode_range(ws['!ref'])
    const newRef = {
      s: { r: Math.min(cur.s.r, r1), c: Math.min(cur.s.c, c1) },
      e: { r: Math.max(cur.e.r, r2), c: Math.max(cur.e.c, c2) }
    }
    ws['!ref'] = XLSX.utils.encode_range(newRef)
  }
}

// Estilos de cabeçalho reutilizáveis
const HDR  = { bold: true, white: true, bg: 'FF0d1e30', center: true, border: true }
const HDR2 = { bold: true, white: true, bg: 'FF1e3a6e', center: true, border: true }
const AMB  = { bold: false, bg: 'FFfff8e0', border: true }
const FORM = { bold: true,  bg: 'FFfffde7', border: true }
const TOT  = { bold: true,  bg: 'FFdce8ff', border: true }
const NORM = { border: true }
const NORM_R = { border: true, right: true }

// ─── Sheet 1: Resumo ──────────────────────────────────────────────────────────

function sheetResumo() {
  const ws = {}

  const titulo = (r, txt) => {
    ws[addr(r, 0)] = c(txt, { bold: true, white: true, bg: 'FF0d1e30', center: true })
    ws['!merges'] = ws['!merges'] || []
    ws['!merges'].push(range(r, 0, r, 2))
  }

  // Título principal
  ws[addr(0, 0)] = c('COCKPIT DE COMITÊ DE SUBSCRIÇÃO — FAM SEGURADORA', { bold: true, white: true, bg: 'FF0d1e30', center: true })
  ws['!merges'] = [range(0, 0, 0, 4)]

  ws[addr(1, 0)] = c('Portfólio em Carteira (Book = Aprovado + Emitido) — Maio/2026', { bold: false, bg: 'FFe8f0ff', center: true })
  ws['!merges'].push(range(1, 0, 1, 4))

  // Cabeçalhos
  setRow(ws, 3, [
    c('Indicador', HDR), c('Valor', HDR), c('Meta', HDR), c('% Atingido', HDR), c('Situação', HDR)
  ])

  const rows = [
    ['Prêmio Realizado no Mês', 1110500,    2000000,  null, 'Atenção'],
    ['Prêmio Realizado no Ano', 11068192.79, 25000000, null, 'Crítico'],
    ['LMG Total em Carteira',   362758302,  400000000, null, 'Normal'],
    ['Taxa Média Ponderada (TMP)', 0.011502, 0.012000,  null, 'Abaixo da meta'],
    ['Operações Ativas (Book)', 17,         20,        null, 'Normal'],
    ['Risco Judicial Provisionado', 2400000, null,     null, 'Informativo'],
  ]

  rows.forEach(([label, valor, meta, , sit], i) => {
    const r = 4 + i
    const pctFormula = (meta && valor)
      ? `B${r + 1}/C${r + 1}`
      : null

    const isTaxa = label.includes('TMP')

    ws[addr(r, 0)] = c(label, NORM)
    ws[addr(r, 1)] = c(valor, { ...NORM_R, moeda: !isTaxa, pct: isTaxa })
    ws[addr(r, 2)] = meta ? c(meta, { ...NORM_R, moeda: !isTaxa, pct: isTaxa }) : c('—', { ...NORM, center: true })
    ws[addr(r, 3)] = pctFormula
      ? c(valor / meta, { ...FORM, formula: pctFormula, pct2: true })
      : c('—', { ...NORM, center: true })
    ws[addr(r, 4)] = c(sit, { ...NORM, center: true })
  })

  ws['!cols'] = [{ wch: 38 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 18 }]
  setRange(ws, 0, 0, 9, 4)
  return ws
}

// ─── Sheet 2: Cálculo de Prêmio ───────────────────────────────────────────────

function sheetCalculo() {
  const ws = {}
  ws['!merges'] = []

  ws[addr(0, 0)] = c('CÁLCULO DE PRÊMIO PREVISTO — LMG × Taxa × Vigência', { bold: true, white: true, bg: 'FF0d1e30', center: true })
  ws['!merges'].push(range(0, 0, 0, 5))

  ws[addr(1, 0)] = c('As células em amarelo contêm fórmulas — altere LMG, Taxa ou Vigência para recalcular o Prêmio automaticamente.', { bg: 'FFfffde7', center: true })
  ws['!merges'].push(range(1, 0, 1, 5))

  // Cabeçalhos
  setRow(ws, 3, [
    c('Tomador', HDR),
    c('Modalidade', HDR),
    c('LMG (R$)', HDR),
    c('Taxa (% a.a.)', HDR),
    c('Vigência (anos)', HDR),
    c('Prêmio Previsto (R$)', HDR2),
  ])

  const ops = [
    ['ABC Engenharia Ltda',     'Performance', 5000000,   0.0125, 2.0],
    ['XYZ Construções S.A.',    'Pagamento',   3800000,   0.0095, 3.0],
    ['Beta Infraestrutura',     'Performance', 8000000,   0.0140, 1.5],
    ['Gama Logística',          'Judicial',    2500000,   0.0110, 2.0],
    ['Delta Energia',           'Licitação',   1800000,   0.0197, 2.5],
  ]

  let totalLmg = 0, totalPremio = 0
  ops.forEach(([tom, mod, lmg, taxa, vig], i) => {
    const r = 4 + i
    totalLmg += lmg
    totalPremio += lmg * taxa * vig
    setRow(ws, r, [
      c(tom, NORM),
      c(mod, NORM),
      c(lmg, { ...NORM, moeda: true }),
      c(taxa, { ...NORM, pct: true }),
      c(vig, { ...NORM, center: true }),
      c(lmg * taxa * vig, { ...FORM, formula: `C${r + 1}*D${r + 1}*E${r + 1}`, moeda: true }),
    ])
  })

  // Total
  const r = 4 + ops.length
  setRow(ws, r, [
    c('TOTAL', TOT), c('', TOT),
    c(totalLmg, { ...TOT, formula: `SUM(C5:C${r})`, moeda: true }),
    c('', TOT), c('', TOT),
    c(totalPremio, { ...TOT, formula: `SUM(F5:F${r})`, moeda: true }),
  ])

  // Legenda da fórmula
  ws[addr(r + 2, 0)] = c('Fórmula:', { bold: true })
  ws[addr(r + 2, 1)] = c('Prêmio Previsto = LMG × Taxa (decimal) × Vigência (anos)', { bg: 'FFf0f6ff', border: true })
  ws['!merges'].push(range(r + 2, 1, r + 2, 5))

  ws[addr(r + 3, 0)] = c('Exemplo:', { bold: true })
  ws[addr(r + 3, 1)] = c('R$ 5.000.000 × 1,25% × 2 anos = R$ 125.000,00', { bg: 'FFf0f6ff', border: true })
  ws['!merges'].push(range(r + 3, 1, r + 3, 5))

  ws['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 22 }]
  setRange(ws, 0, 0, r + 3, 5)
  return ws
}

// ─── Sheet 3: TMP ─────────────────────────────────────────────────────────────

function sheetTMP() {
  const ws = {}
  ws['!merges'] = []

  ws[addr(0, 0)] = c('TAXA MÉDIA PONDERADA (TMP) DO PORTFÓLIO', { bold: true, white: true, bg: 'FF0d1e30', center: true })
  ws['!merges'].push(range(0, 0, 0, 5))

  ws[addr(1, 0)] = c('TMP = Σ(Taxa × LMG) ÷ Σ(LMG)  —  Operações mais pesadas (LMG maior) têm mais impacto na taxa média.', { bg: 'FFe8f4ff', center: true })
  ws['!merges'].push(range(1, 0, 1, 5))

  setRow(ws, 3, [
    c('Tomador', HDR),
    c('LMG (R$)', HDR),
    c('Taxa (% a.a.)', HDR),
    c('Taxa × LMG (peso)', HDR2),
    c('% do Book LMG', HDR),
    c('Contribuição TMP', HDR2),
  ])

  const ops = [
    ['ABC Engenharia Ltda',     5000000,   0.0125],
    ['XYZ Construções S.A.',    3800000,   0.0095],
    ['Beta Infraestrutura',     8000000,   0.0140],
    ['Gama Logística',          2500000,   0.0110],
    ['Delta Energia',           1800000,   0.0197],
    ['Sigma Obras',             4200000,   0.0130],
    ['Omega Contratações',      3100000,   0.0108],
  ]

  const totalLmg = ops.reduce((s, o) => s + o[1], 0)

  ops.forEach(([tom, lmg, taxa], i) => {
    const r = 4 + i
    setRow(ws, r, [
      c(tom, NORM),
      c(lmg, { ...NORM, moeda: true }),
      c(taxa, { ...NORM, pct: true }),
      c(lmg * taxa, { ...FORM, formula: `B${r + 1}*C${r + 1}`, moeda: true }),
      c(lmg / totalLmg, { ...NORM, formula: `B${r + 1}/B${4 + ops.length + 1}`, pct2: true }),
      c((lmg * taxa) / totalLmg, { ...FORM, formula: `D${r + 1}/B${4 + ops.length + 1}`, pct: true }),
    ])
  })

  const totalR = 4 + ops.length
  const totalPeso = ops.reduce((s, o) => s + o[1] * o[2], 0)
  const tmp = totalPeso / totalLmg

  setRow(ws, totalR, [
    c('TOTAL / TMP', TOT),
    c(totalLmg, { ...TOT, formula: `SUM(B5:B${totalR})`, moeda: true }),
    c('', TOT),
    c(totalPeso, { ...TOT, formula: `SUM(D5:D${totalR})`, moeda: true }),
    c(1, { ...TOT, pct2: true }),
    c(tmp, { ...TOT, formula: `D${totalR + 1}/B${totalR + 1}`, pct: true, bold: true }),
  ])

  // Interpretação
  ws[addr(totalR + 2, 0)] = c('TMP Calculada:', { bold: true })
  ws[addr(totalR + 2, 1)] = c(tmp, { ...FORM, pct: true, bold: true })
  ws[addr(totalR + 2, 2)] = c(`= Σ(D5:D${totalR}) / Σ(B5:B${totalR}) — TMP ponderada pelo LMG de cada operação`, { bg: 'FFf0f6ff' })
  ws['!merges'].push(range(totalR + 2, 2, totalR + 2, 5))

  ws[addr(totalR + 3, 0)] = c('Meta TMP:', { bold: true })
  ws[addr(totalR + 3, 1)] = c(0.012, { ...NORM, pct: true })
  ws[addr(totalR + 3, 2)] = c('Configurada pelo CEO na seção "Configurar Metas" do CRM', { bg: 'FFfff8e0' })
  ws['!merges'].push(range(totalR + 3, 2, totalR + 3, 5))

  ws['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 18 }]
  setRange(ws, 0, 0, totalR + 3, 5)
  return ws
}

// ─── Sheet 4: Meta vs Realizado ───────────────────────────────────────────────

function sheetMeta() {
  const ws = {}
  ws['!merges'] = []

  ws[addr(0, 0)] = c('PAINEL META vs REALIZADO — MAIO/2026', { bold: true, white: true, bg: 'FF0d1e30', center: true })
  ws['!merges'].push(range(0, 0, 0, 7))

  ws[addr(1, 0)] = c('Metas configuradas pelo CEO no CRM. Realizado = operações com status Emitido no período.', { bg: 'FFe8f4ff', center: true })
  ws['!merges'].push(range(1, 0, 1, 7))

  setRow(ws, 3, [
    c('Indicador', HDR),
    c('Meta Mês', HDR),
    c('Realizado Mês', HDR),
    c('% Atingido Mês', HDR2),
    c('Gap Mês', HDR),
    c('Meta Ano', HDR),
    c('Realizado Ano', HDR),
    c('% Atingido Ano', HDR2),
  ])

  const dados = [
    ['Prêmio (R$)',          2000000,    1110500,      25000000,   11068192.79,  false],
    ['LMG em Carteira (R$)', 400000000,  362758302,    400000000,  362758302,    false],
    ['Qtd Operações',        20,         17,           20,         17,           true],
    ['TMP (%)',              0.012,      0.011502,     0.012,      0.011502,     false, true],
  ]

  dados.forEach(([label, metaMes, realMes, metaAno, realAno, isInt, isTaxa], i) => {
    const r = 4 + i
    const fmt = isTaxa ? { pct: true } : (isInt ? { inteiro: true } : { moeda: true })
    setRow(ws, r, [
      c(label, NORM),
      c(metaMes, { ...NORM, ...fmt }),
      c(realMes, { ...NORM, ...fmt }),
      c(realMes / metaMes, { ...FORM, formula: `C${r + 1}/B${r + 1}`, pct2: true }),
      c(metaMes - realMes, { ...FORM, formula: `B${r + 1}-C${r + 1}`, ...fmt }),
      c(metaAno, { ...NORM, ...fmt }),
      c(realAno, { ...NORM, ...fmt }),
      c(realAno / metaAno, { ...FORM, formula: `G${r + 1}/F${r + 1}`, pct2: true }),
    ])
  })

  // Semáforo
  ws[addr(9, 0)] = c('Semáforo de Progresso', { bold: true, bg: 'FF0d1e30', white: true })
  ws['!merges'].push(range(9, 0, 9, 7))

  const semaforo = [
    ['> 80%', '🟢 Verde', 'No caminho — bom desempenho'],
    ['50% a 80%', '🟡 Amarelo', 'Atenção — recuperação necessária'],
    ['< 50%', '🔴 Vermelho', 'Crítico — priorizar aprovações no comitê'],
  ]
  semaforo.forEach(([faixa, cor, interp], i) => {
    const r = 10 + i
    ws[addr(r, 0)] = c(faixa, NORM)
    ws[addr(r, 1)] = c(cor, { ...NORM, center: true })
    ws[addr(r, 2)] = c(interp, NORM)
    ws['!merges'].push(range(r, 2, r, 7))
  })

  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }]
  setRange(ws, 0, 0, 12, 7)
  return ws
}

// ─── Sheet 5: Composição de Taxa ──────────────────────────────────────────────

function sheetComposicao() {
  const ws = {}
  ws['!merges'] = []

  ws[addr(0, 0)] = c('COMPOSIÇÃO DE TAXA — TAXA TÉCNICA MÍNIMA E FOLGA', { bold: true, white: true, bg: 'FF0d1e30', center: true })
  ws['!merges'].push(range(0, 0, 0, 7))

  ws[addr(1, 0)] = c('Taxa Técnica Mínima = Sinistralidade + Carregamento + Margem Técnica  |  Folga = Taxa da Operação − Taxa Técnica Mínima', { bg: 'FFe8f4ff', center: true })
  ws['!merges'].push(range(1, 0, 1, 7))

  setRow(ws, 3, [
    c('Operação', HDR),
    c('Sinistralidade', HDR),
    c('Carregamento', HDR),
    c('Margem Técnica', HDR),
    c('Taxa Téc. Mínima', HDR2),
    c('Taxa Operação', HDR),
    c('Folga', HDR2),
    c('Adequação', HDR),
  ])

  const ops = [
    ['ABC Engenharia — Performance',   0.005,  0.0035, 0.002,  0.0125],
    ['XYZ Construções — Pagamento',    0.004,  0.003,  0.002,  0.0095],
    ['Beta Infraestrutura — Perf.',    0.005,  0.0035, 0.002,  0.014],
    ['Gama Logística — Judicial',      0.006,  0.004,  0.0025, 0.011],
    ['Delta Energia — Licitação',      0.003,  0.003,  0.002,  0.0197],
    ['Sigma Obras — Performance',      0.005,  0.0035, 0.002,  0.013],
    ['Nova Op. Hipotética — Judicial',  0.007, 0.004,  0.003,  0.012],
  ]

  ops.forEach(([label, sint, carg, marg, taxaOp], i) => {
    const r = 4 + i
    const tecMin = sint + carg + marg
    const folga = taxaOp - tecMin
    setRow(ws, r, [
      c(label, NORM),
      c(sint, { ...NORM, pct: true }),
      c(carg, { ...NORM, pct: true }),
      c(marg, { ...NORM, pct: true }),
      c(tecMin, { ...FORM, formula: `B${r + 1}+C${r + 1}+D${r + 1}`, pct: true }),
      c(taxaOp, { ...NORM, pct: true }),
      c(folga, { ...FORM, formula: `F${r + 1}-E${r + 1}`, pct: true }),
      c(
        folga > 0 ? '✅ Adequada' : folga === 0 ? '⚠ No Limite' : '❌ Insuficiente',
        { ...NORM, center: true, bg: folga > 0.001 ? 'FFdcfce7' : (folga < 0 ? 'FFffe4e6' : 'FFfff8e0') }
      ),
    ])
  })

  ws['!cols'] = [{ wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }]
  setRange(ws, 0, 0, 4 + ops.length, 7)
  return ws
}

// ─── Sheet 6: Simulação de Impacto ────────────────────────────────────────────

function sheetImpacto() {
  const ws = {}
  ws['!merges'] = []

  ws[addr(0, 0)] = c('SIMULAÇÃO DE IMPACTO — SE ESTA OPERAÇÃO FOR APROVADA', { bold: true, white: true, bg: 'FF0d1e30', center: true })
  ws['!merges'].push(range(0, 0, 0, 4))

  ws[addr(1, 0)] = c('Operação Simulada: ABC Engenharia — Performance — LMG R$ 5.000.000 — Taxa 1,25% — 2 anos — Prêmio R$ 125.000', { bg: 'FFfffde7', center: true })
  ws['!merges'].push(range(1, 0, 1, 4))

  // Parte 1 — Indicadores gerais
  setRow(ws, 3, [
    c('Indicador do Portfólio', HDR),
    c('Antes da Aprovação', HDR),
    c('Esta Operação', HDR2),
    c('Após Aprovação', HDR2),
    c('Variação (%)', HDR),
  ])

  const lmgAntes = 362758302, lmgOp = 5000000
  const premioAntes = 11068192.79, premioOp = 125000
  const tmpAntes = 0.011502
  const tmpDepois = ((tmpAntes * lmgAntes) + (0.0125 * lmgOp)) / (lmgAntes + lmgOp)

  const indicadores = [
    ['LMG Total em Carteira (R$)', lmgAntes, lmgOp, lmgAntes + lmgOp, true],
    ['Prêmio Total em Carteira (R$)', premioAntes, premioOp, premioAntes + premioOp, true],
    ['Taxa Média Ponderada (TMP)', tmpAntes, 0.0125, tmpDepois, false, true],
    ['Qtd Operações Ativas', 17, 1, 18, false, false, true],
  ]

  indicadores.forEach(([label, antes, op, depois, isMoeda, isTaxa, isInt], i) => {
    const r = 4 + i
    const fmt = isTaxa ? { pct: true } : (isInt ? { inteiro: true } : { moeda: true })
    const varPct = (depois - antes) / antes
    setRow(ws, r, [
      c(label, NORM),
      c(antes, { ...NORM, ...fmt }),
      c(op, { bg: 'FFfffde7', border: true, ...fmt }),
      c(depois, { ...FORM, formula: `B${r + 1}+C${r + 1}`, ...fmt }),
      c(varPct, { ...FORM, formula: `(D${r + 1}-B${r + 1})/B${r + 1}`, pct2: true }),
    ])
  })

  // Parte 2 — Concentração por modalidade
  const r2 = 9
  ws[addr(r2, 0)] = c('CONCENTRAÇÃO POR MODALIDADE (% do Prêmio Total)', { bold: true, white: true, bg: 'FF1e3a6e', center: true })
  ws['!merges'].push(range(r2, 0, r2, 4))

  setRow(ws, r2 + 1, [
    c('Modalidade', HDR),
    c('Prêmio Antes', HDR),
    c('% Antes', HDR),
    c('Prêmio Depois', HDR),
    c('% Depois', HDR2),
  ])

  const modalidades = [
    ['Performance', 5580000, premioOp],
    ['Pagamento', 3100000, 0],
    ['Judicial', 1650000, 0],
    ['Licitação', 738192.79, 0],
  ]

  modalidades.forEach(([mod, premioMod, addPremio], i) => {
    const r = r2 + 2 + i
    const premioModDepois = premioMod + addPremio
    const warn = premioMod / premioAntes > 0.4
    setRow(ws, r, [
      c(mod, NORM),
      c(premioMod, { ...NORM, moeda: true }),
      c(premioMod / premioAntes, { ...(warn ? AMB : NORM), formula: `B${r + 1}/${premioAntes}`, pct2: true }),
      c(premioModDepois, { ...NORM, moeda: true }),
      c(premioModDepois / (premioAntes + premioOp), { ...(warn ? AMB : FORM), formula: `D${r + 1}/${premioAntes + premioOp}`, pct2: true }),
    ])
  })

  // Parte 3 — Contribuição para a meta
  const r3 = r2 + 2 + modalidades.length + 2
  ws[addr(r3, 0)] = c('CONTRIBUIÇÃO PARA A META MENSAL DE PRÊMIO', { bold: true, white: true, bg: 'FF1e3a6e', center: true })
  ws['!merges'].push(range(r3, 0, r3, 4))

  const metaMes = 2000000
  const rows3 = [
    ['Meta Mensal de Prêmio', metaMes, null, null],
    ['Prêmio Realizado Atual', premioAntes, `B${r3 + 2}/B${r3 + 2}`, 'base'],
    ['+ Esta Operação', premioOp, `C${r3 + 4}/B${r3 + 2}`, 'add'],
    ['Novo Patamar', premioAntes + premioOp, `C${r3 + 5}/B${r3 + 2}`, 'result'],
    ['Gap Restante', metaMes - premioAntes - premioOp, `C${r3 + 6}/B${r3 + 2}`, 'gap'],
  ]

  rows3.forEach(([label, valor, _pctFormula, tipo], i) => {
    const r = r3 + 1 + i
    const bg = tipo === 'result' ? TOT : (tipo === 'add' ? FORM : NORM)
    ws[addr(r, 0)] = c(label, bg)
    ws[addr(r, 1)] = c(valor, { ...bg, moeda: true })
    ws[addr(r, 2)] = c(valor / metaMes, { ...FORM, formula: `B${r + 1}/B${r3 + 2}`, pct2: true })
  })

  ws['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 14 }]
  setRange(ws, 0, 0, r3 + rows3.length, 4)
  return ws
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, sheetResumo(),      'Resumo')
  XLSX.utils.book_append_sheet(wb, sheetCalculo(),     'Cálculo Prêmio')
  XLSX.utils.book_append_sheet(wb, sheetTMP(),         'Taxa Méd Pond (TMP)')
  XLSX.utils.book_append_sheet(wb, sheetMeta(),        'Meta vs Realizado')
  XLSX.utils.book_append_sheet(wb, sheetComposicao(),  'Composição Taxa')
  XLSX.utils.book_append_sheet(wb, sheetImpacto(),     'Simulação Impacto')

  const outPath = path.join(__dirname, 'CockpitComite_FAM.xlsx')
  XLSX.writeFile(wb, outPath, { bookSST: true, compression: true, cellStyles: true })

  console.log(`✅  Arquivo gerado: ${outPath}`)
  console.log('    Abas criadas:')
  console.log('    1. Resumo             — KPIs principais do portfólio')
  console.log('    2. Cálculo Prêmio     — LMG × Taxa × Vigência (fórmulas)')
  console.log('    3. Taxa Méd Pond      — TMP = Σ(taxa×LMG)/Σ(LMG)')
  console.log('    4. Meta vs Realizado  — Progresso vs metas (fórmulas)')
  console.log('    5. Composição Taxa    — Taxa técnica mínima e folga (fórmulas)')
  console.log('    6. Simulação Impacto  — Before/after de uma aprovação')
}

main()
