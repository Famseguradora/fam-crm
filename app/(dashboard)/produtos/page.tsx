'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtData, titleCase } from '@/lib/utils'
import type { Produto } from '@/types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Modalidade {
  id: string
  nome: string
  codigo: string | null
  status: 'ativo' | 'inativo'
  created_at: string
}

interface FormProduto {
  nome: string
  modalidade: string
  cobertura_associada: string
  codigo_interno: string
  observacao: string
  status: 'ativo' | 'inativo'
}

interface FormModalidade {
  nome: string
  codigo: string
  status: 'ativo' | 'inativo'
}

const FORM_PRODUTO: FormProduto = {
  nome: '', modalidade: '', cobertura_associada: '',
  codigo_interno: '', observacao: '', status: 'ativo',
}

const FORM_MODALIDADE: FormModalidade = { nome: '', codigo: '', status: 'ativo' }

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProdutosPage() {
  const [aba, setAba] = useState<'produtos' | 'modalidades'>('produtos')

  // ── Produtos ──
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carregandoProd, setCarregandoProd] = useState(true)
  const [mostrarFormProd, setMostrarFormProd] = useState(false)
  const [editandoProd, setEditandoProd] = useState<Produto | null>(null)
  const [formProd, setFormProd] = useState<FormProduto>(FORM_PRODUTO)
  const [enviandoProd, setEnviandoProd] = useState(false)
  const [msgProd, setMsgProd] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [buscaProd, setBuscaProd] = useState('')
  const [filtroModalidade, setFiltroModalidade] = useState('')
  const [filtroStatusProd, setFiltroStatusProd] = useState('')
  const [exportando, setExportando] = useState(false)

  // ── Modalidades ──
  const [modalidades, setModalidades] = useState<Modalidade[]>([])
  const [carregandoMod, setCarregandoMod] = useState(true)
  const [mostrarFormMod, setMostrarFormMod] = useState(false)
  const [editandoMod, setEditandoMod] = useState<Modalidade | null>(null)
  const [formMod, setFormMod] = useState<FormModalidade>(FORM_MODALIDADE)
  const [enviandoMod, setEnviandoMod] = useState(false)
  const [msgMod, setMsgMod] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [buscaMod, setBuscaMod] = useState('')

  // ─── Loaders ───────────────────────────────────────────────────────────────

  const carregarProdutos = useCallback(async () => {
    setCarregandoProd(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('produtos').select('*').order('nome')
    if (error) console.error('produtos:', error.message)
    setProdutos(data ?? [])
    setCarregandoProd(false)
  }, [])

  const carregarModalidades = useCallback(async () => {
    setCarregandoMod(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('modalidades').select('*').order('nome')
    if (error) console.error('modalidades:', error.message)
    setModalidades(data ?? [])
    setCarregandoMod(false)
  }, [])

  useEffect(() => {
    carregarProdutos()
    carregarModalidades()
  }, [carregarProdutos, carregarModalidades])

  // ─── Produtos CRUD ─────────────────────────────────────────────────────────

  function abrirNovoProd() {
    setEditandoProd(null)
    setFormProd(FORM_PRODUTO)
    setMsgProd(null)
    setMostrarFormProd(true)
  }

  function abrirEditarProd(p: Produto) {
    setEditandoProd(p)
    setFormProd({
      nome: p.nome,
      modalidade: p.modalidade ?? '',
      cobertura_associada: p.cobertura_associada ?? '',
      codigo_interno: p.codigo_interno ?? '',
      observacao: p.observacao ?? '',
      status: p.status,
    })
    setMsgProd(null)
    setMostrarFormProd(true)
  }

  function fecharFormProd() {
    setMostrarFormProd(false)
    setEditandoProd(null)
    setFormProd(FORM_PRODUTO)
    setMsgProd(null)
  }

  async function salvarProduto(e: React.SyntheticEvent) {
    e.preventDefault()
    setEnviandoProd(true)
    setMsgProd(null)

    const payload = {
      nome: titleCase(formProd.nome),
      modalidade: formProd.modalidade || null,
      cobertura_associada: formProd.cobertura_associada || null,
      codigo_interno: formProd.codigo_interno || null,
      observacao: formProd.observacao || null,
      status: formProd.status,
    }

    try {
      const supabase = createClient()
      if (editandoProd) {
        const { error } = await supabase.from('produtos').update(payload).eq('id', editandoProd.id)
        if (error) throw new Error(error.message)
        setMsgProd({ tipo: 'sucesso', texto: 'Cobertura atualizada com sucesso.' })
      } else {
        const { error } = await supabase.from('produtos').insert(payload)
        if (error) throw new Error(error.message)
        setMsgProd({ tipo: 'sucesso', texto: 'Cobertura cadastrada com sucesso.' })
        setFormProd(FORM_PRODUTO)
      }
      await carregarProdutos()
    } catch (err: unknown) {
      setMsgProd({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro desconhecido.' })
    } finally {
      setEnviandoProd(false)
    }
  }

  async function toggleStatusProd(p: Produto) {
    const supabase = createClient()
    await supabase.from('produtos').update({ status: p.status === 'ativo' ? 'inativo' : 'ativo' }).eq('id', p.id)
    await carregarProdutos()
  }

  // ─── Modalidades CRUD ──────────────────────────────────────────────────────

  function abrirNovaMod() {
    setEditandoMod(null)
    setFormMod(FORM_MODALIDADE)
    setMsgMod(null)
    setMostrarFormMod(true)
  }

  function abrirEditarMod(m: Modalidade) {
    setEditandoMod(m)
    setFormMod({ nome: m.nome, codigo: m.codigo ?? '', status: m.status })
    setMsgMod(null)
    setMostrarFormMod(true)
  }

  function fecharFormMod() {
    setMostrarFormMod(false)
    setEditandoMod(null)
    setFormMod(FORM_MODALIDADE)
    setMsgMod(null)
  }

  async function salvarModalidade(e: React.SyntheticEvent) {
    e.preventDefault()
    setEnviandoMod(true)
    setMsgMod(null)

    const payload = {
      nome: titleCase(formMod.nome),
      codigo: formMod.codigo || null,
      status: formMod.status,
    }

    try {
      const supabase = createClient()
      if (editandoMod) {
        const { error } = await supabase.from('modalidades').update(payload).eq('id', editandoMod.id)
        if (error) throw new Error(error.message)
        setMsgMod({ tipo: 'sucesso', texto: 'Modalidade atualizada com sucesso.' })
      } else {
        const { error } = await supabase.from('modalidades').insert(payload)
        if (error) throw new Error(error.message)
        setMsgMod({ tipo: 'sucesso', texto: 'Modalidade cadastrada com sucesso.' })
        setFormMod(FORM_MODALIDADE)
      }
      await carregarModalidades()
    } catch (err: unknown) {
      setMsgMod({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro desconhecido.' })
    } finally {
      setEnviandoMod(false)
    }
  }

  async function toggleStatusMod(m: Modalidade) {
    const supabase = createClient()
    await supabase.from('modalidades').update({ status: m.status === 'ativo' ? 'inativo' : 'ativo' }).eq('id', m.id)
    await carregarModalidades()
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const produtosFiltrados = useMemo(() => produtos.filter((p) => {
    const textMatch =
      p.nome.toLowerCase().includes(buscaProd.toLowerCase()) ||
      (p.codigo_interno ?? '').toLowerCase().includes(buscaProd.toLowerCase()) ||
      (p.modalidade ?? '').toLowerCase().includes(buscaProd.toLowerCase())
    const modMatch = !filtroModalidade || p.modalidade === filtroModalidade
    const stMatch = !filtroStatusProd || p.status === filtroStatusProd
    return textMatch && modMatch && stMatch
  }), [produtos, buscaProd, filtroModalidade, filtroStatusProd])

  const kpis = useMemo(() => ({
    total: produtos.length,
    ativos: produtos.filter((p) => p.status === 'ativo').length,
    inativos: produtos.filter((p) => p.status === 'inativo').length,
    modalidadesUnicas: new Set(produtos.map((p) => p.modalidade).filter(Boolean)).size,
  }), [produtos])

  const modalidadesAtivas = useMemo(() =>
    modalidades.filter((m) => m.status === 'ativo'), [modalidades])

  const modalidadesNoProd = useMemo(() =>
    [...new Set(produtos.map((p) => p.modalidade).filter(Boolean))].sort() as string[],
    [produtos])

  const modalidadesFiltradas = useMemo(() =>
    modalidades.filter((m) => m.nome.toLowerCase().includes(buscaMod.toLowerCase())),
    [modalidades, buscaMod])

  // ─── Exports ───────────────────────────────────────────────────────────────

  async function exportarExcel() {
    setExportando(true)
    const { utils, writeFile } = await import('xlsx')
    const linhas = produtosFiltrados.map((p, i) => ({
      '#': i + 1,
      'Nome da Cobertura': p.nome,
      'Modalidade': p.modalidade ?? '—',
      'Cobertura Associada': p.cobertura_associada ?? '—',
      'Código Interno': p.codigo_interno ?? '—',
      'Observação': p.observacao ?? '—',
      'Status': p.status === 'ativo' ? 'Ativo' : 'Inativo',
      'Cadastrado em': fmtData(p.created_at),
    }))
    const ws = utils.json_to_sheet(linhas)
    ws['!cols'] = [{ wch: 4 }, { wch: 36 }, { wch: 28 }, { wch: 30 }, { wch: 14 }, { wch: 40 }, { wch: 10 }, { wch: 14 }]
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Produtos')
    writeFile(wb, 'FAM_Coberturas.xlsx')
    setExportando(false)
  }

  async function exportarPDF() {
    setExportando(true)
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFillColor(10, 22, 40)
    doc.rect(0, 0, 297, 18, 'F')
    doc.setTextColor(232, 184, 75)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('FAM Seguradora — Cadastro de Coberturas', 14, 12)
    doc.setTextColor(160, 192, 232)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} · ${produtosFiltrados.length} cobertura(s)`, 210, 12)
    autoTable(doc, {
      startY: 24,
      head: [['#', 'Nome da Cobertura', 'Modalidade', 'Cobertura Associada', 'Cód. Interno', 'Status', 'Cadastrado']],
      body: produtosFiltrados.map((p, i) => [
        i + 1, p.nome, p.modalidade ?? '—', p.cobertura_associada ?? '—',
        p.codigo_interno ?? '—', p.status === 'ativo' ? 'Ativo' : 'Inativo', fmtData(p.created_at),
      ]),
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [26, 53, 96], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [232, 240, 250] },
      columnStyles: { 0: { cellWidth: 8 }, 5: { cellWidth: 16 }, 6: { cellWidth: 22 } },
    })
    doc.save('FAM_Coberturas.pdf')
    setExportando(false)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Cabeçalho da página ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#102040' }}>Produtos</div>
          <div style={{ fontSize: 13, color: '#6080a0' }}>
            Cadastro de coberturas e modalidades disponíveis para operação
          </div>
        </div>
        {aba === 'produtos' ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-export" onClick={exportarExcel} disabled={exportando || produtosFiltrados.length === 0}>⬇ Excel</button>
            <button className="btn-export" onClick={exportarPDF} disabled={exportando || produtosFiltrados.length === 0}>⬇ PDF</button>
            <button className="btn-primary" onClick={abrirNovoProd}>+ Nova Cobertura</button>
          </div>
        ) : (
          <button className="btn-primary" onClick={abrirNovaMod}>+ Nova Modalidade</button>
        )}
      </div>

      {/* ── Abas internas ── */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24,
        borderBottom: '2px solid #d0e4f5',
      }}>
        {(['produtos', 'modalidades'] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            style={{
              padding: '9px 22px 8px',
              background: aba === a ? 'white' : 'transparent',
              border: aba === a ? '1.5px solid #d0e4f5' : '1.5px solid transparent',
              borderBottom: aba === a ? '2px solid white' : '2px solid transparent',
              borderRadius: '8px 8px 0 0',
              marginBottom: -2,
              color: aba === a ? '#1e4080' : '#6080a0',
              fontFamily: "'Calibri','Segoe UI',sans-serif",
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            {a === 'produtos' ? '📦 Coberturas' : '🏷️ Modalidades'}
          </button>
        ))}
      </div>

      {/* ══════════════════════ ABA PRODUTOS ══════════════════════ */}
      {aba === 'produtos' && (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            <div className="kpi-card highlight" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Total</div>
              <div className="kpi-value">{kpis.total}</div>
              <div className="kpi-sub">coberturas cadastradas</div>
            </div>
            <div className="kpi-card green" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Ativos</div>
              <div className="kpi-value">{kpis.ativos}</div>
              <div className="kpi-sub">disponíveis para operação</div>
            </div>
            <div className="kpi-card red" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Inativos</div>
              <div className="kpi-value">{kpis.inativos}</div>
              <div className="kpi-sub">fora de operação</div>
            </div>
            <div className="kpi-card accent" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Modalidades</div>
              <div className="kpi-value">{kpis.modalidadesUnicas}</div>
              <div className="kpi-sub">modalidades distintas</div>
            </div>
          </div>

          {/* Modal Produto */}
          {mostrarFormProd && (
            <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && fecharFormProd()}>
              <div className="modal-box" style={{ maxWidth: 640 }}>
                <div className="modal-header">
                  <div className="modal-title">{editandoProd ? '✏️ Editar Cobertura' : '+ Nova Cobertura'}</div>
                  <button onClick={fecharFormProd} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
                </div>

                {msgProd && (
                  <div className={msgProd.tipo === 'sucesso' ? 'alert-success' : 'alert-error'} style={{ marginBottom: 16 }}>
                    {msgProd.texto}
                  </div>
                )}

                <form onSubmit={salvarProduto}>
                  <div className="form-grid">

                    <div className="form-field full">
                      <label className="form-label">Nome da Cobertura *</label>
                      <input
                        className="fam-input"
                        type="text"
                        placeholder="Ex: Seguro Garantia Judicial"
                        value={formProd.nome}
                        onChange={(e) => setFormProd({ ...formProd, nome: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-field">
                      <label className="form-label">Modalidade</label>
                      <select
                        className="fam-input"
                        value={formProd.modalidade}
                        onChange={(e) => setFormProd({ ...formProd, modalidade: e.target.value })}
                      >
                        <option value="">— Selecione —</option>
                        {modalidadesAtivas.map((m) => (
                          <option key={m.id} value={m.nome}>{m.nome}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-field">
                      <label className="form-label">Código Interno</label>
                      <input
                        className="fam-input"
                        type="text"
                        placeholder="Ex: GJ-001"
                        value={formProd.codigo_interno}
                        onChange={(e) => setFormProd({ ...formProd, codigo_interno: e.target.value.toUpperCase() })}
                      />
                    </div>

                    <div className="form-field full">
                      <label className="form-label">Cobertura Associada</label>
                      <input
                        className="fam-input"
                        type="text"
                        placeholder="Ex: Inadimplência de obrigações contratuais, perdas financeiras"
                        value={formProd.cobertura_associada}
                        onChange={(e) => setFormProd({ ...formProd, cobertura_associada: e.target.value })}
                      />
                    </div>

                    <div className="form-field">
                      <label className="form-label">Status *</label>
                      <select
                        className="fam-input"
                        value={formProd.status}
                        onChange={(e) => setFormProd({ ...formProd, status: e.target.value as 'ativo' | 'inativo' })}
                        required
                      >
                        <option value="ativo">Ativo</option>
                        <option value="inativo">Inativo</option>
                      </select>
                    </div>

                    <div className="form-field full">
                      <label className="form-label">Observação</label>
                      <textarea
                        className="fam-input"
                        placeholder="Informações adicionais sobre o produto..."
                        value={formProd.observacao}
                        onChange={(e) => setFormProd({ ...formProd, observacao: e.target.value })}
                        rows={3}
                        style={{ resize: 'vertical' }}
                      />
                    </div>

                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary" onClick={fecharFormProd}>Cancelar</button>
                    <button type="submit" className="btn-primary" disabled={enviandoProd}>
                      {enviandoProd ? 'Salvando...' : editandoProd ? 'Salvar Alterações' : 'Cadastrar Cobertura'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Filtros Produtos */}
          <div className="filter-row">
            <div className="filter-group" style={{ flex: '2 1 200px' }}>
              <label className="filter-label">Buscar</label>
              <input
                className="fam-input"
                type="text"
                placeholder="Nome, código ou modalidade..."
                value={buscaProd}
                onChange={(e) => setBuscaProd(e.target.value)}
              />
            </div>
            <div className="filter-group" style={{ flex: '1 1 180px' }}>
              <label className="filter-label">Modalidade</label>
              <select className="fam-input" value={filtroModalidade} onChange={(e) => setFiltroModalidade(e.target.value)}>
                <option value="">Todas</option>
                {modalidadesNoProd.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="filter-group" style={{ flex: '1 1 130px' }}>
              <label className="filter-label">Status</label>
              <select className="fam-input" value={filtroStatusProd} onChange={(e) => setFiltroStatusProd(e.target.value)}>
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
            {(buscaProd || filtroModalidade || filtroStatusProd) && (
              <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
                <label className="filter-label">&nbsp;</label>
                <button className="btn-clear" onClick={() => { setBuscaProd(''); setFiltroModalidade(''); setFiltroStatusProd('') }}>
                  Limpar
                </button>
              </div>
            )}
            <div style={{ marginLeft: 'auto', fontSize: 13, color: '#6080a0', alignSelf: 'flex-end', paddingBottom: 2 }}>
              {produtosFiltrados.length} cobertura{produtosFiltrados.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Tabela Produtos */}
          <div className="fam-table-wrap">
            <table className="fam-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nome da Cobertura</th>
                  <th>Modalidade</th>
                  <th>Cobertura Associada</th>
                  <th>Cód. Interno</th>
                  <th>Status</th>
                  <th>Cadastrado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {carregandoProd ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>Carregando coberturas...</td></tr>
                ) : produtosFiltrados.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>
                    {buscaProd || filtroModalidade || filtroStatusProd
                      ? 'Nenhuma cobertura encontrada para os filtros selecionados.'
                      : 'Nenhuma cobertura cadastrada ainda.'}
                  </td></tr>
                ) : produtosFiltrados.map((p, i) => (
                  <tr key={p.id}>
                    <td style={{ color: '#6080a0', fontSize: 13 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{p.nome}</td>
                    <td>
                      {p.modalidade
                        ? <span className="badge badge-blue">{p.modalidade}</span>
                        : <span style={{ color: '#6080a0', fontSize: 13 }}>—</span>}
                    </td>
                    <td style={{ fontSize: 13, color: '#6080a0', maxWidth: 220 }}>
                      <span title={p.cobertura_associada ?? ''} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.cobertura_associada || '—'}
                      </span>
                    </td>
                    <td>
                      {p.codigo_interno
                        ? <span className="badge badge-gray">{p.codigo_interno}</span>
                        : <span style={{ color: '#6080a0', fontSize: 13 }}>—</span>}
                    </td>
                    <td>
                      <span className={`badge ${p.status === 'ativo' ? 'badge-green' : 'badge-red'}`}>
                        {p.status === 'ativo' ? 'ATIVO' : 'INATIVO'}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: '#6080a0' }}>{fmtData(p.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => abrirEditarProd(p)} style={{ padding: '5px 12px', borderRadius: 6, border: '1.5px solid #c5d5e8', background: 'white', color: '#1e4080', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif" }}>
                          Editar
                        </button>
                        <button onClick={() => toggleStatusProd(p)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif", background: p.status === 'ativo' ? '#fdf3e6' : '#e6f9f0', color: p.status === 'ativo' ? '#a05010' : '#1a7a50' }}>
                          {p.status === 'ativo' ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══════════════════════ ABA MODALIDADES ══════════════════════ */}
      {aba === 'modalidades' && (
        <>
          {/* KPI Modalidades */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            <div className="kpi-card highlight" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Total</div>
              <div className="kpi-value">{modalidades.length}</div>
              <div className="kpi-sub">modalidades cadastradas</div>
            </div>
            <div className="kpi-card green" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Ativas</div>
              <div className="kpi-value">{modalidades.filter((m) => m.status === 'ativo').length}</div>
              <div className="kpi-sub">disponíveis para seleção</div>
            </div>
            <div className="kpi-card red" style={{ flex: '1 1 150px' }}>
              <div className="kpi-label">Inativas</div>
              <div className="kpi-value">{modalidades.filter((m) => m.status === 'inativo').length}</div>
              <div className="kpi-sub">ocultas no formulário</div>
            </div>
          </div>

          {/* Modal Modalidade */}
          {mostrarFormMod && (
            <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && fecharFormMod()}>
              <div className="modal-box" style={{ maxWidth: 440 }}>
                <div className="modal-header">
                  <div className="modal-title">{editandoMod ? '✏️ Editar Modalidade' : '+ Nova Modalidade'}</div>
                  <button onClick={fecharFormMod} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
                </div>

                {msgMod && (
                  <div className={msgMod.tipo === 'sucesso' ? 'alert-success' : 'alert-error'} style={{ marginBottom: 16 }}>
                    {msgMod.texto}
                  </div>
                )}

                <form onSubmit={salvarModalidade}>
                  <div className="form-grid">
                    <div className="form-field">
                      <label className="form-label">Nome da Modalidade *</label>
                      <input
                        className="fam-input"
                        type="text"
                        placeholder="Ex: Garantia Judicial"
                        value={formMod.nome}
                        onChange={(e) => setFormMod({ ...formMod, nome: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Código do Produto</label>
                      <input
                        className="fam-input"
                        type="text"
                        placeholder="Ex: GJ-001"
                        value={formMod.codigo}
                        onChange={(e) => setFormMod({ ...formMod, codigo: e.target.value.toUpperCase() })}
                      />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Status *</label>
                      <select
                        className="fam-input"
                        value={formMod.status}
                        onChange={(e) => setFormMod({ ...formMod, status: e.target.value as 'ativo' | 'inativo' })}
                        required
                      >
                        <option value="ativo">Ativo</option>
                        <option value="inativo">Inativo</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary" onClick={fecharFormMod}>Cancelar</button>
                    <button type="submit" className="btn-primary" disabled={enviandoMod}>
                      {enviandoMod ? 'Salvando...' : editandoMod ? 'Salvar Alterações' : 'Cadastrar Modalidade'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Busca Modalidades */}
          <div style={{ background: 'white', padding: '14px 18px', borderRadius: 10, marginBottom: 20, border: '1px solid #c5d5e8', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6080a0', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>Buscar</div>
            <input
              className="fam-input"
              type="text"
              placeholder="Nome da modalidade..."
              value={buscaMod}
              onChange={(e) => setBuscaMod(e.target.value)}
              style={{ maxWidth: 300 }}
            />
            {buscaMod && <button className="btn-clear" onClick={() => setBuscaMod('')}>Limpar</button>}
            <div style={{ marginLeft: 'auto', fontSize: 13, color: '#6080a0' }}>
              {modalidadesFiltradas.length} modalidade{modalidadesFiltradas.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Tabela Modalidades */}
          <div className="fam-table-wrap">
            <table className="fam-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nome da Modalidade</th>
                  <th>Código do Produto</th>
                  <th>Status</th>
                  <th>Cadastrado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {carregandoMod ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>Carregando modalidades...</td></tr>
                ) : modalidadesFiltradas.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>
                    {buscaMod ? 'Nenhuma modalidade encontrada.' : 'Nenhuma modalidade cadastrada ainda.'}
                  </td></tr>
                ) : modalidadesFiltradas.map((m, i) => (
                  <tr key={m.id}>
                    <td style={{ color: '#6080a0', fontSize: 13 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{m.nome}</td>
                    <td>
                      {m.codigo
                        ? <span className="badge badge-gray">{m.codigo}</span>
                        : <span style={{ color: '#6080a0', fontSize: 13 }}>—</span>}
                    </td>
                    <td>
                      <span className={`badge ${m.status === 'ativo' ? 'badge-green' : 'badge-red'}`}>
                        {m.status === 'ativo' ? 'ATIVO' : 'INATIVO'}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: '#6080a0' }}>{fmtData(m.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => abrirEditarMod(m)} style={{ padding: '5px 12px', borderRadius: 6, border: '1.5px solid #c5d5e8', background: 'white', color: '#1e4080', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif" }}>
                          Editar
                        </button>
                        <button onClick={() => toggleStatusMod(m)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif", background: m.status === 'ativo' ? '#fdf3e6' : '#e6f9f0', color: m.status === 'ativo' ? '#a05010' : '#1a7a50' }}>
                          {m.status === 'ativo' ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
