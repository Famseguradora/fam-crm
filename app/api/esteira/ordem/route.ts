// ============================================================================
//  POST /api/esteira/ordem  ·  a PESSOA manda a esteira andar
//
//  Oito ordens, e nenhuma delas executa nada: elas ficam guardadas e o agente
//  do notebook vem buscá-las. É o mesmo desenho do Carteiro, pela mesma razão:
//  o CRM não fala com 127.0.0.1 nem com a máquina de ninguém. O preço é levar
//  alguns segundos, e a tela diz isso em vez de fingir que já foi.
//
//     iniciar     manda o motor começar (ou refazer uma concluída)
//     pausar      tira da fila e deixa parada
//     retomar     devolve para a fila
//     parar       derruba a execução que está rodando agora
//     reconferir  relê a pasta: abre o e-mail, refaz a triagem
//     forcar      relê e, se continuar faltando papel, analisa mesmo assim
//     ler_pasta   o bibliotecário lê a pasta inteira e escreve o retrato
//     refazer     devolve para a fila com a ordem escrita (completa ou parcial)
//
//  Qual ordem vale em qual situação está em `lib/analise/esteira.ts`, e é a
//  MESMA regra que a tela usa para desenhar os botões. Escrita duas vezes, ela
//  vira um botão que aparece e um servidor que recusa.
//
//  O QUE VIAJA JUNTO (09/09/2026): "o que observar nesta análise" e o modo
//  (completa/rápida) ficam na linha, em `instrucao` e `modo`, porque são
//  decisão da pessoa e o agente os lê quando a ordem chega. O escopo do refazer
//  vai em `ordem_dados`.
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
  if (alvo.ordem) {
    return NextResponse.json(
      { erro: `Já existe uma ordem ("${ORDEM[alvo.ordem as Ordem]?.rotulo ?? alvo.ordem}") esperando o notebook. Aguarde ela ser aceita.` },
      { status: 409 },
    )
  }

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const nome = quem?.nome ?? user.email ?? 'alguém'

  const dados = (corpo.dados && typeof corpo.dados === 'object') ? corpo.dados as Record<string, unknown> : {}
  const instrucao = String(dados.instrucao ?? '').trim().slice(0, 2000)
  const modo = String(dados.modo ?? '').trim() === 'rapida' ? 'rapida' : ''
  const escopo = String(dados.escopo ?? '').trim() === 'parcial' ? 'parcial' : 'completa'
  const motivo = String(dados.motivo ?? '').trim().slice(0, 500)

  /* PAUSAR E RETOMAR MUDAM A SITUAÇÃO NA HORA, e não esperam a máquina: são
     decisões que valem sozinhas, sem nada precisar rodar. Já `iniciar` e
     `parar` dependem do motor, então a situação só muda quando ele responder,
     e enquanto isso a tela mostra a ordem pendente. Confundir os dois faria a
     tela dizer "Analisando" com o notebook desligado. */
  const mudanca: Record<string, unknown> = {
    ordem, ordem_em: new Date().toISOString(), ordem_por: nome,
    ordem_dados: { instrucao: instrucao || null, modo: modo || null, escopo, motivo: motivo || null },
    ultima_ordem_resultado: null, ultima_ordem_em: null,
  }
  // O que observar e o modo são da linha, e ficam para a próxima vez também.
  if (ordem === 'iniciar' || ordem === 'forcar' || ordem === 'refazer') {
    mudanca.instrucao = instrucao || null
    mudanca.modo = modo || null
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
