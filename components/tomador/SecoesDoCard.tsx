'use client'

// ============================================================================
//  O CARD DO TOMADOR COM UMA SEÇÃO POR ÁREA
//
//  Porta a tela "mesa" do protótipo (`prototipo/prototipo-crm-fam.html`) para
//  dentro do CRM, sobre `tomadores`. Desenho fechado com ele em 04/09/2026 e
//  confirmado em 08/09:
//
//   • as cinco seções nascem juntas (o gatilho `trg_abre_secoes_do_card` cuida),
//     cada uma com dono, estado e registro;
//   • a central é de UMA área por vez: quem tem a central escreve o oficial, e
//     quem não tem escreve rascunho da própria área;
//   • concluir vira leitura; reabrir é evento visível, com autor e motivo;
//   • o Jurídico não entra na fila: é chamado ou se chama a qualquer momento,
//     escreve sem depender da central, PARALISA o fluxo e PEDE informação.
//
//  A REGRA NÃO MORA AQUI. Pendência, permissão e trava vêm de
//  `lib/card/secoes.ts`, porque o cartão do Funil mostra a mesma coisa. Duas
//  cópias da regra viram, um dia, duas respostas para a mesma pergunta.
//
//  A TRAVA DE VERDADE É A RLS (`card_secoes_update` usa `fam_minhas_areas()`).
//  O que esta tela faz é esconder o botão e explicar por quê.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtData, fmtMoeda } from '@/lib/utils'
import {
  AREAS, ORDEM, REGUA, nomeArea, proximaArea, podeOficial, podeEscreverNaSecao,
  podeReabrir, souDaArea, temCentral, pendencias, travaConcluir, quemParalisa, temItem,
  ESPERAM_SUBSCRICAO,
  type AreaId, type PostoCentral, type Secao, type EventoCard, type ItemCatalogo,
  type Quem, type DadosDoCard,
} from '@/lib/card/secoes'

interface OperacaoDoCard {
  id: string
  modalidade: string | null
  status: string | null
  lmg: number | string | null
  taxa: number | string | null
  voto_subscricao: string | null
}

interface Props {
  tomadorId: string
  cnpj: string | null
  centralInicial: string | null
  operacoes: OperacaoDoCard[]
  /** a análise vigente publicada no CRM, quando existe */
  analise: { recomendacao: string | null; data_analise: string | null; limite: number | null; limiteAnulado: boolean } | null
  /** avisa a Mesa que a central mudou, para o cabeçalho acompanhar */
  onMudou?: () => void
}

const ETIQUETA: Record<string, { txt: string; cls: string }> = {
  dormente: { txt: 'dormente', cls: 'cinza' },
  aberta: { txt: 'aberta', cls: 'azul' },
  concluida: { txt: 'concluída', cls: 'verde' },
}

/** "hoje 14:32" para o que é de hoje, data curta para o resto. É como o
 *  protótipo carimba o histórico. */
function quando(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return mesmoDia ? `hoje ${hora}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`
}

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}


export default function SecoesDoCard({ tomadorId, cnpj, centralInicial, operacoes, analise, onMudou }: Props) {
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [eventos, setEventos] = useState<EventoCard[]>([])
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [arquivos, setArquivos] = useState<string[]>([])
  const [quem, setQuem] = useState<Quem | null>(null)
  // Quem é dono de cada área, pelo cadastro de usuários. O protótipo mostra o
  // NOME da pessoa no cabeçalho da seção, e não o nome da área.
  const [donos, setDonos] = useState<Record<string, string[]>>({})
  const [central, setCentral] = useState<PostoCentral>((centralInicial as PostoCentral) || 'comercial')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [abertas, setAbertas] = useState<Record<string, boolean>>({})
  const [msgNova, setMsgNova] = useState('')
  // rascunho de digitação, para o textarea não perder o que está sendo escrito
  const [texto, setTexto] = useState<Record<string, string>>({})
  const [modal, setModal] = useState<{ tipo: 'reabrir' | 'paralisar' | 'pedido'; area: AreaId } | null>(null)
  const [modalTxt, setModalTxt] = useState('')
  const [modalPara, setModalPara] = useState<AreaId>('cadastro')

  // ── carga ──
  const carregar = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const [secs, evs, cat, anx, docs, eu, todos] = await Promise.all([
      supabase.from('card_secoes').select('*').eq('tomador_id', tomadorId),
      supabase.from('card_eventos').select('*').eq('tomador_id', tomadorId)
        .order('criado_em', { ascending: false }).limit(80),
      supabase.from('caso_item_catalogo').select('*').eq('ativo', true).order('ordem'),
      supabase.from('anexos').select('nome_original').eq('tomador_id', tomadorId),
      supabase.from('analise_documentos').select('nome').eq('tomador_id', tomadorId),
      user
        ? supabase.from('usuarios').select('nome, areas, diretoria, perfil').eq('auth_id', user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('usuarios').select('nome, areas').eq('status', 'ativo'),
    ])

    setSecoes(((secs.data ?? []) as Secao[]))
    setEventos(((evs.data ?? []) as EventoCard[]))
    setCatalogo(((cat.data ?? []) as ItemCatalogo[]))
    setArquivos([
      ...((anx.data ?? []) as { nome_original: string }[]).map(a => a.nome_original),
      ...((docs.data ?? []) as { nome: string }[]).map(d => d.nome),
    ])
    const u = eu.data as { nome: string | null; areas: string[] | null; diretoria: boolean | null; perfil: string | null } | null
    setQuem({
      nome: u?.nome ?? 'sem nome',
      areas: ((u?.areas ?? []) as AreaId[]),
      diretoria: !!u?.diretoria,
      podeEscrever: (u?.perfil ?? 'leitura') !== 'leitura',
    })
    const mapaDonos: Record<string, string[]> = {}
    ;((todos.data ?? []) as { nome: string; areas: string[] | null }[]).forEach(u => {
      (u.areas ?? []).forEach(a => { mapaDonos[a] = [...(mapaDonos[a] ?? []), u.nome] })
    })
    setDonos(mapaDonos)

    if (secs.error) setErro(secs.error.message)
    setCarregando(false)
  }, [tomadorId])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setCentral(((centralInicial as PostoCentral) || 'comercial')) }, [centralInicial])

  // ── o que a regra precisa saber do card ──
  const dados: DadosDoCard = useMemo(() => ({
    cnpj,
    arquivos,
    analise: analise ? { recomendacao: analise.recomendacao, data_analise: analise.data_analise } : null,
    operacoesVivas: operacoes
      .filter(o => ESPERAM_SUBSCRICAO.has(o.status ?? ''))
      .map(o => ({ id: o.id, modalidade: o.modalidade, taxa: num(o.taxa) || null, voto: o.voto_subscricao })),
  }), [cnpj, arquivos, analise, operacoes])

  const parada = quemParalisa(secoes)

  // ── escrita ──
  const registra = useCallback(async (area: string, txt: string) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('card_eventos').insert({
      tomador_id: tomadorId, tipo: 'evento', area, texto: txt,
      autor_nome: quem?.nome ?? null, autor_auth_id: user?.id ?? null,
    })
  }, [tomadorId, quem])

  const mudaSecao = useCallback(async (id: string, patch: Record<string, unknown>) => {
    const supabase = createClient()
    const { error } = await supabase.from('card_secoes')
      .update({ ...patch, atualizado_em: new Date().toISOString() }).eq('id', id)
    if (error) { setErro(error.message); return false }
    return true
  }, [])

  const salvarTexto = async (s: Secao) => {
    const valor = texto[s.id] ?? ''
    setSalvando(s.id)
    const oficial = podeOficial(s, central, quem ?? { nome: '', areas: [], diretoria: false, podeEscrever: false })
      || (s.area === 'juridico' && podeEscreverNaSecao(s, central, quem ?? { nome: '', areas: [], diretoria: false, podeEscrever: false }))
    const ok = await mudaSecao(s.id, oficial
      ? { texto: valor }
      : { rascunho: valor, rascunho_por: quem?.nome ?? null, rascunho_em: new Date().toISOString() })
    if (ok) await carregar()
    setSalvando(null)
  }

  const salvarCampo = async (s: Secao, chave: string, valor: string) => {
    setSalvando(s.id)
    const ok = await mudaSecao(s.id, { campos: { ...(s.campos ?? {}), [chave]: valor } })
    if (ok) await carregar()
    setSalvando(null)
  }

  const concluir = async (s: Secao) => {
    if (!quem) return
    const trava = travaConcluir(s, dados, catalogo, quem, central, secoes)
    if (trava) { setErro(trava); return }
    setSalvando(s.id)
    const destino = proximaArea(s.area)
    const ok = await mudaSecao(s.id, {
      estado: 'concluida',
      concluida_em: new Date().toISOString(),
      concluida_por: quem.nome,
    })
    if (ok) {
      const supabase = createClient()
      // A central anda junto, e a seção de destino acorda se estiver dormindo.
      await supabase.from('tomadores').update({ central_area: destino }).eq('id', tomadorId)
      const alvo = secoes.find(x => x.area === destino)
      if (alvo && alvo.estado === 'dormente') await mudaSecao(alvo.id, { estado: 'aberta' })
      await registra(s.area,
        `Seção concluída por ${quem.nome}. Central passou para ${nomeArea(destino)}.`
        + (s.pendencia_texto ? ` Com pendência escrita: "${s.pendencia_texto}".` : ''))
      setCentral(destino)
      await carregar()
      onMudou?.()
    }
    setSalvando(null)
  }

  const confirmaModal = async () => {
    if (!modal || !quem) return
    const s = secoes.find(x => x.area === modal.area)
    if (!s) return
    const motivo = modalTxt.trim()
    setSalvando(s.id)
    const supabase = createClient()

    if (modal.tipo === 'reabrir') {
      const ok = await mudaSecao(s.id, {
        estado: 'aberta', concluida_em: null, concluida_por: null,
        reaberta_em: new Date().toISOString(), reaberta_por: quem.nome,
        reaberta_motivo: motivo || 'sem motivo informado',
      })
      if (ok) {
        await supabase.from('tomadores').update({ central_area: s.area }).eq('id', tomadorId)
        await registra(s.area, `Seção reaberta por ${quem.nome}: "${motivo || 'sem motivo informado'}". A central voltou para ${nomeArea(s.area)}.`)
        setCentral(s.area)
      }
    }

    if (modal.tipo === 'paralisar') {
      const ok = await mudaSecao(s.id, {
        paralisa: true, paralisa_motivo: motivo || 'sem motivo informado',
        paralisa_por: quem.nome, paralisa_em: new Date().toISOString(),
      })
      if (ok) await registra(s.area, `${nomeArea(s.area)} PARALISOU o fluxo (${quem.nome}): "${motivo || 'sem motivo informado'}". Nenhuma seção conclui até liberar.`)
    }

    if (modal.tipo === 'pedido') {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('card_eventos').insert({
        tomador_id: tomadorId, tipo: 'pedido', area: s.area, para_area: modalPara,
        texto: motivo, autor_nome: quem.nome, autor_auth_id: user?.id ?? null,
      })
    }

    setModal(null); setModalTxt('')
    await carregar()
    onMudou?.()
    setSalvando(null)
  }

  const liberar = async (s: Secao) => {
    if (!quem) return
    setSalvando(s.id)
    const ok = await mudaSecao(s.id, { paralisa: false, paralisa_motivo: null, paralisa_por: null, paralisa_em: null })
    if (ok) await registra(s.area, `${nomeArea(s.area)} liberou o fluxo (${quem.nome}). O card volta a andar.`)
    await carregar()
    setSalvando(null)
  }

  const promoverRascunho = async (s: Secao) => {
    setSalvando(s.id)
    const ok = await mudaSecao(s.id, { texto: s.rascunho, rascunho: null, rascunho_por: null, rascunho_em: null })
    if (ok) await registra(s.area, 'Rascunho da área confirmado como registro oficial.')
    await carregar()
    setSalvando(null)
  }

  const chamarJuridico = async () => {
    const j = secoes.find(s => s.area === 'juridico')
    if (!j || !quem) return
    setSalvando(j.id)
    const ok = await mudaSecao(j.id, { estado: 'aberta' })
    if (ok) await registra('juridico', `Jurídico acionado por ${quem.nome}. A central segue com ${nomeArea(central)}: o Jurídico entra sem parar a esteira.`)
    await carregar()
    setSalvando(null)
  }

  const mandarMensagem = async () => {
    const t = msgNova.trim()
    if (!t || !quem) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('card_eventos').insert({
      tomador_id: tomadorId, tipo: 'mensagem', area: quem.areas[0] ?? null, texto: t,
      autor_nome: quem.nome, autor_auth_id: user?.id ?? null,
    })
    setMsgNova('')
    await carregar()
  }

  const responderPedido = async (ev: EventoCard, resposta: string) => {
    const supabase = createClient()
    await supabase.from('card_eventos').update({
      resposta, resolvido_em: new Date().toISOString(), resolvido_por: quem?.nome ?? null,
    }).eq('id', ev.id)
    await carregar()
  }

  if (carregando) return <div className="cs-painel"><div className="cs-explica">Abrindo o card…</div></div>

  if (!secoes.length) {
    return (
      <div className="cs-painel">
        <div className="cs-aviso alerta">
          Este card ainda não tem seções. Elas nascem junto com o tomador (gatilho
          <code> trg_abre_secoes_do_card</code>); um tomador criado antes disso precisa da carga.
        </div>
      </div>
    )
  }

  const eu = quem ?? { nome: '', areas: [] as AreaId[], diretoria: false, podeEscrever: false }
  const pedidosAbertos = eventos.filter(e => e.tipo === 'pedido' && !e.resolvido_em)

  return (
    <div>
      {erro && <div className="cs-aviso ruim">{erro}</div>}

      {/* ══ a régua: onde o card está ══ */}
      <div className="cs-painel">
        <div className="cs-titulo">
          Onde o card está
          <span className="dir">a central é de uma área por vez</span>
        </div>
        <div className="cs-esteira">
          {REGUA.map(posto => {
            const eh = central === posto
            const s = secoes.find(x => x.area === posto)
            const feita = posto === 'emissao'
              ? operacoes.some(o => o.status === 'Emitido')
              : s?.estado === 'concluida'
            return (
              <div key={posto} className={`cs-eta ${eh ? 'central' : feita ? 'feita' : ''}`}>
                <div className="en">{nomeArea(posto)}</div>
                <div className="es">
                  {eh ? 'com a central' : feita ? (posto === 'emissao' ? 'já emitiu' : 'concluída') : 'aguarda'}
                </div>
              </div>
            )
          })}
        </div>

        {parada && (
          <div className="cs-aviso alerta" style={{ marginBottom: 0 }}>
            ⚠ {nomeArea(parada.area)} paralisou o fluxo{parada.paralisa_por ? ` (${parada.paralisa_por})` : ''}:
            {' '}“{parada.paralisa_motivo || 'sem motivo escrito'}”. Nenhuma seção conclui enquanto isso valer.
          </div>
        )}

        {!parada && pedidosAbertos.length > 0 && (
          <div className="cs-aviso info" style={{ marginBottom: 0 }}>
            {pedidosAbertos.length === 1 ? 'Há um pedido de informação em aberto' : `Há ${pedidosAbertos.length} pedidos de informação em aberto`}
            {' '}neste card. Eles estão na conversa entre áreas, embaixo.
          </div>
        )}
      </div>

      {/* ══ as seções ══ */}
      <div style={{ marginTop: 14 }}>
        {AREAS.slice().sort((a, b) => (a.ordem || 9) - (b.ordem || 9)).map(area => {
          const s = secoes.find(x => x.area === area.id)
          if (!s) return null
          const oficial = podeOficial(s, central, eu)
          const escreve = podeEscreverNaSecao(s, central, eu)
          const minha = souDaArea(eu, area.id)
          const comCentral = temCentral(central, area.id)
          const pend = pendencias(area.id, s, dados, catalogo)
          const trava = travaConcluir(s, dados, catalogo, eu, central, secoes)
          // No protótipo as cinco seções estão SEMPRE à vista: é o que ensina
          // que elas nascem juntas. O clique no cabeçalho recolhe, mas o
          // padrão é aberto, inclusive na concluída (que vira leitura).
          const aberta = abertas[s.id] ?? true
          const valor = texto[s.id] ?? (oficial ? (s.texto ?? '') : (s.rascunho ?? s.texto ?? ''))

          return (
            <div key={s.id} className={`cs-secao ${comCentral ? 'tem-central' : ''} ${s.paralisa ? 'parada' : ''}`}>
              <button type="button" className="cs-secao-cab"
                onClick={() => setAbertas(a => ({ ...a, [s.id]: !aberta }))}>
                <span style={{ fontSize: 16 }}>{area.icone}</span>
                <div>
                  <div className="nome">{area.nome}</div>
                  <div className="dono">
                    {s.estado === 'concluida' && s.concluida_por
                      ? `concluída por ${s.concluida_por}${s.concluida_em ? ' em ' + fmtData(s.concluida_em) : ''}`
                      : donos[area.id]?.length
                        ? `dono: ${donos[area.id].join(', ')}`
                        : 'sem dono cadastrado (só a diretoria escreve)'}
                  </div>
                </div>
                <div className="dir">
                  {s.paralisa && <span className="cs-eti laranja">⏸ paralisou o fluxo</span>}
                  {comCentral && <span className="cs-eti ouro">★ com a central</span>}
                  {s.rascunho && <span className="cs-eti roxo">rascunho</span>}
                  <span className={`cs-eti ${ETIQUETA[s.estado].cls}`}>{ETIQUETA[s.estado].txt}</span>
                  <span style={{ color: '#6080a0', fontSize: 12 }}>{aberta ? '▾' : '▸'}</span>
                </div>
              </button>

              {aberta && (
                <div className="cs-secao-corpo">
                  {/* quem pode escrever o quê */}
                  {s.estado === 'concluida' ? (
                    <div className="cs-aviso info">
                      Seção concluída: virou só leitura. Reabrir é evento visível, com quem pediu e por quê.
                      {s.pendencia_texto ? ` Foi concluída com pendência escrita: “${s.pendencia_texto}”.` : ''}
                    </div>
                  ) : s.estado === 'dormente' ? (
                    <div className="cs-aviso info">
                      Nasceu junto com o card e está dormindo. Qualquer área pode acionar a qualquer
                      momento, sem parar a central.
                    </div>
                  ) : !minha ? (
                    <div className="cs-aviso info">
                      Você está como <b>{eu.nome}</b>{eu.areas.length ? ` · ${eu.areas.map(nomeArea).join(', ')}` : ''}.
                      Aqui você lê e comenta; quem escreve é {nomeArea(area.id)}.
                    </div>
                  ) : area.id === 'juridico' ? (
                    <div className="cs-aviso bom">
                      O Jurídico não espera a central: escreve aqui a qualquer momento, e o que
                      escrever já é o registro oficial da área.
                    </div>
                  ) : !comCentral ? (
                    <div className="cs-aviso alerta">
                      A central está com <b>{nomeArea(central)}</b>. O que você escrever aqui fica
                      como <b>rascunho da sua área</b> e vira oficial quando a central chegar.
                    </div>
                  ) : null}

                  {/* ── o miolo de cada área ── */}
                  {area.id === 'comercial' && s.estado === 'concluida' && (
                    <>
                      <span className="cs-rot">Temperatura da conta</span>
                      <div className="cs-leitura" style={{ marginBottom: 11 }}>
                        {String(s.campos?.['temperatura'] ?? '—')}
                      </div>
                    </>
                  )}
                  {area.id === 'comercial' && s.estado !== 'concluida' && (
                    <div className="cs-bloco">
                      <span className="cs-rot">Temperatura da conta</span>
                      <select className="cs-campo" style={{ maxWidth: 220 }}
                        disabled={!escreve}
                        value={String(s.campos?.['temperatura'] ?? '')}
                        onChange={e => salvarCampo(s, 'temperatura', e.target.value)}>
                        {['', 'Nova', 'Fria', 'Morna', 'Quente'].map(t => <option key={t} value={t}>{t || '—'}</option>)}
                      </select>
                    </div>
                  )}

                  {area.id === 'cadastro' && (
                    <>
                      <div className="cs-explica">
                        A lista vem de <b>caso_item_catalogo</b> e o “recebido” é lido dos arquivos do
                        tomador (anexos e documentos da análise). Ninguém marca à mão: se o arquivo
                        está lá, o item está atendido.
                      </div>
                      {catalogo.map(item => {
                        const tem = temItem(item, arquivos)
                        return (
                          <div key={item.id} className="cs-check">
                            <span>{tem ? '✓' : '○'}</span>
                            <span>{item.nome}</span>
                            <span className={tem ? 'veio' : item.exigencia === 'bloqueia' ? 'falta' : 'avisa'}>
                              {tem ? 'recebido' : item.exigencia === 'bloqueia' ? 'falta (trava)' : 'falta (sinaliza)'}
                            </span>
                          </div>
                        )
                      })}
                      {!cnpj && (
                        <div className="cs-aviso ruim" style={{ marginTop: 10 }}>
                          Este tomador está sem CNPJ. É a chave que liga o card à análise: sem ela, a
                          análise publicada não encontra o cadastro.
                        </div>
                      )}
                    </>
                  )}

                  {area.id === 'credito' && (
                    <>
                      {analise ? (
                        <div className="cs-aviso bom">
                          Análise publicada no CRM
                          {analise.data_analise ? ` em ${fmtData(analise.data_analise)}` : ''}
                          {analise.recomendacao ? ` · recomendação: ${analise.recomendacao}` : ''}
                          {analise.limite && !analise.limiteAnulado ? ` · limite recomendado ${fmtMoeda(analise.limite)}` : ''}
                          {analise.limiteAnulado ? ' · limite recomendado com ressalva escrita (o número não vale sozinho)' : ''}
                        </div>
                      ) : (
                        <div className="cs-aviso alerta">
                          Sem análise publicada no CRM para este tomador. Dá para concluir assim mesmo,
                          desde que a pendência esteja escrita abaixo. Decisão dele em 08/09/2026.
                        </div>
                      )}
                      {s.estado === 'concluida' ? (
                        <>
                          <span className="cs-rot">Recomendação</span>
                          <div className="cs-leitura" style={{ marginBottom: 11 }}>
                            {String(s.campos?.['recomendacao'] ?? analise?.recomendacao ?? '—')}
                          </div>
                        </>
                      ) : (
                      <div className="cs-bloco">
                        <span className="cs-rot">Recomendação</span>
                        <select className="cs-campo" style={{ maxWidth: 260 }}
                          disabled={!escreve}
                          value={String(s.campos?.['recomendacao'] ?? analise?.recomendacao ?? '')}
                          onChange={e => salvarCampo(s, 'recomendacao', e.target.value)}>
                          {['', 'Aprovar', 'Aprovar com ressalvas', 'Reprovar'].map(t => <option key={t} value={t}>{t || '—'}</option>)}
                        </select>
                      </div>
                      )}
                    </>
                  )}

                  {area.id === 'subscricao' && (
                    <>
                      <div className="cs-explica">
                        Taxa e voto moram na operação, e é de lá que esta seção lê. Escrever aqui uma
                        segunda taxa criaria dois números para a mesma apólice.
                      </div>
                      {dados.operacoesVivas.length === 0 ? (
                        <div className="cs-aviso info">Nenhuma operação esperando decisão da Subscrição.</div>
                      ) : dados.operacoesVivas.map(o => (
                        <div key={o.id} className="cs-check">
                          <span>{o.taxa && o.voto ? '✓' : '○'}</span>
                          <span>{o.modalidade || 'operação'}</span>
                          <span className={o.taxa && o.voto ? 'veio' : 'falta'}>
                            {o.taxa ? `taxa ${Number(o.taxa).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%` : 'sem taxa'}
                            {' · '}
                            {o.voto ? `voto ${o.voto}` : 'sem voto'}
                          </span>
                        </div>
                      ))}
                    </>
                  )}

                  {area.id === 'juridico' && s.estado === 'dormente' && (
                    <div className="cs-linha-b" style={{ marginBottom: 10 }}>
                      <button className="cs-b min" disabled={!eu.podeEscrever || salvando === s.id} onClick={chamarJuridico}>
                        ⚖️ Chamar o Jurídico
                      </button>
                    </div>
                  )}

                  {area.id === 'juridico' && s.estado !== 'dormente' && souDaArea(eu, 'juridico') && (
                    <div className="cs-linha-b" style={{ marginBottom: 12 }}>
                      {s.paralisa ? (
                        <button className="cs-b sec" disabled={salvando === s.id} onClick={() => liberar(s)}>
                          ▶ Liberar o fluxo
                        </button>
                      ) : (
                        <button className="cs-b perigo" disabled={salvando === s.id}
                          onClick={() => { setModal({ tipo: 'paralisar', area: 'juridico' }); setModalTxt('') }}>
                          ⏸ Paralisar o fluxo
                        </button>
                      )}
                      <button className="cs-b sec" disabled={salvando === s.id}
                        onClick={() => { setModal({ tipo: 'pedido', area: 'juridico' }); setModalTxt(''); setModalPara('cadastro') }}>
                        ✉ Pedir informação a uma área
                      </button>
                    </div>
                  )}

                  {/* ── o registro da área ── */}
                  {s.estado === 'concluida' ? (
                    <>
                      <span className="cs-rot">Registro de {area.nome}</span>
                      <div className="cs-leitura">{s.texto || '—'}</div>
                    </>
                  ) : (
                    <div className="cs-bloco">
                      <span className="cs-rot">
                        Registro de {area.nome}{!oficial && area.id !== 'juridico' ? ' (rascunho da sua área)' : ''}
                      </span>
                      <textarea className="cs-campo" disabled={!escreve}
                        value={valor}
                        onChange={e => setTexto(t => ({ ...t, [s.id]: e.target.value }))}
                        placeholder={escreve
                          ? 'O que aconteceu, o que ficou combinado, o que falta.'
                          : s.estado === 'dormente'
                            ? 'A seção está dormindo: alguém precisa acionar esta área antes.'
                            : `Só ${nomeArea(area.id)} escreve aqui. Você lê e comenta.`} />
                      {escreve && (
                        <div className="cs-linha-b" style={{ marginTop: 8 }}>
                          <button className="cs-b sec min" disabled={salvando === s.id} onClick={() => salvarTexto(s)}>
                            {salvando === s.id ? 'salvando…' : oficial || area.id === 'juridico' ? 'Salvar registro' : 'Salvar rascunho'}
                          </button>
                          {s.rascunho && oficial && (
                            <button className="cs-b sec min" disabled={salvando === s.id} onClick={() => promoverRascunho(s)}>
                              Trazer meu rascunho para o oficial
                            </button>
                          )}
                        </div>
                      )}
                      {s.rascunho && !oficial && s.rascunho_por && (
                        <div className="cs-pend">Rascunho de {s.rascunho_por}, ainda não oficial.</div>
                      )}
                    </div>
                  )}

                  {/* ── pendência escrita, e o concluir ── */}
                  {s.estado === 'aberta' && area.id !== 'juridico' && (
                    <>
                      {pend.some(p => p.peso === 'avisa') && escreve && comCentral && (
                        <div className="cs-bloco">
                          <span className="cs-rot">Pendência escrita (libera o concluir)</span>
                          <textarea className="cs-campo" style={{ minHeight: 56 }}
                            defaultValue={s.pendencia_texto ?? ''}
                            onBlur={e => { if (e.target.value !== (s.pendencia_texto ?? '')) mudaSecao(s.id, { pendencia_texto: e.target.value }).then(carregar) }}
                            placeholder="Por que dá para seguir mesmo faltando o que está listado abaixo." />
                        </div>
                      )}

                      {comCentral && (
                        <div className="cs-linha-b" style={{ marginTop: 13 }}>
                          <button className="cs-b" disabled={!!trava || salvando === s.id} onClick={() => concluir(s)}>
                            ✓ Concluir e enviar para {nomeArea(proximaArea(area.id))}
                          </button>
                        </div>
                      )}
                      {trava && comCentral && <div className="cs-pend">Travado: {trava}.</div>}
                      {pend.length > 0 && !trava && (
                        <div className="cs-pend">
                          Falta, e não trava: {pend.filter(p => p.peso === 'avisa').map(p => p.txt).join(', ') || '—'}.
                        </div>
                      )}
                    </>
                  )}

                  {s.estado === 'concluida' && podeReabrir(s, eu) && (
                    <div className="cs-linha-b" style={{ marginTop: 12 }}>
                      <button className="cs-b sec min"
                        onClick={() => { setModal({ tipo: 'reabrir', area: area.id }); setModalTxt('') }}>
                        Reabrir seção
                      </button>
                    </div>
                  )}
                  {s.estado === 'concluida' && !podeReabrir(s, eu) && (
                    <div className="cs-pend" style={{ marginTop: 10 }}>
                      Reabrir é do dono da seção ({nomeArea(area.id)}) ou da diretoria.
                    </div>
                  )}
                  {s.reaberta_motivo && s.estado === 'aberta' && (
                    <div className="cs-aviso alerta" style={{ marginTop: 10, marginBottom: 0 }}>
                      Reaberta por {s.reaberta_por} em {s.reaberta_em ? fmtData(s.reaberta_em) : '—'}: “{s.reaberta_motivo}”.
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ══ conversa entre áreas ══ */}
      <div className="cs-painel" style={{ marginTop: 14 }}>
        <div className="cs-titulo">
          Conversa entre áreas
          <span className="dir">fica no card, não em e-mail solto</span>
        </div>
        {eventos.filter(e => e.tipo !== 'evento').length === 0 ? (
          <div className="cs-explica" style={{ margin: 0 }}>
            Ninguém escreveu ainda. Hoje essa conversa acontece por e-mail e some.
          </div>
        ) : eventos.filter(e => e.tipo !== 'evento').map(e => (
          <div key={e.id} className="cs-evento">
            <span className="q">{quando(e.criado_em)}</span>
            <span>
              <span className="a">{e.autor_nome || 'alguém'}</span>
              {e.tipo === 'pedido' && <span className="cs-eti azul" style={{ marginLeft: 6 }}>pede a {nomeArea(e.para_area)}</span>}
              {' · '}{e.texto}
              {e.tipo === 'pedido' && (e.resolvido_em
                ? <div style={{ marginTop: 4, color: '#1a7a50' }}>Respondido por {e.resolvido_por}: {e.resposta}</div>
                : souDaArea(eu, (e.para_area as AreaId)) && (
                  <div className="cs-linha-b" style={{ marginTop: 6 }}>
                    <input className="cs-campo" placeholder="Responder…" style={{ maxWidth: 420 }}
                      onKeyDown={ev => {
                        if (ev.key === 'Enter') {
                          const v = (ev.target as HTMLInputElement).value.trim()
                          if (v) responderPedido(e, v)
                        }
                      }} />
                  </div>
                ))}
            </span>
          </div>
        ))}
        {eu.podeEscrever && (
          <div className="cs-linha-b" style={{ marginTop: 11 }}>
            <input className="cs-campo" value={msgNova} onChange={e => setMsgNova(e.target.value)}
              placeholder={`Escrever para as outras áreas como ${eu.nome}…`}
              onKeyDown={e => { if (e.key === 'Enter') mandarMensagem() }} />
            <button className="cs-b" onClick={mandarMensagem} disabled={!msgNova.trim()}>Enviar</button>
          </div>
        )}
      </div>

      {/* ══ histórico ══ */}
      <div className="cs-painel" style={{ marginTop: 14 }}>
        <div className="cs-titulo">
          Histórico do card
          <span className="dir">{eventos.filter(e => e.tipo === 'evento').length} registros</span>
        </div>
        {eventos.filter(e => e.tipo === 'evento').length === 0 ? (
          <div className="cs-explica" style={{ margin: 0 }}>
            Nada aconteceu neste card ainda. O que for concluído, reaberto ou paralisado aparece aqui.
          </div>
        ) : eventos.filter(e => e.tipo === 'evento').map(e => (
          <div key={e.id} className="cs-evento">
            <span className="q">{quando(e.criado_em)}</span>
            <span><span className="a">{nomeArea(e.area)}</span> · {e.texto}</span>
          </div>
        ))}
      </div>

      {/* ══ o modal de reabrir / paralisar / pedir ══ */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10,22,40,.45)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60,
        }} onClick={() => setModal(null)}>
          <div className="cs-painel" style={{ maxWidth: 520, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="cs-titulo">
              {modal.tipo === 'reabrir' && `Reabrir a seção ${nomeArea(modal.area)}`}
              {modal.tipo === 'paralisar' && 'Paralisar o fluxo deste card'}
              {modal.tipo === 'pedido' && 'Pedir informação a uma área'}
            </div>
            <div className="cs-explica">
              {modal.tipo === 'reabrir' && 'Fica gravado quem pediu e por quê, e a central volta para esta área.'}
              {modal.tipo === 'paralisar' && 'Enquanto estiver paralisado, nenhuma seção conclui. O motivo aparece no card e no funil.'}
              {modal.tipo === 'pedido' && 'O pedido aparece na conversa do card e fica em aberto até a área responder.'}
            </div>
            {modal.tipo === 'pedido' && (
              <div className="cs-bloco">
                <span className="cs-rot">Para qual área</span>
                <select className="cs-campo" value={modalPara} onChange={e => setModalPara(e.target.value as AreaId)}>
                  {AREAS.filter(a => a.id !== 'juridico').map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
            )}
            <div className="cs-bloco">
              <span className="cs-rot">
                {modal.tipo === 'reabrir' ? 'Por que precisa reabrir' : modal.tipo === 'paralisar' ? 'Por que está paralisando' : 'O que você precisa'}
              </span>
              <textarea className="cs-campo" value={modalTxt} onChange={e => setModalTxt(e.target.value)}
                placeholder={modal.tipo === 'reabrir' ? 'Ex.: chegou o balancete de junho e muda o Score.' : ''} />
            </div>
            <div className="cs-linha-b">
              <button className="cs-b" onClick={confirmaModal} disabled={modal.tipo === 'pedido' && !modalTxt.trim()}>
                {modal.tipo === 'reabrir' ? 'Reabrir' : modal.tipo === 'paralisar' ? 'Paralisar' : 'Enviar pedido'}
              </button>
              <button className="cs-b sec" onClick={() => setModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
