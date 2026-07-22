'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { maskCNPJ, maskTelefone, maskCEP, titleCase, validarCNPJ } from '@/lib/utils'
import type { Corretora } from '@/types'
import AnexosSection from '@/components/AnexosSection'
import PainelGerencial from '@/components/corretoras/PainelGerencial'
import CorretoraDetalhe from '@/components/corretoras/CorretoraDetalhe'

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
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState<Corretora | null>(null)
  const [form, setForm] = useState<FormData>(FORM_INICIAL)
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erroCnpj, setErroCnpj] = useState('')
  const [modoEdicao, setModoEdicao] = useState(false) // campos travados até clicar "Editar"

  const carregarCorretoras = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase.from('corretoras').select('*').order('razao_social')
    if (error) console.error('corretoras:', error.message)
    setCorretoras(data ?? [])
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
    setModoEdicao(true) // nova corretora já entra em modo de edição
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
    setModoEdicao(false) // abre em modo leitura (só edita ao clicar "Editar")
    setMostrarForm(true)
  }

  // Abre a tela da corretora a partir do id (clique no Ranking / gráficos do painel).
  function abrirCorretoraPorId(id: string) {
    const c = corretoras.find((x) => x.id === id)
    if (c) abrirEditar(c)
  }

  function fecharForm() {
    setMostrarForm(false)
    setEditando(null)
    setForm(FORM_INICIAL)
    setMensagem(null)
    setErroCnpj('')
    setModoEdicao(false)
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

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Painel Gerencial (tabela única + análises) ── */}
      <PainelGerencial onAbrirCorretora={abrirCorretoraPorId} onNovaCorretora={abrirNovo} />

      {/* ── Modal: tela da corretora (esquerda = cadastro · direita = números & cadeia) ── */}
      {mostrarForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={editando ? { maxWidth: '98vw', width: '98vw', height: '95vh', display: 'flex', flexDirection: 'column' } : { maxWidth: 720, width: '96%' }}>
            <div className="modal-header">
              <div className="modal-title">{editando ? `🏢 ${editando.nome_fantasia || editando.razao_social}` : '+ Nova Corretora'}</div>
              <button onClick={fecharForm} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: editando ? 'repeat(auto-fit, minmax(360px, 1fr))' : '1fr', gap: 20, alignItems: 'start', ...(editando ? { flex: 1, overflow: 'auto', minHeight: 0 } : {}) }}>
              {/* ── ESQUERDA: cadastro (como hoje) ── */}
              <div style={{ minWidth: 0 }}>
                {mensagem && (
                  <div className={mensagem.tipo === 'sucesso' ? 'alert-success' : 'alert-error'} style={{ marginBottom: 16 }}>
                    {mensagem.texto}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <fieldset disabled={!modoEdicao} style={{ border: 'none', padding: 0, margin: 0, minInlineSize: 'auto' }}>
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
                        <option value="">Selecione a UF</option>
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

                  </fieldset>

                  <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {editando ? (
                      <>
                        {/* Botões SEPARADOS: Editar só desbloqueia; Salvar só salva (fica travado até Editar). */}
                        <button type="button" className="btn-secondary" onClick={fecharForm}>Fechar</button>
                        <button type="button" className="btn-secondary" onClick={() => setModoEdicao(true)} disabled={modoEdicao}>
                          ✏️ Editar
                        </button>
                        <button type="submit" className="btn-primary" disabled={!modoEdicao || enviando}>
                          {enviando ? 'Salvando...' : '💾 Salvar Alterações'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn-secondary" onClick={fecharForm}>Cancelar</button>
                        <button type="submit" className="btn-primary" disabled={enviando}>
                          {enviando ? 'Salvando...' : 'Cadastrar Corretora'}
                        </button>
                      </>
                    )}
                  </div>
                </form>

                {editando && (
                  <>
                    <hr style={{ border: 'none', borderTop: '1.5px solid #e0ecf8', margin: '20px 0' }} />
                    <AnexosSection entidadeTipo="corretora" entidadeId={editando.id} />
                  </>
                )}
              </div>

              {/* ── DIREITA: números & cadeia da corretora ── */}
              {editando && (
                <div style={{ minWidth: 0, background: '#fafcff', border: '1px solid #e0ecf8', borderRadius: 12, padding: 16 }}>
                  <CorretoraDetalhe corretora={editando} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
