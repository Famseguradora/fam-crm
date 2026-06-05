'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { analisarOperacoes, fmtBR, CAP_LMG } from '@/lib/financeiro/analise.mjs'

// Cores do tema FAM
const C = {
  critico: '#e05a5a',
  alerta: '#e8b84b',
  info: '#4a7ab5',
  ok: '#3fae6a',
  card: '#0d1e3a',
  border: '#1a3560',
  text: '#dce8f5',
  muted: '#7a9cc0',
}

interface Achado {
  id: string
  severidade: 'critico' | 'alerta' | 'info'
  regra: string
  mensagem: string
  valores?: Record<string, unknown>
}

interface Relatorio {
  resumo: {
    operacoesAnalisadas: number
    operacoesAcimaDoTeto: number
    criticos: number
    alertas: number
    infos: number
    impactoPremioInflado: number
    regra: string
  }
  achados: Achado[]
  totaisPorStatus: Record<string, { count: number; lmgLimitado: number; premioCanonico: number; premioArmazenado: number }>
}

const SEV_LABEL: Record<string, string> = { critico: 'CRÍTICO', alerta: 'ALERTA', info: 'INFO' }

export default function AnaliseFinanceiraPage() {
  const [rel, setRel] = useState<Relatorio | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [geradoEm, setGeradoEm] = useState<string>('')

  async function carregar() {
    setCarregando(true)
    setErro(null)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('operacoes')
        .select('id, lmg, taxa, vigencia_anos, periodicidade_vigencia, premio_previsto, status, ativo')
      if (error) throw error
      const r = analisarOperacoes(data ?? []) as unknown as Relatorio
      setRel(r)
      setGeradoEm(new Date().toLocaleString('pt-BR'))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const achadosOrdenados = useMemo(() => {
    if (!rel) return []
    const ordem: Record<string, number> = { critico: 0, alerta: 1, info: 2 }
    return [...rel.achados].sort((a, b) => ordem[a.severidade] - ordem[b.severidade])
  }, [rel])

  return (
    <div style={{ fontFamily: "'Calibri','Segoe UI',sans-serif", color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'white', margin: 0 }}>
          🔎 Agente de Análise Financeira
        </h1>
        <button
          onClick={carregar}
          disabled={carregando}
          style={{
            background: '#1e4080', border: '1px solid #2a5db0', color: 'white',
            padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: carregando ? 'wait' : 'pointer',
          }}
        >
          {carregando ? 'Analisando…' : '↻ Reanalisar agora'}
        </button>
      </div>
      <p style={{ color: C.muted, fontSize: 13, marginTop: 0 }}>
        Verificação automática de furos e erros financeiros. Regra FAM: LMG e prêmio limitados a
        {' '}R$ {fmtBR(CAP_LMG)} por operação. {geradoEm && <>Gerado em {geradoEm}.</>}
      </p>

      {erro && (
        <div style={{ background: '#3a1010', border: `1px solid ${C.critico}`, borderRadius: 8, padding: 16, color: '#ffd9d9' }}>
          Erro ao carregar: {erro}
        </div>
      )}

      {carregando && !rel && <div style={{ color: C.muted, padding: 20 }}>Carregando operações…</div>}

      {rel && (
        <>
          {/* ── Cards de resumo ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '16px 0' }}>
            <Card titulo="Operações" valor={String(rel.resumo.operacoesAnalisadas)} sub="ativas analisadas" cor={C.info} />
            <Card titulo="Acima do teto" valor={String(rel.resumo.operacoesAcimaDoTeto)} sub="LMG > 80M" cor={C.alerta} />
            <Card titulo="Críticos" valor={String(rel.resumo.criticos)} sub="exigem correção" cor={rel.resumo.criticos > 0 ? C.critico : C.ok} />
            <Card titulo="Alertas" valor={String(rel.resumo.alertas)} sub="revisar" cor={rel.resumo.alertas > 0 ? C.alerta : C.ok} />
            <Card titulo="Prêmio inflado" valor={`R$ ${fmtBR(rel.resumo.impactoPremioInflado)}`} sub="por LMG não limitado" cor={rel.resumo.impactoPremioInflado > 0 ? C.critico : C.ok} />
          </div>

          {/* ── Achados ── */}
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'white', margin: '20px 0 10px' }}>Achados</h2>
          {achadosOrdenados.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.ok}`, borderRadius: 8, padding: 18, color: C.ok, fontWeight: 600 }}>
              ✓ Nenhum furo encontrado. Tudo certo.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {achadosOrdenados.map((a, i) => (
                <div key={i} style={{
                  background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C[a.severidade]}`,
                  borderRadius: 8, padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{
                      background: C[a.severidade], color: '#0a1628', fontSize: 10, fontWeight: 800,
                      letterSpacing: '0.5px', padding: '2px 7px', borderRadius: 4,
                    }}>{SEV_LABEL[a.severidade]}</span>
                    <span style={{ color: C.muted, fontSize: 12, fontFamily: 'monospace' }}>{a.regra}</span>
                    <span style={{ color: '#52708f', fontSize: 11, fontFamily: 'monospace' }}>op {String(a.id).slice(0, 8)}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5 }}>{a.mensagem}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Totais por status ── */}
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'white', margin: '24px 0 10px' }}>Totais por status</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>Status</th>
                  <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>Ops</th>
                  <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>LMG (teto 80M)</th>
                  <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>Prêmio correto</th>
                  <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>Prêmio armazenado</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(rel.totaisPorStatus).map(([st, t]) => {
                  const divergente = Math.abs(t.premioCanonico - t.premioArmazenado) > 1
                  return (
                    <tr key={st}>
                      <td style={{ textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{st}</td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>{t.count}</td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>R$ {fmtBR(t.lmgLimitado)}</td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>R$ {fmtBR(t.premioCanonico)}</td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', borderBottom: `1px solid ${C.border}`, color: divergente ? C.critico : C.text, fontWeight: divergente ? 700 : 400 }}>
                        R$ {fmtBR(t.premioArmazenado)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p style={{ color: C.muted, fontSize: 12, marginTop: 10 }}>
            “Prêmio correto” aplica o teto de 80M. Valores em vermelho na coluna “armazenado” indicam divergência
            que será corrigida ao rodar a migração <code>supabase-migration-premio-cap.sql</code>.
          </p>
        </>
      )}
    </div>
  )
}

function Card({ titulo, valor, sub, cor }: { titulo: string; valor: string; sub: string; cor: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: `3px solid ${cor}`, borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>{titulo}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'white', margin: '4px 0 2px' }}>{valor}</div>
      <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
    </div>
  )
}
