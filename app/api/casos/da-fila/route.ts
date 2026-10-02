// ============================================================================
//  POST /api/casos/da-fila  ·  a bancada de triagem para um card sem caso
//
//  28/09/2026. O nó "Cadastro e triagem" do card da Análise é a bancada de
//  triagem (a mesma tela do Funil), e essa tela trabalha sobre um CASO. Card
//  que nasceu de e-mail ou do CNPJ já tem caso. O que chegou direto na pasta
//  do notebook (a Eldorado) não tem, e ficava sem bancada.
//
//  Aqui o caso nasce a partir da linha da esteira, ligado a ela nos dois
//  sentidos (`casos.analise_fila_id` e `analise_fila.caso_id`). Nasce SEM CNPJ
//  quando a pasta não tem um confiável: confirmar o CNPJ é o passo 1 da
//  própria bancada, e inventar um aqui seria o chute que a triagem existe para
//  evitar. O checklist copia o que o agente já leu da pasta; o resto nasce
//  'faltando', como no caso aberto pelo CNPJ.
//
//  Idempotente: a fila que já tem caso devolve o caso dela.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const SITUACOES = new Set(['ok', 'a_caminho', 'duvida', 'dispensado', 'faltando'])

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const corpo = await req.json().catch(() => ({}))
  const filaId = String(corpo.fila_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(filaId)) return NextResponse.json({ erro: 'Card inválido.' }, { status: 422 })

  const { data: fila, error: erroFila } = await supabase
    .from('analise_fila')
    .select('id, caso_id, cnpj, cnpj_confiavel, razao_social, nome, pasta, tomador_id, cadastro, situacao')
    .eq('id', filaId).maybeSingle()
  if (erroFila) return NextResponse.json({ erro: erroFila.message }, { status: 500 })
  if (!fila) return NextResponse.json({ erro: 'Este card não está na esteira.' }, { status: 404 })
  if (fila.caso_id) return NextResponse.json({ ok: true, caso_id: fila.caso_id, ja_existia: true })

  const cnpj = String(fila.cnpj ?? '').replace(/\D/g, '')
  const cnpjBom = cnpj.length === 14 && (fila.cnpj_confiavel || !!fila.tomador_id) ? cnpj : null

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const autor = quem?.nome ?? user.email ?? 'alguém'

  /* O MESMO CNPJ NÃO ABRE DOIS CASOS EM ABERTO (a regra do /api/casos/novo):
     havendo um em triagem, o card se liga a ele em vez de criar outro. */
  if (cnpjBom) {
    const { data: aberto } = await supabase.from('casos').select('id, analise_fila_id')
      .eq('cnpj', cnpjBom).in('etapa', ['comercial', 'triagem']).limit(1).maybeSingle()
    if (aberto && !aberto.analise_fila_id) {
      await supabase.from('casos').update({ analise_fila_id: fila.id }).eq('id', aberto.id)
      const { error } = await supabase.from('analise_fila').update({ caso_id: aberto.id }).eq('id', fila.id)
      if (error) return NextResponse.json({ erro: error.message }, { status: 403 })
      return NextResponse.json({ ok: true, caso_id: aberto.id, ligado: true })
    }
  }

  /* Card de análise já concluída (a Celog, 01/10) não volta para a triagem: o
     caso nasce em 'analise', senão o checklist 'faltando' vira lembrete de
     documento para uma análise que já acabou. */
  const jaAnalisada = fila.situacao === 'concluida'

  const nome = fila.razao_social || fila.nome || fila.pasta
  const { data: caso, error: erroCaso } = await supabase
    .from('casos')
    .insert({
      assunto: nome,
      cnpj: cnpjBom,
      razao_social: fila.razao_social || null,
      razao_social_confiavel: !!fila.tomador_id,
      identificado_por: 'humano',
      tomador_id: fila.tomador_id,
      etapa: jaAnalisada ? 'analise' : 'triagem',
      enviado_analise_em: jaAnalisada ? new Date().toISOString() : null,
      analise_fila_id: fila.id,
      criado_por_auth_id: user.id,
      criado_por_nome: autor,
      observacao: `Aberto pelo card da Análise: a pasta "${fila.pasta}" chegou sem caso.`,
    })
    .select('id, numero')
    .single()
  if (erroCaso || !caso) {
    return NextResponse.json({ erro: erroCaso?.message ?? 'Você não tem permissão para abrir casos no CRM.' }, { status: 403 })
  }

  // A ligação de volta: sem ela o card não acharia o caso na próxima abertura.
  const { data: ligada, error: erroLiga } = await supabase.from('analise_fila')
    .update({ caso_id: caso.id }).eq('id', fila.id).select('id')
  if (erroLiga || !ligada?.length) {
    return NextResponse.json({
      erro: `O caso #${caso.numero} nasceu, mas não consegui ligá-lo ao card (${erroLiga?.message ?? 'sem permissão na Análise'}).`,
    }, { status: 403 })
  }

  // O checklist, com o que o agente já leu da pasta.
  const lidos = new Map<string, string>()
  const cad = fila.cadastro as { itens?: { id?: string; situacao?: string }[] } | null
  for (const i of cad?.itens ?? []) if (i?.id && i.situacao && SITUACOES.has(i.situacao)) lidos.set(i.id, i.situacao)

  const { data: catalogo } = await supabase.from('caso_item_catalogo').select('id').eq('ativo', true).order('ordem')
  let aviso: string | null = null
  if (catalogo?.length) {
    const { data: nascidos, error: erroItens } = await supabase.from('caso_itens')
      .insert(catalogo.map((i) => ({
        caso_id: caso.id, item: i.id as string, situacao: lidos.get(i.id as string) ?? 'faltando', por: 'robo',
      })))
      .select('id')
    if (erroItens || nascidos?.length !== catalogo.length) {
      aviso = `O checklist não nasceu inteiro (${erroItens?.message ?? 'gravou incompleto'}).`
    }
  }

  return NextResponse.json({ ok: true, caso_id: caso.id, numero: caso.numero, aviso })
}
