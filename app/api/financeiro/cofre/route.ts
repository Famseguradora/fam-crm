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

  // ── DE QUEM É ESTE ENVELOPE ───────────────────────────────────────────────
  // Três casos, e a diferença entre eles é o que faz o cofre ter mais de uma
  // pessoa dentro:
  //   • `usuarioId` ausente  → a senha é de quem está gravando (o caso comum)
  //   • `usuarioId: null`    → CONVITE, envelope sem dono, aberto uma vez por
  //                            quem receber o código e trocado por senha própria
  //   • `usuarioId: <outro>` → o dono cria a senha do cofre PARA outra pessoa
  //
  // Aqui saía `c.usuarioId ?? quem.usuarioId`, e o `??` engolia justamente o
  // null do convite: o envelope nascia como senha pessoal de quem convidava,
  // batia no índice único e voltava "essa pessoa já tem uma senha do cofre".
  // Era isso que impedia dar a chave a alguém · não trocar por `??` de novo.
  const donoDoEnvelope =
    c.tipo !== 'senha' ? null
      : c.usuarioId === undefined ? quem.usuarioId
        : c.usuarioId

  if (donoDoEnvelope !== null && typeof donoDoEnvelope !== 'string') {
    return NextResponse.json({ erro: 'usuarioId fora do formato.' }, { status: 400 })
  }
  // Criar a chave de outra pessoa é ato de dono. Quem só lança cuida da própria.
  if (donoDoEnvelope && donoDoEnvelope !== quem.usuarioId && !quem.dono) {
    return negado('Só os donos do Financeiro criam a senha do cofre de outra pessoa.')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('financeiro_cofre_envelope')
    .insert({
      rotulo: String(c.rotulo ?? '').slice(0, 120) || 'sem rótulo',
      tipo: c.tipo,
      usuario_id: donoDoEnvelope,
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
    acao: c.tipo === 'recuperacao' ? 'Chave de recuperação do cofre gerada'
      : donoDoEnvelope === null ? 'Convite de uso único do cofre gerado'
        : donoDoEnvelope !== quem.usuarioId ? 'Senha do cofre criada para outra pessoa'
          : 'Senha do cofre criada',
    onde: String(c.rotulo ?? '').slice(0, 120), de: '', para: '', detalhe: '',
  })

  return NextResponse.json({ ok: true, id: data?.id })
}

export async function PATCH(request: NextRequest) {
  const quem = await quemFinanceiro()
  if (!quem.ve) return negado()

  let c: { envelopeId?: string }
  try { c = await request.json() } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }) }
  if (!c.envelopeId) return NextResponse.json({ erro: 'Diga qual envelope revogar.' }, { status: 400 })

  const supabase = await createClient()

  // Quem revoga o quê: o dono revoga qualquer chave; qualquer pessoa da lista
  // revoga a PRÓPRIA senha ou o CONVITE (envelope sem dono) que acabou de usar.
  // Sem esta última parte, quem entra por convite e não é dono não consegue
  // queimar o código, e ele continuaria valendo por aí depois de cumprido.
  const { data: alvo } = await supabase
    .from('financeiro_cofre_envelope')
    .select('id, tipo, usuario_id')
    .eq('id', c.envelopeId)
    .is('revogado_em', null)
    .maybeSingle()

  if (!alvo) return NextResponse.json({ erro: 'Envelope não encontrado ou já revogado.' }, { status: 409 })

  const meuOuConvite = alvo.tipo === 'senha' && (alvo.usuario_id === null || alvo.usuario_id === quem.usuarioId)
  if (!quem.dono && !meuOuConvite) {
    return negado('Só os donos do Financeiro revogam a chave de outra pessoa.')
  }

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
  // Zero linhas com o envelope existindo é a RLS falando: hoje a policy de
  // UPDATE ainda pede `fam_financeiro_dono()`. Enquanto ela não for alinhada
  // com esta rota, quem não é dono ouve o motivo em vez de "não encontrado".
  if (!data) {
    return NextResponse.json({
      erro: quem.dono
        ? 'Envelope não encontrado ou já revogado.'
        : 'O banco não deixou revogar: peça a um dono do Financeiro para revogar esta chave.',
    }, { status: 409 })
  }

  await supabase.from('financeiro_auditoria').insert({
    id: 'CF' + crypto.randomUUID(),
    ts: new Date().toISOString(),
    quem: quem.nome, quem_usuario_id: quem.usuarioId,
    aba: 'Cofre', tipo: 'sistema', acao: 'Chave do cofre revogada',
    onde: data.rotulo, de: '', para: '', detalhe: '',
  })

  return NextResponse.json({ ok: true })
}
