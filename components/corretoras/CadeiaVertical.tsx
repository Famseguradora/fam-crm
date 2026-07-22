'use client'

// ============================================================
//  Cadeia Vertical das Corretoras — navegação top-down da cadeia
//  Corretora → Tomador → Operação, preservada de ponta a ponta.
//
//  Cada corretora expande e mostra seus tomadores; cada tomador expande
//  e mostra suas operações. KPIs (prêmio, taxa média ponderada, conversão),
//  barras de proporção (share no todo / dentro da corretora), selo 80/20 e
//  semáforo de tendência (▲/▼ mês a mês). Recebe os dados JÁ filtrados pelo
//  Painel (período/status/UF) e cuida só da navegação (busca/ordem/expandir).
// ============================================================
import { useMemo, useState } from 'react'
import { fmtMoeda, fmtPercent, fmtData } from '@/lib/utils'
import {
  agregarPorCorretora, comPareto, comParticipacao, rankingTomadores,
  operacoesDoTomador, kpisDeOperacoes, taxaConversao, deltaUltimoMes,
  type OpAgg, type TomAgg, type CorretoraAgg,
} from '@/lib/corretoras/agregacoes'
import type { Corretora, StatusFluxo } from '@/types'

const NAVY = '#1e4080', NAVY_DK = '#102040', GOLD = '#e8b84b', GREEN = '#27a96c', RED = '#d64545'
const INK = '#0a1628', SOFT = '#6080a0', BORDER = '#e0ecf8'

// Moeda compacta (não estoura a linha): R$ 4,2 Mi / R$ 233,3 mil.
function brCurto(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e9) return 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' Bi'
  if (abs >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' Mi'
  if (abs >= 1e3) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' mil'
  return fmtMoeda(v)
}

type Ordenacao = 'premio' | 'operacoes' | 'az'

interface Props {
  corretoras: Corretora[]
  tomadores: TomAgg[]
  operacoes: OpAgg[]
  statusFluxo: Pick<StatusFluxo, 'nome' | 'cor'>[]
  corPorId: Map<string, string>
  selCorretora: string | null
  onSelectCorretora: (id: string) => void
}

export default function CadeiaVertical({
  corretoras, tomadores, operacoes, statusFluxo, corPorId, selCorretora, onSelectCorretora,
}: Props) {
  const [busca, setBusca] = useState('')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('premio')
  const [abertasCor, setAbertasCor] = useState<Set<string>>(new Set())
  const [abertasTom, setAbertasTom] = useState<Set<string>>(new Set())

  const corStatus = useMemo(() => new Map(statusFluxo.map((s) => [s.nome, s.cor])), [statusFluxo])
  const corretoraById = useMemo(() => new Map(corretoras.map((c) => [c.id, c])), [corretoras])
  const tomadoresPorCor = useMemo(() => {
    const m = new Map<string, TomAgg[]>()
    for (const t of tomadores) {
      if (!t.corretora_id) continue
      const a = m.get(t.corretora_id) ?? []
      a.push(t)
      m.set(t.corretora_id, a)
    }
    return m
  }, [tomadores])

  // Ranking de corretoras (com participação no todo + acumulado p/ 80/20).
  const ranking = useMemo<CorretoraAgg[]>(() => comPareto(agregarPorCorretora(
    corretoras.map((c) => ({ id: c.id, razao_social: c.razao_social, nome_fantasia: c.nome_fantasia, status: c.status })),
    tomadores, operacoes,
  )), [corretoras, tomadores, operacoes])

  // Dados por corretora (ops, taxa média ponderada, conversão, tendência).
  const dadosPorCor = useMemo(() => {
    const opsPorCor = new Map<string, OpAgg[]>()
    for (const o of operacoes) {
      if (!o.corretora_id) continue
      const a = opsPorCor.get(o.corretora_id) ?? []
      a.push(o)
      opsPorCor.set(o.corretora_id, a)
    }
    const m = new Map<string, { ops: OpAgg[]; conv: number; delta: number | null; taxa: number }>()
    for (const r of ranking) {
      const ops = opsPorCor.get(r.id) ?? []
      m.set(r.id, {
        ops,
        conv: taxaConversao(ops),
        delta: deltaUltimoMes(ops).variacao,
        taxa: kpisDeOperacoes(ops).taxaMediaPond,
      })
    }
    return m
  }, [operacoes, ranking])

  // 80/20: ids até acumular 80% do prêmio (ranking já vem ordenado desc).
  const ids8020 = useMemo(() => {
    const s = new Set<string>()
    let ativo = true
    for (const r of ranking) {
      if (!ativo) break
      if (r.premioTotal <= 0) break
      s.add(r.id)
      if ((r.acumuladoPct ?? 0) >= 0.8) ativo = false
    }
    return s
  }, [ranking])

  // Busca (corretora por nome/CNPJ ou tomador por nome) + ordenação.
  const listagem = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = busca.replace(/\D/g, '')
    const casa = (r: CorretoraAgg): boolean => {
      if (!termo) return true
      const c = corretoraById.get(r.id)
      if (r.nome.toLowerCase().includes(termo)) return true
      if ((c?.razao_social ?? '').toLowerCase().includes(termo)) return true
      if (digitos.length > 0 && (c?.cnpj ?? '').replace(/\D/g, '').includes(digitos)) return true
      const toms = tomadoresPorCor.get(r.id) ?? []
      return toms.some((t) => (t.nome_fantasia || t.razao_social).toLowerCase().includes(termo))
    }
    const arr = ranking.filter(casa)
    if (ordenacao === 'premio') arr.sort((a, b) => b.premioTotal - a.premioTotal)
    else if (ordenacao === 'operacoes') arr.sort((a, b) => b.nOperacoes - a.nOperacoes)
    else arr.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
    return arr
  }, [ranking, busca, ordenacao, corretoraById, tomadoresPorCor])

  const maxPremio = useMemo(() => Math.max(1, ...listagem.map((r) => r.premioTotal)), [listagem])

  const toggleCor = (id: string) => setAbertasCor((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleTom = (id: string) => setAbertasTom((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  // Clicar numa corretora expande a cadeia E foca o cockpit (cross-filter).
  const abrirCorretora = (id: string) => { toggleCor(id); onSelectCorretora(id) }
  const expandirTudo = () => setAbertasCor(new Set(listagem.map((r) => r.id)))
  const recolherTudo = () => { setAbertasCor(new Set()); setAbertasTom(new Set()) }

  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, boxShadow: '0 2px 14px rgba(30,64,128,.06)' }}>
      {/* Cabeçalho do bloco */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: NAVY_DK, letterSpacing: '.3px', display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase' }}>
          <span style={{ width: 4, height: 15, borderRadius: 3, background: GOLD }} />
          Cadeia vertical · Corretora → Tomador → Operação
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="fam-input" placeholder="Buscar corretora ou tomador…" value={busca}
            onChange={(e) => setBusca(e.target.value)} style={{ height: 34, minWidth: 210, fontSize: 13 }} />
          <select className="fam-input" value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
            style={{ height: 34, fontSize: 13, width: 'auto' }}>
            <option value="premio">Ordenar: Prêmio</option>
            <option value="operacoes">Ordenar: Nº operações</option>
            <option value="az">Ordenar: A–Z</option>
          </select>
          <button className="btn-secondary" style={{ height: 34, padding: '0 12px' }} onClick={expandirTudo}>Expandir tudo</button>
          <button className="btn-clear" style={{ height: 34, padding: '0 12px' }} onClick={recolherTudo}>Recolher</button>
        </div>
      </div>

      {/* Cabeçalho de colunas (só desktop) */}
      <div className="cadeia-head" style={{
        padding: '0 8px 8px',
        fontSize: 10.5, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '.4px', borderBottom: `1px solid ${BORDER}`,
      }}>
        <div>Corretora / Tomador / Operação</div>
        <div style={{ textAlign: 'right' }}>Prêmio</div>
        <div>Participação</div>
        <div style={{ textAlign: 'right' }}>Tendência</div>
      </div>

      {/* Lista */}
      <div style={{ marginTop: 4, overflowX: 'auto' }}>
        {listagem.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#a0b8d0', padding: '40px 0', fontSize: 13 }}>
            Nenhuma corretora no escopo/busca atual.
          </div>
        ) : listagem.map((r) => {
          const cor = corPorId.get(r.id) ?? NAVY
          const aberta = abertasCor.has(r.id)
          const dados = dadosPorCor.get(r.id)
          const semMov = r.nOperacoes === 0
          const foco = selCorretora === r.id
          return (
            <div key={r.id} style={{ borderBottom: `1px solid #f0f4f9` }}>
              {/* ── Nível 1: Corretora ── */}
              <LinhaBase
                nivel={0} cor={cor} aberta={aberta} temFilhos={r.nTomadores > 0}
                onToggle={() => abrirCorretora(r.id)}
                destaque={foco}
                nome={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: INK }}>{r.nome}</span>
                    {!r.ativa && <span className="badge badge-gray">inativa</span>}
                    {ids8020.has(r.id) && <span className="badge badge-yellow" title="Concentra 80% do prêmio">80/20</span>}
                    {semMov && <span style={{ fontSize: 11, color: '#a0b8d0' }}>sem movimento no período</span>}
                  </span>
                }
                sub={
                  <span style={{ fontSize: 11.5, color: SOFT, display: 'inline-flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>{r.nTomadores} tomador(es)</span>
                    <span>{r.nOperacoes} operação(ões)</span>
                    <span>Taxa méd. {fmtPercent((dados?.taxa ?? 0) / 100)}</span>
                    <span>Conversão {fmtPercent(dados?.conv ?? 0)}</span>
                  </span>
                }
                premio={r.premioTotal}
                barra={{ valor: r.premioTotal, max: maxPremio, cor, pct: r.participacaoPct ?? 0 }}
                trend={dados?.delta ?? null}
              />

              {/* ── Nível 2: Tomadores ── */}
              {aberta && (
                <div style={{ background: '#fafcff' }}>
                  <TomadoresDaCorretora
                    corretoraPremio={r.premioTotal}
                    tomadores={tomadoresPorCor.get(r.id) ?? []}
                    ops={dados?.ops ?? []}
                    corStatus={corStatus}
                    abertasTom={abertasTom} onToggleTom={toggleTom}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <style>{`
        .cadeia-head, .cadeia-linha, .cadeia-op {
          display: grid;
          grid-template-columns: 1fr 150px 150px 96px;
          gap: 10px;
          align-items: center;
        }
        @media (max-width: 768px) {
          .cadeia-head { display: none !important; }
          /* Empilha: linha 1 = nome | prêmio, linha 2 = barra | tendência. */
          .cadeia-linha, .cadeia-op { grid-template-columns: 1fr auto; row-gap: 4px; }
          .cadeia-op { padding-left: 40px !important; }
        }
      `}</style>
    </div>
  )
}

// ── Nível 2: tomadores de uma corretora ──────────────────────────────────────
function TomadoresDaCorretora({
  corretoraPremio, tomadores, ops, corStatus, abertasTom, onToggleTom,
}: {
  corretoraPremio: number; tomadores: TomAgg[]; ops: OpAgg[]
  corStatus: Map<string, string>; abertasTom: Set<string>; onToggleTom: (id: string) => void
}) {
  const rank = useMemo(() => comParticipacao(rankingTomadores(tomadores, ops).map((t) => ({ ...t }))), [tomadores, ops])
  const maxTom = useMemo(() => Math.max(1, ...rank.map((t) => t.premioTotal)), [rank])

  if (rank.length === 0) {
    return <div style={{ padding: '10px 8px 12px 46px', fontSize: 12.5, color: '#a0b8d0' }}>Sem tomadores com operações no escopo.</div>
  }
  return (
    <>
      {rank.map((t) => {
        const aberta = abertasTom.has(t.id)
        const opsTom = operacoesDoTomador(ops, t.id)
        return (
          <div key={t.id}>
            <LinhaBase
              nivel={1} cor="#7d97bd" aberta={aberta} temFilhos={opsTom.length > 0}
              onToggle={() => onToggleTom(t.id)}
              nome={<span style={{ fontWeight: 700, color: '#233' }}>{t.nome}</span>}
              sub={<span style={{ fontSize: 11.5, color: SOFT }}>{t.nOperacoes} operação(ões) · LMG {brCurtoLocal(t.lmgTotal)}</span>}
              premio={t.premioTotal}
              barra={{ valor: t.premioTotal, max: maxTom, cor: '#7d97bd', pct: corretoraPremio > 0 ? t.premioTotal / corretoraPremio : 0 }}
              trend={null}
            />
            {aberta && (
              <div style={{ background: '#fff' }}>
                {opsTom.length === 0 ? (
                  <div style={{ padding: '8px 8px 10px 72px', fontSize: 12, color: '#a0b8d0' }}>Sem operações no escopo.</div>
                ) : [...opsTom].sort((a, b) => (Number(b.premio_previsto) || 0) - (Number(a.premio_previsto) || 0)).map((o) => (
                  <LinhaOperacao key={o.id} op={o} corStatus={corStatus} tomadorPremio={t.premioTotal} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ── Nível 3: operação (folha) ────────────────────────────────────────────────
function LinhaOperacao({ op, corStatus, tomadorPremio }: { op: OpAgg; corStatus: Map<string, string>; tomadorPremio: number }) {
  const cor = corStatus.get(op.status) ?? '#94a3b8'
  const premio = Number(op.premio_previsto) || 0
  const data = op.data_emissao || op.data_entrada
  const pct = tomadorPremio > 0 ? premio / tomadorPremio : 0
  return (
    <div style={{
      padding: '8px 8px 8px 72px', borderTop: '1px dashed #eef2f7', fontSize: 12.5,
    }} className="cadeia-op">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, color: cor, whiteSpace: 'nowrap' }}>{op.status || '—'}</span>
        <span style={{ color: SOFT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(op.modalidade || 'Operação')}{op.estado ? ` · ${op.estado}` : ''} · Taxa {fmtPercent((Number(op.taxa) || 0) / 100)}
          {data ? ` · ${fmtData(data)}` : ''}
        </span>
      </div>
      <div style={{ textAlign: 'right', fontWeight: 700, color: INK }}>{fmtMoeda(premio)}</div>
      <div><BarraProp valor={premio} max={tomadorPremio || premio || 1} cor={cor} pct={pct} /></div>
      <div style={{ textAlign: 'right', color: SOFT, fontSize: 11.5 }}>LMG {brCurtoLocal(Number(op.lmg) || 0)}</div>
    </div>
  )
}

// ── Linha genérica (corretora / tomador) ─────────────────────────────────────
function LinhaBase({
  nivel, cor, aberta, temFilhos, onToggle, nome, sub, premio, barra, trend, destaque = false,
}: {
  nivel: 0 | 1; cor: string; aberta: boolean; temFilhos: boolean; onToggle: () => void
  nome: React.ReactNode; sub: React.ReactNode; premio: number
  barra: { valor: number; max: number; cor: string; pct: number }; trend: number | null; destaque?: boolean
}) {
  const padLeft = nivel === 0 ? 8 : 40
  return (
    <div
      onClick={temFilhos ? onToggle : undefined}
      style={{
        padding: `10px 8px 10px ${padLeft}px`, cursor: temFilhos ? 'pointer' : 'default',
        background: destaque ? '#fff8e8' : undefined,
        boxShadow: destaque ? `inset 3px 0 0 ${GOLD}` : undefined,
      }}
      className="cadeia-linha"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <span style={{ width: 16, textAlign: 'center', color: SOFT, fontSize: 11, flexShrink: 0 }}>
          {temFilhos ? (aberta ? '▼' : '▶') : ''}
        </span>
        <span style={{ width: nivel === 0 ? 11 : 8, height: nivel === 0 ? 11 : 8, borderRadius: 3, background: cor, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{nome}</div>
          <div>{sub}</div>
        </div>
      </div>
      <div style={{ textAlign: 'right', fontWeight: 800, color: INK }}>{brCurtoLocal(premio)}</div>
      <div><BarraProp valor={barra.valor} max={barra.max} cor={barra.cor} pct={barra.pct} /></div>
      <div style={{ textAlign: 'right' }}><Semaforo variacao={trend} /></div>
    </div>
  )
}

// ── Barra de proporção (o "gráfico" em linha) ────────────────────────────────
function BarraProp({ valor, max, cor, pct }: { valor: number; max: number; cor: string; pct: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: '#eef4fa', borderRadius: 5, overflow: 'hidden', minWidth: 40 }}>
        <div style={{ width: `${Math.min(100, (valor / (max || 1)) * 100)}%`, height: '100%', background: cor, borderRadius: 5 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: SOFT, minWidth: 42, textAlign: 'right' }}>{fmtPercent(pct)}</span>
    </div>
  )
}

// ── Semáforo de tendência ▲/▼ ────────────────────────────────────────────────
function Semaforo({ variacao }: { variacao: number | null }) {
  if (variacao == null || !isFinite(variacao)) return <span style={{ color: '#c0ccda', fontSize: 12 }}>—</span>
  const pos = variacao >= 0
  return (
    <span style={{ fontSize: 12, fontWeight: 800, color: pos ? GREEN : RED, whiteSpace: 'nowrap' }}>
      {pos ? '▲' : '▼'} {fmtPercent(Math.abs(variacao))}
    </span>
  )
}

// Moeda compacta reusável (mesma regra do topo, acessível aos subcomponentes).
function brCurtoLocal(v: number): string {
  return brCurto(v)
}
