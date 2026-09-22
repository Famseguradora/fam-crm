// ============================================================================
//  BACKUP DOS DOCUMENTOS, QUANDO ELE MANDAR  ·  22/09/2026
//
//  Ordem dele: "não precisa ficar baixando todos os documentos toda vez, senão
//  teremos documentos duplicados desnecessariamente. Insira um botão no CRM que
//  só eu tenho acesso (proprietário) de fazer backup, assim eu farei o backup
//  quando quiser."
//
//  POR QUE ISTO EXISTE, E POR QUE NAO ENTROU NA TAREFA AGENDADA
//  ---------------------------------------------------------------------------
//  O backup diario do Supabase (plano Pro) salva o BANCO e diz, na propria tela:
//  "Storage objects are not included". Os 574 documentos dos tomadores nao estao
//  em backup nenhum do provedor. Esta e a unica copia deles.
//
//  E sao 609 MB por execucao. Rodar isso 3x por semana encheria o SharePoint de
//  copias quase identicas — a duplicacao que ele nao quer. Por isso: manual, na
//  hora que ele decidir, e o backup do BANCO (Seg/Qua/Sex) segue intocado.
//
//  PRIMEIRO NO TEMP, DEPOIS MOVE PARA A REDE
//  ---------------------------------------------------------------------------
//  O pacote nasce no TEMP do Windows e so entao vai para a pasta da FAM, de uma
//  vez. Escrever 609 MB direto numa pasta que o OneDrive sincroniza faz ele
//  tentar subir o arquivo enquanto o `tar` ainda escreve.
//
//  Uso:  node scripts/backup-anexos.mjs
// ============================================================================
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync, copyFileSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(__dirname, '..')

const DESTINO = process.env.FAM_BACKUP_DIR
  || 'C:\\Users\\MarcoDragoneFAMSEGUR\\FAM Seguradora\\FAM SEGURADORA - Documents\\Infraestrutura\\Backup - Dashboard FAM'
const PREFIXO = 'fam-crm-anexos-'

/* DUAS GERACOES, e nao tres como o backup do banco. Cada pacote tem 609 MB: as
   tres linhas de defesa do banco custam 1,4 MB, as dos documentos custariam
   1,8 GB no SharePoint. Duas ja da o que importa — uma copia boa e a anterior,
   caso a ultima tenha saido de um dia ruim. */
const MANTER = 2

const log = (msg, nivel = 'INFO') => {
  const linha = `[${new Date().toISOString()}] [${nivel}] ${msg}`
  console.log(linha)
  try { appendFileSync(join(RAIZ, 'backup-anexos.log'), linha + '\n') } catch { /* o log nao pode derrubar o backup */ }
}

function env() {
  const arq = join(RAIZ, '.env.local')
  const fora = {}
  if (!existsSync(arq)) return fora
  for (const cru of readFileSync(arq, 'utf8').split(/\r?\n/)) {
    const linha = cru.trim()
    if (!linha || linha.startsWith('#')) continue
    const i = linha.indexOf('=')
    if (i === -1) continue
    let v = linha.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    fora[linha.slice(0, i).trim()] = v
  }
  return fora
}

const hoje = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function rotacionar() {
  const pacotes = readdirSync(DESTINO)
    .filter((f) => f.startsWith(PREFIXO) && f.endsWith('.tar.gz'))
    .map((f) => ({ f, t: statSync(join(DESTINO, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const { f } of pacotes.slice(MANTER)) {
    unlinkSync(join(DESTINO, f))
    log(`Rotacao: removido ${f}`)
  }
}

const ambiente = env()
const url = ambiente.NEXT_PUBLIC_SUPABASE_URL || ambiente.SUPABASE_URL
const chave = ambiente.SUPABASE_SERVICE_ROLE_KEY
if (!url || !chave) {
  log('Faltam credenciais no .env.local (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).', 'ERRO')
  process.exit(1)
}
if (!existsSync(DESTINO)) {
  try { mkdirSync(DESTINO, { recursive: true }) }
  catch (e) { log(`Destino inacessivel: ${DESTINO} — ${e.message}`, 'ERRO'); process.exit(1) }
}

const nome = `${PREFIXO}${hoje()}`
const provisorio = join(tmpdir(), nome)

log(`Backup dos documentos iniciado. Destino final: ${DESTINO}`)

const r = spawnSync(process.execPath, [join(RAIZ, 'scripts', 'backup-storage.mjs'), provisorio], {
  cwd: RAIZ,
  env: { ...process.env, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: chave },
  encoding: 'utf8',
})
if (r.stdout) for (const l of r.stdout.split(/\r?\n/)) if (l.trim()) log(`  ${l.trim()}`)
if (r.status !== 0) {
  log(`O empacotamento falhou (codigo ${r.status}). ${String(r.stderr || '').split(/\r?\n/).filter(Boolean).slice(-3).join(' | ')}`, 'ERRO')
  process.exit(1)
}

/* MOVER PARA A REDE. `renameSync` entre discos diferentes (TEMP em C:, destino
   no OneDrive) lanca EXDEV; nesse caso copia e apaga. */
const pronto = `${provisorio}.tar.gz`
const final = join(DESTINO, `${nome}.tar.gz`)
try {
  renameSync(pronto, final)
} catch {
  copyFileSync(pronto, final)
  unlinkSync(pronto)
}

const mb = (statSync(final).size / 1024 / 1024).toFixed(1)
rotacionar()
log(`Backup dos documentos OK: ${nome}.tar.gz (${mb} MB) em ${DESTINO}`)
