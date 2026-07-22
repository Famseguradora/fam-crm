'use client'
// ============================================================================
//  Cédula de Votação — ilha interativa.
//
//  Traz para o celular do diretor as MESMAS quatro abas do card de Comitê do
//  CRM: 📐 Cálculo, 📊 Resultado, ⚡ Dados e ⚖️ Deliberação. Tudo chega por
//  props já formatado pelo servidor (o diretor não tem sessão no CRM, então
//  nada pode ser buscado do browser); as duas únicas escritas — voto e
//  comentário — vão para /api/voto, que revalida TUDO.
// ============================================================================
import { useState } from 'react'
import { VOTO_META, VOTOS_ORDENADOS, type PlacarComite } from '@/lib/comite/votacao'
import { calcularCenario } from '@/lib/comite/calculo'
import { fmtMoeda, fmtPercent } from '@/lib/utils'
import type { VotoComite } from '@/types'
import type { DossieCedula, ComentarioExibido, CampoExibido, BlocoMeta } from '@/lib/comite/cedula-dados'

interface MembroBancada {
  id: string
  nome: string
  cargo: string | null
  ddd: string
  temTelefone: boolean
  jaVotou: boolean
}

interface DocInfo { id: string; nome: string; bytes: number | null }

interface Props {
  token: string
  escopo: 'operacao' | 'pessoal'
  diretorId: string | null
  diretorNome: string | null
  bancada: MembroBancada[]
  // null enquanto o diretor não se identificou (link geral). O dossiê chega
  // pela resposta de /api/voto na ação 'identificar' — nunca no HTML inicial.
  dossie: DossieCedula | null
  comentariosIniciais: ComentarioExibido[]
  operacao: {
    tomador: string
    modalidade: string
    lmg: string
    premio: string
    taxa: string
    prazo: string
    parecer: string | null
    subscritor: string | null
    votoSubscricao: VotoComite | null
  }
  docs: { subscricao: DocInfo | null; credito: DocInfo | null }
  placarInicial: PlacarComite
  votoExistente: { voto: VotoComite; argumentacao: string; segueSubscritor: boolean } | null
}

type Aba = 'calculo' | 'resultado' | 'dados' | 'deliberacao'

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'calculo', rotulo: '📐 Cálculo' },
  { id: 'resultado', rotulo: '📊 Resultado' },
  { id: 'dados', rotulo: '⚡ Dados' },
  { id: 'deliberacao', rotulo: '⚖️ Deliberação' },
]

const DESCRICAO: Record<VotoComite, string> = {
  aprovado: 'Aprovo a operação nos termos apresentados',
  aprovado_ressalva: 'Aprovo, mas com condições a observar',
  reprovado: 'Não aprovo a operação',
}

function fmtBytes(b: number | null): string {
  if (!b) return ''
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome
}

// Reabrir/retratar precisa restaurar "Acompanho o Subscritor" como tal, não o
// voto já resolvido — senão a retratação perde essa informação de auditoria.
// Mesma regra de PainelJulgamento.tsx.
function opcaoInicial(v: Props['votoExistente']): VotoComite | 'segue' | '' {
  if (!v) return ''
  return v.segueSubscritor ? 'segue' : v.voto
}

export default function Cedula(props: Props) {
  const { token, escopo, bancada } = props

  // Dossiê, dados da operação e documentos podem chegar depois (identificação).
  const [dossie, setDossie] = useState(props.dossie)
  const [operacao, setOperacao] = useState(props.operacao)
  const [docs, setDocs] = useState(props.docs)

  // Link pessoal já vem identificado; link geral (lista de transmissão) exige
  // que o diretor se identifique antes de ver a cédula.
  const [quemId, setQuemId] = useState<string | null>(props.diretorId)
  const [selecionado, setSelecionado] = useState<string | null>(props.diretorId)
  const [pin, setPin] = useState('')
  const [identificando, setIdentificando] = useState(false)

  const [aba, setAba] = useState<Aba>('deliberacao')
  const [opcao, setOpcao] = useState<VotoComite | 'segue' | ''>(opcaoInicial(props.votoExistente))
  const [texto, setTexto] = useState(props.votoExistente?.argumentacao ?? '')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [placar, setPlacar] = useState(props.placarInicial)
  const [confirmado, setConfirmado] = useState<VotoComite | null>(null)
  const [parecerFinal, setParecerFinal] = useState<string | null>(null)
  const [jaVotouAntes, setJaVotouAntes] = useState(!!props.votoExistente)
  const [retratando, setRetratando] = useState(false)

  const [comentarios, setComentarios] = useState(props.comentariosIniciais)
  const [novoComentario, setNovoComentario] = useState('')
  const [comentando, setComentando] = useState(false)

  const quem = bancada.find((m) => m.id === quemId) ?? null

  async function chamar(body: Record<string, unknown>) {
    const r = await fetch('/api/voto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...body }),
    })
    return { r, j: await r.json() }
  }

  // ── Identificação (só no link geral) ──────────────────────────────────────
  async function identificar() {
    if (!selecionado || pin.length !== 4) return
    setIdentificando(true)
    setErro('')
    try {
      const { r, j } = await chamar({ acao: 'identificar', usuarioId: selecionado, digitos: pin })
      if (!r.ok || !j.ok) { setErro(j.erro ?? 'Não consegui confirmar sua identidade.'); return }
      // O dossiê chega SÓ agora, com a identidade provada no servidor.
      if (j.dossie) setDossie(j.dossie)
      if (j.operacao) setOperacao(j.operacao)
      if (j.docs) setDocs(j.docs)
      if (j.comentarios) setComentarios(j.comentarios)
      setQuemId(selecionado)
      if (j.votoExistente) {
        setOpcao(opcaoInicial(j.votoExistente))
        setTexto(j.votoExistente.argumentacao ?? '')
        setJaVotouAntes(true)
      }
    } catch {
      setErro('Falha de conexão. Verifique sua internet e tente de novo.')
    } finally {
      setIdentificando(false)
    }
  }

  // ── Voto ──────────────────────────────────────────────────────────────────
  async function votar() {
    if (!opcao || !quemId) return
    setEnviando(true)
    setErro('')
    try {
      const { r, j } = await chamar({
        acao: 'votar',
        usuarioId: quemId,
        digitos: pin || undefined,
        opcao,
        argumentacao: texto.trim() || null,
      })
      if (!r.ok || !j.ok) { setErro(j.erro ?? 'Não consegui registrar seu voto.'); return }
      setPlacar(j.placar)
      setConfirmado(j.voto)
      setParecerFinal(j.parecerFinal ?? null)
    } catch {
      setErro('Falha de conexão. Seu voto NÃO foi registrado. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  // ── Comentário (independente do voto) ────────────────────────────────────
  async function comentar() {
    const txt = novoComentario.trim()
    if (!txt || !quemId) return
    setComentando(true)
    setErro('')
    try {
      const { r, j } = await chamar({
        acao: 'comentar',
        usuarioId: quemId,
        digitos: pin || undefined,
        comentario: txt,
      })
      if (!r.ok || !j.ok) { setErro(j.erro ?? 'Não consegui publicar seu comentário.'); return }
      setComentarios((atual) => [...atual, j.comentario])
      setNovoComentario('')
    } catch {
      setErro('Falha de conexão. O comentário não foi publicado.')
    } finally {
      setComentando(false)
    }
  }

  // ── Tela: voto confirmado ────────────────────────────────────────────────
  if (confirmado) {
    const m = VOTO_META[confirmado]
    return (
      <div className="voto-wrap">
        <Brasao />
        <div className="voto-card">
          <div className="voto-card-topo" />
          <div className="voto-card-corpo">
            <div className="voto-selo">
              <div
                className="voto-selo-circulo"
                style={{ ['--cor' as string]: m.cor, ['--bg' as string]: m.bg }}
              >
                {m.emoji}
              </div>
              <div className="voto-selo-titulo">Voto proferido</div>
              <p className="voto-selo-sub">
                {quem ? <>Registrado em nome de <strong>{quem.nome}</strong>.<br /></> : null}
                Seu voto: <strong style={{ color: m.cor }}>{m.label}</strong>
              </p>
            </div>

            <div style={{ marginTop: 22 }}>
              <div className="voto-secao-titulo">Placar da bancada</div>
              <Placar placar={placar} />
            </div>

            {parecerFinal && (
              <div
                className="voto-aviso voto-aviso-info"
                style={{ marginTop: 18, marginBottom: 0, textAlign: 'center', fontSize: 14.5 }}
              >
                🏛️ A bancada concluiu o julgamento.<br />
                Parecer final: <strong>{parecerFinal}</strong>
              </div>
            )}

            <button
              className="voto-btn-fantasma"
              style={{ marginTop: 16 }}
              onClick={() => { setConfirmado(null); setJaVotouAntes(true); setRetratando(false); setAba('deliberacao') }}
            >
              ← Voltar ao dossiê
            </button>
          </div>
        </div>
        <Rodape nome={quem?.nome ?? null} />
      </div>
    )
  }

  // ── Tela: identificação (link da lista de transmissão) ───────────────────
  if (!quem) {
    const alvo = bancada.find((m) => m.id === selecionado)
    return (
      <div className="voto-wrap">
        <Brasao />

        <div className="voto-card voto-d1">
          <div className="voto-card-topo" />
          <div className="voto-card-corpo">
            <div className="voto-secao-titulo">Operação em julgamento</div>
            <div className="voto-tomador">{operacao.tomador}</div>
            <div className="voto-modalidade">{operacao.modalidade}</div>
          </div>
        </div>

        <div className="voto-card voto-d2">
          <div className="voto-card-topo" />
          <div className="voto-card-corpo">
            <div className="voto-secao-titulo">Identifique-se</div>
            <p style={{ fontSize: 13.5, color: '#4a5a6e', marginTop: -6, marginBottom: 15, lineHeight: 1.55 }}>
              Toque no seu nome e confirme os <strong>4 últimos dígitos</strong> do celular
              cadastrado na FAM.
            </p>

            <div className="voto-membros">
              {bancada.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="voto-membro"
                  data-sel={selecionado === m.id}
                  data-votou={m.jaVotou}
                  onClick={() => { setSelecionado(m.id); setErro('') }}
                >
                  <div className="voto-avatar">{iniciais(m.nome)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="voto-membro-nome">{m.nome}</div>
                    <div className="voto-membro-cargo">
                      {m.cargo ?? 'Membro do Comitê'}
                      {m.jaVotou ? ' · já votou' : ''}
                    </div>
                  </div>
                  {selecionado === m.id && <span style={{ color: '#1e4080', fontSize: 18 }}>✓</span>}
                </button>
              ))}
            </div>

            {selecionado && (
              <div style={{ marginTop: 18 }}>
                <label
                  htmlFor="pin"
                  style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4a5a6e', marginBottom: 8 }}
                >
                  4 últimos dígitos do celular de {primeiroNome(alvo?.nome ?? '')}
                  {alvo?.ddd ? ` (DDD ${alvo.ddd})` : ''}
                </label>
                <input
                  id="pin"
                  className="voto-pin"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setErro('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && pin.length === 4) identificar() }}
                />
              </div>
            )}

            {erro && <div className="voto-aviso voto-aviso-erro" style={{ marginTop: 14, marginBottom: 0 }}>{erro}</div>}

            <button
              className="voto-btn-principal"
              style={{ marginTop: 16 }}
              disabled={!selecionado || pin.length !== 4 || identificando}
              onClick={identificar}
            >
              {identificando ? 'Confirmando…' : 'Acessar minha cédula'}
            </button>
          </div>
        </div>

        <Rodape nome={null} />
      </div>
    )
  }

  // ── Cédula completa (4 abas) ─────────────────────────────────────────────
  return (
    <div className="voto-wrap">
      <Brasao />

      {/* Cabeçalho fixo com a operação — some de vista nenhuma aba */}
      <div className="voto-card voto-d1">
        <div className="voto-card-topo" />
        <div className="voto-card-corpo" style={{ paddingBottom: 16 }}>
          <div className="voto-secao-titulo">Operação em julgamento</div>
          <div className="voto-tomador">{operacao.tomador}</div>
          <div className="voto-modalidade">{operacao.modalidade}</div>
          <div className="voto-kpis">
            <div className="voto-kpi">
              <div className="voto-kpi-rot">LMG</div>
              <div className="voto-kpi-val">{operacao.lmg}</div>
            </div>
            <div className="voto-kpi">
              <div className="voto-kpi-rot">Prêmio</div>
              <div className="voto-kpi-val">{operacao.premio}</div>
            </div>
            <div className="voto-kpi">
              <div className="voto-kpi-rot">Taxa</div>
              <div className="voto-kpi-val">{operacao.taxa}</div>
            </div>
            <div className="voto-kpi">
              <div className="voto-kpi-rot">Prazo</div>
              <div className="voto-kpi-val">{operacao.prazo}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="voto-abas" role="tablist">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            className="voto-aba"
            data-at={aba === a.id}
            onClick={() => setAba(a.id)}
          >
            {a.rotulo}
            {a.id === 'deliberacao' && comentarios.length > 0 && (
              <span className="voto-aba-badge">{comentarios.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* dossie só é null antes da identificação, e aí a cédula nem renderiza. */}
      {aba === 'calculo' && dossie && <AbaCalculo dossie={dossie} />}
      {aba === 'resultado' && dossie && <AbaResultado dossie={dossie} />}
      {aba === 'dados' && dossie && <AbaDados dossie={dossie} />}

      {aba === 'deliberacao' && (
        <>
          {/* Documentos */}
          <div className="voto-card">
            <div className="voto-card-topo" />
            <div className="voto-card-corpo">
              <div className="voto-secao-titulo">Documentos da operação</div>
              <div className="voto-docs">
                <Doc token={token} doc={docs.subscricao} titulo="Análise de Subscrição" emoji="🖋️" cor="#7a3fa0" bg="#f4ebfb" />
                <Doc token={token} doc={docs.credito} titulo="Análise de Crédito" emoji="📊" cor="#1e4080" bg="#e8f0fc" />
              </div>
            </div>
          </div>

          {/* Parecer da subscrição */}
          {operacao.parecer && (
            <div className="voto-card">
              <div className="voto-card-topo" />
              <div className="voto-card-corpo">
                <div className="voto-secao-titulo">Parecer da Subscrição</div>
                <div className="voto-parecer">
                  {operacao.parecer}
                  {(operacao.subscritor || operacao.votoSubscricao) && (
                    <div className="voto-parecer-autor">
                      por {operacao.subscritor ?? 'Subscrição'}
                      {operacao.votoSubscricao && (
                        <>
                          {' · '}
                          <strong style={{ color: VOTO_META[operacao.votoSubscricao].cor }}>
                            {VOTO_META[operacao.votoSubscricao].emoji} {VOTO_META[operacao.votoSubscricao].label}
                          </strong>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* A bancada */}
          <div className="voto-card">
            <div className="voto-card-topo" />
            <div className="voto-card-corpo">
              <div className="voto-secao-titulo">A bancada</div>
              <div className="voto-membros">
                {bancada.map((m) => (
                  <div key={m.id} className="voto-membro" style={{ cursor: 'default' }}>
                    <div className="voto-avatar">{iniciais(m.nome)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="voto-membro-nome">
                        {m.nome}{m.id === quem.id ? ' (você)' : ''}
                      </div>
                      <div className="voto-membro-cargo">{m.cargo ?? 'Membro do Comitê'}</div>
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: m.jaVotou ? '#1a6a40' : '#9aa6b4', whiteSpace: 'nowrap' }}>
                      {m.jaVotou ? '✓ votou' : '⏳ aguarda'}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>
                <Placar placar={placar} />
              </div>
            </div>
          </div>

          {/* Cédula de voto */}
          <div className="voto-card">
            <div className="voto-card-topo" />
            <div className="voto-card-corpo">
              <div className="voto-secao-titulo">Seu voto</div>
              {jaVotouAntes && !retratando ? (
                <VotoJaRegistrado
                  opcao={opcao}
                  texto={texto}
                  onRetratar={() => setRetratando(true)}
                />
              ) : (
                <>
                  <p style={{ fontSize: 13.5, color: '#4a5a6e', marginTop: -6, marginBottom: 14 }}>
                    Votando como <strong>{quem.nome}</strong>{quem.cargo ? ` · ${quem.cargo}` : ''}
                  </p>

                  <div className="voto-opcoes">
                    {VOTOS_ORDENADOS.map((v) => {
                      const meta = VOTO_META[v]
                      return (
                        <button
                          key={v}
                          type="button"
                          className="voto-opcao"
                          data-sel={opcao === v}
                          style={{ ['--cor' as string]: meta.cor, ['--bg' as string]: meta.bg }}
                          onClick={() => setOpcao(v)}
                        >
                          <span className="voto-opcao-emoji">{meta.emoji}</span>
                          <span className="voto-opcao-txt">
                            <span className="voto-opcao-label">{meta.label}</span>
                            <span className="voto-opcao-desc">{DESCRICAO[v]}</span>
                          </span>
                          <span className="voto-opcao-check">{opcao === v ? '✓' : ''}</span>
                        </button>
                      )
                    })}

                    {operacao.votoSubscricao && (
                      <button
                        type="button"
                        className="voto-opcao"
                        data-sel={opcao === 'segue'}
                        style={{ ['--cor' as string]: '#1e4080', ['--bg' as string]: '#e8f0fc' }}
                        onClick={() => setOpcao('segue')}
                      >
                        <span className="voto-opcao-emoji">🤝</span>
                        <span className="voto-opcao-txt">
                          <span className="voto-opcao-label">Acompanho o Subscritor</span>
                          <span className="voto-opcao-desc">
                            Adoto o voto da Subscrição ({VOTO_META[operacao.votoSubscricao].label})
                          </span>
                        </span>
                        <span className="voto-opcao-check">{opcao === 'segue' ? '✓' : ''}</span>
                      </button>
                    )}
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <label htmlFor="arg" style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4a5a6e', marginBottom: 7 }}>
                      Fundamentação do voto <span style={{ fontWeight: 400, color: '#8a95a5' }}>(opcional)</span>
                    </label>
                    <textarea
                      id="arg"
                      className="voto-textarea"
                      placeholder="Registre aqui as condições, ressalvas ou observações do seu voto…"
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      maxLength={2000}
                    />
                  </div>

                  {erro && <div className="voto-aviso voto-aviso-erro" style={{ marginTop: 14, marginBottom: 0 }}>{erro}</div>}

                  <button
                    className="voto-btn-principal"
                    style={{ marginTop: 16 }}
                    disabled={!opcao || enviando}
                    onClick={votar}
                  >
                    {enviando ? 'Registrando…' : '⚖️ Proferir meu voto'}
                  </button>

                  {retratando && (
                    <button
                      className="voto-btn-fantasma"
                      style={{ marginTop: 10 }}
                      onClick={() => {
                        setRetratando(false)
                        setOpcao(opcaoInicial(props.votoExistente))
                        setTexto(props.votoExistente?.argumentacao ?? '')
                      }}
                    >
                      Cancelar
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Comentários da bancada — debate, separado do voto */}
          <div className="voto-card">
            <div className="voto-card-topo" />
            <div className="voto-card-corpo">
              <div className="voto-secao-titulo">
                Comentários da bancada{comentarios.length > 0 ? ` (${comentarios.length})` : ''}
              </div>

              {comentarios.length === 0 ? (
                <div className="voto-coment-vazio">
                  Nenhum comentário ainda.<br />Seja o primeiro a se manifestar.
                </div>
              ) : (
                comentarios.map((c) => (
                  <div key={c.id} className="voto-coment" data-meu={c.ehMeu}>
                    <div className="voto-coment-cab">
                      <span>
                        <span className="voto-coment-autor">{c.autor}</span>
                        {c.cargo && <span className="voto-coment-cargo"> · {c.cargo}</span>}
                      </span>
                      <span className="voto-coment-quando">{c.quando}</span>
                    </div>
                    <div className="voto-coment-txt">{c.comentario}</div>
                  </div>
                ))
              )}

              <div style={{ marginTop: 14 }}>
                <textarea
                  className="voto-textarea"
                  placeholder="Escreva um comentário para os demais diretores…"
                  value={novoComentario}
                  onChange={(e) => setNovoComentario(e.target.value)}
                  maxLength={2000}
                />
                <button
                  className="voto-btn-fantasma"
                  style={{ marginTop: 10 }}
                  disabled={!novoComentario.trim() || comentando}
                  onClick={comentar}
                >
                  {comentando ? 'Publicando…' : '💬 Publicar comentário'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <Rodape nome={quem.nome} escopo={escopo} />
    </div>
  )
}

// ── Aba: 📐 Cálculo ────────────────────────────────────────────────────────
// Aceita "0,84" e "0.84", e preserva estados intermediários ("0," / "0.") que
// um `type=number` controlado destruiria — com value numérico + `|| 0`, digitar
// o separador reportava "" e o React reescrevia o campo como "0", fazendo
// 0,84 virar 84 (prêmio 100× maior).
function paraNumero(txt: string): number {
  const n = parseFloat(txt.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function AbaCalculo({ dossie }: { dossie: DossieCedula }) {
  const c = dossie.calculo
  // Estado em TEXTO: o que o diretor digitou fica intacto enquanto ele digita.
  const [taxaTxt, setTaxaTxt] = useState(String(c.taxaNum).replace('.', ','))
  const [comissaoTxt, setComissaoTxt] = useState(String(c.comissaoPadrao).replace('.', ','))

  const taxa = paraNumero(taxaTxt)
  const comissao = paraNumero(comissaoTxt)
  const alterado = Math.abs(taxa - c.taxaNum) > 1e-9 || Math.abs(comissao - c.comissaoPadrao) > 1e-9
  const cen = calcularCenario({ lmg: c.lmgNum, taxa, anos: c.anosNum, comissaoPct: comissao })

  return (
    <>
      <div className="voto-card">
        <div className="voto-card-topo" />
        <div className="voto-card-corpo">
          <div className="voto-demo">
            <div className="voto-demo-titulo">Demonstração do cálculo</div>
            <div className="voto-demo-linha"><span>LMG</span><strong>{c.lmg}</strong></div>
            <div className="voto-demo-linha"><span>Taxa</span><strong>{c.taxa}</strong></div>
            <div className="voto-demo-linha"><span>Vigência</span><strong>{c.vigencia}</strong></div>
            <div className="voto-demo-linha voto-demo-total">
              <span>Prêmio Previsto</span><strong>{c.premioPrevisto}</strong>
            </div>
            <div className="voto-demo-rodape">
              <div>Corretora: {c.corretora}</div>
              <div>Estado: {c.estado} · Entrada: {c.dataEntrada}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="voto-card">
        <div className="voto-card-topo" />
        <div className="voto-card-corpo">
          <div className="voto-secao-titulo">Simulação de cenário</div>

          {c.lmgNum <= 0 ? (
            <div className="voto-meta-vazio">LMG não informado, não há o que simular.</div>
          ) : (
            <>
              {alterado && (
                <div className="voto-sim-aviso">
                  ⚡ Simulando. Os números abaixo não alteram a operação.
                </div>
              )}

              <div className="voto-sim-inputs">
                <div className="voto-sim-campo">
                  <label htmlFor="sim-taxa">Taxa (%)</label>
                  <input
                    id="sim-taxa"
                    className="voto-sim-input"
                    data-alterado={Math.abs(taxa - c.taxaNum) > 1e-9}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={taxaTxt}
                    onChange={(e) => setTaxaTxt(e.target.value.replace(/[^\d.,]/g, ''))}
                  />
                </div>
                <div className="voto-sim-campo">
                  <label htmlFor="sim-com">Comissão (%)</label>
                  <input
                    id="sim-com"
                    className="voto-sim-input"
                    data-alterado={Math.abs(comissao - c.comissaoPadrao) > 1e-9}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={comissaoTxt}
                    onChange={(e) => setComissaoTxt(e.target.value.replace(/[^\d.,]/g, ''))}
                  />
                </div>
              </div>

              <div className="voto-sim-linha"><span>Prêmio</span><strong>{fmtMoeda(cen.premio)}</strong></div>
              <div className="voto-sim-linha"><span>Comissão ({comissao}%)</span><strong>{fmtMoeda(cen.comissao)}</strong></div>
              <div className="voto-sim-linha voto-sim-destaque"><span>Líquido FAM</span><strong>{fmtMoeda(cen.liquidoFAM)}</strong></div>
              <div className="voto-sim-linha"><span>Taxa líquida</span><strong>{fmtPercent(cen.taxaLiquida / 100)}</strong></div>

              {alterado && (
                <button
                  className="voto-btn-reset"
                  onClick={() => {
                    setTaxaTxt(String(c.taxaNum).replace('.', ','))
                    setComissaoTxt(String(c.comissaoPadrao).replace('.', ','))
                  }}
                >
                  ↺ Voltar aos valores da operação
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Aba: 📊 Resultado ──────────────────────────────────────────────────────
function AbaResultado({ dossie }: { dossie: DossieCedula }) {
  return (
    <>
      <CardMeta bloco={dossie.metaMensal} />
      <CardMeta bloco={dossie.metaAnual} />
    </>
  )
}

function CardMeta({ bloco }: { bloco: BlocoMeta }) {
  const corPct = bloco.pctAtual >= 80 ? '#1a6a40' : bloco.pctAtual >= 50 ? '#9a5a10' : '#a02020'
  return (
    <div className="voto-card">
      <div className="voto-card-topo" />
      <div className="voto-card-corpo">
        <div className="voto-secao-titulo">{bloco.titulo}</div>

        {!bloco.temMeta ? (
          <div className="voto-meta-vazio">Meta não definida para o período.</div>
        ) : (
          <>
            <div className="voto-meta-linha"><span>Meta</span><strong>{bloco.meta}</strong></div>
            <div className="voto-meta-linha">
              <span>Realizado</span>
              <span>
                <strong>{bloco.realizado}</strong>{' '}
                <span className="voto-meta-chip" style={{ color: corPct, background: `${corPct}18` }}>
                  {bloco.pctAtual.toFixed(1).replace('.', ',')}%
                </span>
              </span>
            </div>
            <div className="voto-meta-barra">
              <span
                className="voto-meta-fill"
                style={{ width: `${Math.min(100, bloco.pctAtual)}%`, background: corPct }}
              />
            </div>

            <div className="voto-meta-impacto">
              <div className="voto-meta-impacto-rot">Se esta operação for aprovada</div>
              <div className="voto-meta-impacto-val">{bloco.novoPatamar}</div>
              <div style={{ fontSize: 12.5, color: '#1a6a40', marginTop: 3, fontWeight: 600 }}>
                {bloco.pctNovo.toFixed(1).replace('.', ',')}% da meta
                {' · '}+{bloco.contribuicao} ({bloco.pctOperacao.toFixed(1).replace('.', ',')}%)
              </div>
              <div className="voto-meta-barra" style={{ marginBottom: 0, marginTop: 9 }}>
                <span
                  className="voto-meta-fill voto-meta-fill-novo"
                  style={{ width: `${Math.min(100, bloco.pctNovo)}%` }}
                />
              </div>
            </div>

            {bloco.temGap && (
              <div style={{ marginTop: 12, fontSize: 13, color: '#4a5a6e', lineHeight: 1.6 }}>
                Faltariam <strong style={{ color: '#a02020' }}>{bloco.gap}</strong> para fechar a meta
                {bloco.opsParaFechar > 0 && (
                  <>, cerca de <strong>{bloco.opsParaFechar}</strong> operação(ões) no ticket médio de {bloco.ticketMedio}.</>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Aba: ⚡ Dados ──────────────────────────────────────────────────────────
function AbaDados({ dossie }: { dossie: DossieCedula }) {
  const d = dossie.dados
  const org = d.organograma
  return (
    <div className="voto-card">
      <div className="voto-card-topo" />
      <div className="voto-card-corpo">
        <div className="voto-secao-titulo">Dossiê da operação</div>

        <Bloco titulo="Dados da Operação" cor="#3070c8" inicial>
          <Campos itens={d.operacao} />
          {d.observacaoOperacao && (
            <div className="voto-campo">
              <span className="voto-campo-rot">Observação da Operação</span>
              <span className="voto-campo-val">{d.observacaoOperacao}</span>
            </div>
          )}
        </Bloco>

        <Bloco titulo="Dados do Tomador" cor="#27a96c" inicial>
          <Campos itens={d.tomador} />
          {d.contato.length > 0 && (
            <>
              <SubTitulo>Contato</SubTitulo>
              <Campos itens={d.contato} />
            </>
          )}
          {d.endereco.length > 0 && (
            <>
              <SubTitulo>Endereço</SubTitulo>
              <Campos itens={d.endereco} />
            </>
          )}
          {d.observacaoTomador && (
            <div className="voto-campo">
              <span className="voto-campo-rot">Observação do Tomador</span>
              <span className="voto-campo-val">{d.observacaoTomador}</span>
            </div>
          )}
        </Bloco>

        <Bloco titulo="Corretora" cor="#7a3fa0">
          {d.corretora.length > 0
            ? <Campos itens={d.corretora} />
            : <div className="voto-meta-vazio">Operação sem corretora vinculada.</div>}
        </Bloco>

        <Bloco
          titulo="Organograma Societário"
          cor="#e8b84b"
          chip={org.nSocios > 0 || org.nDiretores > 0
            ? `👥 ${org.nSocios} sócio(s)${org.nDiretores > 0 ? ` · 👔 ${org.nDiretores}` : ''}`
            : undefined}
        >
          {org.linhas.length === 0 && org.diretores.length === 0 ? (
            <div className="voto-meta-vazio">Nenhum sócio cadastrado.</div>
          ) : (
            <>
              <div className="voto-org-raiz">
                <span style={{ fontSize: 18 }}>🏛️</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="voto-org-nome" style={{ display: 'block' }}>{org.tomadorNome}</span>
                  <span className="voto-org-doc">{org.tomadorDoc ?? '—'}</span>
                </span>
              </div>

              {org.linhas.map((s, i) => (
                <div
                  key={`${s.nome}-${i}`}
                  className="voto-org-item"
                  style={{ marginLeft: Math.min(s.nivel, 4) * 14 }}
                >
                  <span
                    className="voto-org-tipo"
                    style={s.ehPJ
                      ? { background: '#e8f0fc', color: '#1e4080' }
                      : { background: '#f0f4f8', color: '#4a6a8a' }}
                  >
                    {s.ehPJ ? 'PJ' : 'PF'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="voto-org-nome" style={{ display: 'block' }}>{s.nome}</span>
                    <span className="voto-org-doc">{s.doc}</span>
                  </span>
                  {s.pct && <span className="voto-org-pct">{s.pct}</span>}
                </div>
              ))}

              {org.diretores.length > 0 && (
                <>
                  <SubTitulo>⚖️ Diretores (assinam como responsáveis)</SubTitulo>
                  {org.diretores.map((d2, i) => (
                    <div key={`${d2.nome}-${i}`} className="voto-org-item">
                      <span style={{ fontSize: 15 }}>👔</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="voto-org-nome" style={{ display: 'block' }}>{d2.nome}</span>
                        <span className="voto-org-doc">
                          {d2.cargo ? `${d2.cargo} · ` : ''}{d2.doc}
                        </span>
                      </span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </Bloco>
      </div>
    </div>
  )
}

// ── Peças ──────────────────────────────────────────────────────────────────
function Campos({ itens }: { itens: CampoExibido[] }) {
  if (itens.length === 0) return <div className="voto-meta-vazio">Sem informação cadastrada.</div>
  return (
    <div className="voto-campos">
      {itens.map((c) => (
        <div className="voto-campo" key={c.rotulo}>
          <span className="voto-campo-rot">{c.rotulo}</span>
          <span className="voto-campo-val">{c.valor}</span>
        </div>
      ))}
    </div>
  )
}

function SubTitulo({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, color: '#4a6a8a', textTransform: 'uppercase',
      letterSpacing: '0.08em', margin: '16px 0 4px',
    }}>
      {children}
    </div>
  )
}

function Bloco({
  titulo, cor, chip, inicial, children,
}: { titulo: string; cor: string; chip?: string; inicial?: boolean; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(!!inicial)
  return (
    <div className="voto-bloco">
      <button type="button" className="voto-bloco-cab" data-aberto={aberto} onClick={() => setAberto((v) => !v)}>
        <span className="voto-bloco-tit">
          <span className="voto-bloco-dot" style={{ background: cor }} />
          {titulo}
          {chip && <span className="voto-chip">{chip}</span>}
        </span>
        <span className="voto-bloco-seta">{aberto ? 'Ocultar ▲' : 'Ver ▼'}</span>
      </button>
      {aberto && <div className="voto-bloco-corpo">{children}</div>}
    </div>
  )
}

function VotoJaRegistrado({
  opcao, texto, onRetratar,
}: { opcao: VotoComite | 'segue' | ''; texto: string; onRetratar: () => void }) {
  const m = opcao && opcao !== 'segue' ? VOTO_META[opcao] : null
  return (
    <>
      <div className="voto-aviso voto-aviso-info" style={{ textAlign: 'center' }}>
        Você já votou nesta operação:{' '}
        <strong style={{ color: m?.cor }}>{m?.emoji} {m?.label}</strong>
        {texto ? <><br /><span style={{ fontStyle: 'italic' }}>“{texto}”</span></> : null}
      </div>
      <button className="voto-btn-fantasma" onClick={onRetratar}>
        ↩ Retratar e votar novamente
      </button>
    </>
  )
}

function Brasao() {
  return (
    <div className="voto-brasao">
      <div className="voto-selo-topo">⚖️</div>
      <div className="voto-marca">FAM</div>
      <div className="voto-marca-sub">Seguradora</div>
      <div className="voto-faixa">Comitê de Subscrição</div>
    </div>
  )
}

function Doc({
  token, doc, titulo, emoji, cor, bg,
}: { token: string; doc: DocInfo | null; titulo: string; emoji: string; cor: string; bg: string }) {
  if (!doc) {
    return <div className="voto-doc-vazio">{emoji} {titulo}: não anexada</div>
  }
  return (
    <a className="voto-doc" href={`/voto/${token}/doc/${doc.id}`} target="_blank" rel="noopener noreferrer">
      <span className="voto-doc-icone" style={{ background: bg, color: cor }}>{emoji}</span>
      <span className="voto-doc-txt">
        <span className="voto-doc-nome" style={{ display: 'block' }}>{titulo}</span>
        <span className="voto-doc-meta" style={{ display: 'block' }}>
          {doc.nome}{doc.bytes ? ` · ${fmtBytes(doc.bytes)}` : ''}
        </span>
      </span>
      <span className="voto-doc-seta">↗</span>
    </a>
  )
}

function Placar({ placar }: { placar: PlacarComite }) {
  const max = Math.max(1, placar.totalMembros)
  return (
    <div>
      {VOTOS_ORDENADOS.map((v) => {
        const meta = VOTO_META[v]
        const n = placar[v]
        return (
          <div className="voto-placar-linha" key={v}>
            <span className="voto-placar-rot">{meta.emoji} {meta.curto}</span>
            <span className="voto-placar-barra">
              <span className="voto-placar-fill" style={{ width: `${(n / max) * 100}%`, background: meta.cor }} />
            </span>
            <span className="voto-placar-num" style={{ color: meta.cor }}>{n}</span>
          </div>
        )
      })}
      <div className="voto-pendentes">
        {placar.pendentes > 0
          ? `${placar.total} de ${placar.totalMembros} votos · faltam ${placar.pendentes}`
          : `Todos os ${placar.totalMembros} diretores votaram`}
      </div>
    </div>
  )
}

function Rodape({ nome, escopo }: { nome: string | null; escopo?: 'operacao' | 'pessoal' }) {
  return (
    <div className="voto-rodape">
      {nome && <><strong>{nome}</strong><br /></>}
      Cédula eletrônica do Comitê · <strong>FAM Seguradora</strong>
      <br />
      {escopo === 'pessoal'
        ? 'Link pessoal e intransferível.'
        : 'Voto registrado com identificação e horário.'}
    </div>
  )
}
