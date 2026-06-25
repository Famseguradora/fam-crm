'use client'

// ============================================================================
//  Simulador de WhatsApp do Comitê (SOMENTE no simulador / sandbox)
//  Modal com um mockup de celular que "prova" o fluxo de votação remota dos
//  diretores. Componente PURAMENTE presentacional: recebe dados e callbacks
//  via props e NUNCA faz IO — quem persiste o voto é o parent (onVotar).
// ============================================================================
import { useState } from 'react'
import type { Operacao, Usuario, ComiteVoto, VotoComite } from '@/types'
import { fmtMoeda, fmtPercent, maskCNPJ } from '@/lib/utils'
import { VOTO_META, VOTOS_ORDENADOS, calcularPlacar } from '@/lib/comite/votacao'
import { montarConvite, montarConfirmacaoVoto, montarVeredito } from '@/lib/comite/whatsapp-sim'

interface Props {
  op: Operacao
  subscritorNome: string
  membros: Usuario[]
  votos: ComiteVoto[]
  onVotar: (usuarioId: string, voto: VotoComite, segueSubscritor: boolean) => void
  onFechar: () => void
}

// Renderiza o "markdown" simples do WhatsApp: *negrito*, _itálico_ e quebras de
// linha. Faz parsing sequencial por caractere para casar pares de marcadores.
function RenderWhatsApp({ texto }: { texto: string }) {
  // Cada linha vira um <div> (preserva quebras); dentro, aplicamos negrito/itálico.
  const linhas = texto.split('\n')
  return (
    <>
      {linhas.map((linha, i) => (
        <div key={i} style={{ minHeight: linha === '' ? 7 : undefined }}>
          {formatarInline(linha)}
        </div>
      ))}
    </>
  )
}

// Converte *...* em <strong> e _..._ em <em> dentro de uma única linha.
function formatarInline(linha: string): React.ReactNode[] {
  const partes: React.ReactNode[] = []
  const regex = /\*([^*]+)\*|_([^_]+)_/g
  let ultimo = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = regex.exec(linha)) !== null) {
    if (m.index > ultimo) partes.push(linha.slice(ultimo, m.index))
    if (m[1] != null) partes.push(<strong key={k++}>{m[1]}</strong>)
    else if (m[2] != null) partes.push(<em key={k++}>{m[2]}</em>)
    ultimo = m.index + m[0].length
  }
  if (ultimo < linha.length) partes.push(linha.slice(ultimo))
  return partes
}

// Prazo legível da operação (espelha o helper interno do whatsapp-sim).
function prazoTxt(op: Operacao): string {
  if (op.vigencia_anos != null) return `${op.vigencia_anos} ${op.vigencia_anos === 1 ? 'ano' : 'anos'}`
  if (op.vigencia_dias != null) return `${op.vigencia_dias} dias`
  return '—'
}

export default function WhatsAppSimulator({ op, subscritorNome, membros, votos, onVotar, onFechar }: Props) {
  // Só diretores com telefone cadastrado "recebem" o convite no WhatsApp.
  const comTelefone = membros.filter((m) => m.telefone)

  // Diretor atualmente aberto na conversa (default: o primeiro com telefone).
  const [selecionadoId, setSelecionadoId] = useState<string | null>(comTelefone[0]?.id ?? null)
  // Por conversa, controla se o diretor já abriu a "análise de crédito" e se
  // já tocou em "Votar" (revelando os 3 botões de voto). Estado local de UI.
  const [analiseAberta, setAnaliseAberta] = useState<Record<string, boolean>>({})
  const [votarAberto, setVotarAberto] = useState<Record<string, boolean>>({})

  const selecionado = comTelefone.find((m) => m.id === selecionadoId) ?? null
  const placar = calcularPlacar(votos, membros)

  // Voto já registrado do diretor aberto (se houver).
  const votoDoSelecionado = selecionado
    ? votos.find((v) => v.usuario_id === selecionado.id)
    : undefined

  // ── Paleta WhatsApp ──
  const verdeHeader = '#075e54'
  const fundoChat = '#e5ddd5'
  const padraoChat =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cg fill='%23000' fill-opacity='0.04'%3E%3Ccircle cx='10' cy='10' r='1.5'/%3E%3Ccircle cx='30' cy='25' r='1.5'/%3E%3Ccircle cx='18' cy='32' r='1.2'/%3E%3C/g%3E%3C/svg%3E\")"
  const azulBotao = '#00a5f4'

  // Estilo base das bolhas.
  const bolhaRecebida: React.CSSProperties = {
    alignSelf: 'flex-start',
    maxWidth: '82%',
    background: '#fff',
    color: '#111',
    padding: '7px 10px 8px',
    borderRadius: '8px 8px 8px 2px',
    boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
    fontSize: 13.5,
    lineHeight: 1.38,
    margin: '1px 0',
    wordBreak: 'break-word',
  }
  const bolhaEnviada: React.CSSProperties = {
    ...bolhaRecebida,
    alignSelf: 'flex-end',
    background: '#dcf8c6',
    borderRadius: '8px 8px 2px 8px',
  }

  return (
    <div
      // Overlay do modal — cobre a tela inteira; clicar no fundo fecha.
      onClick={onFechar}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(16,28,46,0.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#f8fafc',
          borderRadius: 18,
          border: '1px solid #c5d5e8',
          boxShadow: '0 24px 60px rgba(16,28,46,0.4)',
          width: '100%',
          maxWidth: 460,
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── Cabeçalho do modal ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            padding: '12px 16px',
            background: '#1e4080',
            color: '#fff',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <strong style={{ fontSize: 15 }}>Comitê FAM • Votação remota</strong>
            <span style={{ fontSize: 11.5, color: '#cfe0ff' }}>
              Convites enviados aos diretores via WhatsApp
            </span>
          </div>
          {/* Selo deixa claro que é simulação. */}
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.3,
              color: '#9a5a10',
              background: '#fdf0d8',
              border: '1px solid #e8b84b',
              borderRadius: 999,
              padding: '4px 9px',
              whiteSpace: 'nowrap',
            }}
          >
            SIMULAÇÃO — nenhuma mensagem real é enviada
          </span>
        </div>

        {/* ── Corpo: lista de diretores + celular ── */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            padding: 16,
            overflowY: 'auto',
            justifyContent: 'center',
          }}
        >
          {/* Abas de diretores (quem tem telefone) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              minWidth: 180,
              flex: '1 1 180px',
              maxWidth: 240,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6080a0', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Diretores ({comTelefone.length})
            </span>
            {comTelefone.length === 0 && (
              <div style={{ fontSize: 12.5, color: '#6080a0', padding: '8px 4px' }}>
                Nenhum diretor com telefone cadastrado para receber o convite.
              </div>
            )}
            {comTelefone.map((m) => {
              const voto = votos.find((v) => v.usuario_id === m.id)
              const ativo = m.id === selecionadoId
              return (
                <button
                  key={m.id}
                  onClick={() => setSelecionadoId(m.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                    padding: '9px 11px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    border: ativo ? '1px solid #3070c8' : '1px solid #e0ecff',
                    background: ativo ? '#f0f6ff' : '#fff',
                    boxShadow: ativo ? '0 2px 8px rgba(48,112,200,0.18)' : 'none',
                  }}
                >
                  {/* Avatar com inicial */}
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: ativo ? '#3070c8' : '#d0e4f5',
                      color: ativo ? '#fff' : '#1e4080',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    {(m.nome || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1a2a3a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.nome}
                    </span>
                    <span style={{ fontSize: 11, color: '#6080a0' }}>
                      {m.cargo || 'Diretor(a)'}
                    </span>
                  </span>
                  {/* Indicador de voto */}
                  {voto ? (
                    <span title={VOTO_META[voto.voto].label} style={{ fontSize: 15 }}>
                      {VOTO_META[voto.voto].emoji}
                    </span>
                  ) : (
                    <span title="Aguardando voto" style={{ fontSize: 13, color: '#c5a020' }}>⏳</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* ── Mockup do celular ── */}
          <div
            style={{
              width: 320,
              flex: '0 0 auto',
              maxWidth: '100%',
              background: '#0a0a0a',
              borderRadius: 36,
              padding: 10,
              boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
              position: 'relative',
            }}
          >
            {/* Notch */}
            <div
              style={{
                position: 'absolute',
                top: 10,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 120,
                height: 20,
                background: '#0a0a0a',
                borderRadius: '0 0 14px 14px',
                zIndex: 10,
              }}
            />
            {/* Tela */}
            <div
              style={{
                borderRadius: 28,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                height: 540,
                fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif",
                background: fundoChat,
              }}
            >
              {/* Header verde do WhatsApp */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: verdeHeader,
                  color: '#fff',
                  padding: '10px 12px',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>&#8249;</span>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: '#128c7e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  🏛️
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Comitê FAM • Convites
                  </span>
                  <span style={{ fontSize: 11.5, opacity: 0.85 }}>
                    {selecionado ? `${selecionado.nome.split(/\s+/)[0]} • online` : 'online'}
                  </span>
                </div>
                <span style={{ fontSize: 18 }}>&#128247;</span>
                <span style={{ fontSize: 20 }}>&#8942;</span>
              </div>

              {/* Área do chat */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '12px 9px',
                  backgroundColor: fundoChat,
                  backgroundImage: padraoChat,
                  backgroundRepeat: 'repeat',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {!selecionado && (
                  <div
                    style={{
                      alignSelf: 'center',
                      marginTop: 24,
                      background: '#d9e6e3',
                      color: '#5b6b66',
                      borderRadius: 8,
                      padding: '6px 12px',
                      fontSize: 12,
                      textAlign: 'center',
                    }}
                  >
                    Selecione um diretor para abrir a conversa.
                  </div>
                )}

                {selecionado && (
                  <ChatDiretor
                    op={op}
                    subscritorNome={subscritorNome}
                    diretor={selecionado}
                    voto={votoDoSelecionado}
                    placar={placar}
                    analiseAberta={!!analiseAberta[selecionado.id]}
                    votarAberto={!!votarAberto[selecionado.id]}
                    bolhaRecebida={bolhaRecebida}
                    bolhaEnviada={bolhaEnviada}
                    azulBotao={azulBotao}
                    onAbrirAnalise={() =>
                      setAnaliseAberta((s) => ({ ...s, [selecionado.id]: true }))
                    }
                    onAbrirVotar={() =>
                      setVotarAberto((s) => ({ ...s, [selecionado.id]: true }))
                    }
                    onVotar={(voto) => onVotar(selecionado.id, voto, false)}
                    prazoTxt={prazoTxt}
                  />
                )}
              </div>

              {/* Barra de input (decorativa) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#f0f0f0',
                  padding: '8px 10px',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    background: '#fff',
                    borderRadius: 20,
                    padding: '8px 14px',
                    fontSize: 12.5,
                    color: '#9aa6ad',
                  }}
                >
                  Responda pelos botões acima…
                </div>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: verdeHeader,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  🎤
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Rodapé do modal: mini-placar + fechar ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            padding: '12px 16px',
            borderTop: '1px solid #e0ecff',
            background: '#f0f6ff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Pill cor={VOTO_META.aprovado.cor} bg={VOTO_META.aprovado.bg} emoji={VOTO_META.aprovado.emoji} n={placar.aprovado} />
            <Pill cor={VOTO_META.aprovado_ressalva.cor} bg={VOTO_META.aprovado_ressalva.bg} emoji={VOTO_META.aprovado_ressalva.emoji} n={placar.aprovado_ressalva} />
            <Pill cor={VOTO_META.reprovado.cor} bg={VOTO_META.reprovado.bg} emoji={VOTO_META.reprovado.emoji} n={placar.reprovado} />
            <span style={{ fontSize: 12, color: '#6080a0' }}>
              {placar.completo
                ? `Encerrado • ${placar.parecerFinal}`
                : `${placar.total}/${placar.totalMembros} votos • faltam ${placar.pendentes}`}
            </span>
          </div>
          <button
            onClick={onFechar}
            style={{
              background: '#1e4080',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '9px 20px',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// Pílula compacta do mini-placar (rodapé).
function Pill({ cor, bg, emoji, n }: { cor: string; bg: string; emoji: string; n: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: bg,
        color: cor,
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: 12.5,
        fontWeight: 700,
      }}
    >
      <span>{emoji}</span> {n}
    </span>
  )
}

// ── Conversa de um diretor específico ──
function ChatDiretor({
  op,
  subscritorNome,
  diretor,
  voto,
  placar,
  analiseAberta,
  votarAberto,
  bolhaRecebida,
  bolhaEnviada,
  azulBotao,
  onAbrirAnalise,
  onAbrirVotar,
  onVotar,
  prazoTxt,
}: {
  op: Operacao
  subscritorNome: string
  diretor: Usuario
  voto: ComiteVoto | undefined
  placar: ReturnType<typeof calcularPlacar>
  analiseAberta: boolean
  votarAberto: boolean
  bolhaRecebida: React.CSSProperties
  bolhaEnviada: React.CSSProperties
  azulBotao: string
  onAbrirAnalise: () => void
  onAbrirVotar: () => void
  onVotar: (voto: VotoComite) => void
  prazoTxt: (op: Operacao) => string
}) {
  const convite = montarConvite({ diretorNome: diretor.nome, subscritorNome, op })
  const jaVotou = !!voto

  // Linhas da "análise de crédito" expandida.
  const detalhes: Array<[string, string]> = [
    ['🏢 Tomador', op.tomador?.razao_social ?? '—'],
    ['🪪 CNPJ', op.tomador?.cnpj ? maskCNPJ(op.tomador.cnpj) : '—'],
    ['🏦 Corretora', op.corretora?.nome_fantasia ?? '—'],
    ['📋 Modalidade', op.modalidade ?? op.produto?.nome ?? '—'],
    ['🛡️ LMG', op.lmg ? fmtMoeda(op.lmg) : '—'],
    ['📈 Taxa', op.taxa ? fmtPercent(op.taxa / 100) : '—'],
    ['💰 Prêmio', op.premio_previsto ? fmtMoeda(op.premio_previsto) : '—'],
    ['⏳ Prazo', prazoTxt(op)],
  ]

  return (
    <>
      {/* Divisor de data */}
      <div
        style={{
          alignSelf: 'center',
          background: '#d9e6e3',
          color: '#5b6b66',
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 11.5,
          margin: '2px 0 6px',
        }}
      >
        HOJE
      </div>

      {/* Bolha recebida: convite */}
      <div style={bolhaRecebida}>
        <RenderWhatsApp texto={convite} />
        <div style={{ fontSize: 10.5, color: '#667781', textAlign: 'right', marginTop: 3 }}>09:41</div>
      </div>

      {/* Botões interativos: análise + votar (some quando já votou) */}
      {!jaVotou && (
        <div style={{ alignSelf: 'flex-start', maxWidth: '82%', width: '70%', margin: '2px 0' }}>
          {!analiseAberta && (
            <BotaoInterativo
              cor={azulBotao}
              label="📄 Ver análise de crédito"
              onClick={onAbrirAnalise}
              primeiro
            />
          )}
          {!votarAberto && (
            <BotaoInterativo
              cor={azulBotao}
              label="🗳️ Votar"
              onClick={onAbrirVotar}
              primeiro={analiseAberta}
              ultimo
            />
          )}
        </div>
      )}

      {/* Bolha com os detalhes da operação (após "Ver análise") */}
      {analiseAberta && (
        <div style={{ ...bolhaRecebida, width: '82%' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📄 Análise de crédito</div>
          {detalhes.map(([rotulo, valor]) => (
            <div key={rotulo} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '1px 0', fontSize: 13 }}>
              <span style={{ color: '#445' }}>{rotulo}</span>
              <span style={{ fontWeight: 600, textAlign: 'right' }}>{valor}</span>
            </div>
          ))}
          {op.parecer_subscricao && (
            <div style={{ marginTop: 6, fontStyle: 'italic', color: '#445', fontSize: 12.5 }}>
              🖋️ Parecer da Subscrição: “{op.parecer_subscricao}”
            </div>
          )}
          <div style={{ fontSize: 10.5, color: '#667781', textAlign: 'right', marginTop: 3 }}>09:42</div>
        </div>
      )}

      {/* Botões de voto (após "Votar") */}
      {!jaVotou && votarAberto && (
        <div style={{ alignSelf: 'flex-start', maxWidth: '82%', width: '78%', margin: '2px 0' }}>
          <div
            style={{
              background: '#fff',
              padding: '8px 10px 9px',
              borderRadius: '8px 8px 0 0',
              boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
              fontSize: 13.5,
            }}
          >
            Qual é o seu voto, <strong>{diretor.nome.split(/\s+/)[0]}</strong>?
          </div>
          {VOTOS_ORDENADOS.map((v, i) => {
            const meta = VOTO_META[v]
            const ultimo = i === VOTOS_ORDENADOS.length - 1
            return (
              <button
                key={v}
                onClick={() => onVotar(v)}
                style={{
                  width: '100%',
                  background: '#fff',
                  color: meta.cor,
                  border: 'none',
                  borderTop: '1px solid #e9edef',
                  padding: '11px 10px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  borderRadius: ultimo ? '0 0 8px 8px' : 0,
                  boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
                }}
              >
                <span>{meta.emoji}</span> {meta.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Já votou: bolha enviada com o voto + confirmação do bot (+ veredito) */}
      {jaVotou && voto && (
        <>
          <div style={bolhaEnviada}>
            <span style={{ fontWeight: 600, color: VOTO_META[voto.voto].cor }}>
              {VOTO_META[voto.voto].emoji} Meu voto: {VOTO_META[voto.voto].label}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 10.5,
                color: '#667781',
                float: 'right',
                marginLeft: 8,
                marginTop: 3,
              }}
            >
              09:43
              {/* Check duplo azul (lido) */}
              <svg viewBox="0 0 18 18" width="15" height="15">
                <path fill="#53bdeb" d="M17.4 5.3a.5.5 0 0 0-.7-.1l-6.9 8.4-2.1-2a.5.5 0 0 0-.7.7l2.5 2.4a.5.5 0 0 0 .73-.05l7.2-8.7a.5.5 0 0 0-.03-.65z" />
                <path fill="#53bdeb" d="M13.2 5.3a.5.5 0 0 0-.7-.1L5.9 13.4 3.9 11.5a.5.5 0 1 0-.7.7l2.4 2.3a.5.5 0 0 0 .72-.05l7.2-8.5a.5.5 0 0 0-.02-.65z" />
              </svg>
            </span>
          </div>

          {/* Confirmação + placar parcial do bot */}
          <div style={bolhaRecebida}>
            <RenderWhatsApp texto={montarConfirmacaoVoto(diretor.nome, voto.voto, placar)} />
            <div style={{ fontSize: 10.5, color: '#667781', textAlign: 'right', marginTop: 3 }}>09:43</div>
          </div>

          {/* Veredito final, se a bancada fechou */}
          {placar.completo && placar.parecerFinal && (
            <div style={bolhaRecebida}>
              <RenderWhatsApp texto={montarVeredito(diretor.nome, placar.parecerFinal)} />
              <div style={{ fontSize: 10.5, color: '#667781', textAlign: 'right', marginTop: 3 }}>09:44</div>
            </div>
          )}
        </>
      )}
    </>
  )
}

// Botão interativo (reply button) no rodapé de uma bolha.
function BotaoInterativo({
  cor,
  label,
  onClick,
  primeiro,
  ultimo,
}: {
  cor: string
  label: string
  onClick: () => void
  primeiro?: boolean
  ultimo?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        background: '#fff',
        color: cor,
        border: 'none',
        borderTop: primeiro ? 'none' : '1px solid #e9edef',
        padding: '11px 10px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: primeiro && ultimo ? 8 : primeiro ? '8px 8px 0 0' : ultimo ? '0 0 8px 8px' : 0,
        boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
      }}
    >
      {label}
    </button>
  )
}
