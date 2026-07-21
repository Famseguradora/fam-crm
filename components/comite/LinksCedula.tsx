'use client'
// ============================================================================
//  LinksCédula — painel de envio da votação por link (dentro da Deliberação).
//
//  Fluxo operacional real da Subscrição:
//    1) copia a mensagem do LINK GERAL e manda UMA vez na lista de transmissão
//       (todo diretor recebe no privado, sem grupo);
//    2) opcionalmente avisa no grupo que a cédula foi enviada;
//    3) acompanha aqui quem abriu e quem já votou.
//  O link pessoal por diretor fica disponível para reenvio individual.
//
//  Medida temporária até a API oficial do WhatsApp permitir votar no próprio
//  chat — por isso o texto é o MESMO `montarConvite` que a Z-API já usa.
// ============================================================================
import { useState, useEffect, useCallback } from 'react'

interface Pessoal {
  conviteId: string
  usuarioId: string
  nome: string
  cargo: string | null
  telefone: string | null
  whatsapp: string | null
  url: string
  mensagem: string
  status: 'pendente' | 'enviado' | 'aberto' | 'votado'
  aberturas: number
}

interface Resposta {
  ok: boolean
  geral: { conviteId: string; url: string; mensagem: string; expiraEm: string } | null
  pessoais: Pessoal[]
}

const STATUS_META: Record<Pessoal['status'], { cor: string; label: string }> = {
  pendente: { cor: '#8da3c4', label: '⚪ Não enviado' },
  enviado: { cor: '#60a5fa', label: '🔵 Enviado' },
  aberto: { cor: '#e8b84b', label: '🟡 Abriu' },
  votado: { cor: '#22c55e', label: '🟢 Votou' },
}

const T = {
  texto: '#e8eef9', textoFraco: '#8da3c4', borda: '#27375a',
  card: 'linear-gradient(160deg,#15243f 0%,#0f1a30 100%)', inputBg: '#0e1830',
}

async function copiar(txt: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(txt)
    return true
  } catch {
    // Fallback para contextos sem clipboard API (http, WebView antiga).
    try {
      const ta = document.createElement('textarea')
      ta.value = txt
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export default function LinksCedula({ operacaoId }: { operacaoId: string }) {
  const [aberto, setAberto] = useState(false)
  const [dados, setDados] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState<string | null>(null)

  const sandbox = process.env.NEXT_PUBLIC_SANDBOX === 'true'

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = await fetch(`/api/comite/links?operacaoId=${operacaoId}`)
      const j = await r.json()
      if (!r.ok || !j.ok) { setErro(j.erro ?? 'Não consegui gerar os links.'); return }
      setDados(j)
    } catch {
      setErro('Falha de conexão ao gerar os links.')
    } finally {
      setCarregando(false)
    }
  }, [operacaoId])

  useEffect(() => { if (aberto && !dados && !sandbox) carregar() }, [aberto, dados, sandbox, carregar])

  function flash(id: string) {
    setCopiado(id)
    setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1800)
  }

  async function marcarEnviado(conviteId: string) {
    await fetch('/api/comite/links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conviteId, acao: 'marcar_enviado' }),
    })
  }

  if (!aberto) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
        <button
          onClick={() => setAberto(true)}
          style={{
            cursor: 'pointer', background: 'rgba(232,184,75,0.10)', color: '#f0c869',
            border: '1px solid rgba(232,184,75,0.45)', borderRadius: 10,
            padding: '10px 18px', fontWeight: 700, fontSize: 13,
          }}
        >
          🗳️ Enviar cédula de votação
        </button>
      </div>
    )
  }

  return (
    <div style={{
      marginTop: 14, background: T.card, border: `1px solid ${T.borda}`,
      borderRadius: 14, padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f0c869' }}>
          🗳️ Cédula de Votação
        </div>
        <button
          onClick={() => setAberto(false)}
          style={{ background: 'none', border: 'none', color: T.textoFraco, cursor: 'pointer', fontSize: 18 }}
        >
          ✕
        </button>
      </div>

      {sandbox ? (
        <div style={{ fontSize: 13, color: T.textoFraco, lineHeight: 1.6, padding: '10px 0' }}>
          A cédula usa o banco real e o Storage — não funciona no sandbox.
          Teste em <strong style={{ color: T.texto }}>npm run dev</strong> ou em produção.
        </div>
      ) : carregando ? (
        <div style={{ color: T.textoFraco, fontSize: 13, padding: '14px 0', textAlign: 'center' }}>
          Gerando links…
        </div>
      ) : erro ? (
        <div style={{ color: '#ef4444', fontSize: 13, padding: '10px 0' }}>{erro}</div>
      ) : dados ? (
        <>
          {/* ── Lista de transmissão: o caminho principal ── */}
          {dados.geral && (
            <div style={{
              background: 'rgba(37,211,102,0.07)', border: '1px solid rgba(37,211,102,0.35)',
              borderRadius: 12, padding: 14, marginBottom: 14,
            }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#4ade80', marginBottom: 5 }}>
                📢 Lista de transmissão — envio único
              </div>
              <div style={{ fontSize: 12, color: T.textoFraco, lineHeight: 1.6, marginBottom: 11 }}>
                Copie e envie <strong style={{ color: T.texto }}>uma vez</strong> na sua lista de
                transmissão do Comitê. Cada diretor recebe no privado e se identifica ao abrir
                (nome + 4 últimos dígitos do celular cadastrado).
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={async () => {
                    if (await copiar(dados.geral!.mensagem)) {
                      flash('geral')
                      await marcarEnviado(dados.geral!.conviteId)
                    }
                  }}
                  style={{
                    cursor: 'pointer', background: '#25d366', color: '#0a1628', border: 'none',
                    borderRadius: 9, padding: '10px 16px', fontWeight: 800, fontSize: 13,
                  }}
                >
                  {copiado === 'geral' ? '✓ Copiado!' : '📋 Copiar mensagem completa'}
                </button>
                <button
                  onClick={async () => { if (await copiar(dados.geral!.url)) flash('urlgeral') }}
                  style={{
                    cursor: 'pointer', background: 'transparent', color: T.texto,
                    border: `1px solid ${T.borda}`, borderRadius: 9, padding: '10px 14px',
                    fontWeight: 600, fontSize: 12.5,
                  }}
                >
                  {copiado === 'urlgeral' ? '✓ Copiado!' : '🔗 Só o link'}
                </button>
              </div>
            </div>
          )}

          {/* ── Acompanhamento por diretor ── */}
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.textoFraco, marginBottom: 9 }}>
            Acompanhamento · link individual
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {dados.pessoais.map((p) => {
              const s = STATUS_META[p.status]
              return (
                <div
                  key={p.conviteId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    background: T.inputBg, border: `1px solid ${T.borda}`,
                    borderRadius: 10, padding: '10px 12px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: T.texto }}>{p.nome}</div>
                    <div style={{ fontSize: 11, color: T.textoFraco }}>
                      {p.cargo ?? 'Membro do Comitê'}
                      {!p.telefone && ' · ⚠ sem telefone cadastrado'}
                    </div>
                  </div>

                  <div style={{ fontSize: 11.5, fontWeight: 700, color: s.cor, whiteSpace: 'nowrap' }}>
                    {s.label}
                  </div>

                  {/* Copiar a mensagem completa preserva os emojis (a área de
                      transferência é UTF-8); é o caminho recomendado. */}
                  <button
                    onClick={async () => { if (await copiar(p.mensagem)) { flash(`${p.conviteId}:msg`); marcarEnviado(p.conviteId) } }}
                    style={{
                      cursor: 'pointer', background: '#25d366', color: '#0a1628', border: 'none',
                      borderRadius: 8, padding: '6px 11px', fontWeight: 800, fontSize: 11.5, whiteSpace: 'nowrap',
                    }}
                  >
                    {copiado === `${p.conviteId}:msg` ? '✓ Copiado!' : '📋 Copiar'}
                  </button>

                  {p.whatsapp && (
                    <a
                      href={`https://wa.me/${p.whatsapp}?text=${encodeURIComponent(p.mensagem)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => marcarEnviado(p.conviteId)}
                      title="Abre o WhatsApp com a mensagem. Em alguns aparelhos os emojis podem chegar quebrados — se acontecer, use 📋 Copiar e cole no chat."
                      style={{
                        background: 'rgba(37,211,102,0.12)', color: '#4ade80',
                        border: '1px solid rgba(37,211,102,0.4)', borderRadius: 8,
                        padding: '6px 11px', fontWeight: 700, fontSize: 11.5,
                        textDecoration: 'none', whiteSpace: 'nowrap',
                      }}
                    >
                      📲 Abrir chat
                    </a>
                  )}

                  <button
                    onClick={async () => { if (await copiar(p.url)) flash(`${p.conviteId}:link`) }}
                    style={{
                      cursor: 'pointer', background: 'transparent', color: T.textoFraco,
                      border: `1px solid ${T.borda}`, borderRadius: 8, padding: '6px 11px',
                      fontWeight: 600, fontSize: 11.5, whiteSpace: 'nowrap',
                    }}
                  >
                    {copiado === `${p.conviteId}:link` ? '✓' : '🔗 Link'}
                  </button>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 12, fontSize: 11, color: T.textoFraco, lineHeight: 1.6, textAlign: 'center' }}>
            Os links expiram em 14 dias e param de aceitar voto assim que a bancada fecha o veredito.
          </div>
        </>
      ) : null}
    </div>
  )
}
