// ============================================================================
//  OS AGENTES DO NOTEBOOK, vistos pelo CRM local  ·  10/09/2026
//
//  Ordem do Marco: "tudo que eu tiver que clicar, você tem que inserir dentro do
//  sistema: um botão". Duplo clique em .cmd e .vbs para ligar ou reiniciar um
//  agente acabou; quem liga é o CRM, porque o localhost:3000 roda na MESMA
//  máquina que os agentes.
//
//  As peças de achar, ligar e parar um `node scripts/<agente>.mjs` moram aqui,
//  num lugar só, para o Carteiro e a Esteira não terem duas regras de "está de
//  pé". A regra de nome exige o ARQUIVO inteiro: `*carteiro.mjs*` já casou com
//  `ensaio-agente-carteiro.mjs` e o contou como um segundo Carteiro.
// ============================================================================
import { spawn, execFile } from 'node:child_process'
import fs from 'node:fs'

export interface Rodando { pid: number; desde: string | null }

/** Este servidor está numa máquina que roda o agente (e não na Vercel)? */
export const ehMaquinaLocal = (script: string) =>
  !process.env.VERCEL && process.platform === 'win32' && fs.existsSync(script)

function powershell(comando: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', comando],
      { timeout: 20_000, windowsHide: true },
      (err, stdout) => resolve(err ? '' : String(stdout)),
    )
  })
}

/** Os `node ... <arquivo>` de pé, por qualquer caminho. O filtro `Name='node.exe'`
 *  fica no CIM para o próprio powershell da pergunta não se achar. */
export async function processosDoScript(arquivo: string): Promise<Rodando[]> {
  const nome = arquivo.replace(/\./g, '\\.')
  const comando =
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
    `Where-Object { $_.CommandLine -match '(^|[\\\\/\\s"])${nome}(["\\s]|$)' } | ` +
    "ForEach-Object { \"$($_.ProcessId)|$($_.CreationDate.ToString('o'))\" }"
  return (await powershell(comando))
    .split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => { const [pid, desde] = l.split('|'); return { pid: Number(pid), desde: desde || null } })
    .filter((r) => Number.isFinite(r.pid) && r.pid > 0)
}

export async function pararProcessos(pids: number[]) {
  const validos = pids.filter((p) => Number.isInteger(p) && p > 0)
  if (!validos.length) return
  await powershell(`Stop-Process -Id ${validos.join(',')} -Force -ErrorAction SilentlyContinue`)
}

/** Liga sem janela. `detached` + `unref`: o agente sobrevive a um restart do CRM. */
export function ligarScript(script: string, cwd: string, log: string, cabecalho: string) {
  let fd: number | null = null
  try {
    fd = fs.openSync(log, 'a')
    fs.writeSync(fd, `\n==== ${cabecalho} em ${new Date().toLocaleString('pt-BR')} ====\n`)
    const filho = spawn(process.execPath, [script], { cwd, detached: true, windowsHide: true, stdio: ['ignore', fd, fd] })
    filho.unref()
  } finally {
    if (fd !== null) { try { fs.closeSync(fd) } catch { /* o filho tem a própria cópia */ } }
  }
}

export function caudaDe(log: string, linhas = 8): string {
  try {
    return fs.readFileSync(log, 'utf8').split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean).slice(-linhas).join('\n')
  } catch {
    return ''
  }
}
