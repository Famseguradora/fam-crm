// ============================================================
//  Comparativo de Corretoras — fonte única de dados + geradores de HTML.
//
//  A MESMA fonte alimenta: (a) a tela de comparação (colunas lado a lado),
//  (b) o HTML autocontido para envio por e-mail. Os números batem com a
//  ficha da corretora (usa TODAS as operações da corretora, como o dossiê).
// ============================================================
import { fmtMoeda } from '@/lib/utils'
import { type CorretoraAgg, type DesfechoCorretora } from './agregacoes'

// ── Métricas comparáveis de uma corretora ───────────────────────────────────
export interface CorretoraMetricas {
  id: string
  nome: string
  ativa: boolean
  previsto: number       // R$ prêmio previsto (todas as operações)
  emitido: number        // R$ prêmio emitido
  lmg: number            // R$ exposição (LMG, teto por operação)
  operacoes: number
  tomadores: number
  taxa: number           // pontos percentuais (ex.: 2.40)
  ticket: number         // R$ ticket médio
  conversao: number      // fração 0..1 (emitidas ÷ total)
  participacao: number   // fração 0..1 do previsto sobre o total da FAM
}

// Monta as métricas de cada corretora selecionada SEGUINDO a métrica já usada no
// cockpit: previsto/LMG/operações/tomadores/ticket/taxa/participação vêm do
// RANKING (respeita período+escopo+status); emitido/conversão vêm do DESFECHO
// (carteira do período). Assim o comparativo bate exatamente com a tela.
export function metricasComparativas(ids: string[], ranking: CorretoraAgg[], desfecho: DesfechoCorretora[]): CorretoraMetricas[] {
  const rMap = new Map(ranking.map((r) => [r.id, r]))
  const dMap = new Map(desfecho.map((d) => [d.id, d]))
  return ids.map((id) => {
    const r = rMap.get(id)
    const d = dMap.get(id)
    return {
      id,
      nome: r?.nome ?? d?.nome ?? '—',
      ativa: r?.ativa ?? false,
      previsto: r?.premioTotal ?? 0,
      emitido: d?.emitidas.premio ?? 0,
      lmg: r?.lmgTotal ?? 0,
      operacoes: r?.nOperacoes ?? 0,
      tomadores: r?.nTomadores ?? 0,
      taxa: r?.taxaMediaPond ?? 0,
      ticket: r?.ticketMedio ?? 0,
      conversao: d?.conversao ?? 0,
      participacao: r?.participacaoPct ?? 0,
    }
  })
}

// ── Formatadores (compartilhados entre a tela e o HTML) ──────────────────────
export const brlCurto = (v: number): string => {
  const abs = Math.abs(v)
  if (abs >= 1e9) return 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' Bi'
  if (abs >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' Mi'
  if (abs >= 1e3) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' mil'
  return fmtMoeda(v)
}
const fmtPP = (v: number): string => `${(v || 0).toFixed(2).replace('.', ',')}%`
const fmtPct = (v: number): string => `${((v || 0) * 100).toFixed(1).replace('.', ',')}%`
const fmtInt = (v: number): string => Math.round(v).toLocaleString('pt-BR')

// ── Descritor das linhas (métricas) — usado na tela E no HTML ────────────────
export interface LinhaMetrica {
  label: string
  valor: (m: CorretoraMetricas) => number
  fmt: (v: number) => string
  bar?: boolean   // desenha mini-barra proporcional ao maior da linha
}
export const LINHAS_COMPARATIVO: LinhaMetrica[] = [
  { label: 'Prêmio previsto', valor: (m) => m.previsto, fmt: brlCurto, bar: true },
  { label: 'Prêmio emitido', valor: (m) => m.emitido, fmt: brlCurto, bar: true },
  { label: 'LMG · exposição', valor: (m) => m.lmg, fmt: brlCurto },
  { label: 'Operações', valor: (m) => m.operacoes, fmt: fmtInt, bar: true },
  { label: 'Tomadores', valor: (m) => m.tomadores, fmt: fmtInt },
  { label: 'Taxa méd. pond.', valor: (m) => m.taxa, fmt: fmtPP },
  { label: 'Ticket médio', valor: (m) => m.ticket, fmt: brlCurto },
  { label: 'Conversão', valor: (m) => m.conversao, fmt: fmtPct, bar: true },
  { label: 'Participação FAM', valor: (m) => m.participacao, fmt: fmtPct, bar: true },
]

// ── Utilidades de HTML ───────────────────────────────────────────────────────
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
))
const carimboData = (): string => {
  const d = new Date()
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
export const nomeArquivo = (base: string): string => {
  const d = new Date()
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `${base}_${iso}.html`
}

// Moldura comum (mesma paleta dark/glass do cockpit) — self-contained.
function moldura(titulo: string, subtitulo: string, corpo: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} · FAM Seguradora</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px; font-family: Calibri,'Segoe UI',Arial,sans-serif;
    background: radial-gradient(1100px 620px at 12% -12%, rgba(74,144,208,.18), transparent 58%),
      radial-gradient(900px 520px at 104% -4%, rgba(232,184,75,.10), transparent 55%),
      linear-gradient(180deg,#0a1122 0%,#070b16 60%); color: #eaf0fb; }
  .wrap { max-width: 1180px; margin: 0 auto; }
  .head { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; }
  .logo { width: 46px; height: 46px; border-radius: 13px; display: grid; place-items: center; font-size: 22px; font-weight: 800;
    color: #0a1628; background: linear-gradient(145deg,#e8b84b,#c0901a); box-shadow: 0 8px 22px -8px rgba(232,184,75,.6); }
  .h-tt { font-size: 22px; font-weight: 800; letter-spacing: .2px; }
  .h-sub { font-size: 12.5px; color: #8fb0dd; letter-spacing: 1.4px; text-transform: uppercase; margin-top: 3px; }
  .card { background: linear-gradient(180deg, rgba(255,255,255,.085), rgba(255,255,255,.05)), rgba(10,17,32,.9);
    border: 1px solid rgba(255,255,255,.12); border-radius: 16px; padding: 18px; box-shadow: 0 18px 40px -18px rgba(0,0,0,.6); }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { padding: 11px 12px; text-align: right; border-bottom: 1px solid rgba(255,255,255,.06); font-variant-numeric: tabular-nums; }
  th.lab, td.lab { text-align: left; }
  thead th { position: sticky; top: 0; font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: #aab7d0;
    border-bottom: 1px solid rgba(255,255,255,.16); background: #0d1220; }
  thead th.cor { color: #eaf0fb; font-size: 14px; text-transform: none; letter-spacing: 0; }
  tbody td.lab { color: #aab7d0; font-weight: 700; }
  .cell { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 5px; width: 100%; }
  .val { font-weight: 800; }
  .bar { width: 100%; max-width: 150px; height: 7px; border-radius: 5px; background: rgba(255,255,255,.07); overflow: hidden; }
  .bar > i { display: block; height: 100%; border-radius: 5px; background: linear-gradient(90deg,#3f74b8,#66aef0); }
  .best .val { color: #f0c765; }
  .best .bar > i { background: linear-gradient(90deg,#e8b84b,#c0901a); }
  .figs { display: flex; flex-wrap: wrap; gap: 18px; }
  .fig { flex: 1 1 460px; background: rgba(10,17,32,.6); border: 1px solid rgba(255,255,255,.10); border-radius: 14px; padding: 14px; }
  .fig h3 { margin: 0 0 10px; font-size: 15px; font-weight: 800; color: #eaf0fb; }
  .fig img { width: 100%; height: auto; display: block; border-radius: 8px; }
  .foot { margin-top: 18px; font-size: 11.5px; color: #7787a3; text-align: center; }
</style></head>
<body><div class="wrap">
  <div class="head">
    <div class="logo">◆</div>
    <div><div class="h-tt">${esc(titulo)}</div><div class="h-sub">${esc(subtitulo)}</div></div>
  </div>
  ${corpo}
  <div class="foot">Gerado em ${carimboData()} · FAM Seguradora · Inteligência de Corretoras</div>
</div></body></html>`
}

// HTML do comparativo de CORRETORAS (métricas nas linhas, corretoras nas colunas).
export function htmlComparativoCorretoras(metricas: CorretoraMetricas[]): string {
  const cols = metricas.map((m) => `<th class="cor">${esc(m.nome)}</th>`).join('')
  const linhas = LINHAS_COMPARATIVO.map((lin) => {
    const vals = metricas.map((m) => lin.valor(m))
    const max = Math.max(0, ...vals) || 1
    const cells = metricas.map((m, i) => {
      const v = vals[i]
      const best = v === max && v > 0 && metricas.length > 1
      const bar = lin.bar ? `<span class="bar"><i style="width:${Math.round((v / max) * 100)}%"></i></span>` : ''
      return `<td class="${best ? 'best' : ''}"><span class="cell"><span class="val">${esc(lin.fmt(v))}</span>${bar}</span></td>`
    }).join('')
    return `<tr><td class="lab">${esc(lin.label)}</td>${cells}</tr>`
  }).join('')
  const corpo = `<div class="card"><table>
    <thead><tr><th class="lab">Métrica</th>${cols}</tr></thead>
    <tbody>${linhas}</tbody>
  </table></div>`
  return moldura('Comparativo de Corretoras', `${metricas.length} corretoras · destaque em dourado = maior valor`, corpo)
}

// HTML dos GRÁFICOS lado a lado (imagens PNG já capturadas da tela).
export function htmlComparativoGraficos(itens: { titulo: string; png: string }[]): string {
  const figs = itens.map((it) => `<div class="fig"><h3>${esc(it.titulo)}</h3><img src="${it.png}" alt="${esc(it.titulo)}"></div>`).join('')
  const corpo = `<div class="figs">${figs}</div>`
  return moldura('Comparativo de Gráficos', `${itens.length} gráficos lado a lado`, corpo)
}

// ── Relatório do Painel (KPIs + ranking + gráficos selecionados → HTML) ───────
// Gera o mesmo retrato da tela inicial de Corretoras num HTML autocontido, pronto
// para a diretoria (abrir, baixar ou imprimir em PDF). Reaproveita a moldura, os
// formatadores e a paleta do comparativo — fonte única de estilo.
export interface RelatorioKpi { label: string; valor: string; sub?: string }
export interface RelatorioFig { titulo: string; png: string; wide?: boolean }
export interface RelatorioRankLinha { nome: string; nOperacoes: number; premio: number; participacao: number; ativa: boolean }

export function htmlRelatorioPainel(opts: {
  periodoLabel: string
  kpis: RelatorioKpi[]
  ranking?: RelatorioRankLinha[]
  figuras: RelatorioFig[]
}): string {
  const { periodoLabel, kpis, ranking, figuras } = opts

  const estilo = `<style>
    .rel-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .rel-kpi { background: linear-gradient(180deg, rgba(255,255,255,.085), rgba(255,255,255,.05)), rgba(10,17,32,.9);
      border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: 14px 16px; }
    .rel-kpi .l { font-size: 11.5px; color: #8fb0dd; text-transform: uppercase; letter-spacing: .5px; }
    .rel-kpi .v { font-size: 23px; font-weight: 800; margin-top: 6px; }
    .rel-kpi .s { font-size: 11px; color: #7787a3; margin-top: 3px; }
    .rel-sec-tt { font-size: 15px; font-weight: 800; margin: 24px 0 10px; display: flex; align-items: center; gap: 9px; }
    .rel-sec-tt::before { content: ''; width: 5px; height: 18px; border-radius: 3px; background: linear-gradient(180deg,#e8b84b,#c0901a); }
    .rel-rank th.n, .rel-rank td.n { text-align: right; }
    .rel-rank th.nm, .rel-rank td.nm { text-align: left; }
    .rel-rank tbody td.nm { color: #eaf0fb; font-weight: 600; }
    .rel-bar { display: inline-block; width: 80px; height: 7px; border-radius: 5px; background: rgba(255,255,255,.07);
      overflow: hidden; vertical-align: middle; margin-left: 8px; }
    .rel-bar > i { display: block; height: 100%; background: linear-gradient(90deg,#3f74b8,#66aef0); border-radius: 5px; }
    .fig.wide { flex-basis: 100%; }
    @media print {
      body { background: #fff !important; color: #111 !important; padding: 0 !important; }
      .rel-kpi, .card, .fig { break-inside: avoid; }
    }
  </style>`

  const kpisHtml = `<div class="rel-kpis">${kpis.map((k) =>
    `<div class="rel-kpi"><div class="l">${esc(k.label)}</div><div class="v">${esc(k.valor)}</div>${k.sub ? `<div class="s">${esc(k.sub)}</div>` : ''}</div>`,
  ).join('')}</div>`

  let rankHtml = ''
  if (ranking && ranking.length) {
    const max = Math.max(1, ...ranking.map((r) => r.premio))
    const totOps = ranking.reduce((s, r) => s + r.nOperacoes, 0)
    const totPrem = ranking.reduce((s, r) => s + r.premio, 0)
    // Participação com 2 casas para bater com a tela (fmtPercent de lib/utils).
    const pct2 = (v: number) => `${((v || 0) * 100).toFixed(2).replace('.', ',')}%`
    const linhas = ranking.map((r, i) => `<tr>
      <td class="nm">${i + 1}. ${esc(r.nome)}${r.ativa ? '' : ' <span style="color:#b0894b;font-size:11px">(inativa)</span>'}</td>
      <td class="n">${fmtInt(r.nOperacoes)}</td>
      <td class="n">${esc(brlCurto(r.premio))}<span class="rel-bar"><i style="width:${Math.round((r.premio / max) * 100)}%"></i></span></td>
      <td class="n">${pct2(r.participacao)}</td>
    </tr>`).join('')
    rankHtml = `<div class="rel-sec-tt">Ranking de Corretoras</div>
    <div class="card"><div style="overflow-x:auto"><table class="rel-rank">
      <thead><tr><th class="nm">Corretora</th><th class="n">Operações</th><th class="n">Prêmio previsto</th><th class="n">Participação</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td class="nm">TOTAL · ${ranking.length} corretoras</td><td class="n">${fmtInt(totOps)}</td><td class="n">${esc(brlCurto(totPrem))}</td><td class="n">100%</td></tr></tfoot>
    </table></div></div>`
  }

  const figsHtml = figuras.length
    ? `<div class="rel-sec-tt">Gráficos</div><div class="figs">${figuras.map((f) =>
        `<div class="fig${f.wide ? ' wide' : ''}"><h3>${esc(f.titulo)}</h3><img src="${f.png}" alt="${esc(f.titulo)}"></div>`,
      ).join('')}</div>`
    : ''

  return moldura('Painel de Corretoras', periodoLabel, `${estilo}${kpisHtml}${rankHtml}${figsHtml}`)
}
