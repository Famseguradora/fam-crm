// ============================================================================
//  Agente de Análise Financeira do FAM CRM — runner noturno (100% Node).
//
//  Lê as credenciais do .env.local, baixa todas as operações do Supabase,
//  roda a bateria de verificações financeiras (lib/financeiro/analise.mjs) e
//  grava um relatório datado (JSON + TXT legível) na pasta de destino,
//  mantendo as cópias mais recentes. Pensado para rodar 1x/dia via Tarefa
//  Agendada (scripts/register-analise-task.ps1).
//
//  Foco da regra FAM: LMG limitado a R$ 80M por operação — e o PRÊMIO também.
//  Achados "críticos" fazem o processo sair com código 1 (visível no log/task).
//
//  Uso:   node scripts/analise-financeira.mjs ["<pasta destino>"]
//         FAM_ANALISE_DIR sobrescreve o destino padrão.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analisarOperacoes, fmtBR } from '../lib/financeiro/analise.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

const DEFAULT_DEST = 'C:\\Users\\MarcoDragoneFAMSEGUR\\FAM Seguradora\\FAM SEGURADORA - Documentos\\Infraestrutura\\Analise Financeira - FAM CRM'
const PREFIX = 'fam-analise-financeira-'
const KEEP = 30
const PAGE = 1000

function loadEnv() {
  const path = join(PROJECT_ROOT, '.env.local')
  const env = {}
  if (!existsSync(path)) return env
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    env[key] = val
  }
  return env
}

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const destDir = process.argv[2] || process.env.FAM_ANALISE_DIR || DEFAULT_DEST

function log(msg, level = 'INFO') {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`
  console.log(line)
  try { if (existsSync(destDir)) appendFileSync(join(destDir, 'analise.log'), line + '\n') } catch {}
}

async function fetchAll(supabase, table) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (error) throw new Error(`Tabela "${table}": ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

function rotate() {
  const files = readdirSync(destDir)
    .filter((f) => f.startsWith(PREFIX))
    .map((f) => ({ f, t: statSync(join(destDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const { f } of files.slice(KEEP * 2)) { // *2: cada relatório são 2 arquivos (.json + .txt)
    unlinkSync(join(destDir, f))
    log(`Rotação: removido ${f}`)
  }
}

function montarTxt(rel, geradoEm) {
  const L = []
  const sev = { critico: '[CRÍTICO]', alerta: '[ALERTA] ', info: '[INFO]   ' }
  L.push('====================================================================')
  L.push(' FAM CRM — Relatório de Análise Financeira')
  L.push(` Gerado em: ${geradoEm}`)
  L.push('====================================================================')
  L.push('')
  const r = rel.resumo
  L.push(`Regra aplicada: ${r.regra}`)
  L.push(`Operações analisadas (ativas): ${r.operacoesAnalisadas}`)
  L.push(`Operações acima do teto de LMG: ${r.operacoesAcimaDoTeto}`)
  L.push(`Achados — críticos: ${r.criticos} | alertas: ${r.alertas} | infos: ${r.infos}`)
  L.push(`Prêmio inflado por LMG não limitado: R$ ${fmtBR(r.impactoPremioInflado)}`)
  L.push('')
  L.push('--- Totais por status (LMG limitado | prêmio canônico | prêmio armazenado) ---')
  for (const [st, t] of Object.entries(rel.totaisPorStatus)) {
    L.push(`  ${st.padEnd(14)} ${String(t.count).padStart(4)} op | LMG R$ ${fmtBR(t.lmgLimitado)} | prêmio correto R$ ${fmtBR(t.premioCanonico)} | armazenado R$ ${fmtBR(t.premioArmazenado)}`)
  }
  L.push('')
  L.push('--- Achados ---')
  if (rel.achados.length === 0) {
    L.push('  Nenhum achado. Tudo certo. ✓')
  } else {
    const ordem = { critico: 0, alerta: 1, info: 2 }
    for (const a of [...rel.achados].sort((x, y) => ordem[x.severidade] - ordem[y.severidade])) {
      L.push(`  ${sev[a.severidade]} (${a.regra}) op ${a.id}`)
      L.push(`      ${a.mensagem}`)
    }
  }
  L.push('')
  return L.join('\n')
}

async function main() {
  const env = loadEnv()
  const url = process.env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[ERRO] Faltam credenciais (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local).')
    process.exit(1)
  }
  if (!existsSync(destDir)) {
    try { mkdirSync(destDir, { recursive: true }) }
    catch (e) { console.error(`[ERRO] Destino inacessível: ${destDir} - ${e.message}`); process.exit(1) }
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  log(`Iniciando análise financeira -> ${destDir}`)

  const operacoes = await fetchAll(supabase, 'operacoes')
  log(`Operações carregadas: ${operacoes.length}`)

  const rel = analisarOperacoes(operacoes)
  const geradoEm = new Date().toISOString()

  const stamp = fmtDate(new Date())
  const base = `${PREFIX}${stamp}`
  writeFileSync(join(destDir, `${base}.json`), JSON.stringify({ geradoEm, ...rel }, null, 2), 'utf8')
  writeFileSync(join(destDir, `${base}.txt`), montarTxt(rel, geradoEm), 'utf8')

  const r = rel.resumo
  log(`Concluído: ${r.criticos} crítico(s), ${r.alertas} alerta(s), ${r.infos} info(s). Prêmio inflado: R$ ${fmtBR(r.impactoPremioInflado)}.`)
  rotate()

  if (r.criticos > 0) {
    log(`ATENÇÃO: ${r.criticos} achado(s) crítico(s) — ver ${base}.txt`, 'ALERTA')
    process.exit(1)
  }
}

main().catch((e) => {
  log(e.message || String(e), 'ERRO')
  process.exit(1)
})
