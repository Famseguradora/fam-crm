// ============================================================================
//  O cofre — `/api/financeiro/cofre`
//
//  GET  → os envelopes (texto cifrado; sem a senha não abrem nada)
//  POST → grava um envelope novo (a chave do cofre embrulhada numa senha)
//  PATCH{ envelopeId } → revoga um envelope
//
//  ESTA ROTA NUNCA VÊ A CHAVE DO COFRE. Ela recebe o envelope já fechado pelo
//  navegador e o guarda. O servidor não tem como abrir, e quem escreveu este
//  arquivo também não · é esse o pedido do Marco, e ele só é verdade porque a
//  cifragem acontece do outro lado.
//
//  Se algum dia alguém acrescentar aqui um campo com a senha ou com a chave em
//  claro, o sigilo acaba nesse commit. Não acrescente.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { quemFinanceiro, negado } from '@/lib/financeiro/acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIN_ITERACOES = 100000

export async function GET() {
  const quem = await quemFinanceiro()
  if (!quem.ve) return negado()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('financeiro_cofre_envelope')
    .select('id, rotulo, tipo, usuario_id, kdf, iteracoes, sal, nonce, cofre_cifrado, criado_em, revogado_em')
    .is('revogado_em', null)
    .order('criado_em', { ascending: true })

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

  return NextResponse.json({
    envelopes: data ?? [],
    // quem sou eu, para o navegador saber qual envelope tentar abrir
    eu: quem.usuarioId,
    // cofre ainda não existe: a tela vai oferecer a criação da senha
    virgem: (data ?? []).length === 0,
  })
}

export async function POST(request: NextRequest) {
  const quem = await quemFinanceiro()
  if (!quem.ve) return negado()
  if (!quem.edita) return negado('Seu acesso ao Financeiro é somente de leitura.')

  let c: {
    rotulo?: string; tipo?: string; usuarioId?: string | null
    iteracoes?: number; sal?: string; nonce?: string; cofreCifrado?: string
  }
  try { c = await request.json() } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }) }

  if (c.tipo !== 'senha' && c.tipo !== 'recuperacao') {
    return NextResponse.json({ erro: 'Tipo de envelope inválido.' }, { status: 400 })
  }
  if (typeof c.iteracoes !== 'number' || c.iteracoes < MIN_ITERACOES) {
    return NextResponse.json({ erro: `A derivação precisa de pelo menos ${MIN_ITERACOES} iterações.` }, { status: 400 })
  }
  for (const campo of ['sal', 'nonce', 'cofreCifrado'] as const) {
    const v = c[campo]
    if (typeof v !== 'string' || !v || v.length > 20000 || !/^[A-Za-z0-9+/=]+$/.test(v)) {
      return NextResponse.json({ erro: `Campo ${campo} ausente ou fora do formato.` }, { status: 400 })
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('financeiro_cofre_envelope')
    .insert({
      rotulo: String(c.rotulo ?? '').slice(0, 120) || 'sem rótulo',
      tipo: c.tipo,
      usuario_id: c.tipo === 'senha' ? (c.usuarioId ?? quem.usuarioId) : null,
      iteracoes: c.iteracoes,
      sal: c.sal, nonce: c.nonce, cofre_cifrado: c.cofreCifrado,
      criado_por: quem.usuarioId,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ erro: 'Essa pessoa já tem uma senha do cofre. Revogue a antiga primeiro.' }, { status: 409 })
    return NextResponse.json({ erro: error.message }, { status: 500 })
  }

  // A trilha registra QUE um envelope nasceu, nunca o conteúdo dele.
  await supabase.from('financeiro_auditoria').insert({
    id: 'CF' + crypto.randomUUID(),
    ts: new Date().toISOString(),
    quem: quem.nome, quem_usuario_id: quem.usuarioId,
    aba: 'Cofre', tipo: 'sistema',
    acao: c.tipo === 'recuperacao' ? 'Chave de recuperação do cofre gerada' : 'Senha do cofre criada',
    onde: String(c.rotulo ?? '').slice(0, 120), de: '', para: '', detalhe: '',
  })

  return NextResponse.json({ ok: true, id: data?.id })
}

export async function PATCH(request: NextRequest) {
  const quem = await quemFinanceiro()
  if (!quem.dono) return negado('Só os donos do Financeiro revogam uma chave do cofre.')

  let c: { envelopeId?: string }
  try { c = await request.json() } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }) }
  if (!c.envelopeId) return NextResponse.json({ erro: 'Diga qual envelope revogar.' }, { status: 400 })

  const supabase = await createClient()

  // Trava contra o tiro no pé: não dá para revogar o último envelope vivo, ou o
  // cofre ficaria fechado para sempre com o caixa dentro.
  const { count } = await supabase
    .from('financeiro_cofre_envelope')
    .select('id', { count: 'exact', head: true })
    .is('revogado_em', null)

  if ((count ?? 0) <= 1) {
    return NextResponse.json({
      erro: 'Este é o último jeito de abrir o cofre. Revogar agora tornaria o caixa ilegível para sempre. Crie outra chave antes.',
    }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('financeiro_cofre_envelope')
    .update({ revogado_em: new Date().toISOString(), revogado_por: quem.usuarioId })
    .eq('id', c.envelopeId)
    .is('revogado_em', null)
    .select('id, rotulo')
    .maybeSingle()

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ erro: 'Envelope não encontrado ou já revogado.' }, { status: 409 })

  await supabase.from('financeiro_auditoria').insert({
    id: 'CF' + crypto.randomUUID(),
    ts: new Date().toISOString(),
    quem: quem.nome, quem_usuario_id: quem.usuarioId,
    aba: 'Cofre', tipo: 'sistema', acao: 'Chave do cofre revogada',
    onde: data.rotulo, de: '', para: '', detalhe: '',
  })

  return NextResponse.json({ ok: true })
}
