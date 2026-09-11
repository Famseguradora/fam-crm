// ============================================================================
//  POST /api/email/classificar  ·  a decisão individual sobre um pedido
//
//  Ordem do Marco em 11/09/2026: "quando ele precisar fazer algo fora do
//  parâmetro, ele faz individual". É aqui: a pessoa diz o que um pedido é, e
//  isso vence a régua (e, na fase 2, a IA). A régua não muda; o pedido muda.
//
//  Corpo: { ids, tipo, modalidade?, motivo? }
//    tipo  operacao | so_credito | nao_demanda | sem_apetite
//          null desfaz a decisão da pessoa, e a régua volta a decidir
//
//  `ids` são TODOS os e-mails do pedido (o primeiro, os RE e os ENC): a
//  decisão vale para o pedido, e não para uma linha dele.
//
//  UMA VERDADE PARA "É PEDIDO": a caixa, os cartões antigos e a esteira leem
//  `emails_caixa.eh_pedido`. Por isso "não é pedido" grava também ali, e
//  qualquer outro tipo grava que É. Sem isso, a mesma linha seria pedido numa
//  tela e lixo na outra.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'

export const runtime = 'nodejs'

const TIPOS = ['operacao', 'so_credito', 'nao_demanda', 'sem_apetite'] as const
type Tipo = (typeof TIPOS)[number]

export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }

  const ids = [...new Set((Array.isArray(corpo.ids) ? corpo.ids : []).map((x) => String(x ?? '')).filter(Boolean))]
  if (!ids.length) return NextResponse.json({ erro: 'Falta dizer qual e-mail.' }, { status: 422 })
  // Sem isto, um id torto voltava como 500 com a mensagem crua do banco.
  if (ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return NextResponse.json({ erro: 'Algum dos e-mails indicados não existe.' }, { status: 422 })
  }
  if (ids.length > 100) return NextResponse.json({ erro: 'Mais de 100 e-mails de uma vez.' }, { status: 413 })

  const desfazer = corpo.tipo === null
  const tipo = String(corpo.tipo ?? '') as Tipo
  if (!desfazer && !TIPOS.includes(tipo)) {
    return NextResponse.json({ erro: 'Tipo desconhecido (operacao, so_credito, nao_demanda, sem_apetite).' }, { status: 422 })
  }
  const motivo = String(corpo.motivo ?? '').trim().slice(0, 500) || null
  let modalidade = String(corpo.modalidade ?? '').trim() || null

  if (modalidade) {
    const { data: mods } = await supabase.from('modalidades').select('nome')
    const achada = (mods ?? []).map((m) => String(m.nome)).find((n) => n.toLowerCase() === modalidade!.toLowerCase())
    if (!achada) return NextResponse.json({ erro: `"${modalidade}" não é uma modalidade cadastrada.` }, { status: 422 })
    modalidade = achada
  }
  if (tipo === 'sem_apetite' && !motivo && !modalidade) {
    return NextResponse.json({ erro: 'Diga por que está fora do apetite (é o que fica no recibo).' }, { status: 422 })
  }

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const nome = quem?.nome ?? user.email ?? 'alguém'
  const agora = new Date().toISOString()

  /* DESFAZER vale para a decisão individual do pedido, de quem tiver tomado:
     a decisão é da equipe, e não de uma pessoa (o último que decide vence, e a
     trilha guarda quem desfez o quê). */
  if (desfazer) {
    const { data, error } = await supabase
      .from('email_classificacao').delete().eq('origem', 'humano').in('email_id', ids).select('email_id')
    if (error) {
      console.error('[email/classificar] desfazer:', error.message)
      return NextResponse.json({ erro: 'Não consegui desfazer a decisão. Tente de novo.' }, { status: 500 })
    }
    if (!data?.length) {
      return NextResponse.json({ erro: 'Nada mudou. Não havia decisão individual nesses e-mails, ou você não tem permissão de escrita.' }, { status: 403 })
    }
    /* Sem decisão, o pedido volta a ser PERGUNTA ("é pedido?" em aberto), e
       não fica com o "é" ou o "não é" que o espelho tinha gravado. */
    const desfeitos = data.map((d) => d.email_id)
    const { error: erroEspelho } = await supabase.from('emails_caixa')
      .update({ eh_pedido: null, classificado_por: null, classificado_em: null })
      .in('id', desfeitos).is('caso_id', null)
    if (erroEspelho) console.error('[email/classificar] espelho do desfazer:', erroEspelho.message)
    return NextResponse.json({
      ok: true,
      desfeitos: data.length,
      ...(erroEspelho ? { aviso: 'A decisão foi desfeita, mas a caixa de e-mail não foi atualizada. Recarregue a tela.' } : {}),
    })
  }

  const { data: vigente } = await supabase
    .from('email_regua').select('versao').order('versao', { ascending: false }).limit(1).maybeSingle()

  const linhas = ids.map((email_id) => ({
    email_id,
    origem: 'humano',
    tipo,
    modalidade: tipo === 'operacao' || tipo === 'sem_apetite' ? modalidade : null,
    motivo,
    confianca: 'seguro',
    regua_versao: vigente?.versao ?? null,
    classificado_por: nome,
    classificado_por_auth_id: user.id,
    classificado_em: agora,
  }))

  const { data, error } = await supabase
    .from('email_classificacao')
    .upsert(linhas, { onConflict: 'email_id,origem' })
    .select('email_id')
  if (error) {
    const barrado = error.code === '42501' || /row-level security/i.test(error.message)
    if (!barrado) console.error('[email/classificar] gravar:', error.message)
    return NextResponse.json(
      { erro: barrado ? 'Você não tem permissão de escrita nesta caixa.' : 'Não consegui gravar a decisão. Tente de novo.' },
      { status: barrado ? 403 : 500 },
    )
  }
  if (!data?.length) return NextResponse.json({ erro: 'Nada mudou. Você tem permissão só de leitura?' }, { status: 403 })

  /* Espelho em `eh_pedido`. E-mail que já virou caso fica como está: o caso
     já provou que era pedido, e ninguém desfaz isso por aqui. */
  const { error: erroEspelho } = await supabase.from('emails_caixa')
    .update({ eh_pedido: tipo !== 'nao_demanda', classificado_por: nome, classificado_em: agora })
    .in('id', ids).is('caso_id', null)
  if (erroEspelho) console.error('[email/classificar] espelho:', erroEspelho.message)

  return NextResponse.json({
    ok: true, classificados: data.length, tipo, modalidade,
    ...(erroEspelho ? { aviso: 'A decisão foi gravada, mas a caixa de e-mail não foi atualizada. Recarregue a tela.' } : {}),
  })
}
