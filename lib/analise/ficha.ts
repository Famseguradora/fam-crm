// ============================================================
//  A FICHA COMPLETA DA ANÁLISE — tudo o que a Mesa do Tomador mostra.
//
//  `banco.ts` devolve os 6 números do bloco antigo. Este arquivo devolve a
//  análise INTEIRA: score, rating, taxas, os 3 C's, pontos, conclusão, os
//  exercícios e os documentos lidos. É o que enche as gavetas da Mesa.
//
//  A LIGAÇÃO É POR CNPJ, e não por `tomador_id`. Medido em 30/08/2026: as 131
//  análises estão com `tomador_id` nulo, então procurar por ele não acha nada.
//  Quando o saneamento preencher a coluna, a busca por id passa na frente
//  sozinha (ver `porTomador` abaixo) e o CNPJ vira reserva.
//
//  A REGRA DO LIMITE é a mesma de `banco.ts`, e não pode ser afrouxada aqui:
//  `limite_recomendado_num` só vale quando existe E quando não há motivo de
//  anulação. Sem número, mostra-se o texto com o aviso do que ele é, nunca um
//  número bonito que não é limite.
// ============================================================

import { createClient } from '@/lib/supabase/client'
import { soDigitos } from './local'

/** Um exercício do resumo financeiro. Valores SEMPRE em reais (a carga já
 *  converteu pela `escala`); `rotulo` é a chave porque a base nem sempre é
 *  um ano fechado ("Balancete 03/2026"). */
export interface ExercicioFicha {
  rotulo: string
  exercicio: number | null
  base: string | null
  ativo_total: number | null
  ativo_circulante: number | null
  passivo_circulante: number | null
  exigivel_total: number | null
  patrimonio_liquido: number | null
  receita_operacional: number | null
  ebitda: number | null
  lucro_liquido: number | null
  caixa: number | null
  estoques: number | null
}

export interface DocumentoFicha {
  nome: string
  bytes: number | null
  hash16: string | null
}

/** Uma consulta recente ao CNPJ, como a análise registrou. */
export interface ConsultaSerasa {
  data: string | null
  empresa: string | null
  tipo: string | null
}

/** O Serasa da análise. Cada campo pode faltar: a análise nem sempre recebeu
 *  o relatório completo, e campo que falta fica NULO, nunca "sem registros". */
export interface SerasaFicha {
  score: number | null
  risco: string | null
  interpretacao: string | null
  prob: string | null
  limite_txt: string | null
  limite_num: number | null
  pefin: string | null
  protestos: string | null
  acoes: string | null
  recuperacao: string | null
  consultas: ConsultaSerasa[]
  consultas_qtd: number | null
  /** `revisada` (a versão que ele salvou) ou `gerada`. */
  fonte: string | null
}

export interface TresCs {
  carater?: { fundamento?: string; classe?: string }
  capacidade?: { fundamento?: string; classe?: string }
  capital?: { fundamento?: string; classe?: string }
}

export interface FichaAnalise {
  id: string
  chave_local: string
  data_analise: string
  revisada: boolean
  versao: number

  razao_social: string
  grupo: string | null
  segmento: string | null
  setor: string | null

  score_final: number | null
  classe: string | null
  porte: string | null
  rating_txt: string | null
  rating_cod: string | null
  nivel_risco: string | null
  recomendacao: string | null

  /** O limite pronto para a tela: número quando é confiável, senão null. */
  limiteNum: number | null
  /** A frase a mostrar quando não há número confiável. Vazia quando há. */
  limiteAviso: string
  limite_recomendado_txt: string | null

  taxa_tradicional: number | null
  taxa_judicial: number | null
  taxa_estruturada: number | null

  condicoes: string | null
  conclusao: string | null
  pontos_positivos: string[]
  pontos_atencao: string[]
  tres_cs: TresCs | null

  /** O Serasa, quando a análise registrou alguma coisa. */
  serasa: SerasaFicha | null

  exercicios: ExercicioFicha[]
  documentos: DocumentoFicha[]
}

/** O que a ficha escreve quando o número não é limite de verdade. */
const AVISO_TIPO: Record<string, string> = {
  teorico: 'teórico',
  teto: 'teto da FAM',
  sem_limite: 'sem limite, por decisão',
  vazio: 'sem número',
}

const COLUNAS = `
  id, chave_local, cnpj, tomador_id, razao_social, grupo, segmento, setor,
  data_analise, versao, revisada,
  score_final, classe, porte, rating_txt, rating_cod, nivel_risco, recomendacao,
  limite_recomendado_txt, limite_recomendado_num, limite_recomendado_tipo,
  limite_recomendado_motivo,
  taxa_tradicional, taxa_judicial, taxa_estruturada,
  condicoes, conclusao, pontos_positivos, pontos_atencao, tres_cs,
  serasa_score, serasa_risco, serasa_interpretacao, serasa_prob,
  serasa_limite_txt, serasa_limite_num, serasa_pefin, serasa_protestos,
  serasa_acoes, serasa_recuperacao, serasa_consultas, serasa_consultas_qtd,
  serasa_fonte
`

interface LinhaCrua {
  id: string
  chave_local: string
  razao_social: string
  grupo: string | null
  segmento: string | null
  setor: string | null
  data_analise: string
  versao: number
  revisada: boolean
  score_final: number | string | null
  classe: string | null
  porte: string | null
  rating_txt: string | null
  rating_cod: string | null
  nivel_risco: string | null
  recomendacao: string | null
  limite_recomendado_txt: string | null
  limite_recomendado_num: number | string | null
  limite_recomendado_tipo: string | null
  limite_recomendado_motivo: string | null
  taxa_tradicional: number | string | null
  taxa_judicial: number | string | null
  taxa_estruturada: number | string | null
  condicoes: string | null
  conclusao: string | null
  pontos_positivos: string[] | null
  pontos_atencao: string[] | null
  tres_cs: TresCs | null
  serasa_score: number | null
  serasa_risco: string | null
  serasa_interpretacao: string | null
  serasa_prob: string | null
  serasa_limite_txt: string | null
  serasa_limite_num: number | string | null
  serasa_pefin: string | null
  serasa_protestos: string | null
  serasa_acoes: string | null
  serasa_recuperacao: string | null
  serasa_consultas: ConsultaSerasa[] | null
  serasa_consultas_qtd: number | null
  serasa_fonte: string | null
}

/** O Postgres devolve `numeric` como string. Converter sem inventar zero. */
const num = (v: number | string | null): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const curto = (s: string, n = 150) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

/**
 * A análise vigente deste tomador, inteira. `null` quando não há nenhuma.
 * Nunca lança: falha de rede devolve `null` e a Mesa mostra as gavetas vazias
 * em vez de quebrar.
 *
 * @param tomadorId  usado primeiro, quando a coluna já estiver preenchida
 * @param cnpj       o caminho que funciona hoje
 */
export async function fichaDaAnalise(
  tomadorId: string | null | undefined,
  cnpj: string | null | undefined,
): Promise<FichaAnalise | null> {
  const chave = soDigitos(cnpj)
  if (!tomadorId && chave.length !== 14) return null

  try {
    const supabase = createClient()

    // 1º por tomador_id (o dia em que o saneamento rodar, isto passa a valer),
    // 2º por CNPJ (o que funciona hoje).
    let linha: LinhaCrua | null = null

    if (tomadorId) {
      const { data } = await supabase
        .from('analises').select(COLUNAS)
        .eq('tomador_id', tomadorId).eq('vigente', true).maybeSingle()
      linha = (data as LinhaCrua | null) ?? null
    }
    if (!linha && chave.length === 14) {
      const { data } = await supabase
        .from('analises').select(COLUNAS)
        .eq('cnpj', chave).eq('vigente', true).maybeSingle()
      linha = (data as LinhaCrua | null) ?? null
    }
    if (!linha) return null

    // ── O LIMITE. A trava de `banco.ts`, repetida de propósito ──────────
    // O motivo manda: quando ele existe, a carga ANULOU o número, e o campo
    // sai como aviso escrito, jamais como valor confirmado. Um tipo novo que
    // este arquivo não conheça também cai no aviso: errar para o lado de
    // desconfiar custa um susto, errar para o outro custa dinheiro.
    const anulado = !!linha.limite_recomendado_motivo
    const limiteNum = anulado ? null : num(linha.limite_recomendado_num)
    const tipo = linha.limite_recomendado_tipo ?? 'vazio'

    let limiteAviso = ''
    if (limiteNum === null) {
      if (anulado) {
        limiteAviso = `Sem número confiável. ${linha.limite_recomendado_motivo}`
          + (linha.limite_recomendado_txt
            ? ` A análise escreveu: “${curto(linha.limite_recomendado_txt)}”` : '')
      } else if (linha.limite_recomendado_txt) {
        limiteAviso = curto(linha.limite_recomendado_txt)
          + (AVISO_TIPO[tipo] ? ` (${AVISO_TIPO[tipo]})` : '')
      } else {
        limiteAviso = 'A análise não registrou limite.'
      }
    }

    // Os filhos vão juntos: duas idas ao banco em paralelo, não em fila.
    const [{ data: exs }, { data: docs }] = await Promise.all([
      supabase.from('analise_exercicios')
        .select('rotulo, exercicio, base, ativo_total, ativo_circulante, passivo_circulante, exigivel_total, patrimonio_liquido, receita_operacional, ebitda, lucro_liquido, caixa, estoques')
        .eq('analise_id', linha.id)
        .order('rotulo', { ascending: false }),
      supabase.from('analise_documentos')
        .select('nome, bytes, hash16')
        .eq('analise_id', linha.id)
        .order('nome'),
    ])

    // O Serasa só existe quando a análise registrou ALGUMA coisa. Bloco todo
    // nulo vira `null`, e a gaveta diz que a análise não trouxe Serasa, em vez
    // de desenhar uma ficha de campos vazios.
    const temSerasa = linha.serasa_score !== null || !!linha.serasa_risco
      || !!linha.serasa_interpretacao || !!linha.serasa_limite_txt
      || (linha.serasa_consultas?.length ?? 0) > 0
    const serasa: SerasaFicha | null = temSerasa ? {
      score: linha.serasa_score,
      risco: linha.serasa_risco,
      interpretacao: linha.serasa_interpretacao,
      prob: linha.serasa_prob,
      limite_txt: linha.serasa_limite_txt,
      limite_num: num(linha.serasa_limite_num),
      pefin: linha.serasa_pefin,
      protestos: linha.serasa_protestos,
      acoes: linha.serasa_acoes,
      recuperacao: linha.serasa_recuperacao,
      consultas: linha.serasa_consultas ?? [],
      consultas_qtd: linha.serasa_consultas_qtd,
      fonte: linha.serasa_fonte,
    } : null

    type ExCrua = Record<keyof ExercicioFicha, string | number | null>
    const exercicios: ExercicioFicha[] = ((exs ?? []) as unknown as ExCrua[]).map(e => ({
      rotulo: String(e.rotulo ?? ''),
      exercicio: e.exercicio === null ? null : Number(e.exercicio),
      base: (e.base as string | null) ?? null,
      ativo_total: num(e.ativo_total as number | string | null),
      ativo_circulante: num(e.ativo_circulante as number | string | null),
      passivo_circulante: num(e.passivo_circulante as number | string | null),
      exigivel_total: num(e.exigivel_total as number | string | null),
      patrimonio_liquido: num(e.patrimonio_liquido as number | string | null),
      receita_operacional: num(e.receita_operacional as number | string | null),
      ebitda: num(e.ebitda as number | string | null),
      lucro_liquido: num(e.lucro_liquido as number | string | null),
      caixa: num(e.caixa as number | string | null),
      estoques: num(e.estoques as number | string | null),
    }))

    return {
      id: linha.id,
      chave_local: linha.chave_local,
      data_analise: linha.data_analise,
      revisada: !!linha.revisada,
      versao: linha.versao ?? 1,

      razao_social: linha.razao_social,
      grupo: linha.grupo,
      segmento: linha.segmento,
      setor: linha.setor,

      score_final: num(linha.score_final),
      classe: linha.classe,
      porte: linha.porte,
      rating_txt: linha.rating_txt,
      rating_cod: linha.rating_cod,
      nivel_risco: linha.nivel_risco,
      recomendacao: linha.recomendacao,

      limiteNum,
      limiteAviso,
      limite_recomendado_txt: linha.limite_recomendado_txt,

      taxa_tradicional: num(linha.taxa_tradicional),
      taxa_judicial: num(linha.taxa_judicial),
      taxa_estruturada: num(linha.taxa_estruturada),

      condicoes: linha.condicoes,
      conclusao: linha.conclusao,
      pontos_positivos: linha.pontos_positivos ?? [],
      pontos_atencao: linha.pontos_atencao ?? [],
      tres_cs: linha.tres_cs,
      serasa,

      exercicios,
      documentos: (docs ?? []) as DocumentoFicha[],
    }
  } catch {
    return null
  }
}
