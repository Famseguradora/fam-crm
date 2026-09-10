// ============================================================================
//  A SOMA DA IA  ·  total, contagem e média feitos sobre TODAS as linhas
//
//  O defeito que fez este arquivo existir (10/09/2026): a primeira pergunta
//  real feita à IA em produção foi "monte um gráfico do prêmio previsto por
//  etapa do funil". A ferramenta `consultar` devolve no máximo 200 linhas, o
//  CRM tem 298 operações, e o prompt mandava a IA "agregar você mesmo o que
//  precisar somar". Ela somou 200 e desenhou o gráfico. O total saiu menor que
//  o real, numa tela de diretoria. A própria IA avisou na resposta, o que foi
//  sorte e não mecanismo.
//
//  O conserto: a IA não soma mais linha nenhuma. Ela pede a conta pronta, e
//  quem soma é o Node, lendo a tabela inteira em páginas. É a mesma regra do
//  robô: QUEM CALCULA É O NODE, A IA SÓ NARRA.
//
//  Este arquivo é a MATEMÁTICA, pura, sem banco e sem alias `@/`: dá para
//  testar com `node` depois de transpilar. A leitura paginada do banco mora em
//  lib/ia/servidor.ts, junto das outras ferramentas e da trava do catálogo.
// ============================================================================
import { lmgFam, mundoDa } from './regras-operacao'

export type Funcao = 'soma' | 'contagem' | 'media' | 'minimo' | 'maximo'

export const FUNCOES: Funcao[] = ['soma', 'contagem', 'media', 'minimo', 'maximo']

export interface Metrica {
  funcao: Funcao
  /** Obrigatória, exceto em `contagem`, onde sem coluna conta as linhas. */
  coluna?: string
}

export interface Grupo {
  grupo: string
  [metrica: string]: string | number
}

export interface ResultadoAgregado {
  grupos: Grupo[]
  /** O que foi aplicado por regra de negócio, dito com todas as letras, para a
   *  IA repetir na origem do gráfico e ninguém achar que é número cru. */
  regras: string[]
  /** O que a IA precisa saber antes de mostrar o número. */
  avisos: string[]
}

/** Nome que a métrica ganha no resultado: `soma_premio_previsto`,
 *  `contagem_linhas`. Previsível, para a IA usar direto como campo do gráfico. */
export const nomeDaMetrica = (m: Metrica): string =>
  `${m.funcao}_${m.coluna ? m.coluna : 'linhas'}`

/** `mundo` é um agrupamento que não existe como coluna: ele sai do status. */
const eMundo = (tabela: string, agruparPor?: string) =>
  tabela === 'operacoes' && agruparPor === 'mundo'

/** As colunas que a leitura precisa trazer do banco, e só elas. Pedir `*`
 *  numa varredura inteira seria carregar texto que ninguém vai somar. */
export function colunasNecessarias(tabela: string, agruparPor: string | undefined, metricas: Metrica[]): string[] {
  const cols = new Set<string>()
  if (agruparPor) cols.add(eMundo(tabela, agruparPor) ? 'status' : agruparPor)
  for (const m of metricas) if (m.coluna) cols.add(m.coluna)
  return [...cols]
}

/** Recusa o pedido malformado ANTES de ir ao banco, com a frase que a IA
 *  precisa para se corrigir sozinha. */
export function validar(metricas: Metrica[]): string | null {
  if (!Array.isArray(metricas) || !metricas.length) {
    return 'ERRO: informe ao menos uma métrica (ex.: {"funcao":"soma","coluna":"premio_previsto"}).'
  }
  for (const m of metricas) {
    if (!FUNCOES.includes(m.funcao)) {
      return `ERRO: função "${m.funcao}" não existe. Use: ${FUNCOES.join(', ')}.`
    }
    if (m.funcao !== 'contagem' && !m.coluna) {
      return `ERRO: a função "${m.funcao}" precisa de uma coluna.`
    }
  }
  return null
}

const arred = (v: number) => Math.round(v * 100) / 100

/**
 * Agrupa e calcula. Recebe as linhas JÁ lidas por inteiro.
 *
 * Duas regras de negócio entram aqui sozinhas, sem depender de a IA lembrar:
 *   · em operacoes, a coluna `lmg` é capada em 80 milhões por operação;
 *   · em operacoes, `agrupar_por: "mundo"` separa emitida, funil e encerrada.
 * E um aviso sai quando a IA soma dinheiro de operação misturando os mundos,
 * porque foi exatamente esse o erro de 09/09/2026.
 */
export function agregarLinhas(
  tabela: string,
  linhas: Record<string, unknown>[],
  agruparPor: string | undefined,
  metricas: Metrica[],
  filtros: { coluna: string }[] = [],
): ResultadoAgregado {
  const regras: string[] = []
  const avisos: string[] = []

  const capaLmg = tabela === 'operacoes' && metricas.some((m) => m.coluna === 'lmg')
  if (capaLmg) regras.push('LMG capado em R$ 80 milhões por operação, como na tela de Operações')
  if (eMundo(tabela, agruparPor)) {
    regras.push('mundo: emitida = Emitido; encerrada = Perdido ou Recusado; funil = todo o resto')
  }

  const misturaMundos = tabela === 'operacoes'
    && !eMundo(tabela, agruparPor)
    && agruparPor !== 'status'
    && !filtros.some((f) => f.coluna === 'status')
    && metricas.some((m) => m.coluna === 'premio_previsto' || m.coluna === 'lmg')
  if (misturaMundos) {
    avisos.push(
      'ATENÇÃO: esta soma misturou operação emitida, viva e encerrada (Perdido e Recusado). '
      + 'Isso NÃO é produção nem exposição. Refaça com agrupar_por "mundo", ou filtre status, '
      + 'antes de mostrar como total.',
    )
  }

  const valor = (l: Record<string, unknown>, coluna: string): number | null => {
    if (capaLmg && coluna === 'lmg') return l.lmg == null ? null : lmgFam(l as { lmg: number })
    const v = l[coluna]
    if (v === null || v === undefined || v === '') return null
    const x = Number(v)
    return Number.isFinite(x) ? x : null
  }

  const chave = (l: Record<string, unknown>): string => {
    if (!agruparPor) return 'total'
    if (eMundo(tabela, agruparPor)) return mundoDa(l.status as string | null)
    const v = l[agruparPor]
    return v === null || v === undefined || v === '' ? '(vazio)' : String(v)
  }

  /* Acumuladores por grupo e por métrica. `n` é quantos valores numéricos
     entraram: média de coluna com nulo não pode dividir pelo total de linhas. */
  type Acum = { soma: number; n: number; min: number; max: number; linhas: number }
  const porGrupo = new Map<string, Acum[]>()

  for (const l of linhas) {
    const k = chave(l)
    let acs = porGrupo.get(k)
    if (!acs) {
      acs = metricas.map(() => ({ soma: 0, n: 0, min: Infinity, max: -Infinity, linhas: 0 }))
      porGrupo.set(k, acs)
    }
    metricas.forEach((m, i) => {
      const a = acs![i]
      a.linhas++
      if (!m.coluna) return
      const v = valor(l, m.coluna)
      if (v === null) return
      a.soma += v
      a.n++
      if (v < a.min) a.min = v
      if (v > a.max) a.max = v
    })
  }

  const grupos: Grupo[] = [...porGrupo.entries()].map(([grupo, acs]) => {
    const g: Grupo = { grupo }
    metricas.forEach((m, i) => {
      const a = acs[i]
      const nome = nomeDaMetrica(m)
      switch (m.funcao) {
        case 'contagem': g[nome] = m.coluna ? a.n : a.linhas; break
        case 'soma': g[nome] = arred(a.soma); break
        case 'media': g[nome] = a.n ? arred(a.soma / a.n) : 0; break
        case 'minimo': g[nome] = a.n ? arred(a.min) : 0; break
        case 'maximo': g[nome] = a.n ? arred(a.max) : 0; break
      }
    })
    return g
  })

  /* Do maior para o menor pela primeira métrica: em cima é onde se olha, e é
     a mesma ordem que o Dashboard passou a usar em 09/09/2026. */
  const primeira = nomeDaMetrica(metricas[0])
  grupos.sort((a, b) => Number(b[primeira]) - Number(a[primeira]))

  /* Participação de cada grupo na primeira métrica, quando ela é somável.
     É a conta de concentração, que a IA errava fazendo de cabeça. */
  if (grupos.length > 1 && (metricas[0].funcao === 'soma' || metricas[0].funcao === 'contagem')) {
    const total = grupos.reduce((s, g) => s + Number(g[primeira]), 0)
    if (total > 0) {
      for (const g of grupos) g[`participacao_pct_${primeira}`] = arred((Number(g[primeira]) / total) * 100)
    }
  }

  return { grupos, regras, avisos }
}
