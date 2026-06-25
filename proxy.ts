import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// '/api/whatsapp' é público: o webhook da Meta chega SEM sessão Supabase e é
// autenticado pela assinatura HMAC (x-hub-signature-256), não por login.
const publicRoutes = ['/login', '/auth/callback', '/alterar-senha', '/onboarding', '/manifest.webmanifest', '/sw.js', '/api/whatsapp']

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
