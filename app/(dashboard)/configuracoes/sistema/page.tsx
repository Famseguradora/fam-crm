'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useDateRange } from '@/lib/context/date-range-context'
import { fmtData } from '@/lib/utils'

/** O que `/api/agentes/backup-anexos` conta sobre o backup dos documentos. */
interface BackupEstado {
  /** Falso fora da máquina que tem a pasta da FAM, ou para quem não é o dono. */
  pode: boolean
  rodando?: boolean
  /** O fim do backup-anexos.log, só enquanto roda. */
  log?: string
  ultimo?: { nome: string; quando: string; mb: number; pasta: string; quantos: number } | null
}

interface UsuarioRow {
  id: string
  nome: string
  perfil: string
  auth_id: string
  proprietario: boolean
  ativo?: boolean
}

export default function SistemaConfig() {
  const supabase = createClient()
  const { dataInicio, setDataInicio, isFiltered } = useDateRange()

  const [proprietarioAtual, setProprietarioAtual] = useState<boolean | null>(null)
  const [authIdAtual, setAuthIdAtual] = useState<string | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [dataForm, setDataForm] = useState(dataInicio)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  /* O BACKUP DOS DOCUMENTOS (22/09/2026). `pode` vem do servidor e é falso fora
     da máquina que tem a pasta da FAM: botão que não pode agir não aparece. */
  const [backup, setBackup] = useState<BackupEstado | null>(null)

  const verBackup = useCallback(async () => {
    try {
      const r = await fetch('/api/agentes/backup-anexos')
      const j = await r.json()
      if (typeof j?.pode === 'boolean') setBackup(j)
    } catch { /* sem resposta, sem seção */ }
  }, [])

  /* A primeira pergunta vai inline, e não `verBackup()` direto no corpo do
     efeito: o lint do React 19 recusa setState síncrono ali, e a forma com
     `vivo` também evita gravar estado numa tela que já saiu. */
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/agentes/backup-anexos')
        const j = await r.json()
        if (vivo && typeof j?.pode === 'boolean') setBackup(j)
      } catch { /* sem resposta, sem seção */ }
    })()
    return () => { vivo = false }
  }, [])

  /* ENQUANTO RODA, PERGUNTA A CADA 10 s. São minutos de download, e o valor da
     tela é justamente mostrar o "300 de 574" andando. Parado, não pergunta
     nada: cada consulta é um PowerShell no servidor. */
  useEffect(() => {
    if (!backup?.rodando) return
    const t = setInterval(verBackup, 10_000)
    return () => clearInterval(t)
  }, [backup?.rodando, verBackup])

  async function fazerBackup() {
    setMsg(null)
    setBackup((b) => (b ? { ...b, rodando: true } : b))
    try {
      const r = await fetch('/api/agentes/backup-anexos', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) {
        setMsg({ tipo: 'erro', texto: j.erro ?? 'Não consegui iniciar o backup.' })
        setBackup((b) => (b ? { ...b, rodando: false } : b))
        return
      }
      setMsg({
        tipo: 'sucesso',
        texto: j.ja_rodando
          ? 'O backup já estava em andamento.'
          : 'Backup iniciado. Pode sair desta tela: ele continua rodando e o resultado aparece aqui quando terminar.',
      })
      verBackup()
    } catch {
      setMsg({ tipo: 'erro', texto: 'A conexão com o CRM caiu. Tente de novo.' })
      setBackup((b) => (b ? { ...b, rodando: false } : b))
    }
  }

  const carregarDados = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setAuthIdAtual(user.id)

    const [{ data: eu }, { data: lista }] = await Promise.all([
      supabase.from('usuarios').select('proprietario').eq('auth_id', user.id).single(),
      supabase.from('usuarios').select('id, nome, perfil, auth_id, proprietario').order('nome'),
    ])

    setProprietarioAtual(eu?.proprietario ?? false)
    setUsuarios((lista ?? []) as UsuarioRow[])
    setLoading(false)
  }, [])

  useEffect(() => { carregarDados() }, [carregarDados])
  useEffect(() => { setDataForm(dataInicio) }, [dataInicio])

  async function salvarData() {
    setSalvando(true)
    setMsg(null)
    await setDataInicio(dataForm)
    setMsg({ tipo: 'sucesso', texto: 'Data de início salva com sucesso.' })
    setSalvando(false)
    setTimeout(() => setMsg(null), 4000)
  }

  async function limparData() {
    setSalvando(true)
    setMsg(null)
    await setDataInicio('')
    setDataForm('')
    setMsg({ tipo: 'sucesso', texto: 'Filtro de data removido. Sistema exibirá todos os dados.' })
    setSalvando(false)
    setTimeout(() => setMsg(null), 4000)
  }

  async function toggleProprietario(usuario: UsuarioRow) {
    if (usuario.auth_id === authIdAtual && usuario.proprietario) return
    setTogglingId(usuario.id)
    const novo = !usuario.proprietario
    const { error } = await supabase
      .from('usuarios')
      .update({ proprietario: novo })
      .eq('id', usuario.id)
    if (!error) {
      setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, proprietario: novo } : u))
    }
    setTogglingId(null)
  }

  if (loading) {
    return (
      <div style={{ color: '#6080a0', padding: 40, fontSize: 15 }}>
        Carregando configurações…
      </div>
    )
  }

  if (!proprietarioAtual) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: 320, gap: 12,
        color: '#6080a0', fontSize: 15,
      }}>
        <span style={{ fontSize: 36 }}>🔒</span>
        <div style={{ fontWeight: 600, color: '#a0c0e8' }}>Acesso restrito</div>
        <div>Esta área é exclusiva para o proprietário do sistema.</div>
      </div>
    )
  }

  const estiloCard: React.CSSProperties = {
    background: '#0d1e3a',
    border: '1px solid #1e4080',
    borderRadius: 12,
    padding: '24px 28px',
    marginBottom: 24,
  }

  const estiloLabel: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: '#4a7ab5',
    letterSpacing: '1.2px',
    textTransform: 'uppercase',
    marginBottom: 6,
    display: 'block',
  }

  const estiloInput: React.CSSProperties = {
    background: '#071428',
    border: '1.5px solid #1e4080',
    borderRadius: 8,
    color: 'white',
    fontFamily: "'Calibri','Segoe UI',sans-serif",
    fontSize: 15,
    padding: '10px 14px',
    outline: 'none',
    width: 220,
    cursor: 'pointer',
  }

  const estiloBtnPrimario: React.CSSProperties = {
    background: 'linear-gradient(135deg,#3070c8,#1a4a90)',
    border: 'none',
    borderRadius: 8,
    color: 'white',
    fontFamily: "'Calibri','Segoe UI',sans-serif",
    fontSize: 14,
    fontWeight: 700,
    padding: '10px 20px',
    cursor: 'pointer',
  }

  const estiloBtnSecundario: React.CSSProperties = {
    background: 'transparent',
    border: '1.5px solid #1e4080',
    borderRadius: 8,
    color: '#a0c0e8',
    fontFamily: "'Calibri','Segoe UI',sans-serif",
    fontSize: 14,
    fontWeight: 600,
    padding: '9px 18px',
    cursor: 'pointer',
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'white', margin: 0 }}>
          ⚙️ Configurações do Sistema
        </h1>
        <p style={{ fontSize: 13, color: '#6080a0', marginTop: 6 }}>
          Parâmetros globais que afetam todos os usuários do CRM.
        </p>
      </div>

      {/* ══ Seção: Backup dos documentos ═══════════════════════════════════════
          Ordem dele em 22/09/2026: "insira um botão no CRM que só eu tenho
          acesso (proprietário) de fazer backup, assim eu farei o backup quando
          quiser". É manual de propósito: são 609 MB por execução, e repetir isso
          três vezes por semana encheria a pasta da FAM de cópias iguais.
          O backup do BANCO segue automático (Seg/Qua/Sex) e não passa por aqui.
          Esta seção só aparece na máquina que tem a pasta da FAM sincronizada;
          `pode` vem do servidor, e botão que não pode agir não deve existir. */}
      {backup?.pode && (
        <div style={estiloCard}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#a0c0e8', margin: '0 0 6px' }}>
            🗄️ Backup dos documentos
          </h2>
          <p style={{ fontSize: 13, color: '#6080a0', margin: '0 0 16px', lineHeight: 1.5 }}>
            {/* Sem número fixo de arquivos aqui: era "574", e número escrito na
                tela envelhece calado. Quem conta é o pacote, no aviso abaixo. */}
            Baixa todos os documentos dos tomadores e grava um pacote único na pasta de
            Infraestrutura da FAM. <strong style={{ color: '#a0c0e8' }}>O backup diário do Supabase
            não inclui documentos</strong> (só o banco), então esta é a única cópia deles.
            Leva alguns minutos e guarda as 2 versões mais recentes.
          </p>

          {backup.ultimo ? (
            <div style={{
              background: 'rgba(39,169,108,.10)', border: '1px solid rgba(39,169,108,.45)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#a0c0e8',
            }}>
              Último backup: <strong>{fmtData(backup.ultimo.quando)}</strong> · {backup.ultimo.mb} MB
              <div style={{ fontSize: 11.5, color: '#6080a0', marginTop: 4, wordBreak: 'break-all' }}>
                {backup.ultimo.pasta}\{backup.ultimo.nome}
              </div>
            </div>
          ) : (
            <div style={{
              background: 'rgba(232,184,75,.10)', border: '1px solid rgba(232,184,75,.45)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#e8b84b',
            }}>
              Nenhum backup de documentos encontrado na pasta da FAM.
            </div>
          )}

          <button
            type="button"
            onClick={fazerBackup}
            disabled={!!backup.rodando}
            style={{
              ...estiloBtnPrimario,
              background: backup.rodando ? '#0a1628' : '#1e4080',
              color: backup.rodando ? '#6080a0' : 'white',
              cursor: backup.rodando ? 'default' : 'pointer',
            }}
          >
            {backup.rodando ? 'Fazendo o backup…' : 'Fazer backup agora'}
          </button>

          {/* Enquanto roda, o fim do log: é o que diz "300 de 574" em vez de
              deixar a tela parada dizendo "aguarde". */}
          {backup.rodando && backup.log && (
            <pre style={{
              marginTop: 14, marginBottom: 0, fontSize: 12, lineHeight: 1.6, color: '#6080a0',
              background: '#071428', border: '1px solid #1e4080', borderRadius: 8,
              padding: '10px 14px', whiteSpace: 'pre-wrap', fontFamily: "'Consolas',monospace",
            }}>{backup.log}</pre>
          )}
        </div>
      )}

      {/* ── Seção: Data de Início dos Cálculos ── */}
      <div style={estiloCard}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#a0c0e8', margin: '0 0 6px' }}>
          📅 Data de Início dos Cálculos
        </h2>
        <p style={{ fontSize: 13, color: '#6080a0', margin: '0 0 20px', lineHeight: 1.5 }}>
          Define a partir de qual data de entrada na FAM o sistema deve calcular KPIs, gráficos e listas.
          Dados anteriores a essa data serão ignorados em todas as telas.
          Deixe em branco para exibir todos os dados.
        </p>

        {isFiltered && (
          <div style={{
            background: 'rgba(48,112,200,.12)',
            border: '1px solid #3070c8',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 16,
            fontSize: 13,
            color: '#a0c0e8',
          }}>
            Filtro ativo: exibindo dados a partir de <strong>{fmtData(dataInicio)}</strong>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <label style={estiloLabel}>Data de início</label>
            <input
              type="date"
              value={dataForm}
              onChange={(e) => setDataForm(e.target.value)}
              style={estiloInput}
            />
          </div>
          <button
            onClick={salvarData}
            disabled={salvando || !dataForm}
            style={{ ...estiloBtnPrimario, opacity: (salvando || !dataForm) ? 0.6 : 1 }}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
          {isFiltered && (
            <button
              onClick={limparData}
              disabled={salvando}
              style={{ ...estiloBtnSecundario, color: '#d64545', borderColor: '#d64545' }}
            >
              Remover filtro
            </button>
          )}
        </div>

        {msg && (
          <div style={{
            marginTop: 14,
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            background: msg.tipo === 'sucesso' ? 'rgba(39,169,108,.12)' : 'rgba(214,69,69,.12)',
            border: `1px solid ${msg.tipo === 'sucesso' ? '#27a96c' : '#d64545'}`,
            color: msg.tipo === 'sucesso' ? '#27a96c' : '#d64545',
          }}>
            {msg.texto}
          </div>
        )}
      </div>

      {/* ── Seção: Gestão de Proprietários ── */}
      <div style={estiloCard}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#a0c0e8', margin: '0 0 6px' }}>
          👑 Gestão de Proprietários
        </h2>
        <p style={{ fontSize: 13, color: '#6080a0', margin: '0 0 20px', lineHeight: 1.5 }}>
          Proprietários têm acesso a esta tela de configurações e podem alterar parâmetros globais.
          Você não pode remover seu próprio acesso.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {usuarios.map((u) => {
            const euMesmo = u.auth_id === authIdAtual
            const toggling = togglingId === u.id
            return (
              <div key={u.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#071428',
                borderRadius: 8,
                border: '1px solid #1a3560',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
                    {u.nome}
                    {euMesmo && (
                      <span style={{ fontSize: 11, color: '#e8b84b', marginLeft: 8, fontWeight: 700 }}>
                        (você)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#4a7ab5', marginTop: 2 }}>
                    {u.perfil}
                  </div>
                </div>

                <button
                  onClick={() => toggleProprietario(u)}
                  disabled={toggling || (euMesmo && u.proprietario)}
                  title={euMesmo && u.proprietario ? 'Você não pode remover seu próprio acesso' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 16px',
                    borderRadius: 7,
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: "'Calibri','Segoe UI',sans-serif",
                    cursor: (toggling || (euMesmo && u.proprietario)) ? 'not-allowed' : 'pointer',
                    opacity: toggling ? 0.6 : 1,
                    transition: 'all .15s',
                    background: u.proprietario
                      ? 'rgba(232,184,75,.15)'
                      : 'rgba(48,112,200,.1)',
                    color: u.proprietario ? '#e8b84b' : '#6090b8',
                  }}
                >
                  <span style={{ fontSize: 15 }}>{u.proprietario ? '👑' : '○'}</span>
                  {toggling ? 'Atualizando…' : u.proprietario ? 'Proprietário' : 'Conceder acesso'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
