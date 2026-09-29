// ============================================================================
//  O PEDIDO QUE FOI PARA A REDE SEM ANÁLISE  ·  29/09/2026
//
//  A GGP (caso #20) saiu da Mesa em 11/09 com a pasta ainda "pendente": a pasta
//  foi para a rede, o card sumiu, e a análise nunca aconteceu. Ninguém viu.
//
//  Primeiro virou um aviso vermelho em cima da Mesa, e ele cortou: "não quero
//  ficar vendo aquilo. Manda para o Mural de recados, apenas informe, igual às
//  mensagens de quando inicio e finalizo uma análise". Então são duas peças:
//    · o BALÃO do canto (AvisosAoVivo), pelo `analise_eventos` tipo `na_rede`,
//      sem CNPJ de propósito: o card do tomador lê os eventos pelo CNPJ e
//      tomaria "na_rede" como a análise parando;
//    · o RECADO no mural, do Supervisor da esteira, com id estável
//      `crm:na-rede:<fila>`: aparece uma vez e fica até ele arquivar.
//
//  QUEM CONTA COMO PEDIDO PERDIDO. Das pastas na rede sem análise concluída,
//  quase todas são nome velho de pasta renomeada, com a análise em outra linha.
//  Fica só o pedido de verdade: caso aberto, nenhuma outra pasta do caso
//  concluiu, e o CNPJ/tomador (da pasta ou do caso) não tem análise vigente.
//  Em 29/09 eram 2 de 21: GGP e Bravo RS.
//
//  Roda no servidor, com a chave de serviço: o mural não aceita escrita de
//  usuário (a RLS de `analise_recados` só deixa ler e marcar).
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'

export const idRecadoNaRede = (filaId: string) => `crm:na-rede:${filaId}`

export async function avisarPedidosNaRede(sb: SupabaseClient): Promise<number> {
  const { data: cand } = await sb.from('analise_fila')
    .select('id, pasta, cnpj, tomador_id, caso_id, fora_do_disco_em')
    .not('fora_do_disco_em', 'is', null).is('coluna_id', null)
    .neq('situacao', 'concluida').not('caso_id', 'is', null)
    .limit(300)
  if (!cand?.length) return 0

  // Aviso que já foi dado não se repete: o recado existe (lido, arquivado ou não).
  const { data: jaDados } = await sb.from('analise_recados').select('id')
    .in('id', cand.map((f) => idRecadoNaRede(f.id)))
  const dados = new Set((jaDados ?? []).map((r) => r.id))
  const novos = cand.filter((f) => !dados.has(idRecadoNaRede(f.id)))
  if (!novos.length) return 0

  const casoIds = [...new Set(novos.map((f) => f.caso_id as string))]
  const [{ data: casos }, { data: concluidas }] = await Promise.all([
    sb.from('casos').select('id, numero, etapa, cnpj, tomador_id, razao_social, assunto').in('id', casoIds),
    sb.from('analise_fila').select('caso_id').in('caso_id', casoIds).eq('situacao', 'concluida'),
  ])
  const casoConcluido = new Set((concluidas ?? []).map((f) => f.caso_id))

  const cnpjs = new Set<string>(), toms = new Set<string>()
  for (const f of novos) {
    const c = (casos ?? []).find((k) => k.id === f.caso_id)
    for (const x of [f.cnpj, c?.cnpj]) if (x) cnpjs.add(x)
    for (const x of [f.tomador_id, c?.tomador_id]) if (x) toms.add(x)
  }
  const [{ data: vigC }, { data: vigT }] = await Promise.all([
    cnpjs.size ? sb.from('analises').select('cnpj').eq('vigente', true).in('cnpj', [...cnpjs]) : Promise.resolve({ data: [] }),
    toms.size ? sb.from('analises').select('tomador_id').eq('vigente', true).in('tomador_id', [...toms]) : Promise.resolve({ data: [] }),
  ])
  const comAnaliseC = new Set((vigC ?? []).map((a: { cnpj: string | null }) => a.cnpj))
  const comAnaliseT = new Set((vigT ?? []).map((a: { tomador_id: string | null }) => a.tomador_id))

  const agora = new Date().toISOString()
  const recados = [], eventos = []
  for (const f of novos) {
    const c = (casos ?? []).find((k) => k.id === f.caso_id)
    if (!c || ['descartado', 'encerrado'].includes(String(c.etapa)) || casoConcluido.has(f.caso_id)) continue
    if ([f.cnpj, c.cnpj].some((x) => x && comAnaliseC.has(x)) || [f.tomador_id, c.tomador_id].some((x) => x && comAnaliseT.has(x))) continue
    const empresa = c.razao_social || c.assunto || f.pasta
    const desde = new Date(f.fora_do_disco_em as string).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    recados.push({
      id: idRecadoNaRede(f.id), em: agora, agente: 'supervisor',
      titulo: `${empresa} foi para a rede sem análise`,
      texto: `A pasta "${f.pasta}" (caso #${c.numero}) saiu deste computador em ${desde} com a análise ainda por fazer, e o card saiu da Mesa. `
        + 'Se o pedido ainda vale, traga a pasta de volta para a raiz e a análise volta para a fila. Se não vale mais, exclua o caso na triagem.',
      pasta: f.pasta, chave: null, cnpj: f.cnpj ?? c.cnpj ?? null,
      assinatura: `crm:na-rede:${f.id}`, nivel: 'normal',
      acoes: [{ tipo: 'card', rotulo: 'Abrir o card', pasta: f.pasta }],
      dados: { fila_id: f.id, caso_numero: c.numero, fora_do_disco_em: f.fora_do_disco_em },
      // O disco não conhece este recado: nada a confirmar com o agente.
      confirmado_em: agora, sincronizado_em: agora,
    })
    eventos.push({ tipo: 'na_rede', empresa, detalhe: `Caso #${c.numero}. A pasta foi para a rede sem análise: o recado está no mural.`, criado_por: 'supervisor' })
  }
  if (!recados.length) return 0
  const { error } = await sb.from('analise_recados').upsert(recados, { onConflict: 'id', ignoreDuplicates: true })
  if (error) return 0
  await sb.from('analise_eventos').insert(eventos)
  return recados.length
}
