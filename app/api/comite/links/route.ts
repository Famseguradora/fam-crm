// ============================================================================
//  Links da cédula — `/api/comite/links`
//
//  GET  ?operacaoId=…  → devolve o link geral (lista de transmissão) + um link
//                        pessoal por diretor, já com a mensagem pronta.
//  PATCH { conviteId, acao } → marca como enviado ou revoga.
//
//  Exige sessão do CRM (é a Subscrição usando o sistema). A rota pública que o
//  diretor consome é outra: /api/voto.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient, gerarToken } from '@/lib/comite/convites'
import { montarConvite } from '@/lib/comite/whatsapp-sim'
import { toWhatsAppNumber } from '@/lib/whatsapp/client'
import type { Operacao, ComiteConvite, Usuario } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Base pública do link. Em produção use NEXT_PUBLIC_APP_URL (ex.:
// https://crm.famseguradora.com.br); sem ela, cai na origem da requisição.
function baseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  return env || request.nextUrl.origin
}

type Status = 'pendente' | 'enviado' | 'aberto' | 'votado'

function statusDo(c: ComiteConvite | null, votou: boolean): Status {
  if (votou) return 'votado'
  if (!c) return 'pendente'
  if (c.aberto_em) return 'aberto'
  if (c.enviado_em) return 'enviado'
  return 'pendente'
}

export async function GET(request: NextRequest) {
  try {
    const sessao = await createClient()
    const { data: { user } } = await sessao.auth.getUser()
    if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })

    const operacaoId = request.nextUrl.searchParams.get('operacaoId')
    if (!operacaoId) return NextResponse.json({ erro: 'operacaoId é obrigatório.' }, { status: 400 })

    const supabase = adminClient()

    const { data: op } = await supabase
      .from('operacoes')
      .select('*, tomador:tomadores(*), produto:produtos(*)')
      .eq('id', operacaoId)
      .maybeSingle()
    if (!op) return NextResponse.json({ erro: 'Operação não encontrada.' }, { status: 404 })

    const [{ data: membros }, { data: convites }, { data: votos }, { data: quemSou }] = await Promise.all([
      supabase.from('usuarios').select('*').eq('comite', true).eq('status', 'ativo').order('nome'),
      supabase.from('comite_convites').select('*').eq('operacao_id', operacaoId).is('revogado_em', null),
      supabase.from('comite_votos').select('usuario_id').eq('operacao_id', operacaoId),
      supabase.from('usuarios').select('id, nome, cargo').eq('auth_id', user.id).maybeSingle(),
    ])

    const lista = (convites ?? []) as ComiteConvite[]
    const votaram = new Set((votos ?? []).map((v: { usuario_id: string }) => v.usuario_id))
    const criadoPor = (quemSou?.id as string) ?? null
    const base = baseUrl(request)
    // Quem ASSINA o convite é quem está enviando agora (usuário logado no CRM).
    // Só cai no subscritor_nome da operação, e depois no genérico, se o usuário
    // logado não tiver cadastro em `usuarios`.
    const subscritorNome =
      (quemSou?.nome as string | undefined) ??
      (op as Operacao).subscritor_nome ??
      'Subscrição FAM'
    // Cargo exato do remetente (Executivo de Crédito, Diretor, etc.) — não é
    // sempre "Subscritor". Vazio cai no rótulo genérico dentro de montarConvite.
    const remetenteCargo = (quemSou?.cargo as string | null | undefined) ?? null

    // ── Link GERAL da operação (o que vai na lista de transmissão) ──────────
    let geral = lista.find((c) => c.usuario_id === null) ?? null
    if (!geral || new Date(geral.expira_em).getTime() < Date.now()) {
      // Expirado vira revogado e um novo é emitido — o link antigo morre.
      if (geral) {
        await supabase.from('comite_convites')
          .update({ revogado_em: new Date().toISOString() }).eq('id', geral.id)
      }
      const { data: novo } = await supabase.from('comite_convites').insert({
        operacao_id: operacaoId, usuario_id: null, escopo: 'operacao',
        token: gerarToken(), criado_por: criadoPor,
      }).select('*').maybeSingle()
      geral = (novo as ComiteConvite) ?? null
    }

    // ── Um link PESSOAL por diretor ─────────────────────────────────────────
    const pessoais = []
    for (const m of (membros ?? []) as Usuario[]) {
      let c = lista.find((x) => x.usuario_id === m.id) ?? null
      if (!c || new Date(c.expira_em).getTime() < Date.now()) {
        if (c) {
          await supabase.from('comite_convites')
            .update({ revogado_em: new Date().toISOString() }).eq('id', c.id)
        }
        const { data: novo } = await supabase.from('comite_convites').insert({
          operacao_id: operacaoId, usuario_id: m.id, escopo: 'pessoal',
          token: gerarToken(), criado_por: criadoPor,
          nome_snapshot: m.nome, cargo_snapshot: m.cargo ?? null,
          telefone_snapshot: m.telefone ?? null,
        }).select('*').maybeSingle()
        c = (novo as ComiteConvite) ?? null
      }
      if (!c) continue

      const url = `${base}/voto/${c.token}`
      pessoais.push({
        conviteId: c.id,
        usuarioId: m.id,
        nome: m.nome,
        cargo: m.cargo ?? null,
        telefone: m.telefone ?? null,
        whatsapp: toWhatsAppNumber(m.telefone ?? ''),
        url,
        // Mesmo texto do convite do WhatsApp — uma fonte só para os dois canais.
        mensagem: `${montarConvite({ diretorNome: m.nome, subscritorNome, remetenteCargo, op: op as Operacao })}\n\n*Sua cédula de votação:*\n${url}`,
        status: statusDo(c, votaram.has(m.id)),
        aberturas: c.aberturas,
      })
    }

    const urlGeral = geral ? `${base}/voto/${geral.token}` : null
    const msgGeral = urlGeral
      ? `${montarConvite({ diretorNome: null, subscritorNome, remetenteCargo, op: op as Operacao })}\n\n*Cédula de votação do Comitê:*\n${urlGeral}\n\n_Cada diretor se identifica ao abrir, com seu nome e os 4 últimos dígitos do celular cadastrado na FAM. O voto é individual e registrado no CRM._`
      : null

    return NextResponse.json({
      ok: true,
      geral: geral ? { conviteId: geral.id, url: urlGeral, mensagem: msgGeral, expiraEm: geral.expira_em } : null,
      pessoais,
    })
  } catch (e) {
    console.error('[comite/links] erro:', e)
    return NextResponse.json({ erro: 'Erro ao gerar os links.' }, { status: 500 })
  }
}

// PATCH { conviteId, acao: 'marcar_enviado' | 'revogar' }
export async function PATCH(request: NextRequest) {
  try {
    const sessao = await createClient()
    const { data: { user } } = await sessao.auth.getUser()
    if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })

    const { conviteId, acao } = await request.json()
    if (!conviteId || !['marcar_enviado', 'revogar'].includes(acao)) {
      return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 })
    }

    const patch = acao === 'revogar'
      ? { revogado_em: new Date().toISOString() }
      : { enviado_em: new Date().toISOString() }

    await adminClient().from('comite_convites').update(patch).eq('id', conviteId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[comite/links] erro no PATCH:', e)
    return NextResponse.json({ erro: 'Erro ao atualizar o convite.' }, { status: 500 })
  }
}
