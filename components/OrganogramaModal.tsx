'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import type { Socio, SocioNode as SocioNodeType, Tomador } from '@/types'
import { maskCPF, maskCNPJ, titleCase } from '@/lib/utils'
import {
  montarArvore, flattenArvore, contarSocios, fmtDocumentoSocio,
  somaPercentualFilhos, extrairDiretores, gerarPdfImagemOrganograma,
} from '@/lib/relatorio-socios'
import OrganogramaView from '@/components/OrganogramaView'

interface Props {
  tomador: Tomador
  usuarioInfo: { authId: string; nome: string | null; email: string | null } | null
  onClose: () => void
}

interface SocioForm {
  mode: 'add' | 'edit'
  id?: string
  parentSocioId: string | null
  categoria: 'socio' | 'diretor'
  nome_razao_social: string
  tipo_pessoa: 'PF' | 'PJ'
  documento: string
  percentual: string
  cargo: string
}

export default function OrganogramaModal({ tomador, usuarioInfo, onClose }: Props) {
  const [socios, setSocios] = useState<Socio[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<'visual' | 'tabela'>('visual')
  const [socioForm, setSocioForm] = useState<SocioForm | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erroForm, setErroForm] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Socio | SocioNodeType | null>(null)
  const [erroDelete, setErroDelete] = useState('')
  const [exportando, setExportando] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState('FAM_Organograma.pdf')

  const carregarSocios = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('socios')
      .select('*')
      .eq('tomador_id', tomador.id)
      .eq('ativo', true)
      .order('ordem')
    setSocios((data as Socio[]) ?? [])
    setCarregando(false)
  }, [tomador.id])

  useEffect(() => { carregarSocios() }, [carregarSocios])

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (socioForm || confirmDelete || pdfPreviewUrl) return
      onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [socioForm, confirmDelete, pdfPreviewUrl, onClose])

  const arvore = useMemo(() => montarArvore(socios), [socios])
  const diretores = useMemo(() => extrairDiretores(socios), [socios])
  const totalSocios = useMemo(() => contarSocios(arvore), [arvore])

  // Avisos suaves: pais cujos filhos diretos não somam 100% (só sócios)
  const avisos = useMemo(() => {
    const lista: string[] = []
    const somaRaiz = somaPercentualFilhos(arvore)
    if (arvore.length > 0 && Math.abs(somaRaiz - 100) > 0.01) {
      lista.push(`Sócios diretos de ${tomador.razao_social} somam ${somaRaiz.toLocaleString('pt-BR')}% (esperado 100%)`)
    }
    for (const { node } of flattenArvore(arvore)) {
      if (node.filhos.length > 0) {
        const s = somaPercentualFilhos(node.filhos)
        if (Math.abs(s - 100) > 0.01) {
          lista.push(`Sócios de ${node.nome_razao_social} somam ${s.toLocaleString('pt-BR')}% (esperado 100%)`)
        }
      }
    }
    return lista
  }, [arvore, tomador.razao_social])

  // ─── CRUD ───────────────────────────────────────────────────────────────────
  function abrirAddSocio(parentSocioId: string | null) {
    setErroForm('')
    setSocioForm({ mode: 'add', parentSocioId, categoria: 'socio', nome_razao_social: '', tipo_pessoa: 'PJ', documento: '', percentual: '', cargo: '' })
  }
  function abrirAddDiretor() {
    setErroForm('')
    setSocioForm({ mode: 'add', parentSocioId: null, categoria: 'diretor', nome_razao_social: '', tipo_pessoa: 'PF', documento: '', percentual: '', cargo: '' })
  }

  function abrirEdit(n: Socio) {
    setErroForm('')
    const tipo: 'PF' | 'PJ' = n.tipo_pessoa ?? ((n.documento ?? '').replace(/\D/g, '').length > 11 ? 'PJ' : 'PF')
    setSocioForm({
      mode: 'edit',
      id: n.id,
      parentSocioId: n.parent_socio_id,
      categoria: n.categoria,
      nome_razao_social: n.nome_razao_social,
      tipo_pessoa: tipo,
      documento: n.documento ? (tipo === 'PJ' ? maskCNPJ(n.documento) : maskCPF(n.documento)) : '',
      percentual: n.percentual != null ? String(n.percentual).replace('.', ',') : '',
      cargo: n.cargo ?? '',
    })
  }

  async function salvarSocio(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!socioForm) return
    if (!socioForm.nome_razao_social.trim()) { setErroForm('Informe o Nome / Razão Social.'); return }
    const ehDiretor = socioForm.categoria === 'diretor'

    let pctNum: number | null = null
    if (!ehDiretor) {
      pctNum = socioForm.percentual.trim() ? parseFloat(socioForm.percentual.replace(/\./g, '').replace(',', '.')) : null
      if (pctNum != null && (isNaN(pctNum) || pctNum < 0 || pctNum > 100)) {
        setErroForm('Percentual deve estar entre 0 e 100.')
        return
      }
    }
    setEnviando(true)
    const supabase = createClient()
    const docDigits = socioForm.documento.replace(/\D/g, '') || null

    const payload = {
      tomador_id: tomador.id,
      parent_socio_id: ehDiretor ? null : socioForm.parentSocioId,
      nome_razao_social: titleCase(socioForm.nome_razao_social.trim()),
      documento: docDigits,
      tipo_pessoa: socioForm.tipo_pessoa,
      percentual: ehDiretor ? null : pctNum,
      categoria: socioForm.categoria,
      cargo: ehDiretor ? (socioForm.cargo.trim() || null) : null,
    }

    try {
      if (socioForm.mode === 'add') {
        const irmaos = ehDiretor
          ? socios.filter(s => s.categoria === 'diretor').length
          : socios.filter(s => s.categoria !== 'diretor' && (s.parent_socio_id ?? null) === socioForm.parentSocioId).length
        const { data: novo, error } = await supabase.from('socios').insert({ ...payload, ordem: irmaos }).select().single()
        if (error) throw error
        await supabase.from('audit_log').insert({
          tabela: 'socios', acao: 'cadastro', registro_id: novo?.id ?? null,
          dados_antes: null, dados_depois: payload as unknown as Record<string, unknown>,
          usuario_auth_id: usuarioInfo?.authId ?? null, usuario_nome: usuarioInfo?.nome ?? null, usuario_email: usuarioInfo?.email ?? null,
        })
      } else {
        const antes = socios.find(s => s.id === socioForm.id) ?? null
        const { error } = await supabase.from('socios').update(payload).eq('id', socioForm.id!)
        if (error) throw error
        await supabase.from('audit_log').insert({
          tabela: 'socios', acao: 'alteracao', registro_id: socioForm.id ?? null,
          dados_antes: antes as unknown as Record<string, unknown>, dados_depois: payload as unknown as Record<string, unknown>,
          usuario_auth_id: usuarioInfo?.authId ?? null, usuario_nome: usuarioInfo?.nome ?? null, usuario_email: usuarioInfo?.email ?? null,
        })
      }
      setSocioForm(null)
      await carregarSocios()
    } catch (err) {
      setErroForm('Erro ao salvar: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setEnviando(false)
    }
  }

  async function excluirSocio() {
    if (!confirmDelete) return
    setEnviando(true)
    setErroDelete('')
    const supabase = createClient()
    try {
      const { error } = await supabase.from('socios').delete().eq('id', confirmDelete.id)
      if (error) throw error
      await supabase.from('audit_log').insert({
        tabela: 'socios', acao: 'exclusao', registro_id: confirmDelete.id,
        dados_antes: confirmDelete as unknown as Record<string, unknown>, dados_depois: null,
        usuario_auth_id: usuarioInfo?.authId ?? null, usuario_nome: usuarioInfo?.nome ?? null, usuario_email: usuarioInfo?.email ?? null,
      })
      setConfirmDelete(null)
      await carregarSocios()
    } catch (err) {
      setErroDelete('Erro ao excluir: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setEnviando(false)
    }
  }

  // ─── Exportações (deste tomador) ─────────────────────────────────────────────
  async function exportarPdfVisual() {
    setExportando(true)
    try {
      flushSync(() => setAba('visual'))
      await new Promise((r) => setTimeout(r, 80))
      const uri = await gerarPdfImagemOrganograma('organograma-canvas', tomador.razao_social)
      if (uri) {
        setPdfPreviewFilename(`FAM_Organograma_${tomador.razao_social.replace(/\s+/g, '_')}.pdf`)
        setPdfPreviewUrl(uri)
      } else {
        console.warn('Organograma: canvas não encontrado para captura.')
      }
    } catch (err) {
      console.error('Erro PDF organograma:', err)
    } finally {
      setExportando(false)
    }
  }

  async function exportarPdfTabela() {
    setExportando(true)
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const W = 210, H = 297, M = 10
      const dataHoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
      const horaAgora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

      doc.setFillColor(10, 22, 40); doc.rect(0, 0, W, 26, 'F')
      doc.setFillColor(232, 184, 75); doc.rect(0, 0, W, 2.5, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(255, 255, 255); doc.text('FAM', M, 17)
      doc.setDrawColor(232, 184, 75); doc.setLineWidth(0.3); doc.line(46, 7, 46, 23)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(232, 184, 75); doc.text('S E G U R A D O R A', 50, 11)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255); doc.text('Organograma Societário', 50, 18)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(232, 184, 75); doc.text(tomador.razao_social, 50, 23)
      doc.setFontSize(7); doc.setTextColor(160, 192, 232); doc.text(`Emitido em: ${dataHoje} às ${horaAgora}`, W - M, 11, { align: 'right' })

      const linhas: string[][] = flattenArvore(arvore).map(({ nivel, node }) => [
        'Sócio',
        '   '.repeat(nivel) + (nivel > 0 ? '└ ' : '') + node.nome_razao_social,
        fmtDocumentoSocio(node.documento, node.tipo_pessoa),
        node.tipo_pessoa ?? '—',
        '',
        node.percentual != null ? `${Number(node.percentual).toLocaleString('pt-BR')}%` : '—',
      ])
      diretores.forEach(d => linhas.push([
        'Diretor', d.nome_razao_social, fmtDocumentoSocio(d.documento, d.tipo_pessoa), d.tipo_pessoa ?? '—', d.cargo ?? '—', '—',
      ]))

      autoTable(doc, {
        startY: 32,
        margin: { left: M, right: M, bottom: 14 },
        head: [['Categoria', 'Nome / Razão Social', 'CPF / CNPJ', 'Tipo', 'Cargo', '%']],
        body: linhas.length > 0 ? linhas : [['—', '(Nenhum sócio cadastrado)', '—', '—', '—', '—']],
        styles: { fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 }, font: 'helvetica', textColor: [30, 40, 60], lineColor: [210, 220, 235], lineWidth: 0.15, overflow: 'linebreak' },
        headStyles: { fillColor: [48, 112, 200], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 247, 252] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 20 },
          1: { halign: 'left', cellWidth: 'auto' },
          2: { halign: 'left', cellWidth: 38 },
          3: { halign: 'center', cellWidth: 14 },
          4: { halign: 'left', cellWidth: 36 },
          5: { halign: 'right', cellWidth: 16, textColor: [16, 64, 120] },
        },
        didDrawPage: () => {
          doc.setDrawColor(232, 184, 75); doc.setLineWidth(0.5); doc.line(M, H - 8, W - M, H - 8)
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(120, 140, 160)
          doc.text('FAM Seguradora — Relatório Confidencial', M, H - 4)
          doc.text(`${dataHoje} às ${horaAgora}`, W - M, H - 4, { align: 'right' })
        },
      })

      setPdfPreviewFilename(`FAM_Organograma_Tabela_${tomador.razao_social.replace(/\s+/g, '_')}.pdf`)
      setPdfPreviewUrl(URL.createObjectURL(doc.output('blob')))
    } catch (err) {
      console.error('Erro PDF tabela:', err)
    } finally {
      setExportando(false)
    }
  }

  async function exportarExcel() {
    setExportando(true)
    try {
      const { utils, writeFile } = await import('xlsx')
      const linhas: Record<string, string | number>[] = [
        ...flattenArvore(arvore).map(({ nivel, node }) => ({
          'Categoria': 'Sócio',
          'Nível': nivel === 0 ? 'Sócio direto' : `Nível ${nivel + 1}`,
          'Nome / Razão Social': '   '.repeat(nivel) + node.nome_razao_social,
          'CPF / CNPJ': fmtDocumentoSocio(node.documento, node.tipo_pessoa),
          'Tipo': node.tipo_pessoa ?? '—',
          'Cargo': '',
          '% (do pai)': node.percentual != null ? node.percentual : '—',
        })),
        ...diretores.map(d => ({
          'Categoria': 'Diretor',
          'Nível': '—',
          'Nome / Razão Social': d.nome_razao_social,
          'CPF / CNPJ': fmtDocumentoSocio(d.documento, d.tipo_pessoa),
          'Tipo': d.tipo_pessoa ?? '—',
          'Cargo': d.cargo ?? '',
          '% (do pai)': '—',
        })),
      ]
      const ws = utils.json_to_sheet(linhas.length > 0 ? linhas : [{ 'Categoria': '—', 'Nível': '—', 'Nome / Razão Social': '(Nenhum sócio cadastrado)', 'CPF / CNPJ': '—', 'Tipo': '—', 'Cargo': '', '% (do pai)': '—' }])
      ws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 44 }, { wch: 22 }, { wch: 8 }, { wch: 22 }, { wch: 12 }]
      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, 'Organograma')
      writeFile(wb, `FAM_Organograma_${tomador.razao_social.replace(/\s+/g, '_')}.xlsx`)
    } catch (err) {
      console.error('Erro Excel:', err)
    } finally {
      setExportando(false)
    }
  }

  const maskDoc = socioForm?.tipo_pessoa === 'PJ' ? maskCNPJ : maskCPF
  const ehDiretorForm = socioForm?.categoria === 'diretor'
  const tituloForm = socioForm?.mode === 'add'
    ? (ehDiretorForm ? '＋ Novo Diretor' : '＋ Novo Sócio')
    : (ehDiretorForm ? '✏️ Editar Diretor' : '✏️ Editar Sócio')

  return (
    <div className="modal-overlay" style={{ zIndex: 1200 }}>
      <div className="modal-box" style={{ maxWidth: 1040, width: '96vw' }}>
        <div className="modal-header">
          <div className="modal-title">🏛️ Organograma Societário — {tomador.razao_social}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'inline-flex', background: '#eaf1fa', borderRadius: 8, padding: 3 }}>
            <button type="button" onClick={() => setAba('visual')}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: aba === 'visual' ? '#1e4080' : 'transparent', color: aba === 'visual' ? '#fff' : '#3a5a85' }}>🗂️ Organograma</button>
            <button type="button" onClick={() => setAba('tabela')}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: aba === 'tabela' ? '#1e4080' : 'transparent', color: aba === 'tabela' ? '#fff' : '#3a5a85' }}>📋 Tabela</button>
          </div>

          <button type="button" className="btn-primary" onClick={() => abrirAddSocio(null)} style={{ fontSize: 13 }}>＋ Adicionar sócio</button>
          <button type="button" className="btn-secondary" onClick={abrirAddDiretor} style={{ fontSize: 13 }}>👔 Adicionar diretor</button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn-export" disabled={exportando} onClick={exportarPdfVisual}>📄 PDF Organograma</button>
            <button type="button" className="btn-export" disabled={exportando} onClick={exportarPdfTabela}>📄 PDF Tabela</button>
            <button type="button" className="btn-export" disabled={exportando} onClick={exportarExcel}>📊 Excel</button>
          </div>
        </div>

        {avisos.length > 0 && (
          <div className="alert-error" style={{ background: '#fff7e6', borderColor: '#e8b84b', color: '#8a6d1f', marginBottom: 14 }}>
            <strong>⚠ Atenção (não impede salvar):</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </div>
        )}

        {carregando ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6080a0' }}>Carregando organograma…</div>
        ) : aba === 'visual' ? (
          <div className="fam-table-wrap" style={{ overflow: 'auto', maxHeight: '60vh', background: '#ffffff', padding: 18, borderRadius: 10 }}>
            <div id="organograma-canvas" style={{ display: 'inline-block', minWidth: '100%', background: '#ffffff', padding: 8 }}>
              <OrganogramaView
                tomadorNome={tomador.razao_social}
                tomadorDoc={tomador.cnpj}
                arvore={arvore}
                diretores={diretores}
                onAddSocio={abrirAddSocio}
                onEditSocio={abrirEdit}
                onDeleteSocio={setConfirmDelete}
                onEditDiretor={abrirEdit}
                onDeleteDiretor={setConfirmDelete}
              />
              {totalSocios === 0 && diretores.length === 0 && (
                <p style={{ color: '#6080a0', fontSize: 13, marginTop: 14 }} data-html2canvas-ignore="true">
                  Nenhum sócio cadastrado ainda. Clique em <strong>＋ Adicionar sócio</strong> (ou <strong>👔 Adicionar diretor</strong>) para iniciar.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="fam-table-wrap" style={{ maxHeight: '60vh', overflow: 'auto' }}>
            <table className="fam-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Nome / Razão Social</th>
                  <th style={{ textAlign: 'left' }}>CPF / CNPJ</th>
                  <th style={{ textAlign: 'center' }}>Tipo</th>
                  <th style={{ textAlign: 'right' }}>% (do pai)</th>
                  <th style={{ textAlign: 'center', width: 110 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {flattenArvore(arvore).map(({ nivel, node }) => (
                  <tr key={node.id}>
                    <td style={{ textAlign: 'left', paddingLeft: 12 + nivel * 22 }}>
                      {nivel > 0 && <span style={{ color: '#9bb4d0' }}>└ </span>}{node.nome_razao_social}
                    </td>
                    <td style={{ textAlign: 'left' }}>{fmtDocumentoSocio(node.documento, node.tipo_pessoa)}</td>
                    <td style={{ textAlign: 'center' }}>{node.tipo_pessoa ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{node.percentual != null ? `${Number(node.percentual).toLocaleString('pt-BR')}%` : '—'}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button type="button" className="org-act org-act-add" title="Adicionar sócio deste" onClick={() => abrirAddSocio(node.id)}>＋</button>
                      <button type="button" className="org-act org-act-edit" title="Editar" onClick={() => abrirEdit(node)}>✏️</button>
                      <button type="button" className="org-act org-act-del" title="Excluir" onClick={() => setConfirmDelete(node)}>✕</button>
                    </td>
                  </tr>
                ))}
                {diretores.length > 0 && (
                  <tr><td colSpan={5} style={{ background: '#fffdf6', fontWeight: 800, color: '#8a6d1f', fontSize: 11.5, letterSpacing: 0.4 }}>👔 DIRETORES (assinam como responsáveis)</td></tr>
                )}
                {diretores.map(d => (
                  <tr key={d.id}>
                    <td style={{ textAlign: 'left', paddingLeft: 12 }}>
                      {d.nome_razao_social}{d.cargo && <span style={{ color: '#a07b1e', fontSize: 12 }}> — {d.cargo}</span>}
                    </td>
                    <td style={{ textAlign: 'left' }}>{fmtDocumentoSocio(d.documento, d.tipo_pessoa)}</td>
                    <td style={{ textAlign: 'center' }}>{d.tipo_pessoa ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>—</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button type="button" className="org-act org-act-edit" title="Editar" onClick={() => abrirEdit(d)}>✏️</button>
                      <button type="button" className="org-act org-act-del" title="Excluir" onClick={() => setConfirmDelete(d)}>✕</button>
                    </td>
                  </tr>
                ))}
                {totalSocios === 0 && diretores.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#6080a0', padding: 24 }}>Nenhum sócio cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Sub-modal: form do sócio / diretor ── */}
        {socioForm && (
          <div className="modal-overlay" style={{ zIndex: 1300 }} onClick={(e) => { if (e.target === e.currentTarget) setSocioForm(null) }}>
            <div className="modal-box" style={{ maxWidth: 460 }}>
              <div className="modal-header">
                <div className="modal-title">{tituloForm}</div>
                <button onClick={() => setSocioForm(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
              </div>
              {ehDiretorForm
                ? <p style={{ fontSize: 12, color: '#6080a0', margin: '0 0 12px' }}>Diretor de <strong>{tomador.razao_social}</strong> (assina como responsável)</p>
                : socioForm.parentSocioId == null
                  ? <p style={{ fontSize: 12, color: '#6080a0', margin: '0 0 12px' }}>Sócio direto de <strong>{tomador.razao_social}</strong></p>
                  : <p style={{ fontSize: 12, color: '#6080a0', margin: '0 0 12px' }}>Sócio de <strong>{socios.find(s => s.id === socioForm.parentSocioId)?.nome_razao_social ?? '—'}</strong></p>}
              {erroForm && <div className="alert-error" style={{ marginBottom: 12 }}>{erroForm}</div>}
              <form onSubmit={salvarSocio}>
                <div className="form-grid">
                  <div className="form-field full">
                    <label className="form-label">Tipo de Pessoa</label>
                    <div style={{ display: 'flex', gap: 16, paddingTop: 4 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                        <input type="radio" name="tipo" checked={socioForm.tipo_pessoa === 'PJ'}
                          onChange={() => setSocioForm({ ...socioForm, tipo_pessoa: 'PJ', documento: maskCNPJ(socioForm.documento) })} /> Jurídica (CNPJ)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                        <input type="radio" name="tipo" checked={socioForm.tipo_pessoa === 'PF'}
                          onChange={() => setSocioForm({ ...socioForm, tipo_pessoa: 'PF', documento: maskCPF(socioForm.documento) })} /> Física (CPF)
                      </label>
                    </div>
                  </div>
                  <div className="form-field full">
                    <label className="form-label">Nome / Razão Social *</label>
                    <input className="fam-input" type="text" value={socioForm.nome_razao_social}
                      placeholder={socioForm.tipo_pessoa === 'PJ' ? 'Razão social da empresa' : 'Nome completo'}
                      onChange={(e) => setSocioForm({ ...socioForm, nome_razao_social: e.target.value })} autoFocus />
                  </div>
                  <div className="form-field">
                    <label className="form-label">{socioForm.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'}</label>
                    <input className="fam-input" type="text" value={socioForm.documento}
                      placeholder={socioForm.tipo_pessoa === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                      maxLength={socioForm.tipo_pessoa === 'PJ' ? 18 : 14}
                      onChange={(e) => setSocioForm({ ...socioForm, documento: maskDoc(e.target.value) })} />
                  </div>
                  {ehDiretorForm ? (
                    <div className="form-field">
                      <label className="form-label">Cargo</label>
                      <input className="fam-input" type="text" value={socioForm.cargo} placeholder="Ex: Diretor Presidente"
                        onChange={(e) => setSocioForm({ ...socioForm, cargo: e.target.value })} />
                    </div>
                  ) : (
                    <div className="form-field">
                      <label className="form-label">Participação (%)</label>
                      <input className="fam-input" type="text" value={socioForm.percentual} placeholder="Ex: 75"
                        onChange={(e) => setSocioForm({ ...socioForm, percentual: e.target.value.replace(/[^\d.,]/g, '') })} />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setSocioForm(null)}>Cancelar</button>
                  <button type="submit" className="btn-primary" disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Sub-modal: confirmar exclusão ── */}
        {confirmDelete && (
          <div className="modal-overlay" style={{ zIndex: 1300 }} onClick={(e) => { if (e.target === e.currentTarget) { setConfirmDelete(null); setErroDelete('') } }}>
            <div className="modal-box" style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <div className="modal-title">{confirmDelete.categoria === 'diretor' ? 'Excluir Diretor' : 'Excluir Sócio'}</div>
                <button onClick={() => { setConfirmDelete(null); setErroDelete('') }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
              </div>
              {erroDelete && <div className="alert-error" style={{ marginBottom: 12 }}>{erroDelete}</div>}
              <p style={{ color: '#1a2a3a', margin: '0 0 20px', lineHeight: 1.5 }}>
                Excluir <strong>{confirmDelete.nome_razao_social}</strong>
                {'filhos' in confirmDelete && confirmDelete.filhos.length > 0 && <> e <strong style={{ color: '#d64545' }}>todos os {contarSocios(confirmDelete.filhos)} sócios abaixo dele</strong></>}?
                {' '}Esta ação é <strong style={{ color: '#d64545' }}>irreversível</strong>.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => { setConfirmDelete(null); setErroDelete('') }}>Cancelar</button>
                <button type="button" className="btn-danger" disabled={enviando} onClick={excluirSocio}>{enviando ? 'Excluindo…' : 'Excluir'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Preview PDF ── */}
        {pdfPreviewUrl && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: '95vw', height: '95vh', background: '#0a1628', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.7)', border: '1px solid rgba(232,184,75,0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: '#102040', borderBottom: '2px solid #e8b84b', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div>
                    <span style={{ color: '#e8b84b', fontWeight: 800, fontSize: 15 }}>FAM</span>
                    <span style={{ color: 'rgba(232,184,75,0.5)', fontWeight: 400, fontSize: 9, marginLeft: 5, letterSpacing: 2 }}>SEGURADORA</span>
                  </div>
                  <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.12)' }} />
                  <div>
                    <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 13 }}>Pré-visualização do Organograma</div>
                    <div style={{ color: '#6080a0', fontSize: 11 }}>{tomador.razao_social}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <a href={pdfPreviewUrl} download={pdfPreviewFilename}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 8, textDecoration: 'none', background: '#e8b84b', color: '#102040', fontWeight: 700, fontSize: 13 }}>⬇ Baixar PDF</a>
                  <button onClick={() => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null) }}
                    style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: '#a0c0e8', fontWeight: 500 }}>✕ Fechar</button>
                </div>
              </div>
              <iframe src={pdfPreviewUrl} style={{ flex: 1, border: 'none', background: '#f0f0f0' }} title="Pré-visualização PDF" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
