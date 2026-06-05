// Backup do bucket de Storage do Supabase (trilha 2 do plano de backup).
//
// Baixa TODOS os arquivos do bucket `fam-anexos` (documentos/anexos das operacoes,
// que NAO sao capturados pelo pg_dump) e empacota em <nome>.tar.gz.
//
// Uso:  node scripts/backup-storage.mjs <nome-base-sem-extensao>
// Ex.:  node scripts/backup-storage.mjs fam-crm-anexos-2026-06-04
//
// Variaveis de ambiente necessarias:
//   SUPABASE_URL                URL do projeto (https://<ref>.supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY   service role key (acesso total ao storage)
// Opcional:
//   SUPABASE_BUCKET             nome do bucket (default: fam-anexos)

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = process.env.SUPABASE_BUCKET || 'fam-anexos'
const baseName = process.argv[2]

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
if (!baseName) {
  console.error('Uso: node scripts/backup-storage.mjs <nome-base-sem-extensao>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

const PAGE = 1000

// Lista recursivamente todos os caminhos de arquivo dentro de um prefixo.
async function listAll(prefix = '') {
  const files = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`Erro ao listar "${prefix}": ${error.message}`)
    if (!data || data.length === 0) break

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      // Pastas vem com id/metadata nulos; arquivos tem metadata.
      if (entry.id === null || entry.metadata === null) {
        const nested = await listAll(path)
        files.push(...nested)
      } else {
        files.push(path)
      }
    }

    if (data.length < PAGE) break
    offset += PAGE
  }
  return files
}

const OUT_DIR = '_anexos_tmp'

async function main() {
  console.log(`Listando arquivos do bucket "${BUCKET}"...`)
  const paths = await listAll('')
  console.log(`${paths.length} arquivo(s) encontrado(s).`)

  if (paths.length === 0) {
    console.log('Bucket vazio — nenhum tar.gz gerado.')
    return
  }

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  let ok = 0
  for (const path of paths) {
    const { data, error } = await supabase.storage.from(BUCKET).download(path)
    if (error || !data) {
      console.error(`  FALHA: ${path} — ${error?.message || 'sem dados'}`)
      continue
    }
    const buf = Buffer.from(await data.arrayBuffer())
    const dest = join(OUT_DIR, BUCKET, path)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, buf)
    ok++
  }
  console.log(`${ok}/${paths.length} arquivo(s) baixado(s).`)

  const tarName = `${baseName}.tar.gz`
  execSync(`tar -czf "${tarName}" -C "${OUT_DIR}" .`, { stdio: 'inherit' })
  rmSync(OUT_DIR, { recursive: true, force: true })
  console.log(`Empacotado em ${tarName}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
