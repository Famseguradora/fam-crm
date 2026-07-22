'use client'

// ============================================================
//  Painel Gerencial de Corretoras — cockpit executivo.
//
//  UMA tabela de corretoras (o Ranking), com busca. Clicar numa corretora
//  abre a TELA DA CORRETORA (números + cadeia + PDF). Filtros globais
//  (período/status/UF), KPIs, treemap de participação, matriz mês, mix por
//  status e um Pareto 80/20 SOB DEMANDA e educacional. Blocos personalizáveis
//  (mostrar/ocultar, como no Dashboard). Só gráficos de barras/linhas.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Treemap, BarChart, ReferenceLine,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { fmtMoeda, fmtMoedaCurta, fmtPercent } from '@/lib/utils'
import {
  agregarPorCorretora, comPareto, kpisDeOperacoes, distribuicaoPorStatus,
  evolucaoMensal, mesesDisponiveis, rotuloMes, serieMensalAlinhada, deltaUltimoMes,
  filtrarPorPeriodo, matrizCorretoraMes, serieTemporal, mesDeOperacao, seriesMiniPorMetrica,
  desfechoPorCorretora,
  type OpAgg, type TomAgg, type CorretoraAgg,
} from '@/lib/corretoras/agregacoes'
import { gerarPdfGeral } from '@/lib/corretoras/pdf'
import type { Corretora, StatusFluxo } from '@/types'

// Chrome da marca FAM.
const NAVY = '#1e4080', NAVY_DK = '#102040', GOLD = '#e8b84b', GREEN = '#27a96c', RED = '#d64545'
const INK = '#0a1628', SOFT = '#6080a0', BORDER = '#e0ecf8'
// Fonte do sistema (mesma do resto do CRM) — aplicada ao texto SVG do treemap,
// que por padrão cairia na fonte serifada do navegador (aparência "desfocada").
const FONTE = "'Calibri','Segoe UI',sans-serif"
// Escala sequencial de azul (treemap) — mais escuro = maior participação.
const AZUIS = ['#102040', '#1a3560', '#1e4080', '#2255a4', '#3070c8', '#4a90d8', '#6ab0e8', '#8acaf8', '#aadaff', '#c0e8ff', '#d8f0ff']

const painel: React.CSSProperties = {
  background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16,
  boxShadow: '0 2px 14px rgba(30,64,128,.06)',
}
const tituloBloco: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, color: NAVY_DK, letterSpacing: '.3px',
  marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase',
}
const barraTitulo = (cor: string): React.CSSProperties => ({ width: 4, height: 15, borderRadius: 3, background: cor })
const thSort: React.CSSProperties = { cursor: 'pointer', userSelect: 'none' }

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

async function capturarGrafico(node: HTMLElement | null): Promise<{ dataUrl: string; w: number; h: number } | null> {
  if (!node) return null
  try {
    const { toPng } = await import('html-to-image')
    const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
    return { dataUrl, w: node.clientWidth || 600, h: node.clientHeight || 300 }
  } catch { return null }
}

// Escopo de status — espelha a tela de Operações, que no funil SEMPRE exclui
// Emitido/Perdido/Recusado (app/(dashboard)/operacoes/page.tsx, operacoesFiltradas).
// 'funil' = mesmos KPIs de Operações · 'carteira' = tudo (inclui emitidas/perdidas).
const STATUS_FORA_DO_FUNIL = ['Emitido', 'Perdido', 'Recusado']
type EscopoStatus = 'funil' | 'carteira'

type MetricaPareto = 'premio' | 'tomadores' | 'operacoes'
type CardKey = 'mensal' | 'treemap' | 'status' | 'matriz'
// Matriz Corretora×Mês começa OCULTA (experimento: avaliar se faz falta). Reativável em ⚙ Personalizar.
const CARDS_INICIAIS: Record<CardKey, boolean> = { mensal: true, treemap: true, status: true, matriz: false }
const CARDS_LABEL: Record<CardKey, string> = { mensal: 'Evolução mensal', treemap: 'Participação (treemap)', status: 'Mix por status', matriz: 'Matriz Corretora×Mês' }

interface Props {
  onAbrirCorretora?: (id: string) => void
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

  // Filtros globais.
  const [mesIni, setMesIni] = useState('')
  const [mesFim, setMesFim] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null)
  const [filtroUF, setFiltroUF] = useState('')
  const [escopoStatus, setEscopoStatus] = useState<EscopoStatus>('funil') // default = mesmos KPIs de Operações
  const [filtroCorretora, setFiltroCorretora] = useState<string | null>(null) // cross-filter BI (clique no treemap)
  const [drillMes, setDrillMes] = useState<string | null>(null)                // drill-down p/ semanas (clique na barra mensal)
  const [busca, setBusca] = useState('')
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Pareto sob demanda + personalização.
  const [mostrarPareto, setMostrarPareto] = useState(false)
  const [metricaPareto, setMetricaPareto] = useState<MetricaPareto>('premio')
  const [cards, setCards] = useState<Record<CardKey, boolean>>(CARDS_INICIAIS)
  const [mostrarPersonalizar, setMostrarPersonalizar] = useState(false)

  const [preview, setPreview] = useState<{ url: string; filename: string } | null>(null)
  const treemapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    try { const s = localStorage.getItem('fam_corretoras_cards_v2'); if (s) setCards((p) => ({ ...p, ...JSON.parse(s) })) } catch { /* ignore */ }
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

  useEffect(() => {
    const u = preview?.url
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [preview?.url])

  const toggleCard = (k: CardKey) => setCards((p) => {
    const n = { ...p, [k]: !p[k] }
    try { localStorage.setItem('fam_corretoras_cards_v2', JSON.stringify(n)) } catch { /* ignore */ }
    return n
  })

  // Base de TODOS os cálculos do painel. No escopo 'funil' replica exatamente o
  // recorte da tela de Operações (exclui Emitido/Perdido/Recusado), para os KPIs
  // baterem número a número. Em 'carteira' mostra a carteira inteira.
  const operacoesEscopo = useMemo(
    () => escopoStatus === 'funil' ? operacoes.filter((o) => !STATUS_FORA_DO_FUNIL.includes(o.status ?? '')) : operacoes,
    [operacoes, escopoStatus],
  )

  const meses = useMemo(() => mesesDisponiveis(operacoesEscopo), [operacoesEscopo])
  const ufsDisponiveis = useMemo(
    () => [...new Set(corretoras.map((c) => c.estado).filter(Boolean))].sort() as string[],
    [corretoras],
  )

  const [pIni, pFim] = useMemo<[string, string]>(() => {
    if (mesIni && mesFim && mesIni > mesFim) return [mesFim, mesIni]
    return [mesIni, mesFim]
  }, [mesIni, mesFim])
  const noPeriodo = useCallback((m: string) => (!pIni || m >= pIni) && (!pFim || m <= pFim), [pIni, pFim])
  const selMesIdx = pIni && pIni === pFim ? meses.indexOf(pIni) : -1

  const corretorasVis = useMemo(
    () => (filtroUF ? corretoras.filter((c) => c.estado === filtroUF) : corretoras),
    [corretoras, filtroUF],
  )
  const visIds = useMemo(() => new Set(corretorasVis.map((c) => c.id)), [corretorasVis])
  const passaStatusUF = useCallback(
    (o: OpAgg) => (!filtroStatus || o.status === filtroStatus) && (!filtroUF || (!!o.corretora_id && visIds.has(o.corretora_id))),
    [filtroStatus, filtroUF, visIds],
  )
  // Cross-filter BI: quando uma corretora está selecionada (clique no treemap),
  // os visuais de DETALHE (KPIs, Evolução, Mix, Matriz, totais) focam nela. O
  // Ranking e o treemap continuam mostrando TODAS (com a selecionada realçada).
  const passaCorretora = useCallback(
    (o: OpAgg) => !filtroCorretora || o.corretora_id === filtroCorretora,
    [filtroCorretora],
  )

  // Board: período + status + UF (base do Ranking e do treemap — mostra todas).
  const opsBoard = useMemo(
    () => filtrarPorPeriodo(operacoesEscopo.filter(passaStatusUF), pIni, pFim),
    [operacoesEscopo, passaStatusUF, pIni, pFim],
  )
  // Foco: board + corretora selecionada (KPIs, totais).
  const opsFoco = useMemo(() => opsBoard.filter(passaCorretora), [opsBoard, passaCorretora])
  // Tendência (sparkline/delta/evolução): status+UF + corretora, todos os meses.
  const opsTrend = useMemo(() => operacoesEscopo.filter(passaStatusUF), [operacoesEscopo, passaStatusUF])
  const opsTrendFoco = useMemo(() => opsTrend.filter(passaCorretora), [opsTrend, passaCorretora])

  const ranking = useMemo<CorretoraAgg[]>(
    () => comPareto(agregarPorCorretora(
      corretorasVis.map((c) => ({ id: c.id, razao_social: c.razao_social, nome_fantasia: c.nome_fantasia, status: c.status })),
      tomadores, opsBoard,
    )),
    [corretorasVis, tomadores, opsBoard],
  )
  const comPremio = useMemo(() => ranking.filter((r) => r.premioTotal > 0), [ranking])
  const maxPremioRank = useMemo(() => Math.max(1, ...ranking.map((r) => r.premioTotal)), [ranking])
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

  // Busca (nome/CNPJ) filtra só a tabela do Ranking.
  const rankingBusca = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const d = busca.replace(/\D/g, '')
    if (!t) return ranking
    return ranking.filter((r) => {
      const c = corretoras.find((x) => x.id === r.id)
      return r.nome.toLowerCase().includes(t) || (c?.razao_social ?? '').toLowerCase().includes(t) || (d.length > 0 && (c?.cnpj ?? '').replace(/\D/g, '').includes(d))
    })
  }, [ranking, busca, corretoras])

  // Ordenação da tabela (default = ranking por prêmio desc, do comPareto).
  const rankingOrdenado = useMemo(() => {
    if (!sortField) return rankingBusca
    const arr = [...rankingBusca]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortField === 'nome') cmp = a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
      else if (sortField === 'nTomadores') cmp = a.nTomadores - b.nTomadores
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

  const kpis = useMemo(() => kpisDeOperacoes(opsFoco), [opsFoco])
  const delta = useMemo(() => deltaUltimoMes(opsTrendFoco), [opsTrendFoco])
  const sparkTotal = useMemo(() => serieMensalAlinhada(opsTrendFoco, meses), [opsTrendFoco, meses])
  // Séries mensais dos mini-gráficos dos 4 cards (respeitam o cross-filter via opsTrendFoco).
  const seriesMini = useMemo(() => seriesMiniPorMetrica(opsTrendFoco, meses), [opsTrendFoco, meses])
  const totalGeralPremio = useMemo(() => opsBoard.reduce((s, o) => s + (Number(o.premio_previsto) || 0), 0), [opsBoard])

  const serieMensal = useMemo(() => evolucaoMensal(opsTrendFoco), [opsTrendFoco])
  // Drill-down: semanas do mês clicado (só quando drillMes está setado).
  const serieSemanal = useMemo(
    () => drillMes ? serieTemporal(opsTrendFoco.filter((o) => mesDeOperacao(o) === drillMes), 'semanal', 'premio') : [],
    [drillMes, opsTrendFoco],
  )

  const opsParaStatus = useMemo(
    () => filtrarPorPeriodo(operacoesEscopo.filter((o) => (!filtroUF || (!!o.corretora_id && visIds.has(o.corretora_id))) && passaCorretora(o)), pIni, pFim),
    [operacoesEscopo, filtroUF, visIds, pIni, pFim, passaCorretora],
  )
  const porStatus = useMemo(() => distribuicaoPorStatus(opsParaStatus, statusFluxo), [opsParaStatus, statusFluxo])
  const maxStatus = useMemo(() => Math.max(1, ...porStatus.map((s) => s.value)), [porStatus])

  const opsMatriz = useMemo(() => operacoesEscopo.filter((o) => passaStatusUF(o) && passaCorretora(o)), [operacoesEscopo, passaStatusUF, passaCorretora])

  // Desfecho: usa a carteira INTEIRA (todos os status), de propósito — é a análise
  // das Emitidas/Perdidas/Recusadas que o funil ativo deixa de fora. Respeita
  // período e UF, mas nunca o escopo de funil.
  const desfecho = useMemo(() => {
    const base = filtrarPorPeriodo(
      operacoes.filter((o) => !filtroUF || (!!o.corretora_id && visIds.has(o.corretora_id))),
      pIni, pFim,
    )
    return desfechoPorCorretora(
      corretorasVis.map((c) => ({ id: c.id, razao_social: c.razao_social, nome_fantasia: c.nome_fantasia, status: c.status })),
      base,
    )
  }, [operacoes, corretorasVis, filtroUF, visIds, pIni, pFim])

  const desfechoTotais = useMemo(() => desfecho.reduce((a, d) => ({
    total: a.total + d.total,
    emitidas: { n: a.emitidas.n + d.emitidas.n, premio: a.emitidas.premio + d.emitidas.premio },
    perdidas: { n: a.perdidas.n + d.perdidas.n, premio: a.perdidas.premio + d.perdidas.premio },
    recusadas: { n: a.recusadas.n + d.recusadas.n, premio: a.recusadas.premio + d.recusadas.premio },
    andamento: { n: a.andamento.n + d.andamento.n, premio: a.andamento.premio + d.andamento.premio },
  }), { total: 0, emitidas: { n: 0, premio: 0 }, perdidas: { n: 0, premio: 0 }, recusadas: { n: 0, premio: 0 }, andamento: { n: 0, premio: 0 } }), [desfecho])
  const desfechoDecididas = desfechoTotais.emitidas.n + desfechoTotais.perdidas.n + desfechoTotais.recusadas.n
  const desfechoConv = desfechoDecididas > 0 ? desfechoTotais.emitidas.n / desfechoDecididas : 0
  const matriz = useMemo(
    () => matrizCorretoraMes(
      corretorasVis.map((c) => ({ id: c.id, razao_social: c.razao_social, nome_fantasia: c.nome_fantasia, status: c.status })),
      opsMatriz, meses,
    ),
    [corretorasVis, opsMatriz, meses],
  )

  // Treemap: top-N por prêmio + "Outras", cor sequencial por rank.
  const treemapData = useMemo(() => {
    const ordenado = [...comPremio].sort((a, b) => b.premioTotal - a.premioTotal)
    const TOP = 6
    const top = ordenado.slice(0, TOP)
    const resto = ordenado.slice(TOP)
    const data = top.map((r, i) => ({ name: r.nome, size: r.premioTotal, id: r.id, rank: i, pct: totalGeralPremio > 0 ? r.premioTotal / totalGeralPremio : 0 }))
    if (resto.length) {
      const soma = resto.reduce((s, r) => s + r.premioTotal, 0)
      data.push({ name: `Outras (${resto.length})`, size: soma, id: '__outras__', rank: TOP, pct: totalGeralPremio > 0 ? soma / totalGeralPremio : 0 })
    }
    return data
  }, [comPremio, totalGeralPremio])

  // Pareto (sob demanda): dados para a métrica escolhida.
  const paretoData = useMemo(() => {
    const val = (r: CorretoraAgg) => metricaPareto === 'tomadores' ? r.nTomadores : metricaPareto === 'operacoes' ? r.nOperacoes : r.premioTotal
    const arr = ranking.map((r) => ({ id: r.id, nome: r.nome, valor: val(r) })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor)
    const total = arr.reduce((s, x) => s + x.valor, 0)
    const out: { id: string; nome: string; valor: number; acumPct: number; pct: number }[] = []
    let acc = 0
    for (const x of arr) {
      acc += x.valor
      out.push({ ...x, acumPct: total > 0 ? acc / total : 0, pct: total > 0 ? x.valor / total : 0 })
    }
    return out
  }, [ranking, metricaPareto])
  const vitalFew = useMemo(() => {
    const i = paretoData.findIndex((x) => x.acumPct >= 0.8)
    return i >= 0 ? i + 1 : paretoData.length
  }, [paretoData])
  const vitalPct = paretoData.length ? vitalFew / paretoData.length : 0
  const metricaTxt = metricaPareto === 'tomadores' ? 'dos tomadores' : metricaPareto === 'operacoes' ? 'das operações' : 'do prêmio'
  const fmtParetoVal = (v: number) => metricaPareto === 'premio' ? fmtMoeda(v) : String(Math.round(v))

  const totais = useMemo(() => {
    const k = kpisDeOperacoes(opsFoco)
    const nTom = new Set(opsFoco.map((o) => o.tomador_id).filter(Boolean)).size
    return { ...k, nCorretoras: filtroCorretora ? 1 : comPremio.length, nTomadores: nTom }
  }, [opsFoco, comPremio, filtroCorretora])

  const limparTudo = () => { setFiltroStatus(null); setFiltroUF(''); setMesIni(''); setMesFim(''); setFiltroCorretora(null); setDrillMes(null) }
  const algumFiltro = !!(filtroStatus || filtroUF || pIni || pFim || filtroCorretora)
  const toggleStatus = (s: string | null) => setFiltroStatus((cur) => (cur === s || !s ? null : s))
  // Clique numa corretora (treemap) = liga/desliga o cross-filter BI.
  const toggleCorretora = (id: string) => setFiltroCorretora((cur) => (cur === id ? null : id))
  const nomeFiltroCorretora = useMemo(() => {
    if (!filtroCorretora) return ''
    const c = corretoras.find((x) => x.id === filtroCorretora)
    return c ? (c.nome_fantasia || c.razao_social) : ''
  }, [filtroCorretora, corretoras])
  // Rola suavemente até a seção de gráficos (mini-gráfico dos KPIs): o CEO abre a
  // tela e precisa descobrir que há análises no fim da página. Se TODOS os blocos
  // estiverem ocultos (⚙ Personalizar), a âncora não existe — então reabre a
  // Evolução e rola só depois do render (nunca deixa o clique "morto").
  const scrollPendenteRef = useRef(false)
  const irParaGraficos = useCallback(() => {
    const temAlgum = cards.mensal || cards.treemap || cards.status || cards.matriz
    if (temAlgum) {
      document.getElementById('graficos-corretoras')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    scrollPendenteRef.current = true
    setCards((p) => {
      const n = { ...p, mensal: true }
      try { localStorage.setItem('fam_corretoras_cards_v2', JSON.stringify(n)) } catch { /* ignore */ }
      return n
    })
  }, [cards])
  useEffect(() => {
    if (!scrollPendenteRef.current) return
    if (cards.mensal || cards.treemap || cards.status || cards.matriz) {
      scrollPendenteRef.current = false
      requestAnimationFrame(() => document.getElementById('graficos-corretoras')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }, [cards])

  const periodoLabel = useMemo(() => {
    if (!pIni && !pFim) return 'Todos os períodos'
    if (pIni && pFim && pIni === pFim) return rotuloMes(pIni)
    if (pIni && pFim) return `${rotuloMes(pIni)} a ${rotuloMes(pFim)}`
    if (pIni) return `a partir de ${rotuloMes(pIni)}`
    return `até ${rotuloMes(pFim)}`
  }, [pIni, pFim])

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
    } catch (err) {
      console.error('Excel corretoras:', err)
    } finally {
      setExportando(false)
    }
  }

  async function abrirPdfGeral() {
    setExportando(true)
    try {
      const chart = await capturarGrafico(treemapRef.current)
      const kb = kpisDeOperacoes(opsBoard)
      const { url, filename } = await gerarPdfGeral({
        ranking: ranking.map((r) => ({
          nome: r.nome, ativa: r.ativa, nTomadores: r.nTomadores, nOperacoes: r.nOperacoes,
          premioTotal: r.premioTotal, participacaoPct: r.participacaoPct ?? 0,
        })),
        kpis: {
          premioTotal: kb.premioTotal, lmgTotal: kb.lmgTotal, nOperacoes: kb.nOperacoes,
          nTomadores: ranking.reduce((s, r) => s + r.nTomadores, 0), ticketMedio: kb.ticketMedio, taxaMediaPond: kb.taxaMediaPond,
        },
        periodoLabel, chart,
      })
      setPreview({ url, filename })
    } catch (err) {
      console.error('PDF geral:', err)
    } finally {
      setExportando(false)
    }
  }

  if (carregando) {
    return <div style={{ textAlign: 'center', padding: 80, color: SOFT }}>Carregando painel gerencial…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Cabeçalho ── */}
      <div style={{
        background: `linear-gradient(120deg, ${NAVY_DK} 0%, ${NAVY} 60%, #1a3560 100%)`,
        borderRadius: 16, padding: '18px 22px', color: '#fff',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        boxShadow: '0 6px 24px rgba(16,32,64,.22)',
      }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '.2px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 6, height: 22, borderRadius: 4, background: GOLD, display: 'inline-block' }} />
            Panorama Gerencial de Corretoras
          </div>
          <div style={{ fontSize: 12.5, color: '#a9c4e8', marginTop: 4 }}>
            Performance das corretoras · <span style={{ color: GOLD }}>clique numa corretora para ver a tela dela</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-export" onClick={exportarExcel} disabled={exportando || ranking.length === 0}>⬇ Excel</button>
          <button className="btn-export" onClick={abrirPdfGeral} disabled={exportando || ranking.length === 0}>📄 PDF Geral</button>
          <button className="btn-primary" onClick={() => onNovaCorretora?.()}>+ Nova Corretora</button>
        </div>
      </div>

      {/* ── Filtros globais ── */}
      <div style={{ ...painel, padding: '14px 18px' }}>
        <div className="filter-row" style={{ margin: 0 }}>
          <div className="filter-group" style={{ flex: '1 1 140px' }}>
            <label className="filter-label">Período: de</label>
            <select className="fam-input" value={mesIni} onChange={(e) => setMesIni(e.target.value)}>
              <option value="">Início</option>
              {meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
            </select>
          </div>
          <div className="filter-group" style={{ flex: '1 1 140px' }}>
            <label className="filter-label">até</label>
            <select className="fam-input" value={mesFim} onChange={(e) => setMesFim(e.target.value)}>
              <option value="">Fim</option>
              {meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
            </select>
          </div>
          <div className="filter-group" style={{ flex: '1 1 160px' }}>
            <label className="filter-label">Status</label>
            <select className="fam-input" value={filtroStatus ?? ''} onChange={(e) => setFiltroStatus(e.target.value || null)}>
              <option value="">Todos</option>
              {statusFluxo.map((s) => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
            </select>
          </div>
          <div className="filter-group" style={{ flex: '1 1 210px' }}>
            <label className="filter-label">Escopo</label>
            <select className="fam-input" value={escopoStatus} onChange={(e) => setEscopoStatus(e.target.value as EscopoStatus)}
              title="Funil ativo = mesmo recorte da tela de Operações (exclui Emitido, Perdido e Recusado). Carteira completa = todas as operações ativas.">
              <option value="funil">Funil ativo (igual Operações)</option>
              <option value="carteira">Carteira completa (com emitidas)</option>
            </select>
          </div>
          <div className="filter-group" style={{ flex: '1 1 100px' }}>
            <label className="filter-label">UF</label>
            <select className="fam-input" value={filtroUF} onChange={(e) => setFiltroUF(e.target.value)}>
              <option value="">Todas</option>
              {ufsDisponiveis.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
            <label className="filter-label">&nbsp;</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {algumFiltro && <button className="btn-clear" onClick={limparTudo}>Limpar</button>}
              <button className="btn-secondary" onClick={() => setMostrarPersonalizar((v) => !v)}>⚙ Personalizar</button>
            </div>
          </div>
        </div>
        {mostrarPersonalizar && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: SOFT }}>Mostrar blocos:</span>
            {(Object.keys(CARDS_LABEL) as CardKey[]).map((k) => (
              <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: INK, cursor: 'pointer' }}>
                <input type="checkbox" checked={cards[k]} onChange={() => toggleCard(k)} />{CARDS_LABEL[k]}
              </label>
            ))}
          </div>
        )}
        {algumFiltro && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: SOFT }}>Ativos:</span>
            {filtroCorretora && <Chip cor={NAVY_DK} label={`Corretora: ${nomeFiltroCorretora}`} onClear={() => { setFiltroCorretora(null); setDrillMes(null) }} />}
            {filtroStatus && <Chip cor={statusFluxo.find((s) => s.nome === filtroStatus)?.cor ?? NAVY} label={filtroStatus} onClear={() => setFiltroStatus(null)} />}
            {filtroUF && <Chip cor={GREEN} label={`UF: ${filtroUF}`} onClear={() => setFiltroUF('')} />}
            {(pIni || pFim) && <Chip cor={GOLD} label={periodoLabel} onClear={() => { setMesIni(''); setMesFim('') }} />}
          </div>
        )}
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
        <KpiHero wide destaque label="Prêmio Previsto" valor={kpiBRL(kpis.premioTotal)} sub="soma no escopo" delta={delta.variacao} spark={sparkTotal} selMesIdx={selMesIdx} />
        <KpiHero label="LMG (exposição)" valor={kpiBRL(kpis.lmgTotal)} sub="teto 80M/op" spark={[]} miniSerie={seriesMini.lmg} onMini={irParaGraficos} />
        <KpiHero label="Operações" valor={String(kpis.nOperacoes)} sub="no escopo" spark={[]} miniSerie={seriesMini.operacoes} onMini={irParaGraficos} />
        <KpiHero label="Tomadores" valor={String(totais.nTomadores)} sub="com operação no escopo" spark={[]} miniSerie={seriesMini.tomadores} onMini={irParaGraficos} />
        <KpiHero label="Taxa Média Pond." valor={fmtPercent(kpis.taxaMediaPond / 100)} sub="min(LMG,80M)×vig." spark={[]} miniSerie={seriesMini.taxa} onMini={irParaGraficos} />
      </div>

      {/* ── Ranking (tabela única) ── */}
      <div style={painel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ ...tituloBloco, marginBottom: 0 }}><span style={barraTitulo(NAVY)} />Ranking de corretoras: negócios, participação e tendência</div>
          <input className="fam-input" placeholder="Buscar corretora ou CNPJ…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ height: 34, minWidth: 220, width: 'auto', fontSize: 13 }} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="fam-table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th style={thSort} onClick={() => handleSort('nome')}>Corretora{sortIcon('nome')}</th>
                <th style={{ ...thSort, textAlign: 'center' }} onClick={() => handleSort('nTomadores')}>Tomadores Cadastrados{sortIcon('nTomadores')}</th>
                <th style={{ ...thSort, textAlign: 'center' }} onClick={() => handleSort('nOperacoes')}>Operações Cadastradas{sortIcon('nOperacoes')}</th>
                <th style={{ ...thSort, minWidth: 190 }} onClick={() => handleSort('premio')}>Prêmio{sortIcon('premio')}</th>
                <th style={{ ...thSort, textAlign: 'right' }} onClick={() => handleSort('participacao')}>Participação{sortIcon('participacao')}</th>
                <th style={{ textAlign: 'center', width: 90 }}>Tendência</th>
                <th style={{ textAlign: 'right' }}>Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {rankingOrdenado.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: SOFT }}>Nenhuma corretora encontrada.</td></tr>
              ) : rankingOrdenado.map((r, idx) => {
                const cor = AZUIS[Math.min(idx, AZUIS.length - 1)]
                const spark = serieMensalAlinhada(operacoesEscopo.filter((o) => o.corretora_id === r.id && (!filtroStatus || o.status === filtroStatus)), meses)
                const selecionada = filtroCorretora === r.id
                return (
                  <tr key={r.id} onClick={() => onAbrirCorretora?.(r.id)} style={{ cursor: 'pointer', background: selecionada ? '#eaf2fc' : undefined, boxShadow: selecionada ? `inset 3px 0 0 ${GOLD}` : undefined }}>
                    <td><span style={{ width: 12, height: 12, borderRadius: 3, background: cor, display: 'inline-block' }} /></td>
                    <td style={{ fontWeight: 700, color: INK }}>
                      {r.nome}
                      {!r.ativa && <span className="badge badge-gray" style={{ marginLeft: 6 }}>inativa</span>}
                      {ids8020.has(r.id) && <span className="badge badge-yellow" style={{ marginLeft: 6 }} title="Concentra 80% do prêmio">80/20</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 13, color: SOFT }}>{r.nTomadores}</td>
                    <td style={{ textAlign: 'center', fontSize: 13, color: SOFT }}>{r.nOperacoes}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 9, background: '#eef4fa', borderRadius: 5, overflow: 'hidden', minWidth: 70 }}>
                          <div style={{ width: `${(r.premioTotal / maxPremioRank) * 100}%`, height: '100%', background: NAVY, borderRadius: 5 }} />
                        </div>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, whiteSpace: 'nowrap', minWidth: 92, textAlign: 'right' }}>{fmtMoeda(r.premioTotal)}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: NAVY }}>{fmtPercent(r.participacaoPct ?? 0)}</td>
                    <td style={{ textAlign: 'center' }}><Sparkline valores={spark} cor={NAVY} /></td>
                    <td style={{ textAlign: 'right', fontSize: 12.5, color: SOFT }}>{fmtPercent(r.acumuladoPct ?? 0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Desfecho: Emitidas · Perdidas · Recusadas · Em andamento ── */}
      <div style={painel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ ...tituloBloco, marginBottom: 0 }}><span style={barraTitulo(GREEN)} />Desfecho das operações por corretora · que negócio ela traz</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <Legenda cor={GREEN} texto={`Emitidas ${desfechoTotais.emitidas.n}`} />
            <Legenda cor={NAVY} texto={`Em andamento ${desfechoTotais.andamento.n}`} />
            <Legenda cor="#a0562a" texto={`Perdidas ${desfechoTotais.perdidas.n}`} />
            <Legenda cor={RED} texto={`Recusadas ${desfechoTotais.recusadas.n}`} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: NAVY_DK, borderLeft: `1px solid ${BORDER}`, paddingLeft: 14 }}>
              Aproveitamento geral: <span style={{ color: GREEN }}>{fmtPercent(desfechoConv)}</span>
            </span>
          </div>
        </div>
        {desfecho.length === 0 ? <SemDados /> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="fam-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Corretora</th>
                  <th style={{ textAlign: 'center', width: 90 }}>Apresen&shy;tadas</th>
                  <th style={{ minWidth: 220 }}>Composição do desfecho</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Prêmio emitido</th>
                  <th style={{ textAlign: 'right', width: 110 }}>Aproveita&shy;mento</th>
                </tr>
              </thead>
              <tbody>
                {desfecho.map((d) => {
                  const sel = filtroCorretora === d.id
                  const pct = (n: number) => d.total > 0 ? (n / d.total) * 100 : 0
                  return (
                    <tr key={d.id} onClick={() => toggleCorretora(d.id)} style={{ cursor: 'pointer', background: sel ? '#eaf2fc' : undefined, boxShadow: sel ? `inset 3px 0 0 ${GOLD}` : undefined }}>
                      <td style={{ fontWeight: 700, color: INK }}>{d.nome}</td>
                      <td style={{ textAlign: 'center', fontSize: 13, color: SOFT }}>{d.total}</td>
                      <td>
                        <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: '#eef4fa', minWidth: 180 }}
                          title={`Emitidas ${d.emitidas.n} · Em andamento ${d.andamento.n} · Perdidas ${d.perdidas.n} · Recusadas ${d.recusadas.n}`}>
                          {d.emitidas.n > 0 && <span style={{ width: `${pct(d.emitidas.n)}%`, background: GREEN }} />}
                          {d.andamento.n > 0 && <span style={{ width: `${pct(d.andamento.n)}%`, background: NAVY }} />}
                          {d.perdidas.n > 0 && <span style={{ width: `${pct(d.perdidas.n)}%`, background: '#a0562a' }} />}
                          {d.recusadas.n > 0 && <span style={{ width: `${pct(d.recusadas.n)}%`, background: RED }} />}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: d.emitidas.premio > 0 ? GREEN : SOFT, whiteSpace: 'nowrap' }}>{kpiBRL(d.emitidas.premio)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: d.conversao >= 0.5 ? GREEN : d.conversao > 0 ? NAVY : SOFT }}>
                        {d.decididas > 0 ? fmtPercent(d.conversao) : '·'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 11.5, color: SOFT, marginTop: 8 }}>
          Considera a <b>carteira inteira</b> (inclui emitidas, perdidas e recusadas), independente do filtro de escopo.
          <b> Aproveitamento</b> = emitidas ÷ decididas (emitidas + perdidas + recusadas). Clique numa linha para filtrar o painel.
        </div>
      </div>

      {/* ── Pareto 80/20 (sob demanda, educacional) ── */}
      <div style={painel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ ...tituloBloco, marginBottom: 0 }}><span style={barraTitulo(GOLD)} />Concentração 80/20 (Pareto)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {mostrarPareto && (
              <select className="fam-input" value={metricaPareto} onChange={(e) => setMetricaPareto(e.target.value as MetricaPareto)} style={{ height: 34, width: 'auto', fontSize: 13 }}>
                <option value="premio">Prêmio (status atual)</option>
                <option value="tomadores">Nº de Tomadores</option>
                <option value="operacoes">Nº de Operações</option>
              </select>
            )}
            <button className="btn-secondary" onClick={() => setMostrarPareto((v) => !v)}>
              {mostrarPareto ? 'Ocultar Pareto' : '📊 Analisar concentração'}
            </button>
          </div>
        </div>
        {mostrarPareto && (
          paretoData.length === 0 ? <SemDados /> : (
            <div style={{ marginTop: 12 }}>
              <div style={{ background: '#fdf8e6', border: `1px solid ${GOLD}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#5a4a10' }}>
                <b>{vitalFew}</b> corretora(s), os <b>{fmtPercent(vitalPct)}</b> de {paretoData.length}, concentram <b>80%</b> {metricaTxt}.
                <span style={{ color: SOFT }}> É a “minoria vital” que sustenta a carteira (princípio de Pareto 80/20).</span>
              </div>
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={paretoData} margin={{ left: 4, right: 8, top: 10, bottom: 66 }} onClick={(state) => { const p = (state as unknown as { activePayload?: { payload: { id: string } }[] })?.activePayload?.[0]?.payload; if (p) onAbrirCorretora?.(p.id) }}>
                  <XAxis dataKey="nome" angle={-30} textAnchor="end" interval={0} height={76} tick={{ fontSize: 11, fill: '#304060' }} />
                  <YAxis yAxisId="l" tickFormatter={(v) => metricaPareto === 'premio' ? eixoBRL(Number(v)) : String(Math.round(Number(v)))} tick={{ fontSize: 11, fill: '#304060' }} width={64} />
                  <YAxis yAxisId="r" orientation="right" domain={[0, 1]} tickFormatter={(v) => Math.round(Number(v) * 100) + '%'} tick={{ fontSize: 11, fill: '#304060' }} width={42} />
                  <Tooltip cursor={{ fill: 'rgba(30,64,128,.05)' }} formatter={(v, n) => n === 'Acumulado' ? [fmtPercent(Number(v)), 'Acumulado'] : [fmtParetoVal(Number(v)), 'Valor']} />
                  <ReferenceLine yAxisId="r" y={0.8} stroke={GOLD} strokeDasharray="5 4" strokeWidth={1.5} label={{ value: '80%', position: 'right', fill: '#a0781a', fontSize: 11 }} />
                  <Bar yAxisId="l" dataKey="valor" name="Valor" radius={[4, 4, 0, 0]} cursor="pointer" isAnimationActive={false}>
                    {paretoData.map((x, i) => <Cell key={x.id} fill={i < vitalFew ? NAVY : '#c4d3e6'} />)}
                  </Bar>
                  <Line yAxisId="r" type="monotone" dataKey="acumPct" name="Acumulado" stroke={GOLD} strokeWidth={2.5} dot={{ r: 3, fill: GOLD }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 11.5, color: SOFT, marginTop: 6 }}>Barras <b style={{ color: NAVY }}>azuis</b> = a minoria vital (80%); barras claras = a “cauda longa”. Clique numa barra para abrir a corretora.</div>
            </div>
          )
        )}
      </div>

      {/* ── Análises (grade 2 colunas): Evolução · Treemap · Mix status · Matriz ── */}
      {(cards.mensal || cards.treemap || cards.status || cards.matriz) && (
        <div className="corretoras-analise" id="graficos-corretoras">
          {/* Evolução mensal (com drill-down semanal ao clicar num mês) */}
          {cards.mensal && (
            <div style={painel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ ...tituloBloco, marginBottom: 0 }}>
                  <span style={barraTitulo(GOLD)} />
                  {drillMes
                    ? <>Evolução semanal · <span style={{ color: GOLD, fontWeight: 800 }}>{rotuloMes(drillMes)}</span></>
                    : <>Evolução mensal do prêmio {(pIni || pFim) && <span style={{ color: GOLD, fontWeight: 700 }}>· {periodoLabel}</span>}</>}
                </div>
                {drillMes && (
                  <button className="btn-secondary" onClick={() => setDrillMes(null)} style={{ height: 30, fontSize: 12.5, padding: '0 12px' }}>← Voltar aos meses</button>
                )}
              </div>

              {drillMes ? (
                // ── Drill-down: semanas do mês selecionado ──
                serieSemanal.length === 0 ? <SemDados texto="Sem operações com data neste mês." /> : (
                  <>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={serieSemanal} margin={{ left: 4, right: 8, top: 10, bottom: 8 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#304060' }} />
                        <YAxis tickFormatter={(v) => eixoBRL(Number(v))} tick={{ fontSize: 11, fill: '#304060' }} width={64} />
                        <Tooltip cursor={{ fill: 'rgba(30,64,128,.05)' }} formatter={(v) => [fmtMoeda(Number(v)), 'Prêmio']} labelFormatter={(l) => `Semana de ${l}`} />
                        <Bar dataKey="valor" name="Prêmio" radius={[5, 5, 0, 0]} fill={GOLD} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ fontSize: 11.5, color: SOFT, marginTop: 6 }}>Cada barra é uma semana (data de início · seg–dom).</div>
                  </>
                )
              ) : (
                // ── Visão mensal (clique numa barra para abrir as semanas) ──
                !mounted || serieMensal.length === 0 ? <SemDados texto="Sem histórico com datas." /> : (
                  <>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={serieMensal} margin={{ left: 4, right: 8, top: 10, bottom: 8 }} onClick={(state) => { const p = (state as unknown as { activePayload?: { payload: { mes: string } }[] })?.activePayload?.[0]?.payload; if (p) setDrillMes(p.mes) }}>
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#304060' }} />
                        <YAxis tickFormatter={(v) => eixoBRL(Number(v))} tick={{ fontSize: 11, fill: '#304060' }} width={64} />
                        <Tooltip cursor={{ fill: 'rgba(30,64,128,.05)' }} content={<TooltipMensal />} />
                        <Bar dataKey="premio" name="Prêmio" radius={[5, 5, 0, 0]} cursor="pointer" isAnimationActive={false}>
                          {serieMensal.map((p) => {
                            const realce = (pIni || pFim) && noPeriodo(p.mes)
                            return <Cell key={p.mes} fill={realce ? GOLD : NAVY} fillOpacity={(pIni || pFim) && !noPeriodo(p.mes) ? 0.3 : 1} />
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ fontSize: 11.5, color: SOFT, marginTop: 6 }}>Clique num mês para ver as <b>semanas</b> (drill-down).</div>
                  </>
                )
              )}
            </div>
          )}

          {/* Participação (treemap) */}
          {cards.treemap && (
            <div style={painel} ref={treemapRef}>
              <div style={tituloBloco}><span style={barraTitulo(NAVY)} />Participação no prêmio (share do todo)</div>
              {!mounted || treemapData.length === 0 ? <SemDados /> : (
                <>
                  <ResponsiveContainer width="100%" height={320}>
                    <Treemap data={treemapData} dataKey="size" nameKey="name" stroke="#fff" isAnimationActive={false}
                      content={<CelulaTreemap selectedId={filtroCorretora ?? ''} onPick={toggleCorretora} />} />
                  </ResponsiveContainer>
                  <div style={{ fontSize: 11.5, color: SOFT, marginTop: 6 }}>
                    {filtroCorretora
                      ? <>Filtrando por <b style={{ color: NAVY_DK }}>{nomeFiltroCorretora}</b> — os demais gráficos foram ajustados. <button onClick={() => { setFiltroCorretora(null); setDrillMes(null) }} style={{ background: 'none', border: 'none', color: NAVY, fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>limpar</button></>
                      : <>Clique numa corretora para <b>filtrar</b> os demais gráficos (como no Power BI).</>}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mix por status */}
          {cards.status && (
            <div style={painel}>
              <div style={tituloBloco}><span style={barraTitulo('#8a63c8')} />Mix por status</div>
              {porStatus.length === 0 ? <SemDados /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {porStatus.map((s) => {
                    const ativo = filtroStatus === s.name
                    return (
                      <button key={s.name} onClick={() => toggleStatus(s.name)}
                        style={{ display: 'grid', gridTemplateColumns: '130px 1fr auto', gap: 10, alignItems: 'center', background: ativo ? '#f3eefb' : 'transparent', border: `1px solid ${ativo ? '#8a63c8' : BORDER}`, borderRadius: 8, padding: '8px 11px', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.cor, flexShrink: 0 }} />
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                        </span>
                        <span style={{ height: 10, background: '#eef4fa', borderRadius: 5, overflow: 'hidden' }}>
                          <span style={{ display: 'block', width: `${(s.value / maxStatus) * 100}%`, height: '100%', background: s.cor, borderRadius: 5 }} />
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: SOFT, whiteSpace: 'nowrap', textAlign: 'right' }}>{s.value} · {fmtMoedaCurta(s.premio)}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Matriz Corretora × Mês */}
          {cards.matriz && (
            <div style={painel}>
              <div style={tituloBloco}><span style={barraTitulo(NAVY)} />Matriz Corretora × Mês: prêmio por mês (quanto mais escuro, maior)</div>
              {matriz.linhas.length === 0 || matriz.meses.length === 0 ? <SemDados texto="Sem histórico com datas para montar a matriz." /> : (
                <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
                  <table className="fam-table" style={{ minWidth: 220 + matriz.meses.length * 72, borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ position: 'sticky', left: 0, background: '#1a3560', zIndex: 2, minWidth: 180 }}>Corretora</th>
                        {matriz.meses.map((m) => <th key={m} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{rotuloMes(m)}</th>)}
                        <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matriz.linhas.map((l) => (
                        <tr key={l.id}>
                          <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1, fontWeight: 700, color: INK, minWidth: 180 }}>{l.nome}</td>
                          {l.valores.map((v, i) => {
                            const a = v / matriz.maxCelula
                            return (
                              <td key={i} style={{ textAlign: 'center', fontSize: 11.5, fontWeight: v > 0 ? 700 : 400, background: v > 0 ? `rgba(30,64,128,${(a * 0.85 + 0.06).toFixed(3)})` : undefined, color: a > 0.5 ? '#fff' : '#334', whiteSpace: 'nowrap' }}>
                                {v > 0 ? kpiBRL(v) : '·'}
                              </td>
                            )
                          })}
                          <td style={{ textAlign: 'right', fontWeight: 800, color: NAVY, whiteSpace: 'nowrap' }}>{kpiBRL(l.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Rodapé de totais ── */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', background: `linear-gradient(135deg, ${NAVY_DK}, ${NAVY})`, color: '#fff', borderRadius: 14, padding: '14px 20px' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#a9c4e8', textTransform: 'uppercase', letterSpacing: '.4px' }}>Totais no escopo</span>
        <TotalRodape label="Corretoras" valor={String(totais.nCorretoras)} />
        <TotalRodape label="Tomadores" valor={String(totais.nTomadores)} />
        <TotalRodape label="Operações" valor={String(totais.nOperacoes)} />
        <TotalRodape label="Prêmio" valor={kpiBRL(totais.premioTotal)} destaque />
        <TotalRodape label="LMG" valor={kpiBRL(totais.lmgTotal)} />
        <TotalRodape label="Taxa Média" valor={fmtPercent(totais.taxaMediaPond / 100)} />
      </div>

      {/* ── Pré-visualização do PDF ── */}
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
                <a href={preview.url} download={preview.filename} className="btn-primary" style={{ textDecoration: 'none' }}>⬇ Baixar PDF</a>
                <button className="btn-secondary" style={{ background: 'transparent', color: '#fff', borderColor: '#3a5a86' }} onClick={() => setPreview(null)}>✕ Fechar</button>
              </div>
            </div>
            <iframe src={preview.url} title="Pré-visualização do PDF" style={{ flex: 1, width: '100%', border: 'none', background: '#525659' }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function TotalRodape({ label, valor, destaque = false }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#a9c4e8', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
      <span style={{ fontSize: destaque ? 18 : 15, fontWeight: 800, color: destaque ? GOLD : '#fff' }}>{valor}</span>
    </div>
  )
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: SOFT, whiteSpace: 'nowrap' }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: cor, flexShrink: 0 }} />{texto}
    </span>
  )
}

function Chip({ cor, label, onClear }: { cor: string; label: string; onClear: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '4px 6px 4px 10px', fontSize: 12.5, fontWeight: 700, color: INK }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: cor }} />
      {label}
      <button onClick={onClear} aria-label="Remover filtro" style={{ width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#eef2f7', color: SOFT, cursor: 'pointer', fontSize: 12, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
    </span>
  )
}

function KpiHero({ label, valor, sub, delta, spark, selMesIdx = -1, destaque = false, wide = false, miniSerie, onMini }: {
  label: string; valor: string; sub: string; delta?: number | null; spark: number[]; selMesIdx?: number; destaque?: boolean; wide?: boolean; miniSerie?: number[]; onMini?: () => void
}) {
  const temDelta = delta != null && isFinite(delta)
  const positivo = (delta ?? 0) >= 0
  const compacto = !!onMini // os 4 cards menores: densos, com mini-gráfico ocupando a faixa inferior
  return (
    <div style={{
      gridColumn: wide ? 'span 2' : undefined,
      background: destaque ? `linear-gradient(135deg, ${NAVY_DK}, ${NAVY})` : '#fff',
      color: destaque ? '#fff' : INK,
      border: `1px solid ${destaque ? 'transparent' : BORDER}`, borderRadius: 14,
      padding: compacto ? '12px 14px 10px' : '15px 16px 12px',
      boxShadow: destaque ? '0 8px 22px rgba(16,32,64,.28)' : '0 6px 18px rgba(16,32,64,.13)', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: destaque ? '#a9c4e8' : SOFT }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: compacto ? 3 : 5, flexWrap: 'wrap' }}>
        <div style={{ fontSize: compacto ? 'clamp(16px, 4vw, 20px)' : 'clamp(17px, 4.5vw, 22px)', fontWeight: 800, color: destaque ? GOLD : INK, lineHeight: 1.05, wordBreak: 'break-word' }}>{valor}</div>
        {temDelta && (
          <span style={{ fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', color: positivo ? (destaque ? '#7ee0a8' : GREEN) : (destaque ? '#f2a3a3' : RED) }}>
            {positivo ? '▲' : '▼'} {fmtPercent(Math.abs(delta as number))}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: destaque ? '#a9c4e8' : SOFT, marginTop: 3 }}>{sub}</div>
      {spark.length > 1 && <div style={{ marginTop: 8 }}><Sparkline valores={spark} cor={destaque ? GOLD : NAVY} largura={200} altura={30} destaqueIdx={selMesIdx} fluida /></div>}
      {miniSerie && <MiniBarras valores={miniSerie} cor={NAVY} altura={40} onClick={onMini} ariaLabel={`Ver análises mensais — ${label}`} />}
    </div>
  )
}

// Mini-gráfico de barras (SVG inline leve, no espírito do Sparkline). Barras finas
// de topo levemente arredondado, ancoradas na base, gap ~2px; a ÚLTIMA em GOLD
// (destaca o mês mais recente). É um botão: clicar leva às análises do fim da tela.
function MiniBarras({ valores, cor = NAVY, altura = 40, onClick, ariaLabel }: {
  valores: number[]; cor?: string; altura?: number; onClick?: () => void; ariaLabel?: string
}) {
  const W = 220, H = altura
  const n = valores.length
  const max = Math.max(...valores, 0)
  const vazio = n < 2 || max <= 0
  const GAP = 2.5, PAD_TOP = 3 // gap ~2px na tela + respiro p/ a barra mais alta
  const barW = n > 0 ? Math.max(1, (W - GAP * (n - 1)) / n) : W
  const raio = Math.min(barW / 2, 1.8) // topo levemente arredondado (raio pequeno)
  const ultimo = n - 1
  return (
    <button type="button" className="kpi-mini" onClick={onClick} aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} preserveAspectRatio="none" aria-hidden="true">
        {vazio ? (
          // <2 valores ou tudo zero: apenas uma linha-base discreta.
          <line x1={0} y1={H - 1} x2={W} y2={H - 1} stroke={BORDER} strokeWidth={1} />
        ) : valores.map((v, i) => {
          const h = (v / max) * (H - PAD_TOP)
          if (h <= 0) return null
          const x = i * (barW + GAP)
          const y = H - h
          const rr = Math.min(raio, h, barW / 2)
          // topo arredondado, base reta ancorada em H
          const d = `M${x},${H} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + barW - rr},${y} Q${x + barW},${y} ${x + barW},${y + rr} L${x + barW},${H} Z`
          return <path key={i} d={d} fill={i === ultimo ? GOLD : cor} />
        })}
      </svg>
      <span className="kpi-mini-hint">ver análise <span className="kpi-mini-seta" aria-hidden="true">↗</span></span>
    </button>
  )
}

function Sparkline({ valores, cor, largura = 78, altura = 22, destaqueIdx = -1, fluida = false }: { valores: number[]; cor: string; largura?: number; altura?: number; destaqueIdx?: number; fluida?: boolean }) {
  if (valores.length < 2) return <span style={{ fontSize: 11, color: '#c0ccda' }}>·</span>
  const max = Math.max(...valores, 1)
  const min = Math.min(...valores, 0)
  const span = max - min || 1
  const dx = largura / (valores.length - 1)
  const y = (v: number) => altura - 3 - ((v - min) / span) * (altura - 6)
  const pts = valores.map((v, i) => `${i * dx},${y(v)}`).join(' ')
  const ultimo = valores.length - 1
  return (
    <svg width={fluida ? '100%' : largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio={fluida ? 'none' : 'xMidYMid meet'} style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={cor} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      {destaqueIdx >= 0 && destaqueIdx < valores.length && (
        <circle cx={destaqueIdx * dx} cy={y(valores[destaqueIdx])} r={3} fill={GOLD} stroke="#fff" strokeWidth={1} />
      )}
      <circle cx={ultimo * dx} cy={y(valores[ultimo])} r={2.4} fill={cor} />
    </svg>
  )
}

function SemDados({ texto = 'Sem dados no escopo atual.' }: { texto?: string }) {
  return <div style={{ textAlign: 'center', color: '#a0b8d0', padding: '38px 0', fontSize: 13 }}>{texto}</div>
}

function TooltipMensal({ active, payload, label }: { active?: boolean; payload?: { payload: { premio: number; qtd: number } }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 16px rgba(16,32,64,.14)', fontSize: 12.5 }}>
      <div style={{ fontWeight: 800, color: INK, marginBottom: 4 }}>{label}</div>
      <div style={{ color: NAVY, fontWeight: 700 }}>{fmtMoeda(p.premio)}</div>
      <div style={{ color: SOFT }}>{p.qtd} operação(ões)</div>
    </div>
  )
}

// Célula do Treemap: azul sequencial por rank, rótulo legível (nome + %).
// selectedId (cross-filter): a célula escolhida ganha contorno dourado; as
// demais ficam esmaecidas — feedback visual "à la Power BI".
function CelulaTreemap(props: {
  x?: number; y?: number; width?: number; height?: number
  name?: string; id?: string; rank?: number; pct?: number; selectedId?: string; onPick?: (id: string) => void
}) {
  const { x = 0, y = 0, width = 0, height = 0, name = '', id = '', rank = 0, pct = 0, selectedId = '', onPick } = props
  if (!id) return null
  const outras = id === '__outras__'
  const cor = outras ? '#7d97bd' : AZUIS[Math.min(rank, AZUIS.length - 1)]
  const claro = rank >= 4
  const txt = claro ? '#0a1628' : '#fff'
  const selecionada = !!selectedId && id === selectedId
  const esmaecida = !!selectedId && !selecionada
  // Trunca o nome conforme a largura real da célula (evita texto vazando).
  const maxChars = Math.max(4, Math.floor((width - 14) / 7.2))
  const nomeCurto = name.length > maxChars ? name.slice(0, Math.max(1, maxChars - 1)) + '…' : name
  const cabeNome = width > 46 && height > 26
  const cabePct = width > 46 && height > 44
  return (
    <g style={{ cursor: outras ? 'default' : 'pointer', opacity: esmaecida ? 0.35 : 1 }} onClick={() => !outras && id && onPick?.(id)}>
      <rect x={x} y={y} width={width} height={height} fill={cor} stroke={selecionada ? GOLD : '#fff'} strokeWidth={selecionada ? 3.5 : 2} />
      {cabeNome && <text x={x + 10} y={y + 22} fontFamily={FONTE} fontSize={13.5} fontWeight={700} fill={txt}>{nomeCurto}</text>}
      {cabePct && <text x={x + 10} y={y + 41} fontFamily={FONTE} fontSize={12.5} fontWeight={600} fill={txt} opacity={0.92}>{(pct * 100).toFixed(1).replace('.', ',')}%</text>}
    </g>
  )
}
