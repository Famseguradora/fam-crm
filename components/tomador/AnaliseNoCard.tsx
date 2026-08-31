'use client'

/* ============================================================================
   A ANÁLISE, DENTRO DO CARD DO TOMADOR

   Ordem do Marco, 31/08/2026, com as palavras dele:

     "A análise de crédito, quando estiver rodando, eu abro o card do tomador e
      mostra que está rodando e o que está sendo feito. Quando terminar ou
      paralisar, dentro do card do tomador deve apresentar os motivos e a razão
      da utilização do que foi feito e pedir minha autorização para continuar."
     "TUDO QUE FOR DAQUELE TOMADOR, DEVE ESTAR DENTRO DO CARD DELE."

   Então isto não abre tela nenhuma, não leva para lugar nenhum e não tem link
   para outra página. Ele lê e decide aqui.

   ── as três coisas que esta caixa mostra ────────────────────────────────────

   1. ESTÁ RODANDO, e o quê. Vem do `agente_eventos`, o mesmo sinal que acende
      os avatares. Chega por Realtime, então muda sozinho enquanto ele olha.

   2. TERMINOU OU PAROU, e por quê. Vem do `analise_eventos`.

   3. PRECISA DE AUTORIZAÇÃO. Vem do `analise_pedidos`: o motivo, a razão do que
      foi feito até ali, e os botões. Responder é um UPDATE direto no banco, sob
      a RLS `fam_e_analista()` — quem não é analista vê a pergunta e não os
      botões, porque o banco recusaria o clique de qualquer jeito.

   A chave de tudo é o CNPJ, e não o nome da pasta: a triagem chuta o nome e a
   análise renomeia depois (memória `analise-batiza-a-pasta`).
   ========================================================================= */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { soDigitos } from '@/lib/analise/cnpj'

/** Sem sinal por este tempo, "rodando" vira "sem notícia": processo que morre
 *  não escreve "terminei", e uma caixa dizendo que trabalha há 3 horas mente. */
const MS_SEM_NOTICIA = 10 * 60 * 1000

/* ── O BOTÃO NÃO SÓ ANOTA: ELE FAZ ────────────────────────────────────────────
   O motor roda na máquina do Marco, em 127.0.0.1:7311. Quando ele abre o CRM
   NESSA máquina, o navegador dele alcança o motor: o clique dispara a análise
   de verdade, na hora. De outro computador a chamada falha, e aí a decisão
   apenas fica registrada, que é o comportamento correto e não um erro.

   Por isso a falha aqui é MUDA no que importa: a decisão já foi gravada antes,
   e é ela que vale. O disparo é um bônus de estar na máquina certa.            */
const MOTOR = 'http://127.0.0.1:7311'

/** Quais respostas mandam o motor trabalhar. As outras só ficam registradas. */
const DISPARAM = new Set(['retomar', 'refazer', 'continuar', 'autorizar_antigos', 'consolidado'])

interface EventoAgente {
  id: string; agente: string; acao: string; tarefa: string
  alvo: string | null; detalhe: string | null; criado_em: string
}
interface EventoAnalise {
  id: string; tipo: string; empresa: string
  detalhe: string | null; criado_em: string
}
interface Opcao { id: string; rotulo: string; detalhe: string | null }
interface Pedido {
  id: string; pasta: string; empresa: string | null
  motivo: string; razao: string | null; opcoes: Opcao[]
  estado: string; resposta: string | null; observacao: string | null
  respondido_em: string | null; respondido_por: string | null
  criado_em: string
}

const NOME_AGENTE: Record<string, string> = {
  triagem: 'Triagem',
  analista: 'Analista de crédito',
  carteiro: 'Carteiro',
  conferente: 'Conferente',
  validador: 'Validador',
  vigia: 'Vigia',
}

function haQuanto(iso: string, agora: number): string {
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000))
  if (s < 60) return `há ${s} segundos`
  const m = Math.round(s / 60)
  if (m < 60) return `há ${m} ${m === 1 ? 'minuto' : 'minutos'}`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h} ${h === 1 ? 'hora' : 'horas'}`
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function hora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function AnaliseNoCard({ cnpj: cnpjBruto, podeAutorizar, nomeUsuario }: {
  cnpj: string | null
  podeAutorizar: boolean
  nomeUsuario?: string | null
}) {
  // O card pode receber com ou sem máscara conforme a origem do cadastro; o
  // banco guarda só dígitos. Normalizar aqui também fecha o outro lado da
  // porta: comparar formas diferentes do mesmo CNPJ falharia em silêncio.
  const cnpj = useMemo(() => soDigitos(cnpjBruto), [cnpjBruto])
  const [passos, setPassos] = useState<EventoAgente[]>([])
  const [avisos, setAvisos] = useState<EventoAnalise[]>([])
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [recado, setRecado] = useState<string | null>(null)
  const [observacao, setObservacao] = useState('')

  const supabase = useRef(createClient()).current

  // O relógio faz "rodando" virar "sem notícia" sozinho. Sem ele, agente que
  // morre calado deixaria a caixa dizendo que trabalha para sempre.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])

  const carregar = useCallback(async () => {
    if (!cnpj) { setCarregando(false); return }
    setCarregando(true)

    const [a, b, c] = await Promise.all([
      supabase.from('agente_eventos')
        .select('id, agente, acao, tarefa, alvo, detalhe, criado_em')
        .eq('cnpj', cnpj).order('criado_em', { ascending: false }).limit(30),
      supabase.from('analise_eventos')
        .select('id, tipo, empresa, detalhe, criado_em')
        .eq('cnpj', cnpj).order('criado_em', { ascending: false }).limit(10),
      supabase.from('analise_pedidos')
        .select('*')
        .eq('cnpj', cnpj).order('criado_em', { ascending: false }).limit(1),
    ])

    setPassos((a.data ?? []) as EventoAgente[])
    setAvisos((b.data ?? []) as EventoAnalise[])
    setPedido(((c.data ?? [])[0] ?? null) as Pedido | null)
    setAgora(Date.now())
    setCarregando(false)
  }, [cnpj, supabase])

  useEffect(() => { carregar() }, [carregar])

  // Realtime: sem filtro por CNPJ no canal (o filtro do Supabase não cobre bem
  // colunas que podem ser nulas), então recarrega quando algo daquele CNPJ cai.
  useEffect(() => {
    if (!cnpj) return
    const canal = supabase
      .channel(`analise-card-${cnpj}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agente_eventos' },
        p => { if ((p.new as { cnpj?: string })?.cnpj === cnpj) carregar() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analise_eventos' },
        p => { if ((p.new as { cnpj?: string })?.cnpj === cnpj) carregar() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analise_pedidos' },
        p => { if ((p.new as { cnpj?: string })?.cnpj === cnpj) carregar() })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [cnpj, supabase, carregar])

  // ── em que pé está ──────────────────────────────────────────────────────
  const estado = useMemo(() => {
    const ultimoPasso = passos[0] ?? null
    const ultimoAviso = avisos[0] ?? null

    const fresco = ultimoPasso && (agora - new Date(ultimoPasso.criado_em).getTime()) < MS_SEM_NOTICIA
    const aberto = ultimoPasso && (ultimoPasso.acao === 'comecou' || ultimoPasso.acao === 'passo')

    // O aviso manda quando é mais novo que o passo: "concluiu" fecha o assunto.
    const avisoMaisNovo = ultimoAviso && (!ultimoPasso || ultimoAviso.criado_em > ultimoPasso.criado_em)

    if (avisoMaisNovo && ultimoAviso.tipo === 'concluiu') return { tipo: 'concluiu' as const, aviso: ultimoAviso, passo: ultimoPasso }
    if (avisoMaisNovo && ultimoAviso.tipo === 'falhou') return { tipo: 'falhou' as const, aviso: ultimoAviso, passo: ultimoPasso }
    if (aberto && fresco) return { tipo: 'rodando' as const, aviso: ultimoAviso, passo: ultimoPasso }
    if (aberto && !fresco) return { tipo: 'sem_noticia' as const, aviso: ultimoAviso, passo: ultimoPasso }
    if (ultimoAviso?.tipo === 'concluiu') return { tipo: 'concluiu' as const, aviso: ultimoAviso, passo: ultimoPasso }
    if (ultimoAviso?.tipo === 'falhou') return { tipo: 'falhou' as const, aviso: ultimoAviso, passo: ultimoPasso }
    if (ultimoPasso) return { tipo: 'parado' as const, aviso: ultimoAviso, passo: ultimoPasso }
    return { tipo: 'nada' as const, aviso: null, passo: null }
  }, [passos, avisos, agora])

  const responder = useCallback(async (opcaoId: string) => {
    if (!pedido) return
    setEnviando(opcaoId); setFalha(null)

    const { error } = await supabase
      .from('analise_pedidos')
      .update({
        estado: 'respondido',
        resposta: opcaoId,
        observacao: observacao.trim() || null,
        respondido_em: new Date().toISOString(),
        respondido_por: nomeUsuario ?? null,
      })
      .eq('id', pedido.id)

    if (error) { setEnviando(null); setFalha(error.message); return }

    // A decisão já está gravada. O que vem agora é o disparo, e ele NÃO pode
    // desfazer nada nem assustar: se o motor não estiver alcançável, a resposta
    // continua valendo e o recado é informativo, não erro.
    if (DISPARAM.has(opcaoId) && pedido.pasta) {
      try {
        const r = await fetch(`${MOTOR}/api/analisar`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pastas: [pedido.pasta] }),
          signal: AbortSignal.timeout(8000),
        })
        const j = await r.json().catch(() => null)
        setRecado(j?.ok
          ? 'Pronto. A análise começou na máquina do Marco, e o andamento aparece aqui em cima.'
          : `Decisão registrada. O motor recusou o disparo: ${j?.erro ?? 'motivo não informado'}.`)
      } catch {
        setRecado('Decisão registrada. O motor de análise não respondeu: ele roda na máquina do Marco, e só quem está nela consegue disparar daqui.')
      }
    } else {
      setRecado('Decisão registrada.')
    }

    setEnviando(null)
    setObservacao('')
    carregar()
  }, [pedido, observacao, nomeUsuario, supabase, carregar])

  // Tomador sem CNPJ não tem como ser ligado a nenhuma análise. Não desenha
  // uma caixa vazia: some, e o card fica limpo.
  if (!cnpj) return null
  if (carregando && !passos.length && !avisos.length && !pedido) return null
  if (estado.tipo === 'nada' && !pedido) return null

  const pedidoAberto = pedido && pedido.estado === 'aberto' ? pedido : null

  return (
    <section className="mt-card mt-bloco anc">
      <header className="mt-bloco-cab">
        <span className="pt" style={{ background: corDoEstado(estado.tipo) }} />
        <span className="mt-bloco-tit">A análise de crédito</span>
        {estado.tipo === 'rodando' && <span className="anc-vivo">acompanhando ao vivo</span>}
      </header>

      <div className="mt-bloco-corpo">

        {/* ── 1. em que pé está ───────────────────────────────────────── */}
        <div className={`anc-estado anc-${estado.tipo}`}>
          <div className="anc-titulo">
            {estado.tipo === 'rodando' && <><span className="anc-pulso" />Está rodando agora</>}
            {estado.tipo === 'sem_noticia' && 'Começou e parou de dar notícia'}
            {estado.tipo === 'concluiu' && 'Análise concluída'}
            {estado.tipo === 'falhou' && 'A análise parou com erro'}
            {estado.tipo === 'parado' && 'Última coisa que aconteceu'}
          </div>

          {estado.passo && (
            <div className="anc-linha">
              <b>{NOME_AGENTE[estado.passo.agente] ?? estado.passo.agente}</b>
              {' · '}{estado.passo.tarefa}
              <span className="anc-quando"> {haQuanto(estado.passo.criado_em, agora)}</span>
            </div>
          )}
          {estado.passo?.detalhe && <div className="anc-detalhe">{estado.passo.detalhe}</div>}

          {estado.aviso?.detalhe && estado.tipo !== 'rodando' && (
            <div className="anc-detalhe">{estado.aviso.detalhe}</div>
          )}
          {estado.aviso && estado.tipo === 'concluiu' && (
            <div className="anc-quando">Entregue em {hora(estado.aviso.criado_em)}</div>
          )}
          {estado.tipo === 'sem_noticia' && (
            <div className="anc-detalhe">
              Nenhum sinal há mais de 10 minutos. Ou o processo caiu, ou a etapa é
              longa. O Vigia derruba sozinho quem trava.
            </div>
          )}
        </div>

        {/* ── 2. o que ela vem fazendo ────────────────────────────────── */}
        {passos.length > 1 && (
          <details className="anc-passos">
            <summary>O que já foi feito ({passos.length} passos)</summary>
            <ol>
              {passos.map(p => (
                <li key={p.id}>
                  <span className="anc-p-hora">{hora(p.criado_em)}</span>
                  <span className="anc-p-quem">{NOME_AGENTE[p.agente] ?? p.agente}</span>
                  <span className="anc-p-txt">
                    {p.tarefa}
                    {p.detalhe && <em> · {p.detalhe}</em>}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        )}

        {/* ── 3. a autorização ────────────────────────────────────────── */}
        {pedidoAberto && (
          <div className="anc-pedido">
            <div className="anc-pedido-cab">Precisa da sua autorização para continuar</div>
            <p className="anc-motivo">{pedidoAberto.motivo}</p>

            {pedidoAberto.razao && (
              <div className="anc-razao">
                <span className="anc-razao-lab">O que foi feito até aqui, e por quê</span>
                {pedidoAberto.razao}
              </div>
            )}

            {podeAutorizar ? (
              <>
                <textarea
                  className="anc-obs"
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                  placeholder="Quer dizer alguma coisa junto? (opcional)"
                  rows={2}
                />
                <div className="anc-botoes">
                  {pedidoAberto.opcoes.map(o => (
                    <button
                      key={o.id} type="button" className="anc-btn"
                      title={o.detalhe ?? undefined}
                      disabled={!!enviando}
                      onClick={() => responder(o.id)}
                    >
                      {enviando === o.id ? 'Enviando…' : o.rotulo}
                    </button>
                  ))}
                </div>
                {falha && <div className="anc-falha">Não consegui gravar: {falha}</div>}
              </>
            ) : (
              <div className="anc-so-leitura">
                A decisão é do analista de crédito. Você está acompanhando.
              </div>
            )}
          </div>
        )}

        {pedido && pedido.estado === 'respondido' && (
          <div className="anc-respondido">
            <b>Você já decidiu:</b>{' '}
            {pedido.opcoes.find(o => o.id === pedido.resposta)?.rotulo ?? pedido.resposta}
            {pedido.respondido_em && <span className="anc-quando"> · {hora(pedido.respondido_em)}</span>}
            {pedido.observacao && <div className="anc-detalhe">“{pedido.observacao}”</div>}
            {recado && <div className="anc-detalhe">{recado}</div>}
          </div>
        )}
      </div>

      <style>{`
        .anc-vivo {
          margin-left: auto; font-size: 11px; text-transform: uppercase;
          letter-spacing: .07em; color: var(--green, #27a96c); font-weight: 700;
        }
        .anc-estado { padding: 2px 0 4px; }
        .anc-titulo {
          font-size: 15px; font-weight: 700; display: flex; align-items: center;
          gap: 8px; margin-bottom: 6px;
        }
        .anc-rodando .anc-titulo { color: var(--green, #27a96c); }
        .anc-falhou  .anc-titulo { color: var(--red, #d64545); }
        .anc-sem_noticia .anc-titulo { color: var(--accent, #e8b84b); }
        .anc-pulso {
          width: 9px; height: 9px; border-radius: 999px; flex: none;
          background: var(--green, #27a96c);
          animation: ancPulso 1.6s ease-out infinite;
        }
        @keyframes ancPulso {
          0%   { box-shadow: 0 0 0 0 rgba(39,169,108,.55) }
          70%  { box-shadow: 0 0 0 9px rgba(39,169,108,0) }
          100% { box-shadow: 0 0 0 0 rgba(39,169,108,0) }
        }
        @media (prefers-reduced-motion: reduce) { .anc-pulso { animation: none } }

        .anc-linha { font-size: 14.5px; line-height: 1.5; }
        .anc-detalhe { font-size: 13.5px; color: var(--soft, #6080a0); margin-top: 3px; line-height: 1.5; }
        .anc-quando { font-size: 12.5px; color: var(--soft, #6080a0); }

        .anc-passos { margin-top: 12px; }
        .anc-passos summary {
          cursor: pointer; font-size: 13px; color: var(--soft, #6080a0);
          font-weight: 600; padding: 4px 0; min-height: 30px;
        }
        .anc-passos ol { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        .anc-passos li {
          display: grid; grid-template-columns: 96px 128px 1fr; gap: 10px;
          font-size: 13px; line-height: 1.45; padding-bottom: 6px;
          border-bottom: 1px solid var(--line, #eef3f9);
        }
        .anc-p-hora { color: var(--soft, #6080a0); font-variant-numeric: tabular-nums; }
        .anc-p-quem { font-weight: 600; }
        .anc-p-txt em { color: var(--soft, #6080a0); font-style: normal; }

        .anc-pedido {
          margin-top: 14px; padding: 14px 16px; border-radius: 9px;
          border: 1px solid var(--accent, #e8b84b);
          background: color-mix(in srgb, var(--accent, #e8b84b) 11%, transparent);
        }
        .anc-pedido-cab {
          font-size: 12px; text-transform: uppercase; letter-spacing: .08em;
          font-weight: 700; color: var(--accent-dp, #b8851f); margin-bottom: 7px;
        }
        .anc-motivo { font-size: 15.5px; line-height: 1.5; margin: 0 0 10px; font-weight: 600; }
        .anc-razao {
          font-size: 13.5px; line-height: 1.55; color: var(--soft, #6080a0);
          border-left: 2px solid var(--border, #c5d5e8); padding-left: 11px; margin-bottom: 11px;
          white-space: pre-wrap;
        }
        .anc-razao-lab {
          display: block; font-size: 11px; text-transform: uppercase;
          letter-spacing: .07em; font-weight: 700; margin-bottom: 3px;
        }
        .anc-obs {
          width: 100%; font: inherit; font-size: 16px; padding: 8px 10px;
          border-radius: 7px; border: 1px solid var(--border, #c5d5e8);
          background: var(--card, #fff); color: inherit; resize: vertical;
          margin-bottom: 10px;
        }
        .anc-botoes { display: flex; gap: 8px; flex-wrap: wrap; }
        .anc-btn {
          font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
          padding: 9px 15px; min-height: 44px; border-radius: 7px;
          border: 1px solid var(--accent-dp, #b8851f);
          background: var(--card, #fff); color: inherit;
        }
        .anc-btn:hover:not(:disabled) { background: var(--accent, #e8b84b); color: #2a1f04; }
        .anc-btn:focus-visible { outline: 2px solid var(--accent-dp, #b8851f); outline-offset: 2px; }
        .anc-btn:disabled { opacity: .55; cursor: default; }

        .anc-so-leitura, .anc-falha { font-size: 13.5px; color: var(--soft, #6080a0); }
        .anc-falha { color: var(--red, #d64545); margin-top: 8px; }
        .anc-respondido {
          margin-top: 12px; font-size: 14px; padding: 10px 12px; border-radius: 8px;
          border: 1px solid var(--border, #c5d5e8); background: var(--card-2, #f7fafd);
        }

        @media (max-width: 560px) {
          .anc-passos li { grid-template-columns: 1fr; gap: 2px; }
          .anc-btn { width: 100%; }
        }
      `}</style>
    </section>
  )
}

function corDoEstado(t: string): string {
  if (t === 'rodando') return '#27a96c'
  if (t === 'falhou') return '#d64545'
  if (t === 'sem_noticia') return '#e8b84b'
  return '#4a90d0'
}
