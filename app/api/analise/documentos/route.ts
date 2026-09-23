// ============================================================================
//  GET /api/analise/documentos?id=<analise_fila>  ·  os documentos, PARA A EQUIPE
//
//  23/09/2026, ao abrir a Análise para os colegas: "a ideia é apenas visualizar
//  os documentos, os cards". A aba Arquivos do card já listava os documentos,
//  mas a lista vinha do DISCO da máquina do Marco (`analise_fila.arquivos`,
//  escrita pelo agente do notebook) e os botões de abrir apontavam para
//  `127.0.0.1:7311`. Na máquina de qualquer outra pessoa, botão morto.
//
//  Esta rota entrega o que dá para entregar hoje sem mentir: os documentos que
//  ENTRARAM PELO CRM, pela triagem do Comercial, e portanto moram no Storage
//  (`fam-anexos`). Os das análises antigas continuam só no disco dele, e a tela
//  diz isso com todas as letras em vez de mostrar uma lista pela metade como se
//  fosse tudo.
//
//  POR QUE UMA ROTA, se o navegador consegue assinar sozinho (é o que o
//  `Complementos.tsx` faz). Porque a lista tem regra: o documento pode estar
//  pendurado no CASO ou no TOMADOR conforme a triagem já tenha concluído, e o
//  próprio e-mail é documento e não tem linha em `anexos`. Essa regra mora em
//  `lib/analise/documentos.ts` e é a MESMA que monta a pasta do motor. Deixar o
//  navegador remontá-la seria assinar que um dia as duas divergem.
//
//  A IDENTIDADE É A DE QUEM PEDIU, e de propósito: o cliente é o da sessão, e a
//  RLS de `anexos` vale. O `quemAnalise()` em cima disso é a porta em português
//  — sem ele a pessoa sem acesso receberia uma lista vazia e acharia que a
//  empresa não tem documento nenhum.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { quemAnalise } from '@/lib/analise/acesso'
import { documentosDaAnalise, VALE_PESSOA } from '@/lib/analise/documentos'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa

  const quem = await quemAnalise()
  if (!quem.ve) {
    return NextResponse.json(
      { erro: 'A Análise de crédito não está liberada para você. Quem libera é o Marco, em Usuários.' },
      { status: 403 },
    )
  }

  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!UUID.test(id)) {
    return NextResponse.json({ erro: 'Falta dizer qual análise.' }, { status: 422 })
  }

  const supabase = await createClient()

  const { data: fila } = await supabase
    .from('analise_fila')
    .select('id, pasta, caso_id, tomador_id, cnpj, razao_social')
    .eq('id', id)
    .maybeSingle()

  /* SEM PASTA NA ESTEIRA NÃO É ERRO. São 137 das 139 análises vigentes: a
     análise terminou e a pasta foi arquivada. Devolver 404 faria a aba Arquivos
     mostrar erro vermelho no caso mais comum que existe. */
  if (!fila) {
    return NextResponse.json({ ok: true, documentos: [], falhas: [], sem_esteira: true })
  }

  const { documentos, falhas } = await documentosDaAnalise(supabase, fila, VALE_PESSOA)

  return NextResponse.json({
    ok: true,
    razao_social: fila.razao_social,
    documentos,
    falhas,
    vale_ate: new Date(Date.now() + VALE_PESSOA * 1000).toISOString(),
  })
}
