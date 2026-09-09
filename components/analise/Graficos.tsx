'use client'

// ============================================================================
//  OS GRÁFICOS DA GESTÃO E DA SALA  ·  barras horizontais e colunas, em CSS
//
//  Os mesmos desenhos do cockpit (`hbars` e `vcols` do sala.html): sem
//  biblioteca, porque são dez linhas e o cockpit também não usa nenhuma.
// ============================================================================

import { NOME_MES } from '@/lib/analise/retrato'

export function Barras({ itens, cor }: { itens: { rot: string; n: number; cor?: string }[]; cor?: string }) {
  const max = Math.max(1, ...itens.map(i => i.n))
  if (!itens.length) return <div className="an-vazio">Sem dado.</div>
  return (
    <div className="an-hbars">
      {itens.map(i => (
        <div key={i.rot} className="an-hb" title={`${i.rot}: ${i.n}`}>
          <span className="rot">{i.rot}</span>
          <span className="tr"><i style={{ width: `${Math.round((i.n / max) * 100)}%`, ['--cor' as string]: i.cor ?? cor ?? '#3070c8' }} /></span>
          <span className="n">{i.n}</span>
        </div>
      ))}
    </div>
  )
}

export function Colunas({ meses }: { meses: { mes: string; n: number; emCurso: boolean }[] }) {
  const max = Math.max(1, ...meses.map(m => m.n))
  return (
    <div className="an-vcols">
      {meses.map(m => (
        <div key={m.mes} className={`an-vcol${m.emCurso ? ' andamento' : ''}`} title={`${NOME_MES[Number(m.mes.slice(5, 7)) - 1]}/${m.mes.slice(2, 4)}: ${m.n} análise${m.n === 1 ? '' : 's'}${m.emCurso ? ', mês em andamento' : ''}`}>
          <span className="val">{m.n || ''}</span>
          <div className="bar" style={{ height: `${Math.max(3, Math.round((m.n / max) * 100))}%` }} />
          <span className="rot">{NOME_MES[Number(m.mes.slice(5, 7)) - 1]}</span>
        </div>
      ))}
    </div>
  )
}

export function Tile({ r, v, u, n, cor }: { r: string; v: React.ReactNode; u?: string; n?: React.ReactNode; cor?: 'ouro' | 'ok' }) {
  return (
    <div className="an-tile">
      <div className="r">{r}</div>
      <div className={`v${cor ? ' ' + cor : ''}`}>{v}{u ? <span className="u"> {u}</span> : null}</div>
      {n ? <div className="n">{n}</div> : null}
    </div>
  )
}
