'use client'

/* ============================================================================
   O AVISO QUE APARECE SOZINHO — canto inferior direito do CRM

   Ordem do Marco, 30/08/2026: "quando eu iniciar uma análise de crédito, uma
   mensagem deve ser informada dentro do CRM. Mensagem temporária, que aparece
   do lado direito embaixo, fica apenas 2 segundos. Algo como: Análise da
   empresa [] iniciou, acompanhe o andamento por aqui, aí libera a opção para a
   pessoa visualizar."

   ── as quatro escolhas, e o porquê de cada uma ──────────────────────────────

   1. VAI PARA TODO MUNDO, não só para ele. É o ponto do pedido: a equipe vê o
      trabalho acontecer. Chega por Realtime, que obedece à mesma RLS — ler o
      aviso é liberado para todo autenticado, escrever é só do analista.

   2. NÃO SÃO 2 SEGUNDOS, e é de propósito. Um aviso que só informa some em 2s
      e está certo. Este aqui tem um BOTÃO, e 2 segundos é menos do que o tempo
      de ler, decidir e clicar: o aviso morreria antes da mão chegar, e a
      "opção para visualizar" viraria enfeite. Fica `MS_VISIVEL` (7s), pausa
      com o mouse em cima e some no ×. Para voltar a 2s, é trocar a constante.

   3. SÓ O QUE CHEGAR DE AGORA EM DIANTE. Nada de buscar o histórico ao abrir:
      senão, a cada troca de tela, reapareceriam avisos velhos como se fossem
      novidade. Aviso atrasado é pior que aviso nenhum, porque mente sobre o
      "agora".

   4. O BOTÃO LEVA A LUGARES DIFERENTES. Para o analista, a tela do sistema de
      análise. Para quem acompanha, a Conferência — que é a tela que funciona
      na máquina DELE. Mandar a equipe para a tela de análise seria mandá-la
      para o quadro de erro: o motor é local (127.0.0.1) e só responde na
      máquina do Marco.
   ========================================================================= */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/** Quanto tempo o aviso fica. Ver a escolha 2 no cabeçalho. */
const MS_VISIVEL = 7000
/** Mais que isto empilhado vira parede; os mais novos entram por cima. */
const MAX_NA_TELA = 3

interface Aviso {
  id: string
  tipo: string
  empresa: string
  detalhe: string | null
}

const TOM: Record<string, { faixa: string; texto: string; verbo: string }> = {
  iniciou:  { faixa: '#2563eb', texto: '#1e3a8a', verbo: 'iniciou' },
  concluiu: { faixa: '#22a06b', texto: '#14532d', verbo: 'ficou pronta' },
  falhou:   { faixa: '#dc2626', texto: '#7f1d1d', verbo: 'parou com erro' },
}

export default function AvisosAoVivo({ editaAnalise }: { editaAnalise: boolean }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const router = useRouter()

  // O cliente e os relógios ficam em ref: recriar o cliente a cada render
  // derrubaria e reabriria o canal do Realtime sem parar.
  const supabase = useRef(createClient()).current
  const relogios = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const fechar = useCallback((id: string) => {
    const t = relogios.current.get(id)
    if (t) { clearTimeout(t); relogios.current.delete(id) }
    setAvisos(a => a.filter(x => x.id !== id))
  }, [])

  const contar = useCallback((id: string, ms: number) => {
    const antigo = relogios.current.get(id)
    if (antigo) clearTimeout(antigo)
    relogios.current.set(id, setTimeout(() => fechar(id), ms))
  }, [fechar])

  useEffect(() => {
    const canal = supabase
      .channel('avisos-analise')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'analise_eventos' },
        payload => {
          const n = payload.new as Aviso
          setAvisos(a => [...a, n].slice(-MAX_NA_TELA))
          contar(n.id, MS_VISIVEL)
        })
      .subscribe()

    return () => {
      relogios.current.forEach(clearTimeout)
      relogios.current.clear()
      supabase.removeChannel(canal)
    }
  }, [supabase, contar])

  if (!avisos.length) return null

  const destino = editaAnalise ? '/tomadores/analise-credito' : '/tomadores/conferencia'

  return (
    // `role=status` + `aria-live=polite` faz o leitor de tela anunciar o aviso
    // sem interromper o que a pessoa estiver fazendo.
    <div role="status" aria-live="polite" style={{
      position: 'fixed', right: 18, bottom: 18, zIndex: 9000,
      display: 'flex', flexDirection: 'column', gap: 10,
      maxWidth: 'min(360px, calc(100vw - 36px))', pointerEvents: 'none',
    }}>
      {avisos.map(a => {
        const t = TOM[a.tipo] ?? TOM.iniciou
        return (
          <div key={a.id}
            // Pausa enquanto o mouse está em cima: ninguém consegue clicar num
            // botão que está fugindo. Ao sair, o relógio recomeça.
            onMouseEnter={() => { const r = relogios.current.get(a.id); if (r) clearTimeout(r) }}
            onMouseLeave={() => contar(a.id, MS_VISIVEL)}
            style={{
              pointerEvents: 'auto',
              background: '#fff', borderRadius: 10,
              border: '1px solid var(--border, #d8e0ea)',
              borderLeft: `4px solid ${t.faixa}`,
              boxShadow: '0 8px 26px rgba(12,30,60,.16)',
              padding: '12px 14px',
              fontFamily: "'Calibri','Segoe UI',sans-serif",
              animation: 'famAvisoEntra .22s ease-out',
            }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: t.texto, lineHeight: 1.45 }}>
                  Análise da empresa{' '}
                  <strong style={{ color: '#0a1628' }}>{a.empresa}</strong> {t.verbo}.
                </div>
                {a.detalhe && (
                  <div style={{ fontSize: 12, color: 'var(--soft, #6b7c93)', marginTop: 2 }}>
                    {a.detalhe}
                  </div>
                )}
                <button type="button"
                  onClick={() => { fechar(a.id); router.push(destino) }}
                  style={{
                    marginTop: 8, padding: '5px 11px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${t.faixa}`, background: 'transparent',
                    color: t.faixa, fontSize: 12, fontWeight: 700,
                    fontFamily: 'inherit',
                  }}>
                  Acompanhe o andamento →
                </button>
              </div>
              <button type="button" onClick={() => fechar(a.id)} aria-label="Fechar aviso"
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: '#9aa8b8', fontSize: 17, lineHeight: 1, padding: 2,
                }}>×</button>
            </div>
          </div>
        )
      })}

      <style>{`
        @keyframes famAvisoEntra {
          from { opacity: 0; transform: translateY(8px) }
          to   { opacity: 1; transform: none }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes famAvisoEntra { from { opacity: 0 } to { opacity: 1 } }
        }
      `}</style>
    </div>
  )
}
