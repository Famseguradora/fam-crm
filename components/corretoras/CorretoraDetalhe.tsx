'use client'

// ============================================================
//  Detalhe da Corretora — painel direito da tela da corretora.
//  Mostra os NÚMEROS da corretora, as POSIÇÕES dela no ranking geral
//  (ex.: 3º em prêmio, 12º em tomadores), a CADEIA VERTICAL de tomadores e
//  operações, e exporta um PDF no padrão FAM. Carrega os dados ao abrir.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { fmtMoeda, fmtPercent, fmtData } from '@/lib/utils'
import {
  agregarPorCorretora, comPareto, comParticipacao, rankingTomadores, operacoesDoTomador,
  kpisDeOperacoes, taxaConversao, serieTemporal, filtrarPorPeriodo, rotuloMes,
  type OpAgg, type TomAgg, type CorretoraAgg, type Granularidade, type MetricaSerie,
} from '@/lib/corretoras/agregacoes'
import { gerarPdfCorretora } from '@/lib/corretoras/pdf'
import type { Corretora, StatusFluxo } from '@/types'

const NAVY = '#1e4080', NAVY_DK = '#102040', GOLD = '#e8b84b', GREEN = '#27a96c', INK = '#0a1628', SOFT = '#6080a0', BORDER = '#e0ecf8'

function brCurto(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e9) return 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' Bi'
  if (abs >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' Mi'
  if (abs >= 1e3) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' mil'
  return fmtMoeda(v)
}
function eixoBRL(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M'
  if (abs >= 1e3) return 'R$ ' + Math.round(v / 1e3) + 'k'
  return 'R$ ' + Math.round(v)
}
const segBtn = (ativo: boolean): React.CSSProperties => ({
  padding: '5px 12px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
  background: ativo ? NAVY : '#fff', color: ativo ? '#fff' : SOFT, fontFamily: "'Calibri','Segoe UI',sans-serif",
})

// Posição (1-based) de um id numa lista ordenada desc pela métrica. null se não achar.
function posicaoDe<T extends { id: string }>(lista: T[], id: string, val: (x: T) => number): number | null {
  const ord = [...lista].sort((a, b) => val(b) - val(a))
  const i = ord.findIndex((x) => x.id === id)
  return i >= 0 ? i + 1 : null
}

export default function CorretoraDetalhe({ corretora }: { corretora: Corretora }) {
  const [carregando, setCarregando] = useState(true)
  const [corretoras, setCorretoras] = useState<Corretora[]>([])
  const [tomadores, setTomadores] = useState<TomAgg[]>([])
  const [operacoes, setOperacoes] = useState<OpAgg[]>([])
  const [statusFluxo, setStatusFluxo] = useState<Pick<StatusFluxo, 'nome' | 'cor'>[]>([])
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const [exportando, setExportando] = useState(false)
  const [preview, setPreview] = useState<{ url: string; filename: string } | null>(null)
  const [gran, setGran] = useState<Granularidade>('mensal')
  const [metricaSerie, setMetricaSerie] = useState<MetricaSerie>('premio')
  const [mesFoco, setMesFoco] = useState<string | null>(null) // mês YYYY-MM em drill-down semanal
  const capturaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCarregando(true)
      const supabase = createClient()
      const [{ data: cor }, { data: tom }, { data: ops }, { data: sf }] = await Promise.all([
        supabase.from('corretoras').select('id, razao_social, nome_fantasia, status'),
        supabase.from('tomadores').select('id, razao_social, nome_fantasia, corretora_id, status'),
        supabase.from('operacoes').select('id, tomador_id, corretora_id, lmg, taxa, vigencia_anos, vigencia_dias, periodicidade_vigencia, premio_previsto, status, data_entrada, data_emissao, modalidade, estado').eq('ativo', true),
        supabase.from('status_fluxo_operacao').select('nome, cor'),
      ])
      if (!vivo) return
      setCorretoras((cor ?? []) as Corretora[])
      setTomadores((tom ?? []) as TomAgg[])
      setOperacoes((ops ?? []) as OpAgg[])
      setStatusFluxo((sf ?? []) as Pick<StatusFluxo, 'nome' | 'cor'>[])
      setCarregando(false)
    })()
    return () => { vivo = false }
  }, [corretora.id])

  useEffect(() => {
    const u = preview?.url
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [preview?.url])

  const rankGlobal = useMemo<CorretoraAgg[]>(
    () => comPareto(agregarPorCorretora(
      corretoras.map((c) => ({ id: c.id, razao_social: c.razao_social, nome_fantasia: c.nome_fantasia, status: c.status })),
      tomadores, operacoes,
    )),
    [corretoras, tomadores, operacoes],
  )
  const emitPorCor = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of operacoes) {
      if (!o.corretora_id) continue
      if ((o.status || '').toLowerCase().includes('emiti')) m.set(o.corretora_id, (m.get(o.corretora_id) ?? 0) + (Number(o.premio_previsto) || 0))
    }
    return m
  }, [operacoes])

  const total = rankGlobal.length
  const posPremio = posicaoDe(rankGlobal, corretora.id, (r) => r.premioTotal)
  const posTom = posicaoDe(rankGlobal, corretora.id, (r) => r.nTomadores)
  const posOp = posicaoDe(rankGlobal, corretora.id, (r) => r.nOperacoes)
  const listaEmit = useMemo(() => corretoras.map((c) => ({ id: c.id, v: emitPorCor.get(c.id) ?? 0 })), [corretoras, emitPorCor])
  const posEmit = posicaoDe(listaEmit, corretora.id, (x) => x.v)

  const opsCor = useMemo(() => operacoes.filter((o) => o.corretora_id === corretora.id), [operacoes, corretora.id])
  const tomsCor = useMemo(() => tomadores.filter((t) => t.corretora_id === corretora.id), [tomadores, corretora.id])
  const kpis = useMemo(() => kpisDeOperacoes(opsCor), [opsCor])
  const conv = useMemo(() => taxaConversao(opsCor), [opsCor])
  const premioEmit = emitPorCor.get(corretora.id) ?? 0
  const rankTom = useMemo(() => comParticipacao(rankingTomadores(tomsCor, opsCor)), [tomsCor, opsCor])
  const maxTom = useMemo(() => Math.max(1, ...rankTom.map((t) => t.premioTotal)), [rankTom])
  // Em drill-down (semanal + mês focado) a série usa só as operações do mês clicado.
  const serie = useMemo(() => {
    const base = gran === 'semanal' && mesFoco ? filtrarPorPeriodo(opsCor, mesFoco, mesFoco) : opsCor
    return serieTemporal(base, gran, metricaSerie)
  }, [opsCor, gran, metricaSerie, mesFoco])
  const corStatus = useMemo(() => new Map(statusFluxo.map((s) => [s.nome, s.cor])), [statusFluxo])

  const toggle = (id: string) => setAbertas((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // Clicar na barra de um mês abre automaticamente as semanas daquele mês.
  function aoClicarBarra(_: unknown, index: number) {
    if (gran !== 'mensal') return
    const ponto = serie[index]
    if (!ponto) return
    setMesFoco(ponto.chave)
    setGran('semanal')
  }

  async function exportarPdf() {
    setExportando(true)
    try {
      let chart: { dataUrl: string; w: number; h: number } | null = null
      try {
        const { toPng } = await import('html-to-image')
        if (capturaRef.current) {
          const dataUrl = await toPng(capturaRef.current, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
          chart = { dataUrl, w: capturaRef.current.clientWidth || 600, h: capturaRef.current.clientHeight || 300 }
        }
      } catch { /* segue sem imagem */ }
      const { url, filename } = await gerarPdfCorretora({
        corretoraNome: corretora.nome_fantasia || corretora.razao_social,
        kpis: { premioTotal: kpis.premioTotal, lmgTotal: kpis.lmgTotal, nOperacoes: kpis.nOperacoes, nTomadores: tomsCor.length, ticketMedio: kpis.ticketMedio, taxaMediaPond: kpis.taxaMediaPond },
        tomadores: rankTom.map((t) => ({ nome: t.nome, nOperacoes: t.nOperacoes, premioTotal: t.premioTotal, lmgTotal: t.lmgTotal, participacaoPct: t.participacaoPct ?? 0 })),
        periodoLabel: 'Todos os períodos', chart,
      })
      setPreview({ url, filename })
    } catch (err) {
      console.error('PDF corretora (detalhe):', err)
    } finally {
      setExportando(false)
    }
  }

  if (carregando) return <div style={{ padding: 40, textAlign: 'center', color: SOFT }}>Carregando números da corretora…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: NAVY_DK, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 5, height: 18, borderRadius: 3, background: GOLD }} />📊 Números & Cadeia da Corretora
        </div>
        <button className="btn-export" onClick={exportarPdf} disabled={exportando}>📄 Exportar PDF</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          <Mini label="Prêmio Previsto" valor={brCurto(kpis.premioTotal)} destaque />
          <Mini label="Prêmio Emitido" valor={brCurto(premioEmit)} cor={GREEN} />
          <Mini label="LMG (exposição)" valor={brCurto(kpis.lmgTotal)} />
          <Mini label="Operações" valor={String(kpis.nOperacoes)} />
          <Mini label="Tomadores" valor={String(tomsCor.length)} />
          <Mini label="Taxa Média Pond." valor={fmtPercent(kpis.taxaMediaPond / 100)} />
          <Mini label="Conversão" valor={fmtPercent(conv)} />
          <Mini label="Ticket Médio" valor={brCurto(kpis.ticketMedio)} />
        </div>

        {/* Posições no ranking */}
        <div style={{ background: '#f7fafd', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>
            Posição no ranking · entre {total} corretora(s)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <PosBadge label="Prêmio previsto" pos={posPremio} total={total} />
            <PosBadge label="Prêmio emitido" pos={posEmit} total={total} />
            <PosBadge label="Cadastro de tomadores" pos={posTom} total={total} />
            <PosBadge label="Nº de operações" pos={posOp} total={total} />
          </div>
        </div>

        {/* Gráfico: prêmio / LMG por período (mensal ou semanal) */}
        <div ref={capturaRef} style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                {metricaSerie === 'premio' ? 'Prêmio' : 'LMG'} por {gran === 'mensal' ? 'mês' : 'semana'}
                {gran === 'semanal' && mesFoco ? ` de ${rotuloMes(mesFoco)}` : ''}
              </div>
              {gran === 'semanal' && mesFoco && (
                <button onClick={() => { setGran('mensal'); setMesFoco(null) }}
                  style={{ padding: '3px 9px', fontSize: 11, fontWeight: 700, border: `1px solid ${BORDER}`, borderRadius: 7, background: '#fff', color: NAVY, cursor: 'pointer', fontFamily: "'Calibri','Segoe UI',sans-serif" }}>
                  ← Voltar aos meses
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
                <button onClick={() => setMetricaSerie('premio')} style={segBtn(metricaSerie === 'premio')}>Prêmio</button>
                <button onClick={() => setMetricaSerie('lmg')} style={segBtn(metricaSerie === 'lmg')}>LMG</button>
              </div>
              <div style={{ display: 'flex', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
                <button onClick={() => { setGran('mensal'); setMesFoco(null) }} style={segBtn(gran === 'mensal')}>Mensal</button>
                <button onClick={() => { setGran('semanal'); setMesFoco(null) }} style={segBtn(gran === 'semanal')}>Semanal</button>
              </div>
            </div>
          </div>
          {gran === 'mensal' && serie.length > 0 && (
            <div style={{ fontSize: 10.5, color: '#a0b8d0', marginBottom: 4 }}>Dica: clique na barra de um mês para ver as semanas.</div>
          )}
          {serie.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#a0b8d0', padding: '28px 0', fontSize: 13 }}>Sem histórico com datas.</div>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={serie} margin={{ left: 4, right: 8, top: 8, bottom: 8 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#304060' }} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v) => eixoBRL(Number(v))} tick={{ fontSize: 10.5, fill: '#304060' }} width={58} />
                <Tooltip formatter={(v) => [fmtMoeda(Number(v)), metricaSerie === 'premio' ? 'Prêmio' : 'LMG']} />
                <Bar dataKey="valor" fill={NAVY} radius={[4, 4, 0, 0]} isAnimationActive={false}
                  onClick={aoClicarBarra} style={{ cursor: gran === 'mensal' ? 'pointer' : 'default' }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Cadeia: tomadores → operações */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>
            Cadeia vertical · tomadores e operações ({rankTom.length})
          </div>
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
            {rankTom.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#a0b8d0', fontSize: 13 }}>Sem tomadores/operações cadastrados.</div>
            ) : rankTom.map((t) => {
              const aberta = abertas.has(t.id)
              const opsTom = operacoesDoTomador(opsCor, t.id)
              return (
                <div key={t.id} style={{ borderBottom: '1px solid #f0f4f9' }}>
                  <div onClick={opsTom.length ? () => toggle(t.id) : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: opsTom.length ? 'pointer' : 'default', background: '#fff' }}>
                    <span style={{ width: 14, textAlign: 'center', color: SOFT, fontSize: 11 }}>{opsTom.length ? (aberta ? '▼' : '▶') : ''}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: INK, fontSize: 13.5 }}>{t.nome}</div>
                      <div style={{ fontSize: 11.5, color: SOFT }}>{t.nOperacoes} operação(ões) · LMG {brCurto(t.lmgTotal)}</div>
                    </div>
                    <div style={{ width: 130, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 8, background: '#eef4fa', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{ width: `${(t.premioTotal / maxTom) * 100}%`, height: '100%', background: NAVY, borderRadius: 5 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: SOFT, minWidth: 40, textAlign: 'right' }}>{fmtPercent(t.participacaoPct ?? 0)}</span>
                    </div>
                    <span style={{ width: 96, textAlign: 'right', fontWeight: 800, color: INK, fontSize: 13 }}>{brCurto(t.premioTotal)}</span>
                  </div>
                  {aberta && (
                    <div style={{ background: '#fafcff' }}>
                      {[...opsTom].sort((a, b) => (Number(b.premio_previsto) || 0) - (Number(a.premio_previsto) || 0)).map((o) => {
                        const cor = corStatus.get(o.status) ?? '#94a3b8'
                        const data = o.data_emissao || o.data_entrada
                        return (
                          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px 7px 40px', borderTop: '1px dashed #eef2f7', fontSize: 12 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, color: cor, whiteSpace: 'nowrap' }}>{o.status || 'Sem status'}</span>
                            <span style={{ flex: 1, minWidth: 0, color: SOFT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {(o.modalidade || 'Operação')}{o.estado ? ` · ${o.estado}` : ''} · Taxa {fmtPercent((Number(o.taxa) || 0) / 100)}{data ? ` · ${fmtData(data)}` : ''}
                            </span>
                            <span style={{ color: SOFT, whiteSpace: 'nowrap' }}>LMG {brCurto(Number(o.lmg) || 0)}</span>
                            <span style={{ fontWeight: 700, color: INK, minWidth: 96, textAlign: 'right' }}>{fmtMoeda(Number(o.premio_previsto) || 0)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Pré-visualização do PDF */}
      {preview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,14,26,.72)', zIndex: 10000, display: 'flex', flexDirection: 'column', padding: '2vh 2vw' }} onClick={() => setPreview(null)}>
          <div style={{ background: '#0a1628', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', color: '#fff', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 6, height: 20, borderRadius: 4, background: GOLD }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>FAM SEGURADORA · Pré-visualização do Relatório</div>
                  <div style={{ fontSize: 11.5, color: '#a9c4e8' }}>{preview.filename}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={preview.url} download={preview.filename} className="btn-primary" style={{ textDecoration: 'none' }}>⬇ Baixar PDF</a>
                <button className="btn-secondary" style={{ background: 'transparent', color: '#fff', borderColor: '#3a5a86' }} onClick={() => setPreview(null)}>✕ Fechar</button>
              </div>
            </div>
            <iframe src={preview.url} title="Pré-visualização do PDF" style={{ flex: 1, width: '100%', border: 'none', background: '#525659' }} />
          </div>
        </div>
      )}
    </div>
  )
}

function Mini({ label, valor, destaque = false, cor }: { label: string; valor: string; destaque?: boolean; cor?: string }) {
  return (
    <div style={{
      background: destaque ? `linear-gradient(135deg, ${NAVY_DK}, ${NAVY})` : '#fff',
      color: destaque ? '#fff' : INK, border: `1px solid ${destaque ? 'transparent' : BORDER}`,
      borderRadius: 12, padding: '10px 12px',
      boxShadow: destaque ? '0 6px 16px rgba(16,32,64,.26)' : '0 4px 12px rgba(16,32,64,.10)',
    }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: destaque ? '#a9c4e8' : SOFT }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: destaque ? GOLD : (cor || INK), marginTop: 2 }}>{valor}</div>
    </div>
  )
}

function PosBadge({ label, pos, total }: { label: string; pos: number | null; total: number }) {
  const medalha = pos != null && pos <= 3
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 12px' }}>
      <span style={{
        fontSize: 17, fontWeight: 900, minWidth: 44, textAlign: 'center',
        color: medalha ? GOLD : NAVY,
      }}>{pos != null ? `${pos}º` : '·'}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: 10.5, color: SOFT }}>de {total} corretoras</div>
      </div>
    </div>
  )
}
