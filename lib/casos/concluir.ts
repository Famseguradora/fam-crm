/* O CASO PASSA PARA O TOMADOR. Uma regra só, para as duas portas.

   Quem chama:
     a rota `casos/[id]/concluir`   o clique "Concluir" na tela do caso
     o agente de Cadastro           a esteira automática, sem clique (10/09/2026)

   As duas fazem exatamente a mesma coisa com o caso: amarram o tomador, mudam a
   etapa para `analise` e levam os documentos para a ficha dele. Escrito em dois
   lugares, o caso concluído pelo agente teria os documentos num lugar e o
   concluído à mão em outro. */

import type { SupabaseClient } from '@supabase/supabase-js'

export type ResultadoPassagem =
  | { ok: true; documentos_movidos: number; aviso_documentos: string | null }
  | { ok: false; erro: string; status: number }

export async function passarCasoParaTomador(
  supabase: SupabaseClient,
  casoId: string,
  tomadorId: string,
): Promise<ResultadoPassagem> {
  const agora = new Date().toISOString()

  const { data: atualizado, error: erroCaso } = await supabase
    .from('casos')
    .update({ tomador_id: tomadorId, etapa: 'analise', enviado_analise_em: agora })
    .eq('id', casoId)
    .select('id')
    .single()

  if (erroCaso || !atualizado) {
    return {
      ok: false,
      erro: erroCaso?.message ?? 'Sem permissão para concluir o caso.',
      status: erroCaso ? 500 : 403,
    }
  }

  // Os documentos passam a ser do tomador (a tela dele lê por entidade_tipo).
  //
  // CONFERIDO PELO QUE VOLTOU, e não pela ausência de erro: escrita barrada por
  // RLS devolve zero linha e nenhum erro. Se isto falhasse calado, o cadastro
  // nasceria certo e a aba Arquivos do tomador ficaria vazia com o Serasa e o
  // balanço já lidos na triagem — que é exatamente o sintoma que esta empresa
  // já perseguiu uma vez.
  const { data: esperados } = await supabase
    .from('anexos').select('id').eq('entidade_tipo', 'caso').eq('entidade_id', casoId)

  const { data: movidos, error: erroMover } = await supabase
    .from('anexos')
    .update({ entidade_tipo: 'tomador', entidade_id: tomadorId, tomador_id: tomadorId })
    .eq('entidade_tipo', 'caso')
    .eq('entidade_id', casoId)
    .select('id')

  const faltaram = (esperados?.length ?? 0) - (movidos?.length ?? 0)
  return {
    ok: true,
    documentos_movidos: movidos?.length ?? 0,
    aviso_documentos: erroMover
      ? `Os documentos não foram para a ficha do tomador: ${erroMover.message}`
      : faltaram > 0
        ? `${faltaram} documento(s) continuaram no caso e não apareceram na ficha do tomador.`
        : null,
  }
}
