'use client'

// ============================================================================
//  PainelJulgamento — tela de "Deliberação" do Comitê (tema ESCURO premium).
//  PURAMENTE PRESENTACIONAL: recebe op, membros, votos e callbacks via props.
//  Layout compacto: Placar + Bancada lado a lado; caixas de texto só aparecem ao
//  votar. Inclui "Pedir Vista", histórico, e o MASCOTE DA FAM que pula a cada
//  voto positivo + uma chuvinha sutil de confete por voto.
// ============================================================================

import { useState, useEffect, useRef } from 'react'
import LinksCedula from './LinksCedula'
import type { Operacao, Usuario, ComiteVoto, ComiteVotoHistorico, ComiteComentario, VotoComite, CanalVoto, Anexo } from '@/types'
import { fmtMoeda, fmtPercent, maskCNPJ } from '@/lib/utils'
import {
  VOTO_META,
  VOTOS_ORDENADOS,
  PARECER_META,
  calcularPlacar,
  resolverVotoSeguindo,
  destinoSugerido,
} from '@/lib/comite/votacao'

interface VotoSubmit {
  usuarioId: string
  voto: VotoComite
  segueSubscritor: boolean
  argumentacao: string
}

interface Props {
  op: Operacao
  membros: Usuario[]
  votos: ComiteVoto[]
  historico: ComiteVotoHistorico[]
  comentarios: ComiteComentario[]
  anexos: Anexo[]
  onAbrirAnexo: (a: Anexo) => void
  onRegistrarVoto: (v: VotoSubmit) => void
  onEditarParecer: (parecer: string, voto: VotoComite | null) => void
  onPedirVista: (usuarioId: string, justificativa: string) => void
  onRetomarVista: () => void
  onAbrirWhatsapp: () => void
  onEnviarConvite: () => void
  // Governança da bancada: em produção, só o dono do login vota/altera o
  // PRÓPRIO voto (impede que um usuário mude o voto de outro diretor).
  usuarioAtualId: string | null
  // Sandbox (demo): libera votar por qualquer diretor para simular a bancada.
  votacaoLivre: boolean
  // Só um subscritor edita o Parecer da Subscrição.
  podeEditarParecer: boolean
  // Quem assina uma razão/contrarazão (usuário logado). null = ninguém compõe.
  autorComentario: { nome: string; cargo: string | null } | null
  onComentar: (texto: string) => Promise<void> | void
}

// Paleta ESCURA premium (sala de comitê). Acentos seguem a marca FAM.
const T = {
  texto: '#e8eef9',
  textoFraco: '#8da3c4',
  card: '#111d38',
  cardGrad: 'linear-gradient(160deg,#15243f 0%,#0f1a30 100%)',
  borda: '#27375a',
  azul: '#3b82f6',
  azulClaro: '#60a5fa',
  roxo: '#a855f7',
  roxoTexto: '#c79bf6',
  roxoSuave: 'rgba(168,85,247,0.14)',
  dourado: '#e8b84b',
  douradoTexto: '#f0c869',
  verde: '#22c55e',
  vermelho: '#ef4444',
  inputBg: '#0e1830',
  trilho: '#1b2a48',
}

const CONFETE_EMOJIS = ['✨', '💙', '🎉', '🐾', '⭐']

// Por onde o voto entrou. 'link' = cédula aberta pelo diretor no celular.
const CANAL_LONGO: Record<string, string> = {
  crm: '🖥️ Votou pelo CRM',
  whatsapp: '📱 Votou pelo WhatsApp',
  link: '🗳️ Votou pela cédula',
}
const CANAL_CURTO: Record<string, string> = {
  crm: '🖥️ CRM',
  whatsapp: '📱 WhatsApp',
  link: '🗳️ Cédula',
}

function iniciais(nome: string): string {
  const p = (nome || '').trim().split(/\s+/)
  if (p.length === 0) return '?'
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

function fmtDataHora(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function iconeArquivo(mime: string | null): string {
  if (!mime) return '📄'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime === 'application/pdf') return '📕'
  if (mime.includes('word') || mime.includes('document')) return '📝'
  if (mime.includes('sheet') || mime.includes('excel')) return '📊'
  return '📄'
}

function ehPositivo(v: VotoComite): boolean {
  return v === 'aprovado' || v === 'aprovado_ressalva'
}

export default function PainelJulgamento({
  op,
  membros,
  votos,
  historico,
  comentarios,
  anexos,
  onAbrirAnexo,
  onRegistrarVoto,
  onEditarParecer,
  onPedirVista,
  onRetomarVista,
  onAbrirWhatsapp,
  onEnviarConvite,
  usuarioAtualId,
  votacaoLivre,
  podeEditarParecer,
  autorComentario,
  onComentar,
}: Props) {
  const [votandoId, setVotandoId] = useState<string | null>(null)
  const [retratandoId, setRetratandoId] = useState<string | null>(null)
  const [opcao, setOpcao] = useState<VotoComite | 'segue' | 'vista' | ''>('')
  const [texto, setTexto] = useState('')
  const [editandoParecer, setEditandoParecer] = useState(false)
  const [parecerTexto, setParecerTexto] = useState(op.parecer_subscricao ?? '')
  const [votoSubscritor, setVotoSubscritor] = useState<VotoComite | null>(op.voto_subscricao)
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const [focoVotoId, setFocoVotoId] = useState<string | null>(null)
  const [razaoTexto, setRazaoTexto] = useState('')
  const [enviandoRazao, setEnviandoRazao] = useState(false)
  function abrirHistorico(usuarioId: string | null) {
    setFocoVotoId(usuarioId)
    setHistoricoAberto(true)
  }

  // Cada diretor vota SOMENTE no próprio nome — é o que dá credibilidade à
  // votação (ninguém muda o voto de outro pela tela). No sandbox a trava cai
  // para o demo poder simular a bancada inteira num login só.
  const podeVotar = (membroId: string) =>
    votacaoLivre || (!!usuarioAtualId && membroId === usuarioAtualId)

  async function enviarRazao() {
    const txt = razaoTexto.trim()
    if (!txt || enviandoRazao) return
    setEnviandoRazao(true)
    try {
      await onComentar(txt)
      setRazaoTexto('')
    } finally {
      setEnviandoRazao(false)
    }
  }

  const votoPorUsuario = new Map<string, ComiteVoto>()
  for (const v of votos) votoPorUsuario.set(v.usuario_id, v)
  const placar = calcularPlacar(votos, membros)
  const emVista = !!op.comite_vista_por

  // ── Reação a cada voto: chuvinha sutil de confete ──
  const [confete, setConfete] = useState<{ id: number; left: number; emoji: string; delay: number; dur: number }[]>([])
  const prevLen = useRef(votos.length)

  function dispararConfete(qtd: number) {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    setConfete(Array.from({ length: qtd }, (_, i) => ({
      id: Date.now() + i, left: 4 + Math.random() * 92, emoji: CONFETE_EMOJIS[Math.floor(Math.random() * CONFETE_EMOJIS.length)],
      delay: Math.random() * 0.5, dur: 2 + Math.random() * 1.4,
    })))
    setTimeout(() => setConfete([]), 3200)
  }

  // Detecta a chegada de um novo voto (insert) e dispara a chuvinha.
  // Disparo via setTimeout: mantém o efeito colateral fora do corpo do efeito.
  useEffect(() => {
    const novo = votos.length > prevLen.current
    prevLen.current = votos.length
    if (!novo) return
    const ultimo = [...votos].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).at(-1)
    const positivo = !!ultimo && ehPositivo(ultimo.voto)
    const t = setTimeout(() => dispararConfete(positivo ? 18 : 8), 0)
    return () => clearTimeout(t)
  }, [votos])

  // ── Handlers do painel de voto ──
  function abrirVoto(usuarioId: string) { if (!podeVotar(usuarioId)) return; setVotandoId(usuarioId); setRetratandoId(null); setOpcao(''); setTexto('') }
  // Retratar: reabre o painel já preenchido com o voto vigente do diretor. Ao
  // confirmar, o voto anterior é arquivado no histórico (server-side) e o novo
  // passa a valer — assim a mudança fica registrada sem apagar a trilha.
  function retratarVoto(usuarioId: string) {
    if (!podeVotar(usuarioId)) return
    const atual = votoPorUsuario.get(usuarioId)
    setVotandoId(usuarioId)
    setRetratandoId(usuarioId)
    setOpcao(atual ? (atual.segue_subscritor ? 'segue' : atual.voto) : '')
    setTexto(atual?.argumentacao ?? '')
  }
  function fecharVoto() { setVotandoId(null); setRetratandoId(null); setOpcao(''); setTexto('') }
  function confirmar() {
    if (!votandoId || !opcao) return
    if (opcao === 'vista') {
      if (!texto.trim()) return
      onPedirVista(votandoId, texto.trim())
    } else {
      const segue = opcao === 'segue'
      const voto: VotoComite = segue ? resolverVotoSeguindo(op.voto_subscricao) : (opcao as VotoComite)
      onRegistrarVoto({ usuarioId: votandoId, voto, segueSubscritor: segue, argumentacao: texto.trim() })
    }
    fecharVoto()
  }
  function salvarParecer() {
    onEditarParecer(parecerTexto.trim(), votoSubscritor)
    setEditandoParecer(false)
  }

  const destino = placar.completo ? destinoSugerido(placar.parecerFinal) : null
  const parecerMeta = placar.parecerFinal ? PARECER_META[placar.parecerFinal] : null
  const totMembros = Math.max(1, placar.totalMembros)
  const pct = (n: number) => `${(n / totMembros) * 100}%`
  const diretorVotando = membros.find((m) => m.id === votandoId) ?? null
  const inputBox = { width: '100%', boxSizing: 'border-box' as const, background: T.inputBg, color: T.texto, border: `1px solid ${T.borda}`, borderRadius: 8, padding: 10, fontSize: 13, resize: 'vertical' as const }
  // Pílula sólida do voto (boa leitura no escuro).
  const pill = (v: VotoComite) => ({ background: VOTO_META[v].cor, color: '#fff', borderRadius: 16, padding: '3px 11px', fontSize: 11, fontWeight: 800, display: 'inline-block' })
  const sec = { background: T.cardGrad, border: `1px solid ${T.borda}`, borderRadius: 14, padding: '14px 16px' }

  return (
    <div style={{ background: 'linear-gradient(165deg,#0c1426 0%,#0e1a32 100%)', color: T.texto, borderRadius: 16, padding: '18px clamp(12px, 2.5vw, 22px)', border: `1px solid ${T.borda}`, position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes pj-fall { to { transform: translateY(680px) rotate(540deg); opacity:0 } }
        @keyframes pj-stamp { 0%{ transform: scale(.7) rotate(-6deg); opacity:0 } 60%{ transform: scale(1.05) rotate(2deg); opacity:1 } 100%{ transform: scale(1) rotate(0); opacity:1 } }
        @keyframes pj-seal { 0%{ transform: scale(1.5) rotate(-8deg); opacity:0 } 55%{ transform: scale(.92) rotate(-8deg); opacity:1 } 100%{ transform: scale(1) rotate(-8deg); opacity:1 } }
        @media (prefers-reduced-motion: reduce){ .pj-anim{ animation:none !important } }
      `}</style>

      {/* Cabeçalho premium (título à esquerda · selo do comitê à direita) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(90deg,rgba(168,85,247,0.25),rgba(96,165,250,0.18))', border: '1px solid rgba(168,85,247,0.45)', color: T.roxoTexto, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 800, padding: '4px 12px', borderRadius: 16, marginBottom: 8 }}>
            👑 Deliberação do Comitê
          </div>
          <div style={{ fontSize: 'clamp(18px, 2.4vw, 24px)', fontWeight: 800, color: '#fff', lineHeight: 1.15 }}>{op.tomador?.razao_social || 'Operação em deliberação'}</div>
          <div style={{ fontSize: 12.5, color: T.textoFraco, marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {op.tomador?.cnpj && <span>👤 CNPJ {maskCNPJ(op.tomador.cnpj)}</span>}
            {op.modalidade && <span>🛡️ {op.modalidade}</span>}
            {op.lmg != null && <span>🗄️ LMG {fmtMoeda(op.lmg)}</span>}
            {op.taxa != null && <span>⏱️ Taxa {fmtPercent(op.taxa / 100)}</span>}
            {op.premio_previsto != null && <span>⭐ Prêmio <strong style={{ color: T.verde }}>{fmtMoeda(op.premio_previsto)}</strong></span>}
          </div>
        </div>

        {/* Selo do Comitê — compacto, no topo-direito; "carimba" o veredito ao fechar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
          {placar.completo && parecerMeta ? (
            <div className="pj-anim" style={{ width: 84, height: 84, borderRadius: '50%', border: `2.5px solid ${parecerMeta.cor}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: parecerMeta.cor, transform: 'rotate(-8deg)', animation: 'pj-seal .6s ease both', boxShadow: `0 0 22px ${parecerMeta.cor}55, inset 0 0 0 4px ${parecerMeta.cor}1f`, background: `${parecerMeta.cor}14`, textAlign: 'center', padding: 4, boxSizing: 'border-box' }}>
              <div style={{ fontSize: 20, lineHeight: 1 }}>{parecerMeta.emoji}</div>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 2, lineHeight: 1.05 }}>{placar.parecerFinal}</div>
            </div>
          ) : (
            <div style={{ width: 80, height: 80, borderRadius: '50%', border: `2px dashed ${T.borda}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: T.textoFraco, background: 'rgba(255,255,255,0.02)', textAlign: 'center', padding: 4, boxSizing: 'border-box' }}>
              <div style={{ fontSize: 19, lineHeight: 1 }}>⚖️</div>
              <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 0.8, marginTop: 3 }}>EM DELIBERAÇÃO</div>
              <div style={{ fontSize: 6.5, letterSpacing: 1.5, marginTop: 2, opacity: 0.7 }}>★ COMITÊ·FAM ★</div>
            </div>
          )}
          <div style={{ fontSize: 9.5, color: T.textoFraco, marginTop: 6, textAlign: 'center', whiteSpace: 'nowrap' }}>
            {placar.completo ? 'Veredito do colegiado' : `${placar.total}/${placar.totalMembros} votos · faltam ${placar.pendentes}`}
          </div>
        </div>
      </div>

      {/* Banner de Vista */}
      {emVista && (
        <div style={{ background: 'rgba(232,184,75,0.10)', border: `1.5px solid ${T.dourado}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 22 }}>⏸️</div>
          <div style={{ flex: '1 1 240px' }}>
            <div style={{ fontWeight: 800, color: T.douradoTexto, fontSize: 13 }}>Processo em VISTA — deliberação pausada</div>
            <div style={{ fontSize: 12, color: T.texto, marginTop: 2 }}>
              Pedida por <strong>{op.comite_vista_por}</strong>{op.comite_vista_cargo ? ` (${op.comite_vista_cargo})` : ''}.
              {op.comite_vista_justificativa && <> Motivo: “{op.comite_vista_justificativa}”</>}
            </div>
          </div>
          <button onClick={onRetomarVista} style={{ cursor: 'pointer', background: T.dourado, color: '#1a2a3a', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 800, fontSize: 13 }}>▶ Retomar</button>
        </div>
      )}

      {/* Aviso quando o login atual NÃO é um diretor votante desta bancada:
          explica por que o botão de voto não aparece (evita a impressão de bug)
          e aponta o caminho — cada diretor vota no próprio login ou pela cédula. */}
      {!votacaoLivre && !membros.some((m) => m.id === usuarioAtualId) && (
        <div style={{ background: 'rgba(59,130,246,0.08)', border: `1px solid ${T.azul}55`, borderRadius: 12, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 18, lineHeight: 1.2 }}>ⓘ</div>
          <div style={{ flex: '1 1 240px', fontSize: 12, color: T.texto, lineHeight: 1.5 }}>
            {autorComentario ? <>Você está identificado como <strong>{autorComentario.nome}</strong> e </> : 'Seu login '}
            não consta como <strong>diretor votante</strong> desta bancada — por isso o botão de voto não aparece.
            Cada diretor vota no próprio nome (pelo CRM com o seu login, ou pela cédula no WhatsApp).
            Você ainda pode registrar <strong>razões e contrarrazões</strong> abaixo.
            {' '}Se você é diretor e deveria votar aqui, peça para vincular seu login ao seu cadastro de usuário.
          </div>
        </div>
      )}

      {/* ── LINHA: Placar (esq) + Bancada (dir) ── */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 14 }}>
        {/* Placar + Anexos */}
        <section aria-live="polite" style={{ ...sec, flex: '1 1 250px' }}>
          <strong style={{ fontSize: 13, color: '#fff', letterSpacing: 0.5 }}>🏆 PLACAR AO VIVO</strong>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '12px 0 10px' }}>
            <ContadorPlacar rotulo="Favoráveis" valor={placar.aprovadosTotal} cor={T.verde} />
            <ContadorPlacar rotulo="Contrários" valor={placar.reprovado} cor={T.vermelho} />
            <ContadorPlacar rotulo="Pendentes" valor={placar.pendentes} cor={T.azulClaro} />
          </div>
          <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: T.trilho }}>
            <div style={{ width: pct(placar.aprovado), background: VOTO_META.aprovado.cor }} />
            <div style={{ width: pct(placar.aprovado_ressalva), background: VOTO_META.aprovado_ressalva.cor }} />
            <div style={{ width: pct(placar.reprovado), background: VOTO_META.reprovado.cor }} />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 9, fontSize: 11, color: T.textoFraco }}>
            {VOTOS_ORDENADOS.map((v) => (
              <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <i style={{ width: 9, height: 9, borderRadius: '50%', background: VOTO_META[v].cor, display: 'inline-block' }} />
                {VOTO_META[v].label}: <strong style={{ color: T.texto }}>{placar[v]}</strong>
              </span>
            ))}
          </div>

          {/* Análise de Crédito / Anexos */}
          <div style={{ marginTop: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.borda}`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.azulClaro, marginBottom: 7 }}>📑 Análise de Crédito &amp; Anexos <span style={{ fontWeight: 400, color: T.textoFraco }}>({anexos.length})</span></div>
            {anexos.length === 0 ? (
              <div style={{ fontSize: 11.5, color: T.textoFraco, lineHeight: 1.45 }}>Nenhum anexo do tomador. Anexe a <strong style={{ color: T.douradoTexto }}>análise de crédito</strong> na tela do Tomador.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {anexos.map((a) => (
                  <button key={a.id} onClick={() => onAbrirAnexo(a)} title="Abrir anexo" style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', width: '100%', cursor: 'pointer', background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: '7px 10px' }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{iconeArquivo(a.tipo_mime)}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: T.texto, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.nome_original}</span>
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: T.azulClaro }}>↓ baixar</span>
                  </button>
                ))}
              </div>
            )}
          </div>

        </section>

        {/* A Bancada */}
        <section style={{ ...sec, flex: '2 1 430px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <strong style={{ fontSize: 13, color: '#fff', letterSpacing: 0.5 }}>🏛️ A BANCADA</strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: T.azulClaro, fontWeight: 700 }}>{placar.completo ? 'QUÓRUM COMPLETO' : `FALTAM ${placar.pendentes} DIRETOR${placar.pendentes === 1 ? '' : 'ES'}`}</span>
              {(votos.length > 0 || historico.length > 0) && (
                <button onClick={() => abrirHistorico(null)} style={{ cursor: 'pointer', background: T.roxoSuave, border: '1px solid rgba(168,85,247,0.4)', color: T.roxoTexto, borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>📜 Histórico{historico.length > 0 ? ` · ${historico.length} retratação${historico.length === 1 ? '' : 'ões'}` : ''}</button>
              )}
            </div>
          </div>
          {membros.length === 0 ? (
            <div style={{ fontSize: 13, color: T.textoFraco }}>Nenhum diretor habilitado. Marque <strong style={{ color: T.douradoTexto }}>🏛 Membro do Comitê</strong> na tela de Usuários.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {membros.map((m) => {
                const voto = votoPorUsuario.get(m.id)
                const meta = voto ? VOTO_META[voto.voto] : null
                const glow = meta ? { border: `1.5px solid ${meta.cor}`, boxShadow: `0 0 0 1px ${meta.cor}55, 0 0 22px ${meta.cor}33` } : { border: `1px solid ${T.borda}` }
                // Este cartão é do próprio usuário logado? Só ele vota/retrata aqui.
                const meu = podeVotar(m.id)
                return (
                  <div
                    key={m.id}
                    onClick={voto ? () => abrirHistorico(m.id) : undefined}
                    title={voto ? 'Ver voto e histórico' : undefined}
                    style={{ width: 150, background: '#0f1a30', borderRadius: 12, padding: 13, textAlign: 'center', cursor: voto ? 'pointer' : 'default', ...glow }}
                  >
                    <div style={{ width: 50, height: 50, borderRadius: '50%', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#fff', background: 'linear-gradient(160deg,#1e4080,#2a5aa0)', border: `2.5px solid ${meta ? meta.cor : '#3a4f78'}`, filter: voto ? 'none' : 'grayscale(0.4) opacity(0.85)' }}>{iniciais(m.nome)}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.15 }}>{m.nome}{meu && !votacaoLivre && <span style={{ color: T.azulClaro }}> · você</span>}</div>
                    <div style={{ fontSize: 10.5, color: T.textoFraco, marginBottom: 8 }}>{m.cargo || 'Diretor(a)'}</div>
                    {meta ? (
                      <>
                        <span style={pill(voto!.voto)}>{meta.emoji} {meta.label}</span>
                        {voto!.segue_subscritor && <div style={{ fontSize: 9.5, color: T.douradoTexto, marginTop: 4, fontWeight: 700 }}>⚖️ Acompanha</div>}
                        <div style={{ marginTop: 6, fontSize: 9.5, color: T.azulClaro, fontWeight: 700 }}>ver detalhes →</div>
                        {meu ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); retratarVoto(m.id) }}
                            disabled={emVista}
                            title={emVista ? 'Deliberação pausada (em vista)' : 'Retratar/alterar o SEU voto — o voto atual fica no histórico'}
                            style={{ marginTop: 7, cursor: emVista ? 'not-allowed' : 'pointer', opacity: emVista ? 0.5 : 1, background: 'transparent', color: T.douradoTexto, border: `1px solid ${T.dourado}66`, borderRadius: 7, padding: '4px 10px', fontSize: 10.5, fontWeight: 700 }}
                          >↩ Retratar meu voto</button>
                        ) : (
                          <div title="Só o próprio diretor altera o voto dele" style={{ marginTop: 7, fontSize: 9.5, color: T.textoFraco }}>🔒 voto do diretor</div>
                        )}
                      </>
                    ) : meu ? (
                      <button onClick={() => abrirVoto(m.id)} disabled={emVista} title={emVista ? 'Deliberação pausada (em vista)' : 'Registrar o seu voto'} style={{ cursor: emVista ? 'not-allowed' : 'pointer', opacity: emVista ? 0.5 : 1, background: votandoId === m.id ? T.roxo : T.roxoSuave, color: votandoId === m.id ? '#fff' : T.roxoTexto, border: `1px solid ${T.roxo}55`, borderRadius: 8, padding: '6px 16px', fontSize: 12, fontWeight: 700 }}>🗳️ Votar</button>
                    ) : (
                      <div title="Cada diretor vota no próprio nome — pelo CRM ou pela cédula no celular" style={{ fontSize: 10, color: T.textoFraco, padding: '6px 8px' }}>⏳ Aguardando voto</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── PAINEL DE VOTO (só ao votar) ── */}
      {diretorVotando && (
        <section style={{ background: T.cardGrad, border: `2px solid ${T.roxo}`, borderRadius: 12, padding: '14px 16px', marginBottom: 14, boxShadow: '0 0 24px rgba(168,85,247,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <strong style={{ fontSize: 14, color: retratandoId ? T.douradoTexto : T.roxoTexto }}>
              {retratandoId ? '↩ Retratação do voto de ' : '🗳️ Voto de '}{diretorVotando.nome}
            </strong>
            <button onClick={fecharVoto} style={{ background: 'none', border: 'none', color: T.textoFraco, fontSize: 13, cursor: 'pointer' }}>✕ Cancelar</button>
          </div>
          {retratandoId && (
            <div style={{ background: 'rgba(232,184,75,0.10)', border: `1px solid ${T.dourado}66`, borderRadius: 8, padding: '8px 11px', marginBottom: 11, fontSize: 12, color: T.douradoTexto, lineHeight: 1.45 }}>
              Você está <strong>retratando</strong> um voto já proferido. Escolha o novo voto e justifique com os novos elementos — o voto anterior fica preservado no <strong>histórico</strong>.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {VOTOS_ORDENADOS.map((v) => {
              const ativo = opcao === v
              return (
                <button key={v} onClick={() => setOpcao(v)} style={{ cursor: 'pointer', border: `2px solid ${ativo ? VOTO_META[v].cor : T.borda}`, background: ativo ? VOTO_META[v].cor : 'transparent', color: ativo ? '#fff' : T.textoFraco, borderRadius: 8, padding: '7px 13px', fontWeight: 700, fontSize: 13 }}>
                  {VOTO_META[v].emoji} {VOTO_META[v].curto}
                </button>
              )
            })}
            <button onClick={() => setOpcao('segue')} title={op.voto_subscricao ? `Vota como o subscritor: ${VOTO_META[resolverVotoSeguindo(op.voto_subscricao)].label}` : 'Subscritor sem voto: assume Aprovar'} style={{ cursor: 'pointer', border: `2px solid ${opcao === 'segue' ? T.dourado : T.borda}`, background: opcao === 'segue' ? 'rgba(232,184,75,0.15)' : 'transparent', color: opcao === 'segue' ? T.douradoTexto : T.textoFraco, borderRadius: 8, padding: '7px 13px', fontWeight: 700, fontSize: 13 }}>🤝 Acompanho o Subscritor</button>
            <button onClick={() => setOpcao('vista')} title="Pausa a deliberação para estudar o caso" style={{ cursor: 'pointer', border: `2px solid ${opcao === 'vista' ? '#d07830' : T.borda}`, background: opcao === 'vista' ? 'rgba(208,120,48,0.18)' : 'transparent', color: opcao === 'vista' ? '#e0925a' : T.textoFraco, borderRadius: 8, padding: '7px 13px', fontWeight: 700, fontSize: 13 }}>⏸️ Pedir Vista</button>
          </div>
          {opcao && (
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder={opcao === 'vista' ? 'Justifique o pedido de vista (obrigatório)…' : 'Argumentação do voto (opcional)…'} style={inputBox} />
          )}
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {opcao === 'vista' ? (
              <button onClick={confirmar} disabled={!texto.trim()} style={{ cursor: !texto.trim() ? 'not-allowed' : 'pointer', opacity: !texto.trim() ? 0.5 : 1, background: '#d07830', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 800, fontSize: 14 }}>⏸️ Confirmar Pedido de Vista</button>
            ) : (
              <button onClick={confirmar} disabled={!opcao} style={{ cursor: !opcao ? 'not-allowed' : 'pointer', opacity: !opcao ? 0.5 : 1, background: T.roxo, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontWeight: 800, fontSize: 14 }}>⚖️ Proferir voto</button>
            )}
          </div>
        </section>
      )}

      {/* ── PARECER DA SUBSCRIÇÃO ── */}
      <section style={{ ...sec, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <strong style={{ fontSize: 13, color: T.azulClaro }}>📋 Parecer da Subscrição</strong>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {op.voto_subscricao && !editandoParecer && <span style={pill(op.voto_subscricao)}>{VOTO_META[op.voto_subscricao].emoji} {VOTO_META[op.voto_subscricao].label}</span>}
            {/* Só a Subscrição registra/edita este parecer. Os demais membros
                usam "Razões e Contrarrazões" abaixo — cada um com a própria fala. */}
            {podeEditarParecer && !editandoParecer && (
              <button onClick={() => setEditandoParecer(true)} style={{ cursor: 'pointer', background: 'transparent', border: `1px solid ${T.borda}`, color: T.azulClaro, borderRadius: 7, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}>{op.parecer_subscricao || op.voto_subscricao ? '✏️ Editar' : '+ Registrar parecer'}</button>
            )}
            {!podeEditarParecer && !editandoParecer && (
              <span title="Somente a Subscrição registra este parecer" style={{ fontSize: 10.5, color: T.textoFraco, whiteSpace: 'nowrap' }}>🔒 só a Subscrição</span>
            )}
          </div>
        </div>
        {!editandoParecer ? (
          <div style={{ fontSize: 12.5, color: op.parecer_subscricao ? T.texto : T.textoFraco, marginTop: 7, lineHeight: 1.5 }}>
            {op.subscritor_nome && <strong style={{ color: '#fff' }}>{op.subscritor_nome}: </strong>}
            {op.parecer_subscricao || 'Sem parecer registrado ainda.'}
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <textarea value={parecerTexto} onChange={(e) => setParecerTexto(e.target.value)} rows={3} placeholder="Parecer técnico da subscrição…" style={inputBox} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
              {VOTOS_ORDENADOS.map((v) => {
                const ativo = votoSubscritor === v
                return (
                  <button key={v} onClick={() => setVotoSubscritor(ativo ? null : v)} style={{ cursor: 'pointer', border: `2px solid ${ativo ? VOTO_META[v].cor : T.borda}`, background: ativo ? VOTO_META[v].cor : 'transparent', color: ativo ? '#fff' : T.textoFraco, borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: 12 }}>{VOTO_META[v].emoji} {VOTO_META[v].curto}</button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={salvarParecer} style={{ cursor: 'pointer', background: T.azul, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13 }}>Salvar parecer</button>
              <button onClick={() => { setEditandoParecer(false); setParecerTexto(op.parecer_subscricao ?? ''); setVotoSubscritor(op.voto_subscricao) }} style={{ cursor: 'pointer', background: 'transparent', color: T.azulClaro, border: `1.5px solid ${T.borda}`, borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 13 }}>Cancelar</button>
            </div>
          </div>
        )}
      </section>

      {/* Banner de Parecer Final + celebração */}
      {placar.completo && parecerMeta && (
        <div className="pj-anim" style={{ background: `${parecerMeta.cor}22`, color: '#fff', border: `2px solid ${parecerMeta.cor}`, borderRadius: 10, padding: '12px 14px', textAlign: 'center', marginBottom: 14, animation: 'pj-stamp .6s ease both', boxShadow: `0 0 28px ${parecerMeta.cor}44` }} role="status">
          <div style={{ fontSize: 'clamp(16px, 2.6vw, 22px)', fontWeight: 800, letterSpacing: 0.5 }}>{parecerMeta.emoji} {placar.parecerFinal}</div>
          {destino && <div style={{ fontSize: 12, marginTop: 4, color: T.textoFraco }}>Próximo passo sugerido ao subscritor: <strong style={{ color: '#fff' }}>{destino.rotulo}</strong> (→ {destino.status})</div>}
        </div>
      )}

      {/* WhatsApp — Simulador (demonstração) + envio real do convite. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={onAbrirWhatsapp} style={{ cursor: 'pointer', background: 'rgba(37,211,102,0.10)', color: '#fff', border: '1px solid rgba(37,211,102,0.5)', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 13, boxShadow: '0 0 16px rgba(37,211,102,0.18)' }}>💬 Abrir Simulador WhatsApp</button>
        <button onClick={onEnviarConvite} style={{ cursor: 'pointer', background: 'rgba(59,130,246,0.08)', color: '#fff', border: `1px solid ${T.borda}`, borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 13 }}>📲 Enviar convite</button>
      </div>

      {/* ── RAZÕES E CONTRARRAZÕES DA BANCADA ──
          O Parecer (acima) é só da Subscrição. AQUI todo membro registra a
          própria razão/contrarazão — texto assinado, e ninguém edita o do
          outro (é append-only: cada fala fica preservada, mantendo a
          parcimônia da deliberação). Chegam em tempo real (realtime). */}
      {(autorComentario || comentarios.length > 0) && (
        <div style={{ marginTop: 14, background: T.cardGrad, border: `1px solid ${T.borda}`, borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.roxoTexto, marginBottom: 12 }}>
            💬 Razões e Contrarrazões da Bancada ({comentarios.length})
          </div>

          {/* Compositor: cada usuário envia a PRÓPRIA fala. */}
          {autorComentario && (
            <div style={{ marginBottom: comentarios.length > 0 ? 16 : 4 }}>
              <textarea
                value={razaoTexto}
                onChange={(e) => setRazaoTexto(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Escreva suas razões ou contrarazões sobre esta operação…"
                style={inputBox}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: T.textoFraco, lineHeight: 1.45 }}>
                  Assinando como <strong style={{ color: T.texto }}>{autorComentario.nome}</strong>
                  {autorComentario.cargo ? ` · ${autorComentario.cargo}` : ''}. Seu texto entra assinado e
                  não altera o de ninguém.
                </span>
                <button
                  onClick={enviarRazao}
                  disabled={!razaoTexto.trim() || enviandoRazao}
                  style={{
                    cursor: !razaoTexto.trim() || enviandoRazao ? 'not-allowed' : 'pointer',
                    opacity: !razaoTexto.trim() || enviandoRazao ? 0.5 : 1,
                    background: T.roxo, color: '#fff', border: 'none', borderRadius: 8,
                    padding: '8px 18px', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap',
                  }}
                >
                  {enviandoRazao ? 'Publicando…' : '✍️ Publicar minha razão'}
                </button>
              </div>
            </div>
          )}

          {comentarios.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {comentarios.map((c) => (
                <div key={c.id} style={{ background: T.inputBg, border: `1px solid ${T.borda}`, borderRadius: 10, padding: '11px 13px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.texto }}>
                      {c.autor}
                      {c.cargo && <span style={{ color: T.textoFraco, fontWeight: 500 }}> · {c.cargo}</span>}
                    </span>
                    <span style={{ fontSize: 10.5, color: T.textoFraco }}>
                      {CANAL_CURTO[c.canal] ?? CANAL_CURTO.crm} · 🕒 {fmtDataHora(c.created_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: T.texto, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {c.comentario}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: T.textoFraco, fontStyle: 'italic' }}>
              Ainda não há razões registradas. Registre a sua acima — cada membro tem a própria fala.
            </div>
          )}
        </div>
      )}

      {/* Cédula por link: o caminho em uso enquanto a API oficial do WhatsApp
          não permite votar dentro do próprio chat. */}
      {!op.comite_encerrado && !emVista && <LinksCedula operacaoId={op.id} />}

      {/* ── MODAL: Histórico da Deliberação ── */}
      {historicoAberto && (() => {
        // Linha do tempo unificada: votos vigentes + votos retratados (arquivados),
        // ordenados pela hora em que foram proferidos.
        type LinhaItem = { id: string; tipo: 'atual' | 'retratado'; autor: string; cargo: string | null; voto: VotoComite; segue: boolean; arg: string | null; canal: CanalVoto; quando: string; retratadoEm: string | null }
        const linha: LinhaItem[] = [
          ...historico.map((h) => ({ id: 'h-' + h.id, tipo: 'retratado' as const, autor: h.autor, cargo: h.cargo, voto: h.voto, segue: h.segue_subscritor, arg: h.argumentacao, canal: h.canal, quando: h.votado_em ?? h.retratado_em, retratadoEm: h.retratado_em })),
          ...votos.map((v) => ({ id: 'v-' + v.id, tipo: 'atual' as const, autor: v.autor, cargo: v.cargo, voto: v.voto, segue: v.segue_subscritor, arg: v.argumentacao, canal: v.canal, quando: v.created_at, retratadoEm: null })),
        ].sort((a, b) => String(a.quando).localeCompare(String(b.quando)))
        const focoMembro = focoVotoId ? membros.find((mm) => mm.id === focoVotoId) ?? null : null
        const foco = focoVotoId ? votoPorUsuario.get(focoVotoId) ?? null : null
        const focoMeta = foco ? VOTO_META[foco.voto] : null
        const focoRetratacoes = focoVotoId ? historico.filter((h) => h.usuario_id === focoVotoId) : []
        return (
          <div onClick={() => setHistoricoAberto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(5,10,22,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#0f1a30', border: `1px solid ${T.borda}`, borderRadius: 14, width: '100%', maxWidth: 540, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 18px 60px rgba(0,0,0,0.6)' }}>
              <div style={{ position: 'sticky', top: 0, background: 'linear-gradient(90deg,rgba(168,85,247,0.25),rgba(96,165,250,0.15))', borderBottom: `1px solid ${T.borda}`, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 }}>
                <strong style={{ fontSize: 15, color: '#fff' }}>📜 Histórico da Deliberação</strong>
                <button onClick={() => setHistoricoAberto(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: T.textoFraco }}>✕</button>
              </div>
              <div style={{ padding: '16px 18px' }}>
                {foco && focoMembro && focoMeta && (
                  <div style={{ border: `2px solid ${focoMeta.cor}`, borderRadius: 12, padding: 14, marginBottom: 16, boxShadow: `0 0 22px ${focoMeta.cor}33` }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#fff', background: 'linear-gradient(160deg,#1e4080,#2a5aa0)', border: `3px solid ${focoMeta.cor}`, flexShrink: 0 }}>{iniciais(focoMembro.nome)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{focoMembro.nome}</div>
                        <div style={{ fontSize: 12, color: T.textoFraco }}>{focoMembro.cargo || 'Diretor(a)'}</div>
                      </div>
                      <span style={{ ...pill(foco.voto), fontSize: 13, padding: '5px 14px' }}>{focoMeta.emoji} {focoMeta.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '10px 0 0', fontSize: 11.5, color: T.textoFraco }}>
                      <span>{CANAL_LONGO[foco.canal] ?? CANAL_LONGO.crm}</span>
                      <span>🕒 {fmtDataHora(foco.created_at)}</span>
                      {foco.segue_subscritor && <span style={{ color: T.douradoTexto, fontWeight: 700 }}>⚖️ Acompanha o Subscritor</span>}
                    </div>
                    <div style={{ marginTop: 10, background: T.inputBg, border: `1px solid ${T.borda}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: T.texto, lineHeight: 1.5 }}>
                      {foco.argumentacao ? `“${foco.argumentacao}”` : <span style={{ color: T.textoFraco, fontStyle: 'italic' }}>Sem argumentação registrada.</span>}
                    </div>
                    {focoRetratacoes.length > 0 && (
                      <div style={{ marginTop: 12, borderTop: `1px dashed ${T.borda}`, paddingTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.douradoTexto, marginBottom: 7 }}>↩ Votos anteriores (retratados)</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {focoRetratacoes.map((h) => (
                            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', opacity: 0.85 }}>
                              <span style={{ ...pill(h.voto), fontSize: 10, textDecoration: 'line-through' }}>{VOTO_META[h.voto].emoji} {VOTO_META[h.voto].curto}</span>
                              <span style={{ fontSize: 11, color: T.textoFraco }}>proferido {fmtDataHora(h.votado_em ?? h.retratado_em)} · retratado {fmtDataHora(h.retratado_em)}</span>
                              {h.argumentacao && <span style={{ fontSize: 11.5, color: T.textoFraco, fontStyle: 'italic', width: '100%' }}>“{h.argumentacao}”</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, color: T.azulClaro, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Linha do tempo</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(op.parecer_subscricao || op.voto_subscricao) && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ fontSize: 18, flexShrink: 0 }}>🖋️</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.texto }}>
                          Parecer da Subscrição{op.subscritor_nome ? ` — ${op.subscritor_nome}` : ''}
                          {op.voto_subscricao && <span style={{ ...pill(op.voto_subscricao), marginLeft: 8, fontSize: 10 }}>{VOTO_META[op.voto_subscricao].emoji} {VOTO_META[op.voto_subscricao].label}</span>}
                        </div>
                        {op.parecer_subscricao && <div style={{ fontSize: 12.5, color: T.textoFraco, marginTop: 3, lineHeight: 1.45 }}>“{op.parecer_subscricao}”</div>}
                      </div>
                    </div>
                  )}
                  {linha.map((v) => {
                    const meta = VOTO_META[v.voto]
                    const ret = v.tipo === 'retratado'
                    return (
                      <div key={v.id} style={{ display: 'flex', gap: 10, borderTop: `1px dashed ${T.borda}`, paddingTop: 10, opacity: ret ? 0.7 : 1 }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, color: '#fff', background: ret ? '#2a3a58' : 'linear-gradient(160deg,#1e4080,#2a5aa0)', border: `2px solid ${meta.cor}`, flexShrink: 0 }}>{iniciais(v.autor)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{v.autor}</span>
                            <span style={{ ...pill(v.voto), fontSize: 10, ...(ret ? { textDecoration: 'line-through' } : {}) }}>{meta.emoji} {meta.curto}</span>
                            {v.segue && <span style={{ fontSize: 10, color: T.douradoTexto, fontWeight: 700 }}>⚖️ Acompanha</span>}
                            {ret && <span style={{ fontSize: 9.5, fontWeight: 800, color: T.douradoTexto, background: 'rgba(232,184,75,0.14)', border: `1px solid ${T.dourado}55`, borderRadius: 12, padding: '1px 8px' }}>↩ RETRATADO</span>}
                          </div>
                          <div style={{ fontSize: 10.5, color: T.textoFraco, marginTop: 1 }}>{v.cargo ? `${v.cargo} · ` : ''}{CANAL_CURTO[v.canal] ?? CANAL_CURTO.crm} · 🕒 {fmtDataHora(v.quando)}{ret && v.retratadoEm ? ` · retratado ${fmtDataHora(v.retratadoEm)}` : ''}</div>
                          {v.arg && <div style={{ fontSize: 12, color: T.texto, marginTop: 4, lineHeight: 1.4 }}>“{v.arg}”</div>}
                        </div>
                      </div>
                    )
                  })}
                  {emVista && (
                    <div style={{ display: 'flex', gap: 10, borderTop: `1px dashed ${T.borda}`, paddingTop: 10 }}>
                      <div style={{ fontSize: 18, flexShrink: 0 }}>⏸️</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.douradoTexto }}>Pedido de Vista — {op.comite_vista_por}{op.comite_vista_cargo ? ` (${op.comite_vista_cargo})` : ''}</div>
                        {op.comite_vista_justificativa && <div style={{ fontSize: 12.5, color: T.textoFraco, marginTop: 3, lineHeight: 1.45 }}>“{op.comite_vista_justificativa}”</div>}
                      </div>
                    </div>
                  )}
                  {linha.length === 0 && !op.parecer_subscricao && !op.voto_subscricao && !emVista && (
                    <div style={{ fontSize: 13, color: T.textoFraco, fontStyle: 'italic' }}>Ainda não há votos nem parecer registrados.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Confete */}
      {confete.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden="true">
          {confete.map((c) => (
            <span key={c.id} className="pj-anim" style={{ position: 'absolute', top: -24, left: `${c.left}%`, fontSize: 16, animation: `pj-fall ${c.dur}s linear ${c.delay}s forwards` }}>{c.emoji}</span>
          ))}
        </div>
      )}
      <CelebraQuandoAprova completo={placar.completo} favoravel={placar.parecerFinal === 'Aprovada' || placar.parecerFinal === 'Aprovada com Ressalva'} onCelebrar={() => dispararConfete(40)} />
    </div>
  )
}

function ContadorPlacar({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 70 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: cor, lineHeight: 1 }}>{valor}</div>
      <div style={{ fontSize: 10.5, color: '#8da3c4', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{rotulo}</div>
    </div>
  )
}

function CelebraQuandoAprova({ completo, favoravel, onCelebrar }: { completo: boolean; favoravel: boolean; onCelebrar: () => void }) {
  const jaCelebrou = useRef(false)
  useEffect(() => {
    if (completo && favoravel && !jaCelebrou.current) {
      jaCelebrou.current = true
      onCelebrar()
    } else if ((!completo || !favoravel) && jaCelebrou.current) {
      jaCelebrou.current = false
    }
  }, [completo, favoravel, onCelebrar])
  return null
}
