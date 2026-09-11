'use client'

/* A TRIAGEM EM LOTE, AO VIVO · os casos trazidos do período passando pela
   conferência de documentos
   ═══════════════════════════════════════════════════════════════════════════

   Fase 4 do Carteiro gerencial. Ordem do Marco em 11/09/2026: "assim que eu
   trouxer os 10 e-mails elegíveis de ontem para o sistema, o agente de triagem
   entra em campo (...) isso pode ser feito em lote (...) e a triagem irá abrir
   a pasta do tomador no meu computador".

   O QUE O MERCADO ENSINOU E ESTÁ AQUI: progresso visível de trabalho em lote
   (a página de agentes do GitHub, as células do Hebbia enchendo): um contador
   "7 de 10", uma barra que muda de cor por resultado, e cada linha trocando de
   estado sozinha, pelo Realtime de `analise_fila`, sem apertar F5.

   A TRIAGEM EM SI roda no notebook (agente Esteira), igual a hoje: o botão só
   dá a ordem. Por isso a tela diz quando a Esteira está parada, em vez de
   deixar o "esperando o notebook" parecer defeito. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SecaoPainel, Aviso } from '@/components/painel/Painel'
import { cor, corDaArea, raio, texto, botaoCheio, botaoVazado } from '@/lib/ui/painel'
import { lerTriagem, podeReconferir, resumirLote, ROTULO_TRIAGEM, type EstadoTriagem, type LinhaTriagem } from '@/lib/analise/triagem-lote'

const COR_ESTADO: Record<EstadoTriagem, string> = {
  verde: cor.areaOperacao,
  falta: cor.ouro,
  analisando: cor.acaoClara,
  pronta: cor.acao,
  esperando: cor.borda,
  na_fila: cor.bordaSuave,
  parada: cor.textoFraco,
  erro: cor.alerta,
}

const ORDEM_BARRA: EstadoTriagem[] = ['verde', 'pronta', 'analisando', 'falta', 'erro', 'parada', 'esperando', 'na_fila']

const desde = (iso: string | null | undefined) => {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(min) || min < 0) return ''
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`
}

export default function TriagemEmLote({ casos, somenteLeitura }: {
  /** Os casos do período: id do caso -> nome para mostrar. */
  casos: Record<string, { titulo: string; numero?: number | null }>
  somenteLeitura: boolean
}) {
  const ids = useMemo(() => Object.keys(casos).sort(), [casos])
  const chave = ids.join(',')

  const [linhas, setLinhas] = useState<LinhaTriagem[]>([])
  const [carregado, setCarregado] = useState(false)
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')
  const [enviando, setEnviando] = useState('')
  const [podeAbrir, setPodeAbrir] = useState(false)
  const [esteira, setEsteira] = useState<{ pode_ligar: boolean; rodando?: boolean } | null>(null)

  const carregar = useCallback(async () => {
    if (!chave) return
    const supabase = createClient()
    /* Em pedaços de 100: no período "Tudo" são centenas de casos, e uma lista
       dessas numa URL só passa do limite (e a seção sumia sem aviso). */
    const lista = chave.split(',')
    const pedacos: string[][] = []
    for (let i = 0; i < lista.length; i += 100) pedacos.push(lista.slice(i, i + 100))
    const respostas = await Promise.all(pedacos.map((p) => supabase
      .from('analise_fila')
      .select('id, pasta, situacao, caso_id, cadastro, docs, documentos_faltando, ordem, ordem_por, ordem_em, etapa, etapa_texto, etapa_em, motivo, fora_do_disco_em')
      .in('caso_id', p)))
    const falha = respostas.find((r) => r.error)?.error
    if (falha) setErro(`Não consegui ler a fila da triagem: ${falha.message}`)
    setLinhas(respostas.flatMap((r) => (r.data ?? []) as LinhaTriagem[]))
    setCarregado(true)
  }, [chave])

  /* AO VIVO: toda mudança em `analise_fila` recarrega, com 1 s de espera para
     juntar a rajada de uma triagem inteira numa leitura só. O relógio de 30 s é
     a rede de segurança se o Realtime cair. */
  useEffect(() => {
    const supabase = createClient()
    let espera: ReturnType<typeof setTimeout> | null = null
    const logo = () => {
      if (espera) clearTimeout(espera)
      espera = setTimeout(() => { espera = null; carregar() }, 1000)
    }
    /* Só os casos da tela: sem o filtro, cada sincronização da Esteira (que
       grava `sincronizado_em` em todas as linhas) recarregava a tela. Acima de
       100 casos o filtro não cabe, e aí vale o relógio. */
    const qtd = chave ? chave.split(',').length : 0
    const canal = supabase
      .channel(`triagem-lote-${chave.slice(0, 40)}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'analise_fila',
        ...(qtd && qtd <= 100 ? { filter: `caso_id=in.(${chave})` } : {}),
      }, logo)
      .subscribe()
    const primeira = setTimeout(carregar, 0)
    const t = setInterval(carregar, 30_000)
    return () => {
      if (espera) clearTimeout(espera)
      clearTimeout(primeira)
      clearInterval(t)
      supabase.removeChannel(canal)
    }
  }, [carregar, chave])

  // Uma pergunta por abertura de tela: pode abrir pasta aqui? a Esteira está de pé?
  useEffect(() => {
    let vivo = true
    fetch('/api/esteira/abrir-pasta').then((r) => r.json()).then((j) => { if (vivo) setPodeAbrir(!!j?.pode) }).catch(() => {})
    fetch('/api/agentes/esteira').then((r) => r.json()).then((j) => { if (vivo && typeof j?.pode_ligar === 'boolean') setEsteira(j) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  const resumo = resumirLote(linhas)
  const conferiveis = linhas.filter(podeReconferir)

  const postar = async (url: string, corpo: Record<string, unknown>) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    const j = await r.json().catch(() => ({}))
    return { ok: r.ok, j }
  }

  async function conferirTodos() {
    setErro(''); setRecado(''); setEnviando('lote')
    try {
      // Em pedaços de 50, o limite da rota: "Conferir os 80" não pode virar um 413 sem ordem nenhuma.
      const ids = conferiveis.map((l) => l.id)
      let dadas = 0
      const recusadas: { erro: string }[] = []
      for (let i = 0; i < ids.length; i += 50) {
        const { ok, j } = await postar('/api/esteira/lote', { ids: ids.slice(i, i + 50), ordem: 'reconferir' })
        if (!ok) { setErro(j.erro ?? 'Não consegui dar as ordens.'); break }
        dadas += j.dadas ?? 0
        recusadas.push(...((j.recusadas ?? []) as { erro: string }[]))
      }
      setRecado(
        `${dadas} ${dadas === 1 ? 'caso foi' : 'casos foram'} para a conferência.` +
        (recusadas.length ? ` ${recusadas.length} não ${recusadas.length === 1 ? 'pôde' : 'puderam'}: ${recusadas[0].erro}` : ''),
      )
    } catch {
      setErro('A conexão caiu. Confira a lista: o que já foi pedido aparece como "esperando o notebook".')
    }
    setEnviando('')
    await carregar()
  }

  async function reler(id: string) {
    setErro(''); setRecado(''); setEnviando(id)
    const { ok, j } = await postar('/api/esteira/ordem', { id, ordem: 'reconferir' }).catch(() => ({ ok: false, j: { erro: 'A conexão caiu.' } }))
    if (!ok) setErro(j.erro ?? 'Não consegui dar a ordem.')
    setEnviando('')
    await carregar()
  }

  async function abrirPasta(id: string) {
    setErro(''); setRecado('')
    const { ok, j } = await postar('/api/esteira/abrir-pasta', { id }).catch(() => ({ ok: false, j: { erro: 'A conexão caiu.' } }))
    if (!ok) setErro(j.erro ?? 'Não consegui abrir a pasta.')
    else setRecado(`Pasta aberta no Explorer: ${j.pasta}`)
  }

  // Sem caso na fila, a seção some; com erro de leitura, ela aparece e diz o erro.
  if (!chave || (carregado && !linhas.length && !erro)) return null

  const cores = corDaArea('analise')
  const esteiraParada = esteira?.pode_ligar && !esteira.rodando

  return (
    <SecaoPainel
      nome={`Triagem em lote · ${resumo.conferidos} de ${resumo.total} conferidos`}
      cor={cores}
      acao={!somenteLeitura && conferiveis.length > 0 ? (
        <button
          type="button"
          className="painel-alvo"
          onClick={conferirTodos}
          disabled={!!enviando}
          title="Dá a ordem de reler a pasta e refazer a conferência de documentos a cada caso que pode receber agora."
          style={{ ...botaoCheio, padding: '5px 12px', fontSize: 12, opacity: enviando ? 0.6 : 1 }}
        >
          {enviando === 'lote' ? 'Dando as ordens…' : `Conferir ${conferiveis.length === 1 ? 'o caso' : `os ${conferiveis.length}`} agora`}
        </button>
      ) : null}
    >
      <div style={{ background: cor.papel, border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, padding: '11px 12px' }}>
        {/* a barra: uma faixa por resultado, na mesma ordem da legenda */}
        <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: cor.bordaSuave }} aria-hidden>
          {ORDEM_BARRA.filter((e) => resumo.por[e]).map((e) => (
            <span key={e} style={{ width: `${(resumo.por[e] / Math.max(1, resumo.total)) * 100}%`, background: COR_ESTADO[e], transition: 'width .4s' }} />
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 7 }}>
          {ORDEM_BARRA.filter((e) => resumo.por[e]).map((e) => (
            <span key={e} style={{ ...texto.nota, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: COR_ESTADO[e], border: e === 'na_fila' ? `1px solid ${cor.borda}` : 'none' }} />
              {resumo.por[e]} {ROTULO_TRIAGEM[e].toLowerCase()}
            </span>
          ))}
        </div>

        {esteiraParada && (
          <div style={{ marginTop: 9 }}>
            <Aviso>
              O agente Esteira está parado neste notebook: as ordens ficam esperando até ele voltar.
              Ligue pelo botão Agente Esteira, na tela da Análise.
            </Aviso>
          </div>
        )}
        {erro && <div style={{ marginTop: 9 }}><Aviso tom="erro">{erro}</Aviso></div>}
        {recado && <div style={{ ...texto.apoio, marginTop: 8 }}>{recado}</div>}

        <div style={{ marginTop: 10, borderTop: `1px solid ${cor.bordaSuave}` }}>
          {linhas
            .map((l) => ({ l, t: lerTriagem(l) }))
            .sort((a, b) => ORDEM_BARRA.indexOf(b.t.estado) - ORDEM_BARRA.indexOf(a.t.estado))
            .map(({ l, t }) => {
              const caso = l.caso_id ? casos[l.caso_id] : undefined
              return (
                <div key={l.id} style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px',
                  padding: '8px 2px', borderBottom: `1px solid ${cor.bordaSuave}`,
                }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: COR_ESTADO[t.estado], border: t.estado === 'na_fila' ? `1px solid ${cor.borda}` : 'none', flexShrink: 0 }} />
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 650, color: cor.tinta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {caso?.numero ? `#${caso.numero} · ` : ''}{caso?.titulo || l.pasta}
                    </div>
                    <div style={{ ...texto.nota, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[
                        t.detalhe,
                        l.docs?.total ? `${l.docs.feitos ?? 0} de ${l.docs.total} documentos lidos` : null,
                        desde(l.ordem_em ?? l.etapa_em) || null,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
                    color: t.estado === 'falta' ? cor.ouroTexto : t.estado === 'erro' ? cor.alerta : t.estado === 'verde' ? cor.areaOperacao : cor.textoSub,
                    border: `1px solid ${t.estado === 'falta' ? cor.ouro : t.estado === 'erro' ? cor.alertaBorda : cor.borda}`,
                    background: cor.papel,
                  }}>
                    {t.rotulo}
                  </span>
                  <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                    {podeAbrir && !l.fora_do_disco_em && (
                      <button type="button" className="painel-alvo" onClick={() => abrirPasta(l.id)}
                        style={{ ...botaoVazado, padding: '3px 9px', fontSize: 11.5 }}>
                        abrir pasta
                      </button>
                    )}
                    {!somenteLeitura && podeReconferir(l) && (
                      <button type="button" className="painel-alvo" onClick={() => reler(l.id)} disabled={!!enviando}
                        style={{ ...botaoVazado, padding: '3px 9px', fontSize: 11.5, opacity: enviando === l.id ? 0.5 : 1 }}>
                        reler
                      </button>
                    )}
                    {l.caso_id && (
                      <Link href={`/comercial/${l.caso_id}`} className="painel-alvo"
                        style={{ ...botaoVazado, padding: '3px 9px', fontSize: 11.5, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                        abrir o caso
                      </Link>
                    )}
                  </span>
                </div>
              )
            })}
        </div>
        <div style={{ ...texto.nota, marginTop: 8 }}>
          origem: analise_fila dos casos trazidos neste período. A conferência roda no notebook (agente Esteira), uma pasta de cada vez;
          os documentos moram no CRM, e a pasta do notebook é a cópia de trabalho.
        </div>
      </div>
    </SecaoPainel>
  )
}
