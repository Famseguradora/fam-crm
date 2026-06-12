// Helpers do Organograma Societário — montagem da árvore, achatamento por nível,
// formatação de documento e geração do PDF visual (html2canvas → jsPDF).
// Compartilhado entre o OrganogramaModal e a tela de Relatório Contábil.

import type { Socio, SocioNode } from '@/types'
import { maskCPF, maskCNPJ } from '@/lib/utils'

// Monta a árvore de SÓCIOS (lista plana → aninhada). parent NULL = sócio direto.
// Diretores (categoria='diretor') NÃO entram na árvore — use extrairDiretores().
export function montarArvore(rows: Socio[]): SocioNode[] {
  const byParent = new Map<string | null, Socio[]>()
  for (const r of rows) {
    if (r.categoria === 'diretor') continue
    const k = r.parent_socio_id ?? null
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k)!.push(r)
  }
  // Mantém a ordem já vinda do banco (.order('ordem')), com desempate por created_at
  for (const lista of byParent.values()) {
    lista.sort((a, b) => (a.ordem - b.ordem) || a.created_at.localeCompare(b.created_at))
  }
  const build = (parentId: string | null): SocioNode[] =>
    (byParent.get(parentId) ?? []).map((s) => ({ ...s, filhos: build(s.id) }))
  return build(null)
}

// Diretores (categoria='diretor'), lista plana ordenada. Opcionais.
export function extrairDiretores(rows: Socio[]): Socio[] {
  return rows
    .filter(r => r.categoria === 'diretor')
    .sort((a, b) => (a.ordem - b.ordem) || a.created_at.localeCompare(b.created_at))
}

export interface LinhaFlat {
  nivel: number
  node: SocioNode
}

// Achata a árvore em linhas, em ordem de profundidade (pré-ordem), com o nível.
export function flattenArvore(nodes: SocioNode[], nivel = 0, acc: LinhaFlat[] = []): LinhaFlat[] {
  for (const n of nodes) {
    acc.push({ nivel, node: n })
    flattenArvore(n.filhos, nivel + 1, acc)
  }
  return acc
}

// Conta total de nós (sócios) numa árvore.
export function contarSocios(nodes: SocioNode[]): number {
  return nodes.reduce((s, n) => s + 1 + contarSocios(n.filhos), 0)
}

// Documento formatado conforme tipo (ou inferido pelo tamanho dos dígitos).
export function fmtDocumentoSocio(documento: string | null, tipo: 'PF' | 'PJ' | null): string {
  if (!documento) return '—'
  const d = documento.replace(/\D/g, '')
  if (!d) return '—'
  const ehPJ = tipo === 'PJ' || (tipo == null && d.length > 11)
  return ehPJ ? maskCNPJ(d) : maskCPF(d)
}

// Soma dos percentuais dos filhos diretos de um nó (para o aviso suave de ≠ 100%).
export function somaPercentualFilhos(filhos: SocioNode[]): number {
  return filhos.reduce((s, f) => s + (f.percentual ?? 0), 0)
}

// ── PDF do organograma VISUAL (screenshot do DOM → jsPDF paisagem) ───────────
// Captura o elemento (#id) com html-to-image (renderização NATIVA do navegador
// via SVG foreignObject = "foto" fiel, sem os erros de texto/emoji do html2canvas)
// e monta um PDF A4 paisagem com o cabeçalho padrão FAM. Retorna um blob URL.
export async function gerarPdfImagemOrganograma(
  elementId: string,
  subtitulo: string,
): Promise<string | null> {
  const el = document.getElementById(elementId)
  if (!el) return null

  const [{ default: jsPDF }, { toCanvas }] = await Promise.all([
    import('jspdf'),
    import('html-to-image'),
  ])

  const canvas = await toCanvas(el, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    cacheBust: true,
  })

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297, H = 210, M = 8
  const headerH = 26

  const dataHoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const horaAgora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  // Cabeçalho FAM (mesmo padrão dos relatórios de Operações)
  doc.setFillColor(10, 22, 40)
  doc.rect(0, 0, W, headerH, 'F')
  doc.setFillColor(232, 184, 75)
  doc.rect(0, 0, W, 2.5, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(255, 255, 255)
  doc.text('FAM', M, 17)
  doc.setDrawColor(232, 184, 75); doc.setLineWidth(0.3); doc.line(48, 7, 48, 23)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(232, 184, 75)
  doc.text('S E G U R A D O R A', 52, 11)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(255, 255, 255)
  doc.text('Organograma Societário', 52, 19)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(232, 184, 75)
  doc.text(subtitulo, 52, 24)
  doc.setFontSize(8); doc.setTextColor(160, 192, 232)
  doc.text(`Emitido em: ${dataHoje} às ${horaAgora}`, W - M, 11, { align: 'right' })
  doc.setFontSize(6); doc.setTextColor(120, 140, 160)
  doc.text('Documento Confidencial · Gerado automaticamente pelo FAM CRM', W - M, 18, { align: 'right' })

  // Imagem do organograma — ajustada à largura, fatiada em páginas se necessário.
  // JPEG (não PNG): o jsPDF embute JPEG via DCTDecode → PDF ~34x menor, evitando
  // o limite de tamanho de data URI em <iframe> (PNG estourava ~3,4 MB → tela branca).
  const contentW = W - M * 2
  const imgH = (canvas.height * contentW) / canvas.width
  const imgData = canvas.toDataURL('image/jpeg', 0.92)
  const topo = headerH + 6
  const areaPag = H - topo - 8

  if (imgH <= areaPag) {
    doc.addImage(imgData, 'JPEG', M, topo, contentW, imgH)
  } else {
    let yOffset = 0
    let primeira = true
    while (yOffset < imgH) {
      if (!primeira) { doc.addPage(); }
      const y = (primeira ? topo : 8) - yOffset
      doc.addImage(imgData, 'JPEG', M, y, contentW, imgH)
      yOffset += (primeira ? areaPag : H - 16)
      primeira = false
    }
  }

  // Rodapé em todas as páginas
  const totalPags = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages()
  for (let i = 1; i <= totalPags; i++) {
    doc.setPage(i)
    doc.setDrawColor(232, 184, 75); doc.setLineWidth(0.5); doc.line(M, H - 8, W - M, H - 8)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(120, 140, 160)
    doc.text('FAM Seguradora — Relatório Confidencial', M, H - 4)
    doc.text(`Página ${i} de ${totalPags}`, W / 2, H - 4, { align: 'center' })
    doc.text(`${dataHoje} às ${horaAgora}`, W - M, H - 4, { align: 'right' })
  }

  // blob URL (não datauristring): suporta PDFs grandes no <iframe> e no download.
  return URL.createObjectURL(doc.output('blob'))
}
