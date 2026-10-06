// ============================================================
//  O RETORNO DA ANÁLISE · banco  ·  06/10/2026
//
//  Busca o que o texto precisa, grava em `analise_retornos` e avisa os
//  colegas pelo sino (que vira push no celular sozinho). Roda SEMPRE com a
//  chave de serviço: criar o retorno é ato do sistema, e a rota confere quem
//  é antes de chamar.
//
//  QUANDO NASCE:
//    · sozinho, na sincronização da esteira, para análise concluída a partir
//      de RETORNO_DESDE (antes disso nasceria em massa para o acervo inteiro
//      e o sino de todo mundo tocaria por coisa velha);
//    · ao abrir o caso ou o tomador, para qualquer análise, sem tocar o sino;
//    · no "Gerar de novo", pelo analista.
//
//  O SISTEMA SÓ LÊ E-MAIL (ordem de 06/10/2026): nada aqui responde.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { montarRetorno, decisaoParaFora, type DadosDoRetorno } from './retorno'

/** Análise concluída antes disto não toca o sino: o retorno nasce quando alguém abre. */
export const RETORNO_DESDE = '2026-10-06T00:00:00-03:00'

export const COLUNAS_RETORNO =
  'id, analise_id, caso_id, analise_fila_id, tomador_id, email_caixa_id, texto_corretora, texto_equipe, pendencias, gerado_em, gerado_por, editado_em, editado_por, avisados, respondido_em, respondido_por, respondido_como'

export interface Retorno {
  id: string
  analise_id: string
  caso_id: string | null
  analise_fila_id: string | null
  tomador_id: string | null
  email_caixa_id: string | null
  texto_corretora: string
  texto_equipe: string
  pendencias: string[]
  gerado_em: string
  gerado_por: string
  editado_em: string | null
  editado_por: string | null
  avisados: number
  respondido_em: string | null
  respondido_por: string | null
  respondido_como: 'manual' | 'detectado' | null
  /** Só na resposta da rota, para a tela dizer de qual caso é. */
  caso_numero?: number | null
}

/* `ressalva_itens` corta cada item em 300 letras, que é o tamanho de um item
   de lembrete. Para a corretora, item cortado no meio da frase não serve: o
   resto é buscado na própria condição, até o próximo (ii) ou o fim. */
function itemInteiro(item: string, condicoes: string): string {
  if (item.length < 300) return item
  const t = condicoes.replace(/\s+/g, ' ')
  const ini = t.toLowerCase().indexOf(item.slice(1, 120).toLowerCase())
  if (ini < 0) return item
  const resto = t.slice(ini - 1)
  const fim = resto.search(/\s\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\)\s|conferido e condizente/i)
  const inteiro = (fim > 0 ? resto.slice(0, fim) : resto).trim().replace(/[\s;,]+(e)?$/, '').replace(/[;.]$/, '')
  return inteiro.length >= item.length ? item.charAt(0) + inteiro.slice(1) : item
}

const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => String(x ?? '').trim()).filter(Boolean) : [])

/** Tudo o que o texto precisa, de uma análise e (quando há) do caso que ela responde. */
export async function dadosDoRetorno(sb: SupabaseClient, analiseId: string, casoId: string | null) {
  const { data: a } = await sb.from('analises').select(
    'id, razao_social, cnpj, tomador_id, data_analise, versao, recomendacao, limite_recomendado_txt, limite_recomendado_num, limite_recomendado_tipo, limite_recomendado_motivo, taxa_tradicional, taxa_judicial, taxa_estruturada, condicoes, conclusao, pontos_positivos, pontos_atencao, score_final, classe, porte, rating_txt, nivel_risco, serasa_score, serasa_risco',
  ).eq('id', analiseId).maybeSingle()
  if (!a) return null

  const [{ data: docs }, { data: exs }, { data: fila }, { data: caso }] = await Promise.all([
    sb.from('analise_documentos').select('nome').eq('analise_id', analiseId).order('nome'),
    sb.from('analise_exercicios').select('rotulo').eq('analise_id', analiseId).order('rotulo', { ascending: false }),
    casoId
      ? sb.from('analise_fila').select('id, documentos_faltando, concluido_em').eq('caso_id', casoId).eq('analise_id', analiseId)
        .order('concluido_em', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
      : sb.from('analise_fila').select('id, documentos_faltando, concluido_em').eq('analise_id', analiseId)
        .order('concluido_em', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    casoId
      ? sb.from('casos').select('id, numero, assunto, remetente_nome, recebido_em, criado_por_nome, criado_por_auth_id, corretora_texto, produto, email_caixa_id, tomador_id').eq('id', casoId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  let matriz: { assunto: string | null; de: string | null; email_de: string | null; recebido_em: string | null; dono_auth_id: string | null } | null = null
  if (caso?.email_caixa_id) {
    const { data } = await sb.from('emails_caixa').select('assunto, de, email_de, recebido_em, dono_auth_id').eq('id', caso.email_caixa_id).maybeSingle()
    matriz = data
  }

  /* O QUE FALTA: os itens da ressalva pela MESMA função do robô dos lembretes
     (`ressalva_itens`), para o lembrete e o retorno dizerem a mesma lista, e
     o que a esteira viu faltar na pasta. */
  const pendencias: string[] = []
  if (a.condicoes && decisaoParaFora(a.recomendacao) === 'Aprovado com ressalvas') {
    const { data: itens } = await sb.rpc('ressalva_itens', { p: a.condicoes })
    pendencias.push(...lista(itens).map(i => itemInteiro(i, a.condicoes as string)))
  }
  pendencias.push(...lista(fila?.documentos_faltando).map(x => `Documento: ${x}`))

  const dados: DadosDoRetorno = {
    razao_social: a.razao_social,
    cnpj: a.cnpj,
    data_analise: a.data_analise,
    versao: a.versao,
    recomendacao: a.recomendacao,
    limite_recomendado_txt: a.limite_recomendado_txt,
    limite_recomendado_num: a.limite_recomendado_num,
    limite_recomendado_tipo: a.limite_recomendado_tipo,
    limite_recomendado_motivo: a.limite_recomendado_motivo,
    taxa_tradicional: a.taxa_tradicional,
    taxa_judicial: a.taxa_judicial,
    taxa_estruturada: a.taxa_estruturada,
    condicoes: a.condicoes,
    conclusao: a.conclusao,
    pontos_positivos: lista(a.pontos_positivos),
    pontos_atencao: lista(a.pontos_atencao),
    score_final: a.score_final,
    classe: a.classe,
    porte: a.porte,
    rating_txt: a.rating_txt,
    nivel_risco: a.nivel_risco,
    serasa_score: a.serasa_score,
    serasa_risco: a.serasa_risco,
    exercicios: lista((exs ?? []).map(x => x.rotulo)),
    documentos: lista((docs ?? []).map(x => x.nome)),
    pendencias,
    entrada: caso ? {
      assunto: matriz?.assunto ?? caso.assunto,
      de: matriz?.de || matriz?.email_de || caso.remetente_nome,
      recebido_em: matriz?.recebido_em ?? caso.recebido_em,
      numero: caso.numero,
      aberto_por: caso.criado_por_nome,
      corretora: caso.corretora_texto,
      produto: caso.produto,
    } : null,
    concluido_em: fila?.concluido_em ?? null,
  }

  return {
    dados,
    analise: a,
    filaId: (fila?.id as string | undefined) ?? null,
    caso,
    donoDoEmail: matriz?.dono_auth_id ?? null,
  }
}

/**
 * Cria ou refaz o retorno de (análise, caso). Retorno EDITADO à mão não é
 * sobrescrito sem `forcar`: o texto que alguém ajustou vale mais que o gerado.
 */
export async function gerarRetorno(sb: SupabaseClient, p: {
  analiseId: string
  casoId: string | null
  por: string
  avisar: boolean
  forcar?: boolean
}): Promise<{ ok: true; retorno: Retorno; novo: boolean } | { ok: false; erro: string }> {
  const achado = await dadosDoRetorno(sb, p.analiseId, p.casoId)
  if (!achado) return { ok: false, erro: 'Análise não encontrada.' }
  const { dados, analise, filaId, caso, donoDoEmail } = achado

  let q = sb.from('analise_retornos').select(COLUNAS_RETORNO).eq('analise_id', p.analiseId)
  q = p.casoId ? q.eq('caso_id', p.casoId) : q.is('caso_id', null)
  const { data: atual } = await q.maybeSingle()
  if (atual && atual.editado_em && !p.forcar) return { ok: true, retorno: atual as Retorno, novo: false }

  const t = montarRetorno(dados)
  const linha = {
    analise_id: p.analiseId,
    caso_id: p.casoId,
    analise_fila_id: filaId,
    tomador_id: caso?.tomador_id ?? analise.tomador_id ?? null,
    email_caixa_id: caso?.email_caixa_id ?? null,
    texto_corretora: t.corretora,
    texto_equipe: t.equipe,
    pendencias: t.pendencias,
    gerado_em: new Date().toISOString(),
    gerado_por: p.por,
    editado_em: null,
    editado_por: null,
  }

  const { data: gravado, error } = atual
    ? await sb.from('analise_retornos').update(linha).eq('id', atual.id).select(COLUNAS_RETORNO).single()
    : await sb.from('analise_retornos').insert(linha).select(COLUNAS_RETORNO).single()
  if (error || !gravado) {
    // Duas abas abrindo o mesmo caso ao mesmo tempo: o índice único segura, e a outra já gravou.
    if (error?.code === '23505') {
      const { data: outro } = await (p.casoId
        ? sb.from('analise_retornos').select(COLUNAS_RETORNO).eq('analise_id', p.analiseId).eq('caso_id', p.casoId)
        : sb.from('analise_retornos').select(COLUNAS_RETORNO).eq('analise_id', p.analiseId).is('caso_id', null)).maybeSingle()
      if (outro) return { ok: true, retorno: outro as Retorno, novo: false }
    }
    return { ok: false, erro: error?.message ?? 'Não consegui gravar o retorno.' }
  }

  let retorno = gravado as Retorno
  if (p.avisar && !atual) {
    const n = await avisarColegas(sb, retorno, dados.razao_social, decisaoParaFora(dados.recomendacao), [caso?.criado_por_auth_id ?? null, donoDoEmail])
    if (n) {
      await sb.from('analise_retornos').update({ avisados: n }).eq('id', retorno.id)
      retorno = { ...retorno, avisados: n }
    }
  }
  return { ok: true, retorno, novo: !atual }
}

/** Sino para quem abriu o caso, o dono do e-mail de entrada e os analistas. O push sai sozinho. */
async function avisarColegas(sb: SupabaseClient, r: Retorno, empresa: string, decisao: string, extras: (string | null)[]): Promise<number> {
  const { data: analistas } = await sb.from('usuarios').select('auth_id').eq('analista_credito', true).eq('status', 'ativo')
  const para = [...new Set([...extras, ...(analistas ?? []).map(u => u.auth_id as string | null)].filter((x): x is string => !!x))]
  if (!para.length) return 0
  const link = r.caso_id ? `/comercial/${r.caso_id}` : r.tomador_id ? `/tomadores/${r.tomador_id}` : `/analises/${r.analise_id}`
  const { error } = await sb.from('notificacoes').insert(para.map(id => ({
    para_auth_id: id,
    titulo: `Retorno da Análise pronto: ${empresa}`.slice(0, 200),
    texto: `${decisao}. O texto para responder a corretora está no caso, pronto para copiar.`,
    link,
  })))
  return error ? 0 : para.length
}

/**
 * A varredura que roda na sincronização da esteira: análise concluída a
 * partir de RETORNO_DESDE, com caso, sem retorno ainda. Poucas por vez, e
 * nunca derruba a sincronização (quem chama engole o erro).
 */
export async function gerarRetornosPendentes(sb: SupabaseClient, max = 5): Promise<number> {
  const { data: filas } = await sb.from('analise_fila')
    .select('caso_id, analise_id')
    .eq('situacao', 'concluida')
    .not('analise_id', 'is', null)
    .not('caso_id', 'is', null)
    .gte('concluido_em', RETORNO_DESDE)
    /* Do mais novo para o mais velho (achado da revisão): em ordem crescente,
       depois que as 50 mais antigas tivessem retorno, nenhuma nova entraria
       na janela e o sino nunca mais tocaria. */
    .order('concluido_em', { ascending: false })
    .limit(50)
  if (!filas?.length) return 0

  const { data: feitos } = await sb.from('analise_retornos')
    .select('analise_id, caso_id')
    .in('analise_id', [...new Set(filas.map(f => f.analise_id as string))])
  const ja = new Set((feitos ?? []).map(f => `${f.analise_id}|${f.caso_id}`))

  let n = 0
  for (const f of filas) {
    if (n >= max) break
    if (ja.has(`${f.analise_id}|${f.caso_id}`)) continue
    ja.add(`${f.analise_id}|${f.caso_id}`)
    const r = await gerarRetorno(sb, { analiseId: f.analise_id as string, casoId: f.caso_id as string, por: 'sistema', avisar: true })
    if (r.ok && r.novo) n++
  }
  return n
}
