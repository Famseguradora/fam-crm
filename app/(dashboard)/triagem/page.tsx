'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { maskCNPJ, maskTelefone, fmtMoeda, fmtData, titleCase, validarCNPJ } from '@/lib/utils'
import type { Corretora, Produto, Tomador, Operacao } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormTriagem {
  // Tomador
  cnpj: string
  razao_social: string
  nome_fantasia: string
  corretora_id: string
  cidade: string
  estado: string
  // Operação
  produto_id: string
  modalidade: string
  corretor: string
  lmg: string
  taxa: string
  vigencia_anos: string
  temperatura: string
  prioridade: string
  observacao: string
}

const FORM_INICIAL: FormTriagem = {
  cnpj: '', razao_social: '', nome_fantasia: '', corretora_id: '', cidade: '', estado: '',
  produto_id: '', modalidade: '', corretor: '', lmg: '', taxa: '', vigencia_anos: '',
  temperatura: 'Frio', prioridade: 'Fluxo Normal', observacao: '',
}

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TriagemPage() {
  const [triagens, setTriagens] = useState<Operacao[]>([])
  const [corretoras, setCorretoras] = useState<Corretora[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [modalidades, setModalidades] = useState<{ id: string; nome: string }[]>([])
  const [carregando, setCarregando] = useState(true)

  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState<FormTriagem>(FORM_INICIAL)
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  // CNPJ lookup state
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [tomadorExistente, setTomadorExistente] = useState<Tomador | null>(null)
  const [cnpjVerificado, setCnpjVerificado] = useState(false)
  const [erroCnpj, setErroCnpj] = useState('')

  // ─── Loaders ────────────────────────────────────────────────────────────────

  const carregarTriagens = useCallback(async () => {
    setCarregando(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('operacoes')
      .select('*, tomador:tomadores(id,razao_social,cnpj), corretora:corretoras(id,razao_social), produto:produtos(id,nome)')
      .order('created_at', { ascending: false })
      .limit(50)
    setTriagens((data as Operacao[]) ?? [])
    setCarregando(false)
  }, [])

  const carregarAuxiliares = useCallback(async () => {
    const supabase = createClient()
    const [{ data: cor }, { data: prod }, { data: mod }] = await Promise.all([
      supabase.from('corretoras').select('id,razao_social,cnpj').eq('status', 'ativo').order('razao_social'),
      supabase.from('produtos').select('id,nome,modalidade').eq('status', 'ativo').order('nome'),
      supabase.from('modalidades').select('id,nome').eq('status', 'ativo').order('nome'),
    ])
    setCorretoras((cor as Corretora[]) ?? [])
    setProdutos((prod as Produto[]) ?? [])
    setModalidades(mod ?? [])
  }, [])

  useEffect(() => {
    carregarTriagens()
    carregarAuxiliares()
  }, [carregarTriagens, carregarAuxiliares])

  // ─── CNPJ Lookup ────────────────────────────────────────────────────────────

  async function buscarTomadorPorCnpj() {
    const digits = form.cnpj.replace(/\D/g, '')
    if (!validarCNPJ(digits)) {
      setErroCnpj('CNPJ inválido.')
      return
    }
    setBuscandoCnpj(true)
    setErroCnpj('')
    setTomadorExistente(null)
    const supabase = createClient()
    const { data } = await supabase
      .from('tomadores')
      .select('*, corretora:corretoras(id,razao_social)')
      .eq('cnpj', digits)
      .maybeSingle()
    if (data) {
      setTomadorExistente(data as Tomador)
      setForm((f) => ({
        ...f,
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia ?? '',
        corretora_id: data.corretora_id ?? '',
        cidade: data.cidade ?? '',
        estado: data.estado ?? '',
      }))
    }
    setCnpjVerificado(true)
    setBuscandoCnpj(false)
  }

  function resetarCnpj() {
    setForm(FORM_INICIAL)
    setTomadorExistente(null)
    setCnpjVerificado(false)
    setErroCnpj('')
  }

  // ─── Produto → Modalidade auto-fill ────────────────────────────────────────

  function handleProdutoChange(prodId: string) {
    const prod = produtos.find((p) => p.id === prodId)
    setForm((f) => ({
      ...f,
      produto_id: prodId,
      modalidade: prod?.modalidade ?? f.modalidade,
    }))
  }

  // ─── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!cnpjVerificado) {
      setMensagem({ tipo: 'erro', texto: 'Clique em "Buscar" para verificar o CNPJ antes de continuar.' })
      return
    }
    if (!form.produto_id) {
      setMensagem({ tipo: 'erro', texto: 'Selecione um produto.' })
      return
    }
    if (!form.lmg || isNaN(parseFloat(form.lmg.replace(',', '.')))) {
      setMensagem({ tipo: 'erro', texto: 'Informe o LMG (Limite Máximo de Garantia).' })
      return
    }
    setEnviando(true)
    setMensagem(null)
    try {
      const supabase = createClient()
      let tomadorId: string

      if (tomadorExistente) {
        tomadorId = tomadorExistente.id
      } else {
        const { data: novoTomador, error: errTom } = await supabase
          .from('tomadores')
          .insert({
            cnpj: form.cnpj.replace(/\D/g, ''),
            razao_social: titleCase(form.razao_social),
            nome_fantasia: form.nome_fantasia || null,
            corretora_id: form.corretora_id || null,
            cidade: form.cidade || null,
            estado: form.estado || null,
            status: 'Triagem',
            ativo: true,
          })
          .select('id')
          .single()
        if (errTom) throw new Error(errTom.message)
        tomadorId = novoTomador.id
      }

      const lmgNum = parseFloat(form.lmg.replace(/\./g, '').replace(',', '.'))
      const taxaNum = form.taxa ? parseFloat(form.taxa.replace(',', '.')) : null
      const vigNum = form.vigencia_anos ? parseInt(form.vigencia_anos) : null

      const { error: errOp } = await supabase.from('operacoes').insert({
        tomador_id: tomadorId,
        corretora_id: form.corretora_id || null,
        produto_id: form.produto_id,
        modalidade: form.modalidade || null,
        corretor: form.corretor || null,
        lmg: lmgNum,
        taxa: taxaNum,
        vigencia_anos: vigNum,
        premio_previsto: taxaNum && lmgNum ? (lmgNum * taxaNum) / 100 : null,
        temperatura: form.temperatura || null,
        prioridade: form.prioridade,
        estado: form.estado || null,
        observacao: form.observacao || null,
        status: 'Triagem',
        ativo: true,
      })
      if (errOp) throw new Error(errOp.message)

      const nomeExibido = tomadorExistente
        ? tomadorExistente.razao_social
        : titleCase(form.razao_social)
      setMensagem({ tipo: 'sucesso', texto: `Triagem registrada com sucesso para ${nomeExibido}.` })
      setForm(FORM_INICIAL)
      setTomadorExistente(null)
      setCnpjVerificado(false)
      await carregarTriagens()
    } catch (err: unknown) {
      setMensagem({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro desconhecido.' })
    } finally {
      setEnviando(false)
    }
  }

  // ─── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const hoje = new Date().toDateString()
    return {
      total: triagens.length,
      hoje: triagens.filter((t) => new Date(t.created_at).toDateString() === hoje).length,
      emTriagem: triagens.filter((t) => t.status === 'Triagem').length,
      quentes: triagens.filter((t) => t.temperatura === 'Quente').length,
    }
  }, [triagens])

  // ─── Badge helpers ──────────────────────────────────────────────────────────

  function badgeStatus(status: string) {
    const s = status.toLowerCase()
    if (s === 'triagem') return 'badge-blue'
    if (s.includes('análise') || s.includes('analise')) return 'badge-yellow'
    if (s.includes('aprovado') || s.includes('emitido') || s.includes('ativo')) return 'badge-green'
    if (s.includes('recusado') || s.includes('perdido') || s.includes('negado')) return 'badge-red'
    if (s.includes('subscrição') || s.includes('comitê')) return 'badge-purple'
    return 'badge-gray'
  }

  function badgePrioridade(p: string | null) {
    if (p === 'Urgente') return 'badge-red'
    if (p === 'Prioridade') return 'badge-orange'
    return 'badge-gray'
  }

  function badgeTemperatura(t: string | null) {
    if (t === 'Quente') return 'badge-red'
    if (t === 'Morno') return 'badge-orange'
    return 'badge-blue'
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#102040' }}>Triagem</div>
          <div style={{ fontSize: 13, color: '#6080a0' }}>Porta de entrada — registre novas oportunidades de negócio</div>
        </div>
        <button className="btn-primary" onClick={() => { setMostrarForm(true); setMensagem(null) }}>
          + Nova Triagem
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="kpi-card highlight" style={{ flex: '1 1 150px' }}>
          <div className="kpi-label">Total de Operações</div>
          <div className="kpi-value">{kpis.total}</div>
          <div className="kpi-sub">registradas no sistema</div>
        </div>
        <div className="kpi-card accent" style={{ flex: '1 1 150px' }}>
          <div className="kpi-label">Em Triagem</div>
          <div className="kpi-value">{kpis.emTriagem}</div>
          <div className="kpi-sub">aguardando avanço</div>
        </div>
        <div className="kpi-card green" style={{ flex: '1 1 150px' }}>
          <div className="kpi-label">Registradas Hoje</div>
          <div className="kpi-value">{kpis.hoje}</div>
          <div className="kpi-sub">novas entradas</div>
        </div>
        <div className="kpi-card red" style={{ flex: '1 1 150px' }}>
          <div className="kpi-label">Quentes</div>
          <div className="kpi-value">{kpis.quentes}</div>
          <div className="kpi-sub">alta prioridade</div>
        </div>
      </div>

      {/* Modal Nova Triagem */}
      {mostrarForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setMostrarForm(false)}>
          <div className="modal-box" style={{ maxWidth: 760 }}>
            <div className="modal-header">
              <div className="modal-title">🔍 Nova Triagem</div>
              <button onClick={() => setMostrarForm(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
            </div>

            {mensagem && (
              <div className={mensagem.tipo === 'sucesso' ? 'alert-success' : 'alert-error'} style={{ marginBottom: 16 }}>
                {mensagem.texto}
                {mensagem.tipo === 'sucesso' && (
                  <button
                    onClick={() => { setMensagem(null); setCnpjVerificado(false) }}
                    style={{ marginLeft: 12, background: 'none', border: 'none', color: '#1a7a50', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                  >
                    + Registrar outra
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit}>

              {/* ── Seção Tomador ── */}
              <div className="section-title" style={{ marginBottom: 14 }}>
                <span className="dot" />Tomador
              </div>

              {/* CNPJ lookup */}
              <div style={{ marginBottom: 16 }}>
                <label className="form-label">CNPJ *</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                  <input
                    className={`fam-input${erroCnpj ? ' invalid' : cnpjVerificado ? ' valid' : ''}`}
                    type="text"
                    placeholder="00.000.000/0000-00"
                    value={form.cnpj}
                    onChange={(e) => {
                      setForm({ ...form, cnpj: maskCNPJ(e.target.value) })
                      if (cnpjVerificado) resetarCnpj()
                      setErroCnpj('')
                    }}
                    maxLength={18}
                    disabled={cnpjVerificado}
                    required
                  />
                  {!cnpjVerificado ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={buscarTomadorPorCnpj}
                      disabled={buscandoCnpj || form.cnpj.replace(/\D/g, '').length < 14}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {buscandoCnpj ? 'Buscando...' : 'Buscar'}
                    </button>
                  ) : (
                    <button type="button" className="btn-secondary" onClick={resetarCnpj} style={{ whiteSpace: 'nowrap' }}>
                      Alterar
                    </button>
                  )}
                </div>
                {erroCnpj && <span className="field-error">{erroCnpj}</span>}
                {cnpjVerificado && tomadorExistente && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#e6f9f0', borderRadius: 7, border: '1px solid #a7e9c8', fontSize: 13, color: '#1a7a50', fontWeight: 600 }}>
                    ✓ Tomador encontrado: <strong>{tomadorExistente.razao_social}</strong>
                    {' '}— Status: <strong>{tomadorExistente.status}</strong>
                    {tomadorExistente.corretora && ` · Corretora: ${(tomadorExistente.corretora as Corretora).razao_social}`}
                  </div>
                )}
                {cnpjVerificado && !tomadorExistente && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#fff8e6', borderRadius: 7, border: '1px solid #f5d88a', fontSize: 13, color: '#7a5000', fontWeight: 600 }}>
                    ⚠ CNPJ não cadastrado — preencha os dados abaixo para criar o tomador
                  </div>
                )}
              </div>

              {/* Dados do tomador (só aparece se não encontrado) */}
              {cnpjVerificado && !tomadorExistente && (
                <div className="form-grid" style={{ marginBottom: 20 }}>
                  <div className="form-field full">
                    <label className="form-label">Razão Social *</label>
                    <input className="fam-input" type="text" placeholder="Razão Social do Tomador" value={form.razao_social}
                      onChange={(e) => setForm({ ...form, razao_social: e.target.value })} required />
                  </div>
                  <div className="form-field full">
                    <label className="form-label">Nome Fantasia</label>
                    <input className="fam-input" type="text" placeholder="Nome comercial" value={form.nome_fantasia}
                      onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} />
                  </div>
                  <div className="form-field full">
                    <label className="form-label">Corretora</label>
                    <select className="fam-input" value={form.corretora_id}
                      onChange={(e) => setForm({ ...form, corretora_id: e.target.value })}>
                      <option value="">— Selecione a corretora —</option>
                      {corretoras.map((c) => (
                        <option key={c.id} value={c.id}>{c.razao_social}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-label">Cidade</label>
                    <input className="fam-input" type="text" placeholder="Cidade" value={form.cidade}
                      onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Estado</label>
                    <select className="fam-input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                      <option value="">— UF —</option>
                      {ESTADOS_BR.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Corretora (quando tomador existe, permite alterar corretora da operação) */}
              {cnpjVerificado && tomadorExistente && (
                <div className="form-grid" style={{ marginBottom: 20 }}>
                  <div className="form-field full">
                    <label className="form-label">Corretora da Operação</label>
                    <select className="fam-input" value={form.corretora_id}
                      onChange={(e) => setForm({ ...form, corretora_id: e.target.value })}>
                      <option value="">— Selecione a corretora —</option>
                      {corretoras.map((c) => (
                        <option key={c.id} value={c.id}>{c.razao_social}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* ── Seção Operação (só aparece após CNPJ verificado) ── */}
              {cnpjVerificado && (
                <>
                  <div className="section-title" style={{ marginBottom: 14 }}>
                    <span className="dot" style={{ background: '#e8b84b' }} />Operação
                  </div>
                  <div className="form-grid" style={{ marginBottom: 20 }}>
                    <div className="form-field">
                      <label className="form-label">Produto *</label>
                      <select className="fam-input" value={form.produto_id}
                        onChange={(e) => handleProdutoChange(e.target.value)} required>
                        <option value="">— Selecione —</option>
                        {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Modalidade</label>
                      <select className="fam-input" value={form.modalidade}
                        onChange={(e) => setForm({ ...form, modalidade: e.target.value })}>
                        <option value="">— Selecione ou deixe em branco —</option>
                        {modalidades.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">LMG (R$) *</label>
                      <input className="fam-input" type="text" placeholder="Ex: 1.000.000,00"
                        value={form.lmg}
                        onChange={(e) => setForm({ ...form, lmg: e.target.value })}
                        required />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Taxa (%)</label>
                      <input className="fam-input" type="text" placeholder="Ex: 1,50" value={form.taxa}
                        onChange={(e) => setForm({ ...form, taxa: e.target.value })} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Vigência (anos)</label>
                      <input className="fam-input" type="number" placeholder="Ex: 2" min={1} max={30}
                        value={form.vigencia_anos}
                        onChange={(e) => setForm({ ...form, vigencia_anos: e.target.value })} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Corretor</label>
                      <input className="fam-input" type="text" placeholder="Nome do corretor responsável"
                        value={form.corretor}
                        onChange={(e) => setForm({ ...form, corretor: e.target.value })} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Temperatura</label>
                      <select className="fam-input" value={form.temperatura}
                        onChange={(e) => setForm({ ...form, temperatura: e.target.value })}>
                        <option value="Frio">❄ Frio</option>
                        <option value="Morno">🌤 Morno</option>
                        <option value="Quente">🔥 Quente</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Prioridade</label>
                      <select className="fam-input" value={form.prioridade}
                        onChange={(e) => setForm({ ...form, prioridade: e.target.value })}>
                        <option value="Fluxo Normal">Fluxo Normal</option>
                        <option value="Prioridade">Prioridade</option>
                        <option value="Urgente">🚨 Urgente</option>
                      </select>
                    </div>
                    <div className="form-field full">
                      <label className="form-label">Observação</label>
                      <textarea className="fam-input" placeholder="Informações adicionais..."
                        value={form.observacao}
                        onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                        rows={2} style={{ resize: 'vertical' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary" onClick={() => setMostrarForm(false)}>Cancelar</button>
                    <button type="submit" className="btn-primary" disabled={enviando}>
                      {enviando ? 'Registrando...' : '✔ Registrar Triagem'}
                    </button>
                  </div>
                </>
              )}

              {!cnpjVerificado && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#6080a0', fontSize: 14 }}>
                  Informe o CNPJ do tomador e clique em <strong>Buscar</strong> para continuar.
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Tabela de operações recentes */}
      <div className="fam-table-wrap">
        <table className="fam-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Data</th>
              <th>Tomador</th>
              <th>Corretora</th>
              <th>Produto</th>
              <th>LMG</th>
              <th>Temperatura</th>
              <th>Prioridade</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>Carregando...</td></tr>
            ) : triagens.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>
                Nenhuma operação registrada ainda. Clique em <strong>+ Nova Triagem</strong> para começar.
              </td></tr>
            ) : triagens.map((t, i) => (
              <tr key={t.id}>
                <td style={{ color: '#6080a0', fontSize: 13 }}>{i + 1}</td>
                <td style={{ fontSize: 13, color: '#6080a0', whiteSpace: 'nowrap' }}>{fmtData(t.created_at)}</td>
                <td style={{ fontWeight: 600 }}>
                  {t.tomador?.razao_social ?? '—'}
                  {t.tomador?.cnpj && (
                    <div style={{ fontSize: 11, color: '#6080a0', fontWeight: 400 }}>
                      {maskCNPJ(t.tomador.cnpj)}
                    </div>
                  )}
                </td>
                <td style={{ fontSize: 13, color: '#6080a0' }}>{t.corretora?.razao_social ?? '—'}</td>
                <td style={{ fontSize: 13 }}>{t.produto?.nome ?? '—'}</td>
                <td style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {t.lmg ? fmtMoeda(t.lmg) : '—'}
                </td>
                <td>
                  {t.temperatura
                    ? <span className={`badge ${badgeTemperatura(t.temperatura)}`}>{t.temperatura}</span>
                    : <span style={{ color: '#6080a0', fontSize: 13 }}>—</span>}
                </td>
                <td>
                  {t.prioridade && t.prioridade !== 'Fluxo Normal'
                    ? <span className={`badge ${badgePrioridade(t.prioridade)}`}>{t.prioridade}</span>
                    : <span style={{ color: '#6080a0', fontSize: 13 }}>Normal</span>}
                </td>
                <td>
                  <span className={`badge ${badgeStatus(t.status)}`}>{t.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
