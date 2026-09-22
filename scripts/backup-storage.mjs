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
import { tmpdir } from 'node:os'

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

/* A PASTA DE TRABALHO SAIU DE DENTRO DO ONEDRIVE (22/09/2026)
   Era `_anexos_tmp`, relativo ao cwd — ou seja, DENTRO da pasta do projeto, que
   e sincronizada. Baixar os 775 MB do bucket ali faz o OneDrive tentar subir
   cada arquivo enquanto o script ainda escreve: gasta banda, engasga a
   sincronizacao e termina em `EBUSY / WinError 32`. Flagrado com 136 MB ja
   baixados.
   Agora a pasta de trabalho fica no TEMP do Windows, fora de qualquer pasta
   sincronizada. So o .tar.gz final vai para o destino que o usuario pediu. */
const OUT_DIR = join(process.env.TEMP || process.env.TMP || tmpdir(), `fam-anexos-tmp-${process.pid}`)

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
    // Sinal de vida: 574 arquivos e centenas de MB levam minutos, e sem isto
    // nao ha como distinguir "baixando" de "travado".
    if (ok % 50 === 0) console.log(`  ${ok}/${paths.length} arquivo(s)...`)
  }
  console.log(`${ok}/${paths.length} arquivo(s) baixado(s).`)

  /* O `tar` LE "C:" COMO NOME DE SERVIDOR (22/09/2026)
     `tar -czf "C:/.../arquivo.tar.gz"` falha com "Cannot connect to C: resolve
     failed": para o tar do GNU, tudo que vem antes de ":" e um host remoto. E
     falha DEPOIS de baixar os 574 arquivos, que e a pior hora possivel.
     A saida e nao deixar a letra do disco no argumento do `-f`: o tar roda COM
     O CWD na pasta de destino e recebe so o nome do arquivo. `--force-local`
     resolveria no GNU, mas o tar que vem no Windows (bsdtar) nao conhece essa
     opcao, e a tarefa agendada roda por ele. */
  const tarName = `${baseName}.tar.gz`
  const pastaDoPacote = dirname(tarName)
  const soONome = tarName.slice(pastaDoPacote.length + 1)
  if (pastaDoPacote && !existsSync(pastaDoPacote)) mkdirSync(pastaDoPacote, { recursive: true })
  execSync(`tar -czf "${soONome}" -C "${OUT_DIR}" .`, {
    stdio: 'inherit',
    cwd: pastaDoPacote || process.cwd(),
  })

  /* SO APAGA O TEMPORARIO DEPOIS DE CONFERIR O PACOTE. Apagar os 574 arquivos
     confiando num tar que ninguem abriu e apagar o backup junto. */
  const dentro = execSync(`tar -tzf "${soONome}"`, {
    cwd: pastaDoPacote || process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  }).split(/\r?\n/).filter((l) => l.trim() && !l.trim().endsWith('/')).length

  if (dentro !== ok) {
    console.error(`ATENCAO: baixei ${ok} arquivo(s) e o pacote tem ${dentro}. O temporario fica em ${OUT_DIR} para conferencia.`)
    process.exit(1)
  }

  rmSync(OUT_DIR, { recursive: true, force: true })
  console.log(`Empacotado em ${tarName} — ${dentro} arquivo(s) conferido(s) dentro do pacote.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
