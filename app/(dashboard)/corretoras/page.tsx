'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { maskCNPJ, maskTelefone, maskCEP, titleCase, fmtData, validarCNPJ } from '@/lib/utils'
import type { Corretora } from '@/types'
import AnexosSection from '@/components/AnexosSection'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormData {
  razao_social: string
  nome_fantasia: string
  cnpj: string
  codigo_susep: string
  email: string
  telefone: string
  celular: string
  cep: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  estado: string
  responsavel: string
  observacao: string
  status: 'ativo' | 'inativo'
}

const FORM_INICIAL: FormData = {
  razao_social: '', nome_fantasia: '', cnpj: '', codigo_susep: '',
  email: '', telefone: '', celular: '',
  cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
  responsavel: '', observacao: '', status: 'ativo',
}

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CorretorasPage() {
  const [corretoras, setCorretoras] = useState<Corretora[]>([])
  const [carregando, setCarregando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState<Corretora | null>(null)
  const [form, setForm] = useState<FormData>(FORM_INICIAL)
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [erroCnpj, setErroCnpj] = useState('')
  const [corretorasComTomadores, setCorretorasComTomadores] = useState(0)
  const [corretorasComOperacoes, setCorretorasComOperacoes] = useState(0)
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const carregarCorretoras = useCallback(async () => {
    setCarregando(true)
    const supabase = createClient()
    const [{ data, error }, { data: tomIds }, { data: opIds }] = await Promise.all([
      supabase.from('corretoras').select('*').order('razao_social'),
      supabase.from('tomadores').select('corretora_id'),
      supabase.from('operacoes').select('corretora_id'),
    ])
    if (error) console.error('corretoras:', error.message)
    setCorretoras(data ?? [])
    setCorretorasComTomadores(new Set((tomIds ?? []).map((r: { corretora_id: string | null }) => r.corretora_id).filter(Boolean)).size)
    setCorretorasComOperacoes(new Set((opIds ?? []).map((r: { corretora_id: string | null }) => r.corretora_id).filter(Boolean)).size)
    setCarregando(false)
  }, [])

  useEffect(() => { carregarCorretoras() }, [carregarCorretoras])

  // ─── CEP Lookup ────────────────────────────────────────────────────────────

  async function buscarCep(cep: string) {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (data.erro) {
        setMensagem({ tipo: 'erro', texto: 'CEP não encontrado.' })
        return
      }
      setForm((f) => ({
        ...f,
        endereco: data.logradouro ?? '',
        bairro: data.bairro ?? '',
        cidade: data.localidade ?? '',
        estado: data.uf ?? '',
        complemento: data.complemento ?? f.complemento,
      }))
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Erro ao buscar CEP. Verifique sua conexão.' })
    } finally {
      setBuscandoCep(false)
    }
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  function abrirNovo() {
    setEditando(null)
    setForm(FORM_INICIAL)
    setMensagem(null)
    setErroCnpj('')
    setMostrarForm(true)
  }

  function abrirEditar(c: Corretora) {
    setEditando(c)
    setForm({
      razao_social: c.razao_social,
      nome_fantasia: c.nome_fantasia ?? '',
      cnpj: maskCNPJ(c.cnpj),
      codigo_susep: c.codigo_susep ?? '',
      email: c.email ?? '',
      telefone: c.telefone ?? '',
      celular: c.celular ?? '',
      cep: c.cep ?? '',
      endereco: c.endereco ?? '',
      numero: c.numero ?? '',
      complemento: c.complemento ?? '',
      bairro: c.bairro ?? '',
      cidade: c.cidade ?? '',
      estado: c.estado ?? '',
      responsavel: c.responsavel ?? '',
      observacao: c.observacao ?? '',
      status: c.status,
    })
    setMensagem(null)
    setErroCnpj('')
    setMostrarForm(true)
  }

  function fecharForm() {
    setMostrarForm(false)
    setEditando(null)
    setForm(FORM_INICIAL)
    setMensagem(null)
    setErroCnpj('')
  }

  useEffect(() => {
    if (!mostrarForm) return
    function handleEsc(e: KeyboardEvent) { if (e.key === 'Escape') fecharForm() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [mostrarForm])

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setErroCnpj('')

    const cnpjDigits = form.cnpj.replace(/\D/g, '')
    if (!validarCNPJ(cnpjDigits)) {
      setErroCnpj('CNPJ inválido.')
      return
    }

    setEnviando(true)
    setMensagem(null)

    const payload = {
      razao_social: titleCase(form.razao_social),
      nome_fantasia: form.nome_fantasia || null,
      cnpj: cnpjDigits,
      codigo_susep: form.codigo_susep || null,
      email: form.email.toLowerCase() || null,
      telefone: form.telefone || null,
      celular: form.celular || null,
      cep: form.cep.replace(/\D/g, '') || null,
      endereco: form.endereco || null,
      numero: form.numero || null,
      complemento: form.complemento || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      responsavel: form.responsavel ? titleCase(form.responsavel) : null,
      observacao: form.observacao || null,
      status: form.status,
    }

    try {
      const supabase = createClient()
      if (editando) {
        const { error } = await supabase.from('corretoras').update(payload).eq('id', editando.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('corretoras').insert(payload)
        if (error) throw new Error(error.message)
      }
      await carregarCorretoras()
      fecharForm()
    } catch (err: unknown) {
      setMensagem({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro desconhecido.' })
    } finally {
      setEnviando(false)
    }
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  function handleSort(field: string) {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function sortIcon(field: string) {
    if (sortField !== field) return ' ↕'
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  const thSort: React.CSSProperties = { cursor: 'pointer', userSelect: 'none' }

  const corretorasFiltradas = useMemo(() => {
    const filtered = corretoras.filter((c) => {
      const textMatch =
        c.razao_social.toLowerCase().includes(busca.toLowerCase()) ||
        (c.nome_fantasia ?? '').toLowerCase().includes(busca.toLowerCase()) ||
        c.cnpj.includes(busca.replace(/\D/g, '')) ||
        (c.responsavel ?? '').toLowerCase().includes(busca.toLowerCase())
      const estadoMatch = !filtroEstado || c.estado === filtroEstado
      const statusMatch = !filtroStatus || c.status === filtroStatus
      return textMatch && estadoMatch && statusMatch
    })
    if (!sortField) return filtered
    return [...filtered].sort((a, b) => {
      let va = '', vb = ''
      if (sortField === 'razao_social') { va = a.razao_social; vb = b.razao_social }
      else if (sortField === 'cnpj') { va = a.cnpj; vb = b.cnpj }
      else if (sortField === 'cidade') { va = a.cidade ?? ''; vb = b.cidade ?? '' }
      else if (sortField === 'responsavel') { va = a.responsavel ?? ''; vb = b.responsavel ?? '' }
      const cmp = va.localeCompare(vb, 'pt-BR', { sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [corretoras, busca, filtroEstado, filtroStatus, sortField, sortDir])

  const kpis = useMemo(() => ({
    total: corretoras.length,
    ativas: corretoras.filter((c) => c.status === 'ativo').length,
  }), [corretoras])

  const estadosNoDados = useMemo(() =>
    [...new Set(corretoras.map((c) => c.estado).filter(Boolean))].sort() as string[],
    [corretoras])

  // ─── Exports ───────────────────────────────────────────────────────────────

  async function exportarExcel() {
    setExportando(true)
    const { utils, writeFile } = await import('xlsx')
    const linhas = corretorasFiltradas.map((c, i) => ({
      '#': i + 1,
      'Razão Social': c.razao_social,
      'Nome Fantasia': c.nome_fantasia ?? '—',
      'CNPJ': maskCNPJ(c.cnpj),
      'Cód. SUSEP': c.codigo_susep ?? '—',
      'E-mail': c.email ?? '—',
      'Telefone': c.telefone ?? '—',
      'Celular': c.celular ?? '—',
      'Cidade': c.cidade ?? '—',
      'Estado': c.estado ?? '—',
      'Responsável': c.responsavel ?? '—',
      'Status': c.status === 'ativo' ? 'Ativo' : 'Inativo',
      'Cadastrado em': fmtData(c.created_at),
    }))
    const ws = utils.json_to_sheet(linhas)
    ws['!cols'] = [{ wch: 4 }, { wch: 36 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 8 }, { wch: 24 }, { wch: 10 }, { wch: 14 }]
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Corretoras')
    writeFile(wb, 'FAM_Corretoras.xlsx')
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
    doc.text('FAM Seguradora — Cadastro de Corretoras', 14, 12)
    doc.setTextColor(160, 192, 232)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} · ${corretorasFiltradas.length} corretora(s)`, 200, 12)
    autoTable(doc, {
      startY: 24,
      head: [['#', 'Razão Social', 'CNPJ', 'Cód. SUSEP', 'E-mail', 'Cidade/UF', 'Responsável', 'Status']],
      body: corretorasFiltradas.map((c, i) => [
        i + 1,
        c.razao_social,
        maskCNPJ(c.cnpj),
        c.codigo_susep ?? '—',
        c.email ?? '—',
        c.cidade ? `${c.cidade}/${c.estado}` : '—',
        c.responsavel ?? '—',
        c.status === 'ativo' ? 'Ativo' : 'Inativo',
      ]),
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [26, 53, 96], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [232, 240, 250] },
      columnStyles: { 0: { cellWidth: 8 }, 7: { cellWidth: 16 } },
    })
    doc.save('FAM_Corretoras.pdf')
    setExportando(false)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Cabeçalho ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#102040' }}>Corretoras</div>
          <div style={{ fontSize: 13, color: '#6080a0' }}>Cadastro e gestão dos corretores responsáveis pelas operações</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-export" onClick={exportarExcel} disabled={exportando || corretorasFiltradas.length === 0}>⬇ Excel</button>
          <button className="btn-export" onClick={exportarPDF} disabled={exportando || corretorasFiltradas.length === 0}>⬇ PDF</button>
          <button className="btn-primary" onClick={abrirNovo}>+ Nova Corretora</button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="kpi-card highlight" style={{ flex: '1 1 150px' }}>
          <div className="kpi-label">Total</div>
          <div className="kpi-value">{kpis.total}</div>
          <div className="kpi-sub">corretoras cadastradas</div>
        </div>
        <div className="kpi-card green" style={{ flex: '1 1 150px' }}>
          <div className="kpi-label">Ativas</div>
          <div className="kpi-value">{kpis.ativas}</div>
          <div className="kpi-sub">em operação</div>
        </div>
        <div className="kpi-card accent" style={{ flex: '1 1 150px' }}>
          <div className="kpi-label">Corretoras com Tomadores</div>
          <div className="kpi-value">{corretorasComTomadores}</div>
          <div className="kpi-sub">cadastradas únicas</div>
        </div>
        <div className="kpi-card" style={{ flex: '1 1 150px' }}>
          <div className="kpi-label">Corretoras com Operações</div>
          <div className="kpi-value">{corretorasComOperacoes}</div>
          <div className="kpi-sub">total de operações por corretoras ativas</div>
        </div>
      </div>

      {/* ── Modal Cadastro / Edição ── */}
      {mostrarForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <div className="modal-title">{editando ? '✏️ Editar Corretora' : '+ Nova Corretora'}</div>
              <button onClick={fecharForm} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
            </div>

            {mensagem && (
              <div className={mensagem.tipo === 'sucesso' ? 'alert-success' : 'alert-error'} style={{ marginBottom: 16 }}>
                {mensagem.texto}
              </div>
            )}

            <form onSubmit={handleSubmit}>

              {/* Seção: Dados da Empresa */}
              <div className="section-title" style={{ marginBottom: 14 }}>
                <span className="dot" />Dados da Empresa
              </div>
              <div className="form-grid" style={{ marginBottom: 20 }}>
                <div className="form-field full">
                  <label className="form-label">Razão Social *</label>
                  <input className="fam-input" type="text" placeholder="Razão Social da Corretora" value={form.razao_social}
                    onChange={(e) => setForm({ ...form, razao_social: e.target.value })} required />
                </div>
                <div className="form-field full">
                  <label className="form-label">Nome Fantasia</label>
                  <input className="fam-input" type="text" placeholder="Nome comercial" value={form.nome_fantasia}
                    onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} />
                </div>
                <div className="form-field">
                  <label className="form-label">CNPJ *</label>
                  <input className={`fam-input${erroCnpj ? ' invalid' : ''}`} type="text" placeholder="00.000.000/0000-00"
                    value={form.cnpj}
                    onChange={(e) => { setErroCnpj(''); setForm({ ...form, cnpj: maskCNPJ(e.target.value) }) }}
                    maxLength={18} required />
                  {erroCnpj && <span className="field-error">{erroCnpj}</span>}
                </div>
                <div className="form-field">
                  <label className="form-label">Código SUSEP</label>
                  <input className="fam-input" type="text" placeholder="Ex: 12345-6" value={form.codigo_susep}
                    onChange={(e) => setForm({ ...form, codigo_susep: e.target.value })} />
                </div>
                <div className="form-field">
                  <label className="form-label">Status *</label>
                  <select className="fam-input" value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as 'ativo' | 'inativo' })} required>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
              </div>

              {/* Seção: Contato */}
              <div className="section-title" style={{ marginBottom: 14 }}>
                <span className="dot" style={{ background: '#27a96c' }} />Contato
              </div>
              <div className="form-grid" style={{ marginBottom: 20 }}>
                <div className="form-field full">
                  <label className="form-label">E-mail</label>
                  <input className="fam-input" type="email" placeholder="contato@corretora.com.br" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value.toLowerCase() })} />
                </div>
                <div className="form-field">
                  <label className="form-label">Telefone</label>
                  <input className="fam-input" type="text" placeholder="(11) 3000-0000" value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: maskTelefone(e.target.value) })} maxLength={16} />
                </div>
                <div className="form-field">
                  <label className="form-label">Celular</label>
                  <input className="fam-input" type="text" placeholder="(11) 9.0000-0000" value={form.celular}
                    onChange={(e) => setForm({ ...form, celular: maskTelefone(e.target.value) })} maxLength={16} />
                </div>
                <div className="form-field full">
                  <label className="form-label">Responsável</label>
                  <input className="fam-input" type="text" placeholder="Nome do responsável / contato principal" value={form.responsavel}
                    onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
                </div>
              </div>

              {/* Seção: Endereço */}
              <div className="section-title" style={{ marginBottom: 14 }}>
                <span className="dot" style={{ background: '#e8b84b' }} />Endereço
              </div>
              <div className="form-grid" style={{ marginBottom: 20 }}>
                <div className="form-field">
                  <label className="form-label">CEP</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="fam-input"
                      type="text"
                      placeholder="00000-000"
                      value={form.cep}
                      onChange={(e) => {
                        const val = maskCEP(e.target.value)
                        setForm({ ...form, cep: val })
                        if (val.replace(/\D/g, '').length === 8) buscarCep(val)
                      }}
                      maxLength={9}
                    />
                    {buscandoCep && (
                      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#6080a0' }}>
                        buscando...
                      </span>
                    )}
                  </div>
                </div>
                <div className="form-field">
                  <label className="form-label">Estado</label>
                  <select className="fam-input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                    <option value="">— UF —</option>
                    {ESTADOS_BR.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
                <div className="form-field full">
                  <label className="form-label">Endereço</label>
                  <input className="fam-input" type="text" placeholder="Rua, Avenida..." value={form.endereco}
                    onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
                </div>
                <div className="form-field">
                  <label className="form-label">Número</label>
                  <input className="fam-input" type="text" placeholder="Ex: 123" value={form.numero}
                    onChange={(e) => setForm({ ...form, numero: e.target.value })} />
                </div>
                <div className="form-field">
                  <label className="form-label">Complemento</label>
                  <input className="fam-input" type="text" placeholder="Sala, Andar..." value={form.complemento}
                    onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
                </div>
                <div className="form-field">
                  <label className="form-label">Bairro</label>
                  <input className="fam-input" type="text" placeholder="Bairro" value={form.bairro}
                    onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
                </div>
                <div className="form-field">
                  <label className="form-label">Cidade</label>
                  <input className="fam-input" type="text" placeholder="Cidade" value={form.cidade}
                    onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
                </div>
              </div>

              {/* Seção: Observação */}
              <div className="section-title" style={{ marginBottom: 14 }}>
                <span className="dot" style={{ background: '#6080a0' }} />Observação
              </div>
              <div className="form-grid">
                <div className="form-field full">
                  <label className="form-label">Observação</label>
                  <textarea className="fam-input" placeholder="Informações adicionais sobre a corretora..."
                    value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                    rows={3} style={{ resize: 'vertical' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={fecharForm}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={enviando}>
                  {enviando ? 'Salvando...' : editando ? 'Salvar Alterações' : 'Cadastrar Corretora'}
                </button>
              </div>
            </form>

            {editando && (
              <>
                <hr style={{ border: 'none', borderTop: '1.5px solid #e0ecf8', margin: '20px 0' }} />
                <AnexosSection entidadeTipo="corretora" entidadeId={editando.id} />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="filter-row">
        <div className="filter-group" style={{ flex: '2 1 220px' }}>
          <label className="filter-label">Buscar</label>
          <input className="fam-input" type="text" placeholder="Razão social, CNPJ ou responsável..."
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="filter-group" style={{ flex: '1 1 120px' }}>
          <label className="filter-label">Estado</label>
          <select className="fam-input" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            {estadosNoDados.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
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
        {(busca || filtroEstado || filtroStatus) && (
          <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
            <label className="filter-label">&nbsp;</label>
            <button className="btn-clear" onClick={() => { setBusca(''); setFiltroEstado(''); setFiltroStatus('') }}>Limpar</button>
          </div>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#6080a0', alignSelf: 'flex-end', paddingBottom: 2 }}>
          {corretorasFiltradas.length} corretora{corretorasFiltradas.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Tabela ── */}
      <div className="fam-table-wrap">
        <table className="fam-table">
          <thead>
            <tr>
              <th>#</th>
              <th style={thSort} onClick={() => handleSort('razao_social')}>Razão Social{sortIcon('razao_social')}</th>
              <th style={thSort} onClick={() => handleSort('cnpj')}>CNPJ{sortIcon('cnpj')}</th>
              <th style={thSort} onClick={() => handleSort('cidade')}>Cidade / UF{sortIcon('cidade')}</th>
              <th style={thSort} onClick={() => handleSort('responsavel')}>Responsável{sortIcon('responsavel')}</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>Carregando corretoras...</td></tr>
            ) : corretorasFiltradas.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>
                {busca || filtroEstado || filtroStatus ? 'Nenhuma corretora encontrada para os filtros selecionados.' : 'Nenhuma corretora cadastrada ainda.'}
              </td></tr>
            ) : corretorasFiltradas.map((c, i) => (
              <tr key={c.id} onClick={() => abrirEditar(c)} style={{ cursor: 'pointer' }}>
                <td style={{ color: '#6080a0', fontSize: 13 }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{c.razao_social}</td>
                <td style={{ fontSize: 13, fontFamily: 'monospace' }}>{maskCNPJ(c.cnpj)}</td>
                <td style={{ fontSize: 13, color: '#6080a0' }}>
                  {c.cidade ? `${c.cidade}${c.estado ? ` / ${c.estado}` : ''}` : '—'}
                </td>
                <td style={{ fontSize: 13, color: '#6080a0' }}>{c.responsavel || '—'}</td>
                <td>
                  <button onClick={(e) => { e.stopPropagation(); abrirEditar(c); }} style={{ padding: '5px 12px', borderRadius: 6, border: '1.5px solid #c5d5e8', background: 'white', color: '#1e4080', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif" }}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
