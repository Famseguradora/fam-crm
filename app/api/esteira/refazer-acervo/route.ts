// ============================================================================
//  POST /api/esteira/refazer-acervo  ·  refazer uma análise que só existe no Acervo
//
//  14/09/2026, na Obrascon: "tinha um botão de refazer análise dentro de cada
//  análise; quero refazer com novos documentos e agora você não me deixa".
//
//  O botão nunca saiu: o Refazer mora na aba Análise do card, e só existe para
//  quem tem linha em `analise_fila`. As análises feitas antes de a esteira
//  entrar no CRM (08/09) só têm linha em `analises` (137 das 145 vigentes), e o
//  card delas abria com "esta análise já foi entregue", sem botão nenhum.
//
//  Aqui a análise do Acervo ganha a linha da esteira que faltava, com a pasta
//  que a própria análise guardou (`analises.pasta`), e recebe a MESMA ordem
//  `refazer` do card: o agente do notebook traz a pasta de _concluidas, junta o
//  que chegou e devolve para a fila. Nenhum caminho novo no notebook.
//
//  As travas:
//    · linha que já existe (pela análise, pela chave ou pela pasta) é
//      reaproveitada, nunca duplicada (`pasta` é UNIQUE);
//    · outra pasta da MESMA empresa andando na esteira recusa: seriam duas
//      análises do mesmo CNPJ rodando juntas;
//    · a ordem que não grava apaga a linha que acabou de nascer.
//  Sessão + RLS (`fam_pode_escrever`): quem só lê, só lê.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { darOrdem } from '@/lib/analise/dar-ordem'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

type Linha = {
  id: string; pasta: string; situacao: string; ordem: string | null
  ultima_ordem_resultado?: string | null; ultima_ordem_em?: string | null; sincronizado_em?: string | null
}
const COLUNAS_LINHA = 'id, pasta, situacao, ordem, ultima_ordem_resultado, ultima_ordem_em, sincronizado_em'

/* O notebook já aceitou um refazer e a sincronização ainda não trouxe a pasta
   de volta: a linha continua "concluída" e sem ordem por alguns segundos. Um
   segundo clique nessa janela gravaria outro refazer em cima do primeiro. */
const refazendo = (l: Linha) =>
  /^De volta à fila para refazer/.test(l.ultima_ordem_resultado ?? '') &&
  !!l.ultima_ordem_em && (!l.sincronizado_em || l.ultima_ordem_em > l.sincronizado_em)

export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }
  const analiseId = String(corpo.analise_id ?? '')
  if (!UUID.test(analiseId)) return NextResponse.json({ erro: 'Falta dizer qual análise.' }, { status: 422 })

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const nome = quem?.nome ?? user.email ?? 'alguém'

  const { data: a } = await supabase
    .from('analises')
    .select('id, chave_local, cnpj, razao_social, nome_curto, tomador_id, corretora, pasta')
    .eq('id', analiseId)
    .maybeSingle()
  if (!a) return NextResponse.json({ erro: 'Análise não encontrada.' }, { status: 404 })

  const pasta = String(a.pasta ?? '').trim()
  if (!pasta || /[\\/:*?"<>|]/.test(pasta)) {
    return NextResponse.json({ erro: 'Esta análise não guardou o nome da pasta no notebook, então não sei qual pasta trazer de volta.' }, { status: 422 })
  }
  const cnpj = digitos(a.cnpj)

  /* Três perguntas separadas, e não um `or()`: nome de pasta com vírgula
     ("Obrascon Huarte Lain, do Brasil") quebra a sintaxe do filtro. */
  const achar = async (): Promise<Linha | null> => {
    const chaves: [string, string | null][] = [['analise_id', a.id], ['analise_chave', a.chave_local], ['pasta', pasta]]
    for (const [coluna, valor] of chaves) {
      if (!valor) continue
      const { data } = await supabase
        .from('analise_fila').select(COLUNAS_LINHA)
        .eq(coluna, valor).order('atualizado_em', { ascending: false }).limit(1)
      if (data?.[0]) return data[0] as Linha
    }
    return null
  }

  let linha = await achar()

  if (!linha && cnpj.length === 14) {
    const { data: outra } = await supabase
      .from('analise_fila').select('id, pasta')
      .eq('cnpj', cnpj).neq('situacao', 'concluida').is('fora_do_disco_em', null)
      .limit(1)
    if (outra?.[0]) {
      return NextResponse.json({
        erro: `Esta empresa já tem uma pasta andando na esteira ("${outra[0].pasta}"). Refaça por lá, para não rodar duas análises do mesmo CNPJ.`,
        fila_id: outra[0].id,
      }, { status: 409 })
    }
  }

  let criada = false
  if (!linha) {
    const { data, error } = await supabase
      .from('analise_fila')
      .insert({
        pasta,
        situacao: 'concluida',
        fase: 'pronta',
        analise_id: a.id,
        analise_chave: a.chave_local,
        chave_local: a.chave_local,
        cnpj: cnpj.length === 14 ? cnpj : null,
        cnpj_confiavel: cnpj.length === 14,
        razao_social: a.razao_social,
        nome: a.nome_curto || a.razao_social,
        tomador_id: a.tomador_id,
        corretora: a.corretora,
        motivo: `Trazida do Acervo por ${nome} para refazer.`,
        criado_por: nome,
      })
      .select(COLUNAS_LINHA)
    if (error) {
      // O agente pode ter criado a mesma pasta entre a pergunta e aqui.
      if (error.code === '23505') linha = await achar()
      if (!linha) return NextResponse.json({ erro: error.message }, { status: 500 })
    } else if (!data?.length) {
      return NextResponse.json({ erro: 'Você tem permissão só de leitura no CRM.' }, { status: 403 })
    } else {
      linha = data[0] as Linha
      criada = true
    }
  }

  // Já na esteira e fora de "concluída": o botão certo é o do card dela.
  if (linha.situacao !== 'concluida' || linha.ordem || refazendo(linha)) {
    return NextResponse.json({ ok: true, fila_id: linha.id, ja_na_esteira: true })
  }

  const r = await darOrdem(supabase, {
    id: linha.id,
    ordem: 'refazer',
    dados: {
      escopo: corpo.escopo === 'parcial' ? 'parcial' : 'completa',
      instrucao: String(corpo.instrucao ?? ''),
      modo: String(corpo.modo ?? ''),
    },
    nome,
  })
  if (!r.ok) {
    if (criada) await supabase.from('analise_fila').delete().eq('id', linha.id).is('sincronizado_em', null)
    return NextResponse.json({ erro: r.erro }, { status: r.status })
  }
  return NextResponse.json({ ok: true, fila_id: linha.id, criada })
}
