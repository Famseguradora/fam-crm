// ============================================================================
//  POST /api/lembretes/push  ·  o relógio do Supabase cutuca, o CRM avisa
//
//  O `pg_cron` põe a notificação no sino (tabela `notificacoes`) e chama esta
//  rota com o segredo do cofre. Aqui mora a criptografia do push
//  (lib/push/webpush.ts): cada notificação ainda sem push vai para todo
//  celular/navegador que a pessoa inscreveu.
//
//  Trava: o segredo LEMBRETES_TOKEN (o mesmo guardado no Vault como
//  `lembretes_token`). Sem sessão de pessoa: quem chama é o banco.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { enviarPush } from '@/lib/push/webpush'
import { VAPID_PUBLICA } from '@/lib/push/chave-publica'

export const runtime = 'nodejs'
export const maxDuration = 60

const CONTATO = 'https://fam-crm-five.vercel.app'

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 503 })
  const sb = createClient(url, chave, { auth: { persistSession: false } })

  /* Os segredos vêm do ambiente, ou do cofre do Supabase (`lembretes_segredos`,
     só a chave de serviço lê). O cofre é o caminho da produção: o deploy não
     depende de cadastrar variável na Vercel. */
  let segredo = process.env.LEMBRETES_TOKEN ?? ''
  let privada = process.env.VAPID_PRIVATE_KEY ?? ''
  if (!segredo || !privada) {
    const { data } = await sb.rpc('lembretes_segredos')
    const s = (Array.isArray(data) ? data[0] : data) as { vapid_private: string | null; token: string | null } | null
    segredo ||= s?.token ?? ''
    privada ||= s?.vapid_private ?? ''
  }
  if (!segredo) return NextResponse.json({ erro: 'Rota não configurada (lembretes_token).' }, { status: 503 })
  const veio = Buffer.from(req.headers.get('x-lembretes-token') ?? '')
  const certo = Buffer.from(segredo)
  if (veio.length !== certo.length || !crypto.timingSafeEqual(veio, certo)) return NextResponse.json({ erro: 'Segredo inválido.' }, { status: 401 })

  const publica = VAPID_PUBLICA
  if (!privada) return NextResponse.json({ erro: 'Push não configurado (vapid_private).' }, { status: 503 })

  const { data: pendentes } = await sb
    .from('notificacoes')
    .select('id, para_auth_id, titulo, texto, link, lembrete_id')
    .is('push_em', null)
    .gte('criado_em', new Date(Date.now() - 86400000).toISOString())
    .order('criado_em')
    .limit(200)
  if (!pendentes?.length) return NextResponse.json({ ok: true, enviados: 0 })

  /* Marca ANTES de enviar: o relógio chama de novo em um minuto, e uma
     notificação lenta não pode chegar duas vezes no celular. */
  const ids = pendentes.map((n) => n.id)
  await sb.from('notificacoes').update({ push_em: new Date().toISOString() }).in('id', ids)

  const pessoas = [...new Set(pendentes.map((n) => n.para_auth_id as string))]
  const { data: inscricoes } = await sb
    .from('push_inscricoes').select('id, auth_id, endpoint, p256dh, auth').in('auth_id', pessoas)

  let enviados = 0
  const mortas: string[] = []
  for (const n of pendentes) {
    for (const i of (inscricoes ?? []).filter((x) => x.auth_id === n.para_auth_id)) {
      const r = await enviarPush(
        { endpoint: i.endpoint, p256dh: i.p256dh, auth: i.auth },
        { titulo: n.titulo, texto: n.texto, link: n.link, tag: n.lembrete_id ?? n.id },
        { publica, privada }, CONTATO,
      )
      if (r.ok) enviados++
      else if (r.expirada) mortas.push(i.id)
      else await sb.from('push_inscricoes').update({ falhou_em: new Date().toISOString() }).eq('id', i.id)
    }
  }
  // O navegador desinstalou ou revogou: a inscrição morreu, e guardar é tentar para sempre.
  if (mortas.length) await sb.from('push_inscricoes').delete().in('id', [...new Set(mortas)])

  return NextResponse.json({ ok: true, notificacoes: pendentes.length, enviados, removidas: mortas.length })
}
