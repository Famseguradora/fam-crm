// ============================================================================
//  ACHAR (OU CRIAR) A LINHA DA ESTEIRA DE UMA ANÁLISE DO ACERVO
//
//  Morava inteira dentro de `app/api/esteira/refazer-acervo/route.ts`. Saiu
//  para cá em 24/09/2026 porque a Reanálise (`/api/analise/reanalisar`) precisa
//  exatamente do mesmo caminho: achar a linha, ou criá-la com a pasta que a
//  própria análise guardou, sem duplicar e sem atropelar outra pasta do mesmo
//  CNPJ que já esteja andando.
//
//  Duplicar isto seria o defeito clássico do projeto: duas rotas que decidem
//  "já está na esteira?" com regras que divergem no terceiro mês, e a
//  divergência aparece como uma pasta duplicada na Mesa.
//
//  As travas, todas mantidas do original:
//    · a linha é procurada por `analise_id`, `analise_chave` e `pasta`, em três
//      perguntas separadas: `or()` do PostgREST quebra com a vírgula do nome
//      da pasta ("Obrascon Huarte Lain, do Brasil");
//    · outra pasta do MESMO CNPJ andando na esteira recusa com 409;
//    · a corrida com o agente (23505) relê em vez de estourar;
//    · escrita barrada por RLS volta zero linha e nenhum erro, então é pelo que
//      voltou que se sabe se gravou.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export type LinhaFila = {
  id: string
  pasta: string
  situacao: string
  ordem: string | null
  ultima_ordem_resultado?: string | null
  ultima_ordem_em?: string | null
  sincronizado_em?: string | null
}

export const COLUNAS_LINHA_FILA =
  'id, pasta, situacao, ordem, ultima_ordem_resultado, ultima_ordem_em, sincronizado_em'

/** A análise, como esta peça precisa vê-la. */
export type AnaliseParaFila = {
  id: string
  chave_local: string | null
  cnpj: string | null
  razao_social: string | null
  nome_curto: string | null
  tomador_id: string | null
  corretora: string | null
  pasta: string | null
}

export const COLUNAS_ANALISE_PARA_FILA =
  'id, chave_local, cnpj, razao_social, nome_curto, tomador_id, corretora, pasta'

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/* O notebook já aceitou um refazer e a sincronização ainda não trouxe a pasta
   de volta: a linha continua "concluída" e sem ordem por alguns segundos. Um
   segundo clique nessa janela gravaria outro refazer em cima do primeiro. */
export const estaRefazendo = (l: LinhaFila) =>
  /^De volta à fila para refazer/.test(l.ultima_ordem_resultado ?? '')
  && !!l.ultima_ordem_em && (!l.sincronizado_em || l.ultima_ordem_em > l.sincronizado_em)

export type ResultadoLinha =
  | { ok: true; linha: LinhaFila; criada: boolean }
  | { ok: false; status: number; erro: string; fila_id?: string }

export async function acharOuCriarLinha(
  supabase: SupabaseClient,
  a: AnaliseParaFila,
  quem: string,
  motivo: string,
): Promise<ResultadoLinha> {
  const pasta = String(a.pasta ?? '').trim()
  if (!pasta || /[\\/:*?"<>|]/.test(pasta)) {
    return {
      ok: false, status: 422,
      erro: 'Esta análise não guardou o nome da pasta no notebook, então não sei qual pasta trazer de volta.',
    }
  }
  const cnpj = digitos(a.cnpj)

  const achar = async (): Promise<LinhaFila | null> => {
    const chaves: [string, string | null][] = [['analise_id', a.id], ['analise_chave', a.chave_local], ['pasta', pasta]]
    for (const [coluna, valor] of chaves) {
      if (!valor) continue
      const { data } = await supabase
        .from('analise_fila').select(COLUNAS_LINHA_FILA)
        .eq(coluna, valor).order('atualizado_em', { ascending: false }).limit(1)
      if (data?.[0]) return data[0] as LinhaFila
    }
    return null
  }

  const linha = await achar()

  if (!linha && cnpj.length === 14) {
    const { data: outra } = await supabase
      .from('analise_fila').select('id, pasta')
      .eq('cnpj', cnpj).neq('situacao', 'concluida').is('fora_do_disco_em', null)
      .limit(1)
    if (outra?.[0]) {
      return {
        ok: false, status: 409, fila_id: outra[0].id as string,
        erro: `Esta empresa já tem uma pasta andando na esteira ("${outra[0].pasta}"). Refaça por lá, para não rodar duas análises do mesmo CNPJ.`,
      }
    }
  }

  if (linha) return { ok: true, linha, criada: false }

  const { data, error } = await supabase
    .from('analise_fila')
    .insert({
      pasta,
      situacao: 'concluida',
      fase: 'pronta',
      analise_id: a.id,
      analise_chave: a.chave_local,
      chave_local: a.chave_local,
      cnpj: cnpj.length === 14 ? cnpj : null,
      cnpj_confiavel: cnpj.length === 14,
      razao_social: a.razao_social,
      nome: a.nome_curto || a.razao_social,
      tomador_id: a.tomador_id,
      corretora: a.corretora,
      motivo,
      criado_por: quem,
    })
    .select(COLUNAS_LINHA_FILA)

  if (error) {
    // O agente pode ter criado a mesma pasta entre a pergunta e aqui.
    if (error.code === '23505') {
      const relida = await achar()
      if (relida) return { ok: true, linha: relida, criada: false }
    }
    return { ok: false, status: 500, erro: error.message }
  }
  if (!data?.length) return { ok: false, status: 403, erro: 'Você tem permissão só de leitura no CRM.' }
  return { ok: true, linha: data[0] as LinhaFila, criada: true }
}

/** A linha que acabou de nascer e não recebeu ordem não pode ficar na Mesa
 *  como pasta fantasma. Só apaga a que ainda não foi sincronizada. */
export async function desfazerLinha(supabase: SupabaseClient, id: string) {
  await supabase.from('analise_fila').delete().eq('id', id).is('sincronizado_em', null)
}
