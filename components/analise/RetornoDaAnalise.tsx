'use client'

/* O RETORNO DA ANÁLISE · a resposta ao e-mail de entrada (06/10/2026)

   Pedido do Marco: ENTRADA (o e-mail que abriu o caso) -> PROCESSAMENTO
   (cadastro e análise) -> RESPOSTA. A resposta mora aqui, no caso e no
   tomador, em dois textos: o da corretora, que ele COPIA e cola no Outlook
   para responder, e o da equipe, o resumo do dossiê para os colegas.

   O SISTEMA SÓ LÊ E-MAIL (ordem dele, 06/10/2026, até segunda ordem): não
   existe aqui botão de responder, rascunhar ou enviar. "Respondido" é a
   anotação de que ele respondeu pelo Outlook, à mão ou percebida pelo
   Carteiro lendo os Itens Enviados.

   Estilo próprio, só com os tokens do painel: a peça aparece na Bancada da
   triagem (classes `bt-`) e na gaveta do tomador (classes `mt-`), e não
   depende de nenhuma das duas. */

import { useCallback, useEffect, useState } from 'react'
import type { Retorno } from '@/lib/analise/retorno-servidor'
import { cor, raio, texto, botaoCheio, botaoVazado } from '@/lib/ui/painel'

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : ''

type Lado = 'corretora' | 'equipe'

async function copiar(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true } catch { /* navegador sem permissão: cai no jeito antigo */ }
  try {
    const a = document.createElement('textarea')
    a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'
    document.body.appendChild(a); a.select()
    const ok = document.execCommand('copy'); a.remove(); return ok
  } catch { return false }
}

export default function RetornoDaAnalise({ casoId, analiseId }: { casoId?: string; analiseId?: string }) {
  const [retornos, setRetornos] = useState<Retorno[] | null>(null)
  const [pode, setPode] = useState({ editar: false, responder: false })
  const [semAcesso, setSemAcesso] = useState(false)
  const [erro, setErro] = useState('')
  const [lado, setLado] = useState<Lado>('corretora')
  const [qual, setQual] = useState(0)
  const [rascunho, setRascunho] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const alvo = casoId ? `caso=${casoId}` : `analise=${analiseId}`

  const carregar = useCallback(() => {
    fetch(`/api/retornos?${alvo}`)
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) { setErro(j.erro ?? 'Não consegui ler o retorno.'); return }
        setErro('')
        setRetornos(j.retornos ?? [])
        setPode(j.pode ?? { editar: false, responder: false })
        setSemAcesso(!!j.sem_acesso)
      })
      .catch(() => setErro('A conexão caiu ao ler o retorno.'))
  }, [alvo])

  useEffect(() => { carregar() }, [carregar])

  async function agir(corpo: Record<string, unknown>) {
    setOcupado(true); setErro('')
    try {
      const r = await fetch('/api/retornos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(j.erro ?? 'Não deu certo.'); return false }
      carregar()
      return true
    } finally { setOcupado(false) }
  }

  if (semAcesso) return null
  if (erro && !retornos) return <p style={{ ...texto.apoio, margin: 0 }}>{erro}</p>
  if (!retornos) return <p style={{ ...texto.apoio, margin: 0 }}>Lendo o retorno…</p>
  if (!retornos.length) {
    return (
      <p style={{ ...texto.apoio, margin: 0 }}>
        O Retorno da Análise aparece aqui quando a análise de crédito for concluída e publicada.
      </p>
    )
  }

  const r = retornos[Math.min(qual, retornos.length - 1)]
  const textoVisto = lado === 'corretora' ? r.texto_corretora : r.texto_equipe

  return (
    <div style={{ border: `1px solid ${cor.borda}`, borderLeft: `3px solid ${cor.areaOperacao}`, borderRadius: raio.cartao, background: cor.papel, padding: '12px 14px', minWidth: 0 }}>
      {/* ── cabeçalho: o que é, quando nasceu, se já foi respondido ─────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999, border: `1px solid ${cor.areaOperacao}`, color: cor.tinta }}>
          Retorno da Análise
        </span>
        <span style={{ ...texto.nota, fontVariantNumeric: 'tabular-nums' }}>
          {r.editado_em ? `ajustado por ${r.editado_por} em ${quando(r.editado_em)}` : `gerado ${r.gerado_por === 'sistema' ? 'pelo sistema' : `por ${r.gerado_por}`} em ${quando(r.gerado_em)}`}
        </span>
        {retornos.length > 1 && qual > 0 && <span style={{ ...texto.nota, color: cor.ouroTexto }}>{casoId ? 'de uma análise anterior' : 'de outro caso desta análise'}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: r.respondido_em ? cor.tinta2 : cor.ouroTexto }}>
          {r.respondido_em
            ? (r.respondido_como === 'detectado' ? `Respondido em ${quando(r.respondido_em)} (visto nos Itens Enviados do Outlook)` : `Respondido em ${quando(r.respondido_em)}${r.respondido_por ? ` por ${r.respondido_por}` : ''}`)
            : 'Aguardando a resposta pelo Outlook'}
        </span>
      </div>

      {r.pendencias.length > 0 && (
        <p style={{ ...texto.apoio, margin: '6px 0 0' }}>
          {r.pendencias.length === 1 ? '1 item' : `${r.pendencias.length} itens`} no &quot;o que falta&quot;, já dentro do texto.
        </p>
      )}

      {/* ── os dois textos ───────────────────────────────────────────────── */}
      <div role="tablist" style={{ display: 'flex', gap: 4, margin: '10px 0 6px' }}>
        {(['corretora', 'equipe'] as Lado[]).map(l => (
          <button key={l} type="button" role="tab" aria-selected={lado === l}
            onClick={() => { setLado(l); setRascunho(null) }}
            style={{
              ...botaoVazado, padding: '6px 11px', fontSize: 12, minHeight: 40,
              background: lado === l ? cor.destaque : cor.papel,
              borderColor: lado === l ? cor.bordaAtiva : cor.borda,
              color: lado === l ? cor.tinta : cor.textoSub,
            }}>
            {l === 'corretora' ? 'Para a corretora' : 'Para a equipe'}
          </button>
        ))}
      </div>

      {rascunho !== null ? (
        <textarea value={rascunho} onChange={e => setRascunho(e.target.value)} rows={16}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 16, lineHeight: 1.5, color: cor.texto, border: `1px solid ${cor.bordaAtiva}`, borderRadius: raio.controle, padding: 10, resize: 'vertical' }} />
      ) : (
        <div style={{ ...texto.corpo, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: cor.papelZebra, border: `1px solid ${cor.bordaSuave}`, borderRadius: raio.controle, padding: '10px 12px', maxHeight: 380, overflowY: 'auto' }}>
          {textoVisto}
        </div>
      )}

      {erro && <p style={{ ...texto.apoio, color: cor.alerta, margin: '6px 0 0' }}>{erro}</p>}

      {/* ── o que se faz com ele ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {rascunho !== null ? (
          <>
            <button type="button" disabled={ocupado} style={{ ...botaoCheio, minHeight: 40 }}
              onClick={async () => { if (await agir({ acao: 'editar', id: r.id, [lado === 'corretora' ? 'texto_corretora' : 'texto_equipe']: rascunho })) setRascunho(null) }}>
              Salvar o texto
            </button>
            <button type="button" disabled={ocupado} style={{ ...botaoVazado, minHeight: 40 }} onClick={() => setRascunho(null)}>Cancelar</button>
          </>
        ) : (
          <>
            <button type="button" style={{ ...botaoCheio, minHeight: 40 }}
              onClick={async () => { if (await copiar(textoVisto)) { setCopiado(true); setTimeout(() => setCopiado(false), 2000) } else setErro('O navegador não deixou copiar. Selecione o texto e use Ctrl+C.') }}>
              {copiado ? 'Copiado' : 'Copiar o texto'}
            </button>
            {pode.responder && (
              <button type="button" disabled={ocupado} style={{ ...botaoVazado, minHeight: 40 }}
                onClick={() => agir({ acao: 'respondido', id: r.id, desfazer: !!r.respondido_em })}>
                {r.respondido_em ? 'Desfazer o respondido' : 'Já respondi pelo Outlook'}
              </button>
            )}
            {pode.editar && (
              <button type="button" disabled={ocupado} style={{ ...botaoVazado, minHeight: 40 }} onClick={() => setRascunho(textoVisto)}>
                Ajustar o texto
              </button>
            )}
            {pode.editar && (
              <button type="button" disabled={ocupado} style={{ ...botaoVazado, minHeight: 40 }}
                onClick={() => {
                  if (r.editado_em && !window.confirm('O texto foi ajustado à mão. Gerar de novo apaga o ajuste. Continuar?')) return
                  agir({ acao: 'gerar', analise_id: r.analise_id, caso_id: r.caso_id })
                }}>
                Gerar de novo
              </button>
            )}
          </>
        )}
      </div>

      <p style={{ ...texto.nota, margin: '8px 0 0' }}>
        O sistema não envia e-mail. Copie o texto e responda pelo Outlook.
        {r.avisados > 0 && ` ${r.avisados === 1 ? '1 colega foi avisado' : `${r.avisados} colegas foram avisados`} pelo sino.`}
      </p>

      {retornos.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <span style={texto.nota}>{casoId ? 'Retornos deste caso:' : 'Um retorno por caso desta análise:'}</span>
          {retornos.map((v, i) => (
            <button key={v.id} type="button" onClick={() => { setQual(i); setRascunho(null) }}
              style={{ ...botaoVazado, padding: '3px 9px', fontSize: 11.5, minHeight: 40, background: i === qual ? cor.destaque : cor.papel }}>
              {casoId ? (i === 0 ? 'o mais novo' : quando(v.gerado_em)) : (v.caso_numero ? `caso nº ${v.caso_numero}` : v.caso_id ? 'caso' : 'sem caso')}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
