'use client'

// ============================================================================
//  A MESA  ·  a esteira da análise de crédito, dentro do CRM
//
//  Porte da aba "Mesa" do cockpit do Sistema de Análise, peça por peça, na
//  ordem em que ele a vê:
//
//    1. a faixa de comando: os cinco números (Analisando agora, Esperando sua
//       ordem, Chegou de novo, No acervo, Revisadas por você);
//    2. a execução ao vivo, uma barra por análise rodando;
//    3. a barra da mesa: Kanban · Tabela · Galeria, a busca, e o Varrer de Novo
//       com a última varredura escrita ao lado;
//    4. o quadro, nos três olhares que ele pediu em 02/08/2026 com os MESMOS
//       dados: o Kanban pelas cinco fases, a Tabela para comparar linha a
//       linha, a Galeria para bater o olho.
//
//  CLICAR NUM TOMADOR ABRE O CARD DELE, em página própria (`/analises/mesa/<id>`),
//  como o cockpit faz desde 16/08/2026: "quando eu clico no Tomador, em
//  qualquer parte do sistema, abre uma nova página". Era o que faltava aqui:
//  a esteira listava, e não deixava trabalhar.
//
//  DE ONDE VEM CADA COISA (e nada vem de 127.0.0.1):
//    as fichas ............ `analise_fila`, que o agente do notebook escreve
//    os números da máquina  `analise_estado` (rodando, vagas, varredura)
//    o acervo ............. `analises` (vigentes, revisadas)
//    o Varrer de Novo ..... grava uma ordem em `analise_comandos`; o agente confere
//                           a raiz e o _concluidas do notebook, e o card cuja
//                           pasta foi recortada para a rede sai da Mesa (17/09/2026)
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { maskCNPJ } from '@/lib/utils'
import { FASES, SLA_PADRAO, faseDe, SITUACAO, ORDEM, ETAPAS, type Fase } from '@/lib/analise/esteira'
import {
  COLUNAS_MESA, nomeDaFicha, diasParado, iniciaisDe, corDoNome, desde, corta,
  agruparPorEmpresa, nomeDoGrupo, naMesa, type GrupoEmpresa,
  colunasVisiveis, colunaDoCard, type ColunaMesa,
  ordenarPor, prioridadeDoGrupo, renumerar, mover, ORDENS_COLUNA, ehOrdemColuna, type OrdemColuna,
  type FilaRica, type EstadoEsteira, type Encaminhamento,
} from '@/lib/analise/mesa'
import { nomeArea } from '@/lib/card/secoes'
import { semMarcador } from '@/lib/analise/ficha'
import EditorColuna from '@/components/analise/EditorColuna'
import NovoPedido from '@/components/comercial/NovoPedido'

type Layout = 'kanban' | 'tabela' | 'galeria'

/** Uma análise rodando agora, do jeito que o notebook a escreve em
 *  `analise_estado`. É o que o painel de missão desenha. */
type Execucao = NonNullable<EstadoEsteira['execucao']>['execucoes'][number]

const CHAVE_LAYOUT = 'fam-mesa-layout'
/** Como cada pessoa lê cada coluna (23/09/2026). Fica no navegador dela: é um
 *  jeito de olhar, e não uma decisão do quadro. */
const CHAVE_ORDENS = 'fam-mesa-ordem-colunas'

/** As fichas que "esperam a ordem dele": tudo que não está rodando nem pronto.
 *  É a conta `porColuna.fila + porColuna.voce` do cockpit. */
const esperaOrdem = (f: FilaRica) => f.situacao !== 'em_andamento' && f.situacao !== 'concluida'

export default function Mesa({ aoAbrirAcervo }: { aoAbrirAcervo?: () => void }) {
  const router = useRouter()
  /* DENTRO DA ANÁLISE, "só leitura" passou a ser "não ajuda" (23/09/2026).
     A conta é a mesma de antes para as 8 pessoas da FAM — todas ajudam —, e o
     que muda é quem foi marcado só para VER: perfil `leitura` com acesso
     enxerga a Mesa inteira e não arrasta card, que foi o pedido literal dele.
     Um `const` só, para as dezenas de usos abaixo não mudarem de forma.
     A trava de verdade é a RLS `fam_ajuda_analise()`. */
  const { ajudaAnalise } = usePermissoes()
  const somenteLeitura = !ajudaAnalise
  const [fila, setFila] = useState<FilaRica[]>([])
  const [estado, setEstado] = useState<EstadoEsteira | null>(null)
  const [estadoEm, setEstadoEm] = useState<string | null>(null)
  const [acervo, setAcervo] = useState<{ total: number; revisadas: number } | null>(null)
  const [encaminhados, setEncaminhados] = useState<Record<string, Encaminhamento>>({})
  const [comandoVivo, setComandoVivo] = useState<{ comando: string; criado_em: string; aceito_em: string | null } | null>(null)
  const [ultimoVarrer, setUltimoVarrer] = useState<{ feito_em: string; resultado: string | null } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [layout, setLayout] = useState<Layout>('kanban')
  const [varrendo, setVarrendo] = useState(false)
  // O relógio da tela: anda a cada volta da carga, e não a cada render. É o
  // que faz "parado há Xd" e "sem sinal" serem contas puras no render.
  const [agora, setAgora] = useState(() => Date.now())
  /* O SEGUNDO RELÓGIO, e ele é de UM segundo. O painel de missão mostra um
     cronômetro correndo contra a meta de 5:00, e meta sem relógio andando na
     tela não cobra ninguém (é a razão escrita no cockpit). Este tique só
     existe enquanto há análise rodando: parado, não acorda o React à toa. */
  const [tique, setTique] = useState(() => Date.now())
  const [parando, setParando] = useState<string | null>(null)
  /* AS COLUNAS DO QUADRO vêm do banco desde 17/09/2026 (`analise_colunas`):
     ele cria as dele, como "Interrompido". `null` = ainda não chegou, e aí a
     tela desenha as cinco do código para o quadro nunca abrir vazio. */
  const [colunasBanco, setColunasBanco] = useState<ColunaMesa[] | null>(null)
  const [editandoColuna, setEditandoColuna] = useState<ColunaMesa | 'nova' | null>(null)
  /* A ORDEM DA COLUNA, arrastando (23/09/2026). `arrastando` é a chave do card
     na mão; `alvo` é o card por cima de quem ele está. Os dois são só desenho:
     o que vale é a lista que a rota grava ao soltar. */
  const [arrastando, setArrastando] = useState<{ chave: string; coluna: string } | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)
  const [reordenando, setReordenando] = useState(false)
  const [novoCard, setNovoCard] = useState(false)

  useEffect(() => {
    try {
      const l = localStorage.getItem(CHAVE_LAYOUT)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (l === 'kanban' || l === 'tabela' || l === 'galeria') setLayout(l)
    } catch { /* sem armazenamento, fica o kanban */ }
  }, [])
  const trocarLayout = (l: Layout) => {
    setLayout(l)
    try { localStorage.setItem(CHAVE_LAYOUT, l) } catch { /* ignora */ }
  }

  /* ORDENAR A COLUNA (23/09/2026). `ordens` é por coluna; a ausente é a "Ordem
     da fila". `menuAberto` é a coluna cujo menu está à vista (só uma por vez). */
  const [ordens, setOrdens] = useState<Record<string, OrdemColuna>>({})
  const [menuAberto, setMenuAberto] = useState<string | null>(null)
  useEffect(() => {
    try {
      const bruto = JSON.parse(localStorage.getItem(CHAVE_ORDENS) || '{}') as Record<string, unknown>
      const ok: Record<string, OrdemColuna> = {}
      for (const [k, v] of Object.entries(bruto)) if (ehOrdemColuna(v) && v !== 'fila') ok[k] = v
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrdens(ok)
    } catch { /* sem armazenamento, ficam todas na ordem da fila */ }
  }, [])
  const ordenarColuna = (colunaId: string, modo: OrdemColuna) => {
    setOrdens(antes => {
      const novo = { ...antes }
      if (modo === 'fila') delete novo[colunaId]; else novo[colunaId] = modo
      try { localStorage.setItem(CHAVE_ORDENS, JSON.stringify(novo)) } catch { /* ignora */ }
      return novo
    })
    setMenuAberto(null)
  }
  // Esc, ou um toque fora do menu, fecha. No celular não há Esc, e sem o toque
  // fora o menu ficaria empurrando os cards até o próximo clique.
  useEffect(() => {
    if (!menuAberto) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAberto(null) }
    const fora = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('.an-col-menu, .an-col-nome, .an-col-mexer')) setMenuAberto(null)
    }
    window.addEventListener('keydown', esc)
    document.addEventListener('pointerdown', fora)
    return () => { window.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', fora) }
  }, [menuAberto])

  const carregar = useCallback(async (vivo = { atual: true }) => {
    const supabase = createClient()
    const [f, e, a, r, enc, cmd, feito, cols] = await Promise.all([
      supabase.from('analise_fila').select(COLUNAS_MESA).order('atualizado_em', { ascending: false }).limit(300),
      supabase.from('analise_estado').select('dados, atualizado_em').eq('id', 'esteira').maybeSingle(),
      supabase.from('analises').select('id', { count: 'exact', head: true }).eq('vigente', true),
      supabase.from('analises').select('id', { count: 'exact', head: true }).eq('vigente', true).eq('revisada', true),
      supabase.from('analise_encaminhamentos').select('*').eq('estado', 'aberto').order('criado_em', { ascending: false }).limit(200),
      supabase.from('analise_comandos').select('comando, criado_em, aceito_em').eq('comando', 'varrer').is('feito_em', null).order('criado_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('analise_comandos').select('feito_em, resultado').eq('comando', 'varrer').not('feito_em', 'is', null).order('feito_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('analise_colunas').select('id, titulo, fase, dica, cor, ordem, arquivada').order('ordem'),
    ])
    if (!vivo.atual) return
    if (f.error) setErro(f.error.message)
    // A pasta que foi para a rede sai do quadro: a regra é `naMesa`, a mesma da barra.
    setFila(((f.data ?? []) as unknown as FilaRica[]).filter(naMesa))
    setEstado((e.data?.dados as EstadoEsteira | undefined) ?? null)
    setEstadoEm(e.data?.atualizado_em ?? null)
    setAcervo({ total: a.count ?? 0, revisadas: r.count ?? 0 })
    const porFila: Record<string, Encaminhamento> = {}
    for (const x of (enc.data ?? []) as Encaminhamento[]) {
      const k = x.fila_id ?? x.chave ?? ''
      if (k && !porFila[k]) porFila[k] = x
    }
    setEncaminhados(porFila)
    setComandoVivo(cmd.data ?? null)
    setUltimoVarrer(feito.data ?? null)
    // Sem a tabela (migration atrasada) a Mesa segue com as cinco do código.
    if (!cols.error) setColunasBanco((cols.data ?? []) as ColunaMesa[])
    setAgora(Date.now())
    setCarregando(false)
  }, [])

  useEffect(() => {
    const vivo = { atual: true }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar(vivo)
    const supabase = createClient()
    /* A MESA SE ATUALIZA SOZINHA. O agente escreve a cada 90 s e a cada ordem
       aceita; o Realtime traz a mudança na hora, e o relógio de 20 s cobre o
       que o canal perder. */
    const canal = supabase.channel('mesa-analise')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analise_fila' }, () => carregar(vivo))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analise_estado' }, () => carregar(vivo))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analise_comandos' }, () => carregar(vivo))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analise_colunas' }, () => carregar(vivo))
      .subscribe()
    const t = setInterval(() => carregar(vivo), 20000)
    return () => { vivo.atual = false; clearInterval(t); supabase.removeChannel(canal) }
  }, [carregar])

  /* O TIQUE DE UM SEGUNDO do painel de missão. Só existe quando há execução na
     tela: sem análise rodando ele não é montado, e a Mesa volta a acordar de
     20 em 20 segundos como sempre foi. */
  const temExecucao = (estado?.execucao?.execucoes?.length ?? 0) > 0 || fila.some(f => f.situacao === 'em_andamento')
  useEffect(() => {
    if (!temExecucao) return
    const t = setInterval(() => setTique(Date.now()), 1000)
    return () => clearInterval(t)
  }, [temExecucao])

  const rodando = useMemo(() => fila.filter(f => f.situacao === 'em_andamento'), [fila])
  const execucoes = estado?.execucao?.execucoes ?? []
  const analisando = Math.max(execucoes.length, rodando.length)
  const max = estado?.execucao?.max ?? 3
  const vagas = Math.max(0, max - analisando)
  const novidades = estado?.varredura?.novidades ?? 0
  const semSinal = !estadoEm || agora - new Date(estadoEm).getTime() > 5 * 60 * 1000
  const revPct = acervo?.total ? Math.round((acervo.revisadas / acervo.total) * 100) : 0

  const fichas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const lista = q
      ? fila.filter(f => [nomeDaFicha(f), f.cnpj, f.corretora, f.produto, f.pasta].filter(Boolean).join(' ').toLowerCase().includes(q))
      : fila
    // A ordem é a de quem olha: o mais parado primeiro. Compara a data do
    // último evento (texto ISO), sem relógio: a conta de dias fica para o cartão.
    const ref = (x: FilaRica) => String(x.parado_desde || x.atualizado_em || x.criado_em || '')
    return [...lista].sort((a, b) => ref(a).localeCompare(ref(b)))
  }, [fila, busca])

  const faseDa = (f: FilaRica): Fase => (f.fase as Fase) || faseDe(f.situacao, f.cadastro?.status)

  const colunas = useMemo(() => colunasVisiveis(colunasBanco), [colunasBanco])
  /** A coluna onde o card mora: a escolhida por alguém, senão a da fase. */
  const colunaDa = (f: FilaRica) => colunaDoCard(f, faseDa(f), colunas)
  /** O prazo só vale em coluna do sistema. Numa coluna dele, como
   *  "Interrompido", o card está parado DE PROPÓSITO, e acender o vermelho
   *  seria cobrar o que ele mesmo mandou esperar. */
  const prazoDa = (f: FilaRica) => {
    const c = colunaDa(f)
    return c.fase ? SLA_PADRAO[c.fase] || 0 : 0
  }

  /* UMA EMPRESA, UM CARD (09/09/2026). A ficha da Mesa é uma PASTA, e a análise
     renomeia a pasta enquanto trabalha: a Renova aparecia três vezes no quadro
     ("Renova", "Renova Energia S a", "Renova Energia"), como se fossem três
     negócios. Agora as pastas da mesma empresa vêm juntas, e o card fica na
     coluna da MAIS ADIANTADA: "a Renova já fez a análise" tem que se ler no
     quadro sem abrir nada.

     A regra mora em lib/analise/mesa.ts, e não aqui, porque o Acervo e a
     Gestão vão precisar da mesma conta. */
  const grupos = useMemo(() => agruparPorEmpresa(fichas, faseDa), [fichas])

  /* A FAIXA CONTA O QUE O QUADRO DESENHA (09/09/2026).
     Ele abriu a Mesa com "Esperando sua ordem: 6" em cima de um quadro com
     QUATRO cartões, e disse a frase certa: "você precisa buscar do mesmo
     lugar". A faixa contava PASTAS e o quadro desenha EMPRESAS — a Renova tem
     três pastas e a Rialma tem três, porque a análise renomeia a pasta
     enquanto trabalha. Dois números verdadeiros medindo coisas diferentes, um
     do lado do outro, é a tela discordando dela mesma.

     Agora sai tudo de `grupos`, que é exatamente a lista que vira cartão, e o
     rodapé do cartão mostra a soma por coluna: qualquer número da faixa se
     confere olhando o quadro logo abaixo. */
  const porColuna = useMemo(() => {
    const c: Record<string, number> = { entrada: 0, conferencia: 0, liberado: 0, analisando: 0, pronta: 0 }
    for (const g of grupos) c[faseDa(g.principal)] = (c[faseDa(g.principal)] ?? 0) + 1
    return c
  }, [grupos])
  // "Esperando sua ordem": as empresas que não estão rodando nem entregues.
  const esperando = grupos.filter(g => esperaOrdem(g.principal)).length
  const esperandoOnde = FASES
    .filter(f => f.id !== 'analisando' && f.id !== 'pronta' && porColuna[f.id])
    .map(f => `${f.titulo} ${porColuna[f.id]}`).join(' · ')

  const abrir = (f: FilaRica) => router.push(`/analises/mesa/${f.id}`)

  const varrer = async () => {
    if (somenteLeitura || varrendo) return
    setVarrendo(true); setErro('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    let nome: string | null = null
    if (user) {
      const { data } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
      nome = (data as { nome: string | null } | null)?.nome ?? null
    }
    const { error } = await supabase.from('analise_comandos').insert({ comando: 'varrer', por: nome })
    if (error) setErro(error.message)
    setVarrendo(false)
    carregar()
  }

  /* PARAR ESTA ANÁLISE. O botão é do cartão da própria análise, e não de uma
     barra geral, pelo motivo escrito no cockpit: são até três rodando ao mesmo
     tempo, e parar "a análise" sem dizer qual seria uma roleta.

     A execução ao vivo conhece a PASTA; a ordem se dá pelo id da ficha. Quando
     a pasta não casa com nenhuma ficha da esteira (a análise renomeia a pasta
     enquanto trabalha), o botão não aparece — é melhor não ter botão do que ter
     um que manda parar a análise errada. */
  const fichaDaPasta = (pasta: string) => fila.find(f => f.pasta === pasta) ?? null

  const parar = async (pasta: string, nome: string) => {
    const alvo = fichaDaPasta(pasta)
    if (!alvo || somenteLeitura || parando) return
    if (!window.confirm(`Interromper a análise de ${nome} agora?

Nada do que já foi salvo se perde.`)) return
    setParando(pasta); setErro('')
    try {
      const r = await fetch('/api/esteira/ordem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alvo.id, ordem: 'parar', dados: {} }),
      })
      const j = await r.json()
      if (!r.ok) setErro(j.erro ?? 'Não consegui parar.')
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setParando(null)
    carregar()
  }

  /* ══ A ORDEM DA COLUNA ════════════════════════════════════════════════
     23/09/2026: "o Ivan subiu um e-mail depois do Abenaias, mas ele quer
     urgência no caso: ele arrasta o card, igual o Trello".

     A TELA MANDA A COLUNA INTEIRA, já renumerada. Não é "sobe um": com quatro
     pessoas mexendo no mesmo quadro, "sobe um" aplicado sobre uma lista que
     mudou embaixo produz uma ordem que ninguém pediu.

     O número muda na tela ANTES da resposta do banco (`setFila` aqui embaixo).
     Arrastar um card e vê-lo voltar para o lugar por meio segundo é a coisa
     que mais faz alguém achar que não funcionou — e aí arrasta de novo. */
  const reordenar = async (nova: GrupoEmpresa[]) => {
    if (somenteLeitura || reordenando) return
    const ordem = renumerar(nova)
    const porId = new Map<string, number>()
    for (const p of ordem) for (const id of p.ids) porId.set(id, p.prioridade)
    setFila(antes => antes.map(f => (porId.has(f.id) ? { ...f, prioridade: porId.get(f.id)! } : f)))
    setReordenando(true); setErro('')
    try {
      const r = await fetch('/api/esteira/prioridade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordem }),
      })
      const j = await r.json()
      if (!r.ok) setErro(j.erro ?? 'Não consegui gravar a ordem da coluna.')
    } catch {
      setErro('A conexão caiu: a ordem não foi gravada.')
    }
    setReordenando(false)
    carregar()
  }

  /* DEVOLVER A COLUNA AO AUTOMÁTICO. O mesmo princípio do "Deixar o sistema
     decidir" das colunas: quem priorizou à mão precisa poder desfazer, senão a
     fila fica congelada numa decisão de três semanas atrás. */
  const limparOrdem = async (das: GrupoEmpresa[]) => {
    if (somenteLeitura || reordenando) return
    const ids = das.flatMap(g => g.fichas.map(f => f.id))
    if (!ids.length) return
    setReordenando(true); setErro('')
    try {
      const r = await fetch('/api/esteira/prioridade', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids.slice(0, 20) }),
      })
      /* A rota apaga até 20 pastas por chamada; uma coluna pode ter mais.
         Manda em lotes, e o primeiro erro para tudo: melhor metade desfeita
         com aviso do que um "pronto" que não é verdade. */
      let j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui limpar a ordem.'); setReordenando(false); carregar(); return }
      for (let i = 20; i < ids.length; i += 20) {
        const r2 = await fetch('/api/esteira/prioridade', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ids.slice(i, i + 20) }),
        })
        j = await r2.json()
        if (!r2.ok) { setErro(j.erro ?? 'Não consegui limpar a ordem inteira.'); break }
      }
    } catch {
      setErro('A conexão caiu: a ordem não foi limpa.')
    }
    setReordenando(false)
    carregar()
  }

  // ── as peças do cartão ──────────────────────────────────────────────────
  // Funções de desenho, e não componentes: fecham sobre o estado da Mesa e o
  // React não precisa reconciliá-las como tipos novos a cada render.
  const selo = (f: FilaRica, grande?: boolean) => {
    const nome = nomeDaFicha(f)
    return <span className={`an-selo${grande ? ' gr' : ''}`} style={{ ['--cor' as string]: corDoNome(nome) }}>{iniciaisDe(nome)}</span>
  }

  const chips = (f: FilaRica) => {
    const chips: React.ReactNode[] = []
    const novo = agora - new Date(f.criado_em).getTime() < 24 * 3600 * 1000 && f.situacao === 'pendente' && !f.cadastro
    if (novo) chips.push(<span key="n" className="an-chip varr">chegou de novo</span>)
    if (f.situacao === 'erro') chips.push(<span key="e" className="an-chip erro">Erro na análise</span>)
    else if (f.situacao === 'pausada') chips.push(<span key="p" className="an-chip erro">Pausada por você</span>)
    else if (f.situacao === 'aguardando_resposta') chips.push(<span key="q" className="an-chip duvida">Precisa de você</span>)
    const falta = f.docs?.falta ?? f.documentos_faltando ?? []
    const pronta = faseDa(f) === 'pronta'
    if (!pronta && falta.length) {
      falta.slice(0, 3).forEach((d, i) => chips.push(<span key={`f${i}`} className="an-chip falta">{d}</span>))
      if (falta.length > 3) chips.push(<span key="mais" className="an-chip">+{falta.length - 3}</span>)
    } else if (!chips.length) {
      chips.push(<span key="ok" className="an-chip ok">{pronta ? 'Análise entregue' : 'Documentação completa'}</span>)
    }
    return <div className="an-chips">{chips}</div>
  }

  const medidor = (f: FilaRica) => {
    const feitos = f.docs?.feitos ?? (f.documentos ? 1 : 0)
    const total = f.docs?.total ?? 1
    const pct = total ? Math.round((feitos / total) * 100) : 0
    const cheia = feitos === total
    const trava = f.cadastro?.status === 'bloqueado' && f.situacao !== 'concluida'
    return (
      <div className="an-med">
        <div className="an-med-barra"><span className={cheia ? 'cheia' : trava ? 'trava' : ''} style={{ width: `${pct}%` }} /></div>
        <span className={`an-med-txt${cheia ? ' ok' : ''}`}>{f.docs ? `${feitos} de ${total} documentos` : `${f.documentos} documento${f.documentos === 1 ? '' : 's'} na pasta`}</span>
      </div>
    )
  }

  const pe = (f: FilaRica) => {
    const dias = diasParado(f, agora)
    const limite = prazoDa(f)
    const estourou = dias !== null && limite > 0 && dias > limite
    const enc = encaminhados[f.id] ?? (f.chave ? encaminhados[f.chave] : undefined)
    return (
      <div className="an-fi-pe">
        {dias !== null && (
          <span className={`idade${estourou ? ' estourou' : ''}`}
            title={limite ? `O prazo desta fase é de ${limite} dia(s)` : 'Sem prazo definido para esta fase'}>
            {dias === 0 ? 'hoje' : `${dias}d parado`}
          </span>
        )}
        {f.ordem && <span className="ordem" title={`Pedido por ${f.ordem_por ?? 'alguém'}, esperando o notebook`}>⏳ {ORDEM[f.ordem]?.rotulo ?? f.ordem}</span>}
        {f.substatus && <span className="an-chip" style={{ background: '#fdf6e3', color: '#8a6410' }}>{corta(f.substatus, 28)}</span>}
        {enc && (
          <span className="enc" title={`Esperando ${enc.para_nome || nomeArea(enc.para_area)}: ${enc.pedido}`}>
            <span className="an-av" style={{ ['--cor' as string]: corDoNome(enc.para_nome || enc.para_area || '') }}>
              {iniciaisDe(enc.para_nome || nomeArea(enc.para_area))}
            </span>
            {corta(enc.para_nome || nomeArea(enc.para_area), 16)}
          </span>
        )}
      </div>
    )
  }

  const ficha = (g: GrupoEmpresa) => {
    const f = g.principal
    const coluna = colunaDa(f)
    const ultimo = f.linha?.[0] ?? null
    const s = SITUACAO[f.situacao]
    const nome = nomeDoGrupo(g)
    /* O CNPJ pode estar em QUALQUER pasta do grupo. A pasta mais adiantada
       muitas vezes é a que a análise renomeou e a que veio pelo e-mail é a que
       tem o CNPJ: mostrar só o da principal escondia o número que existe. */
    const comCnpj = g.fichas.find(x => x.cnpj)
    const outras = g.fichas.slice(1)
    return (
      <button key={g.chave} type="button" className="an-ficha" style={{ ['--cor' as string]: coluna.cor }}
        onClick={() => abrir(f)}
        title={outras.length
          ? `${nome} · ${s?.rotulo ?? f.situacao}\n\n${g.fichas.length} pastas desta empresa:\n${g.fichas.map(x => '· ' + x.pasta).join('\n')}`
          : `${nome} · ${s?.rotulo ?? f.situacao}`}>
        <div className="an-fi-cab">
          {selo(f)}
          <div className="an-fi-nome">
            <b>{nome}</b>
            <small>{comCnpj?.cnpj && (comCnpj.cnpj_confiavel || comCnpj.analise_id || comCnpj.tomador_id) ? maskCNPJ(comCnpj.cnpj) : 'CNPJ a confirmar'}</small>
          </div>
        </div>

        {/* AS OUTRAS PASTAS DA MESMA EMPRESA. Ficam à vista de propósito: unir
            calado seria esconder trabalho que existe no disco. */}
        {outras.length > 0 && (
          <div className="an-fi-pastas">
            <span className="an-chip" style={{ background: '#eef3f9', color: '#26374a' }}>
              {g.fichas.length} pastas
            </span>
            <span className="an-fi-pastas-txt">{corta(outras.map(x => nomeDaFicha(x)).join(' · '), 52)}</span>
            {g.palpite && (
              <span className="an-fi-palpite" title="Juntei pelo nome parecido, e não pelo CNPJ. Se não for a mesma empresa, me diga.">
                unidas pelo nome
              </span>
            )}
          </div>
        )}
        {medidor(f)}
        {f.situacao === 'em_andamento' && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11.5, color: '#1e4080', fontWeight: 700 }}>{f.etapa_texto || 'Trabalhando…'}</div>
            <div className="an-barra"><i style={{ width: `${Math.round(((ETAPAS.findIndex(([id]) => id === f.etapa) + 1) / ETAPAS.length) * 100)}%` }} /></div>
          </div>
        )}
        {chips(f)}
        {ultimo?.txt && <div className="an-fi-ult" title={ultimo.txt}>{corta(ultimo.txt, 46)}</div>}
        {pe(f)}
      </button>
    )
  }

  // ── os três olhares ─────────────────────────────────────────────────────
  const kanban = () => {
    return (
      <div className="an-kb">
        {colunas.map(col => {
          // A coluna conta EMPRESAS, e não pastas: é o número que ele lê para
          // saber quanto trabalho tem, e três pastas da Renova são um trabalho.
          /* A ORDEM DA COLUNA: primeiro quem foi arrastado, pelo número; depois
             o resto, na ordem automática (o mais parado primeiro). A regra
             mora em lib/analise/mesa.ts, junto com a que a rota usa para
             renumerar: a tela e o banco não podem discordar sobre quem é o 1. */
          const modo: OrdemColuna = ordens[col.id] ?? 'fila'
          const naFila = modo === 'fila'
          const das = ordenarPor(grupos.filter(g => colunaDa(g.principal).id === col.id), modo)
          const temMao = das.some(g => prioridadeDoGrupo(g) !== null)
          /* ARRASTAR E AS SETAS SÓ VALEM NA "ORDEM DA FILA": numa coluna
             ordenada por data, a posição que se vê não é a que se grava. */
          const podeArrastar = !somenteLeitura && das.length > 1 && naFila
          const menu = menuAberto === col.id
          return (
            <section key={col.id} className="an-col" aria-label={col.titulo}>
              <div className="an-col-cab" title={col.dica ?? 'Coluna sua: o card entra pelo botão "Mudar o substatus" do card'}>
                <span className="pt" style={{ background: col.cor }} />
                {/* O NOME ABRE O MESMO MENU DO ⋯ (ordem dele: "clicando no nome
                    'Pronta' eu consigo ordenar"). Fica com cara de título. */}
                <button type="button" className="an-col-nome" onClick={() => setMenuAberto(menu ? null : col.id)}
                  aria-expanded={menu} aria-label={`Ordenar a coluna ${col.titulo}`}>{col.titulo}</button>
                <i>{das.length}</i>
                {!naFila && (
                  <span className="an-col-ord" title={`Ordenada por: ${ORDENS_COLUNA.find(o => o.id === modo)?.rotulo}`}>
                    {ORDENS_COLUNA.find(o => o.id === modo)?.curto}
                  </span>
                )}
                {temMao && !somenteLeitura && naFila && (
                  <button type="button" className="an-col-mexer" onClick={() => limparOrdem(das)} disabled={reordenando}
                    title="Devolver esta coluna à ordem automática (o mais parado primeiro)"
                    aria-label={`Devolver a coluna ${col.titulo} à ordem automática`}>↺</button>
                )}
                <button type="button" className="an-col-mexer" onClick={() => setMenuAberto(menu ? null : col.id)}
                  aria-expanded={menu}
                  title={somenteLeitura ? 'Ordenar esta coluna' : 'Ordenar, renomear, mudar a cor, mudar de lugar ou arquivar'}
                  aria-label={`Opções da coluna ${col.titulo}`}>⋯</button>
              </div>
              {menu && (
                <div className="an-col-menu" role="menu" aria-label={`Ordenar ${col.titulo}`}>
                  <div className="an-col-menu-tit">Ordenar por</div>
                  {ORDENS_COLUNA.map(o => (
                    <button key={o.id} type="button" role="menuitemradio" aria-checked={modo === o.id}
                      className={modo === o.id ? 'on' : ''} title={o.dica} onClick={() => ordenarColuna(col.id, o.id)}>
                      <span>{modo === o.id ? '✓' : ''}</span>{o.rotulo}
                    </button>
                  ))}
                  {!somenteLeitura && (
                    <button type="button" role="menuitem" className="fim" onClick={() => { setMenuAberto(null); setEditandoColuna(col) }}>
                      <span />Arrumar a coluna…
                    </button>
                  )}
                </div>
              )}
              {das.length ? das.map((g, i) => {
                const naMao = arrastando?.chave === g.chave
                const souAlvo = !!arrastando && arrastando.coluna === col.id && alvo === g.chave && !naMao
                const mexer = (de: number, para: number) => reordenar(mover(das, de, para))
                return (
                  <div
                    key={g.chave}
                    className={`an-fi-box${naMao ? ' arrastando' : ''}${souAlvo ? ' alvo' : ''}`}
                    draggable={podeArrastar}
                    onDragStart={e => {
                      if (!podeArrastar) return
                      setArrastando({ chave: g.chave, coluna: col.id })
                      e.dataTransfer.effectAllowed = 'move'
                      // Firefox só começa o arrasto se houver dado no pacote.
                      try { e.dataTransfer.setData('text/plain', g.chave) } catch { /* ignora */ }
                    }}
                    onDragEnd={() => { setArrastando(null); setAlvo(null) }}
                    onDragOver={e => {
                      /* SÓ DENTRO DA MESMA COLUNA. Mudar de coluna continua
                         sendo o botão "Mudar o substatus" do card: lá a
                         escolha fica gravada com quem fez e quando, e a régua
                         do motor para de mandar naquele card. Arrastar de
                         lado, sem querer, não pode ter esse efeito. */
                      if (!arrastando || arrastando.coluna !== col.id) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (alvo !== g.chave) setAlvo(g.chave)
                    }}
                    onDrop={e => {
                      if (!arrastando || arrastando.coluna !== col.id) return
                      e.preventDefault()
                      const de = das.findIndex(x => x.chave === arrastando.chave)
                      const para = das.findIndex(x => x.chave === g.chave)
                      setArrastando(null); setAlvo(null)
                      if (de < 0 || para < 0 || de === para) return
                      reordenar(mover(das, de, para))
                    }}
                  >
                    {/* O NÚMERO É A POSIÇÃO NA COLUNA. Dourado quando alguém
                        escolheu; cinza quando é a ordem automática. */}
                    {naFila && (
                      <span
                        className={`an-fi-num${prioridadeDoGrupo(g) !== null ? ' mao' : ''}`}
                        title={prioridadeDoGrupo(g) !== null
                          ? `${i + 1}º da coluna, por escolha de ${g.principal.prioridade_por ?? 'alguém'}`
                          : `${i + 1}º da coluna, pela ordem automática (o mais parado primeiro)`}
                      >{i + 1}</span>
                    )}
                    {ficha(g)}
                    {podeArrastar && (
                      <div className="an-fi-setas">
                        <button type="button" className="an-fi-seta" disabled={i === 0 || reordenando}
                          onClick={() => mexer(i, i - 1)}
                          title="Subir na fila" aria-label={`Subir ${nomeDoGrupo(g)} na fila`}>▲</button>
                        <button type="button" className="an-fi-seta" disabled={i === das.length - 1 || reordenando}
                          onClick={() => mexer(i, i + 1)}
                          title="Descer na fila" aria-label={`Descer ${nomeDoGrupo(g)} na fila`}>▼</button>
                      </div>
                    )}
                  </div>
                )
              }) : (
                <div className="an-col-vazia">
                  {col.dica ?? 'Vazia. Escolha esta coluna no botão "Mudar o substatus", dentro do card.'}
                </div>
              )}
            </section>
          )
        })}
        {/* A COLUNA NOVA, no fim do quadro, como no Trello. */}
        {!somenteLeitura && (
          <button type="button" className="an-col an-col-nova" onClick={() => setEditandoColuna('nova')}>
            + Nova coluna
          </button>
        )}
      </div>
    )
  }

  const galeria = () => {
    if (!fichas.length) return <div className="card-panel"><p className="an-vazio">Nada bate com este recorte.</p></div>
    return (
      <>
        <div className="an-gl">
          {/* A galeria segue a mesma regra do quadro: uma empresa, um card. */}
          {grupos.map(g => {
            const f = g.principal
            const coluna = colunaDa(f)
            const dias = diasParado(f, agora)
            const limite = prazoDa(f)
            const estourou = dias !== null && limite > 0 && dias > limite
            const feitos = f.docs?.feitos ?? 0, total = f.docs?.total ?? 0
            const pct = total ? Math.round((feitos / total) * 100) : 0
            return (
              <button key={g.chave} type="button" className="an-gl-card" onClick={() => abrir(f)}>
                <div className="an-gl-cab">
                  {selo(f, true)}
                  <div style={{ minWidth: 0 }}>
                    <b>{nomeDoGrupo(g)}</b>
                    <small>
                      {g.fichas.length > 1
                        ? `${g.fichas.length} pastas · ${corta(semMarcador(f.corretora) || 'sem corretora', 18)}`
                        : corta(semMarcador(f.corretora) || 'sem corretora', 30)}
                    </small>
                  </div>
                </div>
                <div className="an-gl-fase">
                  <span className="an-chip fase" style={{ ['--cor' as string]: coluna.cor }}>{coluna.titulo}</span>
                  {f.situacao === 'em_andamento' && <span className="an-chip" style={{ background: '#fdf6e3', color: '#8a6410' }}>{f.etapa_texto || 'rodando'}</span>}
                </div>
                <div className="an-med">
                  <span className={`an-med-txt${feitos === total && total ? ' ok' : ''}`} style={{ marginTop: 0, marginBottom: 4, fontSize: 12.5 }}>
                    {total ? `${feitos}/${total} documentos` : `${f.documentos} documento${f.documentos === 1 ? '' : 's'}`}
                  </span>
                  <div className="an-med-barra"><span className={feitos === total && total ? 'cheia' : ''} style={{ width: `${total ? pct : (f.documentos ? 100 : 0)}%` }} /></div>
                </div>
                <div className="an-gl-pe">
                  <span className={estourou ? 'atraso' : ''}>{dias === null ? 'sem medição' : `parado há ${dias}d`}</span>
                  {f.ordem && <span style={{ color: '#8a6410', fontWeight: 700 }}>⏳ {ORDEM[f.ordem]?.rotulo}</span>}
                </div>
              </button>
            )
          })}
        </div>
        {/* O numero conta EMPRESAS e diz quantas pastas sao, porque os dois
            numeros diferem desde que o card passou a agrupar. */}
        <div className="an-pe">
          {grupos.length} empresa{grupos.length === 1 ? '' : 's'}
          {fichas.length !== grupos.length ? ` em ${fichas.length} pastas` : ''}
          {fichas.length !== fila.length ? ` (de ${fila.length} na esteira)` : ''}
        </div>
      </>
    )
  }

  const tabela = () => {
    return (
      <>
        <div className="an-tab-wrap">
          <table className="an-tab">
            <thead><tr>
              <th>Tomador</th><th>CNPJ</th><th>Fase</th><th>Corretora</th>
              <th style={{ textAlign: 'right' }}>Documentos</th><th style={{ textAlign: 'right' }}>Parado há</th><th>Situação</th><th>Com quem</th>
            </tr></thead>
            <tbody>
              {fichas.length === 0 && <tr><td colSpan={8} className="an-vazio" style={{ textAlign: 'center' }}>Nada bate com este recorte.</td></tr>}
              {fichas.map(f => {
                const coluna = colunaDa(f)
                const dias = diasParado(f, agora)
                const estourou = dias !== null && prazoDa(f) > 0 && dias > prazoDa(f)
                const s = SITUACAO[f.situacao]
                const enc = encaminhados[f.id] ?? (f.chave ? encaminhados[f.chave] : undefined)
                return (
                  <tr key={f.id} onClick={() => abrir(f)}>
                    <td><div className="nome">{selo(f)}<b>{nomeDaFicha(f)}</b></div></td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{f.cnpj && (f.cnpj_confiavel || f.analise_id) ? maskCNPJ(f.cnpj) : '—'}</td>
                    <td><span className="an-chip fase" style={{ ['--cor' as string]: coluna.cor }}>{coluna.titulo}</span></td>
                    <td>{corta(f.corretora || '—', 24)}</td>
                    <td className="num">{f.docs ? `${f.docs.feitos}/${f.docs.total}` : f.documentos}</td>
                    <td className={`num${estourou ? ' atrasado' : ''}`}>{dias === null ? '—' : `${dias}d`}</td>
                    <td><span className={`badge ${s?.badge ?? 'badge-gray'}`}>{s?.rotulo ?? f.situacao}</span>{f.ordem ? <span style={{ marginLeft: 6, color: '#8a6410', fontSize: 11.5 }}>⏳</span> : null}</td>
                    <td>{enc ? (enc.para_nome || nomeArea(enc.para_area)) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="an-pe">{fichas.length} de {fila.length} na esteira</div>
      </>
    )
  }

  // ── a tela ──────────────────────────────────────────────────────────────
  /* O Varrer de Novo confere o que saiu do notebook (ver o cabeçalho). Ao lado
     do botão fica o que a última conferência respondeu, e quando. */
  const textoVarr = comandoVivo
    ? (comandoVivo.aceito_em ? 'Conferindo as pastas do notebook…' : 'Conferência pedida, esperando o notebook…')
    : ultimoVarrer
      ? `${ultimoVarrer.resultado || 'Conferido.'} · ${desde(ultimoVarrer.feito_em)}`
      : 'Recortou pasta para a rede? Clique para tirar o card da Mesa'

  /* O RELÓGIO E O ARCO. `segundosDesde` é o instante em que o banco foi
     escrito; o tique de um segundo soma o que passou desde então, para o
     número andar sem depender de o notebook reescrever a linha. */
  const META_SEG = 300
  const fmtSeg = (t: number) => {
    const n = Math.max(0, Math.floor(t))
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
  }
  const custoDe = (etapas: { etapa: string; segundos: number }[] | undefined) =>
    (etapas ?? []).map(t => {
      const mm = Math.floor(t.segundos / 60), ss = t.segundos % 60
      return `${t.etapa} ${mm ? `${mm}m` : ''}${mm && ss < 10 ? '0' : ''}${ss}s`
    }).join(' · ')

  return (
    <div>
      {/* ── 1. a faixa de comando ── */}
      <div className="an-faixa">
        <div className="an-kpi">
          <div className="r">Analisando agora</div>
          <div className={`v${analisando ? ' atencao' : ''}`}>{analisando}</div>
          <div className="n">{semSinal ? 'sem sinal do notebook' : analisando ? `${vagas} vaga${vagas === 1 ? '' : 's'} livre${vagas === 1 ? '' : 's'}` : `esteira parada, ${vagas} vagas livres`}</div>
        </div>
        <div className="an-kpi">
          <div className="r">Esperando sua ordem</div>
          <div className={`v ${esperando ? 'atencao' : 'bom'}`}>{esperando}</div>
          <div className="n" title="A mesma conta do quadro abaixo: uma empresa, um cartão">
            {esperando ? (esperandoOnde || 'empresas na sua mesa') : 'nada parado na sua mesa'}
          </div>
        </div>
        <div className="an-kpi">
          <div className="r">Chegou de novo</div>
          <div className="v">{novidades}</div>
          <div className="n">{novidades ? 'e-mail ou pasta que eu ainda não conhecia' : 'nada novo desde a última varredura'}</div>
        </div>
        <button type="button" className="an-kpi vai" onClick={aoAbrirAcervo} title="Abrir o acervo">
          <div className="r">No acervo</div>
          <div className="v">{acervo?.total ?? '…'}</div>
          <div className="n">clique para abrir o acervo</div>
        </button>
        <div className="an-kpi">
          <div className="r">Revisadas por você</div>
          <div className="v bom">{acervo?.revisadas ?? '…'}</div>
          <div className="n">{revPct}% do acervo passou pela sua mão</div>
        </div>
      </div>

      {/* ── 2. A EXECUÇÃO AO VIVO, no painel de missão ──────────────────────
          Porte do `blocoExecucao()` do cockpit, na ordem em que ele o vê:
          título com a contagem e as vagas, o anel contra a meta de 5:00, o
          marco da etapa, o nome, a última notícia, os três quadrinhos, o
          trilho, o custo por etapa, os recados de retomada e de travamento, e
          o botão de parar com a frase que o acompanha. Nada foi tirado; o que
          mudou foi só a pele, que agora é a de papel do CRM.

          Enquanto o notebook não subir os campos novos (`paradoHa`,
          `etapas_seg`), o painel desenha sem eles em vez de sumir: a peça mais
          importante da tela não pode depender de uma sincronização a mais. */}
      {(execucoes.length > 0 || rodando.length > 0) && (() => {
        const lista: Execucao[] =
          execucoes.length ? execucoes : rodando.map(f => ({
            pasta: f.pasta, razao: nomeDaFicha(f), etapa: f.etapa ?? 'fila', etapaTxt: f.etapa_texto ?? '',
            idxAtual: Math.max(0, ETAPAS.findIndex(([id]) => id === f.etapa)), mensagem: '', segundosDesde: 0, travado: false,
          }))
        const passos = Math.max(1, ETAPAS.length - 1)
        return (
          <>
            <h2 className="an-tit">
              Analisando agora <span className="q">{lista.length}</span>
              {vagas ? <span className="dica">{vagas} vaga{vagas === 1 ? '' : 's'} livre{vagas === 1 ? '' : 's'}</span> : null}
            </h2>
            <div className="an-rodando">
              {lista.map(x => {
                // O relógio anda aqui, e não no banco: `segundosDesde` é o que
                // o notebook contou na última escrita, e o tique soma o resto.
                const base = x.segundosDesde ?? 0
                const seg = base > 0 ? base + Math.max(0, Math.floor((tique - agora) / 1000)) : 0
                const arco = Math.min(360, Math.round((seg / META_SEG) * 360))
                const custo = custoDe(x.etapas_seg)
                const alvo = fichaDaPasta(x.pasta)
                return (
                  <div key={x.pasta} className={`an-missao${x.travado ? ' travado' : ''}`}>
                    <div className="m2">
                      <div className="anel" style={{ ['--arco' as string]: `${arco}deg` }} role="img"
                        aria-label={`relógio da análise: ${fmtSeg(seg)} de uma meta de 5:00`}>
                        <div className="miolo">
                          <div className="tmais">T+<span>{fmtSeg(seg)}</span></div>
                          <div className="de">meta 5:00</div>
                        </div>
                      </div>
                      <div className="m2-tx">
                        <span className="marco">{String(x.etapaTxt || x.etapa || '').toUpperCase()}</span>
                        <h3>{x.razao}</h3>
                        <div className="msg">{x.mensagem}</div>

                        <div className="telemetria">
                          <div className="tele">
                            <span className="r">Etapa</span>
                            <b>{(x.idxAtual || 0) + 1}<span className="u">/{passos}</span></b>
                            <div className="u">{x.etapaTxt || ''}</div>
                          </div>
                          <div className="tele">
                            <span className="r">Última notícia</span>
                            <b>{x.paradoHa && x.paradoHa > 0 ? <>há {x.paradoHa}<span className="u"> min</span></> : 'agora'}</b>
                            <div className="u">{corta(x.mensagem || '', 42)}</div>
                          </div>
                          <div className="tele">
                            <span className="r">Vagas</span>
                            <b>{vagas}</b>
                            <div className="u">livres na esteira</div>
                          </div>
                        </div>

                        <div className="trilho">
                          {Array.from({ length: passos }, (_, i) => (
                            <i key={i} className={i < (x.idxAtual || 0) ? 'feito' : i === (x.idxAtual || 0) ? 'agora' : ''} />
                          ))}
                        </div>
                        {custo && <div className="custo">{custo}</div>}
                      </div>
                    </div>

                    {!!x.retomadas && (
                      <div className="recado">A execução caiu no meio e o vigia do servidor retomou sozinho, de onde parou.</div>
                    )}
                    {x.travado && (
                      <div className="recado para">
                        <b>Parada há {x.paradoHa ?? 0} minutos na mesma etapa.</b> Cada etapa costuma mudar de nome em
                        poucos minutos. Se este número continuar subindo, a execução travou.
                      </div>
                    )}

                    {!somenteLeitura && alvo && (
                      <div className="pe">
                        <button type="button" className="an-bt forcar" disabled={parando === x.pasta}
                          onClick={() => parar(x.pasta, x.razao)}>
                          {parando === x.pasta ? 'Parando…' : 'Parar esta análise'}
                        </button>
                        <span className="obs">Interrompe agora. Nada do que já foi salvo se perde.</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="an-obs-rodando">
              Enquanto roda: deixe o notebook ligado, com internet e com a tampa aberta. Se a máquina dormir ou a rede
              cair, o vigia retoma sozinho de onde parou.
            </div>
          </>
        )
      })()}

      {/* ── 3. a barra da mesa ── */}
      <div className="an-mesabar">
        <div className="an-seg" role="tablist" aria-label="Como ver a mesa">
          {([['kanban', 'Kanban'], ['tabela', 'Tabela'], ['galeria', 'Galeria']] as [Layout, string][]).map(([id, rot]) => (
            <button key={id} type="button" role="tab" aria-selected={layout === id} className={layout === id ? 'on' : ''} onClick={() => trocarLayout(id)}>{rot}</button>
          ))}
        </div>
        <input className="an-busca" type="search" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar tomador, CNPJ, corretora ou produto" aria-label="Buscar na mesa" />
        <div className="an-varr">
          {/* + NOVO CARD (23/09/2026). "dentro da tela Análise tem os cards do
              Kanban, onde também é possível inserir um card por ali". A porta é
              a MESMA da Entrada do Comercial (`NovoPedido`), e por isso o card
              nasce igual: caso, checklist e linha na esteira. */}
          {!somenteLeitura && (
            <button type="button" className="an-bt" onClick={() => setNovoCard(v => !v)}
              title="Abrir um card novo pelo CNPJ, sem e-mail. Ele nasce na coluna Entrada.">
              {novoCard ? 'Fechar' : '+ Novo card'}
            </button>
          )}
          <span title={textoVarr}>{textoVarr}</span>
          {!somenteLeitura && (
            <button type="button" className="an-bt" disabled={varrendo || !!comandoVivo} onClick={varrer}
              title="Confere a pasta Análises FAM do notebook (raiz e _concluidas). O tomador cuja pasta não está mais lá sai da Mesa. Nada é apagado: análise, tomador e caso continuam no CRM.">
              Varrer de Novo
            </button>
          )}
        </div>
      </div>

      {novoCard && !somenteLeitura && (
        <div className="card-panel" style={{ marginBottom: 12 }}>
          <NovoPedido portas="só cnpj" aoAbrir={carregar} aoFechar={() => setNovoCard(false)} />
        </div>
      )}

      {erro && <div className="alert-error" style={{ marginBottom: 12 }}>{erro}</div>}

      {/* ── 4. o quadro ── */}
      {carregando ? (
        <div className="card-panel"><p style={{ color: 'var(--soft)', fontSize: 14 }}>Carregando a mesa…</p></div>
      ) : fila.length === 0 ? (
        <div className="card-panel">
          <p style={{ color: 'var(--soft)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Nenhuma análise na esteira ainda. Duas coisas enchem esta mesa: a Triagem, ao concluir
            um caso do Comercial, e o agente da esteira rodando no notebook (<b>node scripts/esteira.mjs</b>),
            que traz as pastas que já existem no disco.
          </p>
        </div>
      ) : layout === 'kanban' ? kanban() : layout === 'galeria' ? galeria() : tabela()}

      {editandoColuna && (
        <EditorColuna
          coluna={editandoColuna === 'nova' ? null : editandoColuna}
          colunas={colunas}
          aoFechar={() => setEditandoColuna(null)}
          aoSalvar={() => { setEditandoColuna(null); carregar() }}
        />
      )}
    </div>
  )
}
