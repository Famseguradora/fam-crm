/* PEDIDO DE OUTRA PÁGINA NÃO PASSA · a trava contra CSRF das rotas que agem
   ═══════════════════════════════════════════════════════════════════════════

   Achado da revisão de segurança de 11/09/2026: o cookie de sessão é
   SameSite=Lax, e para o navegador as portas do mesmo localhost (3000, 7311,
   7312) são o MESMO site. Uma página aberta em outra porta poderia mandar um
   POST para "abrir a pasta", "conferir em lote" ou "classificar com a IA"
   usando a sessão de quem está logado.

   Todo navegador manda o cabeçalho Origin num POST de fetch. Se ele existe e
   não é o próprio host, a rota recusa. Sem Origin (curl, o Carteiro, a
   Esteira) a rota segue, e continua exigindo a sessão ou o segredo dela. */

import { NextResponse, type NextRequest } from 'next/server'

export function recusarOutraOrigem(req: NextRequest): NextResponse | null {
  const origem = req.headers.get('origin')
  if (!origem) return null
  let host = ''
  try { host = new URL(origem).host } catch {
    return NextResponse.json({ erro: 'Pedido de origem inválida.' }, { status: 403 })
  }
  const alvo = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  if (host === alvo) return null
  return NextResponse.json({ erro: 'Pedido vindo de outra página: recusado.' }, { status: 403 })
}
