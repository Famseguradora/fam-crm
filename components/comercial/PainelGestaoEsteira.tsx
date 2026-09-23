'use client'

/* O PAINEL DA ESTEIRA · a aba de gestão, ao lado da Fila do dia
   ═══════════════════════════════════════════════════════════════════════════

   Ordem do Marco em 17/09/2026: dentro de Comercial > E-mail, a aba "Caixa e
   painel" devia mostrar SÓ a ponte do dia — o resto (a triagem em lote, e a
   lista "Tudo o que chegou" de um período grande) tornava a tela horrível
   quando o filtro era 7, 30 dias ou tudo. A informação continua importando;
   o que estava errado era misturar TRABALHO DO DIA com RELATÓRIO GERENCIAL
   na mesma tela.

   Por isso esta aba existe: é o relatório, com espaço para ser um relatório.
   "Qualificar e quantificar a evolução de performance da esteira" virou duas
   coisas concretas:
     · qualificar = a forma da curva (está subindo, descendo, estável?)
     · quantificar = os números por trás dela (quantos, em quanto tempo, com
       que taxa de sucesso)

   NENHUMA FÓRMULA NASCE AQUI. A série vem de lib/email/evolucao.ts, que só
   recorta a MESMA ponte (lib/email/ponte.ts) e o MESMO atendimento
   (lib/email/metricas.ts) que a aba E-mail usa — o padrão que o relatório
   gerencial do mês já usa para os 12 meses (lib/gestao/relatorio-mensal.ts),
   aqui em dias, semanas ou meses, escolhido pelos botões de período.

   Design: components/painel/Painel.tsx e lib/ui/painel.ts, conforme
   docs/DESIGN-PAINEL.md. Nenhum hex redigitado aqui.

   18/09/2026, primeira leva: a ponte inteira saiu da aba E-mail e veio para
   cá, com ela os links "Avisos do pedido"/"Régua" e o botão "Pedir à IA" — a
   aba E-mail ficou só com a caixa crua e os mais antigos parados. Motivo do
   Marco: recolher a ponte lá deixava a tela esquisita, e ela já tinha uma
   equivalente aqui (mais completa: cobre qualquer período, não só um).

   18/09/2026, segunda leva: os CARTÕES do topo estavam errados — liam só o
   ÚLTIMO balde da série (hoje, sempre incompleto) contra o anterior, e não o
   período inteiro que o gráfico desenha ao lado. Ordem do Marco, vendo
   "Recebidos: 0" com o gráfico cheio ao lado: "os cartões devem representar
   todo o aspecto, os dados históricos". Agora eles somam o PERÍODO INTEIRO
   escolhido (via `serieEsteira` com uma janela só — ver o cabeçalho de
   lib/email/evolucao.ts) e comparam com o período equivalente ANTERIOR, não
   com o balde de ontem.

   Também entraram os botões de período (Semanal/Mensal/Semestral/Anual +
   datas escolhidas à mão) e o filtro por corretora, para "saber a qualidade
   de demanda que os corretores estão enviando". O filtro só vale para esta
   seção (Evolução): a ponte do período de detalhe, mais abaixo, filtrar por
   corretora quebraria o agrupamento de RE/ENC em pedido (ver o cabeçalho de
   lib/email/evolucao.ts, "o filtro por corretora muda a unidade"). */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { SecaoPainel, Moldura, Aviso, GradeCartoes, CartaoNumero } from '@/components/painel/Painel'
import { cor, corDaArea, texto, raio, botaoVazado } from '@/lib/ui/painel'
import BlocoIA from '@/components/ia/BlocoIA'
import { lerPedido, resumir, horasTexto, METAS_PADRAO, type LinhaPedido, type MetasEmail } from '@/lib/email/metricas'
import { lerVersao, reguaVigente, type VersaoRegua } from '@/lib/email/regua'
import type { ClassificacaoGravada } from '@/lib/email/classificar'
import { janelaDoPeriodo, montarPonte, passivoDa, PERIODOS_PONTE, type PeriodoId } from '@/lib/email/ponte'
import {
  corretorasDaSerie, granularidadeAutomatica, janelasDaSerie, janelasEntre, serieEsteira,
  type Granularidade, type JanelaSerie,
} from '@/lib/email/evolucao'
import PonteDoDia, { type Selecao } from './PonteDoDia'
import FilaPedidos, { type AcoesFila, type TipoDecisao } from './FilaPedidos'
import TriagemEmLote from './TriagemEmLote'

type LinhaPonte = LinhaPedido & { previa?: string | null; anexos?: { nome?: string | null }[] | null }
type PeriodoDetalhe = Exclude<PeriodoId, 'dia'>

const DIA_MS = 86_400_000

const inteiro = (n: number) => n.toLocaleString('pt-BR')
const plural = (n: number, um: string, varios: string) => `${inteiro(n)} ${n === 1 ? um : varios}`
/** "2026-09-18" -> "18/09/2026". */
const dataCurta = (iso: string) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}` }

/* OS BOTÕES DE PERÍODO DA EVOLUÇÃO. Cada um é "até onde eu quero olhar", não
   "que tamanho tem o ponto" — o tamanho do ponto é automático, pensado para
   a série nunca virar nem uma parede de pontos (365 dias soltos) nem um
   traço reto (2 pontos). Mesma leitura do "Hoje/Ontem/7 dias/30 dias/Tudo"
   que já existe no resto do CRM, só que para olhar tendência, não trabalho
   do dia. */
type Preset = 'semanal' | 'mensal' | 'semestral' | 'anual' | 'personalizado'
const PRESETS: Record<Exclude<Preset, 'personalizado'>, { nome: string; gran: Granularidade; n: number; frase: string }> = {
  semanal: { nome: 'Semanal', gran: 'dia', n: 7, frase: 'nos últimos 7 dias' },
  mensal: { nome: 'Mensal', gran: 'dia', n: 30, frase: 'nos últimos 30 dias' },
  semestral: { nome: 'Semestral', gran: 'semana', n: 26, frase: 'nos últimos 6 meses' },
  anual: { nome: 'Anual', gran: 'mes', n: 12, frase: 'nos últimos 12 meses' },
}

function variacao(atual: number, anterior: number | null | undefined, rotuloAnterior: string): string {
  if (anterior === null || anterior === undefined) return ''
  const d = atual - anterior
  if (d === 0) return `igual a ${rotuloAnterior}`
  return `${d > 0 ? '+' : '−'}${inteiro(Math.abs(d))} sobre ${rotuloAnterior}`
}

export default function PainelGestaoEsteira({ aoMudar }: { aoMudar?: () => void }) {
  const router = useRouter()
  const { somenteLeitura } = usePermissoes()

  const [linhas, setLinhas] = useState<LinhaPonte[]>([])
  const [versoes, setVersoes] = useState<VersaoRegua[]>([])
  const [modalidades, setModalidades] = useState<string[]>([])
  const [gravadas, setGravadas] = useState<ClassificacaoGravada[]>([])
  const [metas, setMetas] = useState<MetasEmail>(METAS_PADRAO)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [semRegua, setSemRegua] = useState(false)
  const [iaLigada, setIaLigada] = useState(false)
  const [iaLendo, setIaLendo] = useState('')
  const [iaRecado, setIaRecado] = useState('')

  const [preset, setPreset] = useState<Preset>('mensal')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [corretora, setCorretora] = useState('')
  const [periodo, setPeriodo] = useState<PeriodoDetalhe>('30')
  const [selecao, setSelecao] = useState<Selecao>('recebidos')

  const [agora, setAgora] = useState(() => new Date())

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const [pedidos, m, regua, mods, classes, iaCfg] = await Promise.all([
      supabase.from('painel_pedidos').select('*').order('recebido_em', { ascending: false, nullsFirst: false }).limit(3000),
      supabase.from('email_metas').select('*').eq('id', true).maybeSingle(),
      supabase.from('email_regua').select('versao, parametros, motivo, criada_por_nome, criada_em').order('versao'),
      supabase.from('modalidades').select('nome'),
      supabase.from('email_classificacao').select('*').limit(5000),
      supabase.from('ia_config').select('api_ligada').eq('id', 1).maybeSingle(),
    ])
    if (pedidos.error) setErro(pedidos.error.message)
    setLinhas((pedidos.data ?? []) as LinhaPonte[])
    if (m.data) setMetas({ ...METAS_PADRAO, ...m.data })
    setSemRegua(!!regua.error || !(regua.data ?? []).length)
    setVersoes(((regua.data ?? []) as Parameters<typeof lerVersao>[0][]).map(lerVersao) as VersaoRegua[])
    setModalidades([...new Set((mods.data ?? []).map((x) => String(x.nome)))])
    setGravadas((classes.data ?? []) as ClassificacaoGravada[])
    setIaLigada(!!iaCfg.data?.api_ligada)
    setAgora(new Date())
    setCarregando(false)
  }, [])

  /* Sem realtime: esta aba é o relatório, não o posto de trabalho. Dois
     minutos é rápido o bastante para acompanhar a tarde e leve o bastante
     para não competir com a aba E-mail, que é quem tem o relógio de 6 s. */
  useEffect(() => {
    const primeira = setTimeout(carregar, 0)
    const t = setInterval(carregar, 120_000)
    return () => { clearTimeout(primeira); clearInterval(t) }
  }, [carregar])

  const entrada = useMemo(() => ({ versoes, modalidades, gravadas, metas, agora }), [versoes, modalidades, gravadas, metas, agora])

  /* ── a evolução ────────────────────────────────────────────────────────── */
  const personalizado = preset === 'personalizado' && !!de && !!ate
  const presetAtivo = PRESETS[preset === 'personalizado' ? 'mensal' : preset]
  const janelasSerie = useMemo<JanelaSerie[]>(() => {
    if (personalizado) return janelasEntre(granularidadeAutomatica(new Date(de), new Date(ate)), de, ate)
    return janelasDaSerie(presetAtivo.gran, presetAtivo.n, agora)
  }, [personalizado, de, ate, presetAtivo, agora])
  const fraseDoPeriodo = personalizado ? `de ${dataCurta(de)} a ${dataCurta(ate)}` : presetAtivo.frase

  const corretoras = useMemo(() => (linhas.length ? corretorasDaSerie(linhas, entrada) : []), [linhas, entrada])

  const serie = useMemo(
    () => (linhas.length ? serieEsteira(linhas, entrada, janelasSerie, corretora || null) : []),
    [linhas, entrada, janelasSerie, corretora],
  )
  const serieGrafico = useMemo(
    () => serie.map((p) => ({ ...p, no_prazo_pct100: p.no_prazo_pct === null ? null : Math.round(p.no_prazo_pct * 100) })),
    [serie],
  )
  const emAndamento = janelasSerie.length > 0 && janelasSerie[janelasSerie.length - 1].ate.getTime() > agora.getTime()

  /* OS CARTÕES SÃO O PERÍODO INTEIRO, NÃO O ÚLTIMO PONTO (18/09/2026): uma
     série de uma janela só, cobrindo do início ao fim do que está visível no
     gráfico, dá o agregado certo — e comparado com o MESMO tamanho de
     período, logo antes dele, para a evolução ser uma leitura de verdade, não
     ruído de balde incompleto. */
  const janelaAgregado = useMemo<{ atual: JanelaSerie; anterior: JanelaSerie } | null>(() => {
    if (!janelasSerie.length) return null
    const desde = janelasSerie[0].desde
    const fim = janelasSerie[janelasSerie.length - 1].ate
    const duracao = fim.getTime() - desde.getTime()
    return {
      atual: { chave: 'atual', rotulo: fraseDoPeriodo, desde, ate: fim },
      anterior: { chave: 'anterior', rotulo: 'o período anterior', desde: new Date(desde.getTime() - duracao), ate: new Date(desde) },
    }
  }, [janelasSerie, fraseDoPeriodo])

  const agregado = useMemo(
    () => (janelaAgregado && linhas.length ? serieEsteira(linhas, entrada, [janelaAgregado.atual], corretora || null)[0] : undefined),
    [janelaAgregado, linhas, entrada, corretora],
  )
  const agregadoAnterior = useMemo(
    () => (janelaAgregado && linhas.length ? serieEsteira(linhas, entrada, [janelaAgregado.anterior], corretora || null)[0] : undefined),
    [janelaAgregado, linhas, entrada, corretora],
  )

  /* ── o período de detalhe ─────────────────────────────────────────────── */
  const janela = useMemo(() => janelaDoPeriodo(periodo, agora), [periodo, agora])
  const vigente = reguaVigente(versoes)
  const excluidas = vigente?.parametros.excluidas ?? []
  const ponte = useMemo(() => montarPonte(linhas, { ...entrada, janela }), [linhas, entrada, janela])
  const ponteTudo = useMemo(() => montarPonte(linhas, { ...entrada, janela: janelaDoPeriodo('tudo', agora) }), [linhas, entrada, agora])
  const passivo = passivoDa(ponteTudo, agora)

  /* "PARADOS AGORA" COM O FILTRO DE CORRETORA (18/09/2026): o cartão da
     Evolução usa este número, não `passivo` puro, quando há corretora
     escolhida — senão o filtro pareceria valer só para os outros quatro
     cartões, e "parados agora" continuaria contando a FAM inteira. */
  const paradosAgora = useMemo(() => {
    if (!corretora) return { n: passivo.parados, maisVelhoDias: passivo.mais_velho_dias }
    const abertos = ponteTudo.demandas.filter((d) => d.corretora === corretora && (d.balde === 'a_fazer' || d.balde === 'sem_classificacao'))
    const idades = abertos
      .map((d) => (d.recebido_em ? (agora.getTime() - new Date(d.recebido_em).getTime()) / DIA_MS : NaN))
      .filter((x) => Number.isFinite(x))
    return { n: abertos.filter((d) => d.parado).length, maisVelhoDias: idades.length ? Math.max(...idades) : null }
  }, [corretora, ponteTudo, passivo, agora])

  const resumo = useMemo(
    () => resumir(linhas.map((l) => lerPedido(l, metas, agora)), metas, janela.desde, janela.ate),
    [linhas, metas, agora, janela],
  )
  const pctNoPrazo = resumo.com_tempo ? Math.round((resumo.no_prazo / resumo.com_tempo) * 100) : null

  const casosDoPeriodo = useMemo(() => {
    const mapa: Record<string, { titulo: string; numero?: number | null }> = {}
    for (const d of ponte.demandas) {
      if (!d.resolvido) continue
      for (const e of d.emails) {
        if (e.caso_id) mapa[e.caso_id] = { titulo: e.razao_social || d.tomador || String(d.primeiro.assunto ?? ''), numero: e.caso_numero ?? null }
      }
    }
    return mapa
  }, [ponte])

  /* O BOTÃO DA IA MUDOU DE ABA JUNTO COM A PONTE EM 18/09/2026: ele lê os
     pedidos sem classificação do PERÍODO ESCOLHIDO aqui, então faz mais
     sentido morar ao lado da ponte que decide esse período do que na aba
     E-mail, que agora só tem a caixa crua e os mais antigos parados. */
  const alvosDaIA = useMemo(() => {
    const comIA = new Set(gravadas.filter((g) => g.origem === 'ia').map((g) => g.email_id))
    return ponte.demandas
      .filter((d) => d.balde === 'sem_classificacao' && !d.emails.some((e) => comIA.has(e.id)))
      .map((d) => d.representante.id)
  }, [ponte, gravadas])

  async function pedirIA() {
    const ids = alvosDaIA
    if (!ids.length) return
    setErro('')
    setIaRecado('')
    let lidos = 0
    let semCerteza = 0
    let custo = 0
    for (let i = 0; i < ids.length; i += 40) {
      setIaLendo(`A IA está lendo ${Math.min(i + 40, ids.length)} de ${ids.length}…`)
      try {
        const r = await fetch('/api/email/classificar-ia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ids.slice(i, i + 40) }),
        })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) { setErro(j.erro ?? 'A IA não conseguiu classificar.'); break }
        lidos += j.classificados ?? 0
        semCerteza += j.sem_certeza ?? 0
        custo += j.custo_usd ?? 0
        if (j.parou) { setErro(j.parou); break }
      } catch {
        setErro('A conexão caiu no meio da leitura da IA. O que já foi lido ficou gravado.')
        break
      }
    }
    setIaLendo('')
    if (lidos) {
      setIaRecado(
        `A IA leu ${plural(lidos, 'pedido', 'pedidos')}` +
        (semCerteza ? `; ${semCerteza} sem certeza continuam sem classificação` : '') +
        ` · US$ ${custo.toFixed(2).replace('.', ',')}`,
      )
    }
    await carregar()
  }

  /* ── as ações da fila (o mesmo padrão da aba E-mail) ─────────────────────── */
  const postar = useCallback(async (url: string, corpo: Record<string, unknown>): Promise<boolean> => {
    setErro('')
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(j.erro ?? 'Não consegui.'); return false }
      return true
    } catch {
      setErro('A conexão caiu. Tente de novo.')
      return false
    }
  }, [])

  const acoes: AcoesFila = useMemo(() => {
    const comOcupado = async (chave: string, fazer: () => Promise<boolean>) => {
      setOcupado(chave)
      const ok = await fazer()
      setOcupado('')
      await carregar()
      aoMudar?.()
      return ok
    }
    return {
      trazer: (d) => {
        const rep = d.representante
        setLinhas((ls) => ls.map((l) => (l.id === rep.id ? { ...l, estado: 'a_trazer' } : l)))
        comOcupado(d.id, () => postar('/api/caixa', { acao: 'trazer', ids: [rep.id] }))
      },
      classificar: async (ids, tipo: TipoDecisao | null, extra) => {
        const antes = gravadas
        const agoraIso = new Date().toISOString()
        setGravadas((gs) => [
          ...gs.filter((g) => !(g.origem === 'humano' && ids.includes(g.email_id))),
          ...(tipo === null ? [] : ids.map((email_id) => ({
            email_id, origem: 'humano' as const, tipo, modalidade: extra?.modalidade ?? null, cnpj: null, tomador: null,
            confianca: 'seguro' as const, motivo: extra?.motivo ?? null, recibo: null, regua_versao: vigente?.versao ?? null,
            classificado_por: 'você', classificado_em: agoraIso,
          }))),
        ])
        const ok = await comOcupado(ids[0], () => postar('/api/email/classificar', { ids, tipo, ...extra }))
        if (!ok) setGravadas(antes)
        return ok
      },
      jaAnalisado: (ids, desfazer) => comOcupado(ids[0], () => postar('/api/caixa', { acao: 'ja_analisado', ids, desfazer: !!desfazer })),
      aguardar: (ids, motivo) => comOcupado(ids[0], () => postar('/api/caixa', { acao: 'aguardar', ids, motivo })),
      voltarDoAguardo: (ids) => comOcupado(ids[0], () => postar('/api/caixa', { acao: 'aguardar', ids, voltar: true })),
      cobrar: (ids) => comOcupado(ids[0], () => postar('/api/caixa', { acao: 'cobrar', ids })),
      abrirCaso: (id) => router.push(`/comercial/${id}`),
    }
  }, [carregar, aoMudar, postar, gravadas, vigente, router])

  if (carregando && !linhas.length) {
    return <Aviso>Montando o painel da esteira…</Aviso>
  }

  return (
    <div>
      <style jsx global>{`
        .pg-duas { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr)); align-items: start; }
      `}</style>

      {erro && <div style={{ marginBottom: 12 }}><Aviso tom="erro">{erro}</Aviso></div>}

      {/* ── 1. a evolução: qualifica (a curva) e quantifica (os números) ── */}
      <SecaoPainel
        nome="Evolução da esteira"
        cor={cor.acao}
        acao={
          <div role="group" aria-label="Período da evolução" style={{ display: 'flex', flexWrap: 'wrap', gap: 2, background: cor.bordaSuave, padding: 3, borderRadius: raio.controle }}>
            {(Object.keys(PRESETS) as Exclude<Preset, 'personalizado'>[]).map((id) => (
              <button
                key={id}
                type="button"
                className="painel-alvo"
                aria-pressed={preset === id}
                onClick={() => setPreset(id)}
                style={{
                  border: 'none', cursor: 'pointer', padding: '5px 11px', borderRadius: raio.controle - 2,
                  fontSize: 12.5, fontWeight: 600,
                  background: preset === id ? cor.papel : 'transparent',
                  color: preset === id ? cor.tinta : cor.textoSub,
                }}
              >
                {PRESETS[id].nome}
              </button>
            ))}
            <button
              type="button"
              className="painel-alvo"
              aria-pressed={preset === 'personalizado'}
              onClick={() => setPreset('personalizado')}
              style={{
                border: 'none', cursor: 'pointer', padding: '5px 11px', borderRadius: raio.controle - 2,
                fontSize: 12.5, fontWeight: 600,
                background: preset === 'personalizado' ? cor.papel : 'transparent',
                color: preset === 'personalizado' ? cor.tinta : cor.textoSub,
              }}
            >
              Datas…
            </button>
          </div>
        }
      >
        {preset === 'personalizado' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12, ...texto.apoio }}>
            <span>De</span>
            <input type="date" className="fam-input painel-alvo" value={de} max={ate || undefined}
              onChange={(ev) => setDe(ev.target.value)} style={{ width: 'auto', padding: '4px 8px', fontSize: 16 }} />
            <span>até</span>
            <input type="date" className="fam-input painel-alvo" value={ate} min={de || undefined}
              onChange={(ev) => setAte(ev.target.value)} style={{ width: 'auto', padding: '4px 8px', fontSize: 16 }} />
            {!de || !ate ? <span>escolha as duas datas</span> : null}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={texto.rotulo}>Corretora</span>
          <select
            className="fam-input painel-alvo"
            value={corretora}
            onChange={(ev) => setCorretora(ev.target.value)}
            style={{ width: 'auto', minWidth: 200, padding: '5px 9px', fontSize: 13 }}
          >
            <option value="">Todas as corretoras</option>
            {corretoras.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {corretora && (
            <span style={texto.nota} title="Sem corretora, 'recebidos' conta e-mail (a régua ainda não decidiu o que é pedido). Filtrado, só dá para contar quem já é pedido com corretora identificada — e 'no prazo'/'mediana' comparam a hora do pedido com a meta, não a data exata de resolução.">
              contando por pedido desta corretora, não por e-mail
            </span>
          )}
        </div>

        {!agregado ? (
          <Aviso>Ainda não há e-mail na base para montar a série.</Aviso>
        ) : (
          <>
            <GradeCartoes minimo={170}>
              <CartaoNumero rotulo="Recebidos" numero={inteiro(agregado.recebidos)} sub={variacao(agregado.recebidos, agregadoAnterior?.recebidos, 'o período anterior') || fraseDoPeriodo} />
              <CartaoNumero rotulo="Resolvidos" numero={inteiro(agregado.resolvidos)} sub={variacao(agregado.resolvidos, agregadoAnterior?.resolvidos, 'o período anterior') || fraseDoPeriodo} />
              <CartaoNumero
                rotulo="Mediana de atendimento"
                numero={agregado.mediana_horas === null ? 'sem dado' : horasTexto(agregado.mediana_horas, metas)}
                sub={agregado.resolvidos ? `${plural(agregado.resolvidos, 'resolvido', 'resolvidos')} ${fraseDoPeriodo}` : `nenhum resolvido ${fraseDoPeriodo}`}
              />
              <CartaoNumero
                rotulo="No prazo"
                numero={agregado.no_prazo_pct === null ? 'sem dado' : `${Math.round(agregado.no_prazo_pct * 100)}%`}
                sub={`meta de ${metas.horas_primeira_resposta} h úteis para entrar no sistema`}
              />
              <CartaoNumero
                rotulo="Parados agora"
                numero={inteiro(paradosAgora.n)}
                alerta={paradosAgora.n > 0}
                sub={paradosAgora.maisVelhoDias !== null ? `o mais velho chegou há ${Math.floor(paradosAgora.maisVelhoDias)} dias` : 'nenhum pedido aberto'}
              />
            </GradeCartoes>

            {emAndamento && (
              <div style={{ ...texto.nota, margin: '8px 2px 0' }}>
                O balde mais recente do gráfico ainda está em andamento: o período {fraseDoPeriodo} vai crescer até ele fechar.
              </div>
            )}

            <div className="pg-duas" style={{ marginTop: 12 }}>
              <BlocoIA bloco={{
                tipo: 'grafico', formato: 'linha', titulo: `Recebidos × resolvidos · ${fraseDoPeriodo}`,
                dados: { eixo: 'rotulo', series: [{ campo: 'recebidos', rotulo: 'Recebidos' }, { campo: 'resolvidos', rotulo: 'Resolvidos' }], dados: serieGrafico },
                origem: 'a ponte do e-mail recortada por balde (lib/email/ponte.ts) — a mesma conta da aba E-mail',
              }} />
              <BlocoIA bloco={{
                tipo: 'grafico', formato: 'linha', titulo: 'No prazo (%) e mediana de atendimento (horas úteis)',
                dados: { eixo: 'rotulo', series: [{ campo: 'no_prazo_pct100', rotulo: 'No prazo (%)' }, { campo: 'mediana_horas', rotulo: 'Mediana (horas)' }], dados: serieGrafico },
                origem: 'do e-mail até virar caso, em horas úteis; só os resolvidos de cada balde',
              }} />
            </div>
          </>
        )}
      </SecaoPainel>

      {/* ── 2. o período de detalhe ───────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
        <span style={{ ...texto.rotulo, marginRight: 2 }}>Detalhe de</span>
        <div role="group" aria-label="Período de detalhe" style={{ display: 'flex', gap: 2, background: cor.bordaSuave, padding: 3, borderRadius: raio.controle }}>
          {PERIODOS_PONTE.map((p) => (
            <button
              key={p.id}
              type="button"
              className="painel-alvo"
              aria-pressed={periodo === p.id}
              onClick={() => setPeriodo(p.id)}
              style={{
                border: 'none', cursor: 'pointer', padding: '5px 11px', borderRadius: raio.controle - 2,
                fontSize: 12.5, fontWeight: 600,
                background: periodo === p.id ? cor.papel : 'transparent',
                color: periodo === p.id ? cor.tinta : cor.textoSub,
              }}
            >
              {p.nome}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3. a ponte do período, com a fila do degrau escolhido ─────────── */}
      <SecaoPainel
        nome={`E-mails no período · ${janela.frase}`}
        cor={corDaArea('comercial')}
        acao={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Link
              href="/comercial/avisos"
              style={{ ...texto.apoio, fontWeight: 600, color: cor.tinta2, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              title="Os avisos de cada etapa do pedido: recebido, triagem, análise e subscrição"
            >
              Avisos do pedido <span aria-hidden>›</span>
            </Link>
            <Link
              href="/comercial/regua"
              style={{ ...texto.apoio, fontWeight: 600, color: cor.tinta2, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              title="Os parâmetros que decidem o que é pedido, a modalidade e o apetite"
            >
              {vigente ? `Régua v${vigente.versao}` : 'Régua'} <span aria-hidden>›</span>
            </Link>
          </span>
        }
      >
        <div style={{ background: cor.papel, border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, padding: '10px 8px 8px' }}>
          {semRegua && (
            <div style={{ margin: '0 4px 10px' }}>
              <Aviso>A régua ainda não existe no banco: sem ela, nenhum pedido é classificado e todos ficam sem classificação.</Aviso>
            </div>
          )}
          {!ponte.fecha && (
            <div style={{ margin: '0 4px 10px' }}>
              <Aviso tom="erro">A conta da ponte não fechou neste período. Isso é defeito do sistema, e não do e-mail: avise.</Aviso>
            </div>
          )}
          <PonteDoDia ponte={ponte} selecionado={selecao} aoSelecionar={setSelecao} excluidas={excluidas} />

          {/* A IA NA PONTE: um botão, e só quando há o que ela ler. A régua
              continua decidindo o apetite; a IA só diz o que o e-mail é. */}
          {!somenteLeitura && (alvosDaIA.length > 0 || !!iaLendo || !!iaRecado) && (
            <div style={{ margin: '10px 12px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              {(alvosDaIA.length > 0 || !!iaLendo) && (
                <button
                  type="button"
                  className="painel-alvo"
                  disabled={!iaLigada || !!iaLendo}
                  onClick={pedirIA}
                  title={iaLigada
                    ? 'A IA lê o assunto, o nome dos anexos e o começo do e-mail (sem CPF, telefone nem endereço de pessoa) e diz o tipo e a modalidade, com o trecho que sustenta.'
                    : 'A IA pela API está desligada. Quem liga é o proprietário, no painel da IA (Ctrl+I).'}
                  style={{ ...botaoVazado, padding: '5px 12px', fontSize: 12, borderColor: cor.ouro, opacity: !iaLigada || iaLendo ? 0.6 : 1, cursor: !iaLigada ? 'not-allowed' : iaLendo ? 'progress' : 'pointer' }}
                >
                  {iaLendo || `Pedir à IA para ler ${alvosDaIA.length === 1 ? 'o pedido' : `os ${alvosDaIA.length} pedidos`} sem classificação`}
                </button>
              )}
              <span style={texto.nota}>
                {iaRecado || (iaLigada ? 'A régua decide o apetite; a IA só diz o que o e-mail é, e cada decisão fica com recibo.' : 'A IA pela API está desligada.')}
              </span>
            </div>
          )}
          <div style={{ ...texto.nota, margin: '8px 12px 2px' }}>
            origem: e-mails da caixa por data de chegada; pedido = o e-mail que abriu o assunto; julgados pela régua que valia quando chegaram
            {ponte.versoes_usadas.length ? ` (v${ponte.versoes_usadas.join(', v')})` : ''}
          </div>
        </div>
      </SecaoPainel>

      {passivo.abertos > 0 && periodo !== 'tudo' && (
        <div style={{ margin: '-6px 0 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, ...texto.apoio }}>
          <span>
            De qualquer data: <b style={{ color: cor.tinta }}>{plural(passivo.abertos, 'pedido aberto', 'pedidos abertos')}</b>
            {passivo.sem_classificacao ? ` (${passivo.sem_classificacao} sem classificação)` : ''}
          </span>
          <button type="button" className="painel-alvo" onClick={() => setPeriodo('tudo')} style={{ ...botaoVazado, padding: '3px 10px', fontSize: 11.5 }}>
            ver todos
          </button>
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <FilaPedidos
          ponte={ponte} selecionado={selecao} metas={metas} modalidades={modalidades} excluidas={excluidas}
          somenteLeitura={somenteLeitura} ocupado={ocupado} acoes={acoes}
        />
      </div>

      {/* ── 4. o atendimento do período ───────────────────────────────────── */}
      {resumo.resolvidos > 0 && (
        <SecaoPainel nome={`O atendimento · ${janela.frase}`} cor={corDaArea('comercial')}>
          <Moldura titulo="Do e-mail até ser resolvido" origem="recebido_em do e-mail até casos.criado_em, em horas úteis (9h às 18h, sem fim de semana)">
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
              <Numerinho rotulo="Trazidos" valor={inteiro(resumo.trazidos)} />
              <Numerinho rotulo="Já analisados" valor={inteiro(resumo.ja_analisados)} sub="por fora do sistema" />
              <Numerinho rotulo="Mediana" valor={resumo.mediana_horas !== null ? horasTexto(resumo.mediana_horas, metas) : 'sem dado'} />
              <Numerinho rotulo="Média" valor={resumo.media_horas !== null ? horasTexto(resumo.media_horas, metas) : 'sem dado'} />
              <Numerinho rotulo="No prazo" valor={pctNoPrazo !== null ? `${pctNoPrazo}%` : 'sem dado'} sub={resumo.com_tempo ? `${resumo.no_prazo} de ${resumo.com_tempo}` : undefined} />
            </div>
          </Moldura>
        </SecaoPainel>
      )}

      {/* ── 5. a triagem em lote, dos casos trazidos no período ────────────── */}
      {Object.keys(casosDoPeriodo).length > 0 && (
        <TriagemEmLote casos={casosDoPeriodo} somenteLeitura={somenteLeitura} />
      )}
    </div>
  )
}

function Numerinho({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div>
      <div style={texto.rotulo}>{rotulo}</div>
      <div style={{ ...texto.numero, fontSize: 18 }}>{valor}</div>
      {sub && <div style={texto.nota}>{sub}</div>}
    </div>
  )
}
