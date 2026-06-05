import { NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { verifySignature } from '@/lib/whatsapp/verify'
import { sendMenu, sendKpiCard, BTN } from '@/lib/whatsapp/client'
import { getKpisPorStatus } from '@/lib/operacoes/kpis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Menu (botão/intenção) → status real no banco + título exibido no card.
const STATUS_MAP: Record<string, { status: string; titulo: string }> = {
  [BTN.comite]: { status: 'Comitê', titulo: 'Operações em Comitê' },
  [BTN.aprovadas]: { status: 'Aprovado', titulo: 'Operações Aprovadas' },
  [BTN.emitidas]: { status: 'Emitido', titulo: 'Operações Emitidas' },
}

// Client service-role sem sessão — padrão usado em app/api/usuarios/route.ts.
function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// ── GET: verificação do webhook (Meta) ────────────────────────────────────
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const mode = sp.get('hub.mode')
  const token = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
  return new Response('Forbidden', { status: 403 })
}

// ── POST: eventos de mensagem ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // 1) Corpo cru lido uma única vez — necessário para validar o HMAC.
  const raw = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  if (!verifySignature(raw, signature)) {
    return new Response('Invalid signature', { status: 401 })
  }

  let body: any
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response('Bad body', { status: 400 })
  }

  // 2) Extrai a mensagem da estrutura aninhada da Cloud API.
  //    Eventos sem `messages` (ex.: statuses de entrega/leitura) são ignorados.
  const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  if (!message) return new Response('ok', { status: 200 })

  const from: string = message.from // E.164 só dígitos, ex.: '5511999998888'

  try {
    const supabase = adminClient()

    // 3) Autorização: telefone precisa ser de um admin ativo.
    const autorizado = await usuarioAutorizado(supabase, from)
    if (!autorizado) {
      // Número desconhecido / não-admin → silêncio (decisão de produto).
      return new Response('ok', { status: 200 })
    }

    // 4) Roteamento da intenção.
    //    Clique em botão conhecido → card de KPI.
    //    Palavra-gatilho "FAM" (qualquer variação) ou qualquer outro texto → menu.
    const alvo = resolverIntent(message)
    if (alvo) {
      const kpi = await getKpisPorStatus(supabase, alvo.status)
      await sendKpiCard(from, kpi, alvo.titulo)
    } else {
      await sendMenu(from)
    }
  } catch (e) {
    console.error('[whatsapp] Erro ao processar evento:', e)
  }

  // Sempre 200 para a Meta não reenfileirar.
  return new Response('ok', { status: 200 })
}

// Retorna o status/título quando a mensagem é um clique em botão conhecido; senão null (→ menu).
function resolverIntent(message: any): { status: string; titulo: string } | null {
  if (message?.type === 'interactive') {
    const id = message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id
    if (id && STATUS_MAP[id]) return STATUS_MAP[id]
  }
  return null
}

// Verifica se o remetente é um admin ativo, casando pelos dígitos finais do telefone.
// A Meta envia com DDI (55...); o banco guarda mascarado sem DDI ((11) 99999-8888).
async function usuarioAutorizado(supabase: SupabaseClient, fromE164: string): Promise<boolean> {
  const fromDigitos = fromE164.replace(/\D/g, '')
  if (fromDigitos.length < 10) return false

  const { data, error } = await supabase
    .from('usuarios')
    .select('telefone')
    .eq('perfil', 'admin')
    .eq('status', 'ativo')
    .not('telefone', 'is', null)

  if (error || !data) return false

  return data.some((u) => {
    const telDigitos = (u.telefone ?? '').replace(/\D/g, '')
    if (telDigitos.length < 10) return false
    // Casa pelos últimos 10–11 dígitos (DDD + número), tolerando o DDI extra.
    return fromDigitos.endsWith(telDigitos) || telDigitos.endsWith(fromDigitos)
  })
}
