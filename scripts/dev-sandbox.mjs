// ============================================================
//  Sobe o CRM em MODO SANDBOX (dados fictícios locais).
//  Rode:  npm run dev:sandbox
//
//  Blindagem: injeta NEXT_PUBLIC_SANDBOX=true e SUBSTITUI as chaves
//  do Supabase por valores FALSOS. Como `process.env` tem precedência
//  sobre `.env.local` no Next.js, o processo do sandbox NÃO recebe as
//  credenciais reais — é fisicamente impossível tocar o banco oficial.
// ============================================================
import { spawn } from 'node:child_process'

const env = {
  ...process.env,
  NEXT_PUBLIC_SANDBOX: 'true',
  NEXT_PUBLIC_SUPABASE_URL: 'https://sandbox.invalid',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sandbox-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'sandbox-service-key',
}

console.log('🧪 FAM CRM — MODO SANDBOX (dados fictícios, banco real intocado)')

const child = spawn('next dev', { stdio: 'inherit', env, shell: true })
child.on('exit', (code) => process.exit(code ?? 0))
