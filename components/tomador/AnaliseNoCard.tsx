'use client'

/* ============================================================================
   A ANÁLISE DE CRÉDITO, INTEIRA, DENTRO DO CARD DO TOMADOR

   Ordem do Marco, 31/08/2026:
     "TUDO QUE FOR DAQUELE TOMADOR, DEVE ESTAR DENTRO DO CARD DELE."
     "Dentro dos cards, preciso ter porque parou. E também com botão de
      reiniciar. Aonde está a triagem? Eu tenho que ter tudo em um único lugar."

   A primeira versão desta caixa só lia o Supabase, e por isso só aparecia
   depois que uma análise já tinha rodado. Na maioria dos cards não aparecia
   nada, e a triagem não aparecia em lugar nenhum. Estava certo em reclamar.

   ── de onde vem cada coisa ──────────────────────────────────────────────────

   MOTOR (127.0.0.1:7311/api/visao, indexado por CNPJ)  — a verdade completa:
     etapaTxt      por que está parado, em português ("Precisa de você")
     docs          a TRIAGEM: quantos documentos conferidos, e o que falta
     linha         a linha do tempo (e-mail que chegou, triagem que rodou)
     acoes         os botões que o próprio motor sabe executar
     parado_dias   há quanto tempo está parado

   SUPABASE — o que atravessa máquinas:
     agente_eventos    os passos, ao vivo, enquanto a análise roda
     analise_eventos   começou / ficou pronta / parou
     analise_pedidos   a pergunta que espera autorização dele

   O motor roda na máquina do Marco. Quando ele abre o CRM nessa máquina, o
   navegador alcança o motor e o card mostra tudo. De outro computador, o
   bloco do motor não vem e o resto continua: o card degrada, não quebra.
   ========================================================================= */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { soDigitos } from '@/lib/analise/cnpj'

const MOTOR = 'http://127.0.0.1:7311'
/** Sem sinal por este tempo, "rodando" vira "sem notícia". */
const MS_SEM_NOTICIA = 10 * 60 * 1000

interface EventoAgente {
  id: string; agente: string; acao: string; tarefa: string
  alvo: string | null; detalhe: string | null; criado_em: string
}
interface EventoAnalise { id: string; tipo: string; empresa: string; detalhe: string | null; criado_em: string }
interface Opcao { id: string; rotulo: string; detalhe: string | null }
interface Pedido {
  id: string; pasta: string; empresa: string | null
  motivo: string; razao: string | null; opcoes: Opcao[]
  estado: string; resposta: string | null; observacao: string | null
  respondido_em: string | null; respondido_por: string | null; criado_em: string
}
interface AcaoMotor { txt: string; tipo?: string; href?: string; refazer?: string }
interface Pagina {
  nome: string; cnpj: string; corretora: string; produto: string
  etapa: string; etapaTxt: string
  docs: { feitos: number; total: number; entregue: boolean; falta: string[] }
  acoes: AcaoMotor[]
  linha: { em: string; tipo: string; txt: string; quem: string }[]
  pasta: string
  parado_desde: string | null; parado_dias: number
  analise_atual: string; notas: number
}

const NOME_AGENTE: Record<string, string> = {
  triagem: 'Triagem', analista: 'Analista de crédito', carteiro: 'Carteiro',
  conferente: 'Conferente', validador: 'Validador', vigia: 'Vigia',
}

function haQuanto(iso: string, agora: number): string {
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000))
  if (s < 60) return `há ${s} segundos`
  const m = Math.round(s / 60)
  if (m < 60) return `há ${m} ${m === 1 ? 'minuto' : 'minutos'}`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h} ${h === 1 ? 'hora' : 'horas'}`
  const d = Math.floor(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}
function hora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function AnaliseNoCard({ cnpj: cnpjBruto, podeAutorizar, nomeUsuario }: {
  cnpj: string | null; podeAutorizar: boolean; nomeUsuario?: string | null
}) {
  const cnpj = useMemo(() => soDigitos(cnpjBruto), [cnpjBruto])

  const [passos, setPassos] = useState<EventoAgente[]>([])
  const [avisos, setAvisos] = useState<EventoAnalise[]>([])
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [pagina, setPagina] = useState<Pagina | null>(null)
  const [motorOk, setMotorOk] = useState<boolean | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const [enviando, setEnviando] = useState<string | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [recado, setRecado] = useState<string | null>(null)
  const [observacao, setObservacao] = useState('')

  const supabase = useRef(createClient()).current

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])

  // ── o motor, que é quem sabe a triagem e o porquê ───────────────────────
  const lerMotor = useCallback(async () => {
    if (!cnpj) return
    try {
      const r = await fetch(`${MOTOR}/api/visao`, { signal: AbortSignal.timeout(6000) })
      const d = await r.json()
      setPagina((d?.paginas?.[cnpj] ?? null) as Pagina | null)
      setMotorOk(true)
    } catch {
      // Outro computador, ou motor desligado. Não é erro: o resto do card segue.
      setMotorOk(false)
    }
  }, [cnpj])

  const lerBanco = useCallback(async () => {
    if (!cnpj) return
    const [a, b, c] = await Promise.all([
      supabase.from('agente_eventos').select('id, agente, acao, tarefa, alvo, detalhe, criado_em')
        .eq('cnpj', cnpj).order('criado_em', { ascending: false }).limit(30),
      supabase.from('analise_eventos').select('id, tipo, empresa, detalhe, criado_em')
        .eq('cnpj', cnpj).order('criado_em', { ascending: false }).limit(10),
      supabase.from('analise_pedidos').select('*')
        .eq('cnpj', cnpj).order('criado_em', { ascending: false }).limit(1),
    ])
    setPassos((a.data ?? []) as EventoAgente[])
    setAvisos((b.data ?? []) as EventoAnalise[])
    setPedido(((c.data ?? [])[0] ?? null) as Pedido | null)
    setAgora(Date.now())
  }, [cnpj, supabase])

  const carregar = useCallback(async () => {
    await Promise.all([lerMotor(), lerBanco()])
  }, [lerMotor, lerBanco])

  useEffect(() => { carregar() }, [carregar])

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

  const estado = useMemo(() => {
    const passo = passos[0] ?? null
    const aviso = avisos[0] ?? null
    const fresco = passo && (agora - new Date(passo.criado_em).getTime()) < MS_SEM_NOTICIA
    const aberto = passo && (passo.acao === 'comecou' || passo.acao === 'passo')
    const avisoNovo = aviso && (!passo || aviso.criado_em > passo.criado_em)

    if (avisoNovo && aviso.tipo === 'concluiu') return { tipo: 'concluiu' as const, aviso, passo }
    if (avisoNovo && aviso.tipo === 'falhou') return { tipo: 'falhou' as const, aviso, passo }
    if (aberto && fresco) return { tipo: 'rodando' as const, aviso, passo }
    if (aberto && !fresco) return { tipo: 'sem_noticia' as const, aviso, passo }
    if (aviso?.tipo === 'concluiu') return { tipo: 'concluiu' as const, aviso, passo }
    return { tipo: 'parado' as const, aviso, passo }
  }, [passos, avisos, agora])

  // ── mandar o motor trabalhar ────────────────────────────────────────────
  const mandarMotor = useCallback(async (pasta: string, oQue: string) => {
    setEnviando(oQue); setFalha(null); setRecado(null)
    try {
      const r = await fetch(`${MOTOR}/api/analisar`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pastas: [pasta] }),
        signal: AbortSignal.timeout(15000),
      })
      const j = await r.json().catch(() => null)
      setRecado(j?.ok
        ? 'Pronto. A análise começou, e o andamento aparece aqui em cima sozinho.'
        : `O motor recusou: ${j?.erro ?? 'motivo não informado'}`)
    } catch {
      setFalha('O motor de análise não respondeu. Ele roda na máquina do Marco, e só de lá dá para disparar.')
    }
    setEnviando(null)
    setTimeout(carregar, 1500)
  }, [carregar])

  const responder = useCallback(async (opcaoId: string) => {
    if (!pedido) return
    setEnviando(opcaoId); setFalha(null); setRecado(null)

    // GRAVA PRIMEIRO, dispara depois: se o disparo falhar, a decisão dele fica.
    const { error } = await supabase.from('analise_pedidos').update({
      estado: 'respondido', resposta: opcaoId,
      observacao: observacao.trim() || null,
      respondido_em: new Date().toISOString(),
      respondido_por: nomeUsuario ?? null,
    }).eq('id', pedido.id)

    if (error) { setEnviando(null); setFalha(error.message); return }
    setObservacao('')
    setEnviando(null)

    if (opcaoId !== 'deixar' && pedido.pasta) await mandarMotor(pedido.pasta, opcaoId)
    else { setRecado('Decisão registrada.'); carregar() }
  }, [pedido, observacao, nomeUsuario, supabase, mandarMotor, carregar])

  if (!cnpj) return null

  const pasta = pagina?.pasta ?? pedido?.pasta ?? null
  const pedidoAberto = pedido && pedido.estado === 'aberto' ? pedido : null
  const temAlgo = pagina || passos.length || avisos.length || pedido
  if (!temAlgo) {
    // Nem o motor conhece este CNPJ, nem há histórico: não existe análise para
    // este tomador. Some, em vez de ocupar espaço dizendo que não tem nada.
    if (motorOk !== false) return null
  }

  return (
    <section className="mt-card mt-bloco anc">
      <header className="mt-bloco-cab">
        <span className="pt" style={{ background: cor(estado.tipo, pagina) }} />
        <span className="mt-bloco-tit">A análise de crédito</span>
        {estado.tipo === 'rodando' && <span className="anc-vivo">ao vivo</span>}
      </header>

      <div className="mt-bloco-corpo">

        {/* ── 1. POR QUE ESTÁ ASSIM ──────────────────────────────────── */}
        <div className="anc-estado">
          <div className="anc-titulo">
            {estado.tipo === 'rodando'
              ? <><span className="anc-pulso" />Está rodando agora</>
              : (pagina?.etapaTxt || rotuloDe(estado.tipo))}
          </div>

          {estado.tipo === 'rodando' && estado.passo && (
            <div className="anc-linha">
              <b>{NOME_AGENTE[estado.passo.agente] ?? estado.passo.agente}</b>
              {' · '}{estado.passo.tarefa}
              <span className="anc-quando"> {haQuanto(estado.passo.criado_em, agora)}</span>
              {estado.passo.detalhe && <div className="anc-detalhe">{estado.passo.detalhe}</div>}
            </div>
          )}

          {estado.tipo !== 'rodando' && pagina?.parado_desde && (
            <div className="anc-detalhe">
              Parado {haQuanto(pagina.parado_desde, agora)}
              {pagina.analise_atual ? ` · última análise: ${pagina.analise_atual}` : ''}
            </div>
          )}

          {estado.tipo !== 'rodando' && estado.aviso?.detalhe && (
            <div className="anc-detalhe">{estado.aviso.detalhe}</div>
          )}
        </div>

        {/* ── 2. A TRIAGEM ───────────────────────────────────────────── */}
        {pagina && (
          <div className="anc-triagem">
            <div className="anc-sec">Triagem dos documentos</div>
            <div className="anc-docs">
              <span className={`anc-pill ${pagina.docs.falta.length ? 'atencao' : 'ok'}`}>
                {pagina.docs.feitos} de {pagina.docs.total} conferidos
              </span>
              {pagina.docs.falta.length > 0
                ? <span className="anc-detalhe">Falta: {pagina.docs.falta.join(', ')}</span>
                : <span className="anc-detalhe">Nada faltando.</span>}
            </div>
            {pagina.produto && <div className="anc-detalhe">Produto: {pagina.produto}</div>}
            {pagina.corretora && <div className="anc-detalhe">Corretora: {pagina.corretora}</div>}
          </div>
        )}

        {/* ── 3. OS BOTÕES ───────────────────────────────────────────── */}
        {pasta && podeAutorizar && estado.tipo !== 'rodando' && (
          <div className="anc-acoes">
            <button type="button" className="anc-btn prim" disabled={!!enviando}
              onClick={() => mandarMotor(pasta, 'reiniciar')}>
              {enviando === 'reiniciar' ? 'Disparando…' : '▶ Reiniciar a análise'}
            </button>
            {motorOk === false && (
              <span className="anc-detalhe">O motor não respondeu; ele roda na máquina do Marco.</span>
            )}
          </div>
        )}

        {/* ── 4. A LINHA DO TEMPO ────────────────────────────────────── */}
        {(pagina?.linha?.length || passos.length > 0) && (
          <details className="anc-passos">
            <summary>O que já aconteceu</summary>
            <ol>
              {passos.map(p => (
                <li key={p.id}>
                  <span className="anc-p-hora">{hora(p.criado_em)}</span>
                  <span className="anc-p-quem">{NOME_AGENTE[p.agente] ?? p.agente}</span>
                  <span className="anc-p-txt">{p.tarefa}{p.detalhe && <em> · {p.detalhe}</em>}</span>
                </li>
              ))}
              {(pagina?.linha ?? []).map((l, i) => (
                <li key={`m${i}`}>
                  <span className="anc-p-hora">{hora(l.em)}</span>
                  <span className="anc-p-quem">{l.quem}</span>
                  <span className="anc-p-txt">{l.txt}</span>
                </li>
              ))}
            </ol>
          </details>
        )}

        {/* ── 5. A AUTORIZAÇÃO ───────────────────────────────────────── */}
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
                <textarea className="anc-obs" value={observacao} rows={2}
                  onChange={e => setObservacao(e.target.value)}
                  placeholder="Quer dizer alguma coisa junto? (opcional)" />
                <div className="anc-botoes">
                  {pedidoAberto.opcoes.map(o => (
                    <button key={o.id} type="button" className="anc-btn"
                      title={o.detalhe ?? undefined} disabled={!!enviando}
                      onClick={() => responder(o.id)}>
                      {enviando === o.id ? 'Enviando…' : o.rotulo}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="anc-detalhe">A decisão é do analista de crédito. Você está acompanhando.</div>
            )}
          </div>
        )}

        {pedido && pedido.estado === 'respondido' && (
          <div className="anc-respondido">
            <b>Você decidiu:</b>{' '}
            {pedido.opcoes.find(o => o.id === pedido.resposta)?.rotulo ?? pedido.resposta}
            {pedido.respondido_em && <span className="anc-quando"> · {hora(pedido.respondido_em)}</span>}
            {pedido.observacao && <div className="anc-detalhe">“{pedido.observacao}”</div>}
          </div>
        )}

        {recado && <div className="anc-recado">{recado}</div>}
        {falha && <div className="anc-falha">{falha}</div>}
      </div>

      <style>{`
        .anc-vivo { margin-left:auto; font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--green,#27a96c); font-weight:700 }
        .anc-titulo { font-size:15.5px; font-weight:700; display:flex; align-items:center; gap:8px; margin-bottom:5px }
        .anc-pulso { width:9px; height:9px; border-radius:999px; flex:none; background:var(--green,#27a96c); animation:ancPulso 1.6s ease-out infinite }
        @keyframes ancPulso { 0%{box-shadow:0 0 0 0 rgba(39,169,108,.55)} 70%{box-shadow:0 0 0 9px rgba(39,169,108,0)} 100%{box-shadow:0 0 0 0 rgba(39,169,108,0)} }
        @media (prefers-reduced-motion: reduce){ .anc-pulso{animation:none} }
        .anc-linha { font-size:14.5px; line-height:1.5 }
        .anc-detalhe { font-size:13.5px; color:var(--soft,#6080a0); margin-top:3px; line-height:1.5 }
        .anc-quando { font-size:12.5px; color:var(--soft,#6080a0) }

        .anc-sec { font-size:11px; text-transform:uppercase; letter-spacing:.08em; font-weight:700; color:var(--soft,#6080a0); margin-bottom:5px }
        .anc-triagem { margin-top:14px; padding-top:12px; border-top:1px solid var(--line,#eef3f9) }
        .anc-docs { display:flex; gap:10px; align-items:center; flex-wrap:wrap }
        .anc-pill { font-size:12.5px; font-weight:700; padding:3px 10px; border-radius:999px }
        .anc-pill.ok { background:color-mix(in srgb, var(--green,#27a96c) 16%, transparent); color:var(--green,#27a96c) }
        .anc-pill.atencao { background:color-mix(in srgb, var(--accent,#e8b84b) 24%, transparent); color:var(--accent-dp,#b8851f) }

        .anc-acoes { margin-top:14px; display:flex; gap:10px; align-items:center; flex-wrap:wrap }
        .anc-btn { font:inherit; font-size:14px; font-weight:600; cursor:pointer; padding:9px 15px; min-height:44px; border-radius:7px; border:1px solid var(--border,#c5d5e8); background:var(--card,#fff); color:inherit }
        .anc-btn.prim { border-color:var(--green,#27a96c); color:var(--green,#27a96c) }
        .anc-btn.prim:hover:not(:disabled) { background:var(--green,#27a96c); color:#fff }
        .anc-btn:hover:not(:disabled) { border-color:var(--soft,#6080a0) }
        .anc-btn:focus-visible { outline:2px solid var(--blue,#4a90d0); outline-offset:2px }
        .anc-btn:disabled { opacity:.55; cursor:default }

        .anc-passos { margin-top:14px }
        .anc-passos summary { cursor:pointer; font-size:13px; color:var(--soft,#6080a0); font-weight:600; padding:4px 0; min-height:32px }
        .anc-passos ol { list-style:none; margin:8px 0 0; padding:0; display:flex; flex-direction:column; gap:6px }
        .anc-passos li { display:grid; grid-template-columns:96px 130px 1fr; gap:10px; font-size:13px; line-height:1.45; padding-bottom:6px; border-bottom:1px solid var(--line,#eef3f9) }
        .anc-p-hora { color:var(--soft,#6080a0); font-variant-numeric:tabular-nums }
        .anc-p-quem { font-weight:600 }
        .anc-p-txt em { color:var(--soft,#6080a0); font-style:normal }

        .anc-pedido { margin-top:16px; padding:14px 16px; border-radius:9px; border:1px solid var(--accent,#e8b84b); background:color-mix(in srgb, var(--accent,#e8b84b) 11%, transparent) }
        .anc-pedido-cab { font-size:12px; text-transform:uppercase; letter-spacing:.08em; font-weight:700; color:var(--accent-dp,#b8851f); margin-bottom:7px }
        .anc-motivo { font-size:15.5px; line-height:1.5; margin:0 0 10px; font-weight:600 }
        .anc-razao { font-size:13.5px; line-height:1.55; color:var(--soft,#6080a0); border-left:2px solid var(--border,#c5d5e8); padding-left:11px; margin-bottom:11px; white-space:pre-wrap }
        .anc-razao-lab { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.07em; font-weight:700; margin-bottom:3px }
        .anc-obs { width:100%; font:inherit; font-size:16px; padding:8px 10px; border-radius:7px; border:1px solid var(--border,#c5d5e8); background:var(--card,#fff); color:inherit; resize:vertical; margin-bottom:10px }
        .anc-botoes { display:flex; gap:8px; flex-wrap:wrap }

        .anc-respondido { margin-top:12px; font-size:14px; padding:10px 12px; border-radius:8px; border:1px solid var(--border,#c5d5e8); background:var(--card-2,#f7fafd) }
        .anc-recado { margin-top:12px; font-size:14px; color:var(--green,#27a96c); font-weight:600 }
        .anc-falha { margin-top:12px; font-size:13.5px; color:var(--red,#d64545) }

        @media (max-width:560px){ .anc-passos li{grid-template-columns:1fr; gap:2px} .anc-btn{width:100%} }
      `}</style>
    </section>
  )
}

function rotuloDe(t: string): string {
  if (t === 'concluiu') return 'Análise concluída'
  if (t === 'falhou') return 'A análise parou com erro'
  if (t === 'sem_noticia') return 'Começou e parou de dar notícia'
  return 'Sem análise em curso'
}

function cor(t: string, p: Pagina | null): string {
  if (t === 'rodando') return '#27a96c'
  if (t === 'falhou') return '#d64545'
  if (t === 'sem_noticia') return '#e8b84b'
  if (p?.etapa === 'voce') return '#e8b84b'
  return '#4a90d0'
}
