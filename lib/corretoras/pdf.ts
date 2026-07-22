// ============================================================
//  Geradores de PDF do Panorama de Corretoras — 2 modos:
//   • gerarPdfGeral      → todas as corretoras (KPIs + ranking c/ participação)
//   • gerarPdfCorretora  → uma corretora (KPIs + tomadores c/ participação)
//
//  Ambos retornam { url, filename } via blob URL (robusto p/ PDF grande —
//  padrão de relatorios/contabil), para abrir em PRÉ-VISUALIZAÇÃO antes de
//  salvar. Tabela + "gráfico": a coluna Participação traz uma barra desenhada
//  na célula (didDrawCell); um gráfico da tela pode ser embutido como imagem.
// ============================================================
import { fmtMoeda, fmtPercent } from '@/lib/utils'

// Paleta FAM em RGB.
const NAVY: [number, number, number] = [10, 22, 40]
const GOLD: [number, number, number] = [232, 184, 75]
const AZUL_CLARO: [number, number, number] = [160, 192, 232]
const HEAD_TAB: [number, number, number] = [26, 53, 96]
const ZEBRA: [number, number, number] = [232, 240, 250]
const BARRA_TRILHO: [number, number, number] = [223, 233, 245]
const BARRA_COR: [number, number, number] = [46, 112, 200]

const W = 297, H = 210, M = 8

export interface KpisResumoPdf {
  premioTotal: number
  lmgTotal: number
  nOperacoes: number
  nTomadores: number
  ticketMedio: number
  taxaMediaPond: number // em pontos percentuais (0,82 = 0,82%)
}

export interface ImagemGrafico { dataUrl: string; w: number; h: number }

export interface LinhaRankingPdf {
  nome: string
  ativa: boolean
  nTomadores: number
  nOperacoes: number
  premioTotal: number
  participacaoPct: number // fração 0..1
}

export interface LinhaTomadorPdf {
  nome: string
  nOperacoes: number
  premioTotal: number
  lmgTotal: number
  participacaoPct: number // fração 0..1 (dentro da corretora)
}

// ── Cabeçalho / rodapé padrão FAM ────────────────────────────────────────────
async function novoDoc() {
  const { default: jsPDF } = await import('jspdf')
  return new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
}

type Doc = Awaited<ReturnType<typeof novoDoc>>

function cabecalho(doc: Doc, titulo: string, subtitulo: string) {
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 26, 'F')
  doc.setFillColor(...GOLD); doc.rect(0, 0, W, 2.5, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(255, 255, 255)
  doc.text('FAM', M, 17)
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.5); doc.line(30, 7, 30, 21)
  doc.setFontSize(7); doc.setTextColor(...GOLD); doc.text('S E G U R A D O R A', 34, 11)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255)
  doc.text(titulo, 34, 19)
  const agora = new Date()
  const data = agora.toLocaleDateString('pt-BR')
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...AZUL_CLARO)
  doc.text(`Emitido em ${data} às ${hora}`, W - M, 10, { align: 'right' })
  if (subtitulo) doc.text(subtitulo, W - M, 16, { align: 'right' })
}

function rodape(doc: Doc) {
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.4); doc.line(M, H - 10, W - M, H - 10)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 130, 145)
    doc.text('FAM Seguradora — Relatório Confidencial · gerado automaticamente pelo FAM CRM', M, H - 6)
    doc.text(`Página ${i} de ${paginas}`, W - M, H - 6, { align: 'right' })
  }
}

// KPIs em cartões arredondados. Retorna o Y após os cartões.
function desenharKpis(doc: Doc, y: number, kpis: KpisResumoPdf): number {
  const cards: [string, string][] = [
    ['Prêmio Previsto', fmtMoeda(kpis.premioTotal)],
    ['LMG (exposição)', fmtMoeda(kpis.lmgTotal)],
    ['Operações', String(kpis.nOperacoes)],
    ['Tomadores', String(kpis.nTomadores)],
    ['Ticket Médio', fmtMoeda(kpis.ticketMedio)],
    ['Taxa Média Pond.', fmtPercent(kpis.taxaMediaPond / 100)],
  ]
  const gap = 4
  const cardW = (W - M * 2 - gap * (cards.length - 1)) / cards.length
  const cardH = 18
  cards.forEach(([label, valor], i) => {
    const x = M + i * (cardW + gap)
    doc.setFillColor(245, 248, 252); doc.setDrawColor(...ZEBRA)
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(96, 128, 160)
    doc.text(label.toUpperCase(), x + 3, y + 6)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(16, 32, 64)
    doc.text(valor, x + 3, y + 14)
  })
  return y + cardH
}

// Embute imagem de gráfico (se houver), ajustada à largura útil. Retorna novo Y.
function desenharGrafico(doc: Doc, y: number, img: ImagemGrafico | null | undefined, maxAltura = 62): number {
  if (!img || !img.dataUrl) return y
  const usable = W - M * 2
  const ratio = img.h / img.w || 0.4
  let drawW = usable
  let drawH = drawW * ratio
  if (drawH > maxAltura) { drawH = maxAltura; drawW = drawH / ratio }
  const x = M + (usable - drawW) / 2
  try { doc.addImage(img.dataUrl, 'PNG', x, y, drawW, drawH) } catch { return y }
  return y + drawH
}

// Callback que desenha uma barrinha de proporção no rodapé da célula da coluna dada.
function barraNaCelula(doc: Doc, pcts: number[], colIndex: number) {
  return (data: {
    section: string; column: { index: number }; row: { index: number }
    cell: { x: number; y: number; width: number; height: number }
  }) => {
    if (data.section !== 'body' || data.column.index !== colIndex) return
    const pct = pcts[data.row.index] ?? 0
    const { x, y, width, height } = data.cell
    const bx = x + 3, bw = width - 6, by = y + height - 4
    doc.setFillColor(...BARRA_TRILHO); doc.rect(bx, by, bw, 2.2, 'F')
    doc.setFillColor(...BARRA_COR); doc.rect(bx, by, bw * Math.min(1, Math.max(0, pct)), 2.2, 'F')
  }
}

// ── PDF GERAL — todas as corretoras ──────────────────────────────────────────
export async function gerarPdfGeral(input: {
  ranking: LinhaRankingPdf[]
  kpis: KpisResumoPdf
  periodoLabel: string
  chart?: ImagemGrafico | null
}): Promise<{ url: string; filename: string }> {
  const { ranking, kpis, periodoLabel, chart } = input
  const doc = await novoDoc()
  const { default: autoTable } = await import('jspdf-autotable')

  cabecalho(doc, 'Panorama Gerencial de Corretoras', `Período: ${periodoLabel}`)
  let y = desenharKpis(doc, 32, kpis)
  y = desenharGrafico(doc, y + 5, chart)

  const pcts = ranking.map((r) => r.participacaoPct)
  autoTable(doc, {
    startY: y + 6,
    head: [['#', 'Corretora', 'Situação', 'Tomadores', 'Operações', 'Prêmio Previsto', 'Participação']],
    body: ranking.map((r, i) => [
      i + 1, r.nome, r.ativa ? 'Ativa' : 'Inativa', r.nTomadores, r.nOperacoes, fmtMoeda(r.premioTotal), fmtPercent(r.participacaoPct),
    ]),
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 3, bottom: 5, left: 3, right: 3 } },
    headStyles: { fillColor: HEAD_TAB, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: {
      0: { cellWidth: 10, halign: 'right' }, 2: { halign: 'center' },
      3: { halign: 'center' }, 4: { halign: 'center' },
      5: { halign: 'right' }, 6: { cellWidth: 46, halign: 'left' },
    },
    margin: { left: M, right: M, bottom: 14 },
    didDrawCell: barraNaCelula(doc, pcts, 6),
  })

  rodape(doc)
  const blob = doc.output('blob')
  return { url: URL.createObjectURL(blob), filename: `FAM_Panorama_Corretoras_${new Date().toISOString().slice(0, 10)}.pdf` }
}

// ── PDF INDIVIDUAL — uma corretora e sua cadeia ──────────────────────────────
export async function gerarPdfCorretora(input: {
  corretoraNome: string
  kpis: KpisResumoPdf
  tomadores: LinhaTomadorPdf[]
  periodoLabel: string
  chart?: ImagemGrafico | null
}): Promise<{ url: string; filename: string }> {
  const { corretoraNome, kpis, tomadores, periodoLabel, chart } = input
  const doc = await novoDoc()
  const { default: autoTable } = await import('jspdf-autotable')

  cabecalho(doc, `Dossiê da Corretora · ${corretoraNome}`, `Período: ${periodoLabel}`)
  let y = desenharKpis(doc, 32, kpis)
  y = desenharGrafico(doc, y + 5, chart)

  const pcts = tomadores.map((t) => t.participacaoPct)
  autoTable(doc, {
    startY: y + 6,
    head: [['#', 'Tomador', 'Operações', 'Prêmio Previsto', 'LMG', 'Part. na corretora']],
    body: tomadores.map((t, i) => [
      i + 1, t.nome, t.nOperacoes, fmtMoeda(t.premioTotal), fmtMoeda(t.lmgTotal), fmtPercent(t.participacaoPct),
    ]),
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 3, bottom: 5, left: 3, right: 3 } },
    headStyles: { fillColor: HEAD_TAB, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: {
      0: { cellWidth: 10, halign: 'right' }, 2: { halign: 'center' },
      3: { halign: 'right' }, 4: { halign: 'right' }, 5: { cellWidth: 52, halign: 'left' },
    },
    margin: { left: M, right: M, bottom: 14 },
    didDrawCell: barraNaCelula(doc, pcts, 5),
  })

  rodape(doc)
  const blob = doc.output('blob')
  const slug = corretoraNome.normalize('NFD').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Corretora'
  return { url: URL.createObjectURL(blob), filename: `FAM_Corretora_${slug}_${new Date().toISOString().slice(0, 10)}.pdf` }
}
