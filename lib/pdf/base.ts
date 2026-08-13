// ============================================================
//  ⭐ FONTE ÚNICA da identidade visual dos PDFs da FAM.
//
//  Extraído de lib/corretoras/pdf.ts, que era o único gerador de PDF
//  executivo do CRM. Quando a tela "KPIs por Mês" ganhou impressão, duplicar
//  o cabeçalho teria criado dois PDFs "da FAM" com marcas diferentes assim
//  que alguém mexesse em um dos dois.
//
//  Quem usa: lib/corretoras/pdf.ts (Panorama e Dossiê de Corretora) e
//  lib/operacoes/pdf-mensal.ts (KPIs por Mês e o relatório gerencial).
// ============================================================
import { fmtMoeda, fmtPercent } from '@/lib/utils'

// Paleta FAM em RGB.
export const NAVY: [number, number, number] = [10, 22, 40]
export const GOLD: [number, number, number] = [232, 184, 75]
export const AZUL_CLARO: [number, number, number] = [160, 192, 232]
export const HEAD_TAB: [number, number, number] = [26, 53, 96]
export const ZEBRA: [number, number, number] = [232, 240, 250]
const BARRA_TRILHO: [number, number, number] = [223, 233, 245]
const BARRA_COR: [number, number, number] = [46, 112, 200]

// A4 deitado, em mm. M é a margem útil.
export const W = 297, H = 210, M = 8

export interface KpisResumoPdf {
  premioTotal: number
  lmgTotal: number
  nOperacoes: number
  nTomadores: number
  ticketMedio: number
  taxaMediaPond: number // em pontos percentuais (0,82 = 0,82%)
}

export interface ImagemGrafico { dataUrl: string; w: number; h: number }

export async function novoDoc() {
  const { default: jsPDF } = await import('jspdf')
  return new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
}

export type Doc = Awaited<ReturnType<typeof novoDoc>>

// Cabeçalho padrão: faixa navy, marca FAM, título e data de emissão.
export function cabecalho(doc: Doc, titulo: string, subtitulo: string) {
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

// Rodapé confidencial + paginação. Chamar por último, quando o total de
// páginas já é conhecido.
export function rodape(doc: Doc) {
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
export function desenharKpis(doc: Doc, y: number, kpis: KpisResumoPdf): number {
  const cards: [string, string][] = [
    ['Prêmio Previsto', fmtMoeda(kpis.premioTotal)],
    ['LMG (exposição)', fmtMoeda(kpis.lmgTotal)],
    ['Operações', String(kpis.nOperacoes)],
    ['Tomadores', String(kpis.nTomadores)],
    ['Ticket Médio', fmtMoeda(kpis.ticketMedio)],
    ['Taxa Média Pond.', fmtPercent(kpis.taxaMediaPond / 100)],
  ]
  return desenharCartoes(doc, y, cards)
}

// Versão genérica dos cartões: cada tela decide os rótulos e valores.
export function desenharCartoes(doc: Doc, y: number, cards: [string, string][]): number {
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
export function desenharGrafico(doc: Doc, y: number, img: ImagemGrafico | null | undefined, maxAltura = 62): number {
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
export function barraNaCelula(doc: Doc, pcts: number[], colIndex: number) {
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

// Estilo padrão das tabelas (autoTable) dos relatórios FAM.
export const estiloTabela = {
  styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 3, bottom: 5, left: 3, right: 3 } },
  headStyles: { fillColor: HEAD_TAB, textColor: 255, fontStyle: 'bold' as const },
  alternateRowStyles: { fillColor: ZEBRA },
  margin: { left: M, right: M, bottom: 14 },
}

// Nome de arquivo seguro a partir de um rótulo livre.
export function slugArquivo(texto: string, fallback: string): string {
  return texto.normalize('NFD').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || fallback
}

// Blob URL + nome, o padrão do CRM para abrir em pré-visualização antes de salvar.
export function entregarPdf(doc: Doc, nomeBase: string): { url: string; filename: string } {
  const blob = doc.output('blob')
  return { url: URL.createObjectURL(blob), filename: `${nomeBase}_${new Date().toISOString().slice(0, 10)}.pdf` }
}
