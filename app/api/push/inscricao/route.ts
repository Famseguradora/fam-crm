// ============================================================================
//  /api/push/inscricao  ·  este celular (ou navegador) quer receber avisos
//
//  POST   guarda a inscrição que o navegador gerou (endpoint + chaves)
//  DELETE apaga, quando a pessoa desliga
//
//  Sessão + RLS: cada pessoa só mexe nas próprias inscrições.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as clienteServico } from '@supabase/supabase-js'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'

export const runtime = 'nodejs'

/* Só aceita o endereço de um serviço de push conhecido: o servidor vai fazer
   POST nele depois, e um endereço qualquer transformaria o CRM em mensageiro
   para dentro da rede de alguém. */
const SERVICOS = [
  /^https:\/\/fcm\.googleapis\.com\//,
  /^https:\/\/updates\.push\.services\.mozilla\.com\//,
  /^https:\/\/web\.push\.apple\.com\//,
  /^https:\/\/[a-z0-9-]+\.notify\.windows\.com\//,
  /^https:\/\/wns2-[a-z0-9-]+\.notify\.windows\.com\//,
]

export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })

  let corpo: { endpoint?: string; keys?: { p256dh?: string; auth?: string }; aparelho?: string } = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }
  const endpoint = String(corpo.endpoint ?? '')
  const p256dh = String(corpo.keys?.p256dh ?? '')
  const auth = String(corpo.keys?.auth ?? '')
  if (!SERVICOS.some((r) => r.test(endpoint))) return NextResponse.json({ erro: 'Serviço de push desconhecido.' }, { status: 422 })
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{20,24}$/.test(auth)) {
    return NextResponse.json({ erro: 'Chaves do navegador inválidas.' }, { status: 422 })
  }

  /* QUEM GRAVA É O SERVIDOR, com a chave de serviço, e só depois de validar
     acima (revisão de 30/09/2026: gravação direta do navegador deixava pôr um
     endereço qualquer). Aparelho compartilhado: quem está logado agora passa
     a ser o dono do aviso neste aparelho, e o anterior deixa de receber aqui. */
  /* Cliente de serviço PURO: o `createAdminClient` do projeto lê o cookie de
     quem está logado e acaba rodando com a permissão da pessoa (medido no
     ensaio de 30/09/2026: a gravação voltava barrada pela RLS). */
  const admin = clienteServico(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { error } = await admin.from('push_inscricoes').upsert({
    auth_id: user.id, endpoint, p256dh, auth, aparelho: String(corpo.aparelho ?? '').slice(0, 120) || null, falhou_em: null,
  }, { onConflict: 'endpoint' })
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })
  let corpo: { endpoint?: string } = {}
  try { corpo = await req.json() } catch { /* sem corpo: nada a apagar */ }
  if (corpo.endpoint) await supabase.from('push_inscricoes').delete().eq('endpoint', corpo.endpoint).eq('auth_id', user.id)
  return NextResponse.json({ ok: true })
}
