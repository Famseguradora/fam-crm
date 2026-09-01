import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// '/api/whatsapp' é público: o webhook da Meta chega SEM sessão Supabase e é
// autenticado pela assinatura HMAC (x-hub-signature-256), não por login.
//
// '/voto' e '/api/voto' são a CÉDULA do Comitê: o diretor abre pelo WhatsApp,
// no celular dele, sem conta no CRM. A autenticação é o token de 256 bits na
// URL + confirmação dos 4 últimos dígitos do celular cadastrado — validados
// server-side em lib/comite/convites.ts, nunca por sessão.
//
// '/api/axi' é a integração do AxiMobius: chamada máquina-a-máquina, sem
// navegador e sem sessão Supabase. Autentica por `Authorization: Bearer` com
// comparação em tempo constante em lib/axi/core.ts. Estar nesta lista significa
// "não exige cookie de login", NÃO significa "aberta": sem o token correto toda
// rota /api/axi/* responde 401/403. Todas são somente GET.
//
// '/api/analise/evento' é o motor da análise avisando que começou uma análise.
// Ele é um processo Node na máquina do Marco, sem navegador e sem cookie de
// login: por isso não passa pelo gate de sessão. Vale aqui a mesma ressalva do
// /api/axi — "não exige cookie" NÃO é "aberta". A rota confere o segredo
// combinado (`x-analise-token`) e, se a variável de ambiente não existir, ela
// responde 503 em vez de aceitar: trava ausente fecha, não abre.
// '/api/analise/tomador' é o Finalizar Análise criando o cadastro do tomador
// quando o CNPJ ainda não existe (31/08/2026). Mesma porta e mesmo segredo das
// duas de cima: quem chama é o motor, que não tem sessão de navegador. Sem entrar
// nesta lista, a rota responderia o HTML do /login com status 200, e quem chamasse
// leria "deu certo" com nada gravado. Já aconteceu, ver o commit ef04644.
// '/api/agente/evento' é a irmã da de cima: o mesmo motor, na mesma máquina,
// dizendo qual funcionário virtual está trabalhando em quê (o chão de fábrica
// dos avatares). Mesma trava, mesmo segredo, mesma regra de "variável ausente
// responde 503". Esquecer esta linha não dá erro visível: o POST é redirecionado
// para /login, que responde 200 com o HTML da tela de login, e quem chamou
// conclui que gravou. Foi exatamente o que aconteceu em 31/08/2026, e só
// apareceu porque a conferência foi feita no banco, não no status HTTP.
const publicRoutes = ['/login', '/auth/callback', '/alterar-senha', '/onboarding', '/manifest.webmanifest', '/sw.js', '/api/whatsapp', '/voto', '/api/voto', '/api/axi', '/api/analise/evento', '/api/agente/evento', '/api/analise/pedido', '/api/analise/tomador']

export async function proxy(request: NextRequest) {
  // MODO SANDBOX: não há sessão Supabase, então o gate de login abaixo
  // redirecionaria o app inteiro (e o /sandbox-dados.xlsx) para /login.
  // Aqui liberamos tudo. Em produção (flag ausente) este ramo nunca roda.
  if (process.env.NEXT_PUBLIC_SANDBOX === 'true') {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Optimistic check only — reads session from cookie, no network call.
  // Token refresh and real JWT validation happen in layout.tsx (Node.js runtime).
  const { data: { session } } = await supabase.auth.getSession()
  const { pathname } = request.nextUrl
  const isPublic = publicRoutes.some((r) => pathname.startsWith(r))

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
