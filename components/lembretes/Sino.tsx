'use client'

/* O SINO  ·  30/09/2026

   Pedido do Marco: o lembrete avisa "no sino e no celular". O sino mora no
   topo do CRM, ao lado da data, e é pessoal: cada um só vê as próprias
   notificações (RLS em `notificacoes`). Ao vivo pelo Realtime: o relógio do
   Supabase toca um lembrete e o número sobe sem recarregar.

   O "celular" é o push do próprio CRM (lib/push/webpush.ts, sem biblioteca).
   Ele liga aqui, uma vez por aparelho, com a permissão pedida no clique: o
   iPhone só aceita com o CRM instalado na tela de início (Compartilhar >
   Adicionar à Tela de Início), e só a partir do iOS 16.4. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cor, raio, sombra } from '@/lib/ui/painel'
import { VAPID_PUBLICA } from '@/lib/push/chave-publica'
import { quandoLegivel } from '@/lib/lembretes/regras'

interface Acompanhado { id: string; titulo: string; quando: string; status: string; origem: string; tomador_id: string | null; caso_id: string | null }
interface Notificacao { id: string; titulo: string; texto: string | null; link: string | null; criado_em: string; lida_em: string | null }

const quando = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
}

const chaveUint8 = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

type EstadoPush = 'carregando' | 'sem_suporte' | 'instalar' | 'bloqueado' | 'desligado' | 'ligado' | 'sem_chave'

export default function Sino({ userId }: { userId: string | null }) {
  const router = useRouter()
  const [lista, setLista] = useState<Notificacao[]>([])
  const [aberto, setAberto] = useState(false)
  const [push, setPush] = useState<EstadoPush>('carregando')
  const [msgPush, setMsgPush] = useState('')
  const caixa = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    if (!userId) return
    const { data } = await createClient().from('notificacoes')
      .select('id, titulo, texto, link, criado_em, lida_em')
      .eq('para_auth_id', userId).order('criado_em', { ascending: false }).limit(30)
    setLista((data ?? []) as Notificacao[])
  }, [userId])

  useEffect(() => { carregar() }, [carregar])

  /* ACOMPANHANDO (01/10/2026). Pedido dele: "tem sempre que aparecer no
     lembrete, mesmo os que vão vencer, assim consigo antecipar o vencimento".
     O aviso só chega na hora marcada; esta lista mostra ANTES todo lembrete em
     aberto que a pessoa acompanha, vencidos primeiro, depois os próximos. */
  const [acompanho, setAcompanho] = useState<Acompanhado[]>([])
  const carregarAcompanho = useCallback(async () => {
    if (!userId) return
    const { data } = await createClient().from('lembrete_seguidores')
      .select('lembretes!inner(id, titulo, quando, status, origem, tomador_id, caso_id)')
      .eq('auth_id', userId).in('lembretes.status', ['aberto', 'parcial'])
    const lista = ((data ?? []) as unknown as { lembretes: Acompanhado }[]).map((x) => x.lembretes)
    setAcompanho(lista.sort((a, b) => a.quando.localeCompare(b.quando)))
  }, [userId])
  useEffect(() => { carregarAcompanho() }, [carregarAcompanho])
  // Ao vivo: criou, adiou, resolveu, o robô mexeu. Rajada vira uma leitura só.
  useEffect(() => {
    if (!userId) return
    const sb = createClient()
    let espera: ReturnType<typeof setTimeout> | null = null
    const canal = sb.channel(`sino-lembretes-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lembretes' }, () => {
        if (espera) clearTimeout(espera); espera = setTimeout(carregarAcompanho, 800)
      })
      .subscribe()
    return () => { if (espera) clearTimeout(espera); sb.removeChannel(canal) }
  }, [userId, carregarAcompanho])
  // Abrir o sino relê: a hora "vence hoje" muda com o relógio.
  useEffect(() => { if (aberto) carregarAcompanho() }, [aberto, carregarAcompanho])

  useEffect(() => {
    if (!userId) return
    const sb = createClient()
    const canal = sb.channel(`sino-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes', filter: `para_auth_id=eq.${userId}` }, () => carregar())
      .subscribe()
    return () => { sb.removeChannel(canal) }
  }, [userId, carregar])

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  /* Em que pé está o push NESTE aparelho. */
  const lerPush = useCallback(async () => {
    if (!VAPID_PUBLICA) { setPush('sem_chave'); return }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const instalado = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPush(ios && !instalado ? 'instalar' : 'sem_suporte'); return
    }
    if (Notification.permission === 'denied') { setPush('bloqueado'); return }
    const reg = await navigator.serviceWorker.getRegistration()
    const insc = await reg?.pushManager.getSubscription()
    /* APARELHO COMPARTILHADO: a inscrição é do navegador, não da pessoa. Se ela
       existe e quem está logado é outro, o aviso passa a ser de quem está aqui
       agora (o servidor troca o dono). Sem isto, "ligado" mentiria para B
       enquanto o aparelho recebe os lembretes de A. */
    if (insc && Notification.permission === 'granted') {
      await fetch('/api/push/inscricao', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...insc.toJSON(), aparelho: navigator.userAgent.slice(0, 120) }),
      }).catch(() => { /* sem rede: tenta de novo na próxima abertura */ })
    }
    setPush(insc ? 'ligado' : 'desligado')
  }, [])

  useEffect(() => { if (aberto) lerPush() }, [aberto, lerPush])

  async function ligarPush() {
    setMsgPush('')
    try {
      const permissao = await Notification.requestPermission()
      if (permissao !== 'granted') { setPush(permissao === 'denied' ? 'bloqueado' : 'desligado'); return }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'))
      await navigator.serviceWorker.ready
      const insc = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveUint8(VAPID_PUBLICA),
      })
      const r = await fetch('/api/push/inscricao', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...insc.toJSON(), aparelho: navigator.userAgent.slice(0, 120) }),
      })
      const j = await r.json()
      if (!r.ok) { await insc.unsubscribe(); setMsgPush(j.erro ?? 'Não consegui ligar.'); setPush('desligado'); return }
      setPush('ligado')
      setMsgPush('Pronto. Os lembretes chegam neste aparelho mesmo com o CRM fechado.')
    } catch (e) {
      setMsgPush(e instanceof Error ? e.message : 'Não consegui ligar os avisos neste aparelho.')
    }
  }

  async function desligarPush() {
    const reg = await navigator.serviceWorker.getRegistration()
    const insc = await reg?.pushManager.getSubscription()
    if (insc) {
      await fetch('/api/push/inscricao', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: insc.endpoint }) })
      await insc.unsubscribe()
    }
    setPush('desligado'); setMsgPush('Avisos desligados neste aparelho.')
  }

  async function abrir(n: Notificacao) {
    if (!n.lida_em) await createClient().from('notificacoes').update({ lida_em: new Date().toISOString() }).eq('id', n.id)
    setAberto(false)
    if (n.link) router.push(n.link)
    carregar()
  }

  async function lerTodas() {
    await createClient().from('notificacoes').update({ lida_em: new Date().toISOString() }).eq('para_auth_id', userId ?? '').is('lida_em', null)
    carregar()
  }

  const naoLidas = lista.filter((n) => !n.lida_em).length
  const vencidos = acompanho.filter((l) => new Date(l.quando).getTime() < Date.now()).length
  // O número do sino soma o que é novo e o que já venceu: os dois pedem ação.
  const noSino = naoLidas + vencidos
  const linkDe = (l: Acompanhado) => l.tomador_id ? `/tomadores/${l.tomador_id}?g=lembretes` : `/comercial/${l.caso_id}`
  if (!userId) return null

  return (
    <div ref={caixa} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-label={noSino ? `${naoLidas} avisos novos, ${vencidos} lembretes vencidos` : 'Lembretes e avisos'}
        title="Lembretes e avisos"
        style={{
          position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer',
          color: noSino ? cor.ouro : cor.textoSobreEscuro, padding: 6, minWidth: 40, minHeight: 40,
          display: 'grid', placeItems: 'center',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {noSino > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, minWidth: 17, height: 17, borderRadius: 999, padding: '0 4px',
            background: cor.alerta, color: cor.branco, fontSize: 10.5, fontWeight: 700, display: 'grid', placeItems: 'center',
          }}>{noSino > 99 ? '99+' : noSino}</span>
        )}
      </button>

      {aberto && (
        <div style={{
          position: 'fixed', top: (caixa.current?.getBoundingClientRect().bottom ?? 58) + 8, right: 12, width: 'min(380px, calc(100vw - 24px))', maxHeight: 'min(560px, calc(100vh - 80px))',
          overflowY: 'auto', background: cor.papel, border: `1px solid ${cor.borda}`, borderRadius: raio.cartao,
          boxShadow: sombra.janela, zIndex: 1000, color: cor.texto,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${cor.bordaSuave}` }}>
            <b style={{ fontSize: 13.5, color: cor.tinta, flex: 1 }}>Lembretes e avisos</b>
            {naoLidas > 0 && (
              <button type="button" onClick={lerTodas}
                style={{ background: 'none', border: 'none', color: cor.acao, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 2px' }}>
                Marcar todas como lidas
              </button>
            )}
          </div>

          {/* ── o que eu acompanho, antes de vencer ── */}
          <div style={{ padding: '8px 14px 4px', fontSize: 12, fontWeight: 700, color: cor.tinta2 }}>
            Acompanhando · {acompanho.length} em aberto{vencidos ? ` · ${vencidos} vencido${vencidos > 1 ? 's' : ''}` : ''}
          </div>
          {acompanho.length === 0 ? (
            <div style={{ padding: '4px 14px 10px', fontSize: 12, color: cor.textoSub }}>
              Nenhum lembrete em aberto que você acompanhe.
            </div>
          ) : acompanho.slice(0, 30).map((l) => {
            const q = quandoLegivel(l.quando)
            return (
              <button key={l.id} type="button" onClick={() => { setAberto(false); router.push(linkDe(l)) }}
                style={{
                  display: 'flex', gap: 10, alignItems: 'baseline', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  font: 'inherit', padding: '7px 14px', background: cor.papel, borderBottom: `1px solid ${cor.bordaSuave}`,
                  boxShadow: q.vencido ? `inset 3px 0 0 ${cor.alerta}` : 'none',
                }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: cor.tinta, overflowWrap: 'anywhere' }}>
                  {l.origem === 'robo' && <span style={{ color: cor.ouroTexto, fontWeight: 600 }}>Robô · </span>}{l.titulo}
                </span>
                <span style={{ flexShrink: 0, fontSize: 11.5, whiteSpace: 'nowrap', fontWeight: q.vencido ? 700 : 500, color: q.vencido ? cor.alerta : cor.textoSub }}>
                  {q.vencido ? `venceu ${q.txt}` : q.txt}
                </span>
              </button>
            )
          })}
          {acompanho.length > 30 && (
            <div style={{ padding: '6px 14px', fontSize: 11.5, color: cor.textoFraco }}>e mais {acompanho.length - 30}, nos cards.</div>
          )}

          {/* ── os avisos que já tocaram ── */}
          <div style={{ padding: '10px 14px 4px', fontSize: 12, fontWeight: 700, color: cor.tinta2, borderTop: `1px solid ${cor.borda}` }}>
            Avisos recebidos{naoLidas ? ` · ${naoLidas} novo${naoLidas > 1 ? 's' : ''}` : ''}
          </div>
          {lista.length === 0 ? (
            <div style={{ padding: '4px 14px 12px', fontSize: 12, color: cor.textoSub }}>
              Nada ainda. Quando um lembrete que você acompanha tocar, o aviso chega aqui.
            </div>
          ) : lista.map((n) => (
            <button key={n.id} type="button" onClick={() => abrir(n)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', font: 'inherit',
                padding: '10px 14px', borderBottom: `1px solid ${cor.bordaSuave}`,
                background: n.lida_em ? cor.papel : cor.destaque,
                boxShadow: n.lida_em ? 'none' : `inset 3px 0 0 ${cor.acao}`,
              }}>
              <div style={{ fontSize: 12.5, fontWeight: n.lida_em ? 500 : 700, color: cor.tinta, overflowWrap: 'anywhere' }}>{n.titulo}</div>
              {n.texto && <div style={{ fontSize: 12, color: cor.textoSub, marginTop: 2, overflowWrap: 'anywhere' }}>{n.texto}</div>}
              <div style={{ fontSize: 11, color: cor.textoFraco, marginTop: 3 }}>{quando(n.criado_em)}</div>
            </button>
          ))}

          {/* ── o celular ── */}
          <div style={{ padding: '10px 14px', background: cor.papelZebra, fontSize: 12, color: cor.textoSub, lineHeight: 1.5 }}>
            <b style={{ color: cor.tinta }}>Avisos neste aparelho</b>
            <div style={{ marginTop: 4 }}>
              {push === 'carregando' && 'Conferindo…'}
              {push === 'sem_chave' && 'O aviso no celular ainda não foi configurado neste CRM.'}
              {push === 'sem_suporte' && 'Este navegador não recebe notificações.'}
              {push === 'instalar' && 'No iPhone, instale o CRM primeiro: Compartilhar, depois Adicionar à Tela de Início. Abra por lá e ligue aqui.'}
              {push === 'bloqueado' && 'As notificações do CRM estão bloqueadas neste navegador. Libere nas configurações do site e volte aqui.'}
              {push === 'desligado' && 'Desligados. Ligue para receber os lembretes mesmo com o CRM fechado.'}
              {push === 'ligado' && 'Ligados neste aparelho.'}
            </div>
            {(push === 'desligado' || push === 'ligado') && (
              <button type="button" onClick={push === 'ligado' ? desligarPush : ligarPush}
                style={{
                  marginTop: 8, minHeight: 36, padding: '6px 12px', borderRadius: raio.controle, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${push === 'ligado' ? cor.borda : cor.acao}`,
                  background: push === 'ligado' ? cor.papel : cor.acao, color: push === 'ligado' ? cor.texto : cor.branco,
                }}>
                {push === 'ligado' ? 'Desligar neste aparelho' : 'Ligar avisos neste aparelho'}
              </button>
            )}
            {msgPush && <div style={{ marginTop: 6, color: cor.tinta2 }}>{msgPush}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
