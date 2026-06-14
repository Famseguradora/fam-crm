'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Aviso, TipoAviso } from '@/types'

interface UsuarioAtual {
  authId: string
  nome: string | null
  email: string | null
  proprietario: boolean
  podePublicar: boolean
}

interface FormData {
  mensagem: string
  tipo: TipoAviso
  duracaoValor: number
  duracaoUnidade: 'horas' | 'dias'
}

const FORM_INICIAL: FormData = {
  mensagem: '',
  tipo: 'info',
  duracaoValor: 1,
  duracaoUnidade: 'dias',
}

const TIPO_LABEL: Record<TipoAviso, string> = {
  parabens: '🎉 Parabéns',
  info: '📢 Informativo',
  alerta: '⚠️ Alerta',
}

const TIPO_COR: Record<TipoAviso, string> = {
  parabens: '#27a96c',
  info: '#e8b84b',
  alerta: '#e0533a',
}

// Mostra data + hora da expiração (timestamptz). Local pt-BR.
function fmtDataHora(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function AvisosPage() {
  const [usuario, setUsuario] = useState<UsuarioAtual | null>(null)
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState<Aviso | null>(null)
  const [form, setForm] = useState<FormData>(FORM_INICIAL)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [confirmExcluir, setConfirmExcluir] = useState<Aviso | null>(null)
  const [processando, setProcessando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: eu }, { data: lista }] = await Promise.all([
      supabase.from('usuarios').select('nome, email, proprietario, pode_publicar_avisos').eq('auth_id', user.id).single(),
      supabase.from('avisos').select('*').order('criado_em', { ascending: false }),
    ])

    setUsuario({
      authId: user.id,
      nome: eu?.nome ?? null,
      email: eu?.email ?? null,
      proprietario: eu?.proprietario ?? false,
      podePublicar: eu?.pode_publicar_avisos ?? false,
    })
    setAvisos((lista ?? []) as Aviso[])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Pode editar/apagar/ligar-desligar ESTE aviso: só o autor ou o proprietário.
  function podeGerenciar(a: Aviso): boolean {
    if (!usuario) return false
    return a.criado_por_auth_id === usuario.authId || usuario.proprietario
  }

  function abrirNovo() {
    setEditando(null)
    setForm(FORM_INICIAL)
    setMsg(null)
    setMostrarForm(true)
  }

  function abrirEditar(a: Aviso) {
    setEditando(a)
    setForm({ mensagem: a.mensagem, tipo: a.tipo, duracaoValor: 1, duracaoUnidade: 'dias' })
    setMsg(null)
    setMostrarForm(true)
  }

  function fecharForm() {
    setMostrarForm(false)
    setEditando(null)
    setForm(FORM_INICIAL)
    setMsg(null)
  }

  function calcularExpira(valor: number, unidade: 'horas' | 'dias'): string {
    const ms = unidade === 'horas' ? valor * 3_600_000 : valor * 86_400_000
    return new Date(Date.now() + ms).toISOString()
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (form.duracaoValor < 1) {
      setMsg({ tipo: 'erro', texto: 'A duração deve ser de pelo menos 1.' })
      return
    }
    setEnviando(true)
    setMsg(null)
    const supabase = createClient()
    // Decisão do proprietário: editar reinicia o prazo a partir de agora.
    const expira_em = calcularExpira(form.duracaoValor, form.duracaoUnidade)

    try {
      if (editando) {
        const payload = {
          mensagem: form.mensagem.trim(),
          tipo: form.tipo,
          expira_em,
          atualizado_em: new Date().toISOString(),
        }
        const { error } = await supabase.from('avisos').update(payload).eq('id', editando.id)
        if (error) throw new Error(error.message)
        await supabase.from('audit_log').insert({
          tabela: 'avisos',
          acao: 'alteracao',
          registro_id: editando.id,
          dados_antes: editando as unknown as Record<string, unknown>,
          dados_depois: payload,
          usuario_auth_id: usuario?.authId ?? null,
          usuario_nome: usuario?.nome ?? null,
          usuario_email: usuario?.email ?? null,
        })
        setMsg({ tipo: 'sucesso', texto: 'Aviso atualizado. O prazo foi recontado a partir de agora.' })
      } else {
        const payload = {
          mensagem: form.mensagem.trim(),
          tipo: form.tipo,
          ativo: true,
          expira_em,
          criado_por_auth_id: usuario?.authId ?? null,
          criado_por_nome: usuario?.nome ?? null,
        }
        const { data: novo, error } = await supabase.from('avisos').insert(payload).select('id').single()
        if (error) throw new Error(error.message)
        await supabase.from('audit_log').insert({
          tabela: 'avisos',
          acao: 'criacao',
          registro_id: novo?.id ?? null,
          dados_antes: null,
          dados_depois: payload,
          usuario_auth_id: usuario?.authId ?? null,
          usuario_nome: usuario?.nome ?? null,
          usuario_email: usuario?.email ?? null,
        })
        setMsg({ tipo: 'sucesso', texto: 'Aviso publicado! Ele já vai passar no banner do topo.' })
      }
      fecharForm()
      await carregar()
    } catch (err: unknown) {
      const texto = err instanceof Error ? err.message : 'Erro ao salvar o aviso.'
      setMsg({ tipo: 'erro', texto })
    } finally {
      setEnviando(false)
    }
  }

  async function toggleAtivo(a: Aviso) {
    if (!podeGerenciar(a)) return
    setProcessando(true)
    const supabase = createClient()
    const novo = !a.ativo
    const { error } = await supabase
      .from('avisos')
      .update({ ativo: novo, atualizado_em: new Date().toISOString() })
      .eq('id', a.id)
    if (!error) {
      await supabase.from('audit_log').insert({
        tabela: 'avisos',
        acao: 'alteracao',
        registro_id: a.id,
        dados_antes: { ativo: a.ativo } as Record<string, unknown>,
        dados_depois: { ativo: novo } as Record<string, unknown>,
        usuario_auth_id: usuario?.authId ?? null,
        usuario_nome: usuario?.nome ?? null,
        usuario_email: usuario?.email ?? null,
      })
      setAvisos(prev => prev.map(x => x.id === a.id ? { ...x, ativo: novo } : x))
    }
    setProcessando(false)
  }

  async function excluir() {
    if (!confirmExcluir || !podeGerenciar(confirmExcluir)) { setConfirmExcluir(null); return }
    setProcessando(true)
    const supabase = createClient()
    const alvo = confirmExcluir
    const { error } = await supabase.from('avisos').delete().eq('id', alvo.id)
    if (!error) {
      await supabase.from('audit_log').insert({
        tabela: 'avisos',
        acao: 'exclusao',
        registro_id: alvo.id,
        dados_antes: alvo as unknown as Record<string, unknown>,
        dados_depois: null,
        usuario_auth_id: usuario?.authId ?? null,
        usuario_nome: usuario?.nome ?? null,
        usuario_email: usuario?.email ?? null,
      })
      setAvisos(prev => prev.filter(x => x.id !== alvo.id))
    }
    setConfirmExcluir(null)
    setProcessando(false)
  }

  // ── Estilos (espelham configuracoes/sistema) ──
  const estiloCard: React.CSSProperties = {
    background: '#0d1e3a', border: '1px solid #1e4080', borderRadius: 12,
    padding: '24px 28px', marginBottom: 24,
  }
  const estiloLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#4a7ab5', letterSpacing: '1.2px',
    textTransform: 'uppercase', marginBottom: 6, display: 'block',
  }
  const estiloInput: React.CSSProperties = {
    background: '#071428', border: '1.5px solid #1e4080', borderRadius: 8, color: 'white',
    fontFamily: "'Calibri','Segoe UI',sans-serif", fontSize: 15, padding: '10px 14px',
    outline: 'none', width: '100%',
  }
  const estiloBtnPrimario: React.CSSProperties = {
    background: 'linear-gradient(135deg,#3070c8,#1a4a90)', border: 'none', borderRadius: 8,
    color: 'white', fontFamily: "'Calibri','Segoe UI',sans-serif", fontSize: 14, fontWeight: 700,
    padding: '10px 20px', cursor: 'pointer',
  }
  const estiloBtnSecundario: React.CSSProperties = {
    background: 'transparent', border: '1.5px solid #1e4080', borderRadius: 8, color: '#a0c0e8',
    fontFamily: "'Calibri','Segoe UI',sans-serif", fontSize: 14, fontWeight: 600,
    padding: '9px 18px', cursor: 'pointer',
  }

  if (loading) {
    return <div style={{ color: '#6080a0', padding: 40, fontSize: 15 }}>Carregando avisos…</div>
  }

  const temAcesso = usuario && (usuario.podePublicar || usuario.proprietario)
  if (!temAcesso) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: 320, gap: 12, color: '#6080a0', fontSize: 15,
      }}>
        <span style={{ fontSize: 36 }}>🔒</span>
        <div style={{ fontWeight: 600, color: '#a0c0e8' }}>Acesso restrito</div>
        <div>Você não tem permissão para publicar avisos. Fale com o proprietário do sistema.</div>
      </div>
    )
  }

  const agora = Date.now()

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#102040', margin: 0 }}>📢 Central de Avisos</h1>
          <p style={{ fontSize: 13, color: '#6080a0', marginTop: 6, lineHeight: 1.5 }}>
            Publique mensagens que passam, com destaque dourado, no banner do topo do sistema.
            Você pode editar ou apagar apenas os avisos que você mesmo criou{usuario?.proprietario ? ' (como proprietário, você gerencia todos)' : ''}.
          </p>
        </div>
        <button style={estiloBtnPrimario} onClick={abrirNovo}>+ Novo Aviso</button>
      </div>

      {/* ── Formulário (criar/editar) ── */}
      {mostrarForm && (
        <div style={estiloCard}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#a0c0e8', margin: '0 0 18px' }}>
            {editando ? '✏️ Editar Aviso' : '+ Novo Aviso'}
          </h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={estiloLabel}>Mensagem *</label>
              <textarea
                value={form.mensagem}
                onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
                required
                maxLength={280}
                rows={2}
                placeholder="Ex.: Parabéns ao time comercial pela meta batida em junho!"
                style={{ ...estiloInput, resize: 'vertical', fontFamily: "'Calibri','Segoe UI',sans-serif" }}
              />
              <span style={{ fontSize: 11, color: '#4a7ab5' }}>{form.mensagem.length}/280</span>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
              <div style={{ flex: '1 1 180px' }}>
                <label style={estiloLabel}>Tipo *</label>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoAviso })}
                  style={{ ...estiloInput, cursor: 'pointer' }}
                >
                  <option value="parabens">🎉 Parabéns</option>
                  <option value="info">📢 Informativo</option>
                  <option value="alerta">⚠️ Alerta</option>
                </select>
              </div>
              <div style={{ flex: '0 0 120px' }}>
                <label style={estiloLabel}>Passar por *</label>
                <input
                  type="number"
                  min={1}
                  value={form.duracaoValor}
                  onChange={(e) => setForm({ ...form, duracaoValor: parseInt(e.target.value, 10) || 0 })}
                  required
                  style={{ ...estiloInput, cursor: 'text' }}
                />
              </div>
              <div style={{ flex: '0 0 140px' }}>
                <label style={estiloLabel}>Unidade *</label>
                <select
                  value={form.duracaoUnidade}
                  onChange={(e) => setForm({ ...form, duracaoUnidade: e.target.value as 'horas' | 'dias' })}
                  style={{ ...estiloInput, cursor: 'pointer' }}
                >
                  <option value="horas">Horas</option>
                  <option value="dias">Dias</option>
                </select>
              </div>
            </div>

            <div style={{
              background: 'rgba(48,112,200,.1)', border: '1px solid #1e4080', borderRadius: 8,
              padding: '8px 14px', marginBottom: 18, fontSize: 12.5, color: '#a0c0e8',
            }}>
              ⏱️ Vai expirar (sumir do banner) em{' '}
              <strong>{fmtDataHora(calcularExpira(form.duracaoValor || 0, form.duracaoUnidade))}</strong>
            </div>

            {msg && (
              <div style={{
                marginBottom: 14, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: msg.tipo === 'sucesso' ? 'rgba(39,169,108,.12)' : 'rgba(214,69,69,.12)',
                border: `1px solid ${msg.tipo === 'sucesso' ? '#27a96c' : '#d64545'}`,
                color: msg.tipo === 'sucesso' ? '#27a96c' : '#d64545',
              }}>
                {msg.texto}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" style={estiloBtnSecundario} onClick={fecharForm}>Cancelar</button>
              <button type="submit" style={{ ...estiloBtnPrimario, opacity: enviando ? 0.6 : 1 }} disabled={enviando}>
                {enviando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Publicar aviso'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mensagem de sucesso fora do form */}
      {msg && !mostrarForm && (
        <div style={{
          marginBottom: 20, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: msg.tipo === 'sucesso' ? 'rgba(39,169,108,.12)' : 'rgba(214,69,69,.12)',
          border: `1px solid ${msg.tipo === 'sucesso' ? '#27a96c' : '#d64545'}`,
          color: msg.tipo === 'sucesso' ? '#27a96c' : '#d64545',
        }}>
          {msg.texto}
        </div>
      )}

      {/* ── Lista de avisos ── */}
      <div style={estiloCard}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#a0c0e8', margin: '0 0 18px' }}>
          Avisos cadastrados ({avisos.length})
        </h2>

        {avisos.length === 0 ? (
          <div style={{ color: '#6080a0', fontSize: 14, padding: '20px 0' }}>
            Nenhum aviso cadastrado ainda. Clique em “+ Novo Aviso” para publicar o primeiro.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {avisos.map((a) => {
              const expirado = new Date(a.expira_em).getTime() <= agora
              const gerencia = podeGerenciar(a)
              return (
                <div key={a.id} style={{
                  background: '#071428', borderRadius: 10, border: '1px solid #1a3560',
                  padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 360px', minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, color: 'white', fontWeight: 600, lineHeight: 1.4 }}>
                        {a.mensagem}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                          color: TIPO_COR[a.tipo], background: `${TIPO_COR[a.tipo]}1e`,
                          border: `1px solid ${TIPO_COR[a.tipo]}55`,
                        }}>
                          {TIPO_LABEL[a.tipo]}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                          color: a.ativo ? '#27a96c' : '#6080a0', background: a.ativo ? 'rgba(39,169,108,.12)' : 'rgba(96,128,160,.12)',
                          border: `1px solid ${a.ativo ? '#27a96c55' : '#6080a055'}`,
                        }}>
                          {a.ativo ? 'ATIVO' : 'DESLIGADO'}
                        </span>
                        {expirado && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                            color: '#e0533a', background: 'rgba(224,83,58,.12)', border: '1px solid #e0533a55',
                          }}>
                            EXPIRADO
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: '#6080a0' }}>
                          {expirado ? 'Expirou' : 'Expira'} em {fmtDataHora(a.expira_em)}
                        </span>
                        {a.criado_por_nome && (
                          <span style={{ fontSize: 12, color: '#4a7ab5' }}>
                            · por {a.criado_por_nome}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexShrink: 0 }}>
                      {gerencia ? (
                        <>
                          <button
                            onClick={() => abrirEditar(a)}
                            style={{
                              padding: '6px 12px', borderRadius: 7, border: '1.5px solid #1e4080',
                              background: 'transparent', color: '#a0c0e8', cursor: 'pointer',
                              fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif",
                            }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => toggleAtivo(a)}
                            disabled={processando}
                            style={{
                              padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                              fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif",
                              background: a.ativo ? 'rgba(232,184,75,.15)' : 'rgba(39,169,108,.15)',
                              color: a.ativo ? '#e8b84b' : '#27a96c', opacity: processando ? 0.6 : 1,
                            }}
                          >
                            {a.ativo ? 'Desligar' : 'Ligar'}
                          </button>
                          <button
                            onClick={() => setConfirmExcluir(a)}
                            style={{
                              padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                              fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif",
                              background: 'rgba(214,69,69,.15)', color: '#e0533a',
                            }}
                          >
                            Excluir
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: '#4a6080', fontStyle: 'italic', padding: '6px 4px' }}>
                          só o autor edita
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Confirmação de exclusão ── */}
      {confirmExcluir && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#102040', marginBottom: 10 }}>
              Excluir aviso?
            </div>
            <div style={{ fontSize: 14, color: '#40607f', marginBottom: 20, lineHeight: 1.5 }}>
              “{confirmExcluir.mensagem}” será removido em definitivo. Esta ação não pode ser desfeita.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setConfirmExcluir(null)} disabled={processando}>
                Cancelar
              </button>
              <button
                onClick={excluir}
                disabled={processando}
                style={{
                  padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: 700, fontFamily: "'Calibri','Segoe UI',sans-serif",
                  background: '#d64545', color: 'white', opacity: processando ? 0.6 : 1,
                }}
              >
                {processando ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
