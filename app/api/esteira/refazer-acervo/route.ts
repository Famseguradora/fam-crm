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
//  As travas de achar-ou-criar a linha saíram daqui em 24/09/2026 para
//  `lib/analise/linha-da-fila.ts`, porque a Reanálise (`/api/analise/reanalisar`)
//  precisa exatamente das mesmas. Elas continuam sendo: linha que já existe é
//  reaproveitada e nunca duplicada; outra pasta da MESMA empresa andando recusa;
//  a ordem que não grava apaga a linha que acabou de nascer.
//
//  ESTA ROTA CONTINUA SENDO A PORTA SIMPLES (refazer sem documento novo). Com
//  documento novo e motivo escrito, quem atende é `/api/analise/reanalisar`,
//  que leva junto o dossiê da análise anterior.
//  Sessão + RLS (`fam_pode_escrever`): quem só lê, só lê.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { darOrdem } from '@/lib/analise/dar-ordem'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'
import {
  acharOuCriarLinha, desfazerLinha, estaRefazendo, COLUNAS_ANALISE_PARA_FILA,
  type AnaliseParaFila,
} from '@/lib/analise/linha-da-fila'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    .select(COLUNAS_ANALISE_PARA_FILA)
    .eq('id', analiseId)
    .maybeSingle()
  if (!a) return NextResponse.json({ erro: 'Análise não encontrada.' }, { status: 404 })

  const r = await acharOuCriarLinha(
    supabase, a as unknown as AnaliseParaFila, nome,
    `Trazida do Acervo por ${nome} para refazer.`,
  )
  if (!r.ok) {
    return NextResponse.json({ erro: r.erro, ...(r.fila_id ? { fila_id: r.fila_id } : {}) }, { status: r.status })
  }
  const { linha, criada } = r

  // Já na esteira e fora de "concluída": o botão certo é o do card dela.
  if (linha.situacao !== 'concluida' || linha.ordem || estaRefazendo(linha)) {
    return NextResponse.json({ ok: true, fila_id: linha.id, ja_na_esteira: true })
  }

  const ordem = await darOrdem(supabase, {
    id: linha.id,
    ordem: 'refazer',
    dados: {
      escopo: corpo.escopo === 'parcial' ? 'parcial' : 'completa',
      instrucao: String(corpo.instrucao ?? ''),
      modo: String(corpo.modo ?? ''),
    },
    nome,
  })
  if (!ordem.ok) {
    if (criada) await desfazerLinha(supabase, linha.id)
    return NextResponse.json({ erro: ordem.erro }, { status: ordem.status })
  }
  return NextResponse.json({ ok: true, fila_id: linha.id, criada })
}
