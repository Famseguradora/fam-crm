'use client'

/* A ESTEIRA DA ANÁLISE DE CRÉDITO, dentro do CRM.

   Porte do Kanban de `_sistema/cockpit`, que sai do ar junto com o Sistema de
   Análise. O que ele fazia e continua fazendo: mostrar o que está na fila, o
   que está rodando, o que travou e por quê, e deixar mandar a esteira andar.

   O QUE MUDOU DE LUGAR:

   - o estado não vem mais de um arquivo no disco de uma máquina. Vem do
     Supabase, e por isso a esteira aparece para a equipe inteira, e não só para
     quem está sentado no notebook.
   - os botões não EXECUTAM: eles guardam uma ordem que o agente do notebook vem
     buscar. O CRM não fala com 127.0.0.1 nem com a máquina de ninguém, e essa
     regra não muda. O preço é levar alguns segundos, e a tela diz isso.

   A ORDEM DA LISTA É A DE QUEM OLHA, e não a da máquina: primeiro o que precisa
   de gente, depois o que está andando, e por último o que já está resolvido.
   Uma esteira ordenada pelo ciclo da máquina esconde justamente o que trava o
   dia. Ver `ORDEM_NA_TELA` em lib/analise/esteira.ts. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import {
  SITUACAO, ORDEM, ordensDe, pesoNaTela, andamentoDaEtapa, travaMorta,
  type Situacao, type Ordem,
} from '@/lib/analise/esteira'

interface Fila {
  id: string
  caso_id: string | null
  analise_id: string | null
  tomador_id: string | null
  cnpj: string | null
  razao_social: string | null
  pasta: string
  situacao: Situacao
  motivo: string | null
  etapa: string | null
  etapa_texto: string | null
  etapa_em: string | null
  documentos: number
  documentos_faltando: string[]
  hash_documentos: string | null
  trava_maquina: string | null
  trava_em: string | null
  ordem: Ordem | null
  ordem_por: string | null
  erro: string | null
  criado_em: string
  criado_por: string | null
  concluido_em: string | null
}

const desde = (iso: string | null) => {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(min)) return ''
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`
}

export default function Esteira() {
  const router = useRouter()
  const { somenteLeitura } = usePermissoes()
  const [fila, setFila] = useState<Fila[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState('')

  /* O `vivo` não é enfeite: a esteira recarrega sozinha a cada 8 segundos
     enquanto há coisa em voo, e sair da tela no meio de uma volta deixaria um
     setState procurando um componente que não existe mais. É também o que o
     React 19 cobra ao proibir setState síncrono dentro de efeito. */
  const carregar = useCallback(async (vivo = { atual: true }) => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('analise_fila')
      .select('id, caso_id, analise_id, tomador_id, cnpj, razao_social, pasta, situacao, motivo, etapa, etapa_texto, etapa_em, documentos, documentos_faltando, hash_documentos, trava_maquina, trava_em, ordem, ordem_por, erro, criado_em, criado_por, concluido_em')
      .order('atualizado_em', { ascending: false })
      .limit(300)
    if (!vivo.atual) return
    if (error) setErro(error.message)
    setFila((data ?? []) as Fila[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    const vivo = { atual: true }
    carregar(vivo)
    return () => { vivo.atual = false }
  }, [carregar])

  /* A TELA SE ATUALIZA SOZINHA ENQUANTO HÁ COISA EM VOO, e só então. Uma ordem
     dada depende de uma máquina responder; sem isto a tela ficaria mostrando
     "esperando" para sempre e a pessoa clicaria de novo. */
  const emVoo = useMemo(
    () => fila.some((f) => f.ordem || f.situacao === 'em_andamento'),
    [fila],
  )
  useEffect(() => {
    if (!emVoo) return
    const t = setInterval(() => carregar(), 8000)
    return () => clearInterval(t)
  }, [emVoo, carregar])

  const ordenada = useMemo(
    () => [...fila].sort((a, b) => pesoNaTela(a.situacao) - pesoNaTela(b.situacao) || a.pasta.localeCompare(b.pasta)),
    [fila],
  )

  const contagem = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of fila) c[f.situacao] = (c[f.situacao] ?? 0) + 1
    return c
  }, [fila])

  async function mandar(id: string, ordem: Ordem) {
    setErro('')
    setOcupado(id)
    try {
      const r = await fetch('/api/esteira/ordem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ordem }),
      })
      const j = await r.json()
      if (!r.ok) setErro(j.erro ?? 'Não consegui.')
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setOcupado('')
    await carregar()
  }

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0a1628', margin: 0 }}>Análise de crédito</h1>
        <p style={{ color: 'var(--soft)', fontSize: 14, margin: '6px 0 0', maxWidth: '78ch' }}>
          A esteira inteira, do caso que saiu da Triagem à análise pronta. Quem executa é o motor no
          notebook; quem manda, vê e decide é aqui.
        </p>
      </div>


      {/* ── o resumo ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {(Object.keys(SITUACAO) as Situacao[])
          .filter((s) => contagem[s])
          .sort((a, b) => pesoNaTela(a) - pesoNaTela(b))
          .map((s) => (
            <span key={s} className={`badge ${SITUACAO[s].badge}`} title={SITUACAO[s].explica}>
              {contagem[s]} {SITUACAO[s].rotulo.toLowerCase()}
            </span>
          ))}
        {!carregando && fila.length === 0 && (
          <span className="badge badge-gray">Nada na esteira</span>
        )}
      </div>

      {erro && <div className="alert-error" style={{ marginBottom: 14 }}>{erro}</div>}

      {carregando ? (
        <div className="card-panel"><p style={{ color: 'var(--soft)', fontSize: 14 }}>Carregando…</p></div>
      ) : fila.length === 0 ? (
        <div className="card-panel">
          <p style={{ color: 'var(--soft)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Nenhuma análise na esteira ainda. Duas coisas enchem esta tela: a Triagem, ao concluir
            um caso do Comercial, e o agente da esteira rodando no notebook (<b>node scripts/esteira.mjs</b>),
            que traz as pastas que já existem no disco.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {ordenada.map((f) => {
            const s = SITUACAO[f.situacao] ?? SITUACAO.pendente
            const podeMandar = somenteLeitura ? [] : ordensDe(f.situacao)
            const rodando = f.situacao === 'em_andamento'
            const travouSemAvisar = rodando && travaMorta(f.trava_em)
            return (
              <div key={f.id} className="card-panel" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 9 }}>
                  <span className={`badge ${s.badge}`}>{s.rotulo}</span>
                  <b style={{ fontSize: 15, color: '#0a1628' }}>{f.razao_social || f.pasta}</b>
                  {f.razao_social && f.razao_social !== f.pasta && (
                    <span style={{ fontSize: 12, color: 'var(--soft)' }}>pasta &quot;{f.pasta}&quot;</span>
                  )}
                  {f.cnpj && <span style={{ fontSize: 12.5, color: 'var(--soft)' }}>{f.cnpj}</span>}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: 'var(--soft)' }}>
                    {f.documentos} documento{f.documentos === 1 ? '' : 's'}
                  </span>
                </div>

                {f.motivo && (
                  <div style={{ fontSize: 13, color: '#22344d', marginTop: 6, lineHeight: 1.5 }}>{f.motivo}</div>
                )}

                {f.documentos_faltando?.length > 0 && (
                  <div style={{ fontSize: 12.5, color: '#a02020', marginTop: 5 }}>
                    Falta: {f.documentos_faltando.join(' · ')}
                  </div>
                )}

                {/* a etapa, enquanto o motor trabalha */}
                {rodando && (
                  <div style={{ marginTop: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--soft)', marginBottom: 4 }}>
                      <span>{f.etapa_texto || 'Trabalhando…'}</span>
                      <span>
                        {f.trava_maquina}
                        {f.etapa_em ? ` · ${desde(f.etapa_em)}` : ''}
                      </span>
                    </div>
                    <div style={{ height: 5, background: '#e6edf6', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        width: `${andamentoDaEtapa(f.etapa)}%`, height: '100%',
                        background: travouSemAvisar ? 'var(--red)' : '#1e4080',
                        transition: 'width .4s',
                      }} />
                    </div>
                    {travouSemAvisar && (
                      <div style={{ fontSize: 12, color: '#a02020', marginTop: 5 }}>
                        Sem notícia da máquina há um tempo. Ela volta para a fila sozinha na próxima
                        varredura do agente.
                      </div>
                    )}
                  </div>
                )}

                {f.erro && f.situacao === 'erro' && (
                  <div style={{ fontSize: 12.5, color: '#a02020', marginTop: 6, whiteSpace: 'pre-wrap' }}>{f.erro}</div>
                )}

                {/* a ordem dada, esperando a máquina */}
                {f.ordem && (
                  <div style={{
                    marginTop: 9, fontSize: 12.5, lineHeight: 1.5,
                    background: '#fdf6e3', border: '1px solid #e8d9a8', color: '#6b5310',
                    borderRadius: 8, padding: '8px 11px',
                  }}>
                    <b>{ORDEM[f.ordem].rotulo}</b> pedido por {f.ordem_por ?? 'alguém'}. Quem executa é o
                    notebook, então isto leva alguns segundos. Com ele desligado, o pedido fica
                    guardado e acontece assim que o agente subir.
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 11, alignItems: 'center' }}>
                  {podeMandar.map((o) => (
                    <button
                      key={o}
                      type="button"
                      className={o === 'iniciar' ? 'btn-primary' : 'btn-secondary'}
                      style={{ padding: '6px 13px', fontSize: 13 }}
                      disabled={ocupado === f.id || !!f.ordem}
                      title={ORDEM[o].explica}
                      onClick={() => mandar(f.id, o)}
                    >
                      {f.situacao === 'concluida' && o === 'iniciar' ? 'Refazer' : ORDEM[o].rotulo}
                    </button>
                  ))}

                  <span style={{ flex: 1 }} />

                  {/* A análise pronta abre AQUI DENTRO, e não no 127.0.0.1. É o
                      que fecha a esteira: o caso entra, roda, e o resultado é
                      lido no CRM por quem não está no notebook dele. */}
                  {f.analise_id && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '6px 13px', fontSize: 13 }}
                      onClick={() => router.push(`/analises/${f.analise_id}`)}
                    >
                      Ver a análise
                    </button>
                  )}
                  {f.caso_id && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '6px 13px', fontSize: 13 }}
                      onClick={() => router.push(`/comercial/${f.caso_id}`)}
                    >
                      Ver o caso
                    </button>
                  )}
                  {f.tomador_id && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '6px 13px', fontSize: 13 }}
                      onClick={() => router.push(`/tomadores/${f.tomador_id}`)}
                    >
                      Ver o tomador
                    </button>
                  )}
                </div>

                <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 8 }}>
                  {f.criado_por ? `Entrou por ${f.criado_por}` : 'Entrou'} {desde(f.criado_em)}
                  {f.concluido_em && ` · concluída ${desde(f.concluido_em)}`}
                  {/* Sem resultado ligado, a análise está "pronta" e o card do tomador continua
                      vazio. É a queixa que originou a carga das análises, e ela merece aparecer. */}
                  {f.situacao === 'concluida' && !f.analise_id && (
                    <span style={{ color: '#a02020' }}> · concluída, mas o resultado não foi encontrado no banco</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
