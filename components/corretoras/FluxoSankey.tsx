'use client'

// ============================================================
//  Infográfico do fluxo Corretora → Tomadores → Status.
//  O "surpreendente": mostra o prêmio (R$) fluindo como um rio da
//  corretora para cada tomador e de cada tomador para o status das
//  operações. Recharts Sankey no desktop; fallback de árvore em telas
//  estreitas ou quando não há prêmio para desenhar (Sankey exige valores > 0).
// ============================================================
import { useEffect, useState } from 'react'
import { Sankey, Tooltip, ResponsiveContainer, Layer } from 'recharts'
import { fmtMoedaCurta, fmtMoeda } from '@/lib/utils'
import {
  montarFluxoSankey, rankingTomadores, distribuicaoPorStatus,
  type OpAgg, type TomAgg,
} from '@/lib/corretoras/agregacoes'
import type { StatusFluxo } from '@/types'

const COR_POR_PROFUNDIDADE = ['#1e4080', '#3070c8', '#16a34a']

// Shape dos props que o recharts injeta em cada nó do Sankey (parcial).
interface NoSankeyIncoming {
  x: number; y: number; width: number; height: number
  index: number; payload: { name: string; depth?: number; value: number }
}

// Nó customizado do Sankey: retângulo colorido por coluna + rótulo com o valor.
function NoSankey(props: NoSankeyIncoming & { maxDepth: number; containerWidth: number }) {
  const { x, y, width, height, payload, maxDepth, containerWidth } = props
  const depth = payload.depth ?? 0
  const cor = COR_POR_PROFUNDIDADE[Math.min(depth, COR_POR_PROFUNDIDADE.length - 1)]
  const ehUltima = depth >= maxDepth
  // Rótulo à direita nas colunas iniciais, à esquerda na última (status).
  const labelX = ehUltima ? x - 6 : x + width + 6
  const anchor = ehUltima ? 'end' : 'start'
  const label = `${payload.name}`
  const valor = fmtMoedaCurta(payload.value)
  return (
    <Layer>
      <rect x={x} y={y} width={width} height={height} fill={cor} rx={2} fillOpacity={0.92} />
      <text x={labelX} y={y + height / 2 - 5} textAnchor={anchor} fontSize={11} fontWeight={600} fill="#102040">
        {label.length > 22 ? label.slice(0, 21) + '…' : label}
      </text>
      <text x={labelX} y={y + height / 2 + 9} textAnchor={anchor} fontSize={10} fill="#6080a0">
        {valor}
      </text>
      {/* área extra p/ evitar corte do texto perto das bordas do container */}
      {ehUltima && labelX < 0 && <title>{label}</title>}
      {!ehUltima && labelX > containerWidth && <title>{label}</title>}
    </Layer>
  )
}

interface Props {
  corretoraNome: string
  tomadores: TomAgg[]
  operacoes: OpAgg[]
  statusFluxo: Pick<StatusFluxo, 'nome' | 'cor'>[]
}

export default function FluxoSankey({ corretoraNome, tomadores, operacoes, statusFluxo }: Props) {
  const [mounted, setMounted] = useState(false)
  const [estreito, setEstreito] = useState(false)

  useEffect(() => {
    setMounted(true)
    const mq = window.matchMedia('(max-width: 768px)')
    const upd = () => setEstreito(mq.matches)
    upd()
    mq.addEventListener('change', upd)
    return () => mq.removeEventListener('change', upd)
  }, [])

  const dados = montarFluxoSankey(corretoraNome, tomadores, operacoes)
  const maxDepth = 2 // corretora(0) → tomador(1) → status(2)

  // ── Fallback de árvore (mobile ou sem dados p/ o Sankey) ──
  if (!dados || estreito) {
    const rank = rankingTomadores(tomadores, operacoes).filter((t) => t.nOperacoes > 0)
    if (rank.length === 0) {
      return <div style={{ textAlign: 'center', color: '#a0b8d0', padding: '32px 0', fontSize: 13 }}>Sem operações para exibir o fluxo.</div>
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rank.map((t) => {
          const ops = operacoes.filter((o) => o.tomador_id === t.id)
          const porStatus = distribuicaoPorStatus(ops, statusFluxo)
          return (
            <div key={t.id} style={{ border: '1.5px solid #e0ecf8', borderRadius: 10, padding: '12px 14px', background: '#f7fafd' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, color: '#102040', fontSize: 14 }}>{t.nome}</span>
                <span style={{ fontWeight: 700, color: '#16a34a', fontSize: 13 }}>{fmtMoeda(t.premioTotal)}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {porStatus.map((s) => (
                  <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#304060', background: 'white', border: '1px solid #e0ecf8', borderRadius: 20, padding: '3px 9px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.cor }} />
                    {s.name} · {s.value}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (!mounted) {
    return <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0b8d0', fontSize: 13 }}>Carregando fluxo…</div>
  }

  const altura = Math.max(320, dados.nodes.length * 26)
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <Sankey
        data={dados}
        nodePadding={26}
        nodeWidth={12}
        margin={{ left: 8, right: 8, top: 12, bottom: 12 }}
        link={{ stroke: '#8acaf8', strokeOpacity: 0.35 }}
        node={(nodeProps) => {
          const p = nodeProps as unknown as NoSankeyIncoming
          return <NoSankey {...p} maxDepth={maxDepth} containerWidth={900} />
        }}
      >
        <Tooltip formatter={(v) => [fmtMoeda(Number(v) || 0), 'Prêmio']} />
      </Sankey>
    </ResponsiveContainer>
  )
}
