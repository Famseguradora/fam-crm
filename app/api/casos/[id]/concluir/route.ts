// ============================================================================
//  POST /api/casos/<id>/concluir
//  "A triagem terminou": nasce o cadastro único do tomador e o caso entra na
//  fila da análise de crédito.
//
//  Três decisões que estão no código de propósito:
//
//  1. O CNPJ é obrigatório. Ele é a chave que une caso, tomador e análise; sem
//     ele o cadastro nasceria solto e viraria mais um dos tomadores sem CNPJ que
//     hoje travam a conferência.
//  2. Pendência de documento NÃO bloqueia. Ela viaja junto, escrita no aviso e
//     na tela. Quem decide se a análise começa assim mesmo é o analista.
//  3. Os documentos do caso passam a ser do TOMADOR. É o mesmo arquivo e a mesma
//     linha em `anexos`, só que agora pendurada na ficha dele — senão o CRM teria
//     duas pilhas de documento para a mesma empresa.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { acharOuCriarTomadorPorCnpj } from '@/lib/tomador/criar-por-cnpj'
import { abrirNaFila } from '@/lib/analise/abrir-fila'
import { passarCasoParaTomador } from '@/lib/casos/concluir'
import { soDigitos } from '@/lib/analise/cnpj'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const { data: caso } = await supabase
    .from('casos')
    .select('id, numero, assunto, cnpj, razao_social, corretora_texto, etapa, tomador_id')
    .eq('id', id)
    .maybeSingle()

  if (!caso) return NextResponse.json({ erro: 'Caso não encontrado.' }, { status: 404 })
  /* QUEM DIZ QUE JÁ ACABOU É A `etapa`, e não mais o `tomador_id` (09/09/2026).
     Desde que o Pré-cadastro passou a criar o tomador no PRIMEIRO passo, ter
     `tomador_id` virou o caminho normal de um caso em triagem — e a trava
     antiga recusaria exatamente o caso já identificado, que é o que mais tem.
     O `acharOuCriarTomadorPorCnpj` aqui embaixo acha o mesmo tomador pelo CNPJ
     e devolve `criado: false`, então nada nasce duas vezes. */
  if (caso.etapa === 'analise') {
    return NextResponse.json({ erro: 'Este caso já foi concluído e está na análise.' }, { status: 409 })
  }

  const cnpj = soDigitos(caso.cnpj) ?? ''
  if (cnpj.length !== 14) {
    return NextResponse.json(
      { erro: 'Sem CNPJ não dá para concluir: é o CNPJ que liga o caso ao cadastro e à análise.' },
      { status: 422 },
    )
  }

  const r = await acharOuCriarTomadorPorCnpj(supabase, {
    cnpj,
    razao_social: caso.razao_social ?? undefined,
    corretora: caso.corretora_texto ?? undefined,
    origem: `Cadastro criado pela Triagem do CRM, a partir do caso #${caso.numero}`,
  })
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })

  const tomador = r.tomador

  // A passagem do caso para o tomador é a mesma do agente de Cadastro.
  const passagem = await passarCasoParaTomador(supabase, caso.id, tomador.id)
  if (!passagem.ok) return NextResponse.json({ erro: passagem.erro }, { status: passagem.status })
  const { documentos_movidos, aviso_documentos } = passagem

  // O que ainda falta, para viajar junto com o aviso em vez de virar surpresa.
  const { data: itens } = await supabase
    .from('caso_itens')
    .select('item, situacao, caso_item_catalogo!inner(nome, exigencia)')
    .eq('caso_id', caso.id)

  type ItemJoin = { situacao: string; caso_item_catalogo: { nome: string; exigencia: string } }
  const pendencias = ((itens ?? []) as unknown as ItemJoin[])
    .filter((i) => !['ok', 'dispensado'].includes(i.situacao))
    .map((i) => i.caso_item_catalogo.nome)
  const bloqueios = ((itens ?? []) as unknown as ItemJoin[])
    .filter((i) => !['ok', 'dispensado'].includes(i.situacao) && i.caso_item_catalogo.exigencia === 'bloqueia')
    .map((i) => i.caso_item_catalogo.nome)

  // Aviso ao vivo para a equipe toda. Vai pelo service role porque quem faz a
  // triagem não é necessariamente o analista, e a RLS de `analise_eventos` só
  // deixa o analista escrever. A identidade de quem concluiu vai no `criado_por`.
  const { data: quem } = await supabase.from('usuarios').select('nome, email').eq('auth_id', user.id).maybeSingle()
  try {
    const admin = await createAdminClient()
    await admin.from('analise_eventos').insert({
      tipo: 'triagem',
      empresa: tomador.razao_social,
      cnpj,
      detalhe: bloqueios.length
        ? `Triagem do caso #${caso.numero} concluída, faltando: ${bloqueios.join(' · ')}`
        : `Triagem do caso #${caso.numero} concluída, documentação completa`,
      criado_por: quem?.nome ?? user.email ?? 'triagem',
    })
    await admin.from('audit_log').insert({
      tabela: 'casos',
      acao: 'triagem_concluida',
      registro_id: caso.id,
      dados_antes: { etapa: caso.etapa, tomador_id: caso.tomador_id },
      dados_depois: { etapa: 'analise', tomador_id: tomador.id, tomador_criado: r.criado },
      usuario_auth_id: user.id,
      usuario_nome: quem?.nome ?? null,
      usuario_email: quem?.email ?? user.email ?? null,
    })
  } catch {
    // Aviso nunca derruba o trabalho: o cadastro já está feito.
  }

  /* A FILA DA ANÁLISE, que é o que faltava para a frase do cabeçalho aqui em
     cima ser verdade. Até 07/09/2026 o caso saía da Triagem com `etapa: analise`
     e ninguém pegava: a fila do motor vivia num arquivo no disco do notebook, e
     o CRM não tinha como pôr nada nela.

     Falhar AQUI não desfaz o cadastro: o tomador já existe, os documentos já
     estão na ficha dele, e o botão "Mandar para a análise" resolve o resto. Por
     isso isto vira aviso, e não erro. */
  const naFila = await abrirNaFila(supabase, {
    id: caso.id, numero: caso.numero, assunto: caso.assunto,
    cnpj: caso.cnpj, razao_social: tomador.razao_social, tomador_id: tomador.id,
  }, quem?.nome ?? user.email ?? 'triagem')

  return NextResponse.json({
    ok: true,
    tomador,
    fila: naFila.ok ? naFila.fila : null,
    aviso_fila: naFila.ok ? null : `O cadastro foi feito, mas a análise não entrou na fila: ${naFila.erro}`,
    criado: r.criado,
    receita: r.criado ? r.receita : { ok: true },
    corretora_ligada: r.criado ? r.corretora_ligada : null,
    pendencias,
    bloqueios,
    documentos_movidos,
    aviso_documentos,
  })
}
