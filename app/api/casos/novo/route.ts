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
import { abrirNaFila } from '@/lib/analise/abrir-fila'
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
  /* NA ESTEIRA? (23/09/2026) O caso aberto pelo CNPJ nascia só como caso: o
     card dele NÃO aparecia na Mesa da Análise, e quem abriu ficava sem ver o
     próprio pedido no quadro. A tela de Entrada do Comercial e o "+ Novo card"
     da Mesa pedem a linha da esteira junto; o Funil continua como sempre foi,
     porque não manda esta bandeira. */
  const naEsteira = corpo.na_esteira === true

  if (cnpj.length !== 14 || !validarCNPJ(cnpj)) {
    return NextResponse.json({ erro: 'CNPJ inválido: confira os dígitos.' }, { status: 422 })
  }

  /* O MESMO CNPJ NÃO ABRE DOIS CASOS EM ABERTO. Duas pessoas atendendo o mesmo
     pedido em cards diferentes é o defeito que a Caixa de entrada já resolveu
     para o e-mail; a porta do CNPJ não pode reabri-lo. */
  const { data: aberto } = await supabase
    .from('casos')
    .select('id, numero, assunto, razao_social, tomador_id, analise_fila_id')
    .eq('cnpj', cnpj)
    .in('etapa', ['comercial', 'triagem'])
    .maybeSingle()

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const autor = quem?.nome ?? user.email ?? 'alguém'

  if (aberto) {
    /* O CASO JÁ EXISTE, MAS O CARD PODE NÃO EXISTIR (23/09/2026, achado da
       revisão). O caso aberto pelo Funil nasce sem linha de esteira, porque o
       Funil não manda a bandeira. Se alguém digitar o mesmo CNPJ na Entrada de
       pedidos, este caminho devolvia "já existia" e mandava para a Triagem — e
       o card prometido nunca aparecia na Mesa, sem erro nenhum na tela.

       `abrirNaFila` já é idempotente (procura pelo `caso_id` antes de criar),
       então chamar aqui não duplica nada: ou acha a linha que existe, ou cria
       a que faltava. */
    let fila: { id: string; pasta: string } | undefined
    let aviso: string | null = null
    if (naEsteira) {
      const r0 = await abrirNaFila(supabase, {
        id: aberto.id, numero: aberto.numero, assunto: aberto.assunto,
        cnpj, razao_social: aberto.razao_social, tomador_id: aberto.tomador_id,
      }, autor)
      if (r0.ok) fila = r0.fila
      else aviso = `O card não entrou na Mesa (${r0.erro}).`
    }
    return NextResponse.json(
      { ok: true, ja_existia: true, caso: { id: aberto.id, numero: aberto.numero }, fila, aviso },
      { status: 200 },
    )
  }

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

  /* A LINHA DA ESTEIRA, quando pediram. A regra é a MESMA do e-mail
     (`abrirNaFila`), então o card nasce igual tenha vindo do .msg ou do CNPJ.
     Sem `automatica`: aqui não chegou documento nenhum, e mandar o notebook
     analisar uma pasta vazia seria só um erro mais cedo. */
  let fila: { id: string; pasta: string } | undefined
  if (naEsteira) {
    const r2 = await abrirNaFila(supabase, {
      id: caso.id, numero: caso.numero, assunto: caso.assunto,
      cnpj, razao_social: r.tomador.razao_social, tomador_id: r.tomador.id,
    }, autor)
    if (r2.ok) fila = r2.fila
    else avisoChecklist = [avisoChecklist, `O card não entrou na Mesa (${r2.erro}).`].filter(Boolean).join(' ')
  }

  return NextResponse.json({
    ok: true,
    ja_existia: false,
    caso,
    fila,
    tomador: r.tomador,
    tomador_criado: r.criado,
    receita: r.criado ? r.receita : { ok: true },
    aviso: avisoChecklist,
  })
}
