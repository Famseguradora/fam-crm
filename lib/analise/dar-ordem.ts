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
import { ORDEM, ORDENS, ordemVale, eOrdemDoAnalista, type Ordem } from '@/lib/analise/esteira'

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

  /* Iniciar, refazer, parar, excluir: só o analista (ver ORDENS_DO_ANALISTA).
     A RLS de `analise_fila` deixa quem ajuda escrever, porque o Cadastro e o
     Comercial precisam; por isso a separação é aqui, e não no banco. */
  if (eOrdemDoAnalista(ordem)) {
    const { data: eAnalista } = await supabase.rpc('fam_e_analista')
    if (!eAnalista) {
      return {
        ok: false, status: 403,
        erro: `Só o executivo de crédito (ou quem ele liberou como analista em Usuários) pode ${ORDEM[ordem].rotulo.toLowerCase()}.`,
      }
    }
  }

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

  /* O DOSSIÊ DA ANÁLISE ANTERIOR (24/09/2026) não cabe em `instrucao`, e não
     deveria mesmo: aquele campo é o recado dele, de 2.000 caracteres, e é o que
     a Mesa mostra. O dossiê é a análise anterior INTEIRA (decisão, pontos de
     atenção, conclusão, condições, números), montada pelo CRM para o analista
     não reanalisar no escuro. Viaja só em `ordem_dados`, e o agente do notebook
     o grava no `_instrucoes.txt` da pasta.
     O teto de 100 mil caracteres é folga sobre o maior dossiê medido (12 mil):
     está aqui para impedir que um campo corrompido no acervo vire uma ordem que
     o agente não consegue ler. */
  const dossie = String(dados.dossie ?? '').slice(0, 100_000)
  /* Os documentos que ele subiu no pedido, para o agente baixá-los do Storage
     PARA DENTRO da pasta antes de rodar. É isto que acaba com o "cole na pasta
     _concluidas no notebook". */
  const documentos = Array.isArray(dados.documentos) ? dados.documentos.slice(0, 20) : []
  const reanalise_id = String(dados.reanalise_id ?? '').trim() || null

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
      ...(dossie ? { dossie } : {}),
      ...(documentos.length ? { documentos } : {}),
      ...(reanalise_id ? { reanalise_id } : {}),
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
