'use client'

/* ============================================================================
   O CHÃO DE FÁBRICA — os funcionários virtuais trabalhando, ao vivo

   Ordem do Marco, 31/08/2026: "Precisa ativar os agentes (equipe) ... eu
   preciso ver os agentes trabalhando, mostre na tela como se fosse avatar."

   O que existia antes, e por que não bastava: o organograma do motor sabia
   dizer quem EXISTE (o arquivo do agente está no disco) e quem já FALOU
   (quantos recados deixou no mural). Nunca quem está trabalhando AGORA. Esta
   tela come de outra fonte: a `agente_eventos`, onde cada funcionário anuncia
   o que começou e o que terminou.

   ── quatro escolhas, e o porquê ─────────────────────────────────────────────

   1. O ESTADO É DERIVADO, NUNCA GUARDADO. Ninguém escreve "fulano está
      ocupado" numa coluna. O último evento de cada um manda, e o relógio
      desempata. Coluna de estado mente no dia em que o processo morre no meio,
      e um avatar aceso mentindo é pior que um avatar apagado.

   2. O RELÓGIO BATE SOZINHO. Um `setInterval` re-deriva a cada 5 s mesmo sem
      evento novo. Sem ele, o agente que morreu calado ficaria acesso para
      sempre: o Realtime só avisa o que ACONTECE, e "parar de acontecer" não é
      um evento.

   3. QUEM AINDA NÃO REPORTA APARECE ASSIM MESMO, apagado e marcado. Esconder
      os doze que ainda não emitem daria um organograma bonito e falso. Ele
      pediu para ver a empresa; a empresa tem gente quieta.

   4. O HISTÓRICO INICIAL É CARREGADO. Ao contrário do balão de aviso (que só
      mostra o que chega de agora em diante, de propósito), aqui a tela PRECISA
      abrir já sabendo quem está trabalhando: senão, quem entra no meio de uma
      análise vê um escritório vazio.
   ========================================================================= */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  QUADRO, SETORES, funcionarioPor, setorPor, estadoDosAgentes,
  type EventoAgente, type EstadoAgente,
} from '@/lib/analise/equipe'

/** De quanto em quanto tempo a tela reavalia quem ainda está aceso. */
const MS_TICK = 5000
/** Quantos movimentos ficam na coluna da direita. */
const MAX_FEED = 12

const FONTE = "'Calibri','Segoe UI',sans-serif"

function quandoRelativo(iso: string, agora: number): string {
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000))
  if (s < 60) return `há ${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60)
  return `há ${h}h`
}

export default function ChaoDeFabrica({ inicial }: { inicial: EventoAgente[] }) {
  const [eventos, setEventos] = useState<EventoAgente[]>(inicial)
  const [agora, setAgora] = useState(() => Date.now())
  const [aoVivo, setAoVivo] = useState(false)

  const supabase = useRef(createClient()).current

  // Ver a escolha 2 no cabeçalho: sem este relógio, agente que morre calado
  // fica aceso para sempre.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), MS_TICK)
    return () => clearInterval(t)
  }, [])

  const chegou = useCallback((n: EventoAgente) => {
    setEventos(a => [n, ...a].slice(0, 200))
    setAgora(Date.now())
  }, [])

  useEffect(() => {
    const canal = supabase
      .channel('chao-de-fabrica')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agente_eventos' },
        payload => chegou(payload.new as EventoAgente))
      .subscribe(status => setAoVivo(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(canal) }
  }, [supabase, chegou])

  const estados = useMemo(() => estadoDosAgentes(eventos, agora), [eventos, agora])

  // Funcionário que mandou sinal e não tem cadeira no quadro entra assim mesmo.
  const idsExtras = useMemo(
    () => Object.keys(estados).filter(id => !QUADRO.some(f => f.id === id)),
    [estados],
  )

  const trabalhando = Object.values(estados).filter(e => e.trabalhando).length

  const feed = eventos.slice(0, MAX_FEED)

  return (
    <div style={{ fontFamily: FONTE, color: 'var(--text, #0a1628)' }}>

      {/* ── cabeçalho ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        marginBottom: 18,
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          A Equipe, trabalhando
        </h1>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12.5, color: 'var(--soft, #6b7c93)',
          border: '1px solid var(--border, #d8e0ea)', borderRadius: 999,
          padding: '3px 10px',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: 999,
            background: aoVivo ? '#22a06b' : '#c2ccd8',
            boxShadow: aoVivo ? '0 0 0 3px rgba(34,160,107,.18)' : 'none',
          }} />
          {aoVivo ? 'ao vivo' : 'conectando'}
        </span>
        <span style={{ fontSize: 13, color: 'var(--soft, #6b7c93)' }}>
          {trabalhando > 0
            ? `${trabalhando} trabalhando agora`
            : 'ninguém trabalhando neste instante'}
        </span>
      </div>

      <div style={{
        display: 'grid', gap: 20,
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 300px)',
        alignItems: 'start',
      }} className="fam-chao-grid">

        {/* ── os setores, com as pessoas ─────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {SETORES.map(setor => {
            const pessoas = QUADRO.filter(f => f.setor === setor.id)
            const extras = idsExtras.map(funcionarioPor).filter(f => f.setor === setor.id)
            const todas = [...pessoas, ...extras]
            if (!todas.length) return null

            return (
              <section key={setor.id} style={{
                border: '1px solid var(--border, #d8e0ea)', borderRadius: 12,
                borderTop: `3px solid ${setor.cor}`,
                background: '#fff', padding: '14px 16px 16px',
              }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{setor.nome}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--soft, #6b7c93)' }}>{setor.conta}</div>
                </div>

                <div style={{
                  display: 'grid', gap: 12,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                }}>
                  {todas.map(f => (
                    <Avatar
                      key={f.id}
                      funcionario={f}
                      cor={setorPor(f.setor).cor}
                      estado={estados[f.id]}
                      agora={agora}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        {/* ── o que acabou de acontecer ──────────────────────────────────── */}
        <aside style={{
          border: '1px solid var(--border, #d8e0ea)', borderRadius: 12,
          background: '#fff', padding: '14px 16px', minWidth: 0,
        }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 2 }}>
            Últimos movimentos
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--soft, #6b7c93)', marginBottom: 12 }}>
            O que a casa fez, na ordem em que fez.
          </div>

          {!feed.length && (
            <div style={{ fontSize: 13, color: 'var(--soft, #6b7c93)', lineHeight: 1.5 }}>
              Nada ainda. Assim que uma triagem ou uma análise rodar na máquina
              do Marco, o movimento aparece aqui sozinho.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {feed.map(e => {
              const f = funcionarioPor(e.agente)
              const cor = setorPor(f.setor).cor
              return (
                <div key={e.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span style={{
                    flexShrink: 0, width: 24, height: 24, borderRadius: 999,
                    background: cor, color: '#fff',
                    fontSize: 10, fontWeight: 700,
                    display: 'grid', placeItems: 'center', marginTop: 1,
                  }}>{f.sigla}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                      <strong>{f.nome}</strong>{' '}
                      <span style={{ color: 'var(--soft, #6b7c93)' }}>
                        {e.acao === 'terminou' ? 'entregou' : e.acao === 'falhou' ? 'parou' : '·'}
                      </span>{' '}
                      {e.tarefa}
                    </div>
                    {e.alvo && (
                      <div style={{
                        fontSize: 11.5, color: 'var(--soft, #6b7c93)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{e.alvo}</div>
                    )}
                    <div style={{ fontSize: 11, color: '#9aa8b8' }}>
                      {quandoRelativo(e.criado_em, agora)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
      </div>

      <style>{`
        @keyframes famPulso {
          0%   { box-shadow: 0 0 0 0 var(--pulso) }
          70%  { box-shadow: 0 0 0 10px transparent }
          100% { box-shadow: 0 0 0 0 transparent }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes famPulso { from { box-shadow: none } to { box-shadow: none } }
        }
        @media (max-width: 900px) {
          .fam-chao-grid { grid-template-columns: minmax(0, 1fr) !important }
        }
      `}</style>
    </div>
  )
}

function Avatar({
  funcionario: f, cor, estado, agora,
}: {
  funcionario: ReturnType<typeof funcionarioPor>
  cor: string
  estado?: EstadoAgente
  agora: number
}) {
  const trabalhando = !!estado?.trabalhando
  // Três estados visuais, e a diferença entre os dois últimos é o que impede a
  // tela de mentir: "quieto" é quem PODE falar e não está falando; "ainda não
  // reporta" é quem nem tem como falar.
  const mudo = !f.reporta && !estado

  return (
    <div
      title={f.faz}
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        padding: 10, borderRadius: 10,
        border: `1px solid ${trabalhando ? cor : 'var(--border, #d8e0ea)'}`,
        background: trabalhando ? `${cor}0f` : 'transparent',
        opacity: mudo ? 0.55 : 1,
        minWidth: 0,
      }}>
      <span
        style={{
          flexShrink: 0, width: 38, height: 38, borderRadius: 999,
          display: 'grid', placeItems: 'center',
          fontSize: 13, fontWeight: 700, letterSpacing: .3,
          background: trabalhando ? cor : '#eef2f7',
          color: trabalhando ? '#fff' : '#8a97a8',
          border: trabalhando ? 'none' : '1px solid var(--border, #d8e0ea)',
          // A variável alimenta o @keyframes lá em cima.
          ['--pulso' as string]: `${cor}66`,
          animation: trabalhando ? 'famPulso 1.8s ease-out infinite' : 'none',
        }}>
        {f.sigla}
      </span>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 }}>
          {f.nome}
          {f.humano && (
            <span style={{ fontSize: 10.5, color: 'var(--soft, #6b7c93)', fontWeight: 400 }}> · você</span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--soft, #6b7c93)' }}>
          {f.cargo}
          {!f.humano && (
            <span style={{ color: f.ia ? '#7c5cd0' : '#3fae82' }}>
              {' · '}{f.ia ? 'com IA' : 'sem IA'}
            </span>
          )}
        </div>

        {trabalhando && (
          <div style={{ marginTop: 5 }}>
            <div style={{ fontSize: 12.5, color: cor, fontWeight: 600, lineHeight: 1.35 }}>
              {estado?.tarefa}
            </div>
            {estado?.alvo && (
              <div style={{
                fontSize: 11.5, color: 'var(--soft, #6b7c93)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{estado.alvo}</div>
            )}
            {estado?.desde && (
              <div style={{ fontSize: 11, color: '#9aa8b8' }}>
                {quandoRelativo(estado.desde, agora)}
              </div>
            )}
          </div>
        )}

        {!trabalhando && estado && (
          <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--soft, #6b7c93)', lineHeight: 1.35 }}>
            Último: {estado.tarefa}
            {estado.desde && <> · {quandoRelativo(estado.desde, agora)}</>}
          </div>
        )}

        {mudo && (
          <div style={{ marginTop: 5, fontSize: 11, color: '#9aa8b8' }}>
            ainda não reporta
          </div>
        )}
      </div>
    </div>
  )
}
