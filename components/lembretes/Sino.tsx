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
  if (!userId) return null

  return (
    <div ref={caixa} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-label={naoLidas ? `${naoLidas} notificações novas` : 'Notificações'}
        title="Lembretes e avisos"
        style={{
          position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer',
          color: naoLidas ? cor.ouro : cor.textoSobreEscuro, padding: 6, minWidth: 40, minHeight: 40,
          display: 'grid', placeItems: 'center',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {naoLidas > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, minWidth: 17, height: 17, borderRadius: 999, padding: '0 4px',
            background: cor.alerta, color: cor.branco, fontSize: 10.5, fontWeight: 700, display: 'grid', placeItems: 'center',
          }}>{naoLidas > 99 ? '99+' : naoLidas}</span>
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

          {lista.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12.5, color: cor.textoSub }}>
              Nada por enquanto. Quando um lembrete que você acompanha tocar, ele aparece aqui.
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
