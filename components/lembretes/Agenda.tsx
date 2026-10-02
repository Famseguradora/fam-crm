'use client'

/* A AGENDA DOS LEMBRETES  ·  01/10/2026

   Pedido do Marco: "quando clicar no sino deve abrir isso muito bem
   detalhado", com calendário ou painel. Antes de construir, a pesquisa do
   mesmo dia olhou Outlook, Google Calendar, Asana, Todoist, Pipefy, Linear e
   Salesforce. O que todos têm e foi copiado:
     · a lista agrupada por urgência (Atrasados, Hoje, Amanhã, 7 dias, Depois);
     · os filtros "meus" e "que acompanho";
     · o detalhe aberto ao lado, sem sair da tela, com as ações de um clique
       (resolver, adiar +1 dia / +7 dias, reabrir, marcar item);
     · o mês com "+N mais" quando o dia lota (FullCalendar) e a semana.
   Biblioteca nenhuma (regra da FAM): o mês é um grid de 7 colunas e as datas
   saem do Date nativo, sempre no fuso de São Paulo.

   As ações são as da rota /api/lembretes (PATCH), as mesmas da gaveta do
   tomador: a agenda é outra janela para os mesmos lembretes, não outra regra. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { cor, raio } from '@/lib/ui/painel'
import { nomeCategoria, quandoLegivel, STATUS, type ItemLembrete } from '@/lib/lembretes/regras'

interface Seguidor { auth_id: string; nome: string | null; papel: string }
interface Evento { id: string; tipo: string; texto: string | null; por_nome: string | null; criado_em: string }
export interface LembreteAgenda {
  id: string; tomador_id: string | null; caso_id: string | null; operacao_id: string | null
  titulo: string; detalhe: string | null; categoria: string; quando: string; recorrencia: string | null
  itens: ItemLembrete[]; status: string; prioridade: string
  responsavel_auth_id: string | null; responsavel_nome: string | null; origem: string
  resolucao: string | null; resolvido_em: string | null; resolvido_por: string | null
  criado_por_nome: string | null; criado_em: string
  lembrete_seguidores: Seguidor[]; lembrete_eventos: Evento[]
  tomador: { razao_social: string | null; nome_fantasia: string | null } | null
}

type Visao = 'lista' | 'mes' | 'semana'
type Quem = 'meus' | 'acompanho' | 'todos'
type Origem = 'todas' | 'ressalva' | 'robo' | 'humano'
type Situacao = 'abertos' | 'fechados' | 'todos'

const FUSO = 'America/Sao_Paulo'
const diaDe = (iso: string | Date) => new Date(iso).toLocaleDateString('en-CA', { timeZone: FUSO })
const somaDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
const semanaDe = (dia: string) => (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7 // segunda = 0
const DIAS_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
const nomeMes = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dataLonga = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC' })
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' })
const fechado = (l: LembreteAgenda) => l.status === 'resolvido' || l.status === 'cancelado'
const nomeTomador = (l: LembreteAgenda) => l.tomador?.nome_fantasia || l.tomador?.razao_social || null
const linkDe = (l: LembreteAgenda) => (l.tomador_id ? `/tomadores/${l.tomador_id}?g=lembretes` : l.caso_id ? `/comercial/${l.caso_id}` : null)
/* O título do robô repete o nome do tomador depois do "·"; na agenda o nome já
   aparece embaixo, então a linha mostra só o assunto. */
const assunto = (l: LembreteAgenda) => (l.origem === 'robo' && l.titulo.includes(' · ') ? l.titulo.split(' · ')[0] : l.titulo)

/* A cor diz o estado, e só ela: vencido é vermelho, parcial é o dourado
   legível, fechado é cinza riscado, o resto é o azul de ação. */
function tomDe(l: LembreteAgenda, agora: number) {
  if (fechado(l)) return { fio: cor.borda, texto: cor.textoFraco, fundo: cor.papelZebra, riscado: true }
  if (new Date(l.quando).getTime() < agora) return { fio: cor.alerta, texto: cor.alerta, fundo: cor.alertaFundo, riscado: false }
  if (l.status === 'parcial') return { fio: cor.ouro, texto: cor.ouroTexto, fundo: cor.ouroFundo, riscado: false }
  return { fio: cor.acao, texto: cor.tinta, fundo: cor.destaque, riscado: false }
}

const botao = (cheio = false): React.CSSProperties => ({
  minHeight: 32, padding: '5px 11px', borderRadius: raio.controle, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  border: `1px solid ${cheio ? cor.acao : cor.borda}`, background: cheio ? cor.acao : cor.papel, color: cheio ? cor.branco : cor.texto,
  font: 'inherit', fontFamily: 'inherit',
})

function Segmento<T extends string>({ valor, opcoes, aoTrocar }: { valor: T; opcoes: [T, string][]; aoTrocar: (v: T) => void }) {
  return (
    /* O segmento leve do Google Agenda e do Outlook (02/10/2026): o escolhido
       ganha o fundo claro e o texto azul; o bloco cheio pesava na tela. */
    <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: cor.fundo, borderRadius: raio.controle, flexShrink: 0 }}>
      {opcoes.map(([v, nome]) => (
        <button key={v} type="button" onClick={() => aoTrocar(v)} aria-pressed={v === valor}
          style={{
            border: 'none', padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            borderRadius: raio.controle - 2,
            background: v === valor ? cor.papel : 'transparent', color: v === valor ? cor.acao : cor.textoSub,
            boxShadow: v === valor ? `0 1px 2px ${cor.borda}` : 'none',
          }}>{nome}</button>
      ))}
    </div>
  )
}

export default function Agenda({ aoNavegar }: { aoNavegar?: () => void }) {
  const [lista, setLista] = useState<LembreteAgenda[]>([])
  const [eu, setEu] = useState<{ id: string; nome: string } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [visao, setVisao] = useState<Visao>('lista')
  const [quem, setQuem] = useState<Quem>('acompanho')
  const [origem, setOrigem] = useState<Origem>('todas')
  const [situacao, setSituacao] = useState<Situacao>('abertos')
  const [busca, setBusca] = useState('')
  const [selId, setSelId] = useState<string | null>(null)
  const [diaFoco, setDiaFoco] = useState(() => diaDe(new Date()))
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  // Os atrasados começam recolhidos em 5: a lista abre pelo que ainda dá para fazer.
  const [verAtrasados, setVerAtrasados] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/lembretes?agenda=1')
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui ler a agenda.'); return }
      setLista(j.lembretes ?? []); setEu(j.eu ?? null); setErro(''); setAgora(Date.now())
    } catch { setErro('Sem conexão com o CRM.') } finally { setCarregando(false) }
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  /* `?id=` vem da caixinha do sino: a agenda abre com aquele lembrete no
     detalhe (o detalhe lê a lista inteira, então filtro nenhum o esconde). */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) setSelId(id)
  }, [])

  // Ao vivo: o robô, um colega ou a gaveta do tomador mexeram. Rajada vira uma leitura.
  useEffect(() => {
    const sb = createClient()
    let espera: ReturnType<typeof setTimeout> | null = null
    const canal = sb.channel('agenda-lembretes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lembretes' }, () => {
        if (espera) clearTimeout(espera); espera = setTimeout(carregar, 900)
      })
      .subscribe()
    return () => { if (espera) clearTimeout(espera); sb.removeChannel(canal) }
  }, [carregar])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return lista.filter((l) => {
      if (quem === 'meus' && l.responsavel_auth_id !== eu?.id) return false
      if (quem === 'acompanho' && !l.lembrete_seguidores?.some((s) => s.auth_id === eu?.id)) return false
      if (origem === 'ressalva' && l.categoria !== 'ressalva') return false
      if (origem === 'robo' && (l.origem !== 'robo' || l.categoria === 'ressalva')) return false
      if (origem === 'humano' && l.origem !== 'humano') return false
      if (situacao === 'abertos' && fechado(l)) return false
      if (situacao === 'fechados' && !fechado(l)) return false
      if (q && !`${l.titulo} ${nomeTomador(l) ?? ''} ${l.responsavel_nome ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [lista, quem, origem, situacao, busca, eu])

  const hoje = diaDe(new Date(agora))
  const atrasados = filtrados.filter((l) => !fechado(l) && new Date(l.quando).getTime() < agora)
  const porDia = useMemo(() => {
    const m = new Map<string, LembreteAgenda[]>()
    for (const l of filtrados) { const d = diaDe(l.quando); m.set(d, [...(m.get(d) ?? []), l]) }
    return m
  }, [filtrados])
  const sel = lista.find((l) => l.id === selId) ?? null

  /* ── as ações, todas pela rota de sempre ─────────────────────────────── */
  const [ocupado, setOcupado] = useState(false)
  const agir = async (corpo: Record<string, unknown>) => {
    if (!sel || ocupado) return
    setOcupado(true); setErro('')
    try {
      const r = await fetch('/api/lembretes', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: sel.id, ...corpo }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErro(j.erro ?? 'Não consegui gravar.')
      await carregar()
    } finally { setOcupado(false) }
  }

  /* ── as três visões ──────────────────────────────────────────────────── */
  const Linha = (l: LembreteAgenda) => {
    const t = tomDe(l, agora)
    const q = quandoLegivel(l.quando, new Date(agora))
    const feitos = l.itens?.filter((i) => i.ok).length ?? 0
    return (
      <button key={l.id} type="button" onClick={() => setSelId(l.id)}
        style={{
          display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px', width: '100%', textAlign: 'left', cursor: 'pointer',
          padding: '9px 12px', border: 'none', borderBottom: `1px solid ${cor.bordaSuave}`, fontFamily: 'inherit',
          // O vencido já fala pela data em vermelho; a faixa só marca o aberto no detalhe.
          background: l.id === selId ? cor.destaque : cor.papel, boxShadow: l.id === selId ? `inset 3px 0 0 ${cor.acao}` : 'none',
        }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: cor.tinta, textDecoration: t.riscado ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>
          {l.categoria === 'ressalva' && <span style={{ color: cor.ouroTexto }}>Ressalva · </span>}
          {l.origem === 'robo' && l.categoria !== 'ressalva' && <span style={{ color: cor.ouroTexto }}>Robô · </span>}
          {assunto(l)}
        </span>
        <span style={{ fontSize: 12, fontWeight: q.vencido && !fechado(l) ? 700 : 500, color: fechado(l) ? cor.textoFraco : q.vencido ? cor.alerta : cor.textoSub, whiteSpace: 'nowrap' }}>
          {fechado(l) ? STATUS[l.status]?.nome : q.vencido ? `venceu ${q.txt}` : q.txt}
        </span>
        <span style={{ fontSize: 12, color: cor.textoSub, overflowWrap: 'anywhere' }}>
          {nomeTomador(l) ?? 'sem tomador'}
          {l.responsavel_nome ? ` · ${l.responsavel_nome}` : ''}
        </span>
        <span style={{ fontSize: 11.5, color: cor.textoFraco, whiteSpace: 'nowrap' }}>
          {l.itens?.length ? `${feitos}/${l.itens.length} itens` : nomeCategoria(l.categoria)}
        </span>
      </button>
    )
  }

  const grupos = useMemo(() => {
    const amanha = somaDias(hoje, 1), em7 = somaDias(hoje, 7)
    const g: { nome: string; itens: LembreteAgenda[]; alerta?: boolean }[] = [
      { nome: 'Atrasados', itens: [], alerta: true }, { nome: 'Hoje', itens: [] }, { nome: 'Amanhã', itens: [] },
      { nome: 'Próximos 7 dias', itens: [] }, { nome: 'Depois', itens: [] }, { nome: 'Fechados', itens: [] },
    ]
    for (const l of filtrados) {
      const d = diaDe(l.quando)
      if (fechado(l)) g[5].itens.push(l)
      else if (new Date(l.quando).getTime() < agora) g[0].itens.push(l)
      else if (d === hoje) g[1].itens.push(l)
      else if (d === amanha) g[2].itens.push(l)
      else if (d <= em7) g[3].itens.push(l)
      else g[4].itens.push(l)
    }
    g[5].itens.reverse()
    return g.filter((x) => x.itens.length)
  }, [filtrados, hoje, agora])

  const VisaoLista = () => (
    <div>
      {grupos.length === 0 && <div style={{ padding: 24, fontSize: 13, color: cor.textoSub }}>Nada com estes filtros.</div>}
      {grupos.map((g) => (
        <section key={g.nome}>
          <div style={{
            position: 'sticky', top: 0, zIndex: 1, padding: '8px 12px', fontSize: 12.5, fontWeight: 700,
            background: cor.fundo, borderBottom: `1px solid ${cor.borda}`, color: g.alerta ? cor.alerta : cor.tinta2,
          }}>{g.nome} · {g.itens.length}</div>
          {(g.alerta && !verAtrasados ? g.itens.slice(0, 5) : g.itens).map(Linha)}
          {g.alerta && !verAtrasados && g.itens.length > 5 && (
            <button type="button" onClick={() => setVerAtrasados(true)}
              style={{ display: 'block', width: '100%', padding: '9px 12px', border: 'none', borderBottom: `1px solid ${cor.bordaSuave}`, background: cor.papel, color: cor.acao, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              Mostrar mais {g.itens.length - 5} atrasados
            </button>
          )}
        </section>
      ))}
    </div>
  )

  const Chip = (l: LembreteAgenda) => {
    const t = tomDe(l, agora)
    return (
      <button key={l.id} type="button" className="agenda-chip" onClick={(e) => { e.stopPropagation(); setSelId(l.id) }} title={`${l.titulo}${nomeTomador(l) ? ` · ${nomeTomador(l)}` : ''}`}
        style={{
          display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 11, lineHeight: 1.3, padding: '2px 5px', borderRadius: 4, marginTop: 2,
          background: l.id === selId ? cor.acao : t.fundo, color: l.id === selId ? cor.branco : t.texto,
          boxShadow: `inset 2px 0 0 ${t.fio}`, textDecoration: t.riscado ? 'line-through' : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
        {nomeTomador(l) ?? assunto(l)}
      </button>
    )
  }

  const navegar = (passo: number) => setDiaFoco((d) => (visao === 'mes'
    ? (() => { const x = new Date(`${d.slice(0, 7)}-01T12:00:00Z`); x.setUTCMonth(x.getUTCMonth() + passo); return x.toISOString().slice(0, 10) })()
    : somaDias(d, 7 * passo)))

  const VisaoMes = () => {
    const primeiro = `${diaFoco.slice(0, 7)}-01`
    const inicio = somaDias(primeiro, -semanaDe(primeiro))
    const dias = Array.from({ length: 42 }, (_, i) => somaDias(inicio, i))
    let ultima = 0
    dias.forEach((d, i) => { if (d.slice(0, 7) === diaFoco.slice(0, 7)) ultima = i })
    const semanas = Math.ceil((ultima + 1) / 7)
    return (
      <div style={{ padding: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1, background: cor.borda, border: `1px solid ${cor.borda}`, borderRadius: raio.controle, overflow: 'hidden' }}>
          {DIAS_SEMANA.map((d) => (
            <div key={d} style={{ background: cor.fundo, padding: '5px 6px', fontSize: 11.5, fontWeight: 700, color: cor.textoSub, textAlign: 'center' }}>{d}</div>
          ))}
          {dias.slice(0, semanas * 7).map((d) => {
            const doMes = d.slice(0, 7) === diaFoco.slice(0, 7)
            const itens = porDia.get(d) ?? []
            const cabe = 3
            return (
              <div key={d} onClick={() => itens.length && setDiaAberto(d)}
                style={{
                  background: d === hoje ? cor.destaque : doMes ? cor.papel : cor.papelZebra, minHeight: 92, padding: 4,
                  cursor: itens.length ? 'pointer' : 'default', minWidth: 0,
                }}>
                <div style={{
                  fontSize: 11.5, fontWeight: d === hoje ? 700 : 500, color: d === hoje ? cor.acao : doMes ? cor.texto : cor.textoFraco,
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <span>{Number(d.slice(8))}</span>
                  {itens.length > 0 && <span style={{ color: cor.textoFraco }}>{itens.length}</span>}
                </div>
                {itens.slice(0, cabe).map(Chip)}
                {itens.length > cabe && (
                  <div className="agenda-chip" style={{ fontSize: 11, fontWeight: 600, color: cor.acao, marginTop: 2, paddingLeft: 4 }}>+{itens.length - cabe} mais</div>
                )}
              </div>
            )
          })}
        </div>
        {diaAberto && (
          <div style={{ marginTop: 10, border: `1px solid ${cor.borda}`, borderRadius: raio.controle, overflow: 'hidden', background: cor.papel }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '7px 12px', background: cor.fundo, borderBottom: `1px solid ${cor.borda}` }}>
              <b style={{ fontSize: 12.5, color: cor.tinta, flex: 1 }}>{dataLonga(diaAberto)} · {(porDia.get(diaAberto) ?? []).length}</b>
              <button type="button" onClick={() => setDiaAberto(null)} style={{ ...botao(), minHeight: 26, padding: '2px 9px' }}>Fechar</button>
            </div>
            {(porDia.get(diaAberto) ?? []).map(Linha)}
          </div>
        )}
      </div>
    )
  }

  const VisaoSemana = () => {
    const inicio = somaDias(diaFoco, -semanaDe(diaFoco))
    const dias = Array.from({ length: 7 }, (_, i) => somaDias(inicio, i))
    return (
      <div style={{ padding: 10, overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))', gap: 6 }}>
          {dias.map((d, i) => {
            const itens = porDia.get(d) ?? []
            return (
              <div key={d} style={{ border: `1px solid ${d === hoje ? cor.bordaAtiva : cor.borda}`, borderRadius: raio.controle, background: cor.papel, minHeight: 220, overflow: 'hidden' }}>
                <div style={{ padding: '6px 8px', background: d === hoje ? cor.destaque : cor.fundo, borderBottom: `1px solid ${cor.bordaSuave}`, fontSize: 12, fontWeight: 700, color: d === hoje ? cor.acao : cor.tinta2 }}>
                  {DIAS_SEMANA[i]} {d.slice(8)}/{d.slice(5, 7)}
                </div>
                <div style={{ padding: 4 }}>
                  {itens.length === 0 && <div style={{ fontSize: 11, color: cor.textoFraco, padding: 4 }}>livre</div>}
                  {itens.map((l) => {
                    const t = tomDe(l, agora)
                    return (
                      <button key={l.id} type="button" onClick={() => setSelId(l.id)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          padding: '5px 6px', marginBottom: 4, borderRadius: 5, background: l.id === selId ? cor.acao : t.fundo,
                          color: l.id === selId ? cor.branco : t.texto, boxShadow: `inset 2px 0 0 ${t.fio}`,
                        }}>
                        <div style={{ fontSize: 10.5, opacity: 0.8 }}>{hora(l.quando)}</div>
                        <div style={{ fontSize: 11.5, fontWeight: 600, textDecoration: t.riscado ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>{nomeTomador(l) ?? assunto(l)}</div>
                        <div style={{ fontSize: 10.5, opacity: 0.85, overflowWrap: 'anywhere' }}>{assunto(l)}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  /* ── o detalhe ───────────────────────────────────────────────────────── */
  const [nota, setNota] = useState('')
  const [novaData, setNovaData] = useState('')
  const [comentario, setComentario] = useState('')
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNota(''); setComentario(''); setNovaData(sel ? `${diaDe(sel.quando)}T${hora(sel.quando)}` : '') }, [selId]) // eslint-disable-line react-hooks/exhaustive-deps

  const Detalhe = (l: LembreteAgenda) => {
    const t = tomDe(l, agora)
    const q = quandoLegivel(l.quando, new Date(agora))
    const link = linkDe(l)
    const seguidores = (l.lembrete_seguidores ?? []).filter((s) => s.papel !== 'responsavel')
    const eventos = [...(l.lembrete_eventos ?? [])].sort((a, b) => b.criado_em.localeCompare(a.criado_em))
    return (
      <div style={{ padding: '14px 14px 80px', display: 'grid', gap: 12, alignContent: 'start' }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11.5, color: cor.textoSub }}>
            <span style={{ padding: '2px 8px', borderRadius: 999, fontWeight: 700, background: t.fundo, color: t.texto, border: `1px solid ${t.fio}` }}>
              {fechado(l) ? STATUS[l.status]?.nome : q.vencido ? 'Vencido' : STATUS[l.status]?.nome ?? l.status}
            </span>
            <span>{nomeCategoria(l.categoria)}</span>
            {l.origem === 'robo' && <span>· aberto pelo robô</span>}
            {l.prioridade === 'alta' && <span style={{ color: cor.alerta, fontWeight: 700 }}>· prioridade alta</span>}
          </div>
          <h3 style={{ margin: '8px 0 2px', fontSize: 16, color: cor.tinta, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{l.titulo}</h3>
          {link && (
            <Link href={link} onClick={aoNavegar} style={{ fontSize: 12.5, color: cor.acao, fontWeight: 600, textDecoration: 'none' }}>
              {nomeTomador(l) ? `Abrir ${nomeTomador(l)}` : 'Abrir o caso'} ›
            </Link>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 12px', fontSize: 12.5, color: cor.texto }}>
          <span style={{ color: cor.textoSub }}>Prazo</span>
          <span style={{ fontWeight: 600, color: q.vencido && !fechado(l) ? cor.alerta : cor.tinta }}>{dataHora(l.quando)} · {q.vencido && !fechado(l) ? `venceu ${q.txt}` : q.txt}</span>
          <span style={{ color: cor.textoSub }}>Responsável</span><span>{l.responsavel_nome ?? 'ninguém'}</span>
          {seguidores.length > 0 && <><span style={{ color: cor.textoSub }}>Acompanham</span><span>{seguidores.map((s) => s.nome).filter(Boolean).join(', ')}</span></>}
          {l.recorrencia && <><span style={{ color: cor.textoSub }}>Repete</span><span>{l.recorrencia}</span></>}
          <span style={{ color: cor.textoSub }}>Criado</span><span>{dataHora(l.criado_em)} por {l.criado_por_nome ?? 'alguém'}</span>
          {fechado(l) && <><span style={{ color: cor.textoSub }}>Fechado</span><span>{l.resolvido_em ? dataHora(l.resolvido_em) : ''} por {l.resolvido_por ?? 'alguém'}{l.resolucao ? `: ${l.resolucao}` : ''}</span></>}
        </div>

        {l.itens?.length > 0 && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: cor.tinta2, marginBottom: 4 }}>
              {l.categoria === 'ressalva' ? 'Condições para liberar o crédito' : 'Itens'} · {l.itens.filter((i) => i.ok).length} de {l.itens.length}
            </div>
            {l.itens.map((i, n) => (
              <label key={`${n}-${i.nome}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: `1px solid ${cor.bordaSuave}`, fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={i.ok} disabled={ocupado} onChange={(e) => agir({ acao: 'item', nome: i.nome, ok: e.target.checked })} style={{ marginTop: 2 }} />
                <span style={{ flex: 1, color: i.ok ? cor.textoFraco : cor.texto, textDecoration: i.ok ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>
                  {i.nome}
                  {i.ok && i.por && <span style={{ display: 'block', fontSize: 11, textDecoration: 'none' }}>{i.por === 'robo' ? 'robô' : i.por}{i.em ? ` · ${dataHora(i.em)}` : ''}</span>}
                </span>
              </label>
            ))}
          </div>
        )}

        {l.detalhe && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: cor.tinta2, marginBottom: 4 }}>{l.categoria === 'ressalva' ? 'Texto da ressalva na análise' : 'Detalhe'}</div>
            <div style={{ fontSize: 12.5, color: cor.texto, whiteSpace: 'pre-wrap', lineHeight: 1.5, background: cor.papelZebra, border: `1px solid ${cor.bordaSuave}`, borderRadius: raio.controle, padding: '8px 10px', overflowWrap: 'anywhere' }}>{l.detalhe}</div>
          </div>
        )}

        {!fechado(l) ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" disabled={ocupado} onClick={() => agir({ acao: 'adiar', minutos: 60 * 24 })} style={botao()}>+1 dia</button>
              <button type="button" disabled={ocupado} onClick={() => agir({ acao: 'adiar', minutos: 60 * 24 * 7 })} style={botao()}>+7 dias</button>
              <button type="button" disabled={ocupado} onClick={() => agir({ acao: 'adiar', minutos: 60 * 24 * 30 })} style={botao()}>+30 dias</button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="datetime-local" value={novaData} onChange={(e) => setNovaData(e.target.value)}
                style={{ minHeight: 32, padding: '4px 8px', border: `1px solid ${cor.borda}`, borderRadius: raio.controle, fontSize: 12.5, fontFamily: 'inherit', color: cor.texto }} />
              <button type="button" disabled={ocupado || !novaData}
                onClick={() => agir({ acao: 'editar', quando: new Date(`${novaData}:00-03:00`).toISOString() })} style={botao()}>Mudar o prazo</button>
            </div>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Como foi resolvido (opcional)"
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: `1px solid ${cor.borda}`, borderRadius: raio.controle, fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" disabled={ocupado} onClick={() => agir({ acao: 'resolver', nota })} style={botao(true)}>Resolver</button>
              <button type="button" disabled={ocupado || !nota.trim()} onClick={() => agir({ acao: 'parcial', nota })} style={botao()} title="Escreva o que foi resolvido e o que falta">Resolvido parcial</button>
            </div>
          </div>
        ) : (
          <div><button type="button" disabled={ocupado} onClick={() => agir({ acao: 'reabrir' })} style={botao()}>Reabrir</button></div>
        )}

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: cor.tinta2, marginBottom: 4 }}>Histórico</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Comentar"
              onKeyDown={(e) => { if (e.key === 'Enter' && comentario.trim()) { agir({ acao: 'comentar', texto: comentario }); setComentario('') } }}
              style={{ flex: 1, minWidth: 0, minHeight: 32, padding: '4px 8px', border: `1px solid ${cor.borda}`, borderRadius: raio.controle, fontSize: 12.5, fontFamily: 'inherit' }} />
            <button type="button" disabled={ocupado || !comentario.trim()} onClick={() => { agir({ acao: 'comentar', texto: comentario }); setComentario('') }} style={botao()}>Enviar</button>
          </div>
          {eventos.map((e) => (
            <div key={e.id} style={{ fontSize: 12, padding: '5px 0', borderBottom: `1px solid ${cor.bordaSuave}`, color: cor.texto, overflowWrap: 'anywhere' }}>
              {e.texto}
              <div style={{ fontSize: 11, color: cor.textoFraco }}>{e.por_nome ?? 'alguém'} · {dataHora(e.criado_em)}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const totalAbertos = filtrados.filter((l) => !fechado(l)).length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: cor.fundo, color: cor.texto }}>
      {/* filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', background: cor.papel, borderBottom: `1px solid ${cor.borda}` }}>
        <Segmento valor={visao} aoTrocar={(v) => { setVisao(v); setDiaAberto(null) }} opcoes={[['lista', 'Lista'], ['mes', 'Mês'], ['semana', 'Semana']]} />
        <Segmento valor={quem} aoTrocar={setQuem} opcoes={[['acompanho', 'Que acompanho'], ['meus', 'Sou responsável'], ['todos', 'Todos da FAM']]} />
        <Segmento valor={origem} aoTrocar={setOrigem} opcoes={[['todas', 'Tudo'], ['ressalva', 'Ressalvas'], ['robo', 'Documentos'], ['humano', 'Das pessoas']]} />
        <Segmento valor={situacao} aoTrocar={setSituacao} opcoes={[['abertos', 'Em aberto'], ['fechados', 'Fechados'], ['todos', 'Todos']]} />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tomador, assunto ou pessoa"
          style={{ flex: '1 1 180px', minWidth: 0, minHeight: 30, padding: '4px 9px', border: `1px solid ${cor.borda}`, borderRadius: raio.controle, fontSize: 12.5, fontFamily: 'inherit' }} />
      </div>

      {/* resumo e navegação do calendário */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '8px 12px', fontSize: 12.5, borderBottom: `1px solid ${cor.borda}` }}>
        <span style={{ color: cor.textoSub }}>{totalAbertos} em aberto</span>
        {atrasados.length > 0 && (
          <button type="button" onClick={() => { setVisao('lista'); setSituacao('abertos') }}
            style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: cor.alerta }}>
            {atrasados.length} atrasado{atrasados.length > 1 ? 's' : ''}
          </button>
        )}
        {visao !== 'lista' && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <button type="button" onClick={() => navegar(-1)} style={{ ...botao(), minHeight: 28, padding: '2px 10px' }} aria-label="Anterior">‹</button>
            <b style={{ color: cor.tinta, minWidth: 150, textAlign: 'center', fontSize: 13 }}>
              {visao === 'mes' ? nomeMes(diaFoco) : (() => { const i = somaDias(diaFoco, -semanaDe(diaFoco)); return `${i.slice(8)}/${i.slice(5, 7)} a ${somaDias(i, 6).slice(8)}/${somaDias(i, 6).slice(5, 7)}` })()}
            </b>
            <button type="button" onClick={() => navegar(1)} style={{ ...botao(), minHeight: 28, padding: '2px 10px' }} aria-label="Próximo">›</button>
            <button type="button" onClick={() => setDiaFoco(hoje)} style={{ ...botao(), minHeight: 28, padding: '2px 10px' }}>Hoje</button>
          </span>
        )}
      </div>

      {erro && <div style={{ padding: '8px 12px', fontSize: 12.5, color: cor.alerta, background: cor.alertaFundo, borderBottom: `1px solid ${cor.alertaBorda}` }}>{erro}</div>}

      {/* visão + detalhe lado a lado; no celular o detalhe toma a tela */}
      <div className="agenda-corpo" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div className={sel ? 'agenda-visao com-detalhe' : 'agenda-visao'} style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: cor.papel }}>
          {carregando ? <div style={{ padding: 24, fontSize: 13, color: cor.textoSub }}>Lendo a agenda…</div>
            : visao === 'lista' ? VisaoLista() : visao === 'mes' ? VisaoMes() : VisaoSemana()}
        </div>
        {sel && (
          <aside className="agenda-detalhe" style={{ width: 400, flexShrink: 0, overflowY: 'auto', borderLeft: `1px solid ${cor.borda}`, background: cor.papel }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 10px 0' }}>
              <button type="button" onClick={() => setSelId(null)} style={{ ...botao(), minHeight: 26, padding: '2px 9px' }}>Fechar detalhe</button>
            </div>
            {Detalhe(sel)}
          </aside>
        )}
      </div>
      <style>{`
        @media (max-width: 760px) {
          .agenda-visao.com-detalhe { display: none; }
          /* No celular o dia do mês tem ~50px: fica só o número de lembretes,
             e o toque no dia abre a lista dele embaixo. */
          .agenda-chip { display: none !important; }
          .agenda-detalhe { width: 100% !important; border-left: none !important; }
        }
      `}</style>
    </div>
  )
}
