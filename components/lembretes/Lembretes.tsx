'use client'

/* LEMBRETES DO CARD  ·  30/09/2026

   Pedido do Marco: "dentro de cada card deve ter uma opção de lembrete,
   estilo Outlook ou WhatsApp, onde quem inserir pode chamar novos colegas
   para seguir, como se fosse uma reunião; e o robô do tomador acompanha".

   O que a tela faz, e de onde vem cada decisão:
     • um RESPONSÁVEL e quem ACOMPANHA (modelo Asana): o aviso toca para todos
     • "O que falta" vira lista de itens: marcar um item é resolver parcial,
       marcar todos é resolver total. Os dois botões existem também soltos,
       porque nem todo lembrete é lista (pedido dele: total, parcial, editar)
     • adiar em um toque (Outlook), com a nova hora na trilha
     • a trilha é o histórico: quem criou, chamou, adiou, resolveu, comentou
     • o lembrete do ROBÔ nasce dos documentos faltantes e fecha sozinho
       quando o documento chega (lógica no banco, `lembretes_robo`)

   Folha própria com prefixo `lb-`, como a `bt-` da Bancada: `@container` e
   `:hover` não cabem em estilo inline. Cores só de lib/ui/painel.ts. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cor, raio } from '@/lib/ui/painel'
import { CATEGORIAS, RECORRENCIAS, STATUS, nomeCategoria, quandoLegivel, type ItemLembrete } from '@/lib/lembretes/regras'

interface Seguidor { auth_id: string; nome: string | null; papel: string; visto_em: string | null; convidado_por: string | null }
interface Evento { id: string; tipo: string; texto: string | null; por_nome: string | null; criado_em: string }
interface Lembrete {
  id: string; tomador_id: string | null; caso_id: string | null; operacao_id: string | null
  titulo: string; detalhe: string | null; categoria: string; area: string | null
  quando: string; recorrencia: string | null; itens: ItemLembrete[]
  status: string; prioridade: string; responsavel_auth_id: string | null; responsavel_nome: string | null
  origem: string; resolucao: string | null; resolvido_em: string | null; resolvido_por: string | null
  criado_por_nome: string | null; criado_em: string
  lembrete_seguidores: Seguidor[]; lembrete_eventos: Evento[]
}
interface Pessoa { auth_id: string; nome: string }

const FOLHA = `
.lb { container-type: inline-size; color: ${cor.texto}; font-size: 12.5px; }
.lb-topo { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.lb-topo h3 { margin: 0; font-size: 13.5px; font-weight: 700; color: ${cor.tinta}; flex: 1; min-width: 0; }
.lb-seg { display: inline-flex; border: 1px solid ${cor.borda}; border-radius: ${raio.controle}px; overflow: hidden; }
.lb-seg button { font: inherit; font-size: 12px; padding: 4px 10px; border: none; border-left: 1px solid ${cor.bordaSuave}; background: ${cor.papel}; color: ${cor.textoSub}; cursor: pointer; }
.lb-seg button:first-child { border-left: none; }
.lb-seg button.on { background: ${cor.acao}; color: ${cor.branco}; }
.lb-bt { font: inherit; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: ${raio.controle}px; border: 1px solid ${cor.borda};
  background: ${cor.papel}; color: ${cor.texto}; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.lb-bt:hover:not(:disabled) { border-color: ${cor.acaoClara}; color: ${cor.acao}; }
.lb-bt:disabled { opacity: .5; cursor: default; }
.lb-bt.cheio { background: ${cor.acao}; border-color: ${cor.acao}; color: ${cor.branco}; }
.lb-bt.cheio:hover:not(:disabled) { background: ${cor.tinta2}; color: ${cor.branco}; }
.lb-bt.mini { font-size: 11px; padding: 2px 8px; }
.lb-bt.link { border: none; background: none; padding: 2px 2px; color: ${cor.acao}; font-weight: 600; font-size: 11px; }
.lb-in { font: inherit; font-size: 13px; padding: 6px 9px; border: 1px solid ${cor.borda}; border-radius: ${raio.controle}px; background: ${cor.papel};
  color: ${cor.tinta}; outline: none; width: 100%; min-width: 0; box-sizing: border-box; }
.lb-in:focus { border-color: ${cor.bordaAtiva}; }
textarea.lb-in { resize: vertical; min-height: 60px; }
.lb-form { border: 1px solid ${cor.acao}; box-shadow: inset 3px 0 0 ${cor.acao}; border-radius: ${raio.cartao}px; padding: 12px 14px; margin-bottom: 12px; background: ${cor.papel}; }
.lb-grade { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px 12px; }
.lb-campo { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.lb-campo > span { font-size: 11.5px; color: ${cor.textoFraco}; }
.lb-campo.l2 { grid-column: span 2; }
.lb-campo.l4 { grid-column: 1 / -1; }
.lb-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.lb-chip { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid ${cor.borda}; background: ${cor.papel}; color: ${cor.textoSub}; cursor: pointer; }
.lb-chip.on { border-color: ${cor.acao}; background: ${cor.destaque}; color: ${cor.acao}; font-weight: 600; }
.lb-lista { display: flex; flex-direction: column; gap: 8px; }
.lb-item { border: 1px solid ${cor.borda}; border-radius: ${raio.cartao}px; background: ${cor.papel}; padding: 10px 12px; box-shadow: inset 3px 0 0 ${cor.acaoClara}; }
.lb-item.parcial { box-shadow: inset 3px 0 0 ${cor.ouro}; }
.lb-item.resolvido, .lb-item.cancelado { box-shadow: inset 3px 0 0 ${cor.areaOperacao}; background: ${cor.papelZebra}; }
.lb-item.cancelado { box-shadow: inset 3px 0 0 ${cor.borda}; }
.lb-item.vencido { box-shadow: inset 3px 0 0 ${cor.alerta}; }
.lb-cab { display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap; }
.lb-tit { font-size: 13px; font-weight: 700; color: ${cor.tinta}; flex: 1 1 220px; min-width: 0; overflow-wrap: anywhere; }
.lb-tag { font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px; border: 1px solid ${cor.borda}; color: ${cor.textoSub}; white-space: nowrap; }
.lb-tag.robo { border-color: ${cor.ouro}; color: ${cor.ouroTexto}; }
.lb-tag.alta { border-color: ${cor.alertaBorda}; color: ${cor.alerta}; }
.lb-tag.st-parcial { border-color: ${cor.ouro}; color: ${cor.ouroTexto}; }
.lb-tag.st-ok { border-color: ${cor.areaOperacao}; color: ${cor.areaOperacao}; }
.lb-meta { font-size: 11.5px; color: ${cor.textoSub}; margin-top: 4px; display: flex; gap: 4px 12px; flex-wrap: wrap; }
.lb-meta .venc { color: ${cor.alerta}; font-weight: 700; }
.lb-det { font-size: 12.5px; color: ${cor.texto}; margin-top: 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
.lb-itens { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 3px; }
.lb-itens label { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; cursor: pointer; }
.lb-itens input { margin-top: 2px; accent-color: ${cor.acao}; }
.lb-itens .ok { color: ${cor.textoFraco}; text-decoration: line-through; }
.lb-pessoas { font-size: 11.5px; color: ${cor.textoSub}; margin-top: 6px; }
.lb-pessoas b { color: ${cor.tinta}; font-weight: 600; }
.lb-acoes { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 8px; align-items: center; }
/* Pedido de 30/09/2026: botões pequenos, que aparecem ao passar o mouse. Ficam
   no lugar (só invisíveis) para o cartão não pular; o teclado também os acende
   (focus-within). No celular não existe "passar o mouse": lá ficam sempre à vista. */
.lb-item .lb-acoes { opacity: 0; transition: opacity .12s ease; }
.lb-item:hover .lb-acoes, .lb-item:focus-within .lb-acoes, .lb-item.aberto .lb-acoes { opacity: 1; }
.lb-tag.op { border-color: ${cor.areaOperacao}; color: ${cor.areaOperacao}; }
.lb-acoes select { width: auto; }
.lb-trilha { margin-top: 10px; border-top: 1px solid ${cor.bordaSuave}; padding-top: 8px; }
.lb-trilha ol { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.lb-trilha li { font-size: 11.5px; color: ${cor.textoSub}; }
.lb-trilha li b { color: ${cor.tinta}; font-weight: 600; }
.lb-trilha li.comentario { color: ${cor.texto}; }
.lb-aviso { font-size: 12px; border-radius: ${raio.controle}px; padding: 7px 10px; margin-bottom: 10px; border: 1px solid ${cor.borda}; background: ${cor.papelZebra}; color: ${cor.textoSub}; }
.lb-aviso.erro { border-color: ${cor.alertaBorda}; background: ${cor.alertaFundo}; color: ${cor.alerta}; }
.lb-vazio { font-size: 12.5px; color: ${cor.textoSub}; padding: 10px 0; }
@container (max-width: 620px) {
  .lb-grade { grid-template-columns: minmax(0,1fr) minmax(0,1fr); }
  .lb-campo.l2 { grid-column: 1 / -1; }
}
@container (max-width: 380px) {
  .lb-grade { grid-template-columns: minmax(0,1fr); }
}
@media (pointer: coarse) {
  .lb-item .lb-acoes { opacity: 1; }
  .lb-bt, .lb-chip, .lb-seg button { min-height: 40px; }
  .lb-in { font-size: 16px; min-height: 40px; }
  .lb-itens input { width: 20px; height: 20px; }
}
`

const FUSO = 'America/Sao_Paulo'
const diaSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: FUSO })
const horaSP = (d: Date) => d.toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false })
/* São Paulo não tem horário de verão desde 2019: -03:00 fixo, como no resto do CRM. */
const instante = (dia: string, hora: string) => new Date(`${dia}T${hora || '09:00'}:00-03:00`).toISOString()
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

interface Rascunho {
  titulo: string; categoria: string; dia: string; hora: string; recorrencia: string; prioridade: string
  responsavel: string; seguidores: string[]; itens: string; detalhe: string
}

function rascunhoNovo(eu: string): Rascunho {
  const amanha = new Date(Date.now() + 86400000)
  return { titulo: '', categoria: 'documento', dia: diaSP(amanha), hora: '09:00', recorrencia: '', prioridade: 'normal', responsavel: eu, seguidores: [], itens: '', detalhe: '' }
}

function rascunhoDe(l: Lembrete): Rascunho {
  const d = new Date(l.quando)
  return {
    titulo: l.titulo, categoria: l.categoria, dia: diaSP(d), hora: horaSP(d), recorrencia: l.recorrencia ?? '',
    prioridade: l.prioridade, responsavel: l.responsavel_auth_id ?? '', seguidores: [],
    itens: l.itens.map((i) => i.nome).join('\n'), detalhe: l.detalhe ?? '',
  }
}

export default function Lembretes({ tomadorId, casoId, operacaoId, titulo = 'Lembretes' }: {
  tomadorId?: string | null
  casoId?: string | null
  /** dentro da operação: o lembrete novo nasce ligado a ela (e ao tomador dela) */
  operacaoId?: string | null
  titulo?: string
}) {
  const [lista, setLista] = useState<Lembrete[] | null>(null)
  const [eu, setEu] = useState<{ id: string; nome: string } | null>(null)
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [filtro, setFiltro] = useState<'abertos' | 'resolvidos' | 'todos'>('abertos')
  const [form, setForm] = useState<{ id: string | null; r: Rascunho; orig?: Rascunho } | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [convidando, setConvidando] = useState<string | null>(null)
  const [escolhidos, setEscolhidos] = useState<string[]>([])
  const [comentario, setComentario] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')

  const consulta = useMemo(() => {
    const p = new URLSearchParams()
    if (tomadorId) p.set('tomador_id', tomadorId)
    if (casoId) p.set('caso_id', casoId)
    if (operacaoId) p.set('operacao_id', operacaoId)
    return p.toString()
  }, [tomadorId, casoId, operacaoId])

  const carregar = useCallback(async () => {
    if (!consulta) return
    try {
      const r = await fetch(`/api/lembretes?${consulta}`)
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui ler os lembretes.'); return }
      setLista(j.lembretes ?? [])
      setEu(j.eu ?? null)
    } catch { setErro('A conexão caiu ao ler os lembretes.') }
  }, [consulta])

  useEffect(() => { carregar() }, [carregar])

  // Os colegas que podem ser chamados: TODO usuário ativo (01/10/2026: "liberar o
  // lembrete para todos, principalmente a interação com os colegas").
  useEffect(() => {
    createClient().from('usuarios').select('auth_id, nome').eq('status', 'ativo').not('auth_id', 'is', null).order('nome')
      .then(({ data }) => setPessoas((data ?? []) as Pessoa[]))
  }, [])

  /* AO VIVO: o robô fecha um lembrete, um colega comenta, o relógio avisa, e
     a lista acompanha sem ninguém recarregar a página. */
  /* A trilha não filtra por tomador no Realtime (o evento só tem lembrete_id),
     então a tela ignora o que não é dela e junta rajadas numa leitura só: o
     robô mexe em vários lembretes de uma vez a cada 5 minutos. */
  const meus = useRef<Set<string>>(new Set())
  useEffect(() => { meus.current = new Set((lista ?? []).map((l) => l.id)) }, [lista])
  useEffect(() => {
    if (!tomadorId && !casoId && !operacaoId) return
    const sb = createClient()
    let espera: ReturnType<typeof setTimeout> | null = null
    const recarregar = () => { if (espera) clearTimeout(espera); espera = setTimeout(carregar, 600) }
    let canal = sb.channel(`lembretes-${tomadorId ?? ''}-${casoId ?? ''}-${operacaoId ?? ''}`)
    if (tomadorId) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'lembretes', filter: `tomador_id=eq.${tomadorId}` }, recarregar)
    if (casoId) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'lembretes', filter: `caso_id=eq.${casoId}` }, recarregar)
    if (operacaoId) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'lembretes', filter: `operacao_id=eq.${operacaoId}` }, recarregar)
    canal = canal.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lembrete_eventos' },
      (p) => { if (meus.current.has(String((p.new as { lembrete_id?: string }).lembrete_id))) recarregar() })
    canal.subscribe()
    return () => { if (espera) clearTimeout(espera); sb.removeChannel(canal) }
  }, [tomadorId, casoId, operacaoId, carregar])

  async function agir(corpo: Record<string, unknown>, metodo: 'PATCH' | 'POST' = 'PATCH', aviso?: string) {
    setOcupado(true); setErro(''); setRecado('')
    try {
      const r = await fetch('/api/lembretes', { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não deu certo.'); setOcupado(false); return false }
      if (aviso) setRecado(j.proximo ? `${aviso} O próximo já foi marcado, porque este lembrete repete.` : aviso)
      await carregar()
    } catch { setErro('A conexão caiu. Tente de novo.'); setOcupado(false); return false }
    setOcupado(false)
    return true
  }

  async function salvar() {
    if (!form || !eu) return
    const r = form.r
    if (r.titulo.trim().length < 2) { setErro('Escreva do que é o lembrete.'); return }
    const itens = r.itens.split('\n').map((x) => x.trim()).filter(Boolean)
    const base = {
      titulo: r.titulo, categoria: r.categoria, quando: instante(r.dia, r.hora), recorrencia: r.recorrencia,
      prioridade: r.prioridade, responsavel_auth_id: r.responsavel || eu.id, itens, detalhe: r.detalhe,
    }
    /* Na edição vai só o que a pessoa mexeu: a hora do robô tem segundos, e
       reenviá-la arredondada registraria "mudou a data" sem ninguém mexer; e o
       lembrete do robô sem responsável não ganha um só por ter sido editado. */
    const orig = form.orig
    const edicao: Record<string, unknown> = { ...base }
    if (orig && orig.dia === r.dia && orig.hora === r.hora) delete edicao.quando
    if (orig && orig.responsavel === r.responsavel) delete edicao.responsavel_auth_id
    const ok = form.id
      ? await agir({ id: form.id, acao: 'editar', ...edicao }, 'PATCH', 'Lembrete atualizado.')
      : await agir({ ...base, tomador_id: tomadorId ?? null, caso_id: casoId ?? null, operacao_id: operacaoId ?? null, seguidores: r.seguidores }, 'POST',
          r.seguidores.length ? 'Lembrete criado. Os colegas chamados já receberam o aviso.' : 'Lembrete criado.')
    if (ok) setForm(null)
  }

  const visiveis = (lista ?? []).filter((l) =>
    filtro === 'todos' ? true : filtro === 'abertos' ? ['aberto', 'parcial'].includes(l.status) : ['resolvido', 'cancelado'].includes(l.status))
  const nAbertos = (lista ?? []).filter((l) => ['aberto', 'parcial'].includes(l.status)).length
  /* Lembrete é conversa entre colegas: o perfil "Só leitura" vale para os dados
     do CRM, não para cá (01/10/2026). Basta estar logado e ativo; a trava é a
     RLS (`fam_e_usuario`). */
  const podeEditar = !!eu

  const set = (campo: keyof Rascunho, valor: string | string[]) =>
    setForm((f) => (f ? { ...f, r: { ...f.r, [campo]: valor } } : f))

  return (
    <div className="lb">
      <style>{FOLHA}</style>

      <div className="lb-topo">
        <h3>{titulo}{nAbertos ? ` · ${nAbertos} em aberto` : ''}</h3>
        <div className="lb-seg" role="tablist">
          {(['abertos', 'resolvidos', 'todos'] as const).map((f) => (
            <button key={f} type="button" className={filtro === f ? 'on' : ''} onClick={() => setFiltro(f)}>
              {f === 'abertos' ? 'Em aberto' : f === 'resolvidos' ? 'Resolvidos' : 'Todos'}
            </button>
          ))}
        </div>
        {podeEditar && eu && !form && (
          <button type="button" className="lb-bt mini cheio" onClick={() => { setErro(''); setForm({ id: null, r: rascunhoNovo(eu.id) }) }}>
            Novo lembrete
          </button>
        )}
      </div>

      {erro && <div className="lb-aviso erro">{erro}</div>}
      {recado && <div className="lb-aviso">{recado}</div>}

      {/* ── o formulário: criar ou editar ── */}
      {form && (
        <div className="lb-form">
          <div className="lb-grade">
            <label className="lb-campo l4">
              <span>Do que é o lembrete</span>
              <input className="lb-in" autoFocus value={form.r.titulo} maxLength={200}
                placeholder="Ex.: cobrar o balanço 2025 da corretora" onChange={(e) => set('titulo', e.target.value)} />
            </label>
            <label className="lb-campo l2">
              <span>Categoria</span>
              <select className="lb-in" value={form.r.categoria} onChange={(e) => set('categoria', e.target.value)}>
                {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="lb-campo">
              <span>Dia do aviso</span>
              <input className="lb-in" type="date" value={form.r.dia} onChange={(e) => set('dia', e.target.value)} />
            </label>
            <label className="lb-campo">
              <span>Hora</span>
              <input className="lb-in" type="time" value={form.r.hora} onChange={(e) => set('hora', e.target.value)} />
            </label>
            <label className="lb-campo">
              <span>Repete</span>
              <select className="lb-in" value={form.r.recorrencia} onChange={(e) => set('recorrencia', e.target.value)}>
                {RECORRENCIAS.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
            </label>
            <label className="lb-campo">
              <span>Prioridade</span>
              <select className="lb-in" value={form.r.prioridade} onChange={(e) => set('prioridade', e.target.value)}>
                <option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option>
              </select>
            </label>
            <label className="lb-campo l2">
              <span>Responsável</span>
              <select className="lb-in" value={form.r.responsavel} onChange={(e) => set('responsavel', e.target.value)}>
                {!form.r.responsavel && <option value="">Sem responsável</option>}
                {pessoas.map((p) => <option key={p.auth_id} value={p.auth_id}>{p.nome}{p.auth_id === eu?.id ? ' (você)' : ''}</option>)}
              </select>
            </label>
            {!form.id && (
              <div className="lb-campo l4">
                <span>Chamar colegas para acompanhar (recebem o aviso junto, como numa reunião)</span>
                <div className="lb-chips">
                  {pessoas.filter((p) => p.auth_id !== eu?.id && p.auth_id !== form.r.responsavel).map((p) => {
                    const on = form.r.seguidores.includes(p.auth_id)
                    return (
                      <button key={p.auth_id} type="button" className={`lb-chip${on ? ' on' : ''}`} aria-pressed={on}
                        onClick={() => set('seguidores', on ? form.r.seguidores.filter((x) => x !== p.auth_id) : [...form.r.seguidores, p.auth_id])}>
                        {p.nome}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <label className="lb-campo l2">
              <span>O que falta (um por linha: vira lista para marcar)</span>
              <textarea className="lb-in" value={form.r.itens} rows={3} placeholder={'Serasa do tomador\nBalanço 2025'}
                onChange={(e) => set('itens', e.target.value)} />
            </label>
            <label className="lb-campo l2">
              <span>Detalhe</span>
              <textarea className="lb-in" value={form.r.detalhe} rows={3} maxLength={2000} onChange={(e) => set('detalhe', e.target.value)} />
            </label>
          </div>
          <div className="lb-acoes">
            <button type="button" className="lb-bt cheio" disabled={ocupado} onClick={salvar}>
              {ocupado ? 'Salvando…' : form.id ? 'Salvar' : 'Criar lembrete'}
            </button>
            <button type="button" className="lb-bt" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── a lista ── */}
      {lista === null ? (
        <div className="lb-vazio">Lendo os lembretes…</div>
      ) : visiveis.length === 0 ? (
        <div className="lb-vazio">
          {filtro === 'abertos' ? 'Nenhum lembrete em aberto. O robô abre sozinho quando falta documento.' : 'Nada por aqui.'}
        </div>
      ) : (
        <div className="lb-lista">
          {visiveis.map((l) => {
            const q = quandoLegivel(l.quando)
            const vivo = ['aberto', 'parcial'].includes(l.status)
            const vencido = vivo && q.vencido
            const st = STATUS[l.status] ?? STATUS.aberto
            const sigo = l.lembrete_seguidores.some((s) => s.auth_id === eu?.id)
            const outros = l.lembrete_seguidores.filter((s) => s.papel !== 'responsavel')
            const eventos = [...l.lembrete_eventos].sort((a, b) => a.criado_em.localeCompare(b.criado_em))
            const expandido = aberto === l.id
            return (
              <div key={l.id} className={`lb-item ${l.status}${vencido ? ' vencido' : ''}${expandido || convidando === l.id ? ' aberto' : ''}`}>
                <div className="lb-cab">
                  <div className="lb-tit">{l.titulo}</div>
                  {l.origem === 'robo' && <span className="lb-tag robo">Robô do tomador</span>}
                  {l.operacao_id && <span className="lb-tag op">{l.operacao_id === operacaoId ? 'Desta operação' : 'Operação'}</span>}
                  {l.prioridade === 'alta' && <span className="lb-tag alta">Prioridade alta</span>}
                  <span className={`lb-tag ${st.tom === 'parcial' ? 'st-parcial' : st.tom === 'ok' ? 'st-ok' : ''}`}>{st.nome}</span>
                </div>
                <div className="lb-meta">
                  <span>{nomeCategoria(l.categoria)}</span>
                  <span className={vencido ? 'venc' : ''}>{vencido ? `Venceu ${q.txt}` : `Aviso ${q.txt}`}</span>
                  {l.recorrencia && <span>{RECORRENCIAS.find((r) => r.id === l.recorrencia)?.nome}</span>}
                  {l.resolvido_em && <span>{l.status === 'cancelado' ? 'Cancelado' : 'Resolvido'} por {l.resolvido_por} em {dataHora(l.resolvido_em)}</span>}
                </div>
                {l.detalhe && <div className="lb-det">{l.detalhe}</div>}
                {l.resolucao && <div className="lb-det" style={{ color: cor.textoSub }}>{l.resolucao}</div>}

                {l.itens.length > 0 && (
                  <ul className="lb-itens">
                    {l.itens.map((i) => (
                      <li key={i.nome}>
                        <label>
                          <input type="checkbox" checked={i.ok} disabled={!podeEditar || ocupado || l.status === 'cancelado'}
                            onChange={(e) => agir({ id: l.id, acao: 'item', nome: i.nome, ok: e.target.checked })} />
                          <span className={i.ok ? 'ok' : ''}>{i.nome}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="lb-pessoas">
                  Responsável: <b>{l.responsavel_nome ?? 'sem responsável'}</b>
                  {outros.length > 0 && <> · acompanham: {outros.map((s) => s.nome).join(', ')}</>}
                </div>

                <div className="lb-acoes">
                  {podeEditar && vivo && (
                    <>
                      <button type="button" className="lb-bt mini cheio" disabled={ocupado}
                        onClick={() => { const n = window.prompt('Resolvido. Quer deixar uma nota? (opcional)') ; if (n !== null) agir({ id: l.id, acao: 'resolver', nota: n }, 'PATCH', 'Marcado como resolvido.') }}>
                        Resolvido total
                      </button>
                      <button type="button" className="lb-bt mini" disabled={ocupado}
                        onClick={() => { const n = window.prompt('O que foi resolvido e o que ainda falta?'); if (n && n.trim()) agir({ id: l.id, acao: 'parcial', nota: n }, 'PATCH', 'Marcado como resolvido parcial.') }}>
                        Resolvido parcial
                      </button>
                      <select className="lb-in lb-bt mini" value="" disabled={ocupado} aria-label="Adiar"
                        onChange={(e) => { const m = Number(e.target.value); if (m) agir({ id: l.id, acao: 'adiar', minutos: m }, 'PATCH', 'Adiado.') }}>
                        <option value="">Adiar…</option>
                        <option value="60">1 hora</option>
                        <option value="240">4 horas</option>
                        <option value="1440">1 dia</option>
                        <option value="4320">3 dias</option>
                        <option value="10080">1 semana</option>
                      </select>
                    </>
                  )}
                  {podeEditar && (
                    <button type="button" className="lb-bt mini" onClick={() => { setErro(''); setForm({ id: l.id, r: rascunhoDe(l), orig: rascunhoDe(l) }); window.scrollTo?.({ top: 0 }) }}>
                      Editar
                    </button>
                  )}
                  {podeEditar && vivo && (
                    <button type="button" className="lb-bt mini" onClick={() => { setConvidando(convidando === l.id ? null : l.id); setEscolhidos([]) }}>
                      Chamar colega
                    </button>
                  )}
                  {podeEditar && !vivo && (
                    <button type="button" className="lb-bt mini" disabled={ocupado} onClick={() => agir({ id: l.id, acao: 'reabrir' }, 'PATCH', 'Reaberto.')}>Reabrir</button>
                  )}
                  {eu && (sigo
                    ? l.responsavel_auth_id !== eu.id && <button type="button" className="lb-bt link" disabled={ocupado} onClick={() => agir({ id: l.id, acao: 'sair' })}>Deixar de acompanhar</button>
                    : podeEditar && <button type="button" className="lb-bt link" disabled={ocupado} onClick={() => agir({ id: l.id, acao: 'seguir' })}>Acompanhar</button>)}
                  <button type="button" className="lb-bt link" onClick={() => { setAberto(expandido ? null : l.id); setComentario('') }}>
                    {expandido ? 'Fechar histórico' : `Histórico e comentários (${eventos.length})`}
                  </button>
                  {podeEditar && vivo && (
                    <button type="button" className="lb-bt link" style={{ color: cor.textoFraco }} disabled={ocupado}
                      onClick={() => { const n = window.prompt('Cancelar este lembrete? Diga o motivo (opcional).'); if (n !== null) agir({ id: l.id, acao: 'cancelar', nota: n }, 'PATCH', 'Cancelado.') }}>
                      Cancelar
                    </button>
                  )}
                </div>

                {convidando === l.id && (
                  <div style={{ marginTop: 8 }}>
                    <div className="lb-chips">
                      {pessoas.filter((p) => !l.lembrete_seguidores.some((s) => s.auth_id === p.auth_id)).map((p) => {
                        const on = escolhidos.includes(p.auth_id)
                        return (
                          <button key={p.auth_id} type="button" className={`lb-chip${on ? ' on' : ''}`} aria-pressed={on}
                            onClick={() => setEscolhidos(on ? escolhidos.filter((x) => x !== p.auth_id) : [...escolhidos, p.auth_id])}>
                            {p.nome}
                          </button>
                        )
                      })}
                    </div>
                    <div className="lb-acoes">
                      <button type="button" className="lb-bt mini cheio" disabled={!escolhidos.length || ocupado}
                        onClick={async () => { if (await agir({ id: l.id, acao: 'convidar', pessoas: escolhidos }, 'PATCH', 'Colegas chamados. Eles já receberam o aviso.')) setConvidando(null) }}>
                        Chamar {escolhidos.length || ''}
                      </button>
                    </div>
                  </div>
                )}

                {expandido && (
                  <div className="lb-trilha">
                    <ol>
                      {eventos.map((e) => (
                        <li key={e.id} className={e.tipo}>
                          {dataHora(e.criado_em)} · <b>{e.por_nome ?? 'Sistema'}</b>: {e.texto}
                        </li>
                      ))}
                    </ol>
                    {podeEditar && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <input className="lb-in" style={{ flex: '1 1 220px' }} value={comentario} maxLength={2000}
                          placeholder="Escreva um comentário para quem acompanha" onChange={(e) => setComentario(e.target.value)}
                          onKeyDown={async (e) => { if (e.key === 'Enter' && comentario.trim() && await agir({ id: l.id, acao: 'comentar', texto: comentario })) setComentario('') }} />
                        <button type="button" className="lb-bt mini" disabled={!comentario.trim() || ocupado}
                          onClick={async () => { if (await agir({ id: l.id, acao: 'comentar', texto: comentario })) setComentario('') }}>
                          Comentar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
