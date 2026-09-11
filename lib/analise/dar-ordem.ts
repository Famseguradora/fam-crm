/* DAR UMA ORDEM À ESTEIRA · a regra de gravar, num lugar só.
   ═══════════════════════════════════════════════════════════════════════════

   Morava inteira dentro de app/api/esteira/ordem/route.ts. Saiu para cá em
   11/09/2026 porque a triagem em lote (fase 4 do Carteiro gerencial) dá a
   MESMA ordem para vários casos de uma vez: escrita duas vezes, a regra de
   "qual ordem vale em qual situação" divergiria no terceiro mês, e a
   divergência aparece como um lote que grava o que o botão de um recusaria.

   Nada aqui executa: a ordem fica guardada na linha, e o agente do notebook
   vem buscá-la. Trava: a sessão de quem chama e a RLS (`fam_pode_escrever`). */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ORDEM, ORDENS, ordemVale, type Ordem } from '@/lib/analise/esteira'

export type ResultadoOrdem =
  | { ok: true; fila: Record<string, unknown> }
  | { ok: false; status: number; erro: string }

export async function darOrdem(
  supabase: SupabaseClient,
  p: { id: string; ordem: string; dados?: Record<string, unknown> | null; nome: string },
): Promise<ResultadoOrdem> {
  const { id, nome } = p
  if (!id) return { ok: false, status: 422, erro: 'Falta dizer qual análise.' }
  /* `ORDENS.includes`, e não `ordem in ORDEM`: "constructor" também está "in"
     qualquer objeto, e a mensagem de erro quebrava tentando ler o rótulo dele. */
  if (!(ORDENS as readonly string[]).includes(p.ordem)) return { ok: false, status: 422, erro: 'Ordem desconhecida.' }
  const ordem = p.ordem as Ordem

  const { data: alvo } = await supabase
    .from('analise_fila')
    .select('id, pasta, situacao, ordem')
    .eq('id', id)
    .maybeSingle()
  if (!alvo) return { ok: false, status: 404, erro: 'Análise não está na fila.' }

  /* A CONFERÊNCIA É AQUI, no servidor, e não só na tela. A tela esconde o botão
     que não vale, mas tela é sugestão: quem garante é isto. */
  if (!ordemVale(ordem, alvo.situacao)) {
    return {
      ok: false, status: 409,
      erro: `Não dá para "${ORDEM[ordem].rotulo.toLowerCase()}" uma análise que está ${String(alvo.situacao).replace(/_/g, ' ')}.`,
    }
  }
  if (alvo.ordem) {
    return {
      ok: false, status: 409,
      erro: `Já existe uma ordem ("${ORDEM[alvo.ordem as Ordem]?.rotulo ?? alvo.ordem}") esperando o notebook. Aguarde ela ser aceita.`,
    }
  }

  const dados = p.dados && typeof p.dados === 'object' ? p.dados : {}
  const instrucao = String(dados.instrucao ?? '').trim().slice(0, 2000)
  const modo = String(dados.modo ?? '').trim() === 'rapida' ? 'rapida' : ''
  const escopo = String(dados.escopo ?? '').trim() === 'parcial' ? 'parcial' : 'completa'
  const motivo = String(dados.motivo ?? '').trim().slice(0, 500)

  /* PAUSAR E RETOMAR MUDAM A SITUAÇÃO NA HORA, e não esperam a máquina: são
     decisões que valem sozinhas. Já `iniciar` e `parar` dependem do motor, e a
     situação só muda quando ele responder. LIBERAR A ANÁLISE PARADA NUMA
     PERGUNTA (10/09/2026): quem decide que é liberação é a situação da linha. */
  const liberar = ordem === 'iniciar' && alvo.situacao === 'aguardando_resposta'
  const resposta = String(dados.resposta ?? '').trim().slice(0, 600)

  const mudanca: Record<string, unknown> = {
    ordem, ordem_em: new Date().toISOString(), ordem_por: nome,
    ordem_dados: {
      instrucao: instrucao || null, modo: modo || null, escopo, motivo: motivo || null,
      ...(liberar ? { liberar: true, resposta: resposta || null } : {}),
    },
    ultima_ordem_resultado: null, ultima_ordem_em: null,
  }
  if (ordem === 'iniciar' || ordem === 'forcar' || ordem === 'refazer') {
    mudanca.instrucao = instrucao || null
    mudanca.modo = modo || null
  }
  if (ordem === 'pausar') {
    mudanca.situacao = 'pausada'
    mudanca.pausada_motivo = `Parada por ${nome}.`
    mudanca.motivo = `Parada por ${nome}.`
  }
  if (ordem === 'retomar') {
    mudanca.situacao = 'pendente'
    mudanca.pausada_motivo = null
    mudanca.motivo = `Devolvida para a fila por ${nome}.`
  }

  const { data, error } = await supabase
    .from('analise_fila')
    .update(mudanca)
    .eq('id', id)
    // A trava contra corrida: só grava se ninguém deu ordem entre a leitura e aqui.
    .is('ordem', null)
    .select('id, pasta, situacao, ordem, ordem_por')

  if (error) return { ok: false, status: 500, erro: error.message }
  /* Escrita barrada por RLS volta ZERO linha e NENHUM erro. É pelo que voltou
     que se sabe se gravou, nunca pela ausência de erro. E o motivo se descobre
     relendo: se a linha continua sem ordem, foi a permissão (403, como era
     antes da extração); se ganhou ordem, alguém chegou antes (409). */
  if (!data?.length) {
    const { data: agora } = await supabase.from('analise_fila').select('ordem').eq('id', id).maybeSingle()
    return agora?.ordem
      ? { ok: false, status: 409, erro: 'Outra ordem chegou antes desta. Aguarde ela ser aceita.' }
      : { ok: false, status: 403, erro: 'Você tem permissão só de leitura no CRM.' }
  }
  return { ok: true, fila: data[0] }
}
