// ============================================================================
//  O RELATÓRIO GERENCIAL DO MÊS  ·  a performance da FAM, contada pelo código
//
//  Pedido do Marco em 11/09/2026: "um relatório gerencial sobre a produtividade,
//  que inclui a etapa dos e-mails recebidos + a gestão de análises realizadas.
//  Para a empresa como um todo, não por usuário. Por mês. Somente no aspecto de
//  performance da empresa, por funil, modalidade, corretoras e outros KPIs."
//
//  NENHUMA FÓRMULA NASCE AQUI. Cada número vem do módulo que já mostra esse
//  número em outra tela, para o relatório nunca discordar dela:
//    · a ponte do e-mail            lib/email/ponte.ts        (Comercial)
//    · o atendimento do e-mail      lib/email/metricas.ts     (Comercial, "A porta de entrada")
//    · o retrato das análises       lib/analise/retrato.ts    (Gestão e Sala de Comando)
//    · LMG capado e os três mundos  lib/ia/regras-operacao.ts (Operações e o robô)
//    · a taxa média ponderada       lib/corretoras/agregacoes.ts (Operações, KPIs por Mês)
//  O que é só deste arquivo é o RECORTE: qual linha cai em qual mês.
//
//  O MÊS É O DE SÃO PAULO. Data sem hora (data_analise, data_entrada,
//  data_emissao) cai no mês escrito nela; instante (recebido_em, mudou_em) é
//  lido em -03:00, o mesmo relógio da ponte do e-mail.
//
//  OS TRÊS MUNDOS NÃO SE SOMAM, e aqui isso vira desenho: o que ENTROU no mês é
//  contado por onde está hoje (emitida, funil, encerrada), e nunca vira um
//  prêmio somado; o prêmio só é somado nas EMITIDAS no mês, que é o realizado.
//
//  Puro: sem banco, sem Next, sem relógio escondido (`agora` entra por
//  parâmetro). Quem lê o banco é app/api/gestao/relatorio/route.ts; quem testa é
//  scripts/teste-relatorio-mensal.cjs.
// ============================================================================

import { ponteDaJanela, prepararPonte, type Janela, type Ponte } from '@/lib/email/ponte'
import { lerPedido, resumir, type LinhaPedido, type MetasEmail } from '@/lib/email/metricas'
import { reguaDoInstante, type VersaoRegua } from '@/lib/email/regua'
import type { ClassificacaoGravada } from '@/lib/email/classificar'
import { resumoDasAnalises, type LinhaRetrato, type ResumoAnalises } from '@/lib/analise/retrato'
import { lmgFam, mundoDa, type Mundo } from '@/lib/ia/regras-operacao'
import { taxaMediaPonderada } from '@/lib/corretoras/agregacoes'

/* ══════════════════════════════════════════════════════════════════════════
   O MÊS
   ══════════════════════════════════════════════════════════════════════════ */

const FUSO_MS = 3 * 3_600_000
const HORA_MS = 3_600_000
const DIA_MS = 24 * HORA_MS
const MES_OK = /^(\d{4})-(0[1-9]|1[0-2])$/

export const NOME_MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const NOME_MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export const mesValido = (mes: unknown): mes is string => typeof mes === 'string' && MES_OK.test(mes)

/** "2026-08" -> "agosto de 2026". */
export function rotuloMes(mes: string): string {
  const m = MES_OK.exec(mes)
  return m ? `${NOME_MES_LONGO[Number(m[2]) - 1]} de ${m[1]}` : mes
}

/** "2026-08" -> "ago/26". */
export function rotuloMesCurto(mes: string): string {
  const m = MES_OK.exec(mes)
  return m ? `${NOME_MES_CURTO[Number(m[2]) - 1]}/${m[1].slice(2)}` : mes
}

/** O mês de São Paulo de um instante. Data inválida ou vazia: nulo. */
export function mesDoInstante(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : new Date(t - FUSO_MS).toISOString().slice(0, 7)
}

/** O mês de uma data sem hora ("2026-08-31"), que é o mês escrito nela. */
export function mesDaData(d: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2})-\d{2}/.exec(String(d ?? ''))
  return m && mesValido(m[1]) ? m[1] : null
}

/** Soma `n` meses (negativo volta). */
export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

/** A janela do mês, no formato da ponte: da meia-noite do dia 1 (SP) até a do mês seguinte, exclusiva. */
export function janelaDoMes(mes: string): Janela {
  const [a, m] = mes.split('-').map(Number)
  return {
    desde: new Date(Date.UTC(a, m - 1, 1) + FUSO_MS),
    ate: new Date(Date.UTC(a, m, 1) + FUSO_MS),
    frase: `em ${rotuloMes(mes)}`,
  }
}

const mediana = (v: number[]): number | null => {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  const meio = Math.floor(s.length / 2)
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2
}

const num = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/** Chave de igualdade de nome: sem acento, sem pontuação, minúsculo. */
const chaveNome = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/* ══════════════════════════════════════════════════════════════════════════
   A ENTRADA  ·  o que a rota leu do banco
   ══════════════════════════════════════════════════════════════════════════ */

export type LinhaEmail = LinhaPedido & { previa?: string | null; anexos?: { nome?: string | null }[] | null }

export interface OperacaoMes {
  id: string
  corretora_id: string | null
  modalidade: string | null
  lmg: number | null
  taxa: number | null
  vigencia_anos: number | null
  vigencia_dias: number | null
  periodicidade_vigencia: string | null
  premio_previsto: number | null
  status: string
  data_entrada: string | null
  data_emissao: string | null
  updated_at: string | null
  created_at: string | null
}

/**
 * Uma entrada de operação numa etapa, de `fam_historico`:
 *   · `update` com campo `status`: a troca de etapa (desde 02/06/2026)
 *   · `insert`: a operação cadastrada já naquela etapa (desde 03/08/2026),
 *     com `valor_depois` preenchido pela rota a partir do `snapshot`
 */
export interface MudancaStatus {
  registro_id: string
  acao?: string | null
  valor_depois: string | null
  mudou_em: string
}

export interface FilaMes {
  criado_em: string | null
  concluido_em: string | null
  concluido_em_crm: string | null
  situacao: string | null
}

export type AnaliseMes = LinhaRetrato & { versao: number | null }

export interface EntradaRelatorio {
  mes: string
  agora: Date
  email: {
    linhas: readonly LinhaEmail[]
    versoes: readonly VersaoRegua[]
    modalidades: readonly string[]
    gravadas: readonly ClassificacaoGravada[]
    metas: MetasEmail
  }
  analises: readonly AnaliseMes[]
  operacoes: readonly OperacaoMes[]
  historico: readonly MudancaStatus[]
  etapas: readonly { nome: string; ordem: number | null }[]
  fila: readonly FilaMes[]
  /** id da corretora -> o nome que o CRM mostra (fantasia, senão razão social). */
  nomeDaCorretoraId: Readonly<Record<string, string>>
  /** Nome escrito à mão (na análise, no caso) -> o nome do CRM, quando casa com UMA. */
  nomeDaCorretora: (cru: string | null) => string | null
  /** A corretora lida do remetente e da prévia do e-mail, quando o pedido ainda não virou caso. */
  corretoraDoEmail: (e: { email_de: string | null; previa?: string | null }) => string | null
}

/* ══════════════════════════════════════════════════════════════════════════
   A SAÍDA  ·  só números e nomes de corretora e modalidade, nenhum e-mail
   ══════════════════════════════════════════════════════════════════════════ */

export type PonteResumo = Pick<Ponte, 'recebidos' | 'baldes' | 'elegiveis' | 'excecoes' | 'parados_a_fazer' | 'em_risco_a_fazer' | 'fecha'>

export interface Contagem { nome: string; n: number }

export interface LinhaModalidade {
  nome: string
  /** Pedidos de e-mail que citam a modalidade. Um pedido pode citar mais de uma. */
  pedidos: number
  entraram: number
  emitidas: number
  premio: number
  /** Taxa média ponderada das emitidas no mês, em pontos percentuais. */
  taxa: number | null
}

export interface LinhaCorretora {
  nome: string
  pedidos: number
  analises: number
  entraram: number
  emitidas: number
  premio: number
}

export interface PontoMes {
  mes: string
  rotulo: string
  emails: number
  pedidos: number
  elegiveis: number
  atendidos: number
  analises: number
  entraram: number
  emitidas: number
  premio: number
}

export interface RelatorioMensal {
  mes: string
  rotulo: string
  /** O mês ainda não acabou: os números dele vão crescer. */
  emCurso: boolean
  gerado_em: string
  email: {
    ponte: PonteResumo
    /** As modalidades sem apetite na régua que valia no fim do mês (a frase do degrau "fora do apetite"). */
    excluidas: string[]
    /** Pedidos que NASCERAM no mês (o e-mail que abriu o assunto chegou nele). */
    pedidos: number
    atendimento: {
      resolvidos: number
      trazidos: number
      ja_analisados: number
      com_tempo: number
      mediana_horas: number | null
      media_horas: number | null
      no_prazo: number
      meta_horas: number
    }
    porModalidade: Contagem[]
    porCorretora: Contagem[]
    semCorretora: number
  }
  analise: {
    feitas: number
    refeitas: number
    resumo: ResumoAnalises
    esteira: { concluidas: number; mediana_horas: number | null }
  }
  funil: {
    entraram: { n: number; porMundo: Record<Mundo, number> }
    emitidas: { n: number; premio: number; lmg: number; taxa: number | null; ticket: number | null; dias_mediana: number | null }
    encerradas: { perdidas: number; recusadas: number }
    /** Emitidas ÷ (emitidas + perdidas + recusadas) do mês, por quantidade. Nulo sem decisão no mês. */
    conversao: number | null
    /** Quantas operações ENTRARAM em cada etapa no mês. Nulo quando o histórico ainda não existia. */
    movimentos: Contagem[] | null
    historico_desde: string | null
  }
  modalidades: LinhaModalidade[]
  corretoras: LinhaCorretora[]
  /** Os 12 meses que terminam no mês pedido, do mais velho ao mais novo. */
  serie: PontoMes[]
}

/* ══════════════════════════════════════════════════════════════════════════
   A CONTA
   ══════════════════════════════════════════════════════════════════════════ */

const contar = (nomes: string[]): Contagem[] => {
  const c = new Map<string, number>()
  for (const n of nomes) c.set(n, (c.get(n) ?? 0) + 1)
  return [...c.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function montarRelatorioMensal(e: EntradaRelatorio): RelatorioMensal {
  const { mes, agora } = e
  if (!mesValido(mes)) throw new Error(`Mês inválido: ${mes}`)
  const metas = e.email.metas

  /* O e-mail, classificado e agrupado UMA vez, e recortado por mês depois. O
     agrupamento de RE e ENC precisa de todos os e-mails, e não só dos do mês
     (senão a resposta de agosto a um pedido de julho viraria pedido novo). */
  const lidos = e.email.linhas.map((l) => lerPedido(l, metas, agora))
  const preparada = prepararPonte(e.email.linhas, {
    versoes: e.email.versoes, modalidades: e.email.modalidades, gravadas: e.email.gravadas, metas, agora,
  })
  const ponteDo = (m: string) => ponteDaJanela(preparada, janelaDoMes(m))
  const atendimentoDo = (m: string) => {
    const j = janelaDoMes(m)
    // `resumir` fecha o período com `<=`; a janela do mês é exclusiva no fim.
    return resumir(lidos, metas, j.desde, new Date(j.ate!.getTime() - 1))
  }

  /* A ETAPA DA OPERAÇÃO ENCERRADA NÃO TEM DATA PRÓPRIA. Vale, nesta ordem:
       1. o dia em que ela entrou na etapa em que está (troca ou cadastro, no histórico)
       2. o `updated_at`, se for de ANTES do histórico começar
       3. o dia do cadastro
     O degrau 2 tem a trava por uma medida real (11/09/2026): uma recusa de maio
     editada em agosto caía em agosto pelo `updated_at`. Sem registro de troca
     desde que o histórico existe, a operação já estava nessa etapa antes dele,
     e qualquer edição posterior (um campo, uma migration) não diz quando ela
     morreu. */
  const transicoes = e.historico.filter((h) => h.acao !== 'insert')
  const historicoDesde = transicoes.reduce<string | null>((min, h) => (!min || Date.parse(h.mudou_em) < Date.parse(min) ? h.mudou_em : min), null)
  const entradaNaEtapaAtual = new Map<string, string>()
  const operacaoPorId = new Map(e.operacoes.map((o) => [o.id, o]))
  for (const h of e.historico) {
    const op = operacaoPorId.get(h.registro_id)
    if (!op || h.valor_depois !== op.status) continue
    const atual = entradaNaEtapaAtual.get(op.id)
    if (!atual || Date.parse(h.mudou_em) > Date.parse(atual)) entradaNaEtapaAtual.set(op.id, h.mudou_em)
  }
  const mesDoEncerramento = (o: OperacaoMes) => {
    const registrado = entradaNaEtapaAtual.get(o.id)
    if (registrado) return mesDoInstante(registrado)
    if (o.updated_at && (!historicoDesde || Date.parse(o.updated_at) < Date.parse(historicoDesde))) return mesDoInstante(o.updated_at)
    return mesDoInstante(o.created_at ?? o.updated_at)
  }

  const emitidasDo = (m: string) => e.operacoes.filter((o) => mundoDa(o.status) === 'emitida' && mesDaData(o.data_emissao) === m)
  const entraramDo = (m: string) => e.operacoes.filter((o) => mesDaData(o.data_entrada) === m)
  const analisesDo = (m: string) => e.analises.filter((a) => mesDaData(a.data_analise) === m)

  // ── a série: 12 meses terminando no pedido ─────────────────────────────────
  const meses = Array.from({ length: 12 }, (_, i) => somarMeses(mes, i - 11))
  const pontes = new Map<string, Ponte>()
  const serie: PontoMes[] = meses.map((m) => {
    const p = ponteDo(m)
    pontes.set(m, p)
    const emit = emitidasDo(m)
    return {
      mes: m,
      rotulo: rotuloMesCurto(m),
      emails: p.recebidos,
      pedidos: p.demandas.length,
      elegiveis: p.elegiveis.total,
      atendidos: atendimentoDo(m).resolvidos,
      analises: analisesDo(m).length,
      entraram: entraramDo(m).length,
      emitidas: emit.length,
      premio: emit.reduce((s, o) => s + num(o.premio_previsto), 0),
    }
  })

  // ── e-mail ─────────────────────────────────────────────────────────────────
  const ponte = pontes.get(mes)!
  const at = atendimentoDo(mes)
  const corretoraDoPedido = (d: Ponte['demandas'][number]) =>
    e.nomeDaCorretora(d.corretora) ?? d.corretora ?? e.corretoraDoEmail({ email_de: d.primeiro.email_de, previa: d.primeiro.previa })
  const corretorasDosPedidos = ponte.demandas.map(corretoraDoPedido)

  // ── análise ────────────────────────────────────────────────────────────────
  /* A análise conta como TRABALHO FEITO no mês da data dela, versão nova ou
     não: refazer é produção. A corretora sai com o nome do CRM, para a mesma
     casa não aparecer com duas grafias ao lado da linha de operações. */
  const doMes = analisesDo(mes).map((a) => ({ ...a, corretora: e.nomeDaCorretora(a.corretora) ?? a.corretora }))
  const concluidas = e.fila.filter((f) => mesDoInstante(f.concluido_em_crm ?? f.concluido_em) === mes)
  const duracoes = concluidas
    .map((f) => {
      const ini = f.criado_em ? new Date(f.criado_em).getTime() : NaN
      const fim = new Date((f.concluido_em_crm ?? f.concluido_em)!).getTime()
      return (fim - ini) / HORA_MS
    })
    .filter((h) => Number.isFinite(h) && h >= 0)

  // ── funil ──────────────────────────────────────────────────────────────────
  const entraram = entraramDo(mes)
  const porMundo: Record<Mundo, number> = { emitida: 0, funil: 0, encerrada: 0 }
  for (const o of entraram) porMundo[mundoDa(o.status)]++

  const emitidas = emitidasDo(mes)
  const premio = emitidas.reduce((s, o) => s + num(o.premio_previsto), 0)
  const perdidas = e.operacoes.filter((o) => o.status === 'Perdido' && mesDoEncerramento(o) === mes).length
  const recusadas = e.operacoes.filter((o) => o.status === 'Recusado' && mesDoEncerramento(o) === mes).length
  const decididas = emitidas.length + perdidas + recusadas
  const diasAteEmitir = emitidas
    .map((o) => (o.data_entrada && o.data_emissao ? (Date.parse(o.data_emissao) - Date.parse(o.data_entrada)) / DIA_MS : NaN))
    .filter((d) => Number.isFinite(d) && d >= 0)

  const mesDoHistorico = mesDoInstante(historicoDesde)
  const ordemDa = new Map(e.etapas.map((s) => [s.nome, s.ordem ?? 99]))
  // Movimento é TROCA de etapa: o cadastro já conta em "entraram no funil".
  const movimentos = mesDoHistorico && mes >= mesDoHistorico
    ? contar(transicoes.filter((h) => h.valor_depois && mesDoInstante(h.mudou_em) === mes).map((h) => h.valor_depois!))
        .sort((a, b) => (ordemDa.get(a.nome) ?? 99) - (ordemDa.get(b.nome) ?? 99))
    : null

  // ── modalidade ─────────────────────────────────────────────────────────────
  const mods = new Map<string, LinhaModalidade & { ops: OperacaoMes[] }>()
  const modDe = (nome: string) => {
    let l = mods.get(nome)
    if (!l) { l = { nome, pedidos: 0, entraram: 0, emitidas: 0, premio: 0, taxa: null, ops: [] }; mods.set(nome, l) }
    return l
  }
  for (const d of ponte.demandas) for (const m of new Set(d.modalidades)) modDe(m).pedidos++
  for (const o of entraram) modDe(o.modalidade?.trim() || 'Sem modalidade').entraram++
  for (const o of emitidas) {
    const l = modDe(o.modalidade?.trim() || 'Sem modalidade')
    l.emitidas++
    l.premio += num(o.premio_previsto)
    l.ops.push(o)
  }
  const modalidades = [...mods.values()]
    .map(({ ops, ...l }) => ({ ...l, taxa: ops.length ? taxaMediaPonderada(ops) : null }))
    .sort((a, b) => b.premio - a.premio || b.entraram - a.entraram || b.pedidos - a.pedidos || a.nome.localeCompare(b.nome, 'pt-BR'))

  // ── corretora ──────────────────────────────────────────────────────────────
  const cors = new Map<string, LinhaCorretora>()
  const corDe = (nome: string) => {
    const k = chaveNome(nome)
    let l = cors.get(k)
    if (!l) { l = { nome, pedidos: 0, analises: 0, entraram: 0, emitidas: 0, premio: 0 }; cors.set(k, l) }
    return l
  }
  for (const c of corretorasDosPedidos) if (c) corDe(c).pedidos++
  for (const a of doMes) if (a.corretora?.trim()) corDe(a.corretora.trim()).analises++
  const nomeOp = (o: OperacaoMes) => (o.corretora_id && e.nomeDaCorretoraId[o.corretora_id]) || null
  for (const o of entraram) { const n = nomeOp(o); if (n) corDe(n).entraram++ }
  for (const o of emitidas) {
    const n = nomeOp(o)
    if (!n) continue
    const l = corDe(n)
    l.emitidas++
    l.premio += num(o.premio_previsto)
  }
  const corretoras = [...cors.values()]
    .sort((a, b) => b.premio - a.premio || b.entraram - a.entraram || b.analises - a.analises || b.pedidos - a.pedidos || a.nome.localeCompare(b.nome, 'pt-BR'))

  return {
    mes,
    rotulo: rotuloMes(mes),
    emCurso: mes >= (mesDoInstante(agora.toISOString()) ?? mes),
    gerado_em: agora.toISOString(),
    email: {
      ponte: {
        recebidos: ponte.recebidos, baldes: ponte.baldes, elegiveis: ponte.elegiveis, excecoes: ponte.excecoes,
        parados_a_fazer: ponte.parados_a_fazer, em_risco_a_fazer: ponte.em_risco_a_fazer, fecha: ponte.fecha,
      },
      excluidas: reguaDoInstante(e.email.versoes, new Date(Math.min(janelaDoMes(mes).ate!.getTime() - 1, agora.getTime())))?.parametros.excluidas ?? [],
      pedidos: ponte.demandas.length,
      atendimento: {
        resolvidos: at.resolvidos, trazidos: at.trazidos, ja_analisados: at.ja_analisados, com_tempo: at.com_tempo,
        mediana_horas: at.mediana_horas, media_horas: at.media_horas, no_prazo: at.no_prazo,
        meta_horas: metas.horas_primeira_resposta,
      },
      porModalidade: contar(ponte.demandas.flatMap((d) => (d.modalidades.length ? [...new Set(d.modalidades)] : ['Sem modalidade identificada']))),
      porCorretora: contar(corretorasDosPedidos.filter((c): c is string => !!c)),
      semCorretora: corretorasDosPedidos.filter((c) => !c).length,
    },
    analise: {
      feitas: doMes.length,
      refeitas: doMes.filter((a) => num(a.versao) > 1).length,
      resumo: resumoDasAnalises(doMes),
      esteira: { concluidas: concluidas.length, mediana_horas: mediana(duracoes) },
    },
    funil: {
      entraram: { n: entraram.length, porMundo },
      emitidas: {
        n: emitidas.length,
        premio,
        lmg: emitidas.reduce((s, o) => s + lmgFam(o), 0),
        taxa: emitidas.length ? taxaMediaPonderada(emitidas) : null,
        ticket: emitidas.length ? premio / emitidas.length : null,
        dias_mediana: mediana(diasAteEmitir),
      },
      encerradas: { perdidas, recusadas },
      conversao: decididas ? emitidas.length / decididas : null,
      movimentos,
      historico_desde: historicoDesde,
    },
    modalidades,
    corretoras,
    serie,
  }
}
