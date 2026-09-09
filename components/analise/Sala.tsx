'use client'

// ============================================================================
//  A SALA DE COMANDO  ·  o painel executivo, com a esteira ao vivo
//
//  Porte do sala.html do cockpit, na versão executiva aprovada em 30/08/2026:
//  5 KPIs em cima, "Analisando agora" como UMA linha (o anel correndo contra a
//  meta de 5 minutos, a etapa, a última notícia, as vagas), e 2 cartões por
//  linha embaixo (entregas por mês, decisões do comitê, nível de risco,
//  setores, corretoras).
//
//  A execução ao vivo vem de `analise_estado` (o retrato do notebook) e de
//  `analise_fila` (a linha em andamento). O relógio anda no navegador entre
//  uma resposta e outra do banco, como no cockpit.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ETAPAS, nomeDaEtapa } from '@/lib/analise/esteira'
import { retratoDoAcervo, reaisMi, COLUNAS_RETRATO, type LinhaRetrato, type Retrato } from '@/lib/analise/retrato'
import { type EstadoEsteira, nomeDaFicha, type FilaRica } from '@/lib/analise/mesa'
import { Barras, Colunas } from './Graficos'

const fmt1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const fmtSeg = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const META = 300

export default function Sala({ aoAbrirMesa }: { aoAbrirMesa?: () => void }) {
  const [g, setG] = useState<Retrato | null>(null)
  const [estado, setEstado] = useState<EstadoEsteira | null>(null)
  const [estadoEm, setEstadoEm] = useState<string | null>(null)
  const [rodando, setRodando] = useState<FilaRica[]>([])
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    let vivo = true
    const supabase = createClient()
    const ler = async () => {
      const [a, e, f] = await Promise.all([
        supabase.from('analises').select(COLUNAS_RETRATO).limit(2000),
        supabase.from('analise_estado').select('dados, atualizado_em').eq('id', 'esteira').maybeSingle(),
        supabase.from('analise_fila').select('id, pasta, nome, razao_social, etapa, etapa_texto, etapa_em, trava_em, trava_maquina').eq('situacao', 'em_andamento'),
      ])
      if (!vivo) return
      setG(retratoDoAcervo((a.data ?? []) as unknown as LinhaRetrato[]))
      setEstado((e.data?.dados as EstadoEsteira | undefined) ?? null)
      setEstadoEm(e.data?.atualizado_em ?? null)
      setRodando((f.data ?? []) as unknown as FilaRica[])
    }
    ler()
    const t = setInterval(ler, 15000)
    const relogio = setInterval(() => setAgora(Date.now()), 1000)
    return () => { vivo = false; clearInterval(t); clearInterval(relogio) }
  }, [])

  const execucoes = useMemo(() => {
    const base = estado?.execucao?.execucoes ?? []
    const desde = estadoEm ? new Date(estadoEm).getTime() : agora
    if (base.length) return base.map(x => ({ ...x, segundos: Math.max(0, (x.segundosDesde ?? 0) + Math.round((agora - desde) / 1000)) }))
    return rodando.map(f => ({
      pasta: f.pasta, razao: nomeDaFicha(f), etapa: f.etapa ?? 'fila', etapaTxt: f.etapa_texto ?? nomeDaEtapa(f.etapa),
      idxAtual: Math.max(0, ETAPAS.findIndex(([id]) => id === f.etapa)), mensagem: f.etapa_texto ?? '',
      segundos: f.trava_em ? Math.max(0, Math.round((agora - new Date(f.trava_em).getTime()) / 1000)) : 0, travado: false,
    }))
  }, [estado, estadoEm, rodando, agora])

  const max = estado?.execucao?.max ?? 3
  const vagas = Math.max(0, max - execucoes.length)

  return (
    <div>
      {g && (
        <div className="an-tiles" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))' }}>
          <div className="an-tile"><div className="r">Análises no acervo</div><div className="v">{g.total}</div>
            <div className="n">{g.revisadas} revisadas por você{g.versoesAnteriores ? ` · ${g.empresas} empresas, ${g.versoesAnteriores} são versões anteriores` : ''}</div></div>
          <div className="an-tile"><div className="r">Aprovação</div><div className="v ouro">{fmt1(g.aprovacao.totalPct)}%</div>
            <div className="n"><span style={{ color: '#1a7a50' }}>{g.aprovacao.limpo} limpas</span> + {g.aprovacao.comRessalva} com ressalvas</div></div>
          <div className="an-tile"><div className="r">Na fila da sua revisão</div><div className="v">{g.naFila}</div>
            <div className="n">análises vigentes que ainda não passaram pela sua mão</div></div>
          <div className="an-tile"><div className="r">Limite mediano</div><div className="v">{reaisMi(g.limite.mediana)}</div>
            <div className="n">nas análises com limite efetivo</div></div>
          <div className="an-tile"><div className="r">Corretoras ativas</div><div className="v">{g.corretoras.quantas}</div>
            <div className="n">top 5 concentram {fmt1(g.corretoras.top5Pct)}%</div></div>
        </div>
      )}

      {/* ── analisando agora ── */}
      <div className="an-cartao" style={{ marginBottom: 12 }}>
        <h2>Analisando agora</h2>
        {execucoes.length === 0 ? (
          <div className="an-vagas" style={{ marginTop: 8 }}>
            {Array.from({ length: vagas }).map((_, i) => <span key={i} className="an-vaga" />)}
            <span>{vagas} vaga{vagas === 1 ? '' : 's'} livre{vagas === 1 ? '' : 's'} · nenhuma análise rodando</span>
            {aoAbrirMesa && <button type="button" className="an-bt mini" onClick={aoAbrirMesa}>Abrir a Mesa para iniciar</button>}
          </div>
        ) : (
          <>
            <div className="nota">{execucoes.length} análise{execucoes.length === 1 ? '' : 's'} rodando · {vagas} vaga{vagas === 1 ? '' : 's'} livre{vagas === 1 ? '' : 's'}. O anel corre contra a meta de 5:00.</div>
            {execucoes.map(x => (
              <div key={x.pasta} className="an-vivo" style={{ marginBottom: 12 }}>
                <div className="an-anel" style={{ ['--arco' as string]: `${Math.min(360, Math.round((x.segundos / META) * 360))}deg` }} role="img" aria-label={`${fmtSeg(x.segundos)} no relógio`}>
                  <div className="miolo"><div className="tmais">T+{fmtSeg(x.segundos)}</div><div className="de">meta 5:00</div></div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.7px', color: '#1e4080', textTransform: 'uppercase' }}>{x.etapaTxt || x.etapa}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0a1628' }}>{x.razao} <small style={{ color: '#6080a0', fontWeight: 500 }}>· pasta {x.pasta}</small></div>
                  <div className="an-tele">
                    <div><span className="r">Etapa</span><b>{x.idxAtual + 1}<span className="u">/{ETAPAS.length - 1}</span></b><div className="u">{nomeDaEtapa(x.etapa) || x.etapa}</div></div>
                    <div><span className="r">Última notícia</span><b>{x.mensagem ? '' : 'começando'}</b><div className="u">{(x.mensagem || '').slice(0, 70)}</div></div>
                    <div><span className="r">Vagas</span><b>{vagas}</b><div className="u">livres na esteira</div></div>
                  </div>
                  {x.travado && <div className="an-aviso aviso" style={{ marginBottom: 0 }}><span>⚠</span><span>Esta etapa está parada há mais tempo que o normal. O vigia do notebook decide se derruba.</span></div>}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {g && (
        <div className="an-grade" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
          <div className="an-cartao"><h2>Entregas por mês</h2><div className="nota">Pela data da análise.</div><Colunas meses={g.porMes} /></div>
          <div className="an-cartao"><h2>Decisões do comitê</h2><div className="nota">A ressalva separada da aprovação limpa.</div><Barras itens={g.decisao} /></div>
          <div className="an-cartao"><h2>Nível de risco</h2><div className="nota">Na vigente de cada empresa.</div><Barras itens={g.nivel} cor="#9878d0" /></div>
          <div className="an-cartao"><h2>Setores</h2><div className="nota">Os oito com mais análises.</div><Barras itens={g.setor} cor="#3fae82" /></div>
          <div className="an-cartao"><h2>Corretoras que mais trazem caso</h2><div className="nota">{g.corretoras.quantas} ativas · as 5 maiores concentram {fmt1(g.corretoras.top5Pct)}%.</div><Barras itens={g.corretoras.top.map(c => ({ rot: c.nome, n: c.n }))} cor="#e8b84b" /></div>
        </div>
      )}
    </div>
  )
}
