// ============================================================================
//  Quem entra no Financeiro — `/api/financeiro/acesso`
//
//  GET                          → a lista viva, o histórico e os avisos não lidos
//  POST  { usuarioId, podeEditar } → concede
//  PATCH { acessoId }           → revoga (carimba data, não apaga a linha)
//
//  A REGRA QUE O MARCO PEDIU: só dono concede ou revoga, e são dois donos, ele
//  e o Aldeir. Toda mexida gera aviso IMEDIATO para o outro dono, e a lista de
//  quem tem acesso fica visível para os dois o tempo todo.
//
//  Ser admin do CRM não dá nada aqui. Nem `proprietario`. O banco também não
//  aceita: as policies de `financeiro_acesso` chamam `fam_financeiro_dono()`,
//  que não olha `perfil`. Esta rota é a porta educada; a tranca é a RLS.
//
//  Um dono não mexe no outro: a policy só deixa criar e alterar linha com
//  `dono = false`. Trocar quem é dono é operação na mão, no banco.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { quemFinanceiro, negado } from '@/lib/financeiro/acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface LinhaAcesso {
  id: string
  dono: boolean
  pode_editar: boolean
  concedido_em: string
  revogado_em: string | null
  observacao: string | null
  usuarios: { id: string; nome: string; cargo: string | null } | null
}

export async function GET() {
  const quem = await quemFinanceiro()
  if (!quem.ve) return negado()

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('financeiro_acesso')
    .select('id, dono, pode_editar, concedido_em, revogado_em, observacao, usuarios!financeiro_acesso_usuario_id_fkey(id, nome, cargo)')
    .order('concedido_em', { ascending: false })

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

  const linhas = (data ?? []) as unknown as LinhaAcesso[]

  const { data: avisos } = await supabase
    .from('financeiro_acesso_avisos')
    .select('id, texto, criado_em')
    .is('lido_em', null)
    .order('criado_em', { ascending: false })

  return NextResponse.json({
    // quem está dentro agora
    ativos: linhas.filter(l => !l.revogado_em),
    // quem já esteve e saiu: revogar não apaga a história
    historico: linhas.filter(l => l.revogado_em),
    avisos: avisos ?? [],
    quem: { nome: quem.nome, edita: quem.edita, dono: quem.dono },
  })
}

export async function POST(request: NextRequest) {
  const quem = await quemFinanceiro()
  if (!quem.dono) return negado('Só os donos do Financeiro concedem acesso.')

  let corpo: { usuarioId?: string; podeEditar?: boolean; observacao?: string }
  try { corpo = await request.json() } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }) }

  const { usuarioId, podeEditar, observacao } = corpo
  if (!usuarioId || typeof usuarioId !== 'string') {
    return NextResponse.json({ erro: 'Diga quem vai receber o acesso.' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: alvo } = await supabase.from('usuarios').select('id, nome').eq('id', usuarioId).maybeSingle()
  if (!alvo) return NextResponse.json({ erro: 'Usuário não encontrado.' }, { status: 404 })

  const { data: novo, error } = await supabase
    .from('financeiro_acesso')
    .insert({
      usuario_id: usuarioId,
      dono: false,                                   // ninguém vira dono por aqui
      pode_editar: Boolean(podeEditar),
      concedido_por: quem.usuarioId,
      observacao: typeof observacao === 'string' ? observacao.slice(0, 500) : null,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    // índice parcial único: já existe acesso vivo para essa pessoa
    if (error.code === '23505') return NextResponse.json({ erro: `${alvo.nome} já tem acesso ao Financeiro.` }, { status: 409 })
    return NextResponse.json({ erro: error.message }, { status: 500 })
  }

  await avisarOutrosDonos(
    supabase, quem,
    `${quem.nome} liberou o acesso ao Financeiro para ${alvo.nome}` +
    (podeEditar ? ' (pode lançar).' : ' (só leitura).'),
    novo?.id,
  )

  await trilhar(supabase, quem, 'Acesso concedido', alvo.nome, podeEditar ? 'pode lançar' : 'só leitura')

  return NextResponse.json({ ok: true, acessoId: novo?.id })
}

export async function PATCH(request: NextRequest) {
  const quem = await quemFinanceiro()
  if (!quem.dono) return negado('Só os donos do Financeiro revogam acesso.')

  let corpo: { acessoId?: string }
  try { corpo = await request.json() } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }) }

  const { acessoId } = corpo
  if (!acessoId) return NextResponse.json({ erro: 'Diga qual acesso revogar.' }, { status: 400 })

  const supabase = await createClient()

  // A RLS já recusa linha de dono; o update volta com zero linhas e a mensagem
  // aqui explica o porquê, em vez de "não aconteceu nada".
  const { data, error } = await supabase
    .from('financeiro_acesso')
    .update({ revogado_em: new Date().toISOString(), revogado_por: quem.usuarioId })
    .eq('id', acessoId)
    .is('revogado_em', null)
    .select('id, usuarios!financeiro_acesso_usuario_id_fkey(nome)')
    .maybeSingle()

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  if (!data) {
    return NextResponse.json({
      erro: 'Não deu para revogar: ou o acesso já estava revogado, ou é a linha de um dono. Um dono não remove o outro.',
    }, { status: 409 })
  }

  const nome = (data.usuarios as unknown as { nome: string } | null)?.nome ?? 'alguém'
  await avisarOutrosDonos(supabase, quem, `${quem.nome} revogou o acesso ao Financeiro de ${nome}.`, acessoId)
  await trilhar(supabase, quem, 'Acesso revogado', nome, 'sem acesso')

  return NextResponse.json({ ok: true })
}

/**
 * O outro dono fica sabendo na hora. A tabela está na publicação de realtime,
 * então a tela dele acende sem precisar recarregar; o registro fica até ele dar
 * por lido, para o aviso não se perder se ele estiver com o CRM fechado.
 */
async function avisarOutrosDonos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quem: { usuarioId: string },
  texto: string,
  acessoId?: string,
) {
  const { data: donos } = await supabase
    .from('financeiro_acesso')
    .select('usuario_id')
    .eq('dono', true)
    .is('revogado_em', null)

  const outros = (donos ?? []).filter(d => d.usuario_id !== quem.usuarioId)
  if (!outros.length) return

  await supabase.from('financeiro_acesso_avisos').insert(
    outros.map(d => ({ acesso_id: acessoId ?? null, para_usuario_id: d.usuario_id, texto })),
  )
}

/** Mexer em acesso também entra na trilha, junto com os lançamentos. */
async function trilhar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quem: { usuarioId: string; nome: string },
  acao: string, onde: string, para: string,
) {
  await supabase.from('financeiro_auditoria').insert({
    id: 'AC' + crypto.randomUUID(),
    ts: new Date().toISOString(),
    quem: quem.nome, quem_usuario_id: quem.usuarioId,
    aba: 'Acessos', tipo: 'sistema', acao, onde, de: '', para, detalhe: '',
  })
}
