// ============================================================================
//  GET/PATCH /api/ia/conversas/<id>  ·  o fio de uma conversa
//
//  O GET devolve a conversa inteira: as falas na ordem, e os blocos (tabela e
//  gráfico) pendurados na resposta que os gerou. Reabrir uma conversa de
//  ontem tem que trazer o gráfico junto, e não só o texto que falava dele.
//
//  O PATCH renomeia e arquiva. Renomear marca `titulo_dele = true`, e daí em
//  diante o título automático não volta a mandar: é a mesma regra do fio do
//  notebook, e existe porque um título escolhido a mão não pode ser desfeito
//  por uma heurística na pergunta seguinte.
//
//  QUEM PODE VER É A RLS QUE DECIDE, não este arquivo. Conversa de escopo
//  'crm' só abre para quem a criou; o banco recusa as outras com "não
//  encontrada", que é a resposta certa: dizer "existe, mas não é sua" já
//  vazaria que ela existe.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tituloDe } from '@/lib/ia/gestao'

export const runtime = 'nodejs'

interface BlocoLinha {
  pedido_id: string
  ordem: number
  tipo: string
  titulo: string
  formato: string | null
  dados: Record<string, unknown>
  origem: string | null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })

  const { data: conversa } = await supabase
    .from('ia_conversas')
    .select('id, titulo, titulo_dele, tela, criada, ultima, trocas, arquivada')
    .eq('id', id)
    .maybeSingle()
  if (!conversa) return NextResponse.json({ erro: 'Conversa não encontrada.' }, { status: 404 })

  const { data: mensagens } = await supabase
    .from('ia_mensagens')
    .select('id, quem, texto, em, autor_nome, pedido_id')
    .eq('conversa_id', id)
    .order('em')

  /* OS BLOCOS VÊM JUNTO, numa consulta só, e são distribuídos por pedido aqui.
     Uma consulta por mensagem seria uma ida ao banco por fala da IA. */
  const pedidos = (mensagens ?? [])
    .map((m) => m.pedido_id)
    .filter((p): p is string => !!p)

  const porPedido = new Map<string, BlocoLinha[]>()
  if (pedidos.length) {
    const { data: blocos } = await supabase
      .from('ia_blocos')
      .select('pedido_id, ordem, tipo, titulo, formato, dados, origem')
      .in('pedido_id', pedidos)
      .order('ordem')
    ;((blocos ?? []) as unknown as BlocoLinha[]).forEach((b) => {
      const lista = porPedido.get(b.pedido_id) ?? []
      lista.push(b)
      porPedido.set(b.pedido_id, lista)
    })
  }

  const { data: custos } = pedidos.length
    ? await supabase
        .from('ia_pedidos')
        .select('id, custo_usd, cache_leitura')
        .in('id', pedidos)
    : { data: [] }

  const custoDe = new Map(
    (custos ?? []).map((c) => [c.id as string, c as { custo_usd: number | null; cache_leitura: number | null }]),
  )

  return NextResponse.json({
    ok: true,
    conversa,
    falas: (mensagens ?? []).map((m) => {
      const c = m.pedido_id ? custoDe.get(m.pedido_id) : undefined
      return {
        // 'marco' é o rótulo antigo do fio do notebook; no CRM toda fala de
        // gente é 'pessoa'. A tela só distingue gente de IA.
        quem: m.quem === 'ia' ? 'ia' : 'pessoa',
        texto: m.texto,
        autor: m.autor_nome,
        em: m.em,
        blocos: m.pedido_id ? (porPedido.get(m.pedido_id) ?? []) : [],
        custo: c?.custo_usd ?? null,
        cache: Number(c?.cache_leitura ?? 0) > 0,
      }
    }),
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })

  const corpo = await req.json().catch(() => ({}))
  const mudanca: Record<string, unknown> = {}

  if (typeof corpo.titulo === 'string' && corpo.titulo.trim()) {
    mudanca.titulo = tituloDe(corpo.titulo)
    // Título escolhido à mão não volta a ser automático.
    mudanca.titulo_dele = true
  }
  if (typeof corpo.arquivada === 'boolean') mudanca.arquivada = corpo.arquivada

  if (!Object.keys(mudanca).length) {
    return NextResponse.json({ erro: 'Nada para mudar.' }, { status: 422 })
  }

  const { data, error } = await supabase
    .from('ia_conversas')
    .update(mudanca)
    .eq('id', id)
    .select('id, titulo, titulo_dele, arquivada')

  // Escrita barrada por RLS volta zero linha e às vezes nenhum erro.
  if (error || !data?.length) {
    return NextResponse.json(
      { erro: error?.message ?? 'Esta conversa não é sua.' },
      { status: error ? 500 : 403 },
    )
  }

  return NextResponse.json({ ok: true, conversa: data[0] })
}
