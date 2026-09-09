// ============================================================================
//  GET/POST /api/ia/conversas  ·  o histórico da IA, por conversa e por pessoa
//
//  Ordem dele em 09/09/2026: "a IA tem que ter o histórico preservado por
//  conversa; cada usuário tem o seu histórico".
//
//  NÃO NASCEU TABELA NOVA. `ia_conversas` e `ia_mensagens` já existiam para a
//  IA de Gestão do notebook; a IA do CRM entra nelas com `escopo = 'crm'`.
//  Fio único: um dia essas duas IAs conversam, e não haverá duas verdades
//  sobre o que já foi perguntado.
//
//  A PRIVACIDADE NÃO É DESTA ROTA, é da RLS. Aqui o filtro por
//  `criado_por_auth_id` existe para a consulta ser barata; mesmo que alguém o
//  removesse, o banco continuaria recusando a conversa dos outros. Trava que
//  depende de o código lembrar de filtrar não é trava.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { novoIdConversa, tituloDe } from '@/lib/ia/gestao'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })

  const verArquivadas = new URL(req.url).searchParams.get('arquivadas') === '1'

  let q = supabase
    .from('ia_conversas')
    .select('id, titulo, titulo_dele, tela, criada, ultima, trocas, arquivada')
    .eq('escopo', 'crm')
    .eq('criado_por_auth_id', user.id)
    .order('ultima', { ascending: false })
    .limit(60)
  if (!verArquivadas) q = q.eq('arquivada', false)

  const { data, error } = await q
  /* Sem a migration aplicada, a coluna `tela` não existe e o Postgres recusa a
     consulta inteira. Lista vazia é melhor que painel quebrado: a IA continua
     respondendo, só sem histórico, e a tela diz isso. */
  if (error) return NextResponse.json({ ok: true, conversas: [], aviso: error.message })

  return NextResponse.json({ ok: true, conversas: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })

  const corpo = await req.json().catch(() => ({}))
  const { data: quem } = await supabase
    .from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()

  /* O ID NASCE NO FORMATO DO MOTOR ('c' + base36), e não como uuid. O
     `conversas.mjs` do notebook valida o id antes de aceitar uma pergunta, e
     um uuid seria recusado por ele: a conversa criada aqui nunca receberia
     resposta se um dia o motor local for atender esta mesma linha. */
  const id = novoIdConversa()
  const titulo = String(corpo.titulo ?? '').trim() || 'Conversa nova'

  const { data, error } = await supabase
    .from('ia_conversas')
    .insert({
      id,
      titulo: tituloDe(titulo),
      escopo: 'crm',
      origem: 'crm',
      tela: corpo.tela ? String(corpo.tela) : null,
      criado_por_nome: quem?.nome ?? user.email,
      criado_por_auth_id: user.id,
    })
    .select('id, titulo, tela, criada, ultima, trocas, arquivada')
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json(
      { erro: error?.message ?? 'Não consegui abrir a conversa (a migration da IA já foi aplicada?).' },
      { status: error ? 500 : 409 },
    )
  }

  return NextResponse.json({ ok: true, conversa: data })
}
