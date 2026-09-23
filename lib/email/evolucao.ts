/* A EVOLUÇÃO DA ESTEIRA · série diária, semanal ou mensal, para o painel de gestão
   ═══════════════════════════════════════════════════════════════════════════

   Ordem do Marco em 17/09/2026: a aba Painel (Comercial > E-mail) precisa
   "qualificar e quantificar a evolução de performance da esteira" — não só o
   retrato de um período, como a ponte já faz, mas a TENDÊNCIA ao longo do
   tempo: está entrando mais do que sai? o atendimento está mais rápido?

   NENHUMA FÓRMULA NASCE AQUI. Cada ponto da série é a MESMA conta da ponte do
   dia (lib/email/ponte.ts) e do atendimento (lib/email/metricas.ts), só que
   recortada num período menor. Isso é o que o comentário de `montarPonte`
   já previa ("quem precisa de várias janelas prepara uma vez e recorta
   quantas quiser") — o relatório gerencial do mês (lib/gestao/relatorio-
   mensal.ts) faz o mesmo, com 12 meses; aqui são dias, semanas ou meses, e o
   balde mensal reaproveita o mês DELE (`janelaDoMes`), em vez de reinventar.

   OS CARTÕES DO TOPO SÃO UM CASO PARTICULAR DA SÉRIE: pedir uma série de UMA
   janela só (o período inteiro escolhido) dá o agregado do período — foi
   assim que o Marco pegou o bug de 18/09/2026 ("os cartões devem representar
   todo o aspecto, os dados históricos"): eles liam só o ÚLTIMO balde (hoje,
   incompleto) contra o anterior, e não o período inteiro que o gráfico
   desenha. `PainelGestaoEsteira.tsx` chama esta mesma função com uma janela
   cobrindo tudo, para o cartão nunca discordar do gráfico.

   O FILTRO POR CORRETORA (18/09/2026, "ajuda a saber a qualidade de demanda
   que os corretores estão enviando") muda a UNIDADE: sem filtro, "recebidos"
   conta E-MAIL (a régua ainda não decidiu o que é pedido); com filtro, só dá
   para contar quem JÁ é pedido com corretora identificada, então a linha
   inteira passa a contar PEDIDO. "No prazo" e "mediana" também trocam de
   régua: em vez da data exata de resolução (`lib/email/metricas.ts`), usam
   `Demanda.horas` (a mesma hora que a fila já mostra por pedido) contra a
   meta de horas úteis. É uma conta mais simples, documentada aqui para nunca
   ser lida como "o mesmo número, mais filtrado".

   Puro: sem banco, sem Next, sem relógio escondido (`agora` entra por
   parâmetro). Quem lê o banco é o componente da tela. */

import { diaMesSP, meiaNoiteSP, ponteDaJanela, prepararPonte, type Janela } from '@/lib/email/ponte'
import { lerPedido, resumir, type LinhaPedido, type MetasEmail } from '@/lib/email/metricas'
import { janelaDoMes, mesDoInstante, rotuloMesCurto, somarMeses } from '@/lib/gestao/relatorio-mensal'
import type { ClassificacaoGravada } from '@/lib/email/classificar'
import type { VersaoRegua } from '@/lib/email/regua'

const DIA_MS = 86_400_000
const TRES_H = 3 * 3_600_000

export type Granularidade = 'dia' | 'semana' | 'mes'

export interface JanelaSerie {
  /** yyyy-mm-dd (dia/semana) ou yyyy-mm (mês) do início do balde: key de lista. */
  chave: string
  /** "16/09" (dia), "8 a 14/09" (semana) ou "set/26" (mês). */
  rotulo: string
  desde: Date
  /** Exclusivo. */
  ate: Date
}

/** O dia da semana (0 = domingo) do dia de São Paulo que contém `meiaNoite`
 *  (um instante já alinhado por `meiaNoiteSP`). */
const diaDaSemanaSP = (meiaNoite: number) => new Date(meiaNoite).getUTCDay()

/** A segunda-feira (meia-noite de São Paulo) da semana que contém `t`. */
const inicioDaSemanaSP = (t: number) => t - ((diaDaSemanaSP(t) + 6) % 7) * DIA_MS

/**
 * As últimas `n` janelas (dias, semanas ou meses), terminando na que contém
 * `agora`, da mais velha para a mais nova. Semana começa na segunda-feira de
 * São Paulo; mês é o mês corrido, do dia 1 ao último.
 */
export function janelasDaSerie(gran: Granularidade, n: number, agora: Date): JanelaSerie[] {
  const hoje = meiaNoiteSP(agora.getTime())
  if (gran === 'mes') {
    const mesAtual = mesDoInstante(agora.toISOString())!
    return Array.from({ length: n }, (_, i) => {
      const m = somarMeses(mesAtual, i - (n - 1))
      const j = janelaDoMes(m)
      return { chave: m, rotulo: rotuloMesCurto(m), desde: j.desde!, ate: j.ate! }
    })
  }
  if (gran === 'dia') {
    return Array.from({ length: n }, (_, i) => {
      const desde = hoje - (n - 1 - i) * DIA_MS
      return { chave: new Date(desde).toISOString().slice(0, 10), rotulo: diaMesSP(desde), desde: new Date(desde), ate: new Date(desde + DIA_MS) }
    })
  }
  const inicioSemana = inicioDaSemanaSP(hoje)
  return Array.from({ length: n }, (_, i) => {
    const desde = inicioSemana - (n - 1 - i) * 7 * DIA_MS
    const ate = desde + 7 * DIA_MS
    return { chave: new Date(desde).toISOString().slice(0, 10), rotulo: `${diaMesSP(desde)} a ${diaMesSP(ate - DIA_MS)}`, desde: new Date(desde), ate: new Date(ate) }
  })
}

/** "2026-09-18" -> meia-noite de São Paulo daquele dia, em ms UTC. */
function spMeiaNoiteDeString(s: string): number {
  const [a, m, d] = s.split('-').map(Number)
  return Date.UTC(a, m - 1, d) + TRES_H
}

/** O tamanho de balde que mantém a série legível: nem um ponto por dia num
 *  ano (365 pontos ilegíveis), nem um ponto por mês numa semana (um só). */
export function granularidadeAutomatica(desde: Date, ate: Date): Granularidade {
  const dias = (ate.getTime() - desde.getTime()) / DIA_MS
  if (dias <= 45) return 'dia'
  if (dias <= 210) return 'semana'
  return 'mes'
}

/**
 * As janelas entre duas datas escolhidas à mão ("de" / "até", no formato do
 * `<input type=date>`), no tamanho de balde pedido. `até` é o último dia
 * INCLUÍDO, como no seletor de período da ponte.
 */
export function janelasEntre(gran: Granularidade, desdeISO: string, ateISO: string): JanelaSerie[] {
  const inicio = spMeiaNoiteDeString(desdeISO)
  const fimExclusivo = spMeiaNoiteDeString(ateISO) + DIA_MS
  if (fimExclusivo <= inicio) return []

  if (gran === 'mes') {
    const mesInicio = mesDoInstante(new Date(inicio).toISOString())!
    const mesFim = mesDoInstante(new Date(fimExclusivo - 1).toISOString())!
    const janelas: JanelaSerie[] = []
    for (let m = mesInicio; m <= mesFim; m = somarMeses(m, 1)) {
      const j = janelaDoMes(m)
      janelas.push({ chave: m, rotulo: rotuloMesCurto(m), desde: j.desde!, ate: j.ate! })
    }
    return janelas
  }

  const passo = gran === 'semana' ? 7 * DIA_MS : DIA_MS
  let cursor = gran === 'semana' ? inicioDaSemanaSP(inicio) : inicio
  const janelas: JanelaSerie[] = []
  // Trava de segurança: 400 baldes (mais de um ano em dias) evita laço infinito com datas malformadas.
  for (let i = 0; cursor < fimExclusivo && i < 400; i++) {
    const fimBalde = cursor + passo
    janelas.push({
      chave: new Date(cursor).toISOString().slice(0, 10),
      rotulo: gran === 'semana' ? `${diaMesSP(cursor)} a ${diaMesSP(fimBalde - DIA_MS)}` : diaMesSP(cursor),
      desde: new Date(cursor),
      ate: new Date(fimBalde),
    })
    cursor = fimBalde
  }
  return janelas
}

export interface EntradaSerie {
  versoes: readonly VersaoRegua[]
  modalidades: readonly string[]
  gravadas: readonly ClassificacaoGravada[]
  metas: MetasEmail
  agora: Date
}

export interface PontoEsteira {
  chave: string
  rotulo: string
  /** Sem filtro de corretora: e-mails que chegaram no balde. Com filtro: pedidos daquela corretora que chegaram no balde (mesma unidade de `pedidos`). */
  recebidos: number
  /** Pedidos (já agrupados) que NASCERAM no balde. */
  pedidos: number
  elegiveis: number
  /** Resolvidos (trazidos + já analisados). Sem filtro: pela DATA DA RESOLUÇÃO. Com filtro: pelo estado de hoje dos pedidos que chegaram no balde (ver cabeçalho). */
  resolvidos: number
  trazidos: number
  ja_analisados: number
  /** Mediana e média de horas úteis até virar caso. Sem filtro: só os trazidos com hora de criação do caso. Com filtro: `Demanda.horas` dos resolvidos daquela corretora. */
  mediana_horas: number | null
  media_horas: number | null
  /** Fração dos resolvidos que entraram dentro do prazo de entrada. */
  no_prazo_pct: number | null
}

type LinhaComTexto = LinhaPedido & { previa?: string | null; anexos?: { nome?: string | null }[] | null }

const mediana = (v: number[]): number | null => {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  const meio = Math.floor(s.length / 2)
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2
}

/**
 * Monta a ponte e o atendimento UMA vez (o passo caro) e recorta para cada
 * janela da série (o passo barato) — a mesma técnica de `montarRelatorioMensal`.
 *
 * `corretora`, quando passado, restringe a conta aos pedidos daquela
 * corretora (ver o porquê da mudança de régua no cabeçalho do arquivo).
 */
export function serieEsteira(
  linhas: readonly LinhaComTexto[],
  entrada: EntradaSerie,
  janelas: readonly JanelaSerie[],
  corretora?: string | null,
): PontoEsteira[] {
  const preparada = prepararPonte(linhas, entrada)
  const lidos = corretora ? null : linhas.map((l) => lerPedido(l, entrada.metas, entrada.agora))

  return janelas.map((j) => {
    const janela: Janela = { desde: j.desde, ate: j.ate, frase: j.rotulo }
    const p = ponteDaJanela(preparada, janela)

    if (corretora) {
      const doCorretor = p.demandas.filter((d) => d.corretora === corretora)
      const resolvidos = doCorretor.filter((d) => d.resolvido)
      const horas = resolvidos.map((d) => d.horas)
      const noPrazo = resolvidos.filter((d) => d.horas <= entrada.metas.horas_primeira_resposta).length
      return {
        chave: j.chave,
        rotulo: j.rotulo,
        recebidos: doCorretor.length,
        pedidos: doCorretor.length,
        elegiveis: doCorretor.filter((d) => d.balde === 'a_fazer' || d.balde === 'resolvido').length,
        resolvidos: resolvidos.length,
        trazidos: resolvidos.filter((d) => d.estado === 'trazido').length,
        ja_analisados: resolvidos.filter((d) => d.estado === 'ja_analisado').length,
        mediana_horas: mediana(horas),
        media_horas: horas.length ? horas.reduce((a, b) => a + b, 0) / horas.length : null,
        no_prazo_pct: resolvidos.length ? noPrazo / resolvidos.length : null,
      }
    }

    // `resumir` fecha o período com `<=`; a janela da série é exclusiva no fim.
    const at = resumir(lidos!, entrada.metas, j.desde, new Date(j.ate.getTime() - 1))
    return {
      chave: j.chave,
      rotulo: j.rotulo,
      recebidos: p.recebidos,
      pedidos: p.demandas.length,
      elegiveis: p.elegiveis.total,
      resolvidos: at.resolvidos,
      trazidos: at.trazidos,
      ja_analisados: at.ja_analisados,
      mediana_horas: at.mediana_horas,
      media_horas: at.media_horas,
      no_prazo_pct: at.com_tempo ? at.no_prazo / at.com_tempo : null,
    }
  })
}

/** As corretoras que aparecem em algum pedido, para o filtro — de qualquer
 *  data, e não só do período escolhido, para a lista não pular item quando
 *  a pessoa troca de período. */
export function corretorasDaSerie(linhas: readonly LinhaComTexto[], entrada: EntradaSerie): string[] {
  const preparada = prepararPonte(linhas, entrada)
  const nomes = new Set<string>()
  for (const d of preparada.todas) if (d.corretora) nomes.add(d.corretora)
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
