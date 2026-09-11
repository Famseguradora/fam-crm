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

  /* ══════════════════════════════════════════════════════════════════════════
     AS AÇÕES DO PAINEL (10/09/2026)

     Ordem do Marco: "Imagine um funcionário eficiente de análise de e-mails e
     demandas." Um funcionário eficiente não olha 272 e-mails: ele sabe o que é
     dele, o que é pedido, e o que está esperando os outros. Estas quatro ações
     são o mínimo para o painel deixar de ser leitura e virar trabalho.

     Nenhuma delas manda e-mail. Continua valendo a ordem de 29/08/2026: nada
     sai daqui para uma corretora sem autorização no momento do clique.
     ══════════════════════════════════════════════════════════════════════════ */

  /* ASSUMIR: o critério nº 1 de "parado" em Front, Intercom e Hiver é não ter
     dono. Enquanto o CRM não tinha esta coluna, ele não sabia dizer de quem era
     nada, e por isso não sabia dizer o que estava largado. */
  if (acao === 'assumir') {
    const largar = !!corpo.largar
    const { data, error } = await supabase
      .from('emails_caixa')
      .update(
        largar
          ? { dono_auth_id: null, dono_nome: null, assumido_em: null }
          : { dono_auth_id: user.id, dono_nome: nome, assumido_em: agora },
      )
      .in('id', ids)
      .select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) {
      return NextResponse.json({ erro: 'Nada mudou. Você tem permissão só de leitura?' }, { status: 403 })
    }
    return NextResponse.json({ ok: true, assumidos: data.length, dono: largar ? null : nome })
  }

  /* CLASSIFICAR: separa "passou na régua da caixa" de "é pedido de análise".
     São 111 e-mails com `serve = true` e 10 casos: sem esta decisão registrada,
     o painel contaria 111 pedidos e estaria mentindo. O NULO (ninguém decidiu)
     é o que forma a fila que a tela mostra primeiro. */
  if (acao === 'classificar') {
    const ehPedido = corpo.eh_pedido === null ? null : !!corpo.eh_pedido
    const { data, error } = await supabase
      .from('emails_caixa')
      .update({
        eh_pedido: ehPedido,
        classificado_por: ehPedido === null ? null : nome,
        classificado_em: ehPedido === null ? null : agora,
      })
      .in('id', ids)
      .select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) {
      return NextResponse.json({ erro: 'Nada mudou. Você tem permissão só de leitura?' }, { status: 403 })
    }
    return NextResponse.json({ ok: true, classificados: data.length, eh_pedido: ehPedido })
  }

  /* AGUARDAR: a bola passa para fora da FAM. O pedido continua parado, mas com
     motivo e cor próprios, porque a ação é COBRAR e não trabalhar. É a
     separação entre "requester wait time" e "agent wait time" do Zendesk, e é
     ela que impede o painel de acusar a equipe por atraso de terceiro. */
  if (acao === 'aguardar') {
    const voltar = !!corpo.voltar
    const motivoTxt = String(corpo.motivo ?? '').trim().slice(0, 300)
    if (!voltar && !motivoTxt) {
      return NextResponse.json({ erro: 'Diga o que está faltando (é o que vai ser cobrado depois).' }, { status: 422 })
    }
    const { data, error } = await supabase
      .from('emails_caixa')
      .update(
        voltar
          ? { aguardando_desde: null, aguardando_motivo: null, cobrado_em: null }
          : { aguardando_desde: agora, aguardando_motivo: motivoTxt },
      )
      .in('id', ids)
      .select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) {
      return NextResponse.json({ erro: 'Nada mudou. Você tem permissão só de leitura?' }, { status: 403 })
    }
    return NextResponse.json({ ok: true, aguardando: !voltar })
  }

  /* COBRAR: por enquanto só REGISTRA que a cobrança foi feita, e é de propósito.
     O CRM ainda não manda e-mail; quem escreve para a corretora é a pessoa, no
     Outlook. Registrar mesmo assim tem valor: sem isso, o painel mostraria pela
     terceira semana seguida "esperando o balanço" sem ninguém saber se alguém
     chegou a pedir. Quando o envio existir, é aqui que ele entra. */
  if (acao === 'cobrar') {
    const { data, error } = await supabase
      .from('emails_caixa')
      .update({ cobrado_em: agora })
      .in('id', ids)
      .not('aguardando_desde', 'is', null)
      .select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) {
      return NextResponse.json(
        { erro: 'Nada mudou. Só dá para registrar cobrança em pedido que está aguardando algo.' },
        { status: 403 },
      )
    }
    return NextResponse.json({ ok: true, cobrados: data.length })
  }

  /* JÁ ANALISADO POR FORA (10/09/2026). Pedido do Marco: "tem e-mail que eu já
     analisei, mas de outra forma. Inclua mais um botão, de Já analisado,
     porque dessa forma entra na estatística."

     Sem isto, o e-mail analisado por fora só tinha duas saídas, e as duas
     mentiam: "não é pedido" apagava da estatística uma análise que existiu, e
     deixar parado cobrava para sempre um trabalho já feito.

     Marca também `eh_pedido = true` (se foi analisado, era pedido) e tira o
     "aguardando", que deixou de fazer sentido. O e-mail que já virou caso fica
     de fora: esse já conta como trazido, e marcar os dois contaria duas vezes.

     Desfazer limpa só a marca: o e-mail volta a ser "é pedido, falta trazer",
     porque alguém já disse que era pedido. */
  if (acao === 'ja_analisado') {
    const desfazer = !!corpo.desfazer
    const { data, error } = await supabase
      .from('emails_caixa')
      .update(
        desfazer
          ? { analisado_fora_em: null, analisado_fora_por: null }
          : {
              analisado_fora_em: agora,
              analisado_fora_por: nome,
              eh_pedido: true,
              classificado_por: nome,
              classificado_em: agora,
              aguardando_desde: null,
              aguardando_motivo: null,
            },
      )
      .in('id', ids)
      .is('caso_id', null)
      .select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) {
      return NextResponse.json(
        { erro: 'Nada mudou. Ou você não tem permissão de escrita, ou o e-mail já virou caso (e aí já conta como trazido).' },
        { status: 403 },
      )
    }
    return NextResponse.json({ ok: true, marcados: data.length, ja_analisado: !desfazer })
  }

  return NextResponse.json(
    { erro: 'Ação desconhecida (trazer, tratar, corpo, assumir, classificar, aguardar, cobrar, ja_analisado).' },
    { status: 422 },
  )
}
