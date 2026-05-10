'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { maskTelefone, badgeClassPerfil, badgeClassStatus, fmtData, titleCase } from '@/lib/utils'
import type { Usuario } from '@/types'

interface FormData {
  nome: string
  email: string
  telefone: string
  cargo: string
  perfil: 'admin' | 'usuario'
  status: 'ativo' | 'inativo'
  senha: string
}

const FORM_INICIAL: FormData = {
  nome: '', email: '', telefone: '', cargo: '',
  perfil: 'usuario', status: 'ativo', senha: '',
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [form, setForm] = useState<FormData>(FORM_INICIAL)
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [busca, setBusca] = useState('')

  // Supabase só é criado dentro de funções (evita SSR durante build)
  const carregarUsuarios = useCallback(async () => {
    setCarregando(true)
    const supabase = createClient()
    const { data } = await supabase.from('usuarios').select('*').order('nome')
    setUsuarios(data ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregarUsuarios() }, [carregarUsuarios])

  function abrirNovo() {
    setEditando(null)
    setForm(FORM_INICIAL)
    setMensagem(null)
    setMostrarForm(true)
  }

  function abrirEditar(u: Usuario) {
    setEditando(u)
    setForm({
      nome: u.nome,
      email: u.email,
      telefone: u.telefone ?? '',
      cargo: u.cargo ?? '',
      perfil: u.perfil,
      status: u.status,
      senha: '',
    })
    setMensagem(null)
    setMostrarForm(true)
  }

  function fecharForm() {
    setMostrarForm(false)
    setEditando(null)
    setForm(FORM_INICIAL)
    setMensagem(null)
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setEnviando(true)
    setMensagem(null)

    try {
      if (editando) {
        const supabase = createClient()
        const { error } = await supabase
          .from('usuarios')
          .update({
            nome: titleCase(form.nome),
            telefone: form.telefone || null,
            cargo: form.cargo || null,
            perfil: form.perfil,
            status: form.status,
          })
          .eq('id', editando.id)

        if (error) throw error
        setMensagem({ tipo: 'sucesso', texto: 'Usuário atualizado com sucesso.' })
      } else {
        const resp = await fetch('/api/usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: titleCase(form.nome),
            email: form.email.toLowerCase(),
            telefone: form.telefone || null,
            cargo: form.cargo || null,
            perfil: form.perfil,
            status: form.status,
            senha: form.senha,
          }),
        })
        const resultado = await resp.json()
        if (!resp.ok) throw new Error(resultado.erro ?? 'Erro ao criar usuário.')
        setMensagem({ tipo: 'sucesso', texto: 'Usuário cadastrado! O acesso já está disponível com a senha informada.' })
        setForm(FORM_INICIAL)
      }
      await carregarUsuarios()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ocorreu um erro. Tente novamente.'
      setMensagem({ tipo: 'erro', texto: msg })
    } finally {
      setEnviando(false)
    }
  }

  async function toggleStatus(u: Usuario) {
    const supabase = createClient()
    const novoStatus = u.status === 'ativo' ? 'inativo' : 'ativo'
    await supabase.from('usuarios').update({ status: novoStatus }).eq('id', u.id)
    await carregarUsuarios()
  }

  const usuariosFiltrados = usuarios.filter((u) =>
    u.nome.toLowerCase().includes(busca.toLowerCase()) ||
    u.email.toLowerCase().includes(busca.toLowerCase()) ||
    (u.cargo ?? '').toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <>
      {/* ── Cabeçalho da página ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#102040' }}>Usuários do Sistema</div>
          <div style={{ fontSize: 13, color: '#6080a0' }}>
            Gerencie os acessos ao CRM da FAM Seguradora
          </div>
        </div>
        <button className="btn-primary" onClick={abrirNovo}>
          + Novo Usuário
        </button>
      </div>

      {/* ── Modal Cadastro / Edição ── */}
      {mostrarForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && fecharForm()}>
          <div className="modal-box">
            <div className="modal-header">
              <div className="modal-title">
                {editando ? '✏️ Editar Usuário' : '+ Novo Usuário'}
              </div>
              <button
                onClick={fecharForm}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}
              >✕</button>
            </div>

            {mensagem && (
              <div className={mensagem.tipo === 'sucesso' ? 'alert-success' : 'alert-error'}
                style={{ marginBottom: 16 }}>
                {mensagem.texto}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-grid">

                <div className="form-field">
                  <label className="form-label">Nome Completo *</label>
                  <input
                    className="fam-input"
                    type="text"
                    placeholder="Nome do usuário"
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    required
                  />
                </div>

                <div className="form-field">
                  <label className="form-label">E-mail *</label>
                  <input
                    className="fam-input"
                    type="email"
                    placeholder="email@famsegs.com.br"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value.toLowerCase() })}
                    required
                    disabled={!!editando}
                    style={editando ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                  />
                  {editando && (
                    <span style={{ fontSize: 11, color: '#6080a0' }}>E-mail não pode ser alterado</span>
                  )}
                </div>

                <div className="form-field">
                  <label className="form-label">Telefone</label>
                  <input
                    className="fam-input"
                    type="text"
                    placeholder="(11) 9.0000-0000"
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: maskTelefone(e.target.value) })}
                    maxLength={16}
                  />
                </div>

                <div className="form-field">
                  <label className="form-label">Cargo</label>
                  <input
                    className="fam-input"
                    type="text"
                    placeholder="Ex: Analista de Subscrição"
                    value={form.cargo}
                    onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                  />
                </div>

                <div className="form-field">
                  <label className="form-label">Perfil *</label>
                  <select
                    className="fam-input"
                    value={form.perfil}
                    onChange={(e) => setForm({ ...form, perfil: e.target.value as 'admin' | 'usuario' })}
                    required
                  >
                    <option value="usuario">Usuário</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

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

                {!editando && (
                  <div className="form-field full">
                    <label className="form-label">Senha Temporária *</label>
                    <input
                      className="fam-input"
                      type="password"
                      placeholder="Mínimo 6 caracteres — o usuário deverá alterá-la no primeiro acesso"
                      value={form.senha}
                      onChange={(e) => setForm({ ...form, senha: e.target.value })}
                      required={!editando}
                      minLength={6}
                    />
                    <span style={{ fontSize: 11, color: '#6080a0', marginTop: 3 }}>
                      Comunique esta senha ao usuário. Ele será obrigado a criar uma nova senha ao fazer login pela primeira vez.
                    </span>
                  </div>
                )}

              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={fecharForm}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={enviando}>
                  {enviando ? 'Salvando...' : editando ? 'Salvar Alterações' : 'Cadastrar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Barra de busca ── */}
      <div style={{
        background: 'white', padding: '14px 18px', borderRadius: 10,
        marginBottom: 20, border: '1px solid #c5d5e8',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6080a0', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>
          Buscar
        </div>
        <input
          className="fam-input"
          type="text"
          placeholder="Nome, e-mail ou cargo..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        {busca && (
          <button className="btn-clear" onClick={() => setBusca('')}>Limpar</button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#6080a0' }}>
          {usuariosFiltrados.length} usuário{usuariosFiltrados.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Tabela ── */}
      <div className="fam-table-wrap">
        <table className="fam-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Cargo</th>
              <th>Perfil</th>
              <th>Status</th>
              <th>Cadastrado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>
                  Carregando usuários...
                </td>
              </tr>
            ) : usuariosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>
                  {busca ? 'Nenhum usuário encontrado para esta busca.' : 'Nenhum usuário cadastrado ainda.'}
                </td>
              </tr>
            ) : (
              usuariosFiltrados.map((u, i) => (
                <tr key={u.id}>
                  <td style={{ color: '#6080a0', fontSize: 13 }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{u.nome}</td>
                  <td style={{ fontSize: 13 }}>{u.email}</td>
                  <td style={{ fontSize: 13, color: '#6080a0' }}>{u.cargo || '—'}</td>
                  <td>
                    <span className={`badge ${badgeClassPerfil(u.perfil)}`}>
                      {u.perfil === 'admin' ? 'ADMIN' : 'USUÁRIO'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${badgeClassStatus(u.status)}`}>
                      {u.status === 'ativo' ? 'ATIVO' : 'INATIVO'}
                    </span>
                  </td>
                  <td style={{ fontSize: 13, color: '#6080a0' }}>{fmtData(u.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => abrirEditar(u)}
                        style={{
                          padding: '5px 12px', borderRadius: 6, border: '1.5px solid #c5d5e8',
                          background: 'white', color: '#1e4080', cursor: 'pointer',
                          fontSize: 12, fontWeight: 600,
                          fontFamily: "'Calibri','Segoe UI',sans-serif",
                        }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleStatus(u)}
                        style={{
                          padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          fontSize: 12, fontWeight: 600,
                          fontFamily: "'Calibri','Segoe UI',sans-serif",
                          background: u.status === 'ativo' ? '#fdf3e6' : '#e6f9f0',
                          color: u.status === 'ativo' ? '#a05010' : '#1a7a50',
                        }}
                      >
                        {u.status === 'ativo' ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
