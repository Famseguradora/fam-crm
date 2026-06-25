import { createBrowserClient } from '@supabase/ssr'
import { createSandboxClient } from './sandbox/mock-client'

function createRealClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function createClient() {
  // MODO SANDBOX: devolve um cliente FALSO que lê dados fictícios locais
  // (Excel + localStorage). Nunca conecta no banco real. Em produção este
  // ramo nunca roda (NEXT_PUBLIC_SANDBOX não está definido), comportamento
  // idêntico ao original.
  if (process.env.NEXT_PUBLIC_SANDBOX === 'true') {
    return createSandboxClient() as unknown as ReturnType<typeof createRealClient>
  }

  return createRealClient()
}
