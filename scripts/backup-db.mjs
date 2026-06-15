// ============================================================================
//  Backup do banco do FAM CRM (Supabase) - 100% Node, sem instalar nada.
//
//  Le as credenciais do proprio .env.local do projeto, exporta TODAS as tabelas
//  do schema public e grava um arquivo gzipado, datado, na pasta de destino.
//  Mantem apenas as 3 copias mais recentes (3 linhas de defesa).
//
//  O DDL/schema do banco ja esta versionado no repositorio
//  (supabase-schema.sql + supabase-whatsapp.sql); este backup guarda os DADOS.
//  Restauracao: scripts/restore-db.mjs.
//
//  Uso:   node scripts/backup-db.mjs ["<pasta destino>"]
//  Se a pasta nao for passada, usa FAM_BACKUP_DIR ou o DEFAULT_DEST abaixo.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

const DEFAULT_DEST = 'C:\\Users\\MarcoDragoneFAMSEGUR\\FAM Seguradora\\FAM SEGURADORA - Documentos\\Infraestrutura\\Backup - Dashboard FAM'
const PREFIX = 'fam-crm-backup-'
const KEEP = 3
const PAGE = 1000

// TODAS as tabelas do schema public, em ordem de dependencia (mesma ordem usada
// na restauracao). Tabelas que nao existirem no banco sao ignoradas com aviso.
const TABLES = [
  'produtos',
  'modalidades',
  'corretoras',
  'usuarios',
  'user_profiles',
  'configuracoes_sistema',
  'status_fluxo_operacao',
  'status_fluxo_tomador',
  'metas_negocio',
  'tomadores',
  'operacoes',
  'anexos',
  'comite_comentarios',
  'fam_skills_global',
  'fam_skills_usuario',
  'audit_log',
]

// --- Carrega .env.local (parser simples de dotenv) ---
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    env[key] = val
  }
  return env
}

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Primeiro argumento que NAO e flag (ex.: --force) e a pasta de destino.
const ARGV = process.argv.slice(2)
const FORCE = ARGV.includes('--force') || process.env.FAM_BACKUP_FORCE === '1'
const destDir = ARGV.find((a) => !a.startsWith('--')) || process.env.FAM_BACKUP_DIR || DEFAULT_DEST

// Janela em que um backup do dia ja existente conta como "ja feito". Os gatilhos
// de rede de seguranca (meio-dia/tarde) so rodam se o das 08:00 tiver sido perdido.
const RECENT_HOURS = 6

function log(msg, level = 'INFO') {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`
  console.log(line)
  try { if (existsSync(destDir)) appendFileSync(join(destDir, 'backup.log'), line + '\n') } catch {}
}

function isMissingTable(error) {
  return error?.code === 'PGRST205' || /Could not find the table/i.test(error?.message || '')
}

// Retorna { rows } ou { missing: true } se a tabela nao existe no banco.
async function fetchAll(supabase, table) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (error) {
      if (isMissingTable(error)) return { missing: true }
      throw new Error(`Tabela "${table}": ${error.message}`)
    }
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return { rows }
}

function rotate() {
  const files = readdirSync(destDir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.json.gz'))
    .map((f) => ({ f, t: statSync(join(destDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const { f } of files.slice(KEEP)) {
    unlinkSync(join(destDir, f))
    log(`Rotacao: removido ${f}`)
  }
}

async function main() {
  const env = loadEnv()
  const url = process.env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    log('Faltam credenciais (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local).', 'ERRO')
    process.exit(1)
  }
  if (!existsSync(destDir)) {
    try { mkdirSync(destDir, { recursive: true }) }
    catch (e) { console.error(`[ERRO] Destino inacessivel: ${destDir} - ${e.message}`); process.exit(1) }
  }

  // Idempotencia do dia: se o backup de hoje ja existe e e recente, nao repete
  // (a menos de --force). Assim os gatilhos extras de seguranca so agem quando o
  // das 08:00 foi perdido, mantendo "1x por dia" de fato.
  const todayFile = join(destDir, `${PREFIX}${fmtDate(new Date())}.json.gz`)
  if (!FORCE && existsSync(todayFile)) {
    const ageH = (Date.now() - statSync(todayFile).mtimeMs) / 3_600_000
    if (ageH < RECENT_HOURS) {
      log(`Backup de hoje ja existe (${ageH.toFixed(1)}h atras) - pulando. Use --force para refazer.`)
      return
    }
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  log(`Iniciando backup -> ${destDir}`)
  const data = {}
  const counts = {}
  const skipped = []
  for (const table of TABLES) {
    const res = await fetchAll(supabase, table)
    if (res.missing) {
      skipped.push(table)
      log(`  ${table}: tabela inexistente no banco - ignorada`, 'AVISO')
      continue
    }
    data[table] = res.rows
    counts[table] = res.rows.length
    log(`  ${table}: ${res.rows.length} linha(s)`)
  }

  const payload = {
    meta: {
      app: 'fam-crm',
      format: 'data-json',
      version: 1,
      created_at: new Date().toISOString(),
      source_url: url,
      tables: counts,
      skipped,
      note: 'Schema/DDL fica em supabase-schema.sql + supabase-whatsapp.sql no repositorio.',
    },
    data,
  }

  const stamp = fmtDate(new Date())
  const fileName = `${PREFIX}${stamp}.json.gz`
  const dest = join(destDir, fileName)
  const gz = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))
  writeFileSync(dest, gz)

  const sizeKB = (gz.length / 1024).toFixed(1)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  log(`Backup OK: ${fileName} (${sizeKB} KB, ${total} linhas no total).`)

  rotate()
  const kept = readdirSync(destDir).filter((f) => f.startsWith(PREFIX) && f.endsWith('.json.gz')).length
  log(`Concluido. Geracoes mantidas: ${kept} (alvo: ${KEEP}).`)
}

main().catch((e) => {
  log(e.message || String(e), 'ERRO')
  process.exit(1)
})
