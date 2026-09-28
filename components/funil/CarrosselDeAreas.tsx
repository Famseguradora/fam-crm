'use client'

// ============================================================================
//  O CARROSSEL DAS ÁREAS  ·  o olhar padrão do Funil (28/09/2026)
//
//  Pedido dele, com a prévia /preview-torre de referência: "eu seleciono as
//  áreas e vejo os cards de cada área; mantemos o Kanban e incluímos esse
//  modelo". O Funil passou a mostrar as ÁREAS de forma geral, e a Mesa da
//  Análise ficou com quem está na esteira.
//
//  Em cima, as cinco áreas da régua do card (lib/card/secoes.ts, REGUA) em
//  leque 3D: a do meio é a escolhida, as vizinhas recuam e giram. Embaixo, as
//  EMPRESAS que estão naquela área, cada uma com as operações dela
//  (modalidade, etapa do funil de operações, LMG), que é o que o Kanban já
//  mostrava por operação.
//
//  Nada aqui decide onde a empresa está: quem decide é `etapaDoCard`, a mesma
//  regra do card da Análise e da tela do tomador. Esta peça só desenha.
// ============================================================================

import { useEffect, useState } from 'react'
import { cor, raio, sombra, texto } from '@/lib/ui/painel'
import { fmtMoeda } from '@/lib/utils'
import { REGUA, nomeArea, type PostoCentral } from '@/lib/card/secoes'
/* Os três mundos das operações não se somam, e o LMG é capado em 80 mi: a regra
   é a de lib/ia/regras-operacao.ts, a mesma da tela de Operações e do robô. */
import { lmgFam, mundoDa } from '@/lib/ia/regras-operacao'

export interface OperacaoNoCarrossel {
  id: string
  modalidade: string | null
  status: string | null
  lmg: number
  /** premio_previsto da operação */
  premio: number
}

export interface EmpresaNoCarrossel {
  id: string
  nome: string
  ops: OperacaoNoCarrossel[]
  /** o que trava, pela mesma régua do cartão do Funil (resumoDoCard) */
  trava: string | null
  paralisado: boolean
}

/** O que cada área faz, em uma linha. É o subtítulo do cartão grande. */
const PAPEL: Record<PostoCentral, string> = {
  comercial: 'Recebe e qualifica o pedido',
  cadastro: 'Confere cadastro e documentos',
  credito: 'Analisa capacidade e risco',
  subscricao: 'Estrutura condições e decisão',
  juridico: 'Revisa contratos e garantias',
  emissao: 'Emite a apólice',
}

/** O LMG que ainda pode entrar: só o mundo funil, capado. */
const lmgNoFunil = (ops: OperacaoNoCarrossel[]) =>
  ops.reduce((s, o) => s + (mundoDa(o.status) === 'funil' ? lmgFam(o) : 0), 0)

/** O LMG já emitido: só o mundo emitida, capado. */
const lmgEmitido = (ops: OperacaoNoCarrossel[]) =>
  ops.reduce((s, o) => s + (mundoDa(o.status) === 'emitida' ? lmgFam(o) : 0), 0)

/** O prêmio de um mundo só: o previsto do funil, ou o das apólices emitidas. */
const premioDe = (ops: OperacaoNoCarrossel[], mundo: 'funil' | 'emitida') =>
  ops.reduce((s, o) => s + (mundoDa(o.status) === mundo ? o.premio : 0), 0)

export default function CarrosselDeAreas({ porArea, emitido, responsaveis, corDaEtapa, aoAbrir }: {
  porArea: Record<string, EmpresaNoCarrossel[]>
  /** o realizado: as apólices emitidas e o prêmio delas (o mesmo número do KPI do Funil) */
  emitido: { apolices: number; premio: number }
  responsaveis: Record<string, string[]>
  corDaEtapa: (status: string | null) => string
  aoAbrir: (tomadorId: string) => void
}) {
  /* Abre na área que tem mais empresas vivas: é onde o trabalho está. A
     Emissão não conta: a lista dela é o realizado, não trabalho andando. */
  const [atual, setAtual] = useState(() => {
    let melhor = 0
    REGUA.forEach((p, i) => { if (p !== 'emissao' && (porArea[p]?.length ?? 0) > (porArea[REGUA[melhor]]?.length ?? 0)) melhor = i })
    return melhor
  })
  const [estreito, setEstreito] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const ver = () => setEstreito(mq.matches)
    ver()
    mq.addEventListener('change', ver)
    return () => mq.removeEventListener('change', ver)
  }, [])

  const n = REGUA.length
  const ir = (i: number) => setAtual(((i % n) + n) % n)
  const posto = REGUA[atual]
  const empresas = porArea[posto] ?? []
  const passo = estreito ? 120 : 235

  return (
    <div>
      {/* ── o leque das áreas ── */}
      <div
        tabIndex={0}
        aria-label="Áreas do funil. Use as setas do teclado para trocar."
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); ir(atual - 1) }
          if (e.key === 'ArrowRight') { e.preventDefault(); ir(atual + 1) }
        }}
        style={{
          background: cor.papel, border: `1px solid ${cor.borda}`, borderRadius: raio.janela,
          minHeight: estreito ? 290 : 340, padding: '16px 12px', overflow: 'hidden', position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 1100, outline: 'none',
        }}>
        <Seta lado="anterior" rotulo={nomeArea(REGUA[(atual - 1 + n) % n])} aoClicar={() => ir(atual - 1)} />
        <Seta lado="proxima" rotulo={nomeArea(REGUA[(atual + 1) % n])} aoClicar={() => ir(atual + 1)} />

        <div style={{ position: 'relative', width: 'min(940px, 86vw)', height: estreito ? 250 : 300, transformStyle: 'preserve-3d' }}>
          {REGUA.map((p, i) => {
            let delta = i - atual
            if (delta > n / 2) delta -= n
            if (delta < -n / 2) delta += n
            const foco = delta === 0
            const distancia = Math.abs(delta)
            const visivel = distancia <= 2
            const lista = porArea[p] ?? []
            const lmg = lista.reduce((s, e) => s + lmgNoFunil(e.ops), 0)
            const premio = lista.reduce((s, e) => s + premioDe(e.ops, 'funil'), 0)
            const gente = responsaveis[p] ?? []
            return (
              <button key={p} type="button" onClick={() => setAtual(i)}
                aria-pressed={foco}
                aria-label={`${nomeArea(p)}: ${lista.length} ${lista.length === 1 ? 'empresa' : 'empresas'}`}
                style={{
                  position: 'absolute', left: '50%', top: '50%',
                  width: foco ? (estreito ? 230 : 330) : (estreito ? 180 : 250),
                  minHeight: foco ? (estreito ? 210 : 250) : (estreito ? 170 : 205),
                  padding: foco ? 22 : 17, textAlign: 'left', cursor: 'pointer', font: 'inherit',
                  background: cor.papel, color: cor.texto, borderRadius: raio.cartao,
                  border: `1px solid ${foco ? cor.bordaAtiva : cor.borda}`,
                  borderTop: `4px solid ${foco ? cor.acao : cor.borda}`,
                  boxShadow: foco ? sombra.janela : sombra.cartao,
                  opacity: visivel ? (foco ? 1 : distancia === 1 ? .78 : .38) : 0,
                  pointerEvents: visivel ? 'auto' : 'none',
                  transform: `translate(-50%, -50%) translateX(${delta * passo}px) translateZ(${-distancia * 150}px) rotateY(${delta * -18}deg) scale(${foco ? 1 : .9})`,
                  transition: 'transform .42s ease, opacity .35s ease, width .35s ease, min-height .35s ease, box-shadow .35s ease',
                  zIndex: 10 - distancia,
                }}>
                <span style={{ ...texto.nota, color: foco ? cor.acao : cor.textoFraco }}>Área {i + 1} de {n}</span>
                <h2 style={{ ...texto.numero, fontSize: foco ? 25 : 19, margin: '8px 0 4px' }}>{nomeArea(p)}</h2>
                <div style={{ ...texto.titulo, color: cor.acao, minHeight: 17 }}>
                  {gente.length ? gente.slice(0, 3).join(', ') + (gente.length > 3 ? ` +${gente.length - 3}` : '') : 'sem responsável marcado'}
                </div>
                <p style={{ ...texto.corpo, margin: '12px 0' }}>{PAPEL[p]}</p>
                {/* A EMISSÃO É O REALIZADO: apólices e prêmio emitido, o mesmo
                    número do KPI do Funil. As outras áreas mostram o funil, e o
                    prêmio previsto só quando existe. */}
                <div style={{ borderTop: `1px solid ${cor.bordaSuave}`, paddingTop: 11 }}>
                  {p === 'emissao' ? (
                    <>
                      <div style={texto.rotulo}>{emitido.apolices} {emitido.apolices === 1 ? 'apólice emitida' : 'apólices emitidas'} · Prêmio emitido</div>
                      <strong style={{ fontSize: foco ? 16 : 13, color: foco ? cor.ouroTexto : cor.textoSub, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtMoeda(emitido.premio)}
                      </strong>
                    </>
                  ) : (
                    <>
                      <div style={texto.rotulo}>{lista.length} {lista.length === 1 ? 'empresa' : 'empresas'} · LMG no funil</div>
                      <strong style={{ fontSize: foco ? 16 : 13, color: foco ? cor.areaOperacao : cor.textoSub, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtMoeda(lmg)}
                      </strong>
                      {premio > 0 && (
                        <div style={{ ...texto.apoio, marginTop: 3 }}>
                          Prêmio previsto <b style={{ color: cor.ouroTexto, fontVariantNumeric: 'tabular-nums' }}>{fmtMoeda(premio)}</b>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── as empresas da área escolhida ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '18px 2px 10px', flexWrap: 'wrap' }}>
        <span style={{ ...texto.titulo, fontSize: 15 }}>{nomeArea(posto)}</span>
        <span style={texto.apoio}>
          {empresas.length} {empresas.length === 1 ? 'empresa' : 'empresas'} nesta área · clique para abrir o card
        </span>
      </div>

      {empresas.length === 0 ? (
        <div style={{ ...texto.apoio, padding: '14px 4px' }}>
          {posto === 'emissao' ? 'Nenhuma empresa com apólice emitida nos filtros de agora.' : 'Nenhuma empresa com operação está nesta área agora.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 10 }}>
          {empresas.map(emp => {
            const noFunil = emp.ops.filter(o => mundoDa(o.status) === 'funil').length
            const emitidas = emp.ops.filter(o => mundoDa(o.status) === 'emitida').length
            const lmg = lmgNoFunil(emp.ops)
            const premio = premioDe(emp.ops, 'funil')
            const premioEmitido = premioDe(emp.ops, 'emitida')
            return (
              <button key={emp.id} type="button" onClick={() => aoAbrir(emp.id)}
                style={{
                  textAlign: 'left', font: 'inherit', cursor: 'pointer',
                  background: cor.papel, border: `1px solid ${cor.borda}`,
                  borderLeft: `4px solid ${emp.paralisado ? cor.alerta : emp.trava ? cor.ouro : cor.areaOperacao}`,
                  borderRadius: raio.cartao, padding: '11px 13px', boxShadow: sombra.cartao,
                }}>
                <div style={{ ...texto.titulo, lineHeight: 1.3 }}>{emp.nome}</div>
                <div style={{ ...texto.apoio, marginTop: 2 }}>
                  {posto === 'emissao' ? (
                    // Na Emissão a manchete é o realizado; o funil vem depois, se houver.
                    <>
                      {emitidas} {emitidas === 1 ? 'emitida' : 'emitidas'} · <b style={{ color: cor.texto }}>{fmtMoeda(lmgEmitido(emp.ops))}</b>
                      {noFunil > 0 && <> · {noFunil} no funil</>}
                    </>
                  ) : (
                    <>
                      {noFunil} no funil · <b style={{ color: cor.texto }}>{fmtMoeda(lmg)}</b>
                      {emitidas > 0 && <> · {emitidas} {emitidas === 1 ? 'emitida' : 'emitidas'}</>}
                    </>
                  )}
                </div>
                {(premio > 0 || premioEmitido > 0) && (
                  <div style={{ ...texto.apoio, marginTop: 2 }}>
                    {premio > 0 && <>Prêmio previsto <b style={{ color: cor.ouroTexto }}>{fmtMoeda(premio)}</b></>}
                    {premio > 0 && premioEmitido > 0 && ' · '}
                    {premioEmitido > 0 && <>Prêmio emitido <b style={{ color: cor.ouroTexto }}>{fmtMoeda(premioEmitido)}</b></>}
                  </div>
                )}

                {/* As modalidades, com a etapa de cada uma no funil de operações. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 9 }}>
                  {emp.ops.slice(0, 4).map(o => (
                    <div key={o.id} style={{
                      display: 'flex', alignItems: 'center', gap: 7, fontSize: 12,
                      opacity: mundoDa(o.status) === 'encerrada' ? .6 : 1,
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', flex: 'none', background: corDaEtapa(o.status) }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: cor.texto }}>
                        {o.modalidade || 'Modalidade não informada'}
                      </span>
                      <span style={{ color: cor.textoSub, whiteSpace: 'nowrap' }}>{o.status ?? 'sem etapa'}</span>
                    </div>
                  ))}
                  {emp.ops.length > 4 && <div style={texto.nota}>e mais {emp.ops.length - 4}</div>}
                </div>

                <div style={{ fontSize: 11.5, marginTop: 8, color: emp.paralisado ? cor.alerta : emp.trava ? cor.ouroTexto : cor.areaOperacao, fontWeight: emp.paralisado ? 700 : 400 }}>
                  {emp.paralisado ? `Paralisado: ${emp.trava}` : emp.trava ?? 'nada travando'}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Seta({ lado, rotulo, aoClicar }: { lado: 'anterior' | 'proxima'; rotulo: string; aoClicar: () => void }) {
  const antes = lado === 'anterior'
  return (
    <button type="button" onClick={aoClicar} aria-label={`Ver ${rotulo}`} title={`Ver ${rotulo}`}
      style={{
        position: 'absolute', [antes ? 'left' : 'right']: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 20,
        width: 40, height: 40, padding: 0, display: 'grid', placeItems: 'center', cursor: 'pointer',
        background: cor.papel, color: cor.acao, border: `1px solid ${cor.borda}`, borderRadius: raio.controle,
        boxShadow: sombra.cartao,
      }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {antes ? <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></> : <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>}
      </svg>
    </button>
  )
}
