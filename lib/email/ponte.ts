/* A PONTE DO DIA · de quantos e-mails chegaram até quantos pedidos há a fazer
   ═══════════════════════════════════════════════════════════════════════════

   Ordem do Marco em 11/09/2026: "a contagem é sempre o resultado matemático".
   Por isso a ponte FECHA A CONTA por construção: cada e-mail do período cai em
   exatamente um degrau, e `fecha` é conferido aqui, não suposto na tela.

     Recebidos no período                         (e-mails)
       − não é pedido                             (e-mails)
       − continuação de um pedido que já chegou   (e-mails: RE, ENC)
       − fora do apetite                          (pedidos)
       − sem classificação                        (pedidos: precisa de você)
       = elegíveis
       − já resolvidos                            (trazidos ou analisados)
       = a fazer

   UMA UNIDADE SÓ DEPOIS DO SEGUNDO DEGRAU. Até ali conta e-mail; dali em
   diante conta PEDIDO (o e-mail que abriu o assunto). Por isso a continuação
   é degrau próprio: sem ela, os três e-mails do mesmo pedido virariam três
   análises a fazer. Foi medido no banco: em 10/09, "INFRA PREFEITURA ... MOR"
   e "ENC: INFRA PREFEITURA ... MOR" eram duas linhas da mesma demanda.

   O PEDIDO QUE COMEÇOU ONTEM E RECEBEU RESPOSTA HOJE conta ontem. Hoje, a
   resposta é "continuação". Assim um pedido nunca é contado em dois dias.

   PURO: a tela, a simulação da régua e o teste chamam esta mesma função. */

import { horasUteis, lerPedido, METAS_PADRAO, type EstadoPedido, type LinhaPedido, type MetasEmail, type MotivoParado } from '@/lib/email/metricas'
import {
  classificarEmail, chaveDoAssunto, ehResposta,
  type Apetite, type ClassificacaoEmail, type ClassificacaoGravada, type Confianca, type Passo, type PedidoComTexto, type TipoDemanda,
} from '@/lib/email/classificar'
import { reguaDoInstante, type VersaoRegua } from '@/lib/email/regua'

/* ══════════════════════════════════════════════════════════════════════════
   O PERÍODO
   ══════════════════════════════════════════════════════════════════════════ */

export type PeriodoId = 'hoje' | 'ontem' | '7' | '30' | 'tudo' | 'dia'

export const PERIODOS_PONTE: { id: Exclude<PeriodoId, 'dia'>; nome: string }[] = [
  { id: 'hoje', nome: 'Hoje' },
  { id: 'ontem', nome: 'Ontem' },
  { id: '7', nome: '7 dias' },
  { id: '30', nome: '30 dias' },
  { id: 'tudo', nome: 'Tudo' },
]

export interface Janela {
  desde?: Date
  /** Exclusivo: o instante `ate` já é do período seguinte. */
  ate?: Date
  /** "ontem, 10/09", "nos últimos 7 dias". */
  frase: string
}

const DIA_MS = 86_400_000
const TRES_H = 3 * 3_600_000

/** A meia-noite de São Paulo do dia do instante. Fuso -03:00 fixo, como em metricas.ts. */
export const meiaNoiteSP = (t: number) => Math.floor((t - TRES_H) / DIA_MS) * DIA_MS + TRES_H

/** dd/mm do instante, no relógio de São Paulo. */
export function diaMesSP(t: number): string {
  const d = new Date(t - TRES_H)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * A janela de cada período. "Hoje" é desde a meia-noite de São Paulo, e não
 * "as últimas 24 horas": às 9h, 24 horas para trás ainda pegam a tarde de
 * ontem. "7 dias" e "30 dias" são corridos de propósito.
 */
export function janelaDoPeriodo(id: PeriodoId, agora: Date, dia?: string): Janela {
  const t = agora.getTime()
  const hoje = meiaNoiteSP(t)
  if (id === 'hoje') return { desde: new Date(hoje), frase: `hoje, ${diaMesSP(t)}` }
  if (id === 'ontem') return { desde: new Date(hoje - DIA_MS), ate: new Date(hoje), frase: `ontem, ${diaMesSP(hoje - DIA_MS)}` }
  if (id === '7') return { desde: new Date(t - 7 * DIA_MS), frase: 'nos últimos 7 dias' }
  if (id === '30') return { desde: new Date(t - 30 * DIA_MS), frase: 'nos últimos 30 dias' }
  if (id === 'dia' && dia && /^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    const [a, m, d] = dia.split('-').map(Number)
    const inicio = Date.UTC(a, m - 1, d) + TRES_H
    // "31/02" o Date aceita e vira 03/03: data que não existe dá período vazio, e diz.
    const conferido = new Date(inicio - TRES_H)
    if (conferido.getUTCFullYear() !== a || conferido.getUTCMonth() !== m - 1 || conferido.getUTCDate() !== d) {
      return { desde: new Date(0), ate: new Date(0), frase: `em ${dia} (data que não existe)` }
    }
    return { desde: new Date(inicio), ate: new Date(inicio + DIA_MS), frase: `em ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}` }
  }
  return { frase: 'desde o começo' }
}

const dentroDa = (j: Janela, iso: string | null | undefined): boolean => {
  if (!j.desde && !j.ate) return true
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
  if (j.desde && t < j.desde.getTime()) return false
  if (j.ate && t >= j.ate.getTime()) return false
  return true
}

/* ══════════════════════════════════════════════════════════════════════════
   OS DEGRAUS
   ══════════════════════════════════════════════════════════════════════════ */

export type Balde = 'nao_demanda' | 'continuacao' | 'fora_apetite' | 'sem_classificacao' | 'resolvido' | 'a_fazer'

export const ROTULO_BALDE: Record<Balde, string> = {
  nao_demanda: 'Não é pedido',
  continuacao: 'Continuação do mesmo pedido',
  fora_apetite: 'Fora do apetite',
  sem_classificacao: 'Sem classificação',
  resolvido: 'Já resolvidos',
  a_fazer: 'A fazer',
}

export type EmailNaPonte = PedidoComTexto & { classe: ClassificacaoEmail }

export interface Demanda {
  /** O id do primeiro e-mail do pedido. */
  id: string
  emails: EmailNaPonte[]
  primeiro: EmailNaPonte
  /** O e-mail que o "trazer" leva: o mais recente com anexo, ainda fora do sistema. */
  representante: EmailNaPonte
  balde: Balde
  tipo: TipoDemanda | null
  modalidades: string[]
  apetite: Apetite
  confianca: Confianca
  origem: ClassificacaoEmail['origem']
  regua_versao: number | null
  cnpj: string | null
  tomador: string | null
  valor: string | null
  corretora: string | null
  estado: EstadoPedido
  resolvido: boolean
  /** Fora do apetite, e trazido ou analisado mesmo assim: a decisão individual. */
  excecao: boolean
  parado: boolean
  motivos: MotivoParado[]
  em_risco: boolean
  horas: number
  recebido_em: string | null
  anexos_uteis: number
  passos: Passo[]
}

export interface Ponte {
  janela: Janela
  recebidos: number
  baldes: Record<Balde, number>
  elegiveis: { total: number; operacao: number; credito: number }
  excecoes: number
  parados_a_fazer: number
  /** A fazer que ainda não venceu, mas já passou do aviso (o "vence em breve"). */
  em_risco_a_fazer: number
  /** Os pedidos que NASCERAM no período, em ordem de chegada. */
  demandas: Demanda[]
  emails_nao_demanda: EmailNaPonte[]
  emails_continuacao: EmailNaPonte[]
  /** De qual pedido cada continuação é, para a tela dizer "resposta de ...". */
  pedido_da_continuacao: Record<string, Demanda>
  /** Recebidos = soma dos seis degraus. Falso é defeito, e a tela avisa. */
  fecha: boolean
  /** As versões da régua que julgaram os e-mails do período. */
  versoes_usadas: number[]
}

export interface EntradaPonte {
  versoes: readonly VersaoRegua[]
  modalidades: readonly string[]
  gravadas: readonly ClassificacaoGravada[]
  metas?: MetasEmail
  agora: Date
  janela: Janela
}

/* 60 dias, e não 30: medido nos e-mails reais, "GARANTIA DE PAGAMENTO - ADN -
   PARK POMPEIA" teve o ENC em 03/08 e o RE em 10/09, e com 30 dias o mesmo
   pedido aparecia duas vezes como a fazer. */
const JANELA_DO_FIO_MS = 60 * DIA_MS
const CHAVE_MINIMA = 12

const ORDEM_ESTADO: EstadoPedido[] = ['trazido', 'ja_analisado', 'trazendo', 'aguardando', 'pedido', 'a_classificar', 'descartado']
const PESO_ORIGEM: Record<ClassificacaoEmail['origem'], number> = { humano: 4, ia: 3, regua: 2, sistema: 1, caixa: 0 }
const PESO_CONFIANCA: Record<Confianca, number> = { seguro: 2, revisar: 1, incerto: 0 }

const instante = (e: { recebido_em?: string | null }) => {
  const t = e.recebido_em ? new Date(e.recebido_em).getTime() : NaN
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t
}

/** Quem decide pelo pedido: a pessoa antes da IA, a IA antes da régua; e quem sabe mais. */
const pesoDaDecisao = (e: EmailNaPonte) =>
  PESO_ORIGEM[e.classe.origem] * 100 +
  (e.classe.apetite !== null ? 20 : 0) +
  (e.classe.tipo ? 10 : 0) +
  PESO_CONFIANCA[e.classe.confianca]

/* A PONTE EM DOIS PASSOS (11/09/2026, achado da revisão do relatório mensal).
   Classificar e agrupar os e-mails é a parte cara, e ela NÃO depende do
   período: só o recorte final depende. O relatório do mês monta 12 pontes (uma
   por mês da série), e refazia a classificação inteira 12 vezes. Agora quem
   precisa de várias janelas prepara uma vez e recorta quantas quiser; quem
   precisa de uma só continua chamando `montarPonte`, que é os dois passos
   juntos e dá exatamente o mesmo resultado. */
export interface PontePreparada {
  emails: EmailNaPonte[]
  todas: Demanda[]
  primeiros: Set<string>
  pedidoDoEmail: Map<string, Demanda>
}

type LinhaDaPonteEntrada = LinhaPedido & { previa?: string | null; anexos?: { nome?: string | null }[] | null }

export function montarPonte(linhas: readonly LinhaDaPonteEntrada[], entrada: EntradaPonte): Ponte {
  return ponteDaJanela(prepararPonte(linhas, entrada), entrada.janela)
}

export function prepararPonte(linhas: readonly LinhaDaPonteEntrada[], entrada: Omit<EntradaPonte, 'janela'>): PontePreparada {
  const metas = entrada.metas ?? METAS_PADRAO
  const { agora } = entrada

  const porEmail = new Map<string, ClassificacaoGravada[]>()
  for (const g of entrada.gravadas) {
    const lista = porEmail.get(g.email_id) ?? []
    lista.push(g)
    porEmail.set(g.email_id, lista)
  }

  const emails: EmailNaPonte[] = linhas.map((l) => {
    const lido = { ...lerPedido(l, metas, agora), previa: l.previa, anexos: l.anexos } as PedidoComTexto
    const regua = reguaDoInstante(entrada.versoes, lido.recebido_em)
    return { ...lido, classe: classificarEmail(lido, regua, entrada.modalidades, porEmail.get(lido.id) ?? []) }
  })

  // ── agrupar os e-mails de pedido em pedidos ─────────────────────────────
  interface Grupo { emails: EmailNaPonte[]; cnpj: string | null; ultimo: number }
  const grupos: Grupo[] = []
  const porChave = new Map<string, Grupo[]>()
  const demandas = emails.filter((e) => e.classe.demanda).sort((a, b) => instante(a) - instante(b))

  const SEM_DATA = Number.MAX_SAFE_INTEGER
  for (const e of demandas) {
    const chave = chaveDoAssunto(e.assunto)
    const t = instante(e)
    /* Assunto curto ("Bid bond") só junta quando o e-mail é RESPOSTA ("RE: Bid
       bond"): dois pedidos novos com o mesmo assunto genérico não são o mesmo
       pedido, mas a resposta de um é. */
    const podeJuntar = chave.length >= CHAVE_MINIMA || (chave.length >= 3 && ehResposta(e.assunto))
    const candidatos = podeJuntar ? porChave.get(chave) ?? [] : []
    /* Mesmo assunto só junta se o CNPJ não brigar e o fio não tiver esfriado:
       "Cotação garantia" de duas empresas diferentes não é o mesmo pedido, e a
       renovação do ano que vem também não. */
    let g = candidatos.find((x) =>
      (t === SEM_DATA || t - x.ultimo <= JANELA_DO_FIO_MS) && (!x.cnpj || !e.classe.cnpj || x.cnpj === e.classe.cnpj))
    if (!g) {
      g = { emails: [], cnpj: null, ultimo: t }
      grupos.push(g)
      if (chave.length >= 3) porChave.set(chave, [...(porChave.get(chave) ?? []), g])
    }
    g.emails.push(e)
    if (t !== SEM_DATA) g.ultimo = g.ultimo === SEM_DATA ? t : Math.max(g.ultimo, t)
    g.cnpj = g.cnpj ?? e.classe.cnpj
  }

  /* O PEDIDO INTEIRO É JULGADO PELA RÉGUA DO DIA EM QUE ELE CHEGOU. Sem isto,
     um RE que chega depois de uma régua nova arrastava o pedido de ontem para
     outro degrau, e a régua nova reescrevia o passado (achado da revisão). */
  for (const g of grupos) {
    const r = reguaDoInstante(entrada.versoes, g.emails[0].recebido_em)
    for (const e of g.emails) {
      if (r && e.classe.regua_versao !== r.versao) {
        e.classe = classificarEmail(e, r, entrada.modalidades, porEmail.get(e.id) ?? [])
      }
    }
  }

  const montarDemanda = (g: Grupo): Demanda => {
    const primeiro = g.emails[0]
    const decisor = [...g.emails].sort((a, b) => pesoDaDecisao(b) - pesoDaDecisao(a) || instante(b) - instante(a))[0]
    const resolvido = g.emails.some((e) => e.estado_trabalho === 'trazido' || e.estado_trabalho === 'ja_analisado')
    const estado = ORDEM_ESTADO.find((s) => g.emails.some((e) => e.estado_trabalho === s)) ?? primeiro.estado_trabalho
    const abertos = g.emails.filter((e) => e.estado_trabalho !== 'trazido' && e.estado_trabalho !== 'ja_analisado')
    const comAnexo = [...abertos].reverse().find((e) => (e.anexos_uteis ?? 0) > 0)
    const representante = comAnexo ?? abertos[abertos.length - 1] ?? g.emails[g.emails.length - 1]
    const c = decisor.classe

    /* "Incerto" nunca decide sozinho, nem para tirar da conta: um pedido que a
       régua só adivinhou pelo corpo não pode sumir como "fora do apetite", nem
       entrar como trabalho. Ele vira pergunta, que é o degrau "sem
       classificação". */
    const decidido = c.tipo !== null && c.apetite !== null && c.confianca !== 'incerto'
    /* O QUE JÁ ACONTECEU VEM PRIMEIRO. Pedido trazido é trabalho feito, mesmo
       de modalidade sem apetite: fica em "já resolvidos", marcado como
       exceção, e não some dos elegíveis. */
    const balde: Balde = resolvido
      ? 'resolvido'
      : decidido && c.apetite === 'fora'
        ? 'fora_apetite'
        : decidido ? 'a_fazer' : 'sem_classificacao'

    /* As horas do pedido resolvido vão da chegada do PRIMEIRO e-mail até o
       caso (ou o "já analisado"), e não até agora: o primeiro e-mail segue
       "aberto" quando o trazido foi o RE mais recente. */
    const fimDoResolvido = g.emails
      .map((e) => (e.estado_trabalho === 'trazido' ? e.caso_criado_em : e.estado_trabalho === 'ja_analisado' ? e.analisado_fora_em : null))
      .filter((x): x is string => !!x)
      .sort()[0]

    const motivos = resolvido ? [] : [...new Set(abertos.flatMap((e) => e.motivos))]
    const passos: Passo[] = g.emails.length > 1
      ? [{ fonte: 'sistema', texto: `${g.emails.length} e-mails do mesmo pedido (respostas e encaminhamentos juntados pelo assunto).` }, ...c.passos]
      : c.passos

    return {
      id: primeiro.id,
      emails: g.emails,
      primeiro,
      representante,
      balde,
      tipo: c.tipo,
      modalidades: c.modalidades,
      apetite: c.apetite,
      confianca: c.confianca,
      origem: c.origem,
      regua_versao: c.regua_versao,
      cnpj: g.cnpj ?? c.cnpj,
      tomador: c.tomador ?? primeiro.classe.tomador,
      valor: c.valor ?? g.emails.map((e) => e.classe.valor).find(Boolean) ?? null,
      corretora: g.emails.map((e) => e.corretora).find(Boolean) ?? null,
      estado,
      resolvido,
      excecao: resolvido && decidido && c.apetite === 'fora',
      parado: motivos.length > 0,
      motivos,
      em_risco: !resolvido && abertos.some((e) => e.em_risco),
      horas: resolvido
        ? (fimDoResolvido && primeiro.recebido_em ? horasUteis(new Date(primeiro.recebido_em), new Date(fimDoResolvido), metas) : primeiro.horas)
        : Math.max(0, ...abertos.map((e) => e.horas)),
      recebido_em: primeiro.recebido_em,
      anexos_uteis: Math.max(0, ...g.emails.map((e) => e.anexos_uteis ?? 0)),
      passos,
    }
  }

  const todas = grupos.map(montarDemanda)
  const primeiros = new Set(todas.map((d) => d.id))
  const pedidoDoEmail = new Map<string, Demanda>()
  for (const d of todas) for (const e of d.emails) pedidoDoEmail.set(e.id, d)

  return { emails, todas, primeiros, pedidoDoEmail }
}

/** O recorte de uma ponte já preparada: barato, pode ser chamado para quantas janelas quiser. */
export function ponteDaJanela(preparada: PontePreparada, janela: Janela): Ponte {
  const { emails, todas, primeiros, pedidoDoEmail } = preparada
  const noPeriodo = emails.filter((e) => dentroDa(janela, e.recebido_em))
  const emails_nao_demanda = noPeriodo.filter((e) => !e.classe.demanda)
  const emails_continuacao = noPeriodo.filter((e) => e.classe.demanda && !primeiros.has(e.id))
  const doPeriodo = todas
    .filter((d) => dentroDa(janela, d.recebido_em))
    .sort((a, b) => instante(a.primeiro) - instante(b.primeiro))

  const conta = (b: Balde) => doPeriodo.filter((d) => d.balde === b).length
  const baldes: Record<Balde, number> = {
    nao_demanda: emails_nao_demanda.length,
    continuacao: emails_continuacao.length,
    fora_apetite: conta('fora_apetite'),
    sem_classificacao: conta('sem_classificacao'),
    resolvido: conta('resolvido'),
    a_fazer: conta('a_fazer'),
  }
  const elegiveisLista = doPeriodo.filter((d) => d.balde === 'resolvido' || d.balde === 'a_fazer')
  const soma = Object.values(baldes).reduce((a, b) => a + b, 0)

  return {
    janela,
    recebidos: noPeriodo.length,
    baldes,
    elegiveis: {
      total: elegiveisLista.length,
      operacao: elegiveisLista.filter((d) => d.tipo === 'operacao').length,
      /* O resolvido sem tipo (trazido à mão de um e-mail que a régua não
         leu) conta como pedido: alguém decidiu que era trabalho. Fica na
         conta de crédito, que é o que todo pedido tem. */
      credito: elegiveisLista.filter((d) => d.tipo !== 'operacao').length,
    },
    excecoes: doPeriodo.filter((d) => d.excecao).length,
    parados_a_fazer: doPeriodo.filter((d) => d.balde === 'a_fazer' && d.parado).length,
    em_risco_a_fazer: doPeriodo.filter((d) => d.balde === 'a_fazer' && !d.parado && d.em_risco).length,
    demandas: doPeriodo,
    emails_nao_demanda,
    emails_continuacao,
    pedido_da_continuacao: Object.fromEntries(
      emails_continuacao.map((e) => [e.id, pedidoDoEmail.get(e.id)]).filter((x): x is [string, Demanda] => !!x[1]),
    ),
    fecha: soma === noPeriodo.length,
    versoes_usadas: [...new Set(noPeriodo.map((e) => e.classe.regua_versao).filter((v): v is number => v !== null))].sort((a, b) => a - b),
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   O PASSIVO  ·  o que está aberto de qualquer data, agora
   ══════════════════════════════════════════════════════════════════════════ */

export interface Passivo {
  /** Pedidos ainda fora do sistema: a fazer + sem classificação. */
  abertos: number
  a_fazer: number
  sem_classificacao: number
  parados: number
  /** Há quantos dias corridos chegou o pedido aberto mais velho. */
  mais_velho_dias: number | null
}

/** Recebe a ponte do período "tudo". A foto do agora não depende do período escolhido. */
export function passivoDa(p: Ponte, agora: Date): Passivo {
  const abertos = p.demandas.filter((d) => d.balde === 'a_fazer' || d.balde === 'sem_classificacao')
  const idades = abertos
    .map((d) => (d.recebido_em ? (agora.getTime() - new Date(d.recebido_em).getTime()) / DIA_MS : NaN))
    .filter((x) => Number.isFinite(x))
  return {
    abertos: abertos.length,
    a_fazer: abertos.filter((d) => d.balde === 'a_fazer').length,
    sem_classificacao: abertos.filter((d) => d.balde === 'sem_classificacao').length,
    parados: abertos.filter((d) => d.parado).length,
    mais_velho_dias: idades.length ? Math.max(...idades) : null,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   A SIMULAÇÃO  ·  "com esta régua, o que teria mudado"
   ══════════════════════════════════════════════════════════════════════════ */

export interface Simulacao {
  antes: Ponte
  depois: Ponte
  /** Os pedidos que trocaram de degrau, com o de-para. */
  mudaram: { demanda: Demanda; de: Balde | 'continuacao' | 'nao_demanda'; para: Balde | 'continuacao' | 'nao_demanda' }[]
}

/**
 * Julga os MESMOS e-mails como o painel julga hoje (cada um pela régua do dia
 * em que chegou) e com a proposta valendo para o período inteiro, e diz quem
 * mudou de degrau. O "antes" é o painel de verdade, e não uma conta à parte:
 * senão a simulação diria "de 1 para 1" sobre um número que a ponte não mostra.
 */
export function simularRegua(
  linhas: Parameters<typeof montarPonte>[0],
  entrada: EntradaPonte,
  proposta: VersaoRegua,
): Simulacao {
  const antes = montarPonte(linhas, entrada)
  const depois = montarPonte(linhas, { ...entrada, versoes: [proposta] })

  const lugar = (p: Ponte) => {
    const m = new Map<string, Balde>()
    for (const e of p.emails_nao_demanda) m.set(e.id, 'nao_demanda')
    for (const e of p.emails_continuacao) m.set(e.id, 'continuacao')
    for (const d of p.demandas) m.set(d.id, d.balde)
    return m
  }
  const la = lugar(antes)
  const ld = lugar(depois)
  const porId = new Map<string, Demanda>()
  for (const d of [...depois.demandas, ...antes.demandas]) if (!porId.has(d.id)) porId.set(d.id, d)

  const mudaram: Simulacao['mudaram'] = []
  for (const [id, de] of la) {
    const para = ld.get(id)
    if (!para || para === de) continue
    const demanda = porId.get(id)
    if (demanda) mudaram.push({ demanda, de, para })
  }
  return { antes, depois, mudaram }
}
