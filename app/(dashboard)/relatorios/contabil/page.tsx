'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tomador, Operacao, Socio, SocioNode as SocioNodeType } from '@/types'
import { fmtMoeda, fmtPercent, fmtData, maskCNPJ, maskTelefone, badgeClassTomador } from '@/lib/utils'
import {
  montarArvore, flattenArvore, contarSocios, fmtDocumentoSocio, extrairDiretores, gerarPdfImagemOrganograma,
} from '@/lib/relatorio-socios'
import OrganogramaView from '@/components/OrganogramaView'

const CAP_LMG = 80_000_000

interface RelatorioTomador {
  tomador: Tomador
  operacoes: Operacao[]   // somente status 'Emitido'
  arvore: SocioNodeType[]
  diretores: Socio[]      // opcionais (assinam como responsáveis)
}

// Campos selecionáveis da operação para exportação (além de "Tomador", sempre presente)
interface CampoOp {
  key: string
  label: string
  pdf: (o: Operacao) => string
  xls: (o: Operacao) => string | number
  align?: 'left' | 'center' | 'right'
}
const sufVig = (p: string | null) => (p === 'meses' ? ' m' : p === 'dias' ? ' d' : ' a')
const CAMPOS_OP: CampoOp[] = [
  { key: 'cnpj', label: 'CNPJ', pdf: o => o.tomador?.cnpj ? maskCNPJ(o.tomador.cnpj) : '—', xls: o => o.tomador?.cnpj ? maskCNPJ(o.tomador.cnpj) : '' },
  { key: 'corretora', label: 'Corretora', pdf: o => o.corretora?.nome_fantasia ?? o.corretora?.razao_social ?? '—', xls: o => o.corretora?.nome_fantasia ?? o.corretora?.razao_social ?? '' },
  { key: 'modalidade', label: 'Modalidade', pdf: o => o.modalidade ?? '—', xls: o => o.modalidade ?? '' },
  { key: 'produto', label: 'Cobertura', pdf: o => o.produto?.nome ?? '—', xls: o => o.produto?.nome ?? '' },
  { key: 'estado', label: 'UF', align: 'center', pdf: o => o.estado ?? '—', xls: o => o.estado ?? '' },
  { key: 'lmg', label: 'LMG (Limite FAM)', align: 'right', pdf: o => fmtMoeda(Math.min(o.lmg ?? 0, CAP_LMG)), xls: o => Math.min(o.lmg ?? 0, CAP_LMG) },
  { key: 'taxa', label: 'Taxa (%)', align: 'center', pdf: o => o.taxa ? fmtPercent(o.taxa / 100) : '—', xls: o => o.taxa ?? '' },
  { key: 'vigencia', label: 'Vigência', align: 'center', pdf: o => o.vigencia_anos != null ? `${o.vigencia_anos}${sufVig(o.periodicidade_vigencia)}` : '—', xls: o => o.vigencia_anos ?? '' },
  { key: 'premio', label: 'Prêmio Previsto', align: 'right', pdf: o => o.premio_previsto ? fmtMoeda(o.premio_previsto) : '—', xls: o => o.premio_previsto ?? '' },
  { key: 'data_emissao', label: 'Data Emissão', align: 'center', pdf: o => o.data_emissao ? fmtData(o.data_emissao) : '—', xls: o => o.data_emissao ? fmtData(o.data_emissao) : '' },
]

// ── helpers de UI ────────────────────────────────────────────────────────────
function Campo({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 0', borderBottom: '1px solid #eef3f9' }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6080a0', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontSize: 13.5, color: '#0a1628', fontWeight: 500 }}>{valor || '—'}</span>
    </div>
  )
}

export default function RelatorioContabilPage() {
  const [relatorio, setRelatorio] = useState<RelatorioTomador[]>([])
  const [carregando, setCarregando] = useState(true)
  const [exportando, setExportando] = useState(false)
  const [mostrarSeletor, setMostrarSeletor] = useState(false)
  const [camposAtivos, setCamposAtivos] = useState<Set<string>>(new Set(CAMPOS_OP.map(c => c.key)))
  const [detalhe, setDetalhe] = useState<RelatorioTomador | null>(null)
  const [orgAberto, setOrgAberto] = useState(true)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState('FAM_Relatorio_Contabil.pdf')
  const [pdfPreviewLabel, setPdfPreviewLabel] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const supabase = createClient()

    // 1) Fonte da verdade: operações EMITIDAS (não dependemos do status do tomador)
    const { data: opsData } = await supabase
      .from('operacoes')
      .select('*, tomador:tomadores(id,razao_social,cnpj,status), corretora:corretoras(id,razao_social,nome_fantasia), produto:produtos(id,nome)')
      .eq('ativo', true)
      .eq('status', 'Emitido')
    const ops = (opsData as Operacao[]) ?? []
    const tomadorIds = [...new Set(ops.map(o => o.tomador_id).filter(Boolean))] as string[]

    if (tomadorIds.length === 0) { setRelatorio([]); setCarregando(false); return }

    // 2) Tomadores e sócios desses IDs
    const [{ data: tomsData }, { data: socData }] = await Promise.all([
      supabase.from('tomadores').select('*, corretora:corretoras(id,razao_social,nome_fantasia)').in('id', tomadorIds).order('razao_social'),
      supabase.from('socios').select('*').eq('ativo', true).in('tomador_id', tomadorIds).order('ordem'),
    ])
    const tomadores = (tomsData as Tomador[]) ?? []
    const socios = (socData as Socio[]) ?? []

    const opsPorTomador = new Map<string, Operacao[]>()
    for (const o of ops) {
      if (!o.tomador_id) continue
      const arr = opsPorTomador.get(o.tomador_id)
      if (arr) arr.push(o); else opsPorTomador.set(o.tomador_id, [o])
    }
    const socPorTomador = new Map<string, Socio[]>()
    for (const s of socios) {
      const arr = socPorTomador.get(s.tomador_id)
      if (arr) arr.push(s); else socPorTomador.set(s.tomador_id, [s])
    }

    setRelatorio(tomadores.map(t => {
      const sociosT = socPorTomador.get(t.id) ?? []
      return {
        tomador: t,
        operacoes: opsPorTomador.get(t.id) ?? [],
        arvore: montarArvore(sociosT),
        diretores: extrairDiretores(sociosT),
      }
    }))
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const fecharPreview = useCallback(() => {
    setPdfPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
  }, [])

  // ESC fecha o dossiê / preview
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (pdfPreviewUrl) { fecharPreview(); return }
      if (detalhe) setDetalhe(null)
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [detalhe, pdfPreviewUrl, fecharPreview])

  // fecha o seletor de campos ao clicar fora
  const seletorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!mostrarSeletor) return
    function onDown(e: MouseEvent) {
      if (seletorRef.current && !seletorRef.current.contains(e.target as Node)) setMostrarSeletor(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [mostrarSeletor])

  function abrirDetalhe(r: RelatorioTomador) {
    setOrgAberto(true)
    setDetalhe(r)
  }

  const kpis = useMemo(() => {
    let ops = 0, lmg = 0, premio = 0, socios = 0
    for (const r of relatorio) {
      ops += r.operacoes.length
      socios += contarSocios(r.arvore)
      for (const o of r.operacoes) {
        lmg += Math.min(o.lmg ?? 0, CAP_LMG)
        premio += o.premio_previsto ?? 0
      }
    }
    return { tomadores: relatorio.length, ops, lmg, premio, socios }
  }, [relatorio])

  const camposSel = useMemo(() => CAMPOS_OP.filter(c => camposAtivos.has(c.key)), [camposAtivos])
  function toggleCampo(key: string) {
    setCamposAtivos(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }

  function totaisTomador(r: RelatorioTomador) {
    const lmg = r.operacoes.reduce((s, o) => s + Math.min(o.lmg ?? 0, CAP_LMG), 0)
    const premio = r.operacoes.reduce((s, o) => s + (o.premio_previsto ?? 0), 0)
    return { lmg, premio }
  }

  // ─── Excel (2 abas, com seletor de campos) ───────────────────────────────────
  async function exportarExcel() {
    setExportando(true)
    try {
      const { utils, writeFile } = await import('xlsx')
      const linhasOps: Record<string, string | number>[] = []
      for (const r of relatorio) {
        for (const o of r.operacoes) {
          const linha: Record<string, string | number> = { 'Tomador': r.tomador.razao_social }
          for (const c of camposSel) linha[c.label] = c.xls(o)
          linhasOps.push(linha)
        }
      }
      const ws1 = utils.json_to_sheet(linhasOps.length > 0 ? linhasOps : [{ 'Tomador': '(Nenhuma operação emitida)' }])
      ws1['!cols'] = [{ wch: 38 }, ...camposSel.map(c => ({ wch: Math.max(12, c.label.length + 2) }))]
      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws1, 'Operações Emitidas')

      const linhasOrg: Record<string, string | number>[] = []
      for (const r of relatorio) {
        for (const { nivel, node } of flattenArvore(r.arvore)) {
          linhasOrg.push({
            'Tomador': r.tomador.razao_social,
            'Categoria': 'Sócio',
            'Nível': nivel === 0 ? 'Sócio direto' : `Nível ${nivel + 1}`,
            'Nome / Razão Social': '   '.repeat(nivel) + node.nome_razao_social,
            'CPF / CNPJ': fmtDocumentoSocio(node.documento, node.tipo_pessoa),
            'Tipo': node.tipo_pessoa ?? '—',
            'Cargo': '',
            '% (do pai)': node.percentual != null ? node.percentual : '—',
          })
        }
        for (const d of r.diretores) {
          linhasOrg.push({
            'Tomador': r.tomador.razao_social,
            'Categoria': 'Diretor',
            'Nível': '—',
            'Nome / Razão Social': d.nome_razao_social,
            'CPF / CNPJ': fmtDocumentoSocio(d.documento, d.tipo_pessoa),
            'Tipo': d.tipo_pessoa ?? '—',
            'Cargo': d.cargo ?? '',
            '% (do pai)': '—',
          })
        }
      }
      const ws2 = utils.json_to_sheet(linhasOrg.length > 0 ? linhasOrg : [{ 'Tomador': '(Sem organograma cadastrado)' }])
      ws2['!cols'] = [{ wch: 32 }, { wch: 10 }, { wch: 14 }, { wch: 44 }, { wch: 22 }, { wch: 8 }, { wch: 22 }, { wch: 12 }]
      utils.book_append_sheet(wb, ws2, 'Organograma')

      writeFile(wb, `FAM_Relatorio_Contabil_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (err) {
      console.error('Erro Excel:', err)
    } finally {
      setExportando(false)
    }
  }

  // ─── PDF tabela (layout dos relatórios de Operações) ─────────────────────────
  async function exportarPdfTabela() {
    setExportando(true)
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'), import('jspdf-autotable'),
      ])
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const W = 297, H = 210, M = 8
      const dataHoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
      const horaAgora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

      doc.setFillColor(10, 22, 40); doc.rect(0, 0, W, 26, 'F')
      doc.setFillColor(232, 184, 75); doc.rect(0, 0, W, 2.5, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(255, 255, 255); doc.text('FAM', M, 17)
      doc.setDrawColor(232, 184, 75); doc.setLineWidth(0.3); doc.line(48, 7, 48, 23)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(232, 184, 75); doc.text('S E G U R A D O R A', 52, 11)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(255, 255, 255); doc.text('Relatório Contábil — Operações Emitidas', 52, 19)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(232, 184, 75); doc.text('Operações emitidas + Organograma Societário', 52, 24)
      doc.setFontSize(8); doc.setTextColor(160, 192, 232); doc.text(`Emitido em: ${dataHoje} às ${horaAgora}`, W - M, 11, { align: 'right' })
      doc.setFontSize(6); doc.setTextColor(120, 140, 160); doc.text('Documento Confidencial · Gerado automaticamente pelo FAM CRM', W - M, 18, { align: 'right' })

      const cardTop = 30, cardH = 20
      const cards = [
        { label: 'TOMADORES', value: String(kpis.tomadores), ar: [30, 64, 120] },
        { label: 'OPERAÇÕES EMITIDAS', value: String(kpis.ops), ar: [30, 64, 120] },
        { label: 'LMG TOTAL (Limite FAM)', value: fmtMoeda(kpis.lmg), ar: [16, 48, 96] },
        { label: 'PRÊMIO PREVISTO TOTAL', value: fmtMoeda(kpis.premio), ar: [232, 184, 75] },
      ]
      const cardW = (W - M * 2 - 12) / 4
      cards.forEach((card, idx) => {
        const cx = M + idx * (cardW + 4)
        doc.setFillColor(248, 251, 255); doc.roundedRect(cx, cardTop, cardW, cardH, 2, 2, 'F')
        doc.setDrawColor(197, 213, 232); doc.setLineWidth(0.3); doc.roundedRect(cx, cardTop, cardW, cardH, 2, 2, 'S')
        doc.setFillColor(card.ar[0], card.ar[1], card.ar[2]); doc.rect(cx, cardTop, cardW, 1.5, 'F')
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(96, 128, 160); doc.text(card.label, cx + cardW / 2, cardTop + 7, { align: 'center' })
        doc.setFont('helvetica', 'bold'); doc.setFontSize(card.label.includes('TOTAL') ? 9 : 13); doc.setTextColor(10, 22, 40); doc.text(card.value, cx + cardW / 2, cardTop + 14.5, { align: 'center' })
      })

      const rodape = () => {
        doc.setDrawColor(232, 184, 75); doc.setLineWidth(0.5); doc.line(M, H - 8, W - M, H - 8)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(120, 140, 160)
        doc.text('FAM Seguradora — Relatório Confidencial', M, H - 4)
        doc.text(`${dataHoje} às ${horaAgora}`, W - M, H - 4, { align: 'right' })
      }

      const headOps = ['Tomador', ...camposSel.map(c => c.label)]
      const bodyOps: (string | number)[][] = []
      for (const r of relatorio) {
        r.operacoes.forEach((o, i) => {
          bodyOps.push([i === 0 ? r.tomador.razao_social : '', ...camposSel.map(c => c.pdf(o))])
        })
      }
      const alignByCol: Record<number, 'left' | 'center' | 'right'> = { 0: 'left' }
      camposSel.forEach((c, i) => { alignByCol[i + 1] = c.align ?? 'left' })

      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(16, 48, 96)
      doc.text('Operações Emitidas por Tomador', M, cardTop + cardH + 7)

      autoTable(doc, {
        startY: cardTop + cardH + 10,
        margin: { left: M, right: M, bottom: 14 },
        head: [headOps],
        body: bodyOps.length > 0 ? bodyOps : [['(Nenhuma operação emitida)', ...camposSel.map(() => '—')]],
        foot: [['TOTAL', ...camposSel.map(c => c.key === 'lmg' ? fmtMoeda(kpis.lmg) : c.key === 'premio' ? fmtMoeda(kpis.premio) : '')]],
        styles: { fontSize: 7, cellPadding: { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 }, font: 'helvetica', textColor: [30, 40, 60], lineColor: [210, 220, 235], lineWidth: 0.15, overflow: 'linebreak' },
        headStyles: { fillColor: [48, 112, 200], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        footStyles: { fillColor: [213, 229, 250], textColor: [16, 48, 96], fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [245, 247, 252] },
        columnStyles: { 0: { fontStyle: 'bold', textColor: [16, 48, 96] } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didParseCell: (data: any) => { data.cell.styles.halign = alignByCol[data.column.index] ?? 'left' },
        didDrawPage: rodape,
      })

      type DocLast = { lastAutoTable: { finalY: number } }
      let y = (doc as unknown as DocLast).lastAutoTable.finalY + 10
      if (y > H - 40) { doc.addPage(); y = 18 }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(16, 48, 96)
      doc.text('Organograma Societário', M, y)

      const bodyOrg: string[][] = []
      for (const r of relatorio) {
        const linhas = flattenArvore(r.arvore)
        let primeira = true
        const tomCol = () => { if (primeira) { primeira = false; return r.tomador.razao_social } return '' }
        if (linhas.length === 0 && r.diretores.length === 0) {
          bodyOrg.push([r.tomador.razao_social, '—', '—', '(Sem organograma cadastrado)', '—', '—', '—', '—'])
          continue
        }
        linhas.forEach(({ nivel, node }) => {
          bodyOrg.push([
            tomCol(),
            'Sócio',
            nivel === 0 ? 'Direto' : `N${nivel + 1}`,
            '   '.repeat(nivel) + (nivel > 0 ? '└ ' : '') + node.nome_razao_social,
            fmtDocumentoSocio(node.documento, node.tipo_pessoa),
            node.tipo_pessoa ?? '—',
            '',
            node.percentual != null ? `${Number(node.percentual).toLocaleString('pt-BR')}%` : '—',
          ])
        })
        r.diretores.forEach(d => {
          bodyOrg.push([
            tomCol(),
            'Diretor',
            '—',
            d.nome_razao_social,
            fmtDocumentoSocio(d.documento, d.tipo_pessoa),
            d.tipo_pessoa ?? '—',
            d.cargo ?? '—',
            '—',
          ])
        })
      }

      autoTable(doc, {
        startY: y + 3,
        margin: { left: M, right: M, bottom: 14 },
        head: [['Tomador', 'Categoria', 'Nível', 'Nome / Razão Social', 'CPF / CNPJ', 'Tipo', 'Cargo', '% (pai)']],
        body: bodyOrg.length > 0 ? bodyOrg : [['—', '—', '—', '(Sem organograma)', '—', '—', '—', '—']],
        styles: { fontSize: 7.5, cellPadding: { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 }, font: 'helvetica', textColor: [30, 40, 60], lineColor: [210, 220, 235], lineWidth: 0.15, overflow: 'linebreak' },
        headStyles: { fillColor: [48, 112, 200], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: [245, 247, 252] },
        columnStyles: {
          0: { cellWidth: 42, fontStyle: 'bold', textColor: [16, 48, 96] },
          1: { cellWidth: 16, halign: 'center' },
          2: { cellWidth: 13, halign: 'center' },
          3: { cellWidth: 'auto' },
          4: { cellWidth: 40 },
          5: { cellWidth: 13, halign: 'center' },
          6: { cellWidth: 34 },
          7: { cellWidth: 18, halign: 'right', textColor: [16, 64, 120] },
        },
        didDrawPage: rodape,
      })

      const totalPags = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages()
      for (let i = 1; i <= totalPags; i++) {
        doc.setPage(i)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(120, 140, 160)
        doc.text(`Página ${i} de ${totalPags}`, W / 2, H - 4, { align: 'center' })
      }

      setPdfPreviewLabel(`Relatório Contábil — ${kpis.tomadores} tomador(es), ${kpis.ops} operação(ões) emitida(s)`)
      setPdfPreviewFilename(`FAM_Relatorio_Contabil_${new Date().toISOString().slice(0, 10)}.pdf`)
      setPdfPreviewUrl(URL.createObjectURL(doc.output('blob')))
    } catch (err) {
      console.error('Erro PDF tabela:', err)
    } finally {
      setExportando(false)
    }
  }

  // ─── PDF organograma visual (screenshot de todos os tomadores) ───────────────
  async function exportarPdfOrganograma() {
    setExportando(true)
    try {
      await new Promise(r => setTimeout(r, 60))
      const uri = await gerarPdfImagemOrganograma('relatorio-organograma-canvas', 'Tomadores com Operações Emitidas — Estrutura Societária')
      if (uri) {
        setPdfPreviewLabel('Organogramas Societários')
        setPdfPreviewFilename(`FAM_Organogramas_${new Date().toISOString().slice(0, 10)}.pdf`)
        setPdfPreviewUrl(uri)
      }
    } catch (err) {
      console.error('Erro PDF organograma:', err)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0a1628', margin: 0 }}>📑 Relatório Contábil</h1>
          <p style={{ color: '#6080a0', fontSize: 13, margin: '4px 0 0' }}>
            Tomadores com <strong>operações emitidas</strong> e organograma societário. Clique num card para ver tudo.
          </p>
        </div>
        <div ref={seletorRef} style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
          <button type="button" className="btn-secondary" onClick={() => setMostrarSeletor(v => !v)}>⚙️ Campos do Excel ({camposSel.length})</button>
          <button type="button" className="btn-export" disabled={exportando || carregando} onClick={exportarExcel}>📊 Excel</button>
          <button type="button" className="btn-export" disabled={exportando || carregando} onClick={exportarPdfTabela}>📄 PDF Tabela</button>
          <button type="button" className="btn-export" disabled={exportando || carregando} onClick={exportarPdfOrganograma}>🗂️ PDF Organograma</button>

          {mostrarSeletor && (
            <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 50, background: '#fff', border: '1.5px solid #c5d5e8', borderRadius: 10, boxShadow: '0 10px 30px rgba(16,32,64,0.18)', padding: 14, width: 280 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#16407a', marginBottom: 8 }}>Colunas das operações</div>
              <div style={{ fontSize: 11, color: '#6080a0', marginBottom: 10 }}>“Tomador” é sempre incluído. Marque os campos a exportar (Excel e PDF Tabela).</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflow: 'auto' }}>
                {CAMPOS_OP.map(c => (
                  <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#1a2a3a' }}>
                    <input type="checkbox" checked={camposAtivos.has(c.key)} onChange={() => toggleCampo(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn-clear" style={{ flex: 1 }} onClick={() => setCamposAtivos(new Set(CAMPOS_OP.map(c => c.key)))}>Todos</button>
                <button type="button" className="btn-clear" style={{ flex: 1 }} onClick={() => setCamposAtivos(new Set())}>Nenhum</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
        <div className="kpi-card"><div className="kpi-label">Tomadores</div><div className="kpi-value">{kpis.tomadores}</div></div>
        <div className="kpi-card"><div className="kpi-label">Operações Emitidas</div><div className="kpi-value">{kpis.ops}</div></div>
        <div className="kpi-card"><div className="kpi-label">Sócios Cadastrados</div><div className="kpi-value">{kpis.socios}</div></div>
        <div className="kpi-card"><div className="kpi-label">LMG Total (Limite FAM)</div><div className="kpi-value" style={{ fontSize: 18 }}>{fmtMoeda(kpis.lmg)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Prêmio Previsto Total</div><div className="kpi-value" style={{ fontSize: 18 }}>{fmtMoeda(kpis.premio)}</div></div>
      </div>

      {carregando ? (
        <div style={{ padding: 50, textAlign: 'center', color: '#6080a0' }}>Carregando relatório…</div>
      ) : relatorio.length === 0 ? (
        <div className="card-panel" style={{ textAlign: 'center', color: '#6080a0', padding: 40 }}>
          Nenhum tomador com <strong>operação emitida</strong> encontrado.
        </div>
      ) : (
        <>
          <div className="section-title" style={{ marginBottom: 14 }}><span className="dot" />Tomadores com Operações Emitidas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {relatorio.map(r => {
              const tot = totaisTomador(r)
              return (
                <button key={r.tomador.id} type="button" onClick={() => abrirDetalhe(r)} className="dossie-card">
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 15, color: '#0a1628', lineHeight: 1.25 }}>{r.tomador.razao_social}</strong>
                    <span className={`badge ${badgeClassTomador(r.tomador.status)}`} style={{ flexShrink: 0 }}>{r.tomador.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6080a0', marginTop: 2 }}>{r.tomador.cnpj ? maskCNPJ(r.tomador.cnpj) : '—'}</div>
                  <div style={{ height: 1, background: '#eef3f9', margin: '12px 0' }} />
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span className="dossie-chip">📋 {r.operacoes.length} emitida(s)</span>
                    <span className="dossie-chip">👥 {contarSocios(r.arvore)} sócio(s)</span>
                    {r.diretores.length > 0 && <span className="dossie-chip">👔 {r.diretores.length} diretor(es)</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div><div className="dossie-mini-label">LMG (Limite FAM)</div><div className="dossie-mini-val">{fmtMoeda(tot.lmg)}</div></div>
                    <div style={{ textAlign: 'right' }}><div className="dossie-mini-label">Prêmio Previsto</div><div className="dossie-mini-val" style={{ color: '#16407a' }}>{fmtMoeda(tot.premio)}</div></div>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: '#3070c8' }}>Ver dossiê →</div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* ── Dossiê (detalhe do tomador) ── */}
      {detalhe && (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={(e) => { if (e.target === e.currentTarget) setDetalhe(null) }}>
          <div className="modal-box" style={{ maxWidth: 1120, width: '96vw', maxHeight: '92vh', overflow: 'auto' }}>
            <div className="modal-header" style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span>🏢 {detalhe.tomador.razao_social}</span>
                <span style={{ fontSize: 12, color: '#6080a0', fontWeight: 500 }}>{detalhe.tomador.cnpj ? maskCNPJ(detalhe.tomador.cnpj) : '—'}</span>
                <span className={`badge ${badgeClassTomador(detalhe.tomador.status)}`}>{detalhe.tomador.status}</span>
              </div>
              <button onClick={() => setDetalhe(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
            </div>

            {/* Lado a lado: Tomador | Operações */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 18, marginTop: 8 }}>
              {/* Dados do tomador */}
              <div className="card-panel" style={{ padding: 16 }}>
                <div className="section-title" style={{ marginBottom: 8 }}><span className="dot" />Dados do Tomador</div>
                <Campo label="Razão Social" valor={detalhe.tomador.razao_social} />
                <Campo label="Nome Fantasia" valor={detalhe.tomador.nome_fantasia} />
                <Campo label="CNPJ" valor={detalhe.tomador.cnpj ? maskCNPJ(detalhe.tomador.cnpj) : '—'} />
                <Campo label="Corretora" valor={detalhe.tomador.corretora?.nome_fantasia ?? detalhe.tomador.corretora?.razao_social} />
                <Campo label="Cidade / UF" valor={[detalhe.tomador.cidade, detalhe.tomador.estado].filter(Boolean).join(' / ')} />
                <Campo label="Limite Aprovado" valor={detalhe.tomador.limite_aprovado != null ? fmtMoeda(detalhe.tomador.limite_aprovado) : '—'} />
                <Campo label="Porte / Prioridade" valor={[detalhe.tomador.porte, detalhe.tomador.prioridade].filter(Boolean).join(' · ')} />
                <Campo label="Responsável" valor={detalhe.tomador.responsavel} />
                <Campo label="E-mail" valor={detalhe.tomador.email} />
                <Campo label="Telefone / Celular" valor={[detalhe.tomador.telefone && maskTelefone(detalhe.tomador.telefone), detalhe.tomador.celular && maskTelefone(detalhe.tomador.celular)].filter(Boolean).join(' · ')} />
                <Campo label="Endereço" valor={[detalhe.tomador.endereco, detalhe.tomador.numero, detalhe.tomador.complemento, detalhe.tomador.bairro].filter(Boolean).join(', ')} />
                <Campo label="Data de Entrada" valor={detalhe.tomador.data_entrada ? fmtData(detalhe.tomador.data_entrada) : '—'} />
                {detalhe.tomador.observacao && <Campo label="Observação" valor={detalhe.tomador.observacao} />}
              </div>

              {/* Operações emitidas */}
              <div className="card-panel" style={{ padding: 16 }}>
                <div className="section-title" style={{ marginBottom: 8 }}><span className="dot" style={{ background: '#27a96c' }} />Operações Emitidas ({detalhe.operacoes.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {detalhe.operacoes.map(o => (
                    <div key={o.id} style={{ border: '1.5px solid #d8e6f5', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ background: '#eaf4ee', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: 13.5, color: '#0a1628' }}>{o.modalidade ?? '—'}</strong>
                        <span className="badge badge-green">{o.status}</span>
                      </div>
                      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px 14px' }}>
                        <div><div className="dossie-mini-label">Cobertura</div><div className="dossie-op-val">{o.produto?.nome ?? '—'}</div></div>
                        <div><div className="dossie-mini-label">UF</div><div className="dossie-op-val">{o.estado ?? '—'}</div></div>
                        <div><div className="dossie-mini-label">LMG (Limite FAM)</div><div className="dossie-op-val">{fmtMoeda(Math.min(o.lmg ?? 0, CAP_LMG))}</div></div>
                        <div><div className="dossie-mini-label">Taxa</div><div className="dossie-op-val">{o.taxa ? fmtPercent(o.taxa / 100) : '—'}</div></div>
                        <div><div className="dossie-mini-label">Vigência</div><div className="dossie-op-val">{o.vigencia_anos != null ? `${o.vigencia_anos}${sufVig(o.periodicidade_vigencia)}` : '—'}</div></div>
                        <div><div className="dossie-mini-label">Prêmio Previsto</div><div className="dossie-op-val" style={{ color: '#16407a', fontWeight: 700 }}>{o.premio_previsto ? fmtMoeda(o.premio_previsto) : '—'}</div></div>
                        <div><div className="dossie-mini-label">Corretora</div><div className="dossie-op-val">{o.corretora?.nome_fantasia ?? o.corretora?.razao_social ?? '—'}</div></div>
                        <div><div className="dossie-mini-label">Corretor</div><div className="dossie-op-val">{o.corretor ?? '—'}</div></div>
                        <div><div className="dossie-mini-label">Data de Emissão</div><div className="dossie-op-val">{o.data_emissao ? fmtData(o.data_emissao) : '—'}</div></div>
                      </div>
                      {o.observacao && <div style={{ padding: '0 12px 12px', fontSize: 12, color: '#6080a0' }}>Obs.: {o.observacao}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Organograma (largura total, recolhível) */}
            <div className="card-panel" style={{ padding: 16, marginTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div className="section-title" style={{ margin: 0 }}><span className="dot" style={{ background: '#e8b84b' }} />Organograma Societário</div>
                <button type="button" className="btn-secondary" style={{ padding: '6px 14px' }} onClick={() => setOrgAberto(v => !v)}>
                  {orgAberto ? 'Recolher ▲' : 'Ver organograma ▼'}
                </button>
              </div>
              {orgAberto && (
                <div className="fam-table-wrap" style={{ overflow: 'auto', marginTop: 12, background: '#fff', padding: 16, borderRadius: 8 }}>
                  {contarSocios(detalhe.arvore) === 0 && detalhe.diretores.length === 0
                    ? <p style={{ color: '#6080a0', fontSize: 13 }}>Sem organograma cadastrado para este tomador.</p>
                    : <OrganogramaView tomadorNome={detalhe.tomador.razao_social} tomadorDoc={detalhe.tomador.cnpj} arvore={detalhe.arvore} diretores={detalhe.diretores} readOnly />}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Container OFFSCREEN com todas as árvores — fonte do "PDF Organograma" (geral) */}
      <div id="relatorio-organograma-canvas" aria-hidden="true"
        style={{ position: 'fixed', left: -100000, top: 0, background: '#fff', padding: 16, display: 'inline-block' }}>
        {relatorio.map(r => (
          <div key={r.tomador.id} style={{ marginBottom: 26, paddingBottom: 16, borderBottom: '1px solid #e0ecf8' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#16407a', marginBottom: 6 }}>{r.tomador.razao_social}</div>
            {contarSocios(r.arvore) === 0 && r.diretores.length === 0
              ? <div style={{ color: '#6080a0', fontSize: 12 }}>Sem organograma cadastrado.</div>
              : <OrganogramaView tomadorNome={r.tomador.razao_social} tomadorDoc={r.tomador.cnpj} arvore={r.arvore} diretores={r.diretores} readOnly />}
          </div>
        ))}
      </div>

      {/* Preview PDF */}
      {pdfPreviewUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: '95vw', height: '95vh', background: '#0a1628', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.7)', border: '1px solid rgba(232,184,75,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: '#102040', borderBottom: '2px solid #e8b84b', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div>
                  <span style={{ color: '#e8b84b', fontWeight: 800, fontSize: 15 }}>FAM</span>
                  <span style={{ color: 'rgba(232,184,75,0.5)', fontWeight: 400, fontSize: 9, marginLeft: 5, letterSpacing: 2 }}>SEGURADORA</span>
                </div>
                <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.12)' }} />
                <div>
                  <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 13 }}>Pré-visualização do Relatório</div>
                  <div style={{ color: '#6080a0', fontSize: 11 }}>{pdfPreviewLabel ?? 'Relatório Contábil'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <a href={pdfPreviewUrl} download={pdfPreviewFilename}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 8, textDecoration: 'none', background: '#e8b84b', color: '#102040', fontWeight: 700, fontSize: 13 }}>
                  ⬇ Baixar PDF
                </a>
                <button onClick={fecharPreview}
                  style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: '#a0c0e8', fontWeight: 500 }}>
                  ✕ Fechar
                </button>
              </div>
            </div>
            <iframe src={pdfPreviewUrl} style={{ flex: 1, border: 'none', background: '#f0f0f0' }} title="Pré-visualização PDF" />
          </div>
        </div>
      )}
    </div>
  )
}
