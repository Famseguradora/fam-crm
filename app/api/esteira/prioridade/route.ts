// ============================================================================
//  POST /api/esteira/prioridade  ·  a ordem da coluna, depois de arrastar
//
//  23/09/2026, pedido dele: "o Ivan subiu um e-mail depois do Abenaias, mas ele
//  quer urgência no caso: ele arrasta o card, igual o Trello, onde é possível
//  alterar a classificação (1, 2, 3...)".
//
//  A TELA MANDA A COLUNA INTEIRA, já na ordem nova, e não "sobe este card um
//  lugar". É de propósito: com dois navegadores abertos (e são quatro pessoas
//  subindo e-mail agora), "sobe um" aplicado sobre uma lista que mudou embaixo
//  produz uma ordem que ninguém pediu. A lista inteira é a intenção completa de
//  quem arrastou, e o último a soltar vence — que é como o Trello se comporta.
//
//  A PRIORIDADE É DA EMPRESA, e por isso vem uma LISTA DE IDS por posição: o
//  quadro desenha uma empresa por card e uma empresa pode ter três pastas
//  (a análise renomeia a pasta enquanto trabalha). Todas as pastas do grupo
//  recebem o mesmo número, senão a ordem se perderia na próxima renomeação.
//
//  O QUE ESTA ROTA NÃO FAZ: não muda coluna, não muda situação, não dá ordem
//  ao notebook. Arrastar dentro da coluna é só a fila de trabalho. Quem muda a
//  coluna continua sendo o botão "Mudar o substatus" do card, e a régua do
//  motor continua mandando no resto.
//
//  Sessão + RLS (`fam_pode_escrever`): quem só lê, só lê. E `prioridade` não
//  está na lista que a sincronização do notebook grava (/api/esteira,
//  `sincronizar`), então o agente nunca desfaz a ordem de uma pessoa.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Uma coluna da Mesa não tem 200 cards; o teto é contra corpo forjado, e não
 *  contra o uso normal. */
const MAX_CARDS = 200
const MAX_PASTAS = 20

export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }

  /* O corpo: `[{ ids: [...], prioridade: 1 }, ...]`, na ordem da coluna. Vem
     pronto de `renumerar()`, em lib/analise/mesa.ts, que é a mesma função que
     a Mesa usa para desenhar: a ordem da tela e a do banco saem do mesmo lugar. */
  const cru = Array.isArray(corpo.ordem) ? corpo.ordem : null
  if (!cru || !cru.length) {
    return NextResponse.json({ erro: 'Falta dizer a ordem da coluna.' }, { status: 422 })
  }
  if (cru.length > MAX_CARDS) {
    return NextResponse.json({ erro: `Coluna com mais de ${MAX_CARDS} cards.` }, { status: 413 })
  }

  const posicoes: { ids: string[]; prioridade: number }[] = []
  const vistos = new Set<string>()
  for (const item of cru) {
    const o = item as { ids?: unknown; prioridade?: unknown }
    const prioridade = Number(o.prioridade)
    const ids = (Array.isArray(o.ids) ? o.ids : []).map((x) => String(x)).filter((x) => UUID.test(x))
    if (!Number.isInteger(prioridade) || prioridade < 1 || prioridade > MAX_CARDS) {
      return NextResponse.json({ erro: 'Posição inválida na lista.' }, { status: 422 })
    }
    if (!ids.length || ids.length > MAX_PASTAS) {
      return NextResponse.json({ erro: 'Card sem pasta, ou com pastas demais.' }, { status: 422 })
    }
    /* O MESMO CARD DUAS VEZES na lista gravaria dois números na mesma pasta, e
       o segundo venceria em silêncio. Melhor recusar do que gravar torto. */
    for (const id of ids) {
      if (vistos.has(id)) return NextResponse.json({ erro: 'O mesmo card apareceu duas vezes.' }, { status: 422 })
      vistos.add(id)
    }
    posicoes.push({ ids, prioridade })
  }

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const autor = (quem as { nome: string | null } | null)?.nome ?? user.email ?? 'alguém'

  /* A COLUNA INTEIRA NUMA TRANSAÇÃO SÓ (23/09/2026, achado da revisão). Antes
     era um UPDATE por posição, em laço: se o terceiro falhasse, os dois
     primeiros já estavam gravados e a coluna ficava com uma ordem que ninguém
     pediu. `analise_fila_reordenar` é SECURITY INVOKER — roda com a permissão
     de quem chamou, então a RLS continua sendo a trava. */
  const { data: gravados, error } = await supabase.rpc('analise_fila_reordenar', {
    p_ordem: posicoes,
    p_quem: autor,
  })

  if (error) {
    /* 22023 é o que a função levanta quando o corpo não faz sentido; o resto é
       problema de verdade. Ordem nenhuma foi gravada nos dois casos: é esse o
       ponto de ela ser uma transação. */
    const invalido = error.code === '22023'
    return NextResponse.json(
      { erro: invalido ? error.message : `Não consegui gravar a ordem (${error.message}). Nada foi mudado: arraste de novo.` },
      { status: invalido ? 422 : 500 },
    )
  }

  /* Escrita barrada por RLS não levanta erro: ela simplesmente não encontra
     linha para atualizar. Zero linhas com a lista cheia é falta de permissão. */
  if (!gravados) {
    return NextResponse.json(
      { erro: 'Você não tem permissão para reordenar a fila da análise.' },
      { status: 403 },
    )
  }

  return NextResponse.json({ ok: true, cards: posicoes.length, pastas: gravados })
}

/* ── DELETE: devolver a coluna ao automático ────────────────────────────────
   O mesmo princípio do "Deixar o sistema decidir" das colunas: quem prioriza à
   mão precisa poder desfazer, senão a fila fica congelada numa decisão de três
   semanas atrás. Apaga o número de um card (todas as pastas dele). */
export async function DELETE(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }
  const ids = (Array.isArray(corpo.ids) ? corpo.ids : []).map((x) => String(x)).filter((x) => UUID.test(x))
  if (!ids.length || ids.length > MAX_PASTAS) {
    return NextResponse.json({ erro: 'Falta dizer qual card.' }, { status: 422 })
  }

  const { data, error } = await supabase
    .from('analise_fila')
    .update({ prioridade: null, prioridade_por: null, prioridade_em: null })
    .in('id', ids)
    .select('id')

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  if (!data?.length) {
    return NextResponse.json({ erro: 'Você não tem permissão para reordenar a fila da análise.' }, { status: 403 })
  }
  return NextResponse.json({ ok: true, pastas: data.length })
}
