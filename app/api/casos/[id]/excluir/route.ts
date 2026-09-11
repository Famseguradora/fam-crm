// ============================================================================
//  POST /api/casos/<id>/excluir  ·  o botão Excluir do caso em triagem
//
//  Pedido do Marco em 10/09/2026: "às vezes vem tomadores repetidos, então eu
//  preciso da opção de excluir. Insira um botão de excluir dentro do card apenas
//  em triagem; nos fluxos seguintes, depois veremos."
//
//  O QUE "EXCLUIR" FAZ, e o que ele não faz:
//    · o caso sai da triagem e do funil (etapa `descartado`, com o motivo e a
//      data), e fica no histórico: um caso excluído por engano se recupera
//    · a pasta do notebook vai para `_excluidas` pelo agente da esteira, pela
//      mesma função do motor que o cockpit já usava; nada é apagado do disco
//    · o card da análise sai da Mesa
//    · o TOMADOR NÃO é apagado: o CNPJ é único no cadastro, então o repetido é o
//      caso, e o tomador é o mesmo do caso que fica
//
//  SÓ EM TRIAGEM, com a trava aqui no servidor e não só na tela. Caso na
//  análise, com a análise rodando, recusa com o motivo.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const corpo = await req.json().catch(() => ({})) as { motivo?: string }
  const motivo = String(corpo.motivo ?? '').trim().slice(0, 500)

  const { data: caso } = await supabase
    .from('casos').select('id, numero, etapa, tomador_id').eq('id', id).maybeSingle()
  if (!caso) return NextResponse.json({ erro: 'Caso não encontrado.' }, { status: 404 })
  if (!['comercial', 'triagem'].includes(String(caso.etapa))) {
    return NextResponse.json(
      { erro: caso.etapa === 'descartado' ? 'Este caso já foi excluído.' : 'Só dá para excluir o caso enquanto ele está na triagem.' },
      { status: 409 },
    )
  }

  const { data: fila } = await supabase
    .from('analise_fila').select('id, pasta, situacao, hash_documentos, materializado_em')
    .eq('caso_id', id).maybeSingle()
  if (fila?.situacao === 'em_andamento') {
    return NextResponse.json(
      { erro: 'A análise deste caso está rodando agora. Interrompa na aba Análise antes de excluir.' },
      { status: 409 },
    )
  }

  const { data: quem } = await supabase.from('usuarios').select('nome, email').eq('auth_id', user.id).maybeSingle()
  const nome = quem?.nome ?? user.email ?? 'alguém'
  const agora = new Date().toISOString()

  const { data: gravou, error } = await supabase
    .from('casos')
    .update({ etapa: 'descartado', motivo_descarte: motivo || `Excluído por ${nome} na triagem.`, encerrado_em: agora })
    .eq('id', id)
    .select('id')
  // Escrita barrada por RLS volta sem linha e sem erro.
  if (error || !gravou?.length) {
    return NextResponse.json({ erro: error?.message ?? 'Você tem permissão só de leitura no CRM.' }, { status: 403 })
  }

  /* A PASTA. Nunca montada no notebook: o card sai na hora. Montada: o agente
     tira a pasta da raiz primeiro, e só então o card sai; sem isso a próxima
     sincronização acharia a pasta no disco e recriaria o card. */
  let pasta_no_notebook = false
  if (fila) {
    if (!fila.hash_documentos && !fila.materializado_em) {
      await supabase.from('analise_fila').delete().eq('id', fila.id)
    } else {
      pasta_no_notebook = true
      await supabase.from('analise_fila').update({
        ordem: 'excluir', ordem_em: agora, ordem_por: nome,
        ordem_dados: { motivo: motivo || null }, ultima_ordem_resultado: null, ultima_ordem_em: null,
      }).eq('id', fila.id)
    }
  }

  try {
    const admin = await createAdminClient()
    await admin.from('audit_log').insert({
      tabela: 'casos', acao: 'caso_excluido', registro_id: id,
      dados_antes: { etapa: caso.etapa, fila: fila?.pasta ?? null },
      dados_depois: { etapa: 'descartado', motivo: motivo || null },
      usuario_auth_id: user.id, usuario_nome: quem?.nome ?? null, usuario_email: quem?.email ?? user.email ?? null,
    })
  } catch { /* o registro é bônus: o caso já saiu */ }

  return NextResponse.json({ ok: true, numero: caso.numero, pasta_no_notebook, pasta: fila?.pasta ?? null })
}
