// ============================================================
//  Geradores de PDF do Panorama de Corretoras — 2 modos:
//   • gerarPdfGeral      → todas as corretoras (KPIs + ranking c/ participação)
//   • gerarPdfCorretora  → uma corretora (KPIs + tomadores c/ participação)
//
//  Ambos retornam { url, filename } via blob URL (robusto p/ PDF grande —
//  padrão de relatorios/contabil), para abrir em PRÉ-VISUALIZAÇÃO antes de
//  salvar. Tabela + "gráfico": a coluna Participação traz uma barra desenhada
//  na célula (didDrawCell); um gráfico da tela pode ser embutido como imagem.
//
//  A identidade visual (cabeçalho, rodapé, cartões de KPI, estilo da tabela)
//  mora em lib/pdf/base.ts, compartilhada com o PDF de "KPIs por Mês".
// ============================================================
import { fmtMoeda, fmtPercent } from '@/lib/utils'
import {
  novoDoc, cabecalho, rodape, desenharKpis, desenharGrafico, barraNaCelula,
  estiloTabela, slugArquivo, entregarPdf,
  type KpisResumoPdf, type ImagemGrafico,
} from '@/lib/pdf/base'

export type { KpisResumoPdf, ImagemGrafico }

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
    ...estiloTabela,
    columnStyles: {
      0: { cellWidth: 10, halign: 'right' }, 2: { halign: 'center' },
      3: { halign: 'center' }, 4: { halign: 'center' },
      5: { halign: 'right' }, 6: { cellWidth: 46, halign: 'left' },
    },
    didDrawCell: barraNaCelula(doc, pcts, 6),
  })

  rodape(doc)
  return entregarPdf(doc, 'FAM_Panorama_Corretoras')
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
    ...estiloTabela,
    columnStyles: {
      0: { cellWidth: 10, halign: 'right' }, 2: { halign: 'center' },
      3: { halign: 'right' }, 4: { halign: 'right' }, 5: { cellWidth: 52, halign: 'left' },
    },
    didDrawCell: barraNaCelula(doc, pcts, 5),
  })

  rodape(doc)
  return entregarPdf(doc, `FAM_Corretora_${slugArquivo(corretoraNome, 'Corretora')}`)
}
