// ============================================================================
//  GET/POST /api/ia/config  ·  o liga-desliga da IA pela API
//
//  Pedido dele em 09/09/2026: "tem como criar uma opção de ligar e desligar
//  API?". Tem, e ela é uma linha de tabela (`ia_config`), não uma variável de
//  ambiente: variável de ambiente só muda com deploy, e o interruptor tem que
//  funcionar no meio do expediente.
//
//  O GET responde para QUALQUER pessoa logada, de propósito: a tela precisa
//  saber se pode perguntar. Botão que promete o que não existe é pior que botão
//  ausente. Ele também devolve o gasto das últimas 24 h, que é a informação que
//  faz o interruptor ser uma decisão e não um palpite.
//
//  O POST é só do proprietário, e a RLS da tabela garante isso de novo: a
//  checagem aqui é para a MENSAGEM ser boa, a trava de verdade é a do banco.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const MODELOS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'] as const
const ESFORCOS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

async function gastoDoDia(sb: Awaited<ReturnType<typeof createClient>>) {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data } = await sb
    .from('ia_pedidos')
    .select('custo_usd, cache_leitura')
    .gte('criado_em', desde)
    .not('custo_usd', 'is', null)
  const linhas = data ?? []
  return {
    usd: linhas.reduce((s, l) => s + Number(l.custo_usd ?? 0), 0),
    perguntas: linhas.length,
    // Quantas já pegaram carona no cache. É a prova de que a economia está
    // acontecendo: se este número for zero com várias perguntas, o prefixo
    // cacheado está sendo invalidado por alguma coisa.
    com_cache: linhas.filter((l) => Number(l.cache_leitura ?? 0) > 0).length,
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })

  const { data: cfg } = await supabase
    .from('ia_config')
    .select('api_ligada, modelo, esforco, teto_diario_usd, mudado_por_nome, mudado_em')
    .eq('id', 1)
    .maybeSingle()

  const { data: quem } = await supabase
    .from('usuarios')
    .select('proprietario')
    .eq('auth_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    // Sem a linha da config (migration ainda não aplicada), a resposta é
    // "desligada" em vez de erro: a tela cai para o notebook e continua viva.
    config: cfg ?? { api_ligada: false, modelo: 'claude-sonnet-5', esforco: 'medium', teto_diario_usd: 5 },
    // A chave nunca é devolvida. Só se ela EXISTE.
    tem_chave: !!process.env.ANTHROPIC_API_KEY,
    pode_mexer: !!quem?.proprietario,
    gasto: await gastoDoDia(supabase),
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })

  const { data: quem } = await supabase
    .from('usuarios')
    .select('nome, proprietario')
    .eq('auth_id', user.id)
    .maybeSingle()
  if (!quem?.proprietario) {
    return NextResponse.json({ erro: 'Só o proprietário liga e desliga a IA.' }, { status: 403 })
  }

  const corpo = await req.json().catch(() => ({}))
  const mudanca: Record<string, unknown> = {
    mudado_por_nome: quem.nome ?? user.email,
    mudado_em: new Date().toISOString(),
  }

  if (typeof corpo.api_ligada === 'boolean') mudanca.api_ligada = corpo.api_ligada
  if (corpo.modelo) {
    if (!MODELOS.includes(corpo.modelo)) {
      return NextResponse.json({ erro: `Modelo desconhecido: "${corpo.modelo}".` }, { status: 422 })
    }
    mudanca.modelo = corpo.modelo
  }
  if (corpo.esforco) {
    if (!ESFORCOS.includes(corpo.esforco)) {
      return NextResponse.json({ erro: `Esforço desconhecido: "${corpo.esforco}".` }, { status: 422 })
    }
    mudanca.esforco = corpo.esforco
  }
  if (corpo.teto_diario_usd !== undefined) {
    const t = Number(corpo.teto_diario_usd)
    if (!Number.isFinite(t) || t < 0) {
      return NextResponse.json({ erro: 'O teto tem que ser um número maior ou igual a zero.' }, { status: 422 })
    }
    mudanca.teto_diario_usd = t
  }

  /* LIGAR SEM CHAVE É RECUSADO. Ligado sem chave, todo mundo que perguntasse
     receberia erro, e o interruptor estaria dizendo que funciona. */
  if (mudanca.api_ligada === true && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { erro: 'Não dá para ligar: a ANTHROPIC_API_KEY não está no ambiente do CRM. Coloque a chave e ligue depois.' },
      { status: 428 },
    )
  }

  const { data, error } = await supabase
    .from('ia_config')
    .update(mudanca)
    .eq('id', 1)
    .select('api_ligada, modelo, esforco, teto_diario_usd, mudado_por_nome, mudado_em')

  // Escrita barrada por RLS volta zero linha e às vezes nenhum erro.
  if (error || !data?.length) {
    return NextResponse.json(
      { erro: error?.message ?? 'Não consegui gravar (a migration da IA já foi aplicada?).' },
      { status: error ? 500 : 409 },
    )
  }

  return NextResponse.json({ ok: true, config: data[0], gasto: await gastoDoDia(supabase) })
}
