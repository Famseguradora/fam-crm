// ============================================================================
//  POST /api/casos/<id>/pre-cadastro
//  "Quem é a empresa" — e o cadastro do tomador nasce AQUI, não no fim.
//
//  Ordem do Marco em 09/09/2026: "o Comercial pode não querer rodar nada".
//  Então o primeiro passo da Triagem tem que ser o mesmo Cadastro Básico de
//  Operações: digita o CNPJ, a Receita preenche, e o tomador já existe no banco.
//  Sem agente, sem esteira, sem a máquina de ninguém ligada.
//
//  O QUE MUDOU DE CONCEITO. Até 08/09 o `casos.tomador_id` era a marca de
//  "triagem concluída". Passou a ser só "a empresa já está identificada e
//  cadastrada". Quem diz em que passo o caso está é a `etapa`, que é para isso
//  que ela existe. As duas rotas que liam essa marca foram acertadas junto.
//
//  NÃO MANDA PARA A ANÁLISE. Pré-cadastro é identificação: os documentos ainda
//  vão chegar, e quem decide que está pronto é a pessoa, no Concluir.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { acharOuCriarTomadorPorCnpj } from '@/lib/tomador/criar-por-cnpj'
import { soDigitos } from '@/lib/analise/cnpj'
import { validarCNPJ } from '@/lib/utils'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const corpo = await req.json().catch(() => ({}))
  const cnpj = soDigitos(String(corpo.cnpj ?? '')) ?? ''
  const razao = String(corpo.razao_social ?? '').trim()
  let corretora = String(corpo.corretora ?? '').trim()
  const produto = String(corpo.produto ?? '').trim()

  /* A CORRETORA VEM DA LISTA (10/09/2026): "esse campo deve ser uma lista, a
     mesma lista que consta dentro do CRM FAM > Corretoras". O id é conferido
     contra o cadastro, e o nome gravado é o do cadastro, nunca o digitado. */
  const corretoraId = String(corpo.corretora_id ?? '').trim() || null
  if (corretoraId) {
    const { data: c } = await supabase.from('corretoras').select('id, razao_social, nome_fantasia').eq('id', corretoraId).maybeSingle()
    if (!c) return NextResponse.json({ erro: 'Essa corretora não está no cadastro do CRM.' }, { status: 422 })
    corretora = (c.nome_fantasia || '').trim() || c.razao_social
  }

  if (cnpj.length !== 14 || !validarCNPJ(cnpj)) {
    return NextResponse.json({ erro: 'CNPJ inválido: confira os dígitos.' }, { status: 422 })
  }

  const { data: caso } = await supabase
    .from('casos')
    .select('id, numero, etapa, tomador_id')
    .eq('id', id)
    .maybeSingle()
  if (!caso) return NextResponse.json({ erro: 'Caso não encontrado.' }, { status: 404 })
  if (caso.etapa === 'analise') {
    return NextResponse.json(
      { erro: 'Este caso já foi para a análise: a identificação não muda mais por aqui.' },
      { status: 409 },
    )
  }

  /* A identificação é gravada ANTES do cadastro. Se a Receita cair no meio, o
     que a pessoa digitou não se perde: ela recarrega a tela e tenta de novo. */
  const { data: gravado, error: erroGravar } = await supabase
    .from('casos')
    .update({
      cnpj,
      razao_social: razao || null,
      corretora_texto: corretora || null,
      corretora_id: corretoraId,
      produto: produto || null,
      identificado_por: 'humano',
      etapa: caso.etapa === 'comercial' ? 'triagem' : caso.etapa,
    })
    .eq('id', id)
    .select('id')
  // Escrita barrada por RLS volta zero linha e às vezes nenhum erro.
  if (erroGravar || !gravado?.length) {
    return NextResponse.json(
      { erro: erroGravar?.message ?? 'Você não tem permissão para editar este caso.' },
      { status: 403 },
    )
  }

  const r = await acharOuCriarTomadorPorCnpj(supabase, {
    cnpj,
    razao_social: razao || undefined,
    corretora: corretora || undefined,
    corretora_id: corretoraId,
    origem: `Pré-cadastro feito na Triagem do CRM, no caso #${caso.numero}`,
  })
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })

  // Tomador que já existia sem corretora ganha a escolhida; com corretora, fica a dele.
  if (corretoraId && !r.criado) {
    await supabase.from('tomadores').update({ corretora_id: corretoraId }).eq('id', r.tomador.id).is('corretora_id', null)
  }

  const { data: ligado, error: erroLigar } = await supabase
    .from('casos')
    .update({ tomador_id: r.tomador.id })
    .eq('id', id)
    .select('id')
  if (erroLigar || !ligado?.length) {
    /* O tomador existe, mas o caso não aponta para ele. Isso NÃO pode sair
       calado: a tela mostraria "cadastrado" e o Concluir criaria de novo. */
    return NextResponse.json(
      {
        erro: `O tomador ${r.tomador.razao_social} está no banco, mas não consegui ligá-lo a este caso (${erroLigar?.message ?? 'sem permissão'}). Recarregue e tente de novo.`,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    criado: r.criado,
    tomador: r.tomador,
    receita: r.criado ? r.receita : { ok: true },
  })
}
