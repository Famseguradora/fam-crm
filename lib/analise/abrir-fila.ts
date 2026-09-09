/* O CASO VIRA ANÁLISE. Uma regra só, para as duas portas.

   Duas coisas chamam isto, e elas não podem divergir:

     a Triagem, ao concluir       o caminho normal, e o que o cabeçalho da rota
                                  `casos/[id]/concluir` já prometia desde que
                                  foi escrita: "o caso entra na fila da análise
                                  de crédito". Faltava a fila existir.
     o botão "Mandar para a       para o caso que já foi concluído antes desta
     análise"                     fila existir, ou que voltou atrás

   O QUE ESTA FUNÇÃO NÃO FAZ: não copia documento, não cria pasta no disco, não
   chama o motor. Ela só declara que existe uma análise a fazer. Quem materializa
   a pasta no notebook é o agente (`scripts/esteira.mjs`), porque é ele que está
   na máquina onde o motor lê arquivo.

   Nenhuma IA aqui, nem chave de API: a IA da análise é o `claude.exe` da
   assinatura, no notebook, e continua lá. */

import type { SupabaseClient } from '@supabase/supabase-js'
import { limparNome } from '@/lib/email/ler-email'

export interface CasoParaAnalise {
  id: string
  numero: number
  assunto: string
  cnpj: string | null
  razao_social: string | null
  tomador_id: string | null
}

export type ResultadoFila =
  | { ok: true; fila: { id: string; pasta: string }; ja_existia: boolean }
  | { ok: false; erro: string; status: number }

/* O NOME DA PASTA. É a chave da fila e é o nome da pasta que vai nascer no
   notebook, então precisa ser legível por gente e válido no Windows.

   A razão social vem primeiro porque é assim que o acervo é organizado hoje
   ("Construtora R. Yazbek", "Voltalia Energia"). Sem razão social ainda, cai no
   assunto do e-mail, que é o que a Triagem tinha. E o número do caso entra só
   quando há colisão: duas empresas com nome parecido existem, e duas pastas com
   o mesmo nome não. */
export function nomeDaPasta(caso: CasoParaAnalise) {
  const base = limparNome(caso.razao_social || caso.assunto || `Caso ${caso.numero}`)
    .replace(/\s{2,}/g, ' ')
    .slice(0, 90)
    .trim()
  return base || `Caso ${caso.numero}`
}

export async function abrirNaFila(
  supabase: SupabaseClient,
  caso: CasoParaAnalise,
  quem: string,
): Promise<ResultadoFila> {
  /* JÁ ESTÁ NA FILA? Sem esta pergunta, concluir a triagem duas vezes (ou
     clicar duas vezes no botão) criaria duas análises da mesma empresa, e a
     segunda ficaria parada para sempre porque a primeira segura a pasta. */
  const { data: ja } = await supabase
    .from('analise_fila')
    .select('id, pasta')
    .eq('caso_id', caso.id)
    .maybeSingle()
  if (ja) return { ok: true, fila: ja, ja_existia: true }

  const desejado = nomeDaPasta(caso)

  /* COLISÃO DE NOME DE PASTA. `pasta` é único, e o insert falharia inteiro por
     causa de uma homônima. Preferir descobrir aqui, com o número do caso como
     desempate, do que devolver um erro de banco para quem clicou. */
  const { data: mesmoNome } = await supabase
    .from('analise_fila').select('id').eq('pasta', desejado).maybeSingle()
  const pasta = mesmoNome ? `${desejado} (#${caso.numero})` : desejado

  const { data, error } = await supabase
    .from('analise_fila')
    .insert({
      caso_id: caso.id,
      tomador_id: caso.tomador_id,
      cnpj: caso.cnpj,
      razao_social: caso.razao_social,
      pasta,
      situacao: 'pendente',
      motivo: `Veio da Triagem do caso #${caso.numero}. Esperando o notebook montar a pasta.`,
      criado_por: quem,
    })
    .select('id, pasta')
    .single()

  /* Escrita barrada por RLS volta sem linha e às vezes sem erro: a checagem é
     pelo que VOLTOU, e não pela ausência de `error`. */
  if (error || !data) {
    return {
      ok: false,
      erro: error?.message ?? 'Você não tem permissão para mandar casos para a análise.',
      status: error ? 500 : 403,
    }
  }

  // Os dois lados se apontam: do caso para a fila, e da fila para o caso.
  await supabase.from('casos').update({ analise_fila_id: data.id }).eq('id', caso.id)

  return { ok: true, fila: data, ja_existia: false }
}
