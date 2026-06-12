// ============================================================================
//  Restauracao do banco do FAM CRM a partir de um backup feito por backup-db.mjs.
//
//  PRE-REQUISITO: o schema/DDL ja deve existir no projeto de destino.
//  Aplique antes, no SQL Editor do Supabase, os arquivos:
//    supabase-schema.sql  e depois  supabase-whatsapp.sql
//  Depois rode este script para recarregar os DADOS.
//
//  Uso:
//    node scripts/restore-db.mjs "<arquivo .json.gz>"            (dry-run: so mostra)
//    node scripts/restore-db.mjs "<arquivo .json.gz>" --yes      (grava de verdade)
//
//  Destino: por padrao usa o .env.local do projeto. Para restaurar em OUTRO
//  projeto, defina as variaveis de ambiente:
//    TARGET_SUPABASE_URL  e  TARGET_SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { gunzipSync } from 'node:zlib'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

// Ordem de insercao respeitando as chaves estrangeiras (pais antes de filhos).
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

// Colunas geradas (calculadas pelo banco) - nao devem ser inseridas.
const GENERATED = { operacoes: ['premio_previsto'] }

const CHUNK = 500

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

function stripGenerated(table, rows) {
  const cols = GENERATED[table]
  if (!cols) return rows
  return rows.map((r) => {
    const c = { ...r }
    for (const col of cols) delete c[col]
    return c
  })
}

async function main() {
  const file = process.argv[2]
  const apply = process.argv.includes('--yes')
  if (!file) {
    console.error('Uso: node scripts/restore-db.mjs "<arquivo .json.gz>" [--yes]')
    process.exit(1)
  }
  if (!existsSync(file)) {
    console.error(`Arquivo nao encontrado: ${file}`)
    process.exit(1)
  }

  const env = loadEnv()
  const url = process.env.TARGET_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Faltam credenciais de destino (.env.local ou TARGET_SUPABASE_URL / TARGET_SUPABASE_SERVICE_ROLE_KEY).')
    process.exit(1)
  }

  const payload = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'))
  console.log(`Backup de ${payload?.meta?.created_at} | origem: ${payload?.meta?.source_url}`)
  console.log(`Destino: ${url}`)
  console.log(apply ? '>>> MODO GRAVACAO (--yes)\n' : '>>> DRY-RUN (nada sera gravado; use --yes para aplicar)\n')

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  for (const table of TABLES) {
    const rows = stripGenerated(table, payload.data?.[table] || [])
    if (rows.length === 0) { console.log(`  ${table}: 0 linhas (pulando)`); continue }
    if (!apply) { console.log(`  ${table}: ${rows.length} linha(s) seriam restauradas`); continue }

    let done = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' })
      if (error) { console.error(`  ${table}: ERRO no lote ${i}-${i + chunk.length}: ${error.message}`); process.exit(1) }
      done += chunk.length
    }
    console.log(`  ${table}: ${done} linha(s) restauradas`)
  }

  console.log(apply ? '\nRestauracao concluida.' : '\nDry-run concluido. Reexecute com --yes para gravar.')
}

main().catch((e) => { console.error(e.message || String(e)); process.exit(1) })
