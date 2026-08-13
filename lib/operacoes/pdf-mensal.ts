// ============================================================
//  PDF executivo da tela "KPIs por Mês".
//
//  Duas seções, na mesma ordem em que a tela mostra:
//   1. Painel do ano  → cartões de KPI, gráfico da tela e a tabela mês a mês.
//   2. Relatório gerencial → uma LINHA por operação emitida, só dos meses que
//      o usuário selecionou. Sai apenas quando há seleção.
//
//  Identidade visual e cartões vêm de lib/pdf/base.ts, a mesma do Panorama de
//  Corretoras. Os números chegam prontos da tela, que por sua vez os calcula
//  pelas fontes únicas (agregacoes.ts e premio-vigencia.ts): este módulo NÃO
//  refaz conta nenhuma, só desenha.
// ============================================================
import { fmtMoeda, fmtPercent } from '@/lib/utils'
import {
  novoDoc, cabecalho, rodape, desenharCartoes, desenharGrafico,
  estiloTabela, entregarPdf, M, type ImagemGrafico,
} from '@/lib/pdf/base'

export interface LinhaMesPdf {
  mesLabel: string
  qtd: number
  lmg: number
  premio: number
  premioMensalizado: number
  taxaMedia: number // pontos percentuais (2,40 = 2,40%)
}

export interface LinhaOperacaoPdf {
  dataEmissao: string   // já formatada (dd/mm/aaaa)
  mesLabel: string
  tomador: string
  corretora: string
  modalidade: string
  uf: string
  lmg: number
  taxa: number          // pontos percentuais
  vigencia: string      // já por extenso (fonte única: vigenciaTxt)
  premio: number
  premioMensalizado: number
}

export interface TotaisPdf {
  qtd: number
  lmg: number
  premio: number
  premioMensalizado: number
  taxaMedia: number
}

export async function gerarPdfKpisMensais(input: {
  ano: string
  linhasMes: LinhaMesPdf[]
  totais: TotaisPdf
  chart?: ImagemGrafico | null
  // Seção 2, opcional: só sai quando o usuário selecionou meses na tela.
  selecao?: {
    rotulo: string            // ex.: "Jun/26 e Jul/26"
    operacoes: LinhaOperacaoPdf[]
    totais: TotaisPdf
  } | null
}): Promise<{ url: string; filename: string }> {
  const { ano, linhasMes, totais, chart, selecao } = input
  const doc = await novoDoc()
  const { default: autoTable } = await import('jspdf-autotable')

  cabecalho(doc, 'KPIs por Mês · Operações Emitidas', `Exercício: ${ano}`)

  let y = desenharCartoes(doc, 32, [
    ['Operações Emitidas', String(totais.qtd)],
    ['Prêmio Total', fmtMoeda(totais.premio)],
    ['Prêmio / Mês de Vigência', fmtMoeda(totais.premioMensalizado)],
    ['LMG Total', fmtMoeda(totais.lmg)],
    ['Taxa Média Mensal', fmtPercent(totais.taxaMedia / 100)],
  ])
  // 45mm em vez dos 62 do padrão: com o gráfico maior a tabela dos meses
  // transbordava para a página 2, e o autoTable repetia o rodapé "Total" nas
  // duas, mostrando um total que não batia com as linhas visíveis.
  y = desenharGrafico(doc, y + 5, chart, 45)

  autoTable(doc, {
    startY: y + 6,
    showFoot: 'lastPage',
    head: [['Mês', 'Qtd. Ops', 'LMG Total', 'Prêmio na Emissão', 'Prêmio / Mês de Vigência', 'Taxa Méd. Mensal']],
    body: linhasMes.map(r => [
      r.mesLabel, r.qtd, fmtMoeda(r.lmg), fmtMoeda(r.premio),
      fmtMoeda(r.premioMensalizado), r.taxaMedia > 0 ? fmtPercent(r.taxaMedia / 100) : '—',
    ]),
    foot: [[
      `Total ${ano}`, totais.qtd, fmtMoeda(totais.lmg), fmtMoeda(totais.premio),
      fmtMoeda(totais.premioMensalizado), totais.taxaMedia > 0 ? fmtPercent(totais.taxaMedia / 100) : '—',
    ]],
    ...estiloTabela,
    footStyles: { fillColor: [240, 245, 255], textColor: [30, 64, 128], fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'left' }, 1: { halign: 'center' },
      2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
    },
  })

  // ── Seção 2: relatório gerencial das operações selecionadas ───────────────
  if (selecao && selecao.operacoes.length > 0) {
    doc.addPage()
    cabecalho(doc, 'Relatório Gerencial de Operações Emitidas', `Seleção: ${selecao.rotulo}`)

    const y2 = desenharCartoes(doc, 32, [
      ['Operações na Seleção', String(selecao.totais.qtd)],
      ['Prêmio Total', fmtMoeda(selecao.totais.premio)],
      ['Prêmio / Mês de Vigência', fmtMoeda(selecao.totais.premioMensalizado)],
      ['LMG Total', fmtMoeda(selecao.totais.lmg)],
      ['Taxa Média Mensal', fmtPercent(selecao.totais.taxaMedia / 100)],
    ])

    autoTable(doc, {
      startY: y2 + 6,
      showFoot: 'lastPage',
      head: [['#', 'Emissão', 'Tomador', 'Corretora', 'Modalidade', 'UF', 'LMG', 'Taxa', 'Vigência', 'Prêmio', 'Prêmio / Mês']],
      body: selecao.operacoes.map((o, i) => [
        i + 1, o.dataEmissao, o.tomador, o.corretora, o.modalidade, o.uf,
        fmtMoeda(o.lmg), fmtPercent(o.taxa / 100), o.vigencia,
        fmtMoeda(o.premio), fmtMoeda(o.premioMensalizado),
      ]),
      foot: [[
        '', '', `${selecao.totais.qtd} ${selecao.totais.qtd === 1 ? 'operação' : 'operações'}`, '', '', '',
        fmtMoeda(selecao.totais.lmg), fmtPercent(selecao.totais.taxaMedia / 100), '',
        fmtMoeda(selecao.totais.premio), fmtMoeda(selecao.totais.premioMensalizado),
      ]],
      ...estiloTabela,
      styles: { ...estiloTabela.styles, fontSize: 7.5, cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 } },
      footStyles: { fillColor: [240, 245, 255], textColor: [30, 64, 128], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 8, halign: 'right' },
        1: { cellWidth: 17, halign: 'center' },
        2: { cellWidth: 58 },
        3: { cellWidth: 42 },
        4: { cellWidth: 34 },
        5: { cellWidth: 9, halign: 'center' },
        6: { halign: 'right' }, 7: { cellWidth: 14, halign: 'right' },
        8: { cellWidth: 20, halign: 'center' },
        9: { halign: 'right' }, 10: { halign: 'right' },
      },
    })

    // Nota de rodapé LOGO ABAIXO da tabela. Em posição fixa (y=199) ela
    // encostava na régua dourada do rodapé.
    const fim = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
    if (fim != null && fim < 190) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(120, 130, 145)
      doc.text(
        'Prêmio / Mês: prêmio da apólice dividido pelos meses de vigência. Mostra o que cada operação passa a render por mês, ao lado do prêmio lançado na emissão.',
        M, fim + 5,
      )
    }
  }

  rodape(doc)
  return entregarPdf(doc, `FAM_KPIs_por_Mes_${ano}`)
}
