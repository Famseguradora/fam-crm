// ============================================================================
//  /api/esteira/complementos  ·  a ponte do agente com a análise complementar
//
//  GET   o próximo pedido pendente, com os endereços assinados dos arquivos e
//        o CONTEXTO: a análise anterior (decisão, 3 C's, pontos, exercícios),
//        os complementos que já foram feitos para o mesmo tomador e o limite
//        do cadastro. É o "histórico do tomador" que a leitura nova confronta.
//  POST  { acao: 'pegar' | 'progresso' | 'pronta' | 'erro', id, ... }
//
//  Mesmo segredo do resto da esteira (x-carteiro-token) e service role, porque
//  quem chama é o notebook, sem sessão. Ver scripts/complemento.mjs.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizarResultado } from '@/lib/analise/complemento'

export const runtime = 'nodejs'

const BUCKET = 'fam-anexos'
const VALE_SEGUNDOS = 15 * 60
/** Leitura que passou disto sem notícia morreu com o notebook: volta para a fila. */
const LENDO_MORRE_MIN = 40

function abrir(req: NextRequest) {
  const segredo = process.env.CARTEIRO_TOKEN || process.env.ANALISE_EVENTO_TOKEN || ''
  if (!segredo) return { erro: NextResponse.json({ erro: 'Rota não configurada (CARTEIRO_TOKEN).' }, { status: 503 }) }
  if (req.headers.get('x-carteiro-token') !== segredo) return { erro: NextResponse.json({ erro: 'Segredo inválido.' }, { status: 401 }) }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return { erro: NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 503 }) }
  return { sb: createClient(url, chave, { auth: { persistSession: false } }) }
}

export async function GET(req: NextRequest) {
  const { sb, erro } = abrir(req)
  if (!sb) return erro

  // Leitura presa (notebook desligou no meio) volta para a fila.
  const limite = new Date(Date.now() - LENDO_MORRE_MIN * 60000).toISOString()
  await sb.from('analise_complementos')
    .update({ estado: 'pendente', mensagem: 'A leitura anterior parou sem avisar. Voltou para a fila.' })
    .eq('estado', 'lendo').lt('pego_em', limite)

  const { data: pedido } = await sb
    .from('analise_complementos')
    .select('id, analise_id, tomador_id, cnpj, instrucoes, arquivos, criado_em')
    .eq('estado', 'pendente')
    .order('criado_em', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!pedido) return NextResponse.json({ ok: true, pedido: null })

  const arquivos: { nome: string; url: string; bytes: number }[] = []
  const falhas: string[] = []
  for (const a of (pedido.arquivos ?? []) as { nome: string; storage_path: string; bytes: number }[]) {
    const { data: s, error } = await sb.storage.from(BUCKET).createSignedUrl(a.storage_path, VALE_SEGUNDOS)
    if (error || !s?.signedUrl) { falhas.push(`${a.nome} (${error?.message ?? 'sem endereço'})`); continue }
    arquivos.push({ nome: a.nome, url: s.signedUrl, bytes: a.bytes })
  }

  const { data: analise } = await sb
    .from('analises')
    .select(`razao_social, nome_curto, cnpj, data_analise, versao, segmento, setor, grupo, porte,
      score_final, classe, rating_txt, rating_cod, nivel_risco, recomendacao,
      limite_recomendado_txt, limite_recomendado_num, limite_recomendado_motivo,
      taxa_tradicional, taxa_judicial, taxa_estruturada, condicoes, conclusao,
      tres_cs, pontos_positivos, pontos_atencao, base_df, base_df_obs, caixa_estoque,
      serasa_score, serasa_risco, serasa_pefin, serasa_protestos, serasa_acoes, serasa_recuperacao`)
    .eq('id', pedido.analise_id)
    .maybeSingle()

  const { data: exercicios } = await sb
    .from('analise_exercicios')
    .select('rotulo, exercicio, base, ativo_total, ativo_circulante, passivo_circulante, exigivel_total, patrimonio_liquido, receita_operacional, ebitda, lucro_liquido, caixa, estoques')
    .eq('analise_id', pedido.analise_id)
    .order('rotulo', { ascending: true })

  // Os complementos anteriores do mesmo tomador: a história no tempo.
  let anteriores: unknown[] = []
  {
    let q = sb.from('analise_complementos')
      .select('criado_em, resultado')
      .eq('estado', 'pronta').neq('id', pedido.id)
      .order('criado_em', { ascending: true }).limit(6)
    q = pedido.cnpj ? q.eq('cnpj', pedido.cnpj) : q.eq('analise_id', pedido.analise_id)
    const { data } = await q
    anteriores = (data ?? []).map((c) => {
      const r = (c.resultado ?? {}) as Record<string, unknown>
      return { em: c.criado_em, veredito: r.veredito, titulo: r.titulo, resumo: r.resumo, periodos: r.periodos, recomendacao: r.recomendacao }
    })
  }

  let tomador: unknown = null
  if (pedido.tomador_id) {
    const { data } = await sb.from('tomadores').select('razao_social, status, limite_aprovado').eq('id', pedido.tomador_id).maybeSingle()
    tomador = data
  }

  return NextResponse.json({
    ok: true,
    pedido: { id: pedido.id, instrucoes: pedido.instrucoes, arquivos, falhas },
    contexto: { analise, exercicios: exercicios ?? [], complementos_anteriores: anteriores, tomador },
  })
}

export async function POST(req: NextRequest) {
  const { sb, erro } = abrir(req)
  if (!sb) return erro
  const corpo = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = String(corpo.id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ erro: 'Falta o pedido.' }, { status: 422 })
  const agora = new Date().toISOString()
  const maquina = String(corpo.maquina ?? '').slice(0, 120) || null
  const acao = String(corpo.acao ?? '')

  if (acao === 'pegar') {
    const { data, error } = await sb.from('analise_complementos')
      .update({ estado: 'lendo', pego_em: agora, maquina, mensagem: 'Baixando os documentos.', erro: null })
      .eq('id', id).eq('estado', 'pendente').select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, pegou: !!data?.length })
  }

  if (acao === 'progresso') {
    // O batimento também renova o `pego_em`, senão uma leitura longa e viva seria dada como morta.
    await sb.from('analise_complementos')
      .update({ mensagem: String(corpo.mensagem ?? '').slice(0, 240), pego_em: agora })
      .eq('id', id).eq('estado', 'lendo')
    return NextResponse.json({ ok: true })
  }

  if (acao === 'pronta') {
    let resultado
    try {
      resultado = normalizarResultado(corpo.resultado)
    } catch (e) {
      return NextResponse.json({ erro: (e as Error).message }, { status: 422 })
    }
    const { error } = await sb.from('analise_complementos').update({
      estado: 'pronta', resultado, erro: null, mensagem: null, concluido_em: agora,
      segundos: Number.isFinite(Number(corpo.segundos)) ? Math.round(Number(corpo.segundos)) : null,
    }).eq('id', id)
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (acao === 'erro') {
    await sb.from('analise_complementos').update({
      estado: 'erro', erro: String(corpo.erro ?? 'falhou').slice(0, 1500), mensagem: null, concluido_em: agora,
    }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ erro: 'Ação desconhecida (pegar, progresso, pronta, erro).' }, { status: 422 })
}
