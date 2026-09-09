// ============================================================================
//  POST /api/caixa  ·  o que a PESSOA faz na Caixa de entrada do CRM
//
//  Três ações, e nenhuma delas manda e-mail para ninguém:
//
//     trazer   marca o e-mail para virar caso. É intenção, não execução: quem
//              executa é o Carteiro, que sobe o .msg em seguida.
//     tratar   some de "Para análise" sem virar caso, com o motivo à vista em
//              "Tudo", e se desfaz.
//     corpo    pede o e-mail inteiro à máquina do Comercial.
//
//  Trava: sessão + RLS (`fam_pode_escrever`). Quem só lê, só lê.
//
//  RESPONDER A CORRETORA NÃO ESTÁ AQUI, e a ausência é de propósito. Enquanto o
//  CRM não mandar e-mail por conta própria, quem responde é a máquina, e nada
//  sai sem a caixinha de autorização no momento do clique. Ordem de 29/08/2026:
//  "a mensagem só pode ser enviada com a minha autorização... isso é PRIORIDADE".
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }

  const acao = String(corpo.acao ?? '')
  const ids = (Array.isArray(corpo.ids) ? corpo.ids : [corpo.id])
    .map((x) => String(x ?? ''))
    .filter(Boolean)
  if (!ids.length) return NextResponse.json({ erro: 'Falta dizer qual e-mail.' }, { status: 422 })
  if (ids.length > 100) return NextResponse.json({ erro: 'Mais de 100 e-mails de uma vez.' }, { status: 413 })

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const nome = quem?.nome ?? user.email ?? 'alguém'
  const agora = new Date().toISOString()

  if (acao === 'trazer') {
    /* Só sai daqui e-mail que ainda não virou caso. O `is('caso_id', null)` não
       é excesso de zelo: dois cliques rápidos no mesmo botão, ou duas pessoas
       na mesma tela, abririam dois casos do mesmo pedido. */
    const { data, error } = await supabase
      .from('emails_caixa')
      .update({ estado: 'a_trazer', estado_em: agora, estado_por: nome, estado_erro: null })
      .in('id', ids)
      .is('caso_id', null)
      .in('estado', ['novo', 'tratado', 'erro'])
      .select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    // Escrita barrada por RLS volta ZERO linha e nenhum erro. Esse silêncio já
    // custou caro: por isso a resposta é o que voltou, e não "ok".
    if (!data?.length) {
      return NextResponse.json(
        { erro: 'Nada mudou. Ou você não tem permissão de escrita, ou esses e-mails já viraram caso.' },
        { status: 403 },
      )
    }
    return NextResponse.json({ ok: true, marcados: data.length, de: ids.length })
  }

  if (acao === 'tratar') {
    const desfazer = !!corpo.desfazer
    const { data, error } = await supabase
      .from('emails_caixa')
      .update({
        estado: desfazer ? 'novo' : 'tratado',
        estado_em: agora,
        estado_por: nome,
        estado_erro: null,
      })
      .in('id', ids)
      .is('caso_id', null)
      .select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) {
      return NextResponse.json(
        { erro: 'Nada mudou. Ou você não tem permissão de escrita, ou o e-mail já virou caso.' },
        { status: 403 },
      )
    }
    return NextResponse.json({ ok: true, marcados: data.length, tratado: !desfazer })
  }

  if (acao === 'corpo') {
    /* Pedir o corpo é só levantar a mão: o Carteiro vê no GET dele e traz.
       `corpo_em: null` zera o que estava em cache, senão a tela mostraria o
       texto velho enquanto o novo não chega.

       `corpo: null` JUNTO, e isso não é detalhe (08/09/2026): quando a busca
       anterior falhou, o que está guardado ali é a mensagem de erro do
       Carteiro. Deixá-la faria a tela continuar mostrando a falha velha
       enquanto a nova tentativa está em curso, e o botão "Tentar de novo"
       pareceria não ter feito nada. */
    const { data, error } = await supabase
      .from('emails_caixa')
      .update({ corpo_pedido_em: agora, corpo_em: null, corpo: null })
      .in('id', ids)
      .select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) {
      return NextResponse.json({ erro: 'Nada mudou. Você tem permissão só de leitura?' }, { status: 403 })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ erro: 'Ação desconhecida (trazer, tratar, corpo).' }, { status: 422 })
}
