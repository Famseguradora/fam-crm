// ============================================================================
//  POST /api/casos/novo  ·  começar pelo CNPJ, sem e-mail nenhum
//
//  A esteira nasceu com uma porta só: subir o .msg. Mas o pedido chega por
//  telefone, por WhatsApp, na reunião — e nesses casos o Comercial não tem
//  e-mail para subir, e ficava sem caminho dentro do CRM.
//
//  Aqui ele digita o CNPJ e pronto: o caso existe, o tomador existe (Receita),
//  o checklist existe, e a tela de Triagem abre igualzinha à do e-mail. Um
//  caminho só depois do primeiro passo, e não dois sistemas paralelos.
//
//  O CHECKLIST NASCE JUNTO, todo 'faltando'. É o contrário do caso vindo de
//  e-mail (que já nasce com o que os anexos trouxeram), e é o certo: aqui não
//  chegou documento nenhum ainda, e item que não existe na tela é item que
//  ninguém cobra.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { acharOuCriarTomadorPorCnpj } from '@/lib/tomador/criar-por-cnpj'
import { soDigitos } from '@/lib/analise/cnpj'
import { validarCNPJ } from '@/lib/utils'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const corpo = await req.json().catch(() => ({}))
  const cnpj = soDigitos(String(corpo.cnpj ?? '')) ?? ''
  const razaoDigitada = String(corpo.razao_social ?? '').trim()
  const corretora = String(corpo.corretora ?? '').trim()
  const produto = String(corpo.produto ?? '').trim()

  if (cnpj.length !== 14 || !validarCNPJ(cnpj)) {
    return NextResponse.json({ erro: 'CNPJ inválido: confira os dígitos.' }, { status: 422 })
  }

  /* O MESMO CNPJ NÃO ABRE DOIS CASOS EM ABERTO. Duas pessoas atendendo o mesmo
     pedido em cards diferentes é o defeito que a Caixa de entrada já resolveu
     para o e-mail; a porta do CNPJ não pode reabri-lo. */
  const { data: aberto } = await supabase
    .from('casos')
    .select('id, numero')
    .eq('cnpj', cnpj)
    .in('etapa', ['comercial', 'triagem'])
    .maybeSingle()
  if (aberto) {
    return NextResponse.json(
      { ok: true, ja_existia: true, caso: aberto },
      { status: 200 },
    )
  }

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const autor = quem?.nome ?? user.email ?? 'alguém'

  // O tomador primeiro: é dele que sai a razão social do assunto do caso.
  const r = await acharOuCriarTomadorPorCnpj(supabase, {
    cnpj,
    razao_social: razaoDigitada || undefined,
    corretora: corretora || undefined,
    origem: 'Cadastro aberto direto pelo CNPJ, na Triagem do CRM',
  })
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })

  const { data: caso, error: erroCaso } = await supabase
    .from('casos')
    .insert({
      assunto: r.tomador.razao_social,
      cnpj,
      razao_social: r.tomador.razao_social,
      razao_social_confiavel: true,
      corretora_texto: corretora || null,
      produto: produto || null,
      identificado_por: 'humano',
      tomador_id: r.tomador.id,
      etapa: 'triagem',
      criado_por_auth_id: user.id,
      criado_por_nome: autor,
      observacao: 'Aberto sem e-mail: o pedido chegou por fora da caixa.',
    })
    .select('id, numero, assunto')
    .single()

  if (erroCaso || !caso) {
    return NextResponse.json(
      { erro: erroCaso?.message ?? 'Você não tem permissão para abrir casos no CRM.' },
      { status: 403 },
    )
  }

  const { data: catalogo } = await supabase
    .from('caso_item_catalogo')
    .select('id')
    .eq('ativo', true)
    .order('ordem')

  let avisoChecklist: string | null = null
  const itens = catalogo ?? []
  if (itens.length) {
    const { data: nascidos, error: erroItens } = await supabase
      .from('caso_itens')
      .insert(itens.map((i) => ({
        caso_id: caso.id,
        item: i.id as string,
        situacao: 'faltando',
        por: 'robo',
      })))
      .select('id')
    // Checklist que não nasce é exigência que ninguém cobra: falha visível.
    if (erroItens || nascidos?.length !== itens.length) {
      avisoChecklist = `O checklist não nasceu inteiro (${erroItens?.message ?? 'gravou incompleto'}). Confira na tela do caso.`
    }
  }

  return NextResponse.json({
    ok: true,
    ja_existia: false,
    caso,
    tomador: r.tomador,
    tomador_criado: r.criado,
    receita: r.criado ? r.receita : { ok: true },
    aviso: avisoChecklist,
  })
}
