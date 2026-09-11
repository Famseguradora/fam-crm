'use client'

export const dynamic = 'force-dynamic'

// ============================================================================
//  O FUNIL DA FAM, EM CARDS  ·  /fluxo
//
//  Esta tela é o Funil do protótipo (`prototipo/prototipo-crm-fam.html`, tela
//  "funil"), PORTADO para dentro do CRM com o dado de verdade. Ordem dele em
//  08/09/2026: "preciso do workflow, para que outras áreas também tenham
//  acesso; preciso que seja em cards".
//
//  REPRODUZIR, E NÃO RECRIAR. O desenho é o do protótipo, linha por linha: a
//  faixa que explica a regra, a fileira de KPIs, as colunas cinza-azuladas com
//  o contador no título e o cartão branco com a tarja colorida à esquerda.
//  O que mudou foi só a origem: em vez do estado de mentira do protótipo, cada
//  cartão é uma operação do banco.
//
//  A REGRA QUE A TELA ENSINA, e que é a frase do protótipo:
//  UMA EMPRESA, UM CARD. Cada operação é um ID secundário. O mesmo tomador pode
//  ter operação viva e operação recusada ao mesmo tempo, e clicar em qualquer
//  uma leva ao card dele.
//
//  AS COLUNAS NÃO ESTÃO ESCRITAS AQUI. Vêm de `status_fluxo_operacao` (nome,
//  cor e ordem), que é a régua que o CRM já usa em Operações. Criar uma etapa
//  nova é uma linha naquela tabela, sem deploy: era isso que ele pediu quando
//  disse que campo e política têm que ser configuráveis, não fixos em código.
//
//  QUEM VÊ: todo mundo que entra no CRM. É de propósito, e é o pedido: o funil
//  é o lugar onde Comercial, Cadastro, Crédito e Subscrição olham para a mesma
//  fila. Escrever continua sendo de quem tem perfil para isso, pela RLS.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtMoeda, maskCNPJ, validarCNPJ } from '@/lib/utils'
// A regra do card mora num lugar só: a Mesa e este funil importam daqui, para
// que "travado" no cartão e "travado" na seção nunca discordem.
import {
  REGUA, ESPERAM_SUBSCRICAO, nomeArea, resumoDoCard,
  type PostoCentral, type Secao, type ItemCatalogo, type DadosDoCard,
} from '@/lib/card/secoes'

// ── as peças de dado ────────────────────────────────────────────────────────

interface Etapa {
  nome: string
  cor: string | null
  ordem: number | null
  /* O TETO DE FILA DA ETAPA (limite de WIP). Veio da pesquisa de kanban de
     09/09/2026: limitar trabalho em curso e o ponto original do metodo, e era
     a unica regra dele que este funil ainda nao tinha. Nulo = sem teto, e o
     teto nunca bloqueia: ele pinta a coluna. */
  wip_limite: number | null
}

interface Operacao {
  id: string
  tomador_id: string | null
  corretora_id: string | null
  modalidade: string | null
  lmg: number | string | null
  taxa: number | string | null
  premio_previsto: number | string | null
  status: string | null
  prioridade: string | null
  temperatura: string | null
  data_entrada: string | null
  voto_subscricao: string | null
}

/* O caso é o pedido ANTES de virar operação: o e-mail que o Comercial trouxe,
   ou o CNPJ que ele digitou. Ele entrou no funil em 09/09/2026, porque a
   primeira coluna do funil não existia: o trabalho começava numa tela separada
   (/comercial) e o funil só via o que já tinha virado operação. */
interface Caso {
  id: string
  numero: number
  assunto: string
  cnpj: string | null
  razao_social: string | null
  corretora_texto: string | null
  produto: string | null
  etapa: string
  tomador_id: string | null
  criado_em: string
}

interface Tomador { id: string; razao_social: string; cnpj: string | null; central_area: string | null }
interface Corretora { id: string; razao_social: string; nome_fantasia: string | null }

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** O dinheiro curto do protótipo: "R$ 12,5 mi", "R$ 850 mil". Num cartão de
 *  quatro linhas não cabe R$ 12.500.000,00, e o que interessa ali é a ordem de
 *  grandeza. O valor exato está na operação. */
function brlCurto(n: number): string {
  if (!n) return 'R$ 0'
  if (n >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi'
  if (n >= 1e3) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil'
  return fmtMoeda(n)
}

const pct = (n: number): string =>
  n ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : 'sem taxa'

/* AS FAIXAS DE IDADE DO CARTAO, e o que cada uma quer dizer na pratica.
   A pesquisa de kanban chama isso de card aging e recomenda tres degraus, e
   nao um cronometro exato: o que a pessoa precisa e "esta parado demais?",
   nao "ha 23,4 dias". Os cortes sao os do trabalho da FAM, e nao de um blog:
   duas semanas ainda e um pedido normal, um mes ja e um pedido esquecido. */
/* O visual dos filtros num lugar so: cinco selects escritos a mao divergiriam
   na terceira mudanca, e a barra pareceria montada por pessoas diferentes. */
const ESTILO_FILTRO: React.CSSProperties = {
  padding: '7px 9px', fontSize: 12.5, border: '1px solid var(--border)',
  borderRadius: 8, background: '#fff', color: '#22344d', maxWidth: 190,
}

const IDADE = [
  { ate: 14, rotulo: 'fresca', cor: '#6080a0', fundo: 'transparent' },
  { ate: 30, rotulo: 'esfriando', cor: '#8a6410', fundo: '#fdf4dd' },
  { ate: Infinity, rotulo: 'parada', cor: '#a02020', fundo: '#fbe9e9' },
] as const

const faixaDeIdade = (dias: number | null) =>
  dias === null ? null : IDADE.find(f => dias <= f.ate) ?? IDADE[2]

/** Sem acento e em minúscula, para a busca achar "São" digitando "sao". */
const chave = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** As etapas em que a operação já morreu. O tomador continua vivo: é a regra
 *  que o protótipo escreve na tela, e ela vale para a conta dos KPIs. */
const MORTAS = new Set(['Perdido', 'Recusado'])

/* ── OS TRÊS OLHARES ─────────────────────────────────────────────────────────

   Kanban, Galeria e Lista, exatamente como no Sistema de Análise dele, que traz
   escrito no `painel.mjs`: "O Marco pediu em 02/08/2026: Kanban, Galeria e
   Lista, os tres com os MESMOS dados". A ordem dos botões é a de lá, e a pele é
   a de lá: aba de caderno, e não botão de app — a escolhida é a folha branca na
   frente das outras.

   UMA LEITURA, TRÊS DESENHOS. Nenhum dos modos busca nada a mais no banco: os
   três leem a mesma lista já filtrada pela busca. É por isso que trocar de modo
   é instantâneo, e é por isso que os três nunca discordam.

     Kanban   a fila inteira de uma vez, por etapa
     Galeria  o cartão grande, para bater o olho e entender o caso
     Lista    uma linha por operação, para varrer e comparar  */
// "areas" entrou em 08/09/2026. As outras três colunam por STATUS da operação;
// esta coluna por ÁREA responsável, e é a única onde o cartão se arrasta.
// Decisão dele: arrastar muda a área responsável, nunca o status da operação.
type Modo = 'kanban' | 'galeria' | 'lista' | 'areas'

type ColunaLista = 'empresa' | 'corretora' | 'produto' | 'etapa' | 'lmg' | 'taxa' | 'entrada'
type Direcao = 'asc' | 'desc'

/** As colunas da Lista, descritas e não escritas à mão: o cabeçalho, a
 *  ordenação e a seta saem daqui. Mesma decisão da lista de análises. */
const COLUNAS_LISTA: {
  k: ColunaLista
  rotulo: string
  n?: boolean
  padrao: Direcao
  valor: (o: Operacao, nomeT: string, nomeC: string) => string | number | null
}[] = [
  { k: 'empresa', rotulo: 'Empresa', padrao: 'asc', valor: (_o, t) => t || null },
  { k: 'corretora', rotulo: 'Corretora', padrao: 'asc', valor: (_o, _t, c) => c || null },
  { k: 'produto', rotulo: 'Produto', padrao: 'asc', valor: o => o.modalidade || null },
  { k: 'etapa', rotulo: 'Etapa', padrao: 'asc', valor: o => o.status || null },
  { k: 'lmg', rotulo: 'LMG', n: true, padrao: 'desc', valor: o => (o.lmg === null ? null : num(o.lmg)) },
  { k: 'taxa', rotulo: 'Taxa', n: true, padrao: 'desc', valor: o => (o.taxa === null ? null : num(o.taxa)) },
  { k: 'entrada', rotulo: 'Entrada', n: true, padrao: 'desc', valor: o => o.data_entrada || null },
]

// ── a tela ──────────────────────────────────────────────────────────────────

export default function FluxoPage() {
  const router = useRouter()

  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [ops, setOps] = useState<Operacao[]>([])
  const [tomadores, setTomadores] = useState<Map<string, Tomador>>(new Map())
  const [corretoras, setCorretoras] = useState<Map<string, Corretora>>(new Map())
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [soVivas, setSoVivas] = useState(false)
  const [modo, setModo] = useState<Modo>('kanban')
  // O card por área: as seções, o catálogo de documentos e os nomes de arquivo
  // que o checklist do Cadastro lê. Mesma regra da Mesa, vinda de lib/card/secoes.
  const [secoes, setSecoes] = useState<Map<string, Secao[]>>(new Map())
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [arquivos, setArquivos] = useState<Map<string, string[]>>(new Map())
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [soltandoEm, setSoltandoEm] = useState<string | null>(null)
  const [coluna, setColuna] = useState<ColunaLista>('entrada')
  const [direcao, setDirecao] = useState<Direcao>('desc')
  // A primeira coluna do funil: os pedidos que ainda não são operação.
  const [casos, setCasos] = useState<Caso[]>([])
  const [abrindo, setAbrindo] = useState(false)
  // Quando cada operacao entrou na etapa atual (id -> data ISO).
  const [entrouNaEtapa, setEntrouNaEtapa] = useState<Map<string, string>>(new Map())
  // Os filtros da barra. Vazio = tudo, e e o estado normal.
  const [fCorretora, setFCorretora] = useState('')
  const [fModalidade, setFModalidade] = useState('')
  const [fArea, setFArea] = useState('')
  const [fParadas, setFParadas] = useState(false)
  const [fLmg, setFLmg] = useState('')
  // Confortavel ou compacto. Gosto de cada um, entao fica gravado no navegador.
  const [compacto, setCompacto] = useState(false)
  // Colunas fechadas, por nome de etapa. A pesquisa diz para nao passar de 5 a
  // 7 colunas; em vez de esconder etapa a forca, deixamos fechar a que nao
  // interessa hoje, e o contador continua a vista.
  const [fechadas, setFechadas] = useState<Set<string>>(new Set())
  const [cnpjNovo, setCnpjNovo] = useState('')
  const [criando, setCriando] = useState(false)

  /* O GOSTO DELE FICA NO NAVEGADOR, e nao no banco: densidade e coluna fechada
     sao preferencia de quem esta olhando agora, nao dado da empresa. Leitura
     dentro de efeito porque `localStorage` nao existe no servidor. */
  useEffect(() => {
    try {
      // O setState aqui e proposital, e e a convencao do projeto (NewsTicker):
      // sincroniza o estado com o storage DEPOIS da hidratacao, porque
      // localStorage nao existe no SSR e ler no initializer daria mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompacto(localStorage.getItem('fam.funil.compacto') === '1')
      const f = localStorage.getItem('fam.funil.fechadas')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (f) setFechadas(new Set(JSON.parse(f) as string[]))
    } catch { /* navegador com storage bloqueado: segue no padrao */ }
  }, [])

  const alternarDensidade = () => {
    setCompacto(c => {
      try { localStorage.setItem('fam.funil.compacto', c ? '0' : '1') } catch {}
      return !c
    })
  }

  const alternarColuna = (nome: string) => {
    setFechadas(atual => {
      const novo = new Set(atual)
      if (novo.has(nome)) novo.delete(nome); else novo.add(nome)
      try { localStorage.setItem('fam.funil.fechadas', JSON.stringify([...novo])) } catch {}
      return novo
    })
  }

  const carregar = useCallback(async (vivo: { atual: boolean }) => {
    const supabase = createClient()
    const [e, o, t, c, s, cat, anx, ca, hist] = await Promise.all([
      /* A REGUA, E O TETO DE FILA QUE PODE AINDA NAO EXISTIR.
         `wip_limite` chega pela migration supabase-migration-funil-wip.sql. Em
         09/09/2026 o funil pediu a coluna antes de a migration ser aplicada, o
         Postgres recusou a consulta INTEIRA, e a tela ficou sem etapa nenhuma:
         as 298 operacoes viraram "orfas" e o Kanban ficou so com a coluna de
         triagem. Coluna nova nao pode derrubar tela: se ela nao existir, a
         regua vem sem ela e o funil funciona igual, so sem os tetos. */
      supabase.from('status_fluxo_operacao').select('nome, cor, ordem, wip_limite').eq('ativo', true).order('ordem')
        .then(r => (r.error && /wip_limite/.test(r.error.message)
          ? supabase.from('status_fluxo_operacao').select('nome, cor, ordem').eq('ativo', true).order('ordem')
          : r)),
      supabase.from('operacoes')
        .select('id, tomador_id, corretora_id, modalidade, lmg, taxa, premio_previsto, status, prioridade, temperatura, data_entrada, voto_subscricao')
        .limit(3000),
      supabase.from('tomadores').select('id, razao_social, cnpj, central_area').limit(3000),
      supabase.from('corretoras').select('id, razao_social, nome_fantasia').limit(3000),
      // As seções do card: é daqui que sai "em que área o card está e o que trava".
      supabase.from('card_secoes')
        .select('id, tomador_id, area, estado, texto, rascunho, campos, pendencia_texto, paralisa, paralisa_motivo, paralisa_por')
        .limit(6000),
      supabase.from('caso_item_catalogo').select('*').eq('ativo', true).order('ordem'),
      // `analise_documentos` está zerada, então o checklist lê só os anexos.
      supabase.from('anexos').select('tomador_id, nome_original').limit(3000),
      // Os casos ABERTOS. Concluído (`analise`) sai da coluna: dali em diante o
      // trabalho é da esteira, e ele já aparece como operação nas outras.
      supabase.from('casos')
        .select('id, numero, assunto, cnpj, razao_social, corretora_texto, produto, etapa, tomador_id, criado_em')
        .in('etapa', ['comercial', 'triagem'])
        .order('criado_em', { ascending: false })
        .limit(500),
      /* QUANDO CADA OPERACAO ENTROU NA ETAPA EM QUE ESTA. E o que faz o cartao
         envelhecer a vista: a pesquisa de kanban chama isso de card aging, e e
         o unico jeito de "parado ha 40 dias" aparecer sem alguem ir procurar.
         Vem de `fam_historico`, que ja e escrito por trigger: nao inventamos
         tabela nova para isso. */
      supabase.from('fam_historico')
        .select('registro_id, mudou_em')
        .eq('tabela', 'operacoes')
        .eq('campo', 'status')
        .order('mudou_em', { ascending: false })
        .limit(4000),
    ])
    if (!vivo.atual) return
    const falhou = e.error || o.error || t.error || c.error
    if (falhou) setErro(falhou.message)
    /* A regua pode ter vindo sem `wip_limite` (migration nao aplicada). O `??`
       transforma isso em "sem teto" em vez de undefined viajando pela tela. */
    setEtapas(((e.data ?? []) as Partial<Etapa>[]).map(x => ({
      nome: String(x.nome ?? ''),
      cor: x.cor ?? null,
      ordem: x.ordem ?? null,
      wip_limite: x.wip_limite ?? null,
    })))
    setOps((o.data ?? []) as unknown as Operacao[])
    setTomadores(new Map(((t.data ?? []) as Tomador[]).map(x => [x.id, x])))
    setCorretoras(new Map(((c.data ?? []) as Corretora[]).map(x => [x.id, x])))

    const porTomador = new Map<string, Secao[]>()
    ;((s.data ?? []) as unknown as Secao[]).forEach(x => {
      const lista = porTomador.get(x.tomador_id) ?? []
      lista.push(x)
      porTomador.set(x.tomador_id, lista)
    })
    setSecoes(porTomador)
    setCatalogo((cat.data ?? []) as ItemCatalogo[])

    const arqs = new Map<string, string[]>()
    ;((anx.data ?? []) as { tomador_id: string | null; nome_original: string }[]).forEach(a => {
      if (!a.tomador_id) return
      const lista = arqs.get(a.tomador_id) ?? []
      lista.push(a.nome_original)
      arqs.set(a.tomador_id, lista)
    })
    setArquivos(arqs)
    setCasos((ca.data ?? []) as unknown as Caso[])

    /* A consulta veio da mais nova para a mais velha, entao a PRIMEIRA vez que
       um id aparece e a ultima mudanca de etapa dele. Quem nunca mudou de etapa
       nao entra aqui, e o cartao cai no `data_entrada` como segunda melhor
       resposta (dito na tela, para ninguem ler um numero achando que e outro). */
    const desde = new Map<string, string>()
    ;((hist.data ?? []) as { registro_id: string; mudou_em: string }[]).forEach(h => {
      if (h.registro_id && !desde.has(h.registro_id)) desde.set(h.registro_id, h.mudou_em)
    })
    setEntrouNaEtapa(desde)
    setCarregando(false)
  }, [])

  useEffect(() => {
    const vivo = { atual: true }
    carregar(vivo)
    return () => { vivo.atual = false }
  }, [carregar])

  const nomeDoTomador = useCallback(
    (id: string | null) => (id && tomadores.get(id)?.razao_social) || 'tomador não cadastrado',
    [tomadores])

  const nomeDaCorretora = useCallback((id: string | null) => {
    if (!id) return ''
    const c = corretoras.get(id)
    return c ? (c.nome_fantasia || c.razao_social) : ''
  }, [corretoras])

  /** Em que área o card está e o que trava, com a MESMA conta da Mesa. As
   *  operações que esperam decisão são as vivas deste tomador. */
  const resumoDe = useCallback((tomadorId: string | null) => {
    if (!tomadorId) return null
    const secs = secoes.get(tomadorId)
    if (!secs?.length) return null
    const t = tomadores.get(tomadorId)
    const dados: DadosDoCard = {
      cnpj: t?.cnpj ?? null,
      arquivos: arquivos.get(tomadorId) ?? [],
      // O funil não carrega a análise inteira: o que a seção do Crédito precisa
      // saber aqui é se ela existe, e isso a seção concluída já conta.
      analise: null,
      operacoesVivas: ops
        .filter(o => o.tomador_id === tomadorId && ESPERAM_SUBSCRICAO.has(o.status ?? ''))
        .map(o => ({ id: o.id, modalidade: o.modalidade, taxa: num(o.taxa) || null, voto: o.voto_subscricao })),
    }
    return resumoDoCard(secs, (t?.central_area as PostoCentral) ?? 'comercial', dados, catalogo)
  }, [secoes, tomadores, arquivos, ops, catalogo])

  /** Arrastar no funil por área muda A ÁREA RESPONSÁVEL, e nada mais. O status
   *  da operação continua sendo decidido dentro da seção, ao concluir: decisão
   *  dele em 08/09/2026. */
  const mover = useCallback(async (tomadorId: string, destino: PostoCentral) => {
    const t = tomadores.get(tomadorId)
    if (!t || t.central_area === destino) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('tomadores').update({ central_area: destino }).eq('id', tomadorId)
    if (error) { setErro(error.message); return }
    let nome: string | null = null
    if (user) {
      const { data } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
      nome = (data as { nome: string | null } | null)?.nome ?? null
    }
    await supabase.from('card_eventos').insert({
      tomador_id: tomadorId, tipo: 'evento', area: destino,
      texto: `Central movida de ${nomeArea(t.central_area)} para ${nomeArea(destino)} pelo funil. O status das operações não mudou.`,
      autor_nome: nome, autor_auth_id: user?.id ?? null,
    })
    setTomadores(m => {
      const novo = new Map(m)
      novo.set(tomadorId, { ...t, central_area: destino })
      return novo
    })
  }, [tomadores])

  /** Ha quantos dias esta operacao esta na etapa em que esta. Preferimos a
   *  ultima mudanca de status; sem ela, cai para a data de entrada, que e uma
   *  aproximacao pior e por isso a tela diz qual das duas esta mostrando. */
  const diasParada = useCallback((o: Operacao): number | null => {
    const marco = entrouNaEtapa.get(o.id) ?? o.data_entrada
    if (!marco) return null
    const dias = Math.floor((Date.now() - new Date(marco).getTime()) / 86400000)
    return Number.isFinite(dias) && dias >= 0 ? dias : null
  }, [entrouNaEtapa])

  // ── o que a busca e os filtros deixaram passar ────────────────────────────
  const vistas = useMemo(() => {
    const q = chave(busca.trim())
    const digitos = q.replace(/\D/g, '')
    let r = ops
    if (soVivas) r = r.filter(o => !MORTAS.has(o.status ?? ''))
    if (fCorretora) r = r.filter(o => o.corretora_id === fCorretora)
    if (fModalidade) r = r.filter(o => (o.modalidade ?? '') === fModalidade)
    if (fArea) r = r.filter(o => (o.tomador_id ? tomadores.get(o.tomador_id)?.central_area : null) === fArea)
    if (fLmg) {
      const piso = Number(fLmg)
      if (Number.isFinite(piso)) r = r.filter(o => num(o.lmg) >= piso)
    }
    /* "So as paradas" e o filtro que a pesquisa chama de stale: e o unico que
       responde "o que esta atrasado?" sem ninguem ler coluna por coluna. */
    if (fParadas) r = r.filter(o => (diasParada(o) ?? 0) > 30 && !MORTAS.has(o.status ?? ''))
    if (q) {
      r = r.filter(o => {
        const t = o.tomador_id ? tomadores.get(o.tomador_id) : null
        const texto = chave([nomeDoTomador(o.tomador_id), nomeDaCorretora(o.corretora_id), o.modalidade ?? ''].join(' '))
        return texto.includes(q) || (digitos.length >= 3 && !!t?.cnpj?.includes(digitos))
      })
    }
    return r
  }, [ops, busca, soVivas, fCorretora, fModalidade, fArea, fLmg, fParadas,
      diasParada, tomadores, nomeDoTomador, nomeDaCorretora])

  const filtrosLigados = !!(fCorretora || fModalidade || fArea || fLmg || fParadas)
  const limparFiltros = () => {
    setFCorretora(''); setFModalidade(''); setFArea(''); setFLmg(''); setFParadas(false)
  }

  /* As opcoes das listas saem do que EXISTE no funil, e nao de um cadastro
     inteiro: filtro que oferece 99 corretoras das quais 12 tem operacao e um
     filtro que faz a pessoa procurar. */
  const opcoes = useMemo(() => {
    const cs = new Map<string, string>()
    const ms = new Set<string>()
    const as = new Set<string>()
    ops.forEach(o => {
      if (o.corretora_id) cs.set(o.corretora_id, nomeDaCorretora(o.corretora_id))
      if (o.modalidade) ms.add(o.modalidade)
      const a = o.tomador_id ? tomadores.get(o.tomador_id)?.central_area : null
      if (a) as.add(a)
    })
    return {
      corretoras: [...cs.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')),
      modalidades: [...ms].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      areas: [...as].sort((a, b) => nomeArea(a).localeCompare(nomeArea(b), 'pt-BR')),
    }
  }, [ops, tomadores, nomeDaCorretora])

  /* Quantas estao paradas ha mais de 30 dias. Vira numero no topo: e a conta
     que ninguem faz sozinho, e e a que diz se o funil esta escoando. */
  const paradas = useMemo(
    () => vistas.filter(o => !MORTAS.has(o.status ?? '') && (diasParada(o) ?? 0) > 30).length,
    [vistas, diasParada])

  // ── os números do topo, na conta do protótipo ─────────────────────────────
  const kpis = useMemo(() => {
    const vivas = vistas.filter(o => !MORTAS.has(o.status ?? ''))
    const emitidas = vistas.filter(o => o.status === 'Emitido')
    // "Cards vivos" é EMPRESA, e não operação: é a regra da tela.
    const empresasVivas = new Set(vivas.map(o => o.tomador_id).filter(Boolean))
    return {
      empresas: empresasVivas.size,
      vivas: vivas.length,
      mortas: vistas.length - vivas.length,
      lmg: emitidas.reduce((s, o) => s + num(o.lmg), 0),
      premio: emitidas.reduce((s, o) => s + num(o.premio_previsto), 0),
      apolices: emitidas.length,
    }
  }, [vistas])

  const porEtapa = useCallback(
    (nome: string) => vistas.filter(o => (o.status ?? '') === nome),
    [vistas])

  /** UMA EMPRESA, UM CARD: o olhar por área não repete o tomador uma vez por
   *  operação. Cada empresa aparece na coluna da área que está com a central. */
  const empresasVistas = useMemo(() => {
    const mapa = new Map<string, { id: string; nome: string; ops: Operacao[] }>()
    vistas.forEach(o => {
      if (!o.tomador_id) return
      const atual = mapa.get(o.tomador_id)
      if (atual) atual.ops.push(o)
      else mapa.set(o.tomador_id, { id: o.tomador_id, nome: nomeDoTomador(o.tomador_id), ops: [o] })
    })
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [vistas, nomeDoTomador])

  /** A cor da etapa, para a Galeria e a Lista pintarem igual ao Kanban. Etapa
   *  que saiu da régua fica cinza, e não colorida de mentira. */
  const corDaEtapa = useCallback(
    (nome: string | null) => etapas.find(e => e.nome === nome)?.cor ?? '#8fa3b8',
    [etapas])

  /** A Lista e a Galeria são a mesma lista do Kanban, só que em fila única e
   *  ordenada. Nulo vai para o fim nos dois sentidos, e empate desempata pela
   *  empresa: as duas regras da lista de análises, pelo mesmo motivo. */
  const emFila = useMemo(() => {
    const col = COLUNAS_LISTA.find(c => c.k === coluna) ?? COLUNAS_LISTA[6]
    const nome = (o: Operacao) => nomeDoTomador(o.tomador_id)
    const porNome = (a: Operacao, b: Operacao) => nome(a).localeCompare(nome(b), 'pt-BR')
    return [...vistas].sort((a, b) => {
      const va = col.valor(a, nomeDoTomador(a.tomador_id), nomeDaCorretora(a.corretora_id))
      const vb = col.valor(b, nomeDoTomador(b.tomador_id), nomeDaCorretora(b.corretora_id))
      if (va === null || vb === null) {
        if (va === vb) return porNome(a, b)
        return va === null ? 1 : -1
      }
      const r = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'pt-BR')
      return (direcao === 'desc' ? -r : r) || porNome(a, b)
    })
  }, [vistas, coluna, direcao, nomeDoTomador, nomeDaCorretora])

  const clicarNoTitulo = (k: ColunaLista) => {
    if (k === coluna) { setDirecao(d => (d === 'asc' ? 'desc' : 'asc')); return }
    setColuna(k)
    setDirecao(COLUNAS_LISTA.find(c => c.k === k)?.padrao ?? 'asc')
  }

  /* As operações cuja etapa não existe (ou não está mais ativa) na régua. Elas
     não podem sumir da tela: some da tela = some do trabalho de alguém. */
  const orfas = useMemo(() => {
    const conhecidas = new Set(etapas.map(e => e.nome))
    return vistas.filter(o => !conhecidas.has(o.status ?? ''))
  }, [vistas, etapas])

  /* Os casos da primeira coluna, filtrados pela MESMA busca das operações: se a
     busca escondesse só metade da tela, o funil mentiria sobre o que tem. */
  const casosVistos = useMemo(() => {
    const q = chave(busca.trim())
    if (!q) return casos
    return casos.filter(c =>
      chave(`${c.razao_social ?? ''} ${c.assunto} ${c.cnpj ?? ''} ${c.corretora_texto ?? ''}`).includes(q))
  }, [casos, busca])

  /* ABRIR PELO CNPJ, sem e-mail nenhum. O pedido que chega por telefone ou por
     WhatsApp entrava no CRM por caminho nenhum: ou virava .msg forçado, ou ia
     para fora do sistema. Agora entra por aqui, e cai na mesma tela de Triagem
     do caso que veio de e-mail. */
  async function abrirPorCnpj() {
    const digitos = cnpjNovo.replace(/\D/g, '')
    if (!validarCNPJ(digitos)) { setErro('CNPJ inválido: confira os dígitos.'); return }
    setCriando(true); setErro('')
    try {
      const r = await fetch('/api/casos/novo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cnpj: digitos }),
      })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui abrir o cadastro.'); setCriando(false); return }
      router.push(`/comercial/${j.caso.id}`)
    } catch {
      setErro('A conexão caiu. Tente de novo.')
      setCriando(false)
    }
  }

  return (
    <div style={{ padding: '4px 0 26px' }}>
      {/* ── a faixa que ensina a regra, igual à do protótipo ── */}
      <div style={{
        background: '#fdf8e6', border: '1px solid #eddda8', borderRadius: 9,
        padding: '9px 13px', fontSize: 12.5, color: '#7a5e10', display: 'flex',
        alignItems: 'center', gap: 9, marginBottom: 14, lineHeight: 1.45, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 15 }}>📋</span>
        <div>
          <b style={{ color: '#5c460a' }}>Uma empresa, um card. Cada operação é um ID secundário.</b>{' '}
          O mesmo tomador pode ter operação viva e operação recusada ao mesmo tempo. Clique numa
          operação para abrir o card dela.
        </div>
      </div>

      {erro && <div className="alert-error" style={{ marginBottom: 14 }}>{erro}</div>}

      {/* ── KPIs ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <Kpi rotulo="Empresas no funil" numero={String(kpis.empresas)} pe="com pelo menos uma operação viva" />
        <Kpi rotulo="Operações" numero={String(kpis.vivas)} pe={`${kpis.mortas} recusadas ou perdidas`} />
        <Kpi rotulo="LMG emitido" numero={brlCurto(kpis.lmg)} pe={`${kpis.apolices} apólices`} cor="#27a96c" />
        <Kpi rotulo="Prêmio previsto" numero={brlCurto(kpis.premio)} pe="nas apólices emitidas" destaque />
        {/* O numero que ninguem faz na mao: quantas estao envelhecendo na mesma
            etapa. Clicar nele LIGA o filtro, para o numero levar ao trabalho em
            vez de so informar que ele existe. */}
        <button
          onClick={() => setFParadas(p => !p)}
          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
        >
          <Kpi
            rotulo="Paradas há +30 dias"
            numero={String(paradas)}
            pe={fParadas ? 'filtrando só por elas' : 'clique para ver só elas'}
            cor={paradas ? '#d64545' : undefined}
          />
        </button>
      </div>

      {/* ══ A BARRA DE FILTROS ══════════════════════════════════════════════
          Veio da pesquisa que ele pediu em 09/09/2026: filtrar por dono, etapa
          e periodo e o basico que todo funil serio tem, e este so tinha busca
          por texto. Cada filtro aqui responde a uma pergunta que alguem faz de
          verdade: "o que e da corretora X", "o que e Judicial", "o que esta na
          minha area", "o que ja passou de R$ 1 mi", "o que esta parado".

          Os filtros SOMAM (E, e nao OU) e nunca escondem sem dizer: quando ha
          filtro ligado, a barra fica azul e aparece o botao de limpar. Filtro
          esquecido ligado e a forma mais comum de alguem jurar que um card
          sumiu do sistema. */}
      <div className="card-panel" style={{
        padding: '12px 14px', marginBottom: 14,
        borderColor: filtrosLigados ? '#3070c8' : undefined,
        background: filtrosLigados ? '#f4f8fd' : undefined,
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, alignItems: 'center' }}>
          <input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Empresa, CNPJ, corretora ou produto"
            aria-label="Procurar no funil"
            style={{
              flex: '1 1 220px', minWidth: 0, padding: '8px 11px', fontSize: 13.5,
              border: '1px solid var(--border)', borderRadius: 8, background: '#fff',
            }}
          />

          <select value={fCorretora} onChange={e => setFCorretora(e.target.value)}
            aria-label="Filtrar por corretora" style={ESTILO_FILTRO}>
            <option value="">Toda corretora</option>
            {opcoes.corretoras.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>

          <select value={fModalidade} onChange={e => setFModalidade(e.target.value)}
            aria-label="Filtrar por modalidade" style={ESTILO_FILTRO}>
            <option value="">Toda modalidade</option>
            {opcoes.modalidades.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select value={fArea} onChange={e => setFArea(e.target.value)}
            aria-label="Filtrar por área responsável" style={ESTILO_FILTRO}>
            <option value="">Toda área</option>
            {opcoes.areas.map(a => <option key={a} value={a}>{nomeArea(a)}</option>)}
          </select>

          <select value={fLmg} onChange={e => setFLmg(e.target.value)}
            aria-label="Filtrar por LMG mínimo" style={ESTILO_FILTRO}>
            <option value="">Todo valor</option>
            <option value="1000000">LMG maior que R$ 1 mi</option>
            <option value="5000000">LMG maior que R$ 5 mi</option>
            <option value="10000000">LMG maior que R$ 10 mi</option>
            <option value="50000000">LMG maior que R$ 50 mi</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 10 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#22344d' }}>
            <input type="checkbox" checked={soVivas} onChange={e => setSoVivas(e.target.checked)} />
            Esconder recusadas e perdidas
          </label>

          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5,
            color: fParadas ? '#a02020' : '#22344d', fontWeight: fParadas ? 700 : 400,
          }}>
            <input type="checkbox" checked={fParadas} onChange={e => setFParadas(e.target.checked)} />
            Só as paradas há mais de 30 dias
          </label>

          <button onClick={alternarDensidade} className="btn-clear"
            style={{ fontSize: 12, padding: '4px 10px' }}
            title="Quanto cabe na tela sem rolar">
            {compacto ? 'Compacto' : 'Confortável'}
          </button>

          {fechadas.size > 0 && (
            <button
              onClick={() => {
                setFechadas(new Set())
                try { localStorage.removeItem('fam.funil.fechadas') } catch {}
              }}
              className="btn-clear" style={{ fontSize: 12, padding: '4px 10px' }}>
              abrir as {fechadas.size} colunas fechadas
            </button>
          )}

          <span style={{ flex: 1 }} />

          {filtrosLigados && (
            <button onClick={limparFiltros} className="btn-clear"
              style={{ fontSize: 12, padding: '4px 10px', borderColor: '#3070c8', color: '#1e4080' }}>
              limpar filtros
            </button>
          )}
          <span className="badge badge-blue">{vistas.length} operações</span>
        </div>
      </div>

      {/* ── O FUNIL ── */}
      <section className="card-panel" style={{ padding: 18 }}>
        <div style={{
          fontSize: 15, fontWeight: 700, color: '#1a3560', marginBottom: 13, paddingBottom: 8,
          borderBottom: '2px solid #d0e4f5', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3070c8' }} />
          Funil de operações

          {/* A aba de caderno do Sistema de Análise: a escolhida é a folha
              branca na frente das outras. Três olhares, o mesmo dado. */}
          <div role="group" aria-label="Modo de visualização" style={{
            display: 'inline-flex', background: '#eef3f9', border: '1px solid var(--border)',
            borderRadius: 8, padding: 2, gap: 2, marginLeft: 6,
          }}>
            {([
              { m: 'kanban', rotulo: 'Kanban', dica: 'A fila inteira de uma vez, por etapa' },
              { m: 'galeria', rotulo: 'Galeria', dica: 'O cartão grande, para bater o olho e entender o caso' },
              { m: 'lista', rotulo: 'Lista', dica: 'Uma linha por operação, para varrer e comparar' },
              { m: 'areas', rotulo: 'Áreas', dica: 'Um cartão por EMPRESA, na área que está com a central. Arrastar muda a área responsável, não o status' },
            ] as { m: Modo; rotulo: string; dica: string }[]).map(b => (
              <button key={b.m} type="button" title={b.dica}
                aria-pressed={modo === b.m}
                onClick={() => setModo(b.m)}
                style={{
                  background: modo === b.m ? '#fff' : 'none',
                  border: `1px solid ${modo === b.m ? 'var(--border)' : 'transparent'}`,
                  borderRadius: 6, padding: '4px 12px', fontSize: 11.5, fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer',
                  color: modo === b.m ? '#1e4080' : 'var(--soft)',
                }}>
                {b.rotulo}
              </button>
            ))}
          </div>

          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--soft)' }}>
            {carregando ? 'carregando…' : `${kpis.vivas} vivas · ${kpis.mortas} recusadas ou perdidas`}
          </span>
        </div>

        {/* ══════════ GALERIA ══════════ */}
        {modo === 'galeria' && (
          emFila.length === 0
            ? <div style={{ fontSize: 13, color: 'var(--soft)' }}>Nenhuma operação com essa busca.</div>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {emFila.map(o => (
                  <Ficha
                    key={o.id}
                    empresa={nomeDoTomador(o.tomador_id)}
                    cnpj={o.tomador_id ? (tomadores.get(o.tomador_id)?.cnpj ?? null) : null}
                    corretora={nomeDaCorretora(o.corretora_id)}
                    modalidade={o.modalidade}
                    etapa={o.status}
                    lmg={num(o.lmg)}
                    taxa={num(o.taxa)}
                    premio={num(o.premio_previsto)}
                    entrada={o.data_entrada}
                    cor={corDaEtapa(o.status)}
                    morta={MORTAS.has(o.status ?? '')}
                    podeAbrir={!!o.tomador_id}
                    onAbrir={() => o.tomador_id && router.push(`/tomadores/${o.tomador_id}`)}
                  />
                ))}
              </div>
            )
        )}

        {/* ══════════ LISTA ══════════ */}
        {modo === 'lista' && (
          emFila.length === 0
            ? <div style={{ fontSize: 13, color: 'var(--soft)' }}>Nenhuma operação com essa busca.</div>
            : (
              <div className="mt-tab-wrap">
                <table className="mt-tab">
                  <thead>
                    <tr>
                      {COLUNAS_LISTA.map(c => {
                        const ativa = coluna === c.k
                        return (
                          <th key={c.k} style={{ padding: 0 }}
                            aria-sort={ativa ? (direcao === 'asc' ? 'ascending' : 'descending') : 'none'}>
                            <button type="button" onClick={() => clicarNoTitulo(c.k)}
                              title={`Ordenar por ${c.rotulo}`}
                              style={{
                                width: '100%', display: 'inline-flex', alignItems: 'center', gap: 5,
                                justifyContent: c.n ? 'flex-end' : 'flex-start',
                                padding: '11px 14px', background: 'none', border: 'none',
                                fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: '.8px',
                                color: ativa ? '#1e4080' : '#8ba3c0',
                                whiteSpace: 'nowrap', cursor: 'pointer',
                              }}>
                              {c.rotulo}
                              <span aria-hidden style={{ fontSize: 8, opacity: ativa ? 1 : 0.35 }}>
                                {ativa && direcao === 'asc' ? '▲' : '▼'}
                              </span>
                            </button>
                          </th>
                        )
                      })}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {emFila.map(o => {
                      const podeAbrir = !!o.tomador_id
                      const t = o.tomador_id ? tomadores.get(o.tomador_id) : null
                      return (
                        <tr key={o.id}
                          style={{ cursor: podeAbrir ? 'pointer' : 'default', opacity: MORTAS.has(o.status ?? '') ? 0.72 : 1 }}
                          onClick={podeAbrir ? () => router.push(`/tomadores/${o.tomador_id}`) : undefined}
                          title={podeAbrir ? 'Abrir o card desta empresa' : 'Operação sem tomador cadastrado'}>
                          <td>
                            <div style={{ fontWeight: 700, color: '#0a1628' }}>{nomeDoTomador(o.tomador_id)}</div>
                            {t?.cnpj && (
                              <div style={{ fontSize: 11.5, color: 'var(--soft)', fontVariantNumeric: 'tabular-nums' }}>
                                {maskCNPJ(t.cnpj)}
                              </div>
                            )}
                          </td>
                          <td style={{ whiteSpace: 'normal', maxWidth: 180 }}>{nomeDaCorretora(o.corretora_id) || '—'}</td>
                          <td style={{ whiteSpace: 'normal', maxWidth: 180 }}>{o.modalidade || '—'}</td>
                          <td><Fita nome={o.status} cor={corDaEtapa(o.status)} /></td>
                          <td className="n">{o.lmg === null ? '—' : fmtMoeda(num(o.lmg))}</td>
                          <td className="n">{pct(num(o.taxa))}</td>
                          <td className="dim">{o.data_entrada ? new Date(o.data_entrada + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                          <td className="seta" style={{ textAlign: 'right' }}>{podeAbrir ? '›' : ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
        )}

        {/* ══════════ ÁREAS ══════════
            As outras colunas são o STATUS da operação. Estas são a ÁREA que
            está com a central, e o cartão é a EMPRESA. Arrastar aqui move a
            responsabilidade entre áreas; o status da operação continua sendo
            decidido dentro da seção, ao concluir. Decisão dele em 08/09/2026. */}
        {modo === 'areas' && (
          <>
            <div className="mt-nota" style={{ marginBottom: 12 }}>
              Um cartão por <b>empresa</b>, na área que está com a central. Arraste para passar a
              responsabilidade: <b>o status da operação não muda</b>, e a mudança fica no histórico do card.
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: `repeat(${REGUA.length}, minmax(198px, 1fr))`,
              gap: 10, overflowX: 'auto', paddingBottom: 6,
            }}>
              {REGUA.map(posto => {
                const daArea = empresasVistas.filter(
                  e => ((tomadores.get(e.id)?.central_area as PostoCentral) ?? 'comercial') === posto)
                return (
                  <div key={posto}
                    onDragOver={ev => { ev.preventDefault(); setSoltandoEm(posto) }}
                    onDragLeave={() => setSoltandoEm(s => (s === posto ? null : s))}
                    onDrop={ev => {
                      ev.preventDefault()
                      setSoltandoEm(null)
                      const id = ev.dataTransfer.getData('text/plain') || arrastando
                      if (id) mover(id, posto)
                      setArrastando(null)
                    }}
                    style={{
                      background: soltandoEm === posto ? '#e8f0fa' : '#eef3f9',
                      border: `1px ${soltandoEm === posto ? 'dashed #1e4080' : 'solid var(--border)'}`,
                      borderRadius: 10, padding: 9, minHeight: 140,
                    }}>
                    <h4 style={{
                      fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.7px',
                      color: '#1a3560', fontWeight: 700, display: 'flex',
                      justifyContent: 'space-between', alignItems: 'center', margin: '0 0 8px', gap: 6,
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{nomeArea(posto)}</span>
                      <span style={{
                        background: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11,
                        border: '1px solid var(--border)', flexShrink: 0,
                      }}>{daArea.length}</span>
                    </h4>

                    {daArea.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: '#8fa3b8', padding: '6px 2px' }}>vazio</div>
                    ) : daArea.map(emp => {
                      const r = resumoDe(emp.id)
                      const lmg = emp.ops.reduce((s, o) => s + num(o.lmg), 0)
                      return (
                        <div key={emp.id}
                          draggable
                          onDragStart={ev => { ev.dataTransfer.setData('text/plain', emp.id); setArrastando(emp.id) }}
                          onDragEnd={() => { setArrastando(null); setSoltandoEm(null) }}
                          onClick={() => router.push(`/tomadores/${emp.id}`)}
                          title="Arraste para outra área, ou clique para abrir o card"
                          style={{
                            background: '#fff', border: '1px solid var(--border)',
                            borderLeft: `4px solid ${r?.paralisado ? '#a05010' : r?.trava ? '#e8b84b' : '#27a96c'}`,
                            borderRadius: 8, padding: '9px 11px', marginBottom: 8, cursor: 'grab',
                            opacity: arrastando === emp.id ? 0.5 : 1,
                          }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#102040', lineHeight: 1.3 }}>
                            {emp.nome}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 3 }}>
                            {emp.ops.length} {emp.ops.length === 1 ? 'operação' : 'operações'} · <b style={{ color: '#1a2a3a' }}>{brlCurto(lmg)}</b>
                          </div>
                          {r?.paralisado ? (
                            <div style={{ fontSize: 11, color: '#a05010', marginTop: 4, fontWeight: 700 }}>⏸ {r.trava}</div>
                          ) : r?.trava ? (
                            <div style={{ fontSize: 11, color: '#8a6410', marginTop: 4 }}>{r.trava}</div>
                          ) : (
                            <div style={{ fontSize: 11, color: '#1a7a50', marginTop: 4 }}>nada travando</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ══════════ KANBAN ══════════ */}
        <div style={{
          display: modo === 'kanban' ? 'grid' : 'none',
          /* Coluna fechada vira uma faixa fina em vez de sumir. A pesquisa
             recomenda no maximo 5 a 7 colunas; esconder etapa a forca faria
             trabalho sumir da vista, entao ela encolhe e continua contando. */
          gridTemplateColumns: `minmax(178px, 1fr) ${etapas
            .map(et => (fechadas.has(et.nome) ? '46px' : 'minmax(178px, 1fr)'))
            .join(' ') || 'minmax(178px, 1fr)'}`,
          gap: 10, overflowX: 'auto', paddingBottom: 6,
        }}>
          {/* ══ A COLUNA ZERO · TRIAGEM E CADASTRO ══════════════════════════
              O funil começava na primeira etapa da OPERAÇÃO, mas o trabalho
              começa antes disso: alguém recebeu um pedido e ainda não sabe de
              quem é. Essa parte morava numa tela à parte (/comercial), e era
              justamente o "primeiro passo confuso". Agora é a coluna 1 daqui.

              Ela não vem de `status_fluxo_operacao` porque não é etapa de
              operação: a operação ainda não existe. É a antessala do funil. */}
          <div style={{
            background: '#eaf1fb', border: '1px dashed #b8cbe8', borderRadius: 10,
            padding: 9, minHeight: 120,
          }}>
            <h4 style={{
              fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.7px',
              color: '#1a3560', fontWeight: 700, display: 'flex',
              justifyContent: 'space-between', alignItems: 'center', margin: '0 0 8px', gap: 6,
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: '#1e4080' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Triagem / Cadastro</span>
              </span>
              <span style={{
                background: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11,
                border: '1px solid var(--border)', flexShrink: 0,
              }}>{casosVistos.length}</span>
            </h4>

            {abrindo ? (
              <div style={{
                background: '#fff', border: '1px solid #1e4080', borderRadius: 9,
                padding: 9, marginBottom: 8,
              }}>
                <input
                  className="fam-input" autoFocus value={maskCNPJ(cnpjNovo)}
                  onChange={e => setCnpjNovo(e.target.value.replace(/\D/g, '').slice(0, 14))}
                  onKeyDown={e => { if (e.key === 'Enter' && !criando) abrirPorCnpj() }}
                  placeholder="00.000.000/0000-00" inputMode="numeric"
                  style={{ fontSize: 12.5, padding: '5px 8px', marginBottom: 7 }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn-primary" onClick={abrirPorCnpj}
                    disabled={criando || cnpjNovo.replace(/\D/g, '').length !== 14}
                    style={{ fontSize: 12, padding: '5px 10px' }}
                  >
                    {criando ? 'Buscando…' : 'Buscar na Receita'}
                  </button>
                  <button
                    className="btn-clear" onClick={() => { setAbrindo(false); setCnpjNovo('') }}
                    style={{ fontSize: 12, padding: '5px 8px' }}
                  >
                    cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAbrindo(true)}
                style={{
                  width: '100%', background: '#fff', border: '1px dashed #1e4080',
                  color: '#1e4080', borderRadius: 9, padding: '8px 6px', fontSize: 12,
                  fontWeight: 600, cursor: 'pointer', marginBottom: 8,
                }}
              >
                ＋ Novo pelo CNPJ
              </button>
            )}

            {casosVistos.length === 0 ? (
              <div style={{ fontSize: 11.5, color: '#8fa3b8', padding: '6px 2px' }}>
                nada esperando triagem
              </div>
            ) : (
              casosVistos.map(c => (
                <CartaoCaso
                  key={c.id}
                  caso={c}
                  onAbrir={() => router.push(`/comercial/${c.id}`)}
                />
              ))
            )}
          </div>

          {etapas.map(et => {
            const doCol = porEtapa(et.nome)
            const fechada = fechadas.has(et.nome)
            /* O TETO DE FILA. Estourou, a coluna fica vermelha e diz quantas
               estao acima. Ele nao impede nada: o objetivo e o gargalo aparecer
               antes de virar atraso com o corretor, e travar o arrastar so
               empurraria o trabalho para fora do sistema. */
            const teto = et.wip_limite ?? null
            const estourou = teto !== null && doCol.length > teto

            if (fechada) {
              return (
                <button
                  key={et.nome}
                  onClick={() => alternarColuna(et.nome)}
                  title={`Abrir a coluna ${et.nome} (${doCol.length})`}
                  style={{
                    background: '#eef3f9', border: '1px solid var(--border)', borderRadius: 10,
                    padding: '9px 4px', minHeight: 120, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: et.cor ?? '#3070c8',
                  }} />
                  <span style={{
                    background: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11,
                    border: '1px solid var(--border)', color: '#1a3560', fontWeight: 700,
                  }}>{doCol.length}</span>
                  <span style={{
                    writingMode: 'vertical-rl', fontSize: 10.5, color: '#1a3560',
                    textTransform: 'uppercase', letterSpacing: '.6px', fontWeight: 700,
                    maxHeight: 150, overflow: 'hidden',
                  }}>{et.nome}</span>
                </button>
              )
            }

            return (
              <div key={et.nome} style={{
                background: estourou ? '#fdf1f1' : '#eef3f9',
                border: '1px solid ' + (estourou ? '#e8b4b4' : 'var(--border)'),
                borderRadius: 10, padding: 9, minHeight: 120,
              }}>
                <h4 style={{
                  fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.7px',
                  color: '#1a3560', fontWeight: 700, display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center', margin: '0 0 8px', gap: 6,
                }}>
                  <span
                    onClick={() => alternarColuna(et.nome)}
                    title="Fechar esta coluna"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      minWidth: 0, cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: et.cor ?? '#3070c8',
                    }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{et.nome}</span>
                  </span>
                  <span
                    title={teto === null ? 'Sem teto de fila' : `Teto de fila: ${teto}`}
                    style={{
                      background: estourou ? '#d64545' : '#fff',
                      color: estourou ? '#fff' : '#1a3560',
                      borderRadius: 10, padding: '1px 7px', fontSize: 11,
                      border: '1px solid ' + (estourou ? '#d64545' : 'var(--border)'),
                      flexShrink: 0, whiteSpace: 'nowrap',
                    }}
                  >{doCol.length}{teto !== null ? `/${teto}` : ''}</span>
                </h4>

                {estourou && (
                  <div style={{
                    fontSize: 10.5, color: '#a02020', lineHeight: 1.4,
                    margin: '-3px 0 8px', fontWeight: 600,
                  }}>
                    {doCol.length - (teto ?? 0)} acima do teto. Esta etapa virou gargalo.
                  </div>
                )}

                {doCol.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: '#8fa3b8', padding: '6px 2px' }}>vazio</div>
                ) : (
                  doCol.map(o => (
                    <Cartao
                      key={o.id}
                      empresa={nomeDoTomador(o.tomador_id)}
                      corretora={nomeDaCorretora(o.corretora_id)}
                      modalidade={o.modalidade}
                      lmg={num(o.lmg)}
                      taxa={num(o.taxa)}
                      cor={et.cor ?? '#3070c8'}
                      morta={MORTAS.has(o.status ?? '')}
                      podeAbrir={!!o.tomador_id}
                      onAbrir={() => o.tomador_id && router.push(`/tomadores/${o.tomador_id}`)}
                      area={resumoDe(o.tomador_id)?.area}
                      trava={resumoDe(o.tomador_id)?.trava}
                      paralisado={resumoDe(o.tomador_id)?.paralisado}
                      dias={MORTAS.has(o.status ?? '') ? null : diasParada(o)}
                      compacto={compacto}
                      exato={entrouNaEtapa.has(o.id)}
                    />
                  ))
                )}
              </div>
            )
          })}
        </div>

        {/* O aviso é do KANBAN: é lá que a operação fica sem coluna. Na Galeria e
            na Lista ela aparece como todas as outras, então repetir o aviso ali
            seria dizer que sumiu o que está na tela. */}
        {orfas.length > 0 && modo === 'kanban' && (
          <div className="mt-nota at" style={{ marginTop: 14 }}>
            <b>{orfas.length} operações estão numa etapa que não está na régua</b> (
            {[...new Set(orfas.map(o => o.status ?? 'sem etapa'))].join(', ')}). Elas não aparecem
            em coluna nenhuma acima. A etapa some da régua, o trabalho não some junto: ou a etapa
            volta a ser ativa em Operações, ou essas operações precisam ser movidas.
          </div>
        )}
      </section>

      <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 12, lineHeight: 1.6, maxWidth: '92ch' }}>
        As colunas são as etapas de <b>status_fluxo_operacao</b>, a mesma régua da tela de Operações:
        etapa nova é uma linha naquela tabela, sem mexer nesta tela. Todo mundo no CRM enxerga este
        funil; quem escreve continua sendo quem tem perfil para isso.
      </div>
    </div>
  )
}

// ── as peças da tela ────────────────────────────────────────────────────────

function Kpi({ rotulo, numero, pe, cor, destaque }: {
  rotulo: string; numero: string; pe: string; cor?: string; destaque?: boolean
}) {
  return (
    <div style={{
      flex: '1 1 165px', background: destaque ? 'linear-gradient(135deg,#102040,#1e4080)' : '#fff',
      borderRadius: 12, padding: '15px 17px 13px',
      boxShadow: '0 2px 12px rgba(30,64,128,.08)',
      border: destaque ? 'none' : '1px solid var(--border)',
      position: 'relative', overflow: 'hidden',
    }}>
      {!destaque && (
        <span style={{
          content: '', position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: cor ?? '#3070c8', display: 'block',
        }} />
      )}
      <div style={{
        fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 1,
        color: destaque ? '#a0c0e8' : 'var(--soft)', fontWeight: 700, marginBottom: 5,
      }}>{rotulo}</div>
      <div style={{
        fontSize: 22, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
        color: destaque ? '#e8b84b' : '#102040',
      }}>{numero}</div>
      <div style={{ fontSize: 11.5, color: destaque ? '#8fb3d9' : 'var(--soft)', marginTop: 3 }}>{pe}</div>
    </div>
  )
}

/** A fita da etapa, do tamanho de uma etiqueta. A cor é a da régua, e etapa
 *  desconhecida sai cinza: pintar de verde o que não se conhece é afirmar o que
 *  o dado não diz. */
function Fita({ nome, cor }: { nome: string | null; cor: string }) {
  if (!nome) return <span style={{ color: 'var(--soft)' }}>—</span>
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11,
      fontWeight: 700, whiteSpace: 'nowrap', color: cor,
      border: `1px solid ${cor}`, background: `${cor}14`,
    }}>{nome}</span>
  )
}

/** As iniciais da empresa, como o selo do Sistema de Análise. */
const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '—'

/** GALERIA: o cartão completo, para bater o olho e entender o caso inteiro.
 *  É a `.ficha` do painel do Sistema de Análise: a capa colorida da etapa no
 *  alto, o selo com as iniciais, e a ação empurrada para o pé para os cartões
 *  da mesma linha terminarem na mesma altura. */
function Ficha({ empresa, cnpj, corretora, modalidade, etapa, lmg, taxa, premio, entrada, cor, morta, podeAbrir, onAbrir }: {
  empresa: string
  cnpj: string | null
  corretora: string
  modalidade: string | null
  etapa: string | null
  lmg: number
  taxa: number
  premio: number
  entrada: string | null
  cor: string
  morta: boolean
  podeAbrir: boolean
  onAbrir: () => void
}) {
  return (
    <article
      role={podeAbrir ? 'button' : undefined}
      tabIndex={podeAbrir ? 0 : undefined}
      onClick={podeAbrir ? onAbrir : undefined}
      onKeyDown={podeAbrir ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir() } }) : undefined}
      title={podeAbrir ? 'Abrir o card desta empresa' : 'Operação sem tomador cadastrado no CRM'}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        border: '1px solid var(--border)', borderRadius: 10, padding: '17px 15px 13px',
        background: '#fff', overflow: 'hidden', opacity: morta ? 0.82 : 1,
        cursor: podeAbrir ? 'pointer' : 'default', transition: 'transform .12s, box-shadow .12s',
      }}
      onMouseEnter={e => {
        if (!podeAbrir) return
        e.currentTarget.style.transform = 'translateY(-1px)'
        e.currentTarget.style.boxShadow = '0 6px 18px rgba(30,64,128,.14)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = ''
      }}
    >
      {/* a capa colorida: a mesma fita da etapa, deitada no alto do cartão */}
      <span style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 4, background: cor }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
        <span style={{
          width: 38, height: 38, borderRadius: 5, flex: '0 0 auto', display: 'grid',
          placeItems: 'center', fontSize: 13, fontWeight: 700, color: '#fff',
          background: cor, letterSpacing: '-.02em',
        }}>{iniciais(empresa)}</span>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#0a1628', lineHeight: 1.3 }}>{empresa}</h3>
          {cnpj && (
            <div style={{ fontSize: 10.5, color: 'var(--soft)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
              {maskCNPJ(cnpj)}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 12px', marginBottom: 11 }}>
        <Meta rotulo="Corretora" valor={corretora || '—'} />
        <Meta rotulo="Produto" valor={modalidade || '—'} />
        <Meta rotulo="LMG" valor={lmg ? fmtMoeda(lmg) : '—'} forte />
        <Meta rotulo="Taxa" valor={pct(taxa)} />
        {premio > 0 && <Meta rotulo="Prêmio previsto" valor={fmtMoeda(premio)} />}
        {entrada && <Meta rotulo="Entrada" valor={new Date(entrada + 'T12:00:00').toLocaleDateString('pt-BR')} />}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid #eef3f9' }}>
        <Fita nome={etapa} cor={cor} />
      </div>
    </article>
  )
}

function Meta({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em',
        color: '#8ba3c0', fontWeight: 700, marginBottom: 2,
      }}>{rotulo}</div>
      <div
        title={valor}
        style={{
          fontSize: forte ? 13 : 12, color: forte ? '#0a1628' : '#1a2a3a',
          fontWeight: forte ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
        }}>{valor}</div>
    </div>
  )
}

/** O cartão da coluna zero. É mais magro que o das operações de propósito: aqui
 *  ainda não há LMG nem taxa — há uma empresa que talvez nem tenha nome ainda.
 *  O que ele precisa dizer é só uma coisa: o que falta para este pedido andar. */
function CartaoCaso({ caso, onAbrir }: { caso: Caso; onAbrir: () => void }) {
  const temCnpj = (caso.cnpj ?? '').replace(/\D/g, '').length === 14
  const cadastrado = !!caso.tomador_id
  const falta = !temCnpj ? 'falta o CNPJ' : !cadastrado ? 'falta cadastrar' : 'pronto para a análise'

  return (
    <div
      onClick={onAbrir}
      style={{
        background: '#fff', border: '1px solid var(--border)', borderLeft: '3px solid #1e4080',
        borderRadius: 9, padding: '8px 9px', marginBottom: 7, cursor: 'pointer',
      }}
    >
      <div style={{
        fontSize: 12.5, fontWeight: 700, color: '#0a1628', lineHeight: 1.3,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {caso.razao_social || caso.assunto}
      </div>
      <div style={{ fontSize: 11, color: 'var(--soft)', marginTop: 2 }}>
        {temCnpj ? maskCNPJ(caso.cnpj ?? '') : `caso #${caso.numero}`}
        {caso.corretora_texto ? ` · ${caso.corretora_texto}` : ''}
      </div>
      <div style={{
        fontSize: 10.5, marginTop: 5, display: 'inline-block', padding: '1px 7px',
        borderRadius: 9, fontWeight: 600,
        background: cadastrado ? '#e6f4ec' : temCnpj ? '#fdf4dd' : '#fbe9e9',
        color: cadastrado ? '#1a7a4c' : temCnpj ? '#8a6410' : '#a02020',
      }}>
        {falta}
      </div>
    </div>
  )
}

function Cartao({ empresa, corretora, modalidade, lmg, taxa, cor, morta, podeAbrir, onAbrir, area, trava, paralisado, dias, compacto, exato }: {
  empresa: string
  corretora: string
  modalidade: string | null
  lmg: number
  taxa: number
  cor: string
  morta: boolean
  podeAbrir: boolean
  onAbrir: () => void
  /** A área que está com a central do card, e o que trava lá. Vem de
   *  lib/card/secoes, a mesma conta que a Mesa faz. */
  area?: string
  trava?: string | null
  paralisado?: boolean
  /** Há quantos dias esta operação está nesta etapa. Nulo quando não dá para
   *  saber, e nas operações mortas (o relógio delas parou). */
  dias?: number | null
  /** Modo compacto: cabe mais coluna na tela, some o secundário. */
  compacto?: boolean
  /** Se o número de dias veio da mudança de etapa (exato) ou da data de
   *  entrada (aproximado). A tela DIZ qual dos dois, porque um número que
   *  parece uma coisa e é outra é pior do que número nenhum. */
  exato?: boolean
}) {
  const idade = morta ? null : faixaDeIdade(dias ?? null)
  return (
    <div
      role={podeAbrir ? 'button' : undefined}
      tabIndex={podeAbrir ? 0 : undefined}
      onClick={podeAbrir ? onAbrir : undefined}
      onKeyDown={podeAbrir ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir() } }) : undefined}
      title={podeAbrir
        ? 'Abrir o card desta empresa'
        : 'Esta operação não está ligada a um tomador cadastrado, então não há card para abrir'}
      style={{
        background: '#fff', border: '1px solid var(--border)', borderLeft: `4px solid ${cor}`,
        borderRadius: 8, padding: compacto ? '6px 8px' : '9px 11px', marginBottom: compacto ? 5 : 8,
        cursor: podeAbrir ? 'pointer' : 'default', opacity: morta ? 0.78 : 1,
        transition: 'transform .12s, box-shadow .12s',
      }}
      onMouseEnter={e => {
        if (!podeAbrir) return
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 6px 18px rgba(30,64,128,.14)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = ''
      }}
    >
      <div style={{
        fontSize: compacto ? 12 : 13, fontWeight: 700, color: '#102040', lineHeight: 1.3,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: compacto ? 'nowrap' : 'normal',
      }}>{empresa}</div>

      {/* NO COMPACTO SOME O SECUNDÁRIO, e não o essencial: a modalidade e a
          corretora saem, o dinheiro e a idade ficam. É a diferença entre
          "cabe mais" e "não dá para trabalhar". */}
      {modalidade && !compacto && (
        <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 3 }}>{modalidade}</div>
      )}

      <div style={{
        fontSize: compacto ? 11 : 11.5, color: 'var(--soft)', marginTop: 3,
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      }}>
        <span><b style={{ color: '#1a2a3a' }}>{brlCurto(lmg)}</b> · {pct(taxa)}</span>

        {/* A ETIQUETA DE IDADE. É o "card aging" da pesquisa: três degraus, e
            não um cronômetro. A pergunta que ela responde é "está parado
            demais?", e para isso 23 ou 24 dias dá no mesmo. */}
        {idade && dias !== null && dias !== undefined && (
          <span
            title={exato
              ? `Nesta etapa há ${dias} dias (desde a última mudança de status)`
              : `Há ${dias} dias no CRM. Esta operação nunca mudou de etapa, então este é o tempo desde a entrada, e não o tempo nesta coluna.`}
            style={{
              fontSize: 10, fontWeight: 700, color: idade.cor, background: idade.fundo,
              borderRadius: 9, padding: idade.fundo === 'transparent' ? 0 : '1px 6px',
              whiteSpace: 'nowrap',
            }}
          >
            {dias}d{exato ? '' : '~'}{idade.rotulo === 'fresca' ? '' : ` · ${idade.rotulo}`}
          </span>
        )}
      </div>

      {corretora && !compacto && (
        <div style={{ fontSize: 11, color: '#8fa3b8', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {corretora}
        </div>
      )}
      {area && !compacto && (
        <div style={{
          marginTop: 6, paddingTop: 5, borderTop: '1px dotted #dbe6f2',
          fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
        }}>
          <span style={{
            background: paralisado ? '#fdf3e6' : '#e6f0fb', color: paralisado ? '#a05010' : '#1a55a0',
            borderRadius: 20, padding: '1px 8px', fontWeight: 700,
          }}>
            {paralisado ? '⏸ ' : ''}{area}
          </span>
          <span style={{ color: trava ? '#8a6410' : '#1a7a50', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {trava ?? 'nada travando'}
          </span>
        </div>
      )}
    </div>
  )
}
