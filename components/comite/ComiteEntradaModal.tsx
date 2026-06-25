'use client'

// ============================================================================
//  Modal de ENTRADA no Comitê (SOMENTE no simulador)
//  Disparado quando uma operação muda para o status "Comitê" — SEM bloquear:
//  o status já mudou; este modal é apenas o "nudge" inicial.
//    • Se quem moveu é SUBSCRITOR → "Deseja registrar seu voto agora?" (ele
//      costuma votar primeiro, mas pode votar depois).
//    • Se NÃO é subscritor → lembrete aos subscritores de que há operação nova
//      para votar.
//  Puramente presentacional: tudo entra/sai por props, sem IO.
// ============================================================================

import { fmtMoeda } from '@/lib/utils'
import type { Operacao } from '@/types'

interface Props {
  op: Operacao
  ehSubscritor: boolean
  subscritores: { nome: string; cargo: string | null }[]
  onVotarAgora: () => void
  onVotarDepois: () => void
  onClose: () => void
}

export default function ComiteEntradaModal({ op, ehSubscritor, subscritores, onVotarAgora, onVotarDepois, onClose }: Props) {
  const tomador = op.tomador?.razao_social ?? 'Tomador não informado'
  const modalidade = op.modalidade ?? op.produto?.nome ?? '—'
  const premio = fmtMoeda(op.premio_previsto)

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(16,32,64,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 18px 50px rgba(16,32,64,0.3)', overflow: 'hidden' }}
      >
        {/* Cabeçalho roxo (identidade do Comitê) */}
        <div style={{ background: '#f3ecff', borderBottom: '1px solid #e2d4f7', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#7a3ad0' }}>
            {ehSubscritor ? '⚖️ Operação em Comitê' : '📋 Operação enviada ao Comitê'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
        </div>

        <div style={{ padding: '18px 20px' }}>
          {/* Mini-resumo da operação */}
          <div style={{ background: '#f8fafc', border: '1px solid #e0ecff', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1a2a3a' }}>
            <div style={{ fontWeight: 700 }}>{tomador}</div>
            <div style={{ color: '#6080a0', marginTop: 2 }}>{modalidade} · Prêmio {premio}</div>
          </div>

          {ehSubscritor ? (
            <>
              <p style={{ fontSize: 15, color: '#1a2a3a', lineHeight: 1.55, margin: '0 0 6px' }}>
                Como <strong>subscritor</strong>, seu voto costuma ser o <strong>primeiro</strong> do julgamento.
              </p>
              <p style={{ fontSize: 14, color: '#6080a0', lineHeight: 1.5, margin: '0 0 20px' }}>
                Mas isso não trava o fluxo — você pode registrar agora ou votar depois, quando quiser.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  onClick={onVotarDepois}
                  style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #c5d5e8', background: '#fff', color: '#1e4080', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                >
                  Não, voto depois
                </button>
                <button
                  onClick={onVotarAgora}
                  style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#a855f7', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
                >
                  ✍️ Sim, registrar meu voto
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 15, color: '#1a2a3a', lineHeight: 1.55, margin: '0 0 12px' }}>
                A operação entrou em Comitê. Enviamos um <strong>lembrete aos subscritores</strong> para registrarem o voto:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                {subscritores.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#a02020', background: '#fbeaea', borderRadius: 8, padding: '8px 12px' }}>
                    Nenhum subscritor cadastrado. Defina o cargo de um usuário com &quot;Subscrição&quot; na tela de Usuários.
                  </div>
                ) : (
                  subscritores.map((s, i) => (
                    <div key={`${s.nome}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1a2a3a', background: '#f0f6ff', borderRadius: 8, padding: '8px 12px' }}>
                      <span>🔔</span>
                      <strong>{s.nome}</strong>
                      {s.cargo && <span style={{ color: '#6080a0' }}>· {s.cargo}</span>}
                    </div>
                  ))
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  onClick={onClose}
                  style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #c5d5e8', background: '#fff', color: '#1e4080', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                >
                  Entendi
                </button>
                <button
                  onClick={onVotarAgora}
                  style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#a855f7', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
                >
                  ⚖️ Abrir Deliberação
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
