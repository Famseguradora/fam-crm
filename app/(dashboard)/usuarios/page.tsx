'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { maskTelefone, badgeClassPerfil, badgeClassStatus, fmtData, titleCase } from '@/lib/utils'
import type { Usuario } from '@/types'

interface FormData {
  nome: string
  email: string
  senha: string
  telefone: string
  cargo: string
  perfil: 'admin' | 'usuario'
  status: 'ativo' | 'inativo'
  comite: boolean
}

const FORM_INICIAL: FormData = {
  nome: '', email: '', senha: '', telefone: '', cargo: '',
  perfil: 'usuario', status: 'ativo', comite: false,
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
  const [souProprietario, setSouProprietario] = useState(false)
  const [togglingAvisoId, setTogglingAvisoId] = useState<string | null>(null)

  // Supabase só é criado dentro de funções (evita SSR durante build)
  const carregarUsuarios = useCallback(async () => {
    setCarregando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data }, euRes] = await Promise.all([
      supabase.from('usuarios').select('*').order('nome'),
      user
        ? supabase.from('usuarios').select('proprietario').eq('auth_id', user.id).single()
        : Promise.resolve({ data: null }),
    ])
    setUsuarios(data ?? [])
    setSouProprietario(euRes.data?.proprietario ?? false)
    setCarregando(false)
  }, [])

  // Liga/desliga o direito de publicar avisos. Só o proprietário enxerga e usa.
  async function toggleAvisos(u: Usuario) {
    if (!souProprietario) return
    setTogglingAvisoId(u.id)
    const supabase = createClient()
    const novo = !u.pode_publicar_avisos
    const { error } = await supabase.from('usuarios').update({ pode_publicar_avisos: novo }).eq('id', u.id)
    if (!error) {
      setUsuarios(prev => prev.map(x => x.id === u.id ? { ...x, pode_publicar_avisos: novo } : x))
    }
    setTogglingAvisoId(null)
  }

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
      senha: '',
      telefone: u.telefone ?? '',
      cargo: u.cargo ?? '',
      perfil: u.perfil,
      status: u.status,
      comite: u.comite ?? false,
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
            comite: form.comite,
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
            senha: form.senha,
            telefone: form.telefone || null,
            cargo: form.cargo || null,
            perfil: form.perfil,
            status: form.status,
          }),
        })
        const resultado = await resp.json()
        if (!resp.ok) throw new Error(resultado.erro ?? 'Erro ao criar usuário.')
        setMensagem({ tipo: 'sucesso', texto: 'Usuário criado com sucesso! No primeiro acesso ele será solicitado a criar uma senha definitiva.' })
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

  // Liga/desliga a participação no Comitê (diretor votante do Julgamento).
  // Persiste no mesmo padrão dos demais toggles — no sandbox vai p/ o Excel.
  const [togglingComiteId, setTogglingComiteId] = useState<string | null>(null)
  async function toggleComite(u: Usuario) {
    setTogglingComiteId(u.id)
    const supabase = createClient()
    const novo = !u.comite
    const { error } = await supabase.from('usuarios').update({ comite: novo }).eq('id', u.id)
    if (!error) {
      setUsuarios(prev => prev.map(x => x.id === u.id ? { ...x, comite: novo } : x))
    }
    setTogglingComiteId(null)
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
        <div className="modal-overlay">
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

                {!editando && (
                  <div className="form-field">
                    <label className="form-label">Senha Temporária *</label>
                    <input
                      className="fam-input"
                      type="text"
                      placeholder="Mínimo 8 caracteres"
                      value={form.senha}
                      onChange={(e) => setForm({ ...form, senha: e.target.value })}
                      required={!editando}
                      minLength={8}
                    />
                  </div>
                )}

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

                {/* Comitê — diretor votante do "Julgamento" das operações */}
                <div className="form-field full">
                  <label
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                      background: form.comite ? '#f3ecff' : '#f8fafc',
                      border: `1.5px solid ${form.comite ? '#a855f7' : '#c5d5e8'}`,
                      borderRadius: 8, padding: '12px 14px',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.comite}
                      onChange={(e) => setForm({ ...form, comite: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: '#a855f7', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 13, color: '#1a2a3a', lineHeight: 1.4 }}>
                      <strong>🏛 Membro do Comitê</strong> — pode votar no Julgamento das operações
                      {form.comite && (
                        <span style={{ display: 'block', fontSize: 12, color: '#7a5aa0', marginTop: 2 }}>
                          Com telefone cadastrado, recebe o convite de votação no WhatsApp.
                        </span>
                      )}
                    </span>
                  </label>
                </div>

                {!editando && (
                  <div className="form-field full">
                    <div style={{
                      background: '#f0f6ff', border: '1px solid #c5d5e8',
                      borderRadius: 8, padding: '10px 14px',
                      fontSize: 13, color: '#3060a0', lineHeight: 1.5,
                    }}>
                      🔑 Informe ao usuário a senha temporária. No primeiro login ele será obrigado a criar uma senha definitiva.
                    </div>
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
              <th>Comitê</th>
              {souProprietario && <th>Avisos</th>}
              <th>Cadastrado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={souProprietario ? 10 : 9} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>
                  Carregando usuários...
                </td>
              </tr>
            ) : usuariosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={souProprietario ? 10 : 9} style={{ textAlign: 'center', padding: 40, color: '#6080a0' }}>
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
                  <td>
                    <button
                      onClick={() => toggleComite(u)}
                      disabled={togglingComiteId === u.id}
                      title={u.comite ? 'Membro do Comitê — clique para remover' : 'Não vota no Comitê — clique para conceder'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif",
                        background: u.comite ? '#f3ecff' : '#eef2f7',
                        color: u.comite ? '#7a3ad0' : '#6080a0',
                        opacity: togglingComiteId === u.id ? 0.6 : 1,
                      }}
                    >
                      <span>{u.comite ? '🏛' : '○'}</span>
                      {togglingComiteId === u.id ? '...' : u.comite ? 'Vota' : 'Não'}
                    </button>
                  </td>
                  {souProprietario && (
                    <td>
                      <button
                        onClick={() => toggleAvisos(u)}
                        disabled={togglingAvisoId === u.id}
                        title={u.pode_publicar_avisos ? 'Pode publicar avisos — clique para revogar' : 'Sem permissão — clique para conceder'}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif",
                          background: u.pode_publicar_avisos ? '#fdf6e6' : '#eef2f7',
                          color: u.pode_publicar_avisos ? '#a07810' : '#6080a0',
                          opacity: togglingAvisoId === u.id ? 0.6 : 1,
                        }}
                      >
                        <span>{u.pode_publicar_avisos ? '🔔' : '○'}</span>
                        {togglingAvisoId === u.id ? '...' : u.pode_publicar_avisos ? 'Pode' : 'Não'}
                      </button>
                    </td>
                  )}
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
