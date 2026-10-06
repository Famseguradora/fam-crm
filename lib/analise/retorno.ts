// ============================================================
//  O RETORNO DA ANÁLISE · o texto  ·  06/10/2026
//
//  Pedido do Marco: ENTRADA (o e-mail que abriu o caso) -> PROCESSAMENTO
//  (cadastro e análise) -> RESPOSTA. Este arquivo escreve a resposta, em
//  dois textos:
//
//    corretora  o que pode sair da FAM: decisão, limite, taxas, o que falta
//               e os documentos considerados. Ele COPIA e responde pelo
//               Outlook. Sem score, rating, Serasa nem memória de cálculo.
//    equipe     o resumo do dossiê para os colegas: tudo o de cima, mais
//               score, rating, Serasa, pontos e a conclusão inteira.
//
//  É CÓDIGO, NÃO IA, de propósito: o texto vai para fora da FAM, e número
//  de limite e taxa não pode ser reescrito por ninguém além da análise.
//  Função pura: recebe os dados prontos, devolve os textos. Quem busca no
//  banco é `retorno-servidor.ts`.
//
//  O SISTEMA SÓ LÊ E-MAIL (ordem de 06/10/2026): nada aqui responde.
// ============================================================

import { fmtMoeda } from '@/lib/utils'
import { limiteDaAnalise, type LimiteCru } from './limite-da-analise'

export interface DadosDoRetorno extends LimiteCru {
  razao_social: string
  cnpj: string | null
  data_analise: string | null
  versao: number | null
  recomendacao: string | null
  taxa_tradicional: number | string | null
  taxa_judicial: number | string | null
  taxa_estruturada: number | string | null
  condicoes: string | null
  conclusao: string | null
  pontos_positivos: string[]
  pontos_atencao: string[]
  score_final: number | string | null
  classe: string | null
  porte: string | null
  rating_txt: string | null
  nivel_risco: string | null
  serasa_score: number | null
  serasa_risco: string | null
  exercicios: string[]
  documentos: string[]
  /** Itens da ressalva (a mesma conta do robô dos lembretes) e o que a esteira viu faltar. */
  pendencias: string[]
  entrada: {
    assunto: string | null
    de: string | null
    recebido_em: string | null
    numero: number | null
    aberto_por: string | null
    corretora: string | null
    produto: string | null
  } | null
  concluido_em: string | null
}

const dia = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
    .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null

const pct = (v: number | string | null) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%` : null
}

export const cnpjFormatado = (c: string | null) => {
  const d = (c ?? '').replace(/\D/g, '')
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : null
}

/** A decisão dita para fora, no particípio: "Aprovar" é a ordem, "Aprovado" é o resultado. */
export function decisaoParaFora(rec: string | null): string {
  const r = (rec ?? '').trim()
  const n = r.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (!r) return 'Análise concluída'
  if (n.includes('ressalva')) return 'Aprovado com ressalvas'
  if (/^(aprovar|aprovad)/.test(n)) return 'Aprovado'
  if (/(recusar|recusad|reprovar|reprovad|negar|negad)/.test(n)) return 'Não aprovado'
  return r
}

/** Tira o caminho e o hash que o motor às vezes põe na frente do nome. */
const nomeDoDocumento = (n: string) => n.split(/[\\/]/).pop()!.replace(/^[0-9a-f]{8,}[_-]/i, '').trim()

/** O próprio e-mail de entrada, guardado na pasta, não é documento que a corretora mandou. */
const ehOEmail = (n: string) => /^e-?mail\b/i.test(n) || /\.(msg|eml)$/i.test(n)
/** O Serasa é consulta da FAM: a equipe vê, a corretora não. */
const ehInterno = (n: string) => ehOEmail(n) || /serasa/i.test(n)

function linhasDasTaxas(d: DadosDoRetorno): string[] {
  const t = [
    ['tradicional', pct(d.taxa_tradicional)],
    ['judicial', pct(d.taxa_judicial)],
    ['estruturada', pct(d.taxa_estruturada)],
  ].filter(([, v]) => v) as [string, string][]
  return t.length ? [`Taxas: ${t.map(([k, v]) => `${k} ${v}`).join(' · ')}`] : []
}

function textoDoLimite(d: DadosDoRetorno): string {
  const { limiteNum, limiteAviso } = limiteDaAnalise(d)
  // O Intl põe espaço inseparável depois do "R$": no Outlook ele cola como
  // caractere estranho em alguns leitores. Espaço comum.
  return (limiteNum !== null ? fmtMoeda(limiteNum) : limiteAviso).replace(/ /g, ' ')
}

const numerada = (itens: string[]) => itens.map((x, i) => `${i + 1}. ${x}`)

/** A lista do que falta, como vai para a corretora: objetiva, numerada, sem repetição. */
export function listaDoQueFalta(pendencias: string[]): string[] {
  const vistos = new Set<string>()
  return pendencias
    .map(p => p.replace(/\s+/g, ' ').trim().replace(/[;.]$/, ''))
    // "precisamos receber: 1. Entrega do Serasa" repete o verbo: fica "Serasa".
    .map(p => p.replace(/^(entrega|envio|apresenta[çc][ãa]o|encaminhamento)\s+(d[oa]s?\s+)?/i, ''))
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .filter(p => p.length >= 3 && !vistos.has(p.toLowerCase()) && vistos.add(p.toLowerCase()))
}

export function montarRetorno(d: DadosDoRetorno): { corretora: string; equipe: string; pendencias: string[] } {
  const cnpj = cnpjFormatado(d.cnpj)
  const empresa = `${d.razao_social}${cnpj ? ` (CNPJ ${cnpj})` : ''}`
  const decisao = decisaoParaFora(d.recomendacao)
  const limite = textoDoLimite(d)
  const falta = listaDoQueFalta(d.pendencias)
  const docs = [...new Set(d.documentos.map(nomeDoDocumento).filter(n => n && !ehOEmail(n)))]
  const docsFora = docs.filter(n => !ehInterno(n))
  const quando = dia(d.data_analise)

  // ── para a corretora ─────────────────────────────────────────────────────
  const c: string[] = []
  c.push('Prezados,', '')
  c.push(`Concluímos a análise de crédito de ${empresa}${quando ? `, com data de ${quando}` : ''}.`, '')
  c.push(`Resultado: ${decisao}`)
  c.push(`Limite de crédito: ${limite}`)
  c.push(...linhasDasTaxas(d))
  if (falta.length) {
    c.push('', decisao === 'Aprovado com ressalvas'
      ? 'Para a liberação do crédito, precisamos receber:'
      : 'Para concluir, precisamos receber:')
    c.push(...numerada(falta))
  } else if (d.condicoes && decisao !== 'Não aprovado' && !/^\s*sem condi/i.test(d.condicoes)) {
    c.push('', `Condições: ${d.condicoes.trim()}`)
  }
  if (docsFora.length) {
    c.push('', `Documentos considerados na análise (${docsFora.length}):`)
    c.push(...docsFora.map(x => `- ${x}`))
  }
  c.push('', 'Ficamos à disposição para qualquer esclarecimento.', '', 'Atenciosamente,', 'Análise de Crédito · FAM Seguradora')

  // ── para a equipe ────────────────────────────────────────────────────────
  const e: string[] = []
  e.push(`RETORNO DA ANÁLISE · ${empresa}`, '')
  if (d.entrada) {
    const en = d.entrada
    e.push('Entrada')
    if (en.assunto) e.push(`- E-mail: ${en.assunto}`)
    const quem = [en.de && `de ${en.de}`, dia(en.recebido_em) && `recebido em ${dia(en.recebido_em)}`].filter(Boolean).join(', ')
    if (quem) e.push(`- ${quem.charAt(0).toUpperCase()}${quem.slice(1)}`)
    const caso = [en.numero && `caso nº ${en.numero}`, en.aberto_por && `aberto por ${en.aberto_por}`].filter(Boolean).join(', ')
    if (caso) e.push(`- ${caso.charAt(0).toUpperCase()}${caso.slice(1)}`)
    if (en.corretora) e.push(`- Corretora: ${en.corretora}`)
    if (en.produto) e.push(`- Produto: ${en.produto}`)
    e.push('')
  }
  e.push('O que foi feito')
  e.push(`- Análise de crédito${quando ? ` de ${quando}` : ''}${d.versao && d.versao > 1 ? `, versão ${d.versao}` : ''}${dia(d.concluido_em) ? `, concluída em ${dia(d.concluido_em)}` : ''}`)
  if (d.exercicios.length) e.push(`- Demonstrações analisadas: ${d.exercicios.join(' · ')}`)
  if (d.serasa_score !== null || d.serasa_risco) {
    e.push(`- Serasa: ${[d.serasa_score !== null && `score ${d.serasa_score}`, d.serasa_risco && `risco ${d.serasa_risco}`].filter(Boolean).join(', ')}`)
  }
  e.push(`- Documentos considerados: ${docs.length}`)
  e.push('')
  e.push('Resultado')
  e.push(`- Decisão: ${decisao}`)
  e.push(`- Limite de crédito: ${limite}`)
  e.push(...linhasDasTaxas(d).map(x => `- ${x}`))
  const nota = [
    d.score_final !== null && d.score_final !== '' && `score ${String(d.score_final).replace('.', ',')}`,
    d.classe && `classe ${d.classe}`,
    d.porte && `porte ${d.porte}`,
    d.rating_txt && `rating ${d.rating_txt}`,
    d.nivel_risco && `risco ${d.nivel_risco}`,
  ].filter(Boolean)
  if (nota.length) e.push(`- ${nota.join(' · ')}`)
  if (d.conclusao) e.push('', 'Conclusão', d.conclusao.trim())
  if (d.pontos_positivos.length) e.push('', 'Pontos positivos', ...d.pontos_positivos.map(x => `- ${x}`))
  if (d.pontos_atencao.length) e.push('', 'Pontos de atenção', ...d.pontos_atencao.map(x => `- ${x}`))
  if (d.condicoes) e.push('', 'Condições', d.condicoes.trim())
  if (falta.length) e.push('', 'O que falta', ...numerada(falta))
  if (docs.length) e.push('', 'Documentos considerados', ...docs.map(x => `- ${x}`))

  return { corretora: c.join('\n'), equipe: e.join('\n'), pendencias: falta }
}
