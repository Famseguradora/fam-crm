// ============================================================================
//  O RETRATO DO ACERVO  ·  as contas que a Gestão e a Sala de Comando mostram
//
//  Porta o `geralDoAcervo()` do kpis.mjs/acervo do Sistema de Análise: TODO
//  número é contado sobre as MESMAS linhas que a lista desenha (a regra do
//  kpis.mjs dele). Escrito em TypeScript puro, sem IA, e conferível na unha.
//
//  A decisão é lida com o MESMO vocabulário do Acervo (`Aprovar`, `Aprovar com
//  ressalvas`, `Reprovar`, `Bloqueio`), para a barra da Gestão nunca discordar
//  da etiqueta da lista.
// ============================================================================

export interface LinhaRetrato {
  id: string
  cnpj: string | null
  razao_social: string
  corretora: string | null
  data_analise: string
  vigente: boolean
  revisada: boolean
  recomendacao: string | null
  nivel_risco: string | null
  setor: string | null
  limite_recomendado_num: number | string | null
  limite_recomendado_motivo: string | null
}

export const COLUNAS_RETRATO = 'id, cnpj, razao_social, corretora, data_analise, vigente, revisada, recomendacao, nivel_risco, setor, limite_recomendado_num, limite_recomendado_motivo'

export const situacaoDe = (d: string | null): 'Aprovar' | 'Aprovar com ressalvas' | 'Reprovar' | 'Bloqueio' | 'Sem decisão' => {
  const t = (d ?? '').toLowerCase()
  if (!t.trim()) return 'Sem decisão'
  if (/bloqueio|bloquear/.test(t)) return 'Bloqueio'
  if (/condicion|ressalva|restri/.test(t)) return 'Aprovar com ressalvas'
  if (/reprov|recus|negar|indefer/.test(t)) return 'Reprovar'
  if (/aprovar|aprovad|defer/.test(t)) return 'Aprovar'
  return 'Sem decisão'
}

export const COR_DECISAO: Record<string, string> = {
  'Aprovar': '#27a96c', 'Aprovar com ressalvas': '#b8851f', 'Reprovar': '#d64545', 'Bloqueio': '#c76f3a', 'Sem decisão': '#8ba3c0',
}

/* O NÍVEL DE RISCO CHEGA EM SETE GRAFIAS do acervo ("Médio-Baixo", "Medio-Baixo",
   "Médio - Baixo", "ALTO"). São o mesmo nível, e uma barra por grafia mentiria
   sobre a distribuição. Aqui vira uma régua só; o texto cru continua na análise. */
const NIVEIS: [RegExp, string][] = [
  [/medio.*alto|alto.*medio/, 'Médio-Alto'],
  [/medio.*baixo|baixo.*medio/, 'Médio-Baixo'],
  [/muito.*alto/, 'Muito alto'],
  [/muito.*baixo/, 'Muito baixo'],
  [/alto/, 'Alto'],
  [/baixo/, 'Baixo'],
  [/medio/, 'Médio'],
]
export function nivelLimpo(v: string | null | undefined): string {
  // A faixa dos acentos escrita em ASCII (̀-ͯ), e não com os
  // caracteres combinantes literais: eles são invisíveis no editor.
  const t = String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  if (!t) return 'Sem nível'
  for (const [re, rot] of NIVEIS) if (re.test(t)) return rot
  return String(v).trim()
}
const ORDEM_NIVEL = ['Baixo', 'Médio-Baixo', 'Médio', 'Médio-Alto', 'Alto', 'Muito alto', 'Muito baixo', 'Sem nível']

const num = (v: number | string | null): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export interface Retrato {
  total: number
  empresas: number
  versoesAnteriores: number
  revisadas: number
  naFila: number
  aprovacao: { limpo: number; comRessalva: number; totalPct: number; limpoPct: number }
  limite: { mediana: number | null; efetivos: number }
  corretoras: { quantas: number; top5Pct: number; top: { nome: string; n: number }[] }
  porMes: { mes: string; n: number; emCurso: boolean }[]
  decisao: { rot: string; n: number; cor: string }[]
  nivel: { rot: string; n: number }[]
  setor: { rot: string; n: number }[]
}

/** As contas, sobre as linhas VIGENTES (o acervo de hoje). `todas` só entra
 *  para dizer quantas versões anteriores existem. */
export function retratoDoAcervo(todas: LinhaRetrato[]): Retrato {
  const l = todas.filter(x => x.vigente)
  const total = l.length
  const empresas = new Set(l.map(x => x.cnpj || x.razao_social)).size
  const revisadas = l.filter(x => x.revisada).length

  const sits = l.map(x => situacaoDe(x.recomendacao))
  const limpo = sits.filter(s => s === 'Aprovar').length
  const comRessalva = sits.filter(s => s === 'Aprovar com ressalvas').length
  const pct = (n: number) => total ? Math.round((n / total) * 1000) / 10 : 0

  const limites = l.map(x => x.limite_recomendado_motivo ? null : num(x.limite_recomendado_num)).filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b)
  const mediana = limites.length ? (limites.length % 2 ? limites[(limites.length - 1) / 2] : (limites[limites.length / 2 - 1] + limites[limites.length / 2]) / 2) : null

  const porCorr: Record<string, number> = {}
  for (const x of l) { const k = (x.corretora || 'Sem corretora').trim(); porCorr[k] = (porCorr[k] ?? 0) + 1 }
  const topCorr = Object.entries(porCorr).sort((a, b) => b[1] - a[1]).map(([nome, n]) => ({ nome, n }))
  const top5 = topCorr.slice(0, 5).reduce((s, c) => s + c.n, 0)

  // Os últimos 12 meses pela data da análise, com o mês atual marcado em curso.
  const agora = new Date()
  const meses: { mes: string; n: number; emCurso: boolean }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    meses.push({ mes, n: 0, emCurso: i === 0 })
  }
  for (const x of l) {
    const m = String(x.data_analise || '').slice(0, 7)
    const alvo = meses.find(y => y.mes === m)
    if (alvo) alvo.n++
  }

  const conta = (f: (x: LinhaRetrato) => string) => {
    const c: Record<string, number> = {}
    for (const x of l) { const k = f(x); c[k] = (c[k] ?? 0) + 1 }
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([rot, n]) => ({ rot, n }))
  }

  return {
    total, empresas, versoesAnteriores: todas.length - total, revisadas, naFila: total - revisadas,
    aprovacao: { limpo, comRessalva, totalPct: pct(limpo + comRessalva), limpoPct: pct(limpo) },
    limite: { mediana, efetivos: limites.length },
    corretoras: { quantas: topCorr.filter(c => c.nome !== 'Sem corretora').length, top5Pct: total ? Math.round((top5 / total) * 1000) / 10 : 0, top: topCorr.slice(0, 8) },
    porMes: meses,
    decisao: (['Aprovar', 'Aprovar com ressalvas', 'Reprovar', 'Bloqueio', 'Sem decisão'] as const).map(rot => ({ rot, n: sits.filter(s => s === rot).length, cor: COR_DECISAO[rot] })).filter(d => d.n),
    nivel: conta(x => nivelLimpo(x.nivel_risco)).sort((a, b) => {
      const ia = ORDEM_NIVEL.indexOf(a.rot), ib = ORDEM_NIVEL.indexOf(b.rot)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    }),
    setor: conta(x => x.setor?.trim() || 'Sem setor').slice(0, 8),
  }
}

export const reaisMi = (v: number | null) => {
  if (v === null) return 'sem dado'
  if (v >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (v >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
  return `R$ ${v.toLocaleString('pt-BR')}`
}

export const NOME_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
