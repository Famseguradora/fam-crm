'use client'

// ============================================================
//  Cockpit de Corretoras — layout de 3 zonas (dark/glass).
//
//  ESQUERDA (rola): Resultado Mensal (gráfico/tabela) + Ranking (20 primeiras
//  + "ver todas", TOTAL fixo no rodapé). DIREITA (fixa): consolidado, gráficos
//  compactos (Participação, Pareto, Desfecho, Mix, Matriz) com ⤢ expandir em
//  tela grande, e — ao clicar numa corretora — o DOSSIÊ dela (números + cadeia).
//
//  Toda a matemática vem de lib/corretoras/agregacoes.ts (fonte única) — os
//  números batem com a tela de Operações. Preserva Excel, PDF, Funil/Carteira
//  e drill-down semanal. Só o layout e o tema mudaram.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, CartesianGrid, LabelList,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { fmtMoeda, fmtMoedaCurta, fmtPercent } from '@/lib/utils'
import {
  agregarPorCorretora, comPareto, comParticipacao, rankingTomadores, operacoesDoTomador,
  kpisDeOperacoes, taxaConversao, distribuicaoPorStatus, serieMensalPremioTaxa, taxaMediaMensal, TAXA_MENSAL_INFO, TAXA_PONDERADA_INFO, mesesDisponiveis,
  rotuloMes, serieMensalAlinhada, deltaUltimoMes, filtrarPorPeriodo, matrizCorretoraMes,
  seriesMiniPorMetrica, desfechoPorCorretora, ehEmitida, mesDeOperacao,
  type OpAgg, type TomAgg, type CorretoraAgg, type DesfechoCorretora,
} from '@/lib/corretoras/agregacoes'
import { gerarPdfGeral, gerarPdfCorretora } from '@/lib/corretoras/pdf'
import { metricasComparativas, htmlComparativoCorretoras, htmlComparativoGraficos, htmlRelatorioPainel, nomeArquivo, LINHAS_COMPARATIVO } from '@/lib/corretoras/comparativo'
import type { Corretora, StatusFluxo } from '@/types'
import RacionalTaxaBox from '@/components/RacionalTaxaBox'

// ── Paleta do cockpit (dark) ────────────────────────────────────────────────
const GOLD = '#e8b84b', BLUE = '#4a90d0', BLUE_BR = '#66aef0', NAVY_BAR = '#3f74b8'
const GOOD = '#38c58e'
const TICK = '#8aa0c0'
// Escala sequencial (heatmap) — do fundo escuro ao azul forte.
const HEAT_LO = '#16233d', HEAT_HI = '#66aef0'

const initials = (n: string) => n.split(' ').filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || (n[0] ?? '?').toUpperCase()

// Taxa em pontos percentuais (ex.: 2.4) → "2,40%".
const fmtTaxaPP = (v: number): string => `${(v || 0).toFixed(2).replace('.', ',')}%`

// R$ abreviado para valores grandes (mesma régua da tela atual).
const kpiBRL = (v: number): string => {
  const abs = Math.abs(v)
  if (abs >= 1e9) return 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' Bi'
  if (abs >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' Mi'
  if (abs >= 1e3) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' mil'
  return fmtMoeda(v)
}
const eixoBRL = (v: number): string => {
  const abs = Math.abs(v)
  if (abs >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M'
  if (abs >= 1e3) return 'R$ ' + Math.round(v / 1e3) + 'k'
  return 'R$ ' + Math.round(v)
}
// Interpolação linear entre dois hex → rgb() (intensidade do heatmap).
function lerpHex(a: string, b: string, t: number): string {
  const h = (x: string) => [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)]
  const A = h(a), B = h(b)
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`
}
// Rampa de AZUL por posição (share/participação) — escuro (maior) → claro (menor).
const azul = (i: number, n: number) => n <= 1 ? '#3f74b8' : lerpHex('#1f4f8f', '#a9d2f2', i / (n - 1))
// Rampa de azul para as PASTILHAS do ranking (mais escura, texto branco legível).
const azulBadge = (i: number, n: number) => n <= 1 ? '#3f74b8' : lerpHex('#173d68', '#5a9cd8', i / (n - 1))

const tooltipDark = { background: '#0a1020', border: '1px solid rgba(255,255,255,.18)', borderRadius: 9, color: '#eaf0fb', fontSize: 12 }

type EscopoStatus = 'funil' | 'carteira'
const STATUS_FORA_DO_FUNIL = ['Emitido', 'Perdido', 'Recusado']
type MetricaPareto = 'premio' | 'tomadores' | 'operacoes'
type ExpandKey = 'pareto' | 'desfecho' | 'matriz' | 'status' | 'share'

// Gráficos que podem ser comparados lado a lado (tela + HTML).
const GRAFICOS_COMP: { key: ExpandKey; label: string }[] = [
  { key: 'share', label: 'Participação no prêmio' },
  { key: 'pareto', label: 'Concentração 80/20' },
  { key: 'desfecho', label: 'Desfecho por corretora' },
  { key: 'status', label: 'Mix por status' },
  { key: 'matriz', label: 'Matriz Corretora × Mês' },
]

// Seções de GRÁFICO do relatório em HTML (KPIs do topo entram sempre; o Ranking
// é uma seção à parte). O padrão liga o que aparece na tela inicial de Corretoras.
type RelKey = 'mensal' | 'share' | 'pareto' | 'desfecho' | 'movers' | 'status' | 'matriz'
const RELATORIO_FIGS: { key: RelKey; label: string; wide?: boolean }[] = [
  { key: 'mensal', label: 'Resultado Mensal', wide: true },
  { key: 'share', label: 'Participação no prêmio' },
  { key: 'pareto', label: 'Concentração 80/20' },
  { key: 'desfecho', label: 'Desfecho por corretora' },
  { key: 'movers', label: 'Maiores em prêmio emitido' },
  { key: 'status', label: 'Mix por status' },
  { key: 'matriz', label: 'Matriz Corretora × Mês', wide: true },
]
const RELATORIO_FIG_PADRAO: RelKey[] = ['mensal', 'share', 'pareto', 'desfecho', 'movers']

// Blocos personalizáveis (catálogo "Monte sua tela"). Mix por status e Matriz
// começam DESLIGADOS (aparecem só quando o usuário liga).
type CardKey = 'mensal' | 'grade' | 'share' | 'pareto' | 'desfecho' | 'movers' | 'status' | 'matriz'
const CARDS_INICIAIS: Record<CardKey, boolean> = { mensal: true, grade: true, share: true, pareto: true, desfecho: true, movers: true, status: false, matriz: false }
const CARDS_LABEL: Record<CardKey, string> = {
  mensal: 'Resultado Mensal', grade: 'Ranking', share: 'Participação no prêmio', pareto: 'Concentração 80/20',
  desfecho: 'Desfecho por corretora', movers: 'Maiores em prêmio emitido', status: 'Mix por status', matriz: 'Matriz Corretora×Mês',
}
const CARDS_NOVO: Partial<Record<CardKey, boolean>> = { status: true, matriz: true }
const VIS_GRADE = 20

interface Props {
  onAbrirCorretora?: (id: string) => void   // abre o modal de CADASTRO (edição)
  onNovaCorretora?: () => void
}

export default function PainelGerencial({ onAbrirCorretora, onNovaCorretora }: Props) {
  const [mounted, setMounted] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [exportando, setExportando] = useState(false)

  const [corretoras, setCorretoras] = useState<Corretora[]>([])
  const [tomadores, setTomadores] = useState<TomAgg[]>([])
  const [operacoes, setOperacoes] = useState<OpAgg[]>([])
  const [statusFluxo, setStatusFluxo] = useState<Pick<StatusFluxo, 'nome' | 'cor'>[]>([])

  // Filtros globais (UF removido a pedido). Cross-filter de corretora não é usado
  // aqui: o clique numa corretora abre o DOSSIÊ à direita, não filtra a esquerda.
  const [mesIni, setMesIni] = useState('')
  const [mesFim, setMesFim] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null)
  const [escopoStatus, setEscopoStatus] = useState<EscopoStatus>('funil')
  const [busca, setBusca] = useState('')
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // UI do cockpit.
  const [selecionada, setSelecionada] = useState<string | null>(null)  // dossiê no painel direito
  const [mensalView, setMensalView] = useState<'graf' | 'tab'>('graf')
  const [mostrarFormula, setMostrarFormula] = useState(false)
  const [mostrarRacionalPond, setMostrarRacionalPond] = useState(false)
  const [mesesSel, setMesesSel] = useState<Set<string>>(new Set())   // meses clicados no gráfico → consolidam o card à direita
  const [expandido, setExpandido] = useState<ExpandKey | null>(null)
  const [zoom, setZoom] = useState(1)   // zoom das páginas expandidas (0.6–2.0)
  const [metricaPareto, setMetricaPareto] = useState<MetricaPareto>('premio')
  const [paretoNumeros, setParetoNumeros] = useState(false)
  const [mostrarTodas, setMostrarTodas] = useState(false)
  const [cards, setCards] = useState<Record<CardKey, boolean>>(CARDS_INICIAIS)
  const [mostrarPersonalizar, setMostrarPersonalizar] = useState(false)
  const [preview, setPreview] = useState<{ url: string; filename: string } | null>(null)

  // Comparativo (corretoras/gráficos lado a lado → HTML por e-mail)
  const [modoComparar, setModoComparar] = useState(false)
  const [selCompare, setSelCompare] = useState<Set<string>>(new Set())
  const [comparativoAberto, setComparativoAberto] = useState(false)
  const [compTab, setCompTab] = useState<'corretoras' | 'graficos'>('corretoras')
  const [graficosSel, setGraficosSel] = useState<Set<ExpandKey>>(new Set(['pareto', 'desfecho']))
  const [gerandoHtml, setGerandoHtml] = useState(false)
  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Relatório da tela (KPIs + ranking + gráficos escolhidos → HTML p/ diretoria)
  const [relatorioAberto, setRelatorioAberto] = useState(false)
  const [secRanking, setSecRanking] = useState(true)
  const [relRankTodas, setRelRankTodas] = useState(false)  // Ranking: só com operações (padrão) vs. todas
  const [figSel, setFigSel] = useState<Set<RelKey>>(new Set(RELATORIO_FIG_PADRAO))
  const [figOrdem, setFigOrdem] = useState<RelKey[]>(RELATORIO_FIGS.map((f) => f.key))          // ordem dos gráficos no relatório
  const [figWide, setFigWide] = useState<Record<RelKey, boolean>>(                               // tamanho por gráfico (meia/inteira)
    () => Object.fromEntries(RELATORIO_FIGS.map((f) => [f.key, !!f.wide])) as Record<RelKey, boolean>)
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false)
  const reportRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    try { const s = localStorage.getItem('fam_corretoras_ckp_v1'); if (s) setCards((p) => ({ ...p, ...JSON.parse(s) })) } catch { /* ignore */ }
  }, [])

  const carregar = useCallback(async () => {
    setCarregando(true)
    const supabase = createClient()
    const [{ data: cor }, { data: tom }, { data: ops }, { data: sf }] = await Promise.all([
      supabase.from('corretoras').select('*').order('razao_social'),
      supabase.from('tomadores').select('id, razao_social, nome_fantasia, corretora_id, status'),
      supabase.from('operacoes').select('id, tomador_id, corretora_id, lmg, taxa, vigencia_anos, vigencia_dias, periodicidade_vigencia, premio_previsto, status, data_entrada, data_emissao, modalidade, estado').eq('ativo', true),
      supabase.from('status_fluxo_operacao').select('nome, cor'),
    ])
    setCorretoras((cor ?? []) as Corretora[])
    setTomadores((tom ?? []) as TomAgg[])
    setOperacoes((ops ?? []) as OpAgg[])
    setStatusFluxo((sf ?? []) as Pick<StatusFluxo, 'nome' | 'cor'>[])
    setCarregando(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => { const u = preview?.url; return () => { if (u) URL.revokeObjectURL(u) } }, [preview?.url])
  useEffect(() => {
    function esc(e: KeyboardEvent) { if (e.key === 'Escape') { setExpandido(null); setZoom(1); setSelecionada(null); setComparativoAberto(false); setRelatorioAberto(false) } }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [])

  const toggleCard = (k: CardKey) => setCards((p) => {
    const n = { ...p, [k]: !p[k] }
    try { localStorage.setItem('fam_corretoras_ckp_v1', JSON.stringify(n)) } catch { /* ignore */ }
    return n
  })

  // ── Base dos cálculos (escopo funil replica o recorte de Operações) ────────
  const operacoesEscopo = useMemo(
    () => escopoStatus === 'funil' ? operacoes.filter((o) => !STATUS_FORA_DO_FUNIL.includes(o.status ?? '')) : operacoes,
    [operacoes, escopoStatus],
  )
  const meses = useMemo(() => mesesDisponiveis(operacoesEscopo), [operacoesEscopo])
  const [pIni, pFim] = useMemo<[string, string]>(() => {
    if (mesIni && mesFim && mesIni > mesFim) return [mesFim, mesIni]
    return [mesIni, mesFim]
  }, [mesIni, mesFim])
  const noPeriodo = useCallback((m: string) => (!pIni || m >= pIni) && (!pFim || m <= pFim), [pIni, pFim])

  const passaStatus = useCallback((o: OpAgg) => !filtroStatus || o.status === filtroStatus, [filtroStatus])
  const opsBoard = useMemo(() => filtrarPorPeriodo(operacoesEscopo.filter(passaStatus), pIni, pFim), [operacoesEscopo, passaStatus, pIni, pFim])
  const opsTrend = useMemo(() => operacoesEscopo.filter(passaStatus), [operacoesEscopo, passaStatus])

  const ranking = useMemo<CorretoraAgg[]>(
    () => comPareto(agregarPorCorretora(
      corretoras.map((c) => ({ id: c.id, razao_social: c.razao_social, nome_fantasia: c.nome_fantasia, status: c.status })),
      tomadores, opsBoard,
    )),
    [corretoras, tomadores, opsBoard],
  )
  const comPremio = useMemo(() => ranking.filter((r) => r.premioTotal > 0), [ranking])
  const maxPremioRank = useMemo(() => Math.max(1, ...ranking.map((r) => r.premioTotal)), [ranking])
  const maxPartRank = useMemo(() => Math.max(0.0001, ...ranking.map((r) => r.participacaoPct ?? 0)), [ranking])
  const ids8020 = useMemo(() => {
    const s = new Set<string>()
    let ativo = true
    for (const r of ranking) {
      if (!ativo || r.premioTotal <= 0) break
      s.add(r.id)
      if ((r.acumuladoPct ?? 0) >= 0.8) ativo = false
    }
    return s
  }, [ranking])

  const rankingBusca = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const d = busca.replace(/\D/g, '')
    if (!t) return ranking
    return ranking.filter((r) => {
      const c = corretoras.find((x) => x.id === r.id)
      return r.nome.toLowerCase().includes(t) || (c?.razao_social ?? '').toLowerCase().includes(t) || (d.length > 0 && (c?.cnpj ?? '').replace(/\D/g, '').includes(d))
    })
  }, [ranking, busca, corretoras])
  const rankingOrdenado = useMemo(() => {
    if (!sortField) return rankingBusca
    const arr = [...rankingBusca]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortField === 'nome') cmp = a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
      else if (sortField === 'nOperacoes') cmp = a.nOperacoes - b.nOperacoes
      else if (sortField === 'premio') cmp = a.premioTotal - b.premioTotal
      else if (sortField === 'participacao') cmp = (a.participacaoPct ?? 0) - (b.participacaoPct ?? 0)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [rankingBusca, sortField, sortDir])
  const handleSort = (f: string) => {
    if (sortField === f) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(f); setSortDir(f === 'nome' ? 'asc' : 'desc') }
  }
  const sortIcon = (f: string) => (sortField !== f ? ' ↕' : sortDir === 'asc' ? ' ▲' : ' ▼')

  // ── Cards do TOPO = book REALIZADO (operações EMITIDAS) — mesmo espírito do
  // "Painel Executivo/Fechado" do Dashboard. Emitido é emitido: NÃO depende do
  // escopo funil/carteira; respeita o recorte de período e a seleção de meses do
  // gráfico. Só entra aqui quando a operação vira status "Emitido".
  const opsRealizadas = useMemo(() => {
    const base = mesesSel.size > 0 ? operacoes.filter((o) => mesesSel.has(mesDeOperacao(o))) : filtrarPorPeriodo(operacoes, pIni, pFim)
    return base.filter((o) => ehEmitida(o.status))
  }, [operacoes, mesesSel, pIni, pFim])
  const kpisReal = useMemo(() => kpisDeOperacoes(opsRealizadas), [opsRealizadas])
  const nTomadoresReal = useMemo(() => new Set(opsRealizadas.map((o) => o.tomador_id).filter(Boolean)).size, [opsRealizadas])
  // Tendências (sparklines) sobre TODAS as emitidas, alinhadas aos meses.
  const opsRealTrend = useMemo(() => operacoes.filter((o) => ehEmitida(o.status)), [operacoes])
  const deltaReal = useMemo(() => deltaUltimoMes(opsRealTrend), [opsRealTrend])
  const sparkReal = useMemo(() => serieMensalAlinhada(opsRealTrend, meses), [opsRealTrend, meses])
  const seriesMiniReal = useMemo(() => seriesMiniPorMetrica(opsRealTrend, meses), [opsRealTrend, meses])

  // Série do gráfico central: prêmio + taxa média ponderada (canônica) por mês.
  // "Resultado Mensal" = resultado DE FATO (operações EMITIDAS), regime de competência.
  const opsEmitidasTrend = useMemo(() => operacoes.filter((o) => ehEmitida(o.status)), [operacoes])
  const serieMensal = useMemo(() => serieMensalPremioTaxa(opsEmitidasTrend), [opsEmitidasTrend])
  // Taxa de referência (tracejado) = taxa MENSAL (sem prazo) das emitidas no período;
  // a aba Tabela usa o total das emitidas. NÃO é a "taxa total ponderada" (com prazo).
  const emitidasPeriodo = useMemo(() => filtrarPorPeriodo(opsEmitidasTrend, pIni, pFim), [opsEmitidasTrend, pIni, pFim])
  const taxaPeriodoGraf = useMemo(() => taxaMediaMensal(emitidasPeriodo), [emitidasPeriodo])
  const taxaTotalTabela = useMemo(() => taxaMediaMensal(opsEmitidasTrend), [opsEmitidasTrend])

  // Mix por status IGNORA o filtro de Status de propósito (senão colapsaria numa
  // fatia só) — mostra o mix completo do período/escopo, como na tela antiga.
  const opsStatusBase = useMemo(() => filtrarPorPeriodo(operacoesEscopo, pIni, pFim), [operacoesEscopo, pIni, pFim])
  const porStatus = useMemo(() => distribuicaoPorStatus(opsStatusBase, statusFluxo), [opsStatusBase, statusFluxo])

  // Desfecho: carteira INTEIRA (todos os status), respeita só o período.
  const desfecho = useMemo(() => {
    const base = filtrarPorPeriodo(operacoes, pIni, pFim)
    return desfechoPorCorretora(
      corretoras.map((c) => ({ id: c.id, razao_social: c.razao_social, nome_fantasia: c.nome_fantasia, status: c.status })),
      base,
    )
  }, [operacoes, corretoras, pIni, pFim])
  const desfechoTotais = useMemo(() => desfecho.reduce((a, d) => ({
    total: a.total + d.total,
    emitidas: { n: a.emitidas.n + d.emitidas.n, premio: a.emitidas.premio + d.emitidas.premio },
    perdidas: { n: a.perdidas.n + d.perdidas.n, premio: a.perdidas.premio + d.perdidas.premio },
    recusadas: { n: a.recusadas.n + d.recusadas.n, premio: a.recusadas.premio + d.recusadas.premio },
    andamento: { n: a.andamento.n + d.andamento.n, premio: a.andamento.premio + d.andamento.premio },
  }), { total: 0, emitidas: { n: 0, premio: 0 }, perdidas: { n: 0, premio: 0 }, recusadas: { n: 0, premio: 0 }, andamento: { n: 0, premio: 0 } }), [desfecho])
  const desfechoDecididas = desfechoTotais.emitidas.n + desfechoTotais.perdidas.n + desfechoTotais.recusadas.n
  const desfechoConv = desfechoDecididas > 0 ? desfechoTotais.emitidas.n / desfechoDecididas : 0

  // Matriz mostra TODOS os meses (não aplica o filtro de período) — réplica do
  // comportamento antigo e coerente com as colunas serem todos os meses do escopo.
  const matriz = useMemo(
    () => matrizCorretoraMes(
      corretoras.map((c) => ({ id: c.id, razao_social: c.razao_social, nome_fantasia: c.nome_fantasia, status: c.status })),
      opsTrend, meses,
    ),
    [corretoras, opsTrend, meses],
  )

  // Pareto (métrica escolhida no expandir; compacto usa a mesma base).
  const paretoData = useMemo(() => {
    const val = (r: CorretoraAgg) => metricaPareto === 'tomadores' ? r.nTomadores : metricaPareto === 'operacoes' ? r.nOperacoes : r.premioTotal
    const arr = ranking.map((r) => ({ id: r.id, nome: r.nome, valor: val(r) })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor)
    const total = arr.reduce((s, x) => s + x.valor, 0)
    const out: { id: string; nome: string; valor: number; acumPct: number; pct: number }[] = []
    let acc = 0
    for (const x of arr) { acc += x.valor; out.push({ ...x, acumPct: total > 0 ? acc / total : 0, pct: total > 0 ? x.valor / total : 0 }) }
    return out
  }, [ranking, metricaPareto])
  const vitalFew = useMemo(() => { const i = paretoData.findIndex((x) => x.acumPct >= 0.8); return i >= 0 ? i + 1 : paretoData.length }, [paretoData])
  const vitalPct = paretoData.length ? vitalFew / paretoData.length : 0
  const metricaTxt = metricaPareto === 'tomadores' ? 'dos tomadores' : metricaPareto === 'operacoes' ? 'das operações' : 'do prêmio'
  const fmtParetoVal = (v: number) => metricaPareto === 'premio' ? fmtMoeda(v) : String(Math.round(v))

  const periodoLabel = useMemo(() => {
    if (!pIni && !pFim) return 'Todos os períodos'
    if (pIni && pFim && pIni === pFim) return rotuloMes(pIni)
    if (pIni && pFim) return `${rotuloMes(pIni)} a ${rotuloMes(pFim)}`
    if (pIni) return `a partir de ${rotuloMes(pIni)}`
    return `até ${rotuloMes(pFim)}`
  }, [pIni, pFim])

  const limparTudo = () => { setFiltroStatus(null); setMesIni(''); setMesFim('') }
  const corretoraSel = useMemo(() => corretoras.find((c) => c.id === selecionada) ?? null, [corretoras, selecionada])

  // ── Card "Consolidado" (painel direito) dirigido pela seleção de meses ──────
  // Clicar nas barras do "Resultado Mensal" seleciona um ou mais meses; o card
  // consolida (soma) esses meses. As MÉTRICAS PRINCIPAIS do card são as EMITIDAS
  // do recorte, por mês de EMISSÃO (a MESMA base kpisReal/nTomadoresReal dos KPIs
  // do topo e do gráfico), então o card fecha com a barra clicada. O "Prêmio
  // Previsto" é só referência informativa do funil/escopo (pipeline), não emitido.
  const toggleMes = useCallback((mes: string) => {
    setSelecionada(null)   // clicar num mês volta pro consolidado (esconde o dossiê, se aberto)
    setMesesSel((prev) => { const n = new Set(prev); if (n.has(mes)) n.delete(mes); else n.add(mes); return n })
  }, [])
  // Prêmio Previsto (informativo): pipeline do funil/escopo no recorte. Com meses
  // selecionados, os meses viram o recorte (ignoram o slicer pIni/pFim). NÃO é emitido.
  const opsCardFunil = useMemo(
    () => mesesSel.size > 0 ? operacoesEscopo.filter((o) => passaStatus(o) && mesesSel.has(mesDeOperacao(o))) : opsBoard,
    [operacoesEscopo, passaStatus, mesesSel, opsBoard],
  )
  const previstoFunilCard = useMemo(() => opsCardFunil.reduce((s, o) => s + (Number(o.premio_previsto) || 0), 0), [opsCardFunil])
  const cardLabel = useMemo(() => {
    if (mesesSel.size === 0) return periodoLabel
    const ord = [...mesesSel].sort()
    if (ord.length === 1) return rotuloMes(ord[0])
    return `${ord.length} meses (${rotuloMes(ord[0])}…${rotuloMes(ord[ord.length - 1])})`
  }, [mesesSel, periodoLabel])

  // ── Exports (preservados) ──────────────────────────────────────────────────
  async function exportarExcel() {
    setExportando(true)
    try {
      const { utils, writeFile } = await import('xlsx')
      const linhas = ranking.map((r, i) => ({
        '#': i + 1, 'Corretora': r.nome, 'Situação': r.ativa ? 'Ativa' : 'Inativa',
        'Tomadores': r.nTomadores, 'Operações': r.nOperacoes, 'Prêmio Previsto': r.premioTotal, 'LMG': r.lmgTotal,
        'Ticket Médio': r.ticketMedio, 'Participação %': ((r.participacaoPct ?? 0) * 100).toFixed(2), 'Acumulado %': ((r.acumuladoPct ?? 0) * 100).toFixed(2),
      }))
      const ws = utils.json_to_sheet(linhas)
      ws['!cols'] = [{ wch: 4 }, { wch: 32 }, { wch: 10 }, { wch: 11 }, { wch: 11 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 13 }]
      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, 'Ranking Corretoras')
      writeFile(wb, `FAM_Corretoras_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (err) { console.error('Excel corretoras:', err) } finally { setExportando(false) }
  }
  async function abrirPdfGeral() {
    setExportando(true)
    try {
      const kb = kpisDeOperacoes(opsBoard)
      const { url, filename } = await gerarPdfGeral({
        ranking: ranking.map((r) => ({ nome: r.nome, ativa: r.ativa, nTomadores: r.nTomadores, nOperacoes: r.nOperacoes, premioTotal: r.premioTotal, participacaoPct: r.participacaoPct ?? 0 })),
        kpis: { premioTotal: kb.premioTotal, lmgTotal: kb.lmgTotal, nOperacoes: kb.nOperacoes, nTomadores: ranking.reduce((s, r) => s + r.nTomadores, 0), ticketMedio: kb.ticketMedio, taxaMediaPond: kb.taxaMediaPond },
        periodoLabel, chart: null,
      })
      setPreview({ url, filename })
    } catch (err) { console.error('PDF geral:', err) } finally { setExportando(false) }
  }
  const abrirPdfCorretora = useCallback(async (payload: Parameters<typeof gerarPdfCorretora>[0]) => {
    setExportando(true)
    try { const { url, filename } = await gerarPdfCorretora(payload); setPreview({ url, filename }) }
    catch (err) { console.error('PDF corretora:', err) } finally { setExportando(false) }
  }, [])

  const selecionar = (id: string) => { setSelecionada(id); setExpandido(null) }

  // ── Comparativo ────────────────────────────────────────────────────────────
  // Métricas por corretora selecionada (mesma base da ficha: TODAS as operações),
  // já ordenadas por prêmio previsto desc para a maior aparecer primeiro.
  const metricasComp = useMemo(
    () => metricasComparativas([...selCompare], ranking, desfecho).sort((a, b) => b.previsto - a.previsto),
    [selCompare, ranking, desfecho],
  )
  const toggleCompare = (id: string) => setSelCompare((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else if (n.size < 6) n.add(id); return n })
  const toggleGrafico = (k: ExpandKey) => setGraficosSel((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const abrirComparar = () => { setModoComparar((v) => !v); setSelCompare(new Set()) }

  function abrirPreviewHtml(html: string, filename: string) {
    setPreview({ url: URL.createObjectURL(new Blob([html], { type: 'text/html' })), filename })
  }
  async function gerarHtmlComparativo() {
    setGerandoHtml(true)
    try {
      if (compTab === 'corretoras') {
        abrirPreviewHtml(htmlComparativoCorretoras(metricasComp), nomeArquivo('Comparativo_Corretoras'))
      } else {
        const { toPng } = await import('html-to-image')
        const itens: { titulo: string; png: string }[] = []
        for (const g of GRAFICOS_COMP) {
          if (!graficosSel.has(g.key)) continue
          const node = chartRefs.current[g.key]
          if (!node) continue
          const png = await toPng(node, { pixelRatio: 2, backgroundColor: '#0d1424', cacheBust: true })
          itens.push({ titulo: g.label, png })
        }
        if (itens.length) abrirPreviewHtml(htmlComparativoGraficos(itens), nomeArquivo('Comparativo_Graficos'))
      }
    } catch (err) { console.error('Gerar HTML comparativo:', err) } finally { setGerandoHtml(false) }
  }
  // Render compacto de cada gráfico para o comparativo (reusa os componentes do cockpit).
  const renderGraficoComp = (key: ExpandKey) => {
    if (key === 'share') return comPremio.length ? <ShareView ranking={comPremio} /> : <div className="ckp-empty">Sem dados.</div>
    if (key === 'pareto') return paretoData.length ? <ParetoChart data={paretoData} mounted={mounted} vitalFew={vitalFew} metrica={metricaPareto} fmtVal={fmtParetoVal} onSelect={() => {}} numeros={false} /> : <div className="ckp-empty">Sem dados.</div>
    if (key === 'desfecho') return desfecho.length ? <DesfechoView desfecho={desfecho} totais={desfechoTotais} conv={desfechoConv} onSelect={() => {}} /> : <div className="ckp-empty">Sem dados.</div>
    if (key === 'status') return porStatus.length ? <StatusDonut dados={porStatus} /> : <div className="ckp-empty">Sem dados.</div>
    if (key === 'matriz') return matriz.linhas.length ? <MatrizView matriz={matriz} /> : <div className="ckp-empty">Sem dados.</div>
    return null
  }

  // ── Relatório em HTML (padrão = tela inicial) ──────────────────────────────
  // Cada gráfico é renderizado num container OCULTO de largura fixa e capturado
  // em PNG (mesmo caminho do comparativo). KPIs e Ranking vão como dados/tabela.
  const toggleFig = (k: RelKey) => setFigSel((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  // Reordenar (▲▼) e dimensionar (meia/inteira) os gráficos do relatório.
  const moverFig = (k: RelKey, dir: -1 | 1) => setFigOrdem((prev) => {
    const i = prev.indexOf(k); const j = i + dir
    if (i < 0 || j < 0 || j >= prev.length) return prev
    const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n
  })
  const renderRelFig = (key: RelKey) => {
    if (key === 'mensal') return <ResultadoMensalGraf mounted={mounted} serie={serieMensal} temPeriodo={!!(pIni || pFim)} noPeriodo={noPeriodo} taxaPeriodo={taxaPeriodoGraf} mesesSel={mesesSel} onToggleMes={() => {}} />
    if (key === 'share') return comPremio.length ? <ShareView ranking={comPremio} /> : <div className="ckp-empty">Sem dados.</div>
    if (key === 'pareto') return paretoData.length ? <ParetoChart data={paretoData} mounted={mounted} vitalFew={vitalFew} metrica={metricaPareto} fmtVal={fmtParetoVal} onSelect={() => {}} numeros={false} /> : <div className="ckp-empty">Sem dados.</div>
    if (key === 'desfecho') return desfecho.length ? <DesfechoView desfecho={desfecho} totais={desfechoTotais} conv={desfechoConv} onSelect={() => {}} /> : <div className="ckp-empty">Sem dados.</div>
    if (key === 'movers') return <MoversView desfecho={desfecho} />
    if (key === 'status') return porStatus.length ? <StatusDonut dados={porStatus} /> : <div className="ckp-empty">Sem dados.</div>
    if (key === 'matriz') return matriz.linhas.length ? <MatrizView matriz={matriz} /> : <div className="ckp-empty">Sem dados.</div>
    return null
  }
  async function gerarRelatorioHtml() {
    setGerandoRelatorio(true)
    try {
      // folga p/ o recharts (Resultado Mensal/Pareto) medir a largura e pintar
      // antes da captura — senão o PNG pode sair em branco na 1ª geração.
      await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 260)))
      const { toPng } = await import('html-to-image')
      const figLabel = new Map(RELATORIO_FIGS.map((f) => [f.key, f.label]))
      const figuras: { titulo: string; png: string; wide?: boolean }[] = []
      // Iteramos na ORDEM escolhida pelo usuário; o tamanho (meia/inteira) vem de figWide.
      for (const key of figOrdem) {
        if (!figSel.has(key)) continue
        const node = reportRefs.current[key]
        if (!node) continue
        const png = await toPng(node, { pixelRatio: 2, backgroundColor: '#0d1424', cacheBust: true })
        figuras.push({ titulo: figLabel.get(key) ?? key, png, wide: figWide[key] })
      }
      const kpis = [
        { label: 'Prêmio Realizado', valor: kpiBRL(kpisReal.premioTotal), sub: 'operações emitidas' },
        { label: 'LMG (exposição)', valor: kpiBRL(kpisReal.lmgTotal), sub: 'teto 80M por operação' },
        { label: 'Operações', valor: String(kpisReal.nOperacoes), sub: 'emitidas' },
        { label: 'Tomadores', valor: String(nTomadoresReal), sub: 'com emissão' },
        { label: 'Taxa Média Pond.', valor: fmtPercent(kpisReal.taxaMediaPond / 100), sub: 'min(LMG,80M) × vigência' },
      ]
      // Ranking: por padrão só corretoras COM operações no recorte (evita listão de
      // zeros); "Todas" traz o book inteiro. Mantém a mesma base da tela p/ os números baterem.
      const baseRank = relRankTodas ? ranking : ranking.filter((r) => r.nOperacoes > 0)
      const rankingLinhas = secRanking
        ? baseRank.map((r) => ({ nome: r.nome, nOperacoes: r.nOperacoes, premio: r.premioTotal, participacao: r.participacaoPct ?? 0, ativa: r.ativa }))
        : undefined
      // Legenda = período do card (respeita meses clicados, bate com os KPIs) + escopo.
      const legenda = `${cardLabel} · escopo ${escopoStatus === 'carteira' ? 'Carteira' : 'Funil'}`
      const html = htmlRelatorioPainel({ periodoLabel: legenda, kpis, ranking: rankingLinhas, figuras })
      abrirPreviewHtml(html, nomeArquivo('Painel_Corretoras'))
      setRelatorioAberto(false)
    } catch (err) { console.error('Gerar relatório:', err) } finally { setGerandoRelatorio(false) }
  }

  if (carregando) return <div className="ckp"><div style={{ textAlign: 'center', padding: 80, color: TICK }}>Carregando cockpit de corretoras…</div></div>

  const totalOps = rankingOrdenado.reduce((s, r) => s + r.nOperacoes, 0)
  const totalPrem = rankingOrdenado.reduce((s, r) => s + r.premioTotal, 0)

  return (
    <div className="ckp">
      <div className="ckp-shell">
        {/* ── HEADER ── */}
        <header className="ckp-glass ckp-top">
          <div className="ckp-brand">
            <div className="ckp-logo">◆</div>
            <div>
              <div className="ckp-brand-title">Inteligência de Corretoras</div>
              <div className="ckp-brand-sub">Cockpit executivo · visão por mês</div>
            </div>
          </div>
          <div className="ckp-actions">
            <button className="ckp-btn" onClick={exportarExcel} disabled={exportando || ranking.length === 0}>⬇ Excel</button>
            <button className="ckp-btn" onClick={abrirPdfGeral} disabled={exportando || ranking.length === 0}>📄 PDF Geral</button>
            <button className="ckp-btn ckp-btn-gold" onClick={() => setRelatorioAberto(true)} disabled={ranking.length === 0} title="Escolher KPIs e gráficos e gerar um HTML (imprimir/PDF) para a diretoria">📊 Relatório</button>
            <button className={`ckp-btn ckp-btn-ghost${mostrarPersonalizar ? ' on' : ''}`} onClick={() => setMostrarPersonalizar((v) => !v)}>⚙ Personalizar</button>
            <button className={`ckp-btn ckp-btn-ghost${modoComparar ? ' on' : ''}`} onClick={abrirComparar} title="Selecione corretoras na lista para comparar lado a lado">⚖ Comparar</button>
            {modoComparar && <button className="ckp-btn ckp-btn-gold" disabled={selCompare.size < 2} onClick={() => { setCompTab('corretoras'); setComparativoAberto(true) }}>Ver comparativo ({selCompare.size})</button>}
            <button className="ckp-btn ckp-btn-gold" onClick={() => onNovaCorretora?.()}>+ Nova Corretora</button>
          </div>
        </header>

        {/* Filtros de Período e Escopo saíram desta barra para ganhar espaço vertical:
            Período foi para "Personalizar"; Escopo virou botão no card Dossiê Consolidado. */}

        {/* ── CATÁLOGO (Personalizar): Período + Monte sua tela ── */}
        {mostrarPersonalizar && (
          <div className="ckp-catalog">
            <span className="ckp-cat-lead">📅 Período</span>
            <label className="ckp-field"><span className="ckp-field-lab">Mês de</span>
              <select className="ckp-select" value={mesIni} onChange={(e) => setMesIni(e.target.value)}>
                <option value="">Início</option>{meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
              </select></label>
            <label className="ckp-field"><span className="ckp-field-lab">até</span>
              <select className="ckp-select" value={mesFim} onChange={(e) => setMesFim(e.target.value)}>
                <option value="">Fim</option>{meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
              </select></label>
            {(pIni || pFim) && <button className="ckp-btn" onClick={limparTudo}>Limpar período</button>}
            <span className="ckp-cat-div" />
            <span className="ckp-cat-lead">✦ Monte sua tela</span>
            {(Object.keys(CARDS_LABEL) as CardKey[]).map((k) => (
              <button key={k} type="button" className={`ckp-sw-item${cards[k] ? ' on' : ''}`} onClick={() => toggleCard(k)}>
                <span className="ckp-sw" />{CARDS_LABEL[k]}{CARDS_NOVO[k] && <span className="ckp-cat-tag">novo</span>}
              </button>
            ))}
          </div>
        )}

        {/* ── CHIP de período ativo (visível mesmo com o Personalizar fechado) ── */}
        {(pIni || pFim) && (
          <div className="ckp-chips">
            <span style={{ fontSize: 12, fontWeight: 700, color: TICK }}>Período:</span>
            <ChipDark label={periodoLabel} onClear={() => { setMesIni(''); setMesFim('') }} />
          </div>
        )}

        {/* ── KPIs ── */}
        <div className="ckp-kpis">
          <KpiDark wide ico="✅" label="Prêmio Realizado" valor={kpiBRL(kpisReal.premioTotal)} sub="operações emitidas" delta={deltaReal.variacao} spark={sparkReal} />
          <KpiDark ico="🛡️" label="LMG (exposição)" valor={kpiBRL(kpisReal.lmgTotal)} sub="emitidas · teto 80M/op" spark={seriesMiniReal.lmg} />
          <KpiDark ico="📄" label="Operações" valor={String(kpisReal.nOperacoes)} sub="emitidas" spark={seriesMiniReal.operacoes} />
          <KpiDark ico="🤝" label="Tomadores" valor={String(nTomadoresReal)} sub="com emissão" spark={seriesMiniReal.tomadores} />
          <KpiDark ico="📈" label="Taxa Média Pond." valor={fmtPercent(kpisReal.taxaMediaPond / 100)} sub="min(LMG,80M)×vig." spark={seriesMiniReal.taxa} onInfo={() => setMostrarRacionalPond(v => !v)} infoAtivo={mostrarRacionalPond} />
        </div>
        {mostrarRacionalPond && (
          <div style={{ margin: '0 0 4px' }}>
            <RacionalTaxaBox info={TAXA_PONDERADA_INFO} tema="escuro" />
          </div>
        )}

        {/* ── MAIN ── */}
        <div className="ckp-main">
          {/* ESQUERDA */}
          <div className="ckp-left">
            {cards.mensal && (
              <section className="ckp-glass ckp-card">
                <div className="ckp-card-head">
                  <div className="ckp-title"><span className="ckp-title-bar" />Resultado Mensal<span className="ckp-sub">prêmio &amp; taxa do mês · emitidas · {periodoLabel}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className={`ckp-exp${mostrarFormula ? ' on' : ''}`} title="Como a taxa do mês é calculada" onClick={() => setMostrarFormula((v) => !v)}>ⓘ</button>
                    <div className="ckp-seg">
                      <button className={mensalView === 'graf' ? 'on' : ''} onClick={() => setMensalView('graf')}>Gráfico</button>
                      <button className={mensalView === 'tab' ? 'on' : ''} onClick={() => setMensalView('tab')}>Tabela</button>
                    </div>
                  </div>
                </div>
                {mostrarFormula && (
                  <div className="ckp-formula-box">
                    <div className="ckp-formula-tt">Taxa do Mês (competência)</div>
                    <div>{TAXA_MENSAL_INFO.texto}</div>
                    <code>{TAXA_MENSAL_INFO.formula}</code>
                  </div>
                )}
                {mensalView === 'graf' ? (
                  <>
                    <ResultadoMensalGraf mounted={mounted} serie={serieMensal} temPeriodo={!!(pIni || pFim)} noPeriodo={noPeriodo}
                      taxaPeriodo={taxaPeriodoGraf} mesesSel={mesesSel} onToggleMes={toggleMes} />
                    <div className="ckp-cap" style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ flex: 1, minWidth: 220 }}>Barras: <b>prêmio emitido</b> por mês. Linha dourada: <b>taxa do mês</b> (competência, sem prazo · eixo dir.); o tracejado é a taxa do período ({fmtTaxaPP(taxaPeriodoGraf)}). <b>Clique nas barras</b> para consolidar o(s) mês(es) no card à direita.</span>
                      {mesesSel.size > 0 && <button type="button" className="ckp-btn" style={{ padding: '4px 11px', fontSize: 12 }} onClick={() => setMesesSel(new Set())}>✕ limpar {mesesSel.size} mês(es)</button>}
                    </div>
                  </>
                ) : (
                  <TabelaMensal serie={serieMensal} taxaPeriodo={taxaTotalTabela} />
                )}
              </section>
            )}

            {cards.grade && (
              <section className="ckp-glass ckp-card ckp-card-rank">
                <div className="ckp-card-head">
                  <div className="ckp-title"><span className="ckp-title-bar" style={{ background: BLUE }} />Ranking de Corretoras<span className="ckp-sub">clique → dossiê à direita</span></div>
                  <input className="fam-input" placeholder="Buscar corretora ou CNPJ…" value={busca} onChange={(e) => setBusca(e.target.value)}
                    style={{ height: 34, minWidth: 200, width: 'auto', fontSize: 13, background: 'rgba(255,255,255,.06)', color: '#eaf0fb', border: '1px solid rgba(255,255,255,.12)' }} />
                </div>
                <div className="ckp-grade-scroll">
                  <table className={`ckp-grade${mostrarTodas ? ' show-all' : ''}`}>
                    <thead>
                      <tr>
                        <th className="lft" onClick={() => handleSort('nome')}>Corretora{sortIcon('nome')}</th>
                        <th onClick={() => handleSort('nOperacoes')}>Operações{sortIcon('nOperacoes')}</th>
                        <th onClick={() => handleSort('premio')}>Prêmio{sortIcon('premio')}</th>
                        <th onClick={() => handleSort('participacao')}>Participação{sortIcon('participacao')}</th>
                        <th>Tend.</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingOrdenado.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: 26, color: TICK }}>Nenhuma corretora encontrada.</td></tr>
                      ) : rankingOrdenado.map((r, idx) => {
                        const spark = serieMensalAlinhada(operacoesEscopo.filter((o) => o.corretora_id === r.id && (!filtroStatus || o.status === filtroStatus)), meses)
                        const sel = selecionada === r.id
                        return (
                          <tr key={r.id} className={`${idx >= VIS_GRADE ? 'row-extra' : ''}${sel ? ' sel' : ''}${modoComparar && selCompare.has(r.id) ? ' comp-sel' : ''}`} onClick={() => (modoComparar ? toggleCompare(r.id) : selecionar(r.id))}>
                            <td>
                              <div className="ckp-cname">
                                {modoComparar && <input type="checkbox" className="ckp-comp-chk" checked={selCompare.has(r.id)} readOnly />}
                                <span className="ckp-cbadge" style={{ background: azulBadge(idx, rankingOrdenado.length) }}>{initials(r.nome)}</span>
                                <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{r.nome}</span>
                                {!r.ativa && <span className="ckp-pill off">inativa</span>}
                                {ids8020.has(r.id) && <span className="ckp-pill" style={{ background: 'rgba(232,184,75,.16)', color: GOLD }} title="Concentra 80% do prêmio">80/20</span>}
                              </div>
                            </td>
                            <td>{r.nOperacoes}</td>
                            <td>
                              <div className="ckp-premcell">
                                <span className="ckp-prembar"><i style={{ width: `${(r.premioTotal / maxPremioRank) * 100}%` }} /></span>
                                <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{kpiBRL(r.premioTotal)}</span>
                              </div>
                            </td>
                            <td>
                              <div className="ckp-partcell">
                                <span style={{ fontWeight: 700, color: BLUE_BR }}>{fmtPercent(r.participacaoPct ?? 0)}</span>
                                <span className="ckp-partbar"><i style={{ width: `${((r.participacaoPct ?? 0) / maxPartRank) * 100}%` }} /></span>
                              </div>
                            </td>
                            <td><Sparkline valores={spark} cor={r.ativa ? BLUE_BR : '#6f7d9b'} /></td>
                            <td><span className={`ckp-pill ${r.ativa ? 'on' : 'off'}`}>{r.ativa ? 'Ativa' : 'Inativa'}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="lft"><span className="ckp-tot-sig">Σ</span>TOTAL · {rankingOrdenado.length} corretoras</td>
                        <td>{totalOps}</td>
                        <td className="ckp-tot-prem">{kpiBRL(totalPrem)}</td>
                        <td>100%</td>
                        <td></td><td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {rankingOrdenado.length > VIS_GRADE && (
                  <div className="ckp-more">
                    <button className="ckp-btn" onClick={() => setMostrarTodas((v) => !v)}>
                      {mostrarTodas ? '▴ Mostrar só as primeiras' : `▾ Ver todas as ${rankingOrdenado.length} corretoras`}
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* DIREITA (fixa) */}
          <aside className="ckp-right">
            <div className="ckp-right-inner">
              {/* A direita mostra SEMPRE o consolidado; a ficha da corretora abre em TELA CHEIA (overlay, ver abaixo). */}
              <>
                  {/* ── DOSSIÊ FAM — painel futurista (glass + neon). Soma toda a FAM,
                         respeitando o escopo (funil / carteira) e a seleção de meses. ── */}
                  <div className="ckp-fam">
                    <div className="ckp-fam-glow" />
                    <div className="ckp-fam-head">
                      <div className="ckp-fam-orb">◆</div>
                      <div className="ckp-fam-id">
                        <div className="ckp-fam-name">FAM Seguradora</div>
                        <div className="ckp-fam-sub">Dossiê Consolidado</div>
                      </div>
                      <div className="ckp-seg ckp-fam-scope" title="Escopo dos dados. Funil ativo = mesmo recorte de Operações (exclui Emitido, Perdido e Recusado). Carteira = todas as operações ativas.">
                        <button type="button" className={escopoStatus === 'funil' ? 'on' : ''} onClick={() => setEscopoStatus('funil')}>Funil</button>
                        <button type="button" className={escopoStatus === 'carteira' ? 'on' : ''} onClick={() => setEscopoStatus('carteira')}>Carteira</button>
                      </div>
                    </div>
                    <div className="ckp-fam-period">{cardLabel}</div>
                    <div className="ckp-fam-grid">
                      <div className="ckp-fam-cell green"><span className="l">Prêmio Emitido</span><span className="v">{kpiBRL(kpisReal.premioTotal)}</span></div>
                      <div className="ckp-fam-cell" title="Pipeline do escopo selecionado (Funil/Carteira). Não é resultado emitido."><span className="l">Prêmio Previsto · funil</span><span className="v">{kpiBRL(previstoFunilCard)}</span></div>
                      <div className="ckp-fam-cell"><span className="l">LMG · exposição</span><span className="v">{kpiBRL(kpisReal.lmgTotal)}</span></div>
                      <div className="ckp-fam-cell"><span className="l">Operações</span><span className="v">{kpisReal.nOperacoes}</span></div>
                      <div className="ckp-fam-cell"><span className="l">Tomadores</span><span className="v">{nTomadoresReal}</span></div>
                      <div className="ckp-fam-cell"><span className="l">Taxa Méd. Pond.</span><span className="v">{fmtPercent(kpisReal.taxaMediaPond / 100)}</span></div>
                    </div>
                    {mesesSel.size > 0 && <button type="button" className="ckp-fam-clear" onClick={() => setMesesSel(new Set())}>← ver todos os períodos</button>}
                  </div>

                  {cards.share && (
                    <div className="ckp-glass ckp-panel">
                      <div className="ckp-panel-title">Participação no prêmio<div className="ckp-pt-r"><span className="ckp-tag">share do todo</span><button className="ckp-exp" title="Expandir" onClick={() => setExpandido('share')}>⤢</button></div></div>
                      <ShareView ranking={comPremio} />
                    </div>
                  )}

                  {cards.pareto && (
                    <div className="ckp-glass ckp-panel">
                      <div className="ckp-panel-title">Concentração 80/20<div className="ckp-pt-r"><span className="ckp-tag">Pareto</span><button className={`ckp-exp${paretoNumeros ? ' on' : ''}`} title="Mostrar números no gráfico" onClick={() => setParetoNumeros((v) => !v)}>#</button><button className="ckp-exp" title="Expandir" onClick={() => setExpandido('pareto')}>⤢</button></div></div>
                      {paretoData.length === 0 ? <div className="ckp-empty">Sem dados no escopo.</div> : <ParetoChart data={paretoData} mounted={mounted} vitalFew={vitalFew} metrica={metricaPareto} fmtVal={fmtParetoVal} onSelect={selecionar} numeros={paretoNumeros} />}
                    </div>
                  )}

                  {cards.desfecho && (
                    <div className="ckp-glass ckp-panel">
                      <div className="ckp-panel-title">Desfecho por corretora<div className="ckp-pt-r"><span className="ckp-tag">que negócio traz</span><button className="ckp-exp" title="Expandir" onClick={() => setExpandido('desfecho')}>⤢</button></div></div>
                      {desfecho.length === 0 ? <div className="ckp-empty">Sem dados no período.</div> : <DesfechoView desfecho={desfecho} totais={desfechoTotais} conv={desfechoConv} onSelect={selecionar} />}
                    </div>
                  )}

                  {cards.movers && (
                    <div className="ckp-glass ckp-panel">
                      <div className="ckp-panel-title">Maiores em prêmio emitido<span className="ckp-tag">carteira</span></div>
                      <MoversView desfecho={desfecho} onSelect={selecionar} />
                    </div>
                  )}

                  {cards.status && (
                    <div className="ckp-glass ckp-panel">
                      <div className="ckp-panel-title">Mix por status<div className="ckp-pt-r"><span className="ckp-tag">{porStatus.reduce((s, d) => s + d.value, 0)} op</span><button className="ckp-exp" title="Expandir" onClick={() => setExpandido('status')}>⤢</button></div></div>
                      {porStatus.length === 0 ? <div className="ckp-empty">Sem dados no escopo.</div> : <StatusDonut dados={porStatus} />}
                    </div>
                  )}

                  {cards.matriz && (
                    <div className="ckp-glass ckp-panel">
                      <div className="ckp-panel-title">Matriz Corretora×Mês<div className="ckp-pt-r"><span className="ckp-tag">heatmap</span><button className="ckp-exp" title="Expandir" onClick={() => setExpandido('matriz')}>⤢</button></div></div>
                      {matriz.linhas.length === 0 ? <div className="ckp-empty">Sem histórico com datas.</div> : <MatrizView matriz={matriz} />}
                    </div>
                  )}
                </>
            </div>
          </aside>
        </div>
      </div>

      {/* ── FICHA DA CORRETORA (tela cheia) ── */}
      {corretoraSel && (
        <div className="ckp-ficha-ov" onClick={() => setSelecionada(null)}>
          <div className="ckp-ficha-box" onClick={(e) => e.stopPropagation()}>
            <div className="ckp-ficha-body">
              <DossieCorretora full corretora={corretoraSel} corretoras={corretoras} tomadores={tomadores} operacoes={operacoes}
                statusFluxo={statusFluxo} onVoltar={() => setSelecionada(null)} onEditar={() => onAbrirCorretora?.(corretoraSel.id)}
                onPdf={abrirPdfCorretora} exportando={exportando} />
            </div>
          </div>
        </div>
      )}

      {/* ── COMPARATIVO (corretoras / gráficos lado a lado → HTML) ── */}
      {comparativoAberto && (
        <div className="ckp-ficha-ov" onClick={() => setComparativoAberto(false)}>
          <div className="ckp-ficha-box" onClick={(e) => e.stopPropagation()}>
            <div className="ckp-comp-head">
              <div className="ckp-seg">
                <button className={compTab === 'corretoras' ? 'on' : ''} onClick={() => setCompTab('corretoras')}>Corretoras</button>
                <button className={compTab === 'graficos' ? 'on' : ''} onClick={() => setCompTab('graficos')}>Gráficos</button>
              </div>
              <div style={{ flex: 1 }} />
              <button className="ckp-btn ckp-btn-gold" disabled={gerandoHtml || (compTab === 'corretoras' ? metricasComp.length < 1 : graficosSel.size < 1)} onClick={gerarHtmlComparativo}>{gerandoHtml ? 'Gerando…' : '⬇ Gerar HTML'}</button>
              <button className="ckp-modal-x" onClick={() => setComparativoAberto(false)}>✕</button>
            </div>
            <div className="ckp-ficha-body">
              {compTab === 'corretoras' ? (
                metricasComp.length < 2 ? (
                  <div className="ckp-empty">Selecione ao menos 2 corretoras na lista (botão “⚖ Comparar”, marque as caixinhas).</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="ckp-comp-tbl">
                      <thead><tr><th className="lab">Métrica</th>{metricasComp.map((m) => <th key={m.id}>{m.nome}</th>)}</tr></thead>
                      <tbody>
                        {LINHAS_COMPARATIVO.map((lin) => {
                          const vals = metricasComp.map((m) => lin.valor(m))
                          const max = Math.max(0, ...vals) || 1
                          return (
                            <tr key={lin.label}>
                              <td className="lab">{lin.label}</td>
                              {metricasComp.map((m, i) => {
                                const v = vals[i]; const best = v === max && v > 0 && metricasComp.length > 1
                                return (
                                  <td key={m.id} className={best ? 'best' : ''}>
                                    <div className="ckp-comp-cell">
                                      <span className="v">{lin.fmt(v)}</span>
                                      {lin.bar && <span className="ckp-comp-bar"><i style={{ width: `${(v / max) * 100}%` }} /></span>}
                                    </div>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <>
                  <div className="ckp-comp-pick">
                    {GRAFICOS_COMP.map((g) => (
                      <button key={g.key} type="button" className={`ckp-sw-item${graficosSel.has(g.key) ? ' on' : ''}`} onClick={() => toggleGrafico(g.key)}>
                        <span className="ckp-sw" />{g.label}
                      </button>
                    ))}
                  </div>
                  {graficosSel.size === 0 ? (
                    <div className="ckp-empty">Escolha um ou mais gráficos acima.</div>
                  ) : (
                    <div className="ckp-comp-figs">
                      {GRAFICOS_COMP.filter((g) => graficosSel.has(g.key)).map((g) => (
                        <div key={g.key} className="ckp-comp-fig">
                          <div className="ckp-comp-fig-tt">{g.label}</div>
                          <div ref={(el) => { chartRefs.current[g.key] = el }}>{renderGraficoComp(g.key)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── RELATÓRIO EM HTML (seleção → preview/baixar/imprimir) ── */}
      {relatorioAberto && (
        <div className="ckp-ficha-ov" onClick={() => setRelatorioAberto(false)}>
          <div className="ckp-ficha-box" style={{ height: 'auto', maxHeight: '92vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="ckp-comp-head">
              <div className="ckp-title" style={{ fontSize: 16 }}><span className="ckp-title-bar" />Gerar relatório em HTML</div>
              <div style={{ flex: 1 }} />
              <button className="ckp-btn ckp-btn-gold" disabled={gerandoRelatorio} onClick={gerarRelatorioHtml}>{gerandoRelatorio ? 'Gerando…' : '⬇ Gerar HTML'}</button>
              <button className="ckp-modal-x" onClick={() => setRelatorioAberto(false)}>✕</button>
            </div>
            <div className="ckp-ficha-body">
              <div className="ckp-cap" style={{ marginTop: 0, marginBottom: 14 }}>
                Escolha o que entra no relatório para a diretoria. Os <b>KPIs do topo</b> e o período entram sempre. O padrão já vem com a <b>tela inicial</b> de Corretoras; ao gerar, abre a pré-visualização com <b>Baixar</b> e <b>Imprimir</b> (PDF).
              </div>
              {/* Ranking: liga/desliga + escopo da lista (só com operações vs. todas). */}
              <div className="ckp-rel-row" style={{ marginBottom: 6 }}>
                <button type="button" className={`ckp-sw-item${secRanking ? ' on' : ''}`} onClick={() => setSecRanking((v) => !v)}>
                  <span className="ckp-sw" />Ranking de Corretoras
                </button>
                {secRanking && (
                  <div className="ckp-seg" style={{ marginLeft: 'auto' }} title="Por padrão o Ranking traz só as corretoras com operações no recorte; 'Todas' inclui as sem operação.">
                    <button className={!relRankTodas ? 'on' : ''} onClick={() => setRelRankTodas(false)}>Só com operações</button>
                    <button className={relRankTodas ? 'on' : ''} onClick={() => setRelRankTodas(true)}>Todas</button>
                  </div>
                )}
              </div>

              {/* Gráficos: ligar/desligar + reordenar (▲▼) + dimensionar (meia/inteira). */}
              <div className="ckp-cap" style={{ margin: '14px 0 8px' }}>Gráficos: ligue/desligue, use <b>▲▼</b> para reordenar e escolha o <b>tamanho</b> (meia largura ou largura inteira). A ordem e o tamanho valem no relatório gerado.</div>
              <div className="ckp-rel-figs">
                {figOrdem.map((key, idx) => {
                  const f = RELATORIO_FIGS.find((x) => x.key === key)
                  if (!f) return null
                  const on = figSel.has(key)
                  return (
                    <div key={key} className={`ckp-rel-fig${on ? ' on' : ''}`}>
                      <div className="ckp-rel-moves">
                        <button type="button" className="ckp-rel-move" disabled={idx === 0} onClick={() => moverFig(key, -1)} title="Subir" aria-label="Subir">▲</button>
                        <button type="button" className="ckp-rel-move" disabled={idx === figOrdem.length - 1} onClick={() => moverFig(key, 1)} title="Descer" aria-label="Descer">▼</button>
                      </div>
                      <button type="button" className={`ckp-sw-item${on ? ' on' : ''}`} style={{ flex: 1, minWidth: 0 }} onClick={() => toggleFig(key)}>
                        <span className="ckp-sw" /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
                      </button>
                      <div className={`ckp-seg${on ? '' : ' ckp-seg-off'}`} title="Tamanho do gráfico no relatório">
                        <button className={!figWide[key] ? 'on' : ''} disabled={!on} onClick={() => setFigWide((p) => ({ ...p, [key]: false }))}>Meia</button>
                        <button className={figWide[key] ? 'on' : ''} disabled={!on} onClick={() => setFigWide((p) => ({ ...p, [key]: true }))}>Inteira</button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button type="button" className="ckp-btn" onClick={() => { setSecRanking(true); setFigSel(new Set(RELATORIO_FIGS.map((f) => f.key))) }}>Marcar todos</button>
                <button type="button" className="ckp-btn" onClick={() => {
                  setSecRanking(true); setRelRankTodas(false); setFigSel(new Set(RELATORIO_FIG_PADRAO))
                  setFigOrdem(RELATORIO_FIGS.map((f) => f.key))
                  setFigWide(Object.fromEntries(RELATORIO_FIGS.map((f) => [f.key, !!f.wide])) as Record<RelKey, boolean>)
                }}>Restaurar padrão (tela inicial)</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Container OCULTO: monta os gráficos em largura fixa só para a captura em PNG. */}
      {relatorioAberto && (
        <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, width: 980, zIndex: -1, pointerEvents: 'none' }}>
          {RELATORIO_FIGS.map((f) => (
            <div key={f.key} ref={(el) => { reportRefs.current[f.key] = el }} style={{ width: 980, background: '#0d1424', padding: 16, marginBottom: 24, borderRadius: 12 }}>
              {renderRelFig(f.key)}
            </div>
          ))}
        </div>
      )}

      {/* ── MODAL EXPANDIR ── */}
      {expandido && (
        <div className="ckp-modal-ov" onClick={() => { setExpandido(null); setZoom(1) }}>
          <div className="ckp-modal-box ckp-glass" onClick={(e) => e.stopPropagation()}>
            <div className="ckp-modal-h">
              <div className="ckp-title" style={{ fontSize: 17 }}><span className="ckp-title-bar" />{EXPAND_TITULO[expandido]}</div>
              <div className="ckp-zoom" title="Zoom da página">
                <button className="ckp-zoom-b" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))} disabled={zoom <= 0.6} title="Diminuir">−</button>
                <button className="ckp-zoom-pct" onClick={() => setZoom(1)} title="Voltar para 100%">{Math.round(zoom * 100)}%</button>
                <button className="ckp-zoom-b" onClick={() => setZoom((z) => Math.min(2, +(z + 0.15).toFixed(2)))} disabled={zoom >= 2} title="Aumentar">+</button>
              </div>
              <button className="ckp-modal-x" onClick={() => { setExpandido(null); setZoom(1) }}>✕</button>
            </div>
            <div className="ckp-modal-body">
              <div className="ckp-zoomable" style={{ ['--zoom']: String(zoom) } as CSSProperties}>
              {expandido === 'share' && <ShareView ranking={comPremio} big />}
              {expandido === 'pareto' && (
                paretoData.length === 0 ? <div className="ckp-empty">Sem dados no escopo.</div> : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#aab7d0', fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={paretoNumeros} onChange={(e) => setParetoNumeros(e.target.checked)} /> Números no gráfico
                      </label>
                      <select className="ckp-select" value={metricaPareto} onChange={(e) => setMetricaPareto(e.target.value as MetricaPareto)} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 10, padding: '6px 10px' }}>
                        <option value="premio">Prêmio</option><option value="tomadores">Nº de Tomadores</option><option value="operacoes">Nº de Operações</option>
                      </select>
                    </div>
                    <div className="ckp-cap" style={{ marginTop: 0, marginBottom: 12 }}><b>{vitalFew}</b> corretora(s), os <b>{fmtPercent(vitalPct)}</b> de {paretoData.length}, concentram <b>80%</b> {metricaTxt}. É a “minoria vital” (princípio de Pareto 80/20).</div>
                    <ParetoChart data={paretoData} mounted={mounted} vitalFew={vitalFew} metrica={metricaPareto} fmtVal={fmtParetoVal} onSelect={selecionar} numeros={paretoNumeros} big />
                  </>
                )
              )}
              {expandido === 'desfecho' && <DesfechoView desfecho={desfecho} totais={desfechoTotais} conv={desfechoConv} onSelect={selecionar} big />}
              {expandido === 'status' && <StatusDonut dados={porStatus} big />}
              {expandido === 'matriz' && <MatrizView matriz={matriz} big />}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PRÉ-VISUALIZAÇÃO DO PDF (preservado) ── */}
      {preview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,14,26,.72)', zIndex: 9999, display: 'flex', flexDirection: 'column', padding: '2vh 2vw' }} onClick={() => setPreview(null)}>
          <div style={{ background: '#0a1628', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, boxShadow: '0 20px 60px rgba(0,0,0,.5)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', color: '#fff', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 6, height: 20, borderRadius: 4, background: GOLD }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>FAM SEGURADORA · Pré-visualização do Relatório</div>
                  <div style={{ fontSize: 11.5, color: '#a9c4e8' }}>{preview.filename}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {preview.filename.toLowerCase().endsWith('.html') && (
                  <button className="btn-secondary" style={{ background: 'transparent', color: '#fff', borderColor: '#3a5a86' }} onClick={() => { const fr = document.getElementById('ckp-report-frame') as HTMLIFrameElement | null; fr?.contentWindow?.focus(); fr?.contentWindow?.print() }}>🖨 Imprimir</button>
                )}
                <a href={preview.url} download={preview.filename} className="btn-primary" style={{ textDecoration: 'none' }}>⬇ Baixar arquivo</a>
                <button className="btn-secondary" style={{ background: 'transparent', color: '#fff', borderColor: '#3a5a86' }} onClick={() => setPreview(null)}>✕ Fechar</button>
              </div>
            </div>
            <iframe id="ckp-report-frame" src={preview.url} title="Pré-visualização do relatório" style={{ flex: 1, width: '100%', border: 'none', background: '#525659' }} />
          </div>
        </div>
      )}
    </div>
  )
}

const EXPAND_TITULO: Record<ExpandKey, string> = {
  share: 'Participação no prêmio · share do todo', pareto: 'Concentração 80/20 (Pareto)',
  desfecho: 'Desfecho das operações por corretora · que negócio ela traz', status: 'Mix por status', matriz: 'Matriz Corretora × Mês · prêmio por mês',
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function ChipDark({ label, onClear }: { label: string; onClear: () => void }) {
  return <span className="ckp-chip">{label}<button onClick={onClear} aria-label="Remover filtro">✕</button></span>
}

function KpiDark({ ico, label, valor, sub, delta, spark, wide = false, onInfo, infoAtivo }: {
  ico: string; label: string; valor: string; sub: string; delta?: number | null; spark?: number[]; wide?: boolean; onInfo?: () => void; infoAtivo?: boolean
}) {
  const has = delta != null && isFinite(delta)
  const pos = (delta ?? 0) >= 0
  return (
    <div className={`ckp-kpi ckp-glass${wide ? ' wide' : ''}`}>
      <div className="ckp-k-top">
        <div className="ckp-k-ico">{ico}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {spark && spark.length > 1 && <Sparkline valores={spark} cor={wide ? GOLD : BLUE_BR} largura={90} altura={26} />}
          {onInfo && <button type="button" onClick={onInfo} title="Como calculamos" style={{ width: 22, height: 22, lineHeight: '20px', borderRadius: '50%', border: '1.5px solid rgba(120,160,210,0.5)', background: infoAtivo ? 'rgba(232,184,75,0.2)' : 'rgba(255,255,255,0.06)', color: '#a0c0e8', fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 0, flexShrink: 0 }}>ⓘ</button>}
        </div>
      </div>
      <div className="ckp-k-label">{label}</div>
      <div className="ckp-k-val">{valor}</div>
      <div className="ckp-k-foot">
        {has && <span className={`ckp-k-delta ${pos ? 'up' : 'down'}`}>{pos ? '▲' : '▼'} {fmtPercent(Math.abs(delta as number))}</span>}
        <span className="ckp-k-sub">{sub}</span>
      </div>
    </div>
  )
}

function Sparkline({ valores, cor, largura = 78, altura = 22 }: { valores: number[]; cor: string; largura?: number; altura?: number }) {
  if (valores.length < 2) return <span style={{ fontSize: 11, color: '#516079' }}>·</span>
  const max = Math.max(...valores, 1), min = Math.min(...valores, 0), span = max - min || 1
  const dx = largura / (valores.length - 1)
  const y = (v: number) => altura - 3 - ((v - min) / span) * (altura - 6)
  const pts = valores.map((v, i) => `${i * dx},${y(v)}`).join(' ')
  const ult = valores.length - 1
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={cor} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ult * dx} cy={y(valores[ult])} r={2.6} fill={cor} />
    </svg>
  )
}

function TooltipMensal({ active, payload, label }: { active?: boolean; payload?: { payload: { premio: number; qtd: number; taxa?: number } }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div style={{ ...tooltipDark, padding: '8px 12px' }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>{label}</div>
      <div style={{ color: BLUE_BR, fontWeight: 700 }}>{fmtMoeda(p.premio)}</div>
      <div style={{ color: GOLD, fontWeight: 700 }}>{fmtTaxaPP(p.taxa ?? 0)} <span style={{ color: TICK, fontWeight: 500 }}>taxa méd. mensal</span></div>
      <div style={{ color: TICK }}>{p.qtd} operação(ões)</div>
    </div>
  )
}

function ResultadoMensalGraf({ mounted, serie, temPeriodo, noPeriodo, taxaPeriodo, mesesSel, onToggleMes }: {
  mounted: boolean; serie: ReturnType<typeof serieMensalPremioTaxa>; temPeriodo: boolean; noPeriodo: (m: string) => boolean
  taxaPeriodo: number; mesesSel: Set<string>; onToggleMes: (mes: string) => void
}) {
  if (!mounted) return <div className="ckp-empty">Carregando gráfico…</div>
  if (serie.length === 0) return <div className="ckp-empty">Sem histórico com datas.</div>
  const anySel = mesesSel.size > 0
  return (
    <div className="ckp-mensal-graf">
    <ResponsiveContainer width="100%" height={252}>
      <ComposedChart data={serie} margin={{ left: 4, right: 14, top: 16, bottom: 8 }}
        onClick={(state) => { const idx = Number((state as { activeTooltipIndex?: number | string })?.activeTooltipIndex); if (Number.isInteger(idx) && idx >= 0 && idx < serie.length) onToggleMes(serie[idx].mes) }}>
        <defs>
          {/* Sombra sutil sob as barras — dá profundidade no cockpit escuro */}
          <filter id="ckpBarShadow" x="-30%" y="-15%" width="160%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.5" />
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: TICK }} />
        <YAxis yAxisId="l" tickFormatter={(v) => eixoBRL(Number(v))} tick={{ fontSize: 11, fill: TICK }} width={62} />
        <YAxis yAxisId="r" orientation="right" domain={[0, 'auto']} tickFormatter={(v) => fmtTaxaPP(Number(v))} tick={{ fontSize: 10.5, fill: GOLD }} width={50} />
        <Tooltip cursor={{ fill: 'rgba(74,144,208,.08)' }} content={<TooltipMensal />} />
        <Bar yAxisId="l" dataKey="premio" name="Prêmio" radius={[5, 5, 0, 0]} isAnimationActive={false} maxBarSize={46} cursor="pointer">
          {serie.map((p) => {
            const realce = anySel ? mesesSel.has(p.mes) : (temPeriodo && noPeriodo(p.mes))
            const apagar = anySel ? !mesesSel.has(p.mes) : (temPeriodo && !noPeriodo(p.mes))
            return <Cell key={p.mes} fill={realce ? GOLD : NAVY_BAR} fillOpacity={apagar ? 0.35 : 1} filter="url(#ckpBarShadow)" />
          })}
        </Bar>
        {taxaPeriodo > 0 && <ReferenceLine yAxisId="r" y={taxaPeriodo} stroke={GOLD} strokeDasharray="5 4" strokeWidth={1.2} strokeOpacity={0.55} />}
        <Line yAxisId="r" type="monotone" dataKey="taxa" name="Taxa Méd. Mensal" stroke={GOLD} strokeWidth={2.4}
          dot={{ r: 2.6, fill: GOLD, stroke: '#0a1020', strokeWidth: 1 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  )
}

function TabelaMensal({ serie, taxaPeriodo }: { serie: ReturnType<typeof serieMensalPremioTaxa>; taxaPeriodo: number }) {
  if (serie.length === 0) return <div className="ckp-empty">Sem histórico com datas.</div>
  const max = Math.max(1, ...serie.map((m) => m.premio))
  const total = serie.reduce((s, m) => s + m.premio, 0)
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ckp-mtab">
        <thead><tr><th>Mês</th><th className="num">Prêmio</th><th className="m-cell">Volume</th><th className="num">Part. período</th><th className="num">Taxa Méd.</th><th className="num">Operações</th></tr></thead>
        <tbody>
          {serie.map((m) => (
            <tr key={m.mes}>
              <td>{m.label}</td>
              <td className="num">{kpiBRL(m.premio)}</td>
              <td className="m-cell"><div className="ckp-databar" style={{ width: `${(m.premio / max) * 100}%` }} /></td>
              <td className="num">{fmtPercent(total > 0 ? m.premio / total : 0)}</td>
              <td className="num" style={{ color: GOLD }}>{m.taxa > 0 ? fmtTaxaPP(m.taxa) : '—'}</td>
              <td className="num">{m.qtd}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{kpiBRL(total)}</td>
            <td className="m-cell"></td>
            <td className="num">100%</td>
            <td className="num" style={{ color: GOLD }}>{taxaPeriodo > 0 ? fmtTaxaPP(taxaPeriodo) : '—'}</td>
            <td className="num">{serie.reduce((s, m) => s + m.qtd, 0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function ShareView({ ranking, big = false }: { ranking: CorretoraAgg[]; big?: boolean }) {
  if (ranking.length === 0) return <div className="ckp-empty">Sem prêmio no escopo.</div>
  const total = ranking.reduce((s, r) => s + r.premioTotal, 0) || 1
  const ord = [...ranking].sort((a, b) => b.premioTotal - a.premioTotal)
  const n = ord.length
  if (big) {
    const max = Math.max(1, ...ord.map((r) => r.premioTotal))
    let cum = 0, k = 0
    for (const r of ord) { cum += r.premioTotal; k++; if (cum / total >= 0.8) break }
    const somaK = ord.slice(0, k).reduce((s, r) => s + r.premioTotal, 0)
    return (
      <div>
        <div className="ckp-cap" style={{ marginTop: 0, marginBottom: 14 }}>Das <b>{n}</b> corretoras, as <b>{k}</b> primeiras concentram <b>{fmtPercent(somaK / total)}</b> do prêmio ({kpiBRL(somaK)} de {kpiBRL(total)}).</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="ckp-mtab">
            <thead><tr><th>Corretora</th><th className="m-cell">Participação</th><th className="num">%</th><th className="num">Prêmio</th></tr></thead>
            <tbody>
              {ord.map((r, i) => (
                <tr key={r.id}>
                  <td><span className="ckp-sw2" style={{ display: 'inline-block', background: azul(i, n), marginRight: 8, verticalAlign: 'middle' }} />{r.nome}</td>
                  <td className="m-cell"><span style={{ display: 'block', height: 12, borderRadius: 5, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(r.premioTotal / max) * 100}%`, background: azul(i, n), borderRadius: 5 }} /></span></td>
                  <td className="num" style={{ fontSize: 14, fontWeight: 800, color: BLUE_BR }}>{fmtPercent(r.premioTotal / total)}</td>
                  <td className="num" style={{ fontSize: 14, fontWeight: 700 }}>{kpiBRL(r.premioTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>TOTAL · {n} corretoras</td><td className="m-cell"></td><td className="num">100%</td><td className="num">{kpiBRL(total)}</td></tr>
            </tfoot>
          </table>
        </div>
      </div>
    )
  }
  const top = ord.slice(0, 4)
  const restoPct = ord.slice(4).reduce((s, r) => s + r.premioTotal, 0) / total
  return (
    <>
      <div className="ckp-share-bar" title="Cada fatia é uma corretora">{ord.map((r, i) => <i key={r.id} style={{ width: `${(r.premioTotal / total) * 100}%`, background: azul(i, n) }} title={`${r.nome}: ${fmtPercent(r.premioTotal / total)}`} />)}</div>
      <div className="ckp-share-legend">
        {top.map((r, i) => <div key={r.id} className="ckp-sl"><span className="ckp-sw2" style={{ background: azul(i, n) }} /><span className="ckp-sl-n">{r.nome}</span><span className="ckp-sl-v">{fmtPercent(r.premioTotal / total)} · {kpiBRL(r.premioTotal)}</span></div>)}
        {n > 4 && <div className="ckp-sl"><span className="ckp-sw2" style={{ background: '#3b5170' }} /><span className="ckp-sl-n" style={{ color: '#7787a3' }}>demais {n - 4} corretoras</span><span className="ckp-sl-v" style={{ color: '#7787a3' }}>{fmtPercent(restoPct)}</span></div>}
      </div>
    </>
  )
}

function ParetoChart({ data, mounted, vitalFew, metrica, fmtVal, onSelect, numeros = false, big = false }: {
  data: { id: string; nome: string; valor: number; acumPct: number }[]; mounted: boolean; vitalFew: number
  metrica: MetricaPareto; fmtVal: (v: number) => string; onSelect?: (id: string) => void; numeros?: boolean; big?: boolean
}) {
  if (!mounted) return <div className="ckp-empty">Carregando…</div>
  const fmtNum = (v: number) => metrica === 'premio' ? eixoBRL(Number(v)) : String(Math.round(Number(v)))
  const chart = (
    <ResponsiveContainer width="100%" height={big ? '100%' : 270}>
      <ComposedChart data={data} margin={{ left: 2, right: 6, top: numeros ? 26 : 12, bottom: big ? 88 : 8 }}
        onClick={(state) => { const p = (state as unknown as { activePayload?: { payload: { id: string } }[] })?.activePayload?.[0]?.payload; if (p?.id) onSelect?.(p.id) }}>
        {big && <XAxis dataKey="nome" angle={-30} textAnchor="end" interval={0} height={96} tick={{ fontSize: 12.5, fill: TICK }} />}
        {!big && <XAxis dataKey="nome" tick={false} height={4} />}
        <YAxis yAxisId="l" tickFormatter={(v) => fmtNum(Number(v))} tick={{ fontSize: big ? 13 : 10.5, fill: TICK }} width={big ? 68 : 54} />
        <YAxis yAxisId="r" orientation="right" domain={[0, 1]} tickFormatter={(v) => Math.round(Number(v) * 100) + '%'} tick={{ fontSize: big ? 13 : 10.5, fill: TICK }} width={big ? 48 : 38} />
        <Tooltip cursor={{ fill: 'rgba(74,144,208,.06)' }} contentStyle={tooltipDark} formatter={(v, n) => n === 'Acumulado' ? [fmtPercent(Number(v)), 'Acumulado'] : [fmtVal(Number(v)), 'Valor']} />
        <ReferenceLine yAxisId="r" y={0.8} stroke={GOLD} strokeDasharray="5 4" strokeWidth={1.5} label={{ value: '80%', position: 'right', fill: GOLD, fontSize: big ? 13 : 11 }} />
        <Bar yAxisId="l" dataKey="valor" name="Valor" radius={[4, 4, 0, 0]} isAnimationActive={false} cursor="pointer">
          {data.map((x, i) => <Cell key={x.id} fill={i < vitalFew ? NAVY_BAR : '#33445e'} />)}
          {numeros && <LabelList dataKey="valor" position="top" fontSize={big ? 12 : 8} fill="#c9d6ec" formatter={(v) => fmtNum(Number(v))} />}
        </Bar>
        <Line yAxisId="r" type="monotone" dataKey="acumPct" name="Acumulado" stroke={GOLD} strokeWidth={big ? 3 : 2.4} dot={{ r: big ? 3.4 : 2.6, fill: GOLD }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
  // No modal (big) o gráfico PREENCHE a altura disponível via um wrapper com altura
  // explícita em vh (calc), então o height='100%' do ResponsiveContainer resolve
  // (não colapsa como acontecia dentro de flex sem altura); compacto mantém 270.
  return big ? <div style={{ width: '100%', height: 'calc(90vh - 190px)', minHeight: 380 }}>{chart}</div> : chart
}

const DESF_CATS: { key: 'emitidas' | 'andamento' | 'perdidas' | 'recusadas'; label: string; cor: string }[] = [
  { key: 'emitidas', label: 'Emitidas', cor: '#3a9e82' }, { key: 'andamento', label: 'Em andamento', cor: '#4d7ea8' },
  { key: 'perdidas', label: 'Perdidas', cor: '#b07a44' }, { key: 'recusadas', label: 'Recusadas', cor: '#bd655d' },
]
function DesfechoView({ desfecho, totais, conv, onSelect, big = false }: {
  desfecho: DesfechoCorretora[]; totais: { emitidas: { n: number }; andamento: { n: number }; perdidas: { n: number }; recusadas: { n: number } }
  conv: number; onSelect: (id: string) => void; big?: boolean
}) {
  const rows = big ? desfecho : desfecho.slice(0, 6)
  const thr = big ? 4 : 12
  return (
    <>
      <div className="ckp-legend-row">
        {DESF_CATS.map((c) => <span key={c.key} className="ckp-leg"><span className="ckp-sw2" style={{ background: c.cor }} />{c.label} {totais[c.key].n}</span>)}
        {big && <span style={{ fontSize: 12.5, fontWeight: 800, color: GOOD, borderLeft: '1px solid rgba(255,255,255,.12)', paddingLeft: 12 }}>Aproveitamento: {fmtPercent(conv)}</span>}
      </div>
      <div className={big ? 'ckp-desf-big' : ''}>
        {rows.map((d) => {
          const pct = (n: number) => d.total > 0 ? (n / d.total) * 100 : 0
          return (
            <div key={d.id} className="ckp-desf-row" onClick={() => onSelect(d.id)}>
              <div className="ckp-desf-name" title={d.nome}>{d.nome}</div>
              <div className="ckp-stack" title={`Emitidas ${d.emitidas.n} · Em andamento ${d.andamento.n} · Perdidas ${d.perdidas.n} · Recusadas ${d.recusadas.n}`}>
                {DESF_CATS.map((c) => { const seg = d[c.key]; const w = pct(seg.n); return seg.n > 0 ? <i key={c.key} style={{ width: `${w}%`, background: c.cor }}>{w >= thr && <span className="ckp-seg-num">{seg.n}</span>}</i> : null })}
              </div>
              <div className="ckp-desf-emit">{d.decididas > 0 ? fmtPercent(d.conversao) : '·'}</div>
            </div>
          )
        })}
      </div>
      {big && <div className="ckp-cap" style={{ fontSize: 11.5 }}>Considera a <b>carteira inteira</b> (emitidas, perdidas e recusadas). <b>Aproveitamento</b> = emitidas ÷ decididas. Clique numa linha para abrir a corretora.</div>}
    </>
  )
}

// "Maiores em prêmio emitido" — reusado no painel direito e no relatório em HTML.
function MoversView({ desfecho, onSelect }: { desfecho: DesfechoCorretora[]; onSelect?: (id: string) => void }) {
  const lista = desfecho.filter((d) => d.emitidas.premio > 0).slice(0, 5)
  if (lista.length === 0) return <div className="ckp-empty">Nenhuma emissão no período.</div>
  return (
    <div>{lista.map((d, i) => (
      <button key={d.id} type="button" className="ckp-mover" style={{ width: '100%', background: 'none', border: 'none', cursor: onSelect ? 'pointer' : 'default', font: 'inherit', color: 'inherit' }} onClick={() => onSelect?.(d.id)}>
        <span className="ckp-mv-rank">{i + 1}</span><span className="ckp-mv-name" style={{ textAlign: 'left' }}>{d.nome}</span><span className="ckp-mv-val" style={{ color: GOOD }}>{kpiBRL(d.emitidas.premio)}</span>
      </button>
    ))}</div>
  )
}

function StatusDonut({ dados, big = false }: { dados: { name: string; value: number; premio: number; cor: string }[]; big?: boolean }) {
  if (!dados.length) return <div className="ckp-empty">Sem dados no escopo.</div>
  const total = dados.reduce((s, d) => s + d.value, 0) || 1
  const ord = [...dados].sort((a, b) => b.value - a.value)
  const stops: string[] = []
  let acc = 0
  for (const d of ord) { const p = (d.value / total) * 100; stops.push(`${d.cor} ${acc}% ${acc + p}%`); acc += p }
  const grad = stops.join(',')
  const maior = ord[0]
  return (
    <div className="ckp-donut-wrap">
      <div className={`ckp-donut${big ? ' ckp-donut-big' : ''}`} style={{ background: `conic-gradient(from -90deg,${grad})` }}>
        <div className="ckp-donut-cent"><div><b style={{ fontSize: big ? 30 : 18 }}>{fmtPercent(maior ? maior.value / total : 0).replace(',00', '')}</b><span>{maior?.name ?? ''}</span></div></div>
      </div>
      <div className="ckp-legend">
        {ord.map((d) => (
          <div key={d.name} className="ckp-leg" style={{ fontSize: big ? 14 : 12 }}>
            <span className="ckp-sw2" style={{ background: d.cor }} /><span className="ckp-lg-name">{d.name}</span>
            <span className="ckp-lg-val">{d.value}{big ? ` · ${fmtMoedaCurta(d.premio)}` : ''} · {Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MatrizView({ matriz, big = false }: { matriz: ReturnType<typeof matrizCorretoraMes>; big?: boolean }) {
  return (
    <div className="ckp-heat-scroll">
      <table className={`ckp-heat${big ? ' ckp-heat-big' : ''}`}>
        <thead><tr><th className="rowlab"></th>{matriz.meses.map((m) => <th key={m}>{rotuloMes(m)}</th>)}{big && <th>Total</th>}</tr></thead>
        <tbody>
          {matriz.linhas.map((l) => (
            <tr key={l.id}>
              <th className="rowlab" title={l.nome}>{big ? l.nome : initials(l.nome)}</th>
              {l.valores.map((v, i) => {
                const t = v / matriz.maxCelula
                const bg = v > 0 ? lerpHex(HEAT_LO, HEAT_HI, Math.pow(t, 0.75)) : 'rgba(255,255,255,.03)'
                const txt = t > 0.5 ? '#0a1020' : '#c7d3ea'
                return <td key={i} style={{ background: bg }} title={`${l.nome} · ${rotuloMes(matriz.meses[i])}: ${v > 0 ? kpiBRL(v) : '—'}`}>{big && v > 0 && <span className="ckp-hnum" style={{ color: txt }}>{kpiBRL(v).replace('R$ ', '')}</span>}</td>
              })}
              {big && <td style={{ textAlign: 'right', fontWeight: 800, background: 'transparent', width: 'auto', color: '#eaf0fb' }}>{kpiBRL(l.total)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ckp-heat-legend">menor <span className="ckp-heat-ramp" /> maior · prêmio no mês</div>
    </div>
  )
}

// ── Dossiê da corretora (painel direito) — reusa os dados já carregados ──────
function posicaoDe<T extends { id: string }>(lista: T[], id: string, val: (x: T) => number): number | null {
  const ord = [...lista].sort((a, b) => val(b) - val(a))
  const i = ord.findIndex((x) => x.id === id)
  return i >= 0 ? i + 1 : null
}
function DossieCorretora({ corretora, corretoras, tomadores, operacoes, statusFluxo, onVoltar, onEditar, onPdf, exportando, full = false }: {
  corretora: Corretora; corretoras: Corretora[]; tomadores: TomAgg[]; operacoes: OpAgg[]
  statusFluxo: Pick<StatusFluxo, 'nome' | 'cor'>[]; onVoltar: () => void; onEditar: () => void
  onPdf: (payload: Parameters<typeof gerarPdfCorretora>[0]) => void; exportando: boolean; full?: boolean
}) {
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const rankGlobal = useMemo<CorretoraAgg[]>(
    () => comPareto(agregarPorCorretora(corretoras.map((c) => ({ id: c.id, razao_social: c.razao_social, nome_fantasia: c.nome_fantasia, status: c.status })), tomadores, operacoes)),
    [corretoras, tomadores, operacoes],
  )
  const emitPorCor = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of operacoes) { if (!o.corretora_id) continue; if ((o.status || '').toLowerCase().includes('emiti')) m.set(o.corretora_id, (m.get(o.corretora_id) ?? 0) + (Number(o.premio_previsto) || 0)) }
    return m
  }, [operacoes])
  const total = rankGlobal.length
  const posPremio = posicaoDe(rankGlobal, corretora.id, (r) => r.premioTotal)
  const posTom = posicaoDe(rankGlobal, corretora.id, (r) => r.nTomadores)
  const posOp = posicaoDe(rankGlobal, corretora.id, (r) => r.nOperacoes)
  const listaEmit = useMemo(() => corretoras.map((c) => ({ id: c.id, v: emitPorCor.get(c.id) ?? 0 })), [corretoras, emitPorCor])
  const posEmit = posicaoDe(listaEmit, corretora.id, (x) => x.v)

  const opsCor = useMemo(() => operacoes.filter((o) => o.corretora_id === corretora.id), [operacoes, corretora.id])
  const tomsCor = useMemo(() => tomadores.filter((t) => t.corretora_id === corretora.id), [tomadores, corretora.id])
  const kpis = useMemo(() => kpisDeOperacoes(opsCor), [opsCor])
  const conv = useMemo(() => taxaConversao(opsCor), [opsCor])
  const emitidas = useMemo(() => opsCor.filter((o) => (o.status || '').toLowerCase().includes('emiti')).length, [opsCor])
  const premioEmit = emitPorCor.get(corretora.id) ?? 0
  const rankTom = useMemo(() => comParticipacao(rankingTomadores(tomsCor, opsCor)), [tomsCor, opsCor])
  const maxTom = useMemo(() => Math.max(1, ...rankTom.map((t) => t.premioTotal)), [rankTom])
  const corStatus = useMemo(() => new Map(statusFluxo.map((s) => [s.nome, s.cor])), [statusFluxo])
  const nome = corretora.nome_fantasia || corretora.razao_social
  const toggle = (id: string) => setAbertas((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className={`ckp-dossie${full ? ' ckp-dossie-full' : ''}`}>
      <div className="ckp-hero">
        <div className="ckp-hero-top"><span className="ckp-hero-tag">Dossiê da corretora</span><button className="ckp-back" onClick={onVoltar}>✕ fechar</button></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <div className="ckp-dossie-badge">{initials(nome)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="ckp-dossie-name">{nome}</div>
            <span className={`ckp-pill ${corretora.status === 'ativo' ? 'on' : 'off'}`} style={{ marginTop: 4, display: 'inline-block' }}>{corretora.status === 'ativo' ? 'Ativa' : 'Inativa'}</span>
          </div>
        </div>
      </div>

      <div className="ckp-glass ckp-panel ckp-d-kpis">
        <div className="ckp-mini-kpis">
          <div className="ckp-mini-k"><div className="ckp-mk-l">Prêmio Previsto</div><div className="ckp-mk-v" style={{ color: GOLD }}>{kpiBRL(kpis.premioTotal)}</div></div>
          <div className="ckp-mini-k"><div className="ckp-mk-l">Prêmio Emitido</div><div className="ckp-mk-v" style={{ color: GOOD }}>{kpiBRL(premioEmit)}</div></div>
          <div className="ckp-mini-k"><div className="ckp-mk-l">LMG (exposição)</div><div className="ckp-mk-v">{kpiBRL(kpis.lmgTotal)}</div></div>
          <div className="ckp-mini-k"><div className="ckp-mk-l">Operações</div><div className="ckp-mk-v">{kpis.nOperacoes}</div></div>
          <div className="ckp-mini-k"><div className="ckp-mk-l">Tomadores</div><div className="ckp-mk-v">{tomsCor.length}</div></div>
          <div className="ckp-mini-k"><div className="ckp-mk-l">Taxa Média</div><div className="ckp-mk-v">{fmtPercent(kpis.taxaMediaPond / 100)}</div></div>
        </div>
      </div>

      <div className="ckp-glass ckp-panel ckp-d-pos">
        <div className="ckp-panel-title">Posição no ranking<span className="ckp-tag">entre {total}</span></div>
        <div className="ckp-pos">
          <PosItem label="Prêmio previsto" pos={posPremio} />
          <PosItem label="Prêmio emitido" pos={posEmit} />
          <PosItem label="Tomadores" pos={posTom} />
          <PosItem label="Operações" pos={posOp} />
        </div>
      </div>

      <div className="ckp-glass ckp-panel ckp-d-cadeia">
        <div className="ckp-panel-title">Cadeia · Tomador → Operação<span className="ckp-tag">{fmtPercent(conv)} emitidas</span></div>
        <div className="ckp-funnel" style={{ marginBottom: 14 }}>
          <div className="ckp-fn-row"><div className="ckp-fn-bar" style={{ width: '100%', background: 'linear-gradient(90deg,#5a9cd8,#4a90d0)' }}>{kpis.nOperacoes} operações</div><span className="ckp-fn-meta">{tomsCor.length} tomadores</span></div>
          <div className="ckp-fn-row"><div className="ckp-fn-bar" style={{ width: `${Math.max(kpis.nOperacoes > 0 ? (emitidas / kpis.nOperacoes) * 100 : 0, 12)}%`, background: 'linear-gradient(90deg,#2fa885,#38c58e)' }}>{emitidas} emitidas</div></div>
        </div>
        <div className="ckp-cadeia">
          {rankTom.length === 0 ? <div className="ckp-empty">Sem tomadores/operações.</div> : rankTom.map((t) => {
            const aberta = abertas.has(t.id)
            const opsTom = operacoesDoTomador(opsCor, t.id)
            return (
              <div key={t.id}>
                <div className="ckp-cad-tom" onClick={opsTom.length ? () => toggle(t.id) : undefined} style={{ cursor: opsTom.length ? 'pointer' : 'default' }}>
                  <span style={{ width: 12, color: '#7787a3', fontSize: 10 }}>{opsTom.length ? (aberta ? '▼' : '▶') : ''}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nome}</div>
                    <div style={{ fontSize: 11, color: '#7787a3' }}>{t.nOperacoes} op · {fmtPercent(t.participacaoPct ?? 0)}</div>
                  </div>
                  <div style={{ width: 70, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="ckp-partbar" style={{ width: 40 }}><i style={{ width: `${(t.premioTotal / maxTom) * 100}%` }} /></span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, minWidth: 70, textAlign: 'right' }}>{kpiBRL(t.premioTotal)}</span>
                </div>
                {aberta && [...opsTom].sort((a, b) => (Number(b.premio_previsto) || 0) - (Number(a.premio_previsto) || 0)).map((o) => {
                  const cor = corStatus.get(o.status) ?? '#94a3b8'
                  return (
                    <div key={o.id} className="ckp-cad-op">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: cor, whiteSpace: 'nowrap' }}>{o.status || 'Sem status'}</span>
                      <span style={{ flex: 1, minWidth: 0, color: '#7787a3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.modalidade || 'Operação'}{o.estado ? ` · ${o.estado}` : ''}</span>
                      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{kpiBRL(Number(o.premio_previsto) || 0)}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div className="ckp-dossie-actions" style={{ marginTop: 14 }}>
          <button className="ckp-btn" style={{ flex: 1 }} onClick={onEditar}>✎ Editar cadastro</button>
          <button className="ckp-btn" style={{ flex: 1 }} disabled={exportando} onClick={() => onPdf({
            corretoraNome: nome,
            kpis: { premioTotal: kpis.premioTotal, lmgTotal: kpis.lmgTotal, nOperacoes: kpis.nOperacoes, nTomadores: tomsCor.length, ticketMedio: kpis.ticketMedio, taxaMediaPond: kpis.taxaMediaPond },
            tomadores: rankTom.map((t) => ({ nome: t.nome, nOperacoes: t.nOperacoes, premioTotal: t.premioTotal, lmgTotal: t.lmgTotal, participacaoPct: t.participacaoPct ?? 0 })),
            periodoLabel: 'Todos os períodos', chart: null,
          })}>📄 PDF</button>
        </div>
      </div>
    </div>
  )
}

function PosItem({ label, pos }: { label: string; pos: number | null }) {
  const medalha = pos != null && pos <= 3
  return (
    <div className="ckp-pos-item">
      <span className="ckp-pos-num" style={{ color: medalha ? GOLD : BLUE_BR }}>{pos != null ? `${pos}º` : '·'}</span>
      <span className="ckp-pos-lab">{label}</span>
    </div>
  )
}
