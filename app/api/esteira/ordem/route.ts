// ============================================================================
//  POST /api/esteira/ordem  ·  a PESSOA manda a esteira andar
//
//  Quatro ordens, e nenhuma delas executa nada: elas ficam guardadas e o agente
//  do notebook vem buscá-las. É o mesmo desenho do Carteiro, pela mesma razão:
//  o CRM não fala com 127.0.0.1 nem com a máquina de ninguém. O preço é levar
//  alguns segundos, e a tela diz isso em vez de fingir que já foi.
//
//     iniciar    manda o motor começar (ou refazer uma concluída)
//     pausar     tira da fila e deixa parada
//     retomar    devolve para a fila
//     parar      derruba a execução que está rodando agora
//
//  Qual ordem vale em qual situação está em `lib/analise/esteira.ts`, e é a
//  MESMA regra que a tela usa para desenhar os botões. Escrita duas vezes, ela
//  vira um botão que aparece e um servidor que recusa.
//
//  Trava: sessão + RLS (`fam_pode_escrever`). Quem só lê, só lê.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ORDEM, ordemVale, type Ordem } from '@/lib/analise/esteira'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }

  const id = String(corpo.id ?? '')
  const ordem = String(corpo.ordem ?? '') as Ordem
  if (!id) return NextResponse.json({ erro: 'Falta dizer qual análise.' }, { status: 422 })
  if (!(ordem in ORDEM)) return NextResponse.json({ erro: 'Ordem desconhecida.' }, { status: 422 })

  const { data: alvo } = await supabase
    .from('analise_fila')
    .select('id, pasta, situacao, ordem')
    .eq('id', id)
    .maybeSingle()
  if (!alvo) return NextResponse.json({ erro: 'Análise não está na fila.' }, { status: 404 })

  /* A CONFERÊNCIA É AQUI, no servidor, e não só na tela. A tela esconde o botão
     que não vale, mas tela é sugestão: quem garante é isto. E a mensagem diz o
     que está acontecendo, em vez de um "não pode" seco. */
  if (!ordemVale(ordem, alvo.situacao)) {
    return NextResponse.json(
      { erro: `Não dá para "${ORDEM[ordem].rotulo.toLowerCase()}" uma análise que está ${alvo.situacao.replace(/_/g, ' ')}.` },
      { status: 409 },
    )
  }

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const nome = quem?.nome ?? user.email ?? 'alguém'

  /* PAUSAR E RETOMAR MUDAM A SITUAÇÃO NA HORA, e não esperam a máquina: são
     decisões que valem sozinhas, sem nada precisar rodar. Já `iniciar` e
     `parar` dependem do motor, então a situação só muda quando ele responder,
     e enquanto isso a tela mostra a ordem pendente. Confundir os dois faria a
     tela dizer "Analisando" com o notebook desligado. */
  const mudanca: Record<string, unknown> = {
    ordem, ordem_em: new Date().toISOString(), ordem_por: nome,
  }
  if (ordem === 'pausar') {
    mudanca.situacao = 'pausada'
    mudanca.pausada_motivo = `Parada por ${nome}.`
    mudanca.motivo = `Parada por ${nome}.`
  }
  if (ordem === 'retomar') {
    mudanca.situacao = 'pendente'
    mudanca.pausada_motivo = null
    mudanca.motivo = `Devolvida para a fila por ${nome}.`
  }

  const { data, error } = await supabase
    .from('analise_fila')
    .update(mudanca)
    .eq('id', id)
    .select('id, pasta, situacao, ordem, ordem_por')

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  /* Escrita barrada por RLS volta ZERO linha e NENHUM erro. É pelo que voltou
     que se sabe se gravou, nunca pela ausência de erro. */
  if (!data?.length) {
    return NextResponse.json({ erro: 'Você tem permissão só de leitura no CRM.' }, { status: 403 })
  }

  return NextResponse.json({ ok: true, fila: data[0] })
}
