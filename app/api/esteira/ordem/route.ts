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
//  MESMA regra que a tela usa para desenhar os botões. A GRAVAÇÃO mora em
//  `lib/analise/dar-ordem.ts` desde 11/09/2026, porque a triagem em lote
//  (/api/esteira/lote) dá a mesma ordem a vários casos e não pode ter regra
//  própria.
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
import { darOrdem } from '@/lib/analise/dar-ordem'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const nome = quem?.nome ?? user.email ?? 'alguém'

  const r = await darOrdem(supabase, {
    id: String(corpo.id ?? ''),
    ordem: String(corpo.ordem ?? ''),
    dados: corpo.dados && typeof corpo.dados === 'object' ? corpo.dados as Record<string, unknown> : null,
    nome,
  })
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })
  return NextResponse.json({ ok: true, fila: r.fila })
}
