// ============================================================================
//  POST /api/casos/<id>/analisar  ·  manda um caso para a análise de crédito
//
//  O caminho normal é a Triagem: concluir já põe o caso na fila. Esta rota é
//  para os dois casos em que isso não aconteceu:
//
//    1. o caso foi concluído ANTES desta fila existir (07/09/2026);
//    2. a criação da fila falhou no meio do concluir, e o cadastro ficou feito
//       sem a análise entrar.
//
//  A REGRA NÃO MORA AQUI: está em `lib/analise/abrir-fila.ts`, a mesma que o
//  concluir usa. Duas portas, uma regra.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { abrirNaFila } from '@/lib/analise/abrir-fila'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const { data: caso } = await supabase
    .from('casos')
    .select('id, numero, assunto, cnpj, razao_social, tomador_id, etapa, analise_fila_id')
    .eq('id', id)
    .maybeSingle()
  if (!caso) return NextResponse.json({ erro: 'Caso não encontrado.' }, { status: 404 })

  /* SEM TRIAGEM CONCLUÍDA NÃO VAI. O `tomador_id` é a marca de que a triagem
     terminou: é ela que cria o cadastro. Mandar para a análise antes disso
     entregaria ao motor uma empresa que ninguém conferiu, e a análise nasceria
     no nome errado. */
  if (!caso.tomador_id) {
    return NextResponse.json(
      { erro: 'Conclua a triagem primeiro: é ela que cria o cadastro do tomador.' },
      { status: 409 },
    )
  }

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const r = await abrirNaFila(supabase, caso, quem?.nome ?? user.email ?? 'alguém')
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })

  return NextResponse.json({ ok: true, fila: r.fila, ja_existia: r.ja_existia })
}
