// ============================================================================
//  O caixa — `/api/financeiro/estado`
//
//  GET → { db, versao, quem }           o estado inteiro e em que versão ele está
//  PUT { db, versaoBase } → { versao }  grava SE ninguém gravou no meio do caminho
//
//  A TRAVA DE VERSÃO, que é o motivo desta rota existir:
//  o UPDATE carrega `.eq('versao', versaoBase)`. Se o Aldeir salvou enquanto o
//  Marco digitava, a versão no banco já mudou, o UPDATE pega ZERO linhas e a
//  rota devolve 409 com o estado novo junto. Quem chegou depois é avisado e
//  recarrega, em vez de apagar o trabalho do outro em silêncio.
//
//  Isso é atômico no Postgres: o `where versao = X` e o `set versao = X+1`
//  acontecem na mesma instrução. Duas gravações simultâneas não passam as duas.
//
//  Só texto. `db` é jsonb e nada aqui aceita binário: o extrato em PDF é lido
//  no navegador, vira lançamento e o arquivo nunca chega ao servidor.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { quemFinanceiro, negado } from '@/lib/financeiro/acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LINHA = 'principal'

export async function GET() {
  const quem = await quemFinanceiro()
  if (!quem.ve) return negado()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('financeiro_estado')
    .select('db, versao, atualizado_em, atualizado_por_nome')
    .eq('id', LINHA)
    .maybeSingle()

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

  // Ainda não existe linha: o sistema abre com a carga de fábrica dele e a
  // primeira gravação nasce na versão 0 → 1. `db: null` é o combinado.
  return NextResponse.json({
    db: data?.db ?? null,
    versao: data?.versao ?? 0,
    atualizadoEm: data?.atualizado_em ?? null,
    atualizadoPor: data?.atualizado_por_nome ?? null,
    quem: { nome: quem.nome, edita: quem.edita, dono: quem.dono },
  })
}

export async function PUT(request: NextRequest) {
  const quem = await quemFinanceiro()
  if (!quem.ve) return negado()
  if (!quem.edita) return negado('Seu acesso ao Financeiro é somente de leitura.')

  let corpo: { db?: unknown; versaoBase?: number }
  try { corpo = await request.json() } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }) }

  const { db, versaoBase } = corpo
  if (db === undefined || db === null || typeof db !== 'object') {
    return NextResponse.json({ erro: 'Nada para gravar.' }, { status: 400 })
  }
  if (typeof versaoBase !== 'number' || !Number.isFinite(versaoBase) || versaoBase < 0) {
    return NextResponse.json({ erro: 'versaoBase ausente: sem ela não há como saber se alguém gravou no meio.' }, { status: 400 })
  }

  const supabase = await createClient()

  // versaoBase 0 = "achei que não existia nada ainda". O insert é quem resolve a
  // corrida: se outra pessoa criou a linha primeiro, a chave primária recusa e
  // isso vira o mesmo 409 de sempre.
  if (versaoBase === 0) {
    const { data, error } = await supabase
      .from('financeiro_estado')
      .insert({ id: LINHA, db, versao: 1, atualizado_por: quem.usuarioId, atualizado_por_nome: quem.nome })
      .select('versao')
      .maybeSingle()

    if (!error && data) return NextResponse.json({ versao: data.versao })
    return conflito(supabase, 'Alguém criou o caixa antes de você.')
  }

  const { data, error } = await supabase
    .from('financeiro_estado')
    .update({
      db,
      versao: versaoBase + 1,
      atualizado_em: new Date().toISOString(),
      atualizado_por: quem.usuarioId,
      atualizado_por_nome: quem.nome,
    })
    .eq('id', LINHA)
    .eq('versao', versaoBase)      // ← a trava: nada mudou desde que eu li
    .select('versao')
    .maybeSingle()

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  if (data) return NextResponse.json({ versao: data.versao })

  return conflito(supabase)
}

/** Devolve 409 já com o estado novo, para a tela poder se recarregar sozinha. */
async function conflito(
  supabase: Awaited<ReturnType<typeof createClient>>,
  motivo = 'Outra pessoa gravou enquanto você editava.',
) {
  const { data } = await supabase
    .from('financeiro_estado')
    .select('db, versao, atualizado_em, atualizado_por_nome')
    .eq('id', LINHA)
    .maybeSingle()

  return NextResponse.json({
    erro: motivo,
    conflito: true,
    db: data?.db ?? null,
    versao: data?.versao ?? 0,
    atualizadoEm: data?.atualizado_em ?? null,
    atualizadoPor: data?.atualizado_por_nome ?? null,
  }, { status: 409 })
}
