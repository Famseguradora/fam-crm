'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtData } from '@/lib/utils'
import type { Produto, Modalidade } from '@/types'

// ─── Form ────────────────────────────────────────────────────────────────────

interface FormModalidade {
  produto_id: string
  nome: string
  codigo_cobertura: string
  grupo: string
  observacao: string
  status: 'ativo' | 'inativo'
}

const FORM_INICIAL: FormModalidade = {
  produto_id: '',
  nome: '',
  codigo_cobertura: '',
  grupo: '',
  observacao: '',
  status: 'ativo',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [modalidades, setModalidades] = useState<Modalidade[]>([])
  const [carregando, setCarregando] = useState(true)

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroSetor, setFiltroSetor] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  // Modal
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState<Modalidade | null>(null)
  const [form, setForm] = useState<FormModalidade>(FORM_INICIAL)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  // Export
  const [exportando, setExportando] = useState(false)

  // ─── Loaders ─────────────────────────────────────────────────────────────────

  const carregar = useCallback(async () => {
    setCarregando(true)
    const supabase = createClient()
    const [{ data: prods }, { data: mods }] = await Promise.all([
      supabase.from('produtos').select('*').order('codigo'),
      supabase.from('modalidades').select('*, produto:produtos(id,nome,codigo)').order('codigo_cobertura'),
    ])
    setProdutos((prods as Produto[]) ?? [])
    setModalidades((mods as Modalidade[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // ─── CRUD ─────────────────────────────────────────────────────────────────────

  function abrirNova(produtoIdInicial?: string) {
    setEditando(null)
    setForm({ ...FORM_INICIAL, produto_id: produtoIdInicial ?? '' })
    setMsg(null)
    setMostrarForm(true)
  }

  function abrirEditar(m: Modalidade) {
    setEditando(m)
    setForm({
      produto_id: m.produto_id ?? '',
      nome: m.nome,
      codigo_cobertura: m.codigo_cobertura ?? '',
      grupo: m.grupo ?? '',
      observacao: m.observacao ?? '',
      status: m.status,
    })
    setMsg(null)
    setMostrarForm(true)
  }

  function fecharForm() {
    setMostrarForm(false)
    setEditando(null)
    setForm(FORM_INICIAL)
    setMsg(null)
  }

  async function salvar(e: React.SyntheticEvent) {
    e.preventDefault()
    setEnviando(true)
    setMsg(null)
    const payload = {
      produto_id: form.produto_id || null,
      nome: form.nome.trim(),
      codigo_cobertura: form.codigo_cobertura.trim() || null,
      grupo: form.grupo.trim() || null,
      observacao: form.observacao.trim() || null,
      status: form.status,
    }
    try {
      const supabase = createClient()
      if (editando) {
        const { error } = await supabase.from('modalidades').update(payload).eq('id', editando.id)
        if (error) throw new Error(error.message)
        setMsg({ tipo: 'sucesso', texto: 'Modalidade atualizada com sucesso.' })
      } else {
        const { error } = await supabase.from('modalidades').insert(payload)
        if (error) throw new Error(error.message)
        setMsg({ tipo: 'sucesso', texto: 'Modalidade cadastrada com sucesso.' })
        setForm({ ...FORM_INICIAL, produto_id: form.produto_id })
      }
      await carregar()
    } catch (err: unknown) {
      setMsg({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro desconhecido.' })
    } finally {
      setEnviando(false)
    }
  }

  async function toggleStatus(m: Modalidade) {
    const supabase = createClient()
    await supabase.from('modalidades').update({ status: m.status === 'ativo' ? 'inativo' : 'ativo' }).eq('id', m.id)
    await carregar()
  }

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const filtradas = useMemo(() => modalidades.filter((m) => {
    const txt = busca.toLowerCase()
    const textMatch = !busca ||
      m.nome.toLowerCase().includes(txt) ||
      (m.codigo_cobertura ?? '').toLowerCase().includes(txt) ||
      (m.produto?.nome ?? '').toLowerCase().includes(txt) ||
      (m.grupo ?? '').toLowerCase().includes(txt)
    const setorMatch = !filtroSetor || m.produto_id === filtroSetor
    const stMatch = !filtroStatus || m.status === filtroStatus
    return textMatch && setorMatch && stMatch
  }), [modalidades, busca, filtroSetor, filtroStatus])

  const kpis = useMemo(() => {
    const pub = produtos.find((p) => p.codigo === '75')
    const priv = produtos.find((p) => p.codigo === '76')
    return {
      total: modalidades.length,
      publico: modalidades.filter((m) => m.produto_id === pub?.id).length,
      privado: modalidades.filter((m) => m.produto_id === priv?.id).length,
      ativas: modalidades.filter((m) => m.status === 'ativo').length,
    }
  }, [modalidades, produtos])

  // ─── Exports ─────────────────────────────────────────────────────────────────

  async function exportarExcel() {
    setExportando(true)
    const { utils, writeFile } = await import('xlsx')
    const linhas = filtradas.map((m, i) => ({
      '#': i + 1,
      'Produto': m.produto?.nome ?? '—',
      'Modalidade': m.nome,
      'Código Cobertura': m.codigo_cobertura ?? '—',
      'Grupo': m.grupo ?? '—',
      'Status': m.status === 'ativo' ? 'Ativo' : 'Inativo',
      'Cadastrado em': fmtData(m.created_at),
    }))
    const ws = utils.json_to_sheet(linhas)
    ws['!cols'] = [{ wch: 4 }, { wch: 22 }, { wch: 36 }, { wch: 16 }, { wch: 20 }, { wch: 10 }, { wch: 14 }]
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Modalidades')
    writeFile(wb, 'FAM_Produtos_Modalidades.xlsx')
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
    doc.text('FAM Seguradora — Produtos e Modalidades', 14, 12)
    doc.setTextColor(160, 192, 232)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} · ${filtradas.length} modalidade(s)`, 190, 12)
    autoTable(doc, {
      startY: 24,
      head: [['#', 'Produto', 'Modalidade', 'Código Cobertura', 'Grupo', 'Status', 'Cadastrado']],
      body: filtradas.map((m, i) => [
        i + 1,
        m.produto?.nome ?? '—',
        m.nome,
        m.codigo_cobertura ?? '—',
        m.grupo ?? '—',
        m.status === 'ativo' ? 'Ativo' : 'Inativo',
        fmtData(m.created_at),
      ]),
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [26, 53, 96], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [232, 240, 250] },
      columnStyles: {
        0: { cellWidth: 8 },
        3: { cellWidth: 26 },
        4: { cellWidth: 30 },
        5: { cellWidth: 16 },
        6: { cellWidth: 22 },
      },
    })
    doc.save('FAM_Produtos_Modalidades.pdf')
    setExportando(false)
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const setorPublico = produtos.find((p) => p.codigo === '75')
  const setorPrivado = produtos.find((p) => p.codigo === '76')

  return (
    <>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#102040' }}>Produtos e Modalidades</div>
          <div style={{ fontSize: 13, color: '#6080a0' }}>
            Gerencie as modalidades de seguro garantia por setor
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-export" onClick={exportarExcel} disabled={exportando || filtradas.length === 0}>⬇ Excel</button>
          <button className="btn-export" onClick={exportarPDF} disabled={exportando || filtradas.length === 0}>⬇ PDF</button>
          <button className="btn-primary" onClick={() => abrirNova()}>+ Nova Modalidade</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="kpi-card highlight" style={{ flex: '1 1 140px' }}>
          <div className="kpi-label">Total</div>
          <div className="kpi-value">{kpis.total}</div>
          <div className="kpi-sub">modalidades cadastradas</div>
        </div>
        <div className="kpi-card" style={{ flex: '1 1 140px', borderLeft: '4px solid #1a5fa0' }}>
          <div className="kpi-label">Setor Público - 75</div>
          <div className="kpi-value" style={{ color: '#1a5fa0' }}>{kpis.publico}</div>
          <div className="kpi-sub">modalidades</div>
        </div>
        <div className="kpi-card" style={{ flex: '1 1 140px', borderLeft: '4px solid #7b3fa0' }}>
          <div className="kpi-label">Setor Privado - 76</div>
          <div className="kpi-value" style={{ color: '#7b3fa0' }}>{kpis.privado}</div>
          <div className="kpi-sub">modalidades</div>
        </div>
        <div className="kpi-card green" style={{ flex: '1 1 140px' }}>
          <div className="kpi-label">Ativas</div>
          <div className="kpi-value">{kpis.ativas}</div>
          <div className="kpi-sub">disponíveis para operação</div>
        </div>
      </div>

      {/* Botões de atalho por setor */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={() => setorPublico && abrirNova(setorPublico.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 20px', borderRadius: 10,
            border: '2px solid #1a5fa0', background: '#f0f6ff',
            color: '#1a5fa0', cursor: 'pointer', fontFamily: "'Calibri','Segoe UI',sans-serif",
            fontSize: 14, fontWeight: 700, transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#dbeafe')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#f0f6ff')}
        >
          <span style={{ fontSize: 22 }}>🏛️</span>
          <div style={{ textAlign: 'left' }}>
            <div>Setor Público - 75</div>
            <div style={{ fontSize: 11, fontWeight: 400, color: '#4a80c0' }}>{kpis.publico} modalidade{kpis.publico !== 1 ? 's' : ''} · clique para adicionar</div>
          </div>
        </button>
        <button
          onClick={() => setorPrivado && abrirNova(setorPrivado.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 20px', borderRadius: 10,
            border: '2px solid #7b3fa0', background: '#f8f0ff',
            color: '#7b3fa0', cursor: 'pointer', fontFamily: "'Calibri','Segoe UI',sans-serif",
            fontSize: 14, fontWeight: 700, transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#ede9fe')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#f8f0ff')}
        >
          <span style={{ fontSize: 22 }}>🏢</span>
          <div style={{ textAlign: 'left' }}>
            <div>Setor Privado - 76</div>
            <div style={{ fontSize: 11, fontWeight: 400, color: '#9060c0' }}>{kpis.privado} modalidade{kpis.privado !== 1 ? 's' : ''} · clique para adicionar</div>
          </div>
        </button>
      </div>

      {/* Filtros */}
      <div className="filter-row">
        <div className="filter-group" style={{ flex: '2 1 200px' }}>
          <label className="filter-label">Buscar</label>
          <input
            className="fam-input"
            type="text"
            placeholder="Nome, código, grupo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="filter-group" style={{ flex: '1 1 180px' }}>
          <label className="filter-label">Setor</label>
          <select className="fam-input" value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)}>
            <option value="">Todos</option>
            {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div className="filter-group" style={{ flex: '1 1 130px' }}>
          <label className="filter-label">Status</label>
          <select className="fam-input" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
        {(busca || filtroSetor || filtroStatus) && (
          <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
            <label className="filter-label">&nbsp;</label>
            <button className="btn-clear" onClick={() => { setBusca(''); setFiltroSetor(''); setFiltroStatus('') }}>
              Limpar
            </button>
          </div>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#6080a0', alignSelf: 'flex-end', paddingBottom: 2 }}>
          {filtradas.length} modalidade{filtradas.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Tabela */}
      <div className="fam-table-wrap">
        <table className="fam-table">
          <thead>
            <tr>
              <th>Cód. Cobertura</th>
              <th>Produto</th>
              <th>Modalidade</th>
              <th>Grupo</th>
              <th>Status</th>
              <th>Cadastrado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>Carregando...</td></tr>
            ) : filtradas.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>
                {busca || filtroSetor || filtroStatus
                  ? 'Nenhuma modalidade encontrada para os filtros selecionados.'
                  : 'Nenhuma modalidade cadastrada ainda.'}
              </td></tr>
            ) : filtradas.map((m) => {
              const isPublico = m.produto?.codigo === '75'
              return (
                <tr key={m.id}>
                  <td>
                    <span
                      className="badge"
                      style={{
                        fontFamily: 'monospace', letterSpacing: '0.5px',
                        background: isPublico ? '#dbeafe' : '#ede9fe',
                        color: isPublico ? '#1a5fa0' : '#7b3fa0',
                      }}
                    >
                      {m.codigo_cobertura ?? '—'}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                      background: isPublico ? '#f0f6ff' : '#f8f0ff',
                      color: isPublico ? '#1a5fa0' : '#7b3fa0',
                    }}>
                      {m.produto?.nome ?? '—'}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{m.nome}</td>
                  <td style={{ fontSize: 13, color: '#6080a0' }}>{m.grupo || '—'}</td>
                  <td>
                    <span className={`badge ${m.status === 'ativo' ? 'badge-green' : 'badge-red'}`}>
                      {m.status === 'ativo' ? 'ATIVO' : 'INATIVO'}
                    </span>
                  </td>
                  <td style={{ fontSize: 13, color: '#6080a0' }}>{fmtData(m.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => abrirEditar(m)}
                        style={{ padding: '5px 12px', borderRadius: 6, border: '1.5px solid #c5d5e8', background: 'white', color: '#1e4080', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif" }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleStatus(m)}
                        style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif", background: m.status === 'ativo' ? '#fdf3e6' : '#e6f9f0', color: m.status === 'ativo' ? '#a05010' : '#1a7a50' }}
                      >
                        {m.status === 'ativo' ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Modal ───────────────────────────────────────────────────────────────── */}
      {mostrarForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div className="modal-title">{editando ? '✏️ Editar Modalidade' : '+ Nova Modalidade'}</div>
              <button onClick={fecharForm} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
            </div>

            {msg && (
              <div className={msg.tipo === 'sucesso' ? 'alert-success' : 'alert-error'} style={{ marginBottom: 16 }}>
                {msg.texto}
              </div>
            )}

            <form onSubmit={salvar}>
              <div className="form-grid">

                {/* Setor */}
                <div className="form-field full">
                  <label className="form-label">Setor *</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {produtos.filter((p) => p.status === 'ativo').map((p) => {
                      const isPublico = p.codigo === '75'
                      const selecionado = form.produto_id === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setForm({ ...form, produto_id: p.id })}
                          style={{
                            flex: 1, padding: '12px 10px', borderRadius: 8, cursor: 'pointer',
                            fontFamily: "'Calibri','Segoe UI',sans-serif", fontSize: 13, fontWeight: 700,
                            border: selecionado
                              ? `2px solid ${isPublico ? '#1a5fa0' : '#7b3fa0'}`
                              : '2px solid #d0e4f5',
                            background: selecionado
                              ? (isPublico ? '#dbeafe' : '#ede9fe')
                              : '#f8fafc',
                            color: selecionado
                              ? (isPublico ? '#1a5fa0' : '#7b3fa0')
                              : '#6080a0',
                            transition: 'all 0.15s',
                          }}
                        >
                          <div>{isPublico ? '🏛️' : '🏢'} {p.nome}</div>
                        </button>
                      )
                    })}
                  </div>
                  {!form.produto_id && (
                    <div style={{ fontSize: 11, color: '#e05040', marginTop: 4 }}>Selecione o setor para continuar</div>
                  )}
                </div>

                {/* Modalidade + Código */}
                <div className="form-field" style={{ flex: '2 1 200px' }}>
                  <label className="form-label">Modalidade *</label>
                  <input
                    className="fam-input"
                    type="text"
                    placeholder="Ex: Licitante"
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    required
                  />
                </div>
                <div className="form-field" style={{ flex: '1 1 120px' }}>
                  <label className="form-label">Código Cobertura *</label>
                  <input
                    className="fam-input"
                    type="text"
                    placeholder="Ex: 75.01"
                    value={form.codigo_cobertura}
                    onChange={(e) => setForm({ ...form, codigo_cobertura: e.target.value })}
                    required
                  />
                </div>

                {/* Grupo */}
                <div className="form-field full">
                  <label className="form-label">Grupo <span style={{ color: '#6080a0', fontWeight: 400 }}>(opcional)</span></label>
                  <input
                    className="fam-input"
                    type="text"
                    placeholder="Ex: Empreitada, Fornecimento..."
                    value={form.grupo}
                    onChange={(e) => setForm({ ...form, grupo: e.target.value })}
                  />
                </div>

                {/* Observação */}
                <div className="form-field full">
                  <label className="form-label">Observação <span style={{ color: '#6080a0', fontWeight: 400 }}>(opcional)</span></label>
                  <textarea
                    className="fam-input"
                    rows={3}
                    placeholder="Informações adicionais sobre esta modalidade..."
                    value={form.observacao}
                    onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                    style={{ resize: 'vertical' }}
                  />
                </div>

                {/* Status */}
                <div className="form-field">
                  <label className="form-label">Status *</label>
                  <select
                    className="fam-input"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as 'ativo' | 'inativo' })}
                    required
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={fecharForm}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={enviando || !form.produto_id}>
                  {enviando ? 'Salvando...' : editando ? 'Salvar Alterações' : 'Cadastrar Modalidade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
