'use client'

// ============================================================================
//  A IA GESTOR, EM TODA TELA DO CRM
//
//  Ordem dele em 09/09/2026: "a IA Gestor deve estar em todo o sistema, em todo
//  o CRM FAM". Então ela não é uma página: é uma peça montada no DashboardShell,
//  que existe em cima de qualquer tela e sabe de qual tela foi chamada.
//
//  ── OS DOIS MODOS (decisão dele, 09/09/2026) ──────────────────────────────
//  "Quando estiver com API desligada, deixa somente o Robô. Quando ligar a API,
//  aí o acesso expande, inclusive para criar relatórios, tabelas e gráficos."
//
//  Com a API DESLIGADA o painel não mostra mais um erro vermelho. Ele abre no
//  Painel do robô: as perguntas de diretoria já respondidas, calculadas em
//  TypeScript contra o banco, custo zero. Sem caixa de texto, e de propósito:
//  sem API não há quem interprete uma frase escrita à mão, e adivinhar por
//  palavra-chave erraria na frente de diretor.
//
//  Com a API LIGADA o robô NÃO some. Ele continua sendo a primeira tela (é
//  instantâneo e de graça), e cada cartão ganha um "aprofundar", que entrega a
//  pergunta pronta para a IA discutir o número que o robô já deu.
//
//  ── A JANELA ──────────────────────────────────────────────────────────────
//  Pedido dele: "eu tenho que dimensionar o tamanho da tela, com o mouse no
//  canto posso aumentar ou diminuir, altura e largura". Deixou de ser uma
//  gaveta colada na direita e virou janela: arrasta pelo cabeçalho, estica por
//  qualquer borda ou canto, e o tamanho fica guardado NAQUELE navegador. Cada
//  pessoa acerta a janela dela uma vez e nunca mais mexe.
//
//  ── O QUE ELA NÃO É, e isso foi decisão de desenho ────────────────────────
//  não é uma bolha roxa com faísca no canto. O visual é o do CRM (azul-marinho,
//  dourado, densidade de sistema de trabalho), porque a queixa dele foi
//  exatamente essa: "o visual está muito cara de IA". Sem caixa alta espaçada,
//  sem gradiente, sem brilho. Uma ferramenta de trabalho não precisa se
//  anunciar como robô a cada pixel.
//
//  GOVERNANÇA NA TELA: o rodapé diz, com todas as letras, que ela lê com as
//  permissões de quem está logado. Vale para a IA e vale para o robô.
//
//  O HISTÓRICO É POR CONVERSA E POR PESSOA (ordem dele, 09/09/2026). O ☰ lista
//  as SUAS conversas, e só as suas: isso é RLS no banco, e não uma escolha
//  desta tela.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import BlocoIA, { type Bloco } from './BlocoIA'
import { SecaoPainel, CartaoNumero, AbasPainel, Aviso } from '@/components/painel/Painel'
/* `texto` já é o conteúdo do campo de pergunta aqui dentro, então a
   tipografia entra com outro nome. */
import { cor, texto as tipografia, botaoCheio, corDaArea } from '@/lib/ui/painel'

interface Fala {
  quem: 'pessoa' | 'ia'
  texto: string
  blocos?: Bloco[]
  custo?: number | null
  cache?: boolean
  erro?: boolean
}

interface Config {
  api_ligada: boolean
  modelo: string
  esforco: string
  teto_diario_usd: number
  mudado_por_nome?: string | null
}

interface Estado {
  config: Config
  tem_chave: boolean
  pode_mexer: boolean
  gasto: { usd: number; perguntas: number; com_cache: number }
}

interface Conversa {
  id: string
  titulo: string
  tela: string | null
  ultima: string
  trocas: number
}

interface Cartao {
  id: string
  area: 'tomadores' | 'operacoes'
  titulo: string
  numero: string
  sub: string
  alerta?: boolean
  blocos: Bloco[]
  pergunta: string
}

/** "há 3 h", "ontem", "12/09". Data cheia numa lista estreita rouba o espaço
 *  do título, que é o que a pessoa está procurando. */
function quando(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`
  if (min < 48 * 60) return 'ontem'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/* As sugestões mudam com a tela. Perguntar "qual a concentração por corretora"
   dentro da ficha de um tomador é ruído; perguntar isso no Funil é o trabalho.
   O prefixo da rota basta: não vale a pena um mapa por página. */
function sugestoesDa(rota: string): string[] {
  if (rota.startsWith('/fluxo')) return [
    'Monte um gráfico de barras com o LMG total por etapa do funil.',
    'Quais operações estão há mais tempo paradas na mesma etapa?',
    'Qual a concentração de prêmio por corretora? Faça uma pizza.',
  ]
  if (rota.startsWith('/tomadores')) return [
    'Faça uma tabela com os dez maiores limites aprovados e o rating de cada um.',
    'Que tomadores têm operação viva sem análise vigente?',
    'Compare a evolução do faturamento nos exercícios analisados.',
  ]
  if (rota.startsWith('/analises')) return [
    'Onde a decisão final mais discordou do Score FAM?',
    'Monte um gráfico com a distribuição de rating no acervo.',
    'O que se repete nas análises aprovadas com ressalva?',
  ]
  if (rota.startsWith('/operacoes')) return [
    'Prêmio previsto por modalidade, em gráfico de barras.',
    'Quais operações estão acima da taxa média da modalidade delas?',
    'Faça a tabela das operações emitidas neste mês.',
  ]
  if (rota.startsWith('/comercial')) return [
    'Quantos casos entraram e quantos viraram tomador?',
    'Que casos estão sem CNPJ há mais tempo?',
    'O que mais falta nos checklists de triagem abertos?',
  ]
  return [
    'Monte um gráfico do prêmio previsto por etapa do funil.',
    'Faça a tabela dos dez maiores tomadores por limite aprovado.',
    'Onde está o maior risco de concentração hoje?',
  ]
}

/* ══════════════════════════════════════════════════════════════════════════
   A JANELA

   Guardada em px absolutos no navegador da pessoa. Não vai para o banco de
   propósito: o tamanho certo depende do monitor, e o monitor é de quem está
   sentado. Sincronizar isso entre máquinas faria a janela do notebook chegar
   errada no monitor grande.
   ══════════════════════════════════════════════════════════════════════════ */
interface Caixa { x: number; y: number; w: number; h: number }

const CHAVE_CAIXA = 'fam:ia-gestor:janela'
const MIN_W = 360
const MIN_H = 320

/** Nunca deixa a janela sair da tela. Vale na abertura e vale quando a pessoa
 *  muda de monitor ou reduz o navegador: uma janela guardada em 1920 abrindo
 *  num notebook de 1366 ficaria com o cabeçalho fora do alcance do mouse, e
 *  aí não teria como trazer de volta. */
function encaixar(c: Caixa): Caixa {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.max(MIN_W, Math.min(c.w, vw - 16))
  const h = Math.max(MIN_H, Math.min(c.h, vh - 16))
  return {
    w, h,
    x: Math.max(8, Math.min(c.x, vw - w - 8)),
    y: Math.max(8, Math.min(c.y, vh - h - 8)),
  }
}

function caixaInicial(): Caixa {
  if (typeof window === 'undefined') return { x: 0, y: 0, w: 560, h: 680 }
  try {
    const cru = localStorage.getItem(CHAVE_CAIXA)
    if (cru) {
      const c = JSON.parse(cru) as Caixa
      if ([c.x, c.y, c.w, c.h].every((n) => Number.isFinite(n))) return encaixar(c)
    }
  } catch { /* navegador sem storage: cai no padrão, e nada quebra */ }
  const w = Math.min(560, window.innerWidth - 32)
  const h = Math.min(720, window.innerHeight - 32)
  return encaixar({ w, h, x: window.innerWidth - w - 18, y: window.innerHeight - h - 18 })
}

/** As oito pegas. `d` diz que bordas aquela pega move. */
const PEGAS: { d: string; cursor: string; estilo: React.CSSProperties }[] = [
  { d: 'n', cursor: 'ns-resize', estilo: { top: -3, left: 12, right: 12, height: 7 } },
  { d: 's', cursor: 'ns-resize', estilo: { bottom: -3, left: 12, right: 12, height: 7 } },
  { d: 'w', cursor: 'ew-resize', estilo: { left: -3, top: 12, bottom: 12, width: 7 } },
  { d: 'e', cursor: 'ew-resize', estilo: { right: -3, top: 12, bottom: 12, width: 7 } },
  { d: 'nw', cursor: 'nwse-resize', estilo: { top: -4, left: -4, width: 16, height: 16 } },
  { d: 'ne', cursor: 'nesw-resize', estilo: { top: -4, right: -4, width: 16, height: 16 } },
  { d: 'sw', cursor: 'nesw-resize', estilo: { bottom: -4, left: -4, width: 16, height: 16 } },
  { d: 'se', cursor: 'nwse-resize', estilo: { bottom: -4, right: -4, width: 16, height: 16 } },
]

export default function GestorGlobal() {
  const rota = usePathname() ?? '/'
  const [aberto, setAberto] = useState(false)
  const [estado, setEstado] = useState<Estado | null>(null)
  const [falas, setFalas] = useState<Fala[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  // A conversa aberta agora. Nula = a próxima pergunta abre uma nova.
  const [conversaId, setConversaId] = useState<string | null>(null)
  const [titulo, setTitulo] = useState('')
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [verLista, setVerLista] = useState(false)

  // ── o robô ────────────────────────────────────────────────────────────────
  const [aba, setAba] = useState<'painel' | 'conversa'>('painel')
  const [cartoes, setCartoes] = useState<Cartao[] | null>(null)
  const [erroRobo, setErroRobo] = useState<string | null>(null)
  const [cartaoAberto, setCartaoAberto] = useState<string | null>(null)

  // ── a janela ──────────────────────────────────────────────────────────────
  const [caixa, setCaixa] = useState<Caixa>(caixaInicial)
  const [cheia, setCheia] = useState(false)
  const guardada = useRef<Caixa | null>(null)
  const arrasto = useRef<{ d: string; px: number; py: number; c: Caixa } | null>(null)

  const fim = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  const lerConfig = useCallback(async () => {
    try {
      const r = await fetch('/api/ia/config')
      if (r.ok) setEstado(await r.json())
    } catch { /* offline: a tela abre assim mesmo e o envio dirá o motivo */ }
  }, [])

  const lerConversas = useCallback(async () => {
    try {
      const r = await fetch('/api/ia/conversas')
      if (r.ok) setConversas((await r.json()).conversas ?? [])
    } catch { /* sem lista, a IA continua respondendo */ }
  }, [])

  /* O robô não depende de chave nem de interruptor: ele é buscado sempre que o
     painel abre, ligada ou desligada. É o que garante que o painel nunca abra
     vazio. */
  const lerRobo = useCallback(async () => {
    setErroRobo(null)
    try {
      const r = await fetch('/api/ia/robo')
      const j = await r.json()
      if (r.ok) setCartoes(j.cartoes ?? [])
      else setErroRobo(j.erro ?? 'O robô não respondeu.')
    } catch {
      setErroRobo('Não consegui falar com o servidor do CRM.')
    }
  }, [])

  /* Abrir uma conversa traz o fio INTEIRO do banco, com os blocos pendurados
     na resposta que os gerou. Reabrir a de ontem tem que trazer o gráfico
     junto, e não só o texto que falava dele. */
  const abrirConversa = useCallback(async (id: string) => {
    setVerLista(false)
    setAba('conversa')
    setPensando(true)
    try {
      const r = await fetch(`/api/ia/conversas/${id}`)
      const j = await r.json()
      if (r.ok) {
        setConversaId(id)
        setTitulo(j.conversa?.titulo ?? '')
        setFalas((j.falas ?? []).map((f: {
          quem: 'pessoa' | 'ia'; texto: string
          blocos?: Bloco[]; custo?: number | null; cache?: boolean
        }) => ({
          quem: f.quem, texto: f.texto, blocos: f.blocos ?? [],
          custo: f.custo ?? null, cache: !!f.cache,
        })))
      }
    } catch { /* deixa a conversa atual como está */ }
    setPensando(false)
  }, [])

  const conversaNova = () => {
    setConversaId(null); setTitulo(''); setFalas([]); setVerLista(false); setTexto('')
    setAba('conversa')
  }

  // A config, as conversas e o robô só são buscados quando o painel abre: é
  // uma ida ao servidor por sessão, e não uma a cada tela carregada.
  useEffect(() => {
    if (!aberto) return
    // O setState mora dentro do fetch (assíncrono), mas o lint enxerga a
    // chamada no corpo do efeito. Mesma convenção do NewsTicker.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!estado) lerConfig()
    if (!cartoes) lerRobo()
    lerConversas()
  }, [aberto, estado, cartoes, lerConfig, lerConversas, lerRobo])

  // Ctrl+I abre e fecha. É a mesma tecla em toda tela, que é o ponto de ela ser
  // global: a pessoa não precisa procurar onde fica a IA nesta página.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault(); setAberto((a) => !a)
      }
      if (e.key === 'Escape') setAberto(false)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  // Navegador encolheu, ou a pessoa trocou de monitor: a janela volta para
  // dentro sozinha, em vez de ficar com metade do corpo fora do alcance.
  useEffect(() => {
    const ajustar = () => setCaixa((c) => encaixar(c))
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [])

  useEffect(() => {
    if (aberto && aba === 'conversa') {
      fim.current?.scrollIntoView({ behavior: 'smooth' })
      campo.current?.focus()
    }
  }, [aberto, aba, falas])

  /* ── arrastar e esticar ──────────────────────────────────────────────────
     Um único mecanismo para as nove pegas (o cabeçalho move, as oito bordas
     esticam). Os ouvintes ficam no window, e não no elemento: soltar o mouse
     fora da janela tem que terminar o arrasto, senão ela gruda no cursor. */
  useEffect(() => {
    const mover = (e: PointerEvent) => {
      const a = arrasto.current
      if (!a) return
      const dx = e.clientX - a.px
      const dy = e.clientY - a.py
      const vw = window.innerWidth
      const vh = window.innerHeight
      let { x, y, w, h } = a.c

      if (a.d === 'mover') {
        x = a.c.x + dx
        y = a.c.y + dy
      } else {
        if (a.d.includes('e')) w = a.c.w + dx
        if (a.d.includes('s')) h = a.c.h + dy
        /* Esticar pela esquerda ou pelo topo move a origem junto. Sem o
           Math.min, encolher além do mínimo faria a janela andar sozinha
           enquanto o tamanho já estava travado. */
        if (a.d.includes('w')) {
          w = a.c.w - dx
          x = a.c.x + Math.min(dx, a.c.w - MIN_W)
        }
        if (a.d.includes('n')) {
          h = a.c.h - dy
          y = a.c.y + Math.min(dy, a.c.h - MIN_H)
        }
      }

      w = Math.max(MIN_W, Math.min(w, vw - 16))
      h = Math.max(MIN_H, Math.min(h, vh - 16))
      x = Math.max(8, Math.min(x, vw - w - 8))
      y = Math.max(8, Math.min(y, vh - h - 8))
      setCaixa({ x, y, w, h })
    }

    const soltar = () => {
      if (!arrasto.current) return
      arrasto.current = null
      document.body.style.userSelect = ''
      /* Só grava quando o mouse solta. Gravar a cada pixel seria uma escrita
         em disco por movimento do mouse. */
      setCaixa((c) => {
        try { localStorage.setItem(CHAVE_CAIXA, JSON.stringify(c)) } catch {}
        return c
      })
    }

    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
    }
  }, [])

  const pegar = (d: string) => (e: React.PointerEvent) => {
    if (cheia) return
    e.preventDefault()
    arrasto.current = { d, px: e.clientX, py: e.clientY, c: caixa }
    // Sem isto, arrastar seleciona o texto do painel inteiro pelo caminho.
    document.body.style.userSelect = 'none'
  }

  /* Maximizar guarda a caixa de antes para o clique de volta devolver
     exatamente o tamanho que a pessoa tinha ajustado. */
  const alternarCheia = () => {
    if (cheia) {
      if (guardada.current) setCaixa(encaixar(guardada.current))
      setCheia(false)
    } else {
      guardada.current = caixa
      setCaixa(encaixar({ x: 8, y: 8, w: window.innerWidth - 16, h: window.innerHeight - 16 }))
      setCheia(true)
    }
  }

  async function perguntar(pergunta: string) {
    const p = pergunta.trim()
    if (!p || pensando) return
    setAba('conversa')
    setTexto('')
    setFalas((f) => [...f, { quem: 'pessoa', texto: p }])
    setPensando(true)

    /* O tomador vem da URL. Perguntar "qual o limite dele?" dentro de uma ficha
       tem que funcionar sem repetir o nome da empresa. */
    const m = rota.match(/^\/tomadores\/([0-9a-f-]{36})/)
    try {
      const r = await fetch('/api/ia/perguntar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        /* O histórico NÃO vai daqui. Quem monta o fio é o servidor, lendo o
           banco: o que a tela mandasse seria uma memória que qualquer um
           poderia inventar. Daqui vai só o id da conversa. */
        body: JSON.stringify({
          pergunta: p,
          tela: rota,
          conversa_id: conversaId,
          tomador: m ? { id: m[1], razao_social: document.title.split('·')[0].trim() } : null,
        }),
      })
      const j = await r.json()
      if (!r.ok) {
        setFalas((f) => [...f, { quem: 'ia', texto: j.erro ?? 'Não consegui responder.', erro: true }])
        if (j.desligada) lerConfig()
      } else {
        setFalas((f) => [...f, {
          quem: 'ia', texto: j.texto, blocos: j.blocos ?? [],
          custo: j.uso?.custo_usd ?? null,
          cache: (j.uso?.cache_leitura ?? 0) > 0,
        }])
        // A conversa pode ter nascido nesta pergunta: guarda o id para a
        // próxima cair no mesmo fio, e atualiza a lista do ☰.
        if (j.conversa_id) setConversaId(j.conversa_id)
        if (j.conversa_nova) setTitulo(p.length > 42 ? p.slice(0, 42) + '…' : p)
        lerConfig()
        lerConversas()
      }
    } catch {
      setFalas((f) => [...f, { quem: 'ia', texto: 'A conexão caiu no meio da resposta.', erro: true }])
    }
    setPensando(false)
  }

  async function ligar(ligada: boolean) {
    const r = await fetch('/api/ia/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_ligada: ligada }),
    })
    const j = await r.json()
    if (!r.ok) {
      setFalas((f) => [...f, { quem: 'ia', texto: j.erro ?? 'Não consegui mudar.', erro: true }])
      setAba('conversa')
      return
    }
    setEstado((e) => (e ? { ...e, config: j.config, gasto: j.gasto } : e))
  }

  const ligada = estado?.config.api_ligada ?? false

  // ── o botão, sempre presente ──────────────────────────────────────────────
  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        title="IA Gestor (Ctrl+I)"
        style={{
          position: 'fixed', right: 18, bottom: 18, zIndex: 900,
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#0a1628', color: '#fff', border: '1px solid #1a3560',
          borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', boxShadow: '0 8px 24px -8px rgba(10,22,40,.55)',
        }}
      >
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: ligada ? '#27a96c' : '#e8b84b',
        }} />
        IA Gestor
        <span style={{ fontSize: 10.5, color: '#8fa3b8', fontWeight: 500 }}>Ctrl+I</span>
      </button>
    )
  }

  const botaoCabecalho: React.CSSProperties = {
    background: 'none', border: 'none', color: '#8fa3b8', cursor: 'pointer',
    fontSize: 15, lineHeight: 1, padding: '3px 5px', borderRadius: 6,
  }

  const cartoesDa = (area: 'tomadores' | 'operacoes') =>
    (cartoes ?? []).filter((c) => c.area === area)

  // ── a janela ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', left: caixa.x, top: caixa.y, width: caixa.w, height: caixa.h,
      zIndex: 950, background: '#f4f7fb', borderRadius: 14, overflow: 'hidden',
      border: '1px solid #cfdcec', display: 'flex', flexDirection: 'column',
      boxShadow: '0 24px 60px -22px rgba(10,22,40,.55), 0 2px 10px -4px rgba(10,22,40,.25)',
    }}>
      {/* AS PEGAS. Invisíveis, encostadas nas bordas por fora do conteúdo, para
          não roubarem o clique de nada que esteja dentro do painel. */}
      {!cheia && PEGAS.map((p) => (
        <div
          key={p.d}
          onPointerDown={pegar(p.d)}
          style={{ position: 'absolute', zIndex: 5, cursor: p.cursor, ...p.estilo }}
        />
      ))}

      {/* cabeçalho, e é por ele que a janela anda */}
      <div
        onPointerDown={(e) => {
          // Só arrasta pelo fundo do cabeçalho: um botão dentro dele continua
          // sendo um botão.
          if ((e.target as HTMLElement).closest('button')) return
          pegar('mover')(e)
        }}
        style={{
          background: '#0a1628', color: '#fff', padding: '10px 12px 10px 14px',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          cursor: cheia ? 'default' : 'move',
          borderBottom: '2px solid #e8b84b',
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: ligada ? '#27a96c' : '#e8b84b',
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{aba === 'conversa' && titulo ? titulo : 'IA Gestor'}</div>
          <div style={{ fontSize: 10.5, color: '#8fa3b8' }}>
            {ligada
              ? `robô + IA pela API · ${estado?.config.modelo ?? ''}`
              : 'robô · a IA pela API está desligada'}
          </div>
        </div>

        <button onClick={() => { setVerLista((v) => !v); setAba('conversa') }} title="As minhas conversas"
          style={{ ...botaoCabecalho, color: verLista ? '#e8b84b' : '#8fa3b8' }}>
          ☰
        </button>
        <button onClick={conversaNova} title="Conversa nova" style={{ ...botaoCabecalho, fontSize: 17 }}>
          +
        </button>
        <button onClick={alternarCheia} title={cheia ? 'Voltar ao tamanho' : 'Ocupar a tela'}
          style={{ ...botaoCabecalho, fontSize: 13 }}>
          {cheia ? '⤡' : '⤢'}
        </button>
        <button onClick={() => setAberto(false)} title="Fechar (Esc)"
          style={{ ...botaoCabecalho, color: '#fff', fontSize: 19 }}>
          ×
        </button>
      </div>

      {/* as duas abas. O Painel é o robô; a Conversa é a IA. */}
      <AbasPainel
        atual={aba}
        aoTrocar={(id) => { setAba(id); setVerLista(false) }}
        abas={[
          { id: 'painel' as const, nome: 'Painel', dica: cartoes ? `${cartoes.length} números` : 'carregando…' },
          { id: 'conversa' as const, nome: 'Conversa', dica: ligada ? 'pergunta livre' : 'precisa da API' },
        ]}
      />

      {/* o interruptor e o gasto, só para quem manda */}
      {estado?.pode_mexer && (
        <div style={{
          background: '#e8f0fa', borderBottom: '1px solid var(--border)',
          padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <button
            onClick={() => ligar(!ligada)}
            disabled={!ligada && !estado.tem_chave}
            title={!estado.tem_chave ? 'Falta a ANTHROPIC_API_KEY no ambiente do CRM' : ''}
            style={{
              width: 40, height: 22, borderRadius: 11, flexShrink: 0, position: 'relative',
              border: '1px solid ' + (ligada ? '#1a7a4c' : 'var(--border)'),
              background: ligada ? '#27a96c' : '#fff',
              cursor: !ligada && !estado.tem_chave ? 'not-allowed' : 'pointer',
              opacity: !ligada && !estado.tem_chave ? 0.5 : 1, padding: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 2, left: ligada ? 20 : 2,
              width: 16, height: 16, borderRadius: '50%', background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .15s',
            }} />
          </button>
          <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: '#1a3560', lineHeight: 1.4 }}>
            <b>API {ligada ? 'ligada' : 'desligada'}.</b>{' '}
            {estado.gasto.perguntas > 0
              ? `US$ ${estado.gasto.usd.toFixed(3)} em ${estado.gasto.perguntas} pergunta(s) nas últimas 24 h, ${estado.gasto.com_cache} com cache.`
              : 'Nada gasto nas últimas 24 h.'}
            {!estado.tem_chave && ' Falta a chave no servidor: o Painel funciona assim mesmo.'}
          </div>
        </div>
      )}

      {/* ══ PAINEL DO ROBÔ ══════════════════════════════════════════════════
          Custo zero, sem API, sem chave. É a tela que abre. */}
      {aba === 'painel' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 13px 16px' }}>
          {erroRobo && <Aviso tom="erro">{erroRobo}</Aviso>}

          {!cartoes && !erroRobo && (
            <div style={{ ...tipografia.corpo, color: cor.textoFraco, padding: '6px 2px' }}>
              somando o banco…
            </div>
          )}

          {cartoes && ([
            ['tomadores', 'Tomadores'],
            ['operacoes', 'Operações e subscrição'],
          ] as const).map(([area, nome]) => (
            <SecaoPainel key={area} nome={nome} cor={corDaArea(area)}>
              {cartoesDa(area).map((c) => (
                <CartaoNumero
                  key={c.id}
                  rotulo={c.titulo}
                  numero={c.numero}
                  sub={c.sub}
                  alerta={c.alerta}
                  aberto={cartaoAberto === c.id}
                  aoAlternar={() => setCartaoAberto(cartaoAberto === c.id ? null : c.id)}
                  /* A ponte para o outro modo. Sem a API, o rodapé explica por que
                     o botão não está lá, em vez de sumir sem dizer nada. */
                  rodape={ligada ? (
                    <button onClick={() => perguntar(c.pergunta)}
                      style={{ ...botaoCheio, padding: '7px 12px', fontSize: 12 }}>
                      Aprofundar com a IA
                    </button>
                  ) : (
                    <div style={tipografia.nota}>
                      Com a API ligada, este cartão ganha um &ldquo;aprofundar&rdquo;: a IA
                      discute o número, cruza com o resto do CRM e monta o relatório.
                    </div>
                  )}
                >
                  {c.blocos.length
                    ? c.blocos.map((b, j) => <BlocoIA key={j} bloco={b} />)
                    : (
                      <div style={tipografia.nota}>
                        Não há detalhe para abrir: o número acima é tudo que o banco tem
                        para esta pergunta hoje.
                      </div>
                    )}
                </CartaoNumero>
              ))}
            </SecaoPainel>
          ))}

          {cartoes && (
            <div style={{ ...tipografia.nota, paddingTop: 2 }}>
              Todo número desta aba é somado aqui no CRM, contra o banco, com as suas
              permissões. Não passa por IA nenhuma e não custa nada.
            </div>
          )}
        </div>
      )}

      {/* AS MINHAS CONVERSAS. Só as minhas: a RLS do banco recusa a dos outros,
          então esta lista não tem como mostrar demais nem por engano. */}
      {aba === 'conversa' && verLista && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', background: '#fff' }}>
          <div style={{
            fontSize: 11, color: 'var(--soft)', marginBottom: 10, lineHeight: 1.5,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ flex: 1 }}>
              {conversas.length
                ? `${conversas.length} conversa(s) sua(s). Ninguém mais lê nenhuma delas.`
                : 'Você ainda não tem conversa guardada.'}
            </span>
            <button onClick={conversaNova} className="btn-clear" style={{ fontSize: 11.5, padding: '3px 9px' }}>
              nova
            </button>
          </div>

          {conversas.map((c) => (
            <button
              key={c.id}
              onClick={() => abrirConversa(c.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', marginBottom: 6,
                background: c.id === conversaId ? '#e8f0fa' : '#f7fafd',
                border: '1px solid ' + (c.id === conversaId ? '#3070c8' : 'var(--border)'),
                borderRadius: 9, padding: '8px 10px', cursor: 'pointer',
              }}
            >
              <div style={{
                fontSize: 12.5, fontWeight: 600, color: '#0a1628', lineHeight: 1.35,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{c.titulo || 'sem título'}</div>
              <div style={{ fontSize: 10.5, color: 'var(--soft)', marginTop: 2 }}>
                {quando(c.ultima)} · {c.trocas} pergunta{c.trocas === 1 ? '' : 's'}
                {c.tela && c.tela !== '/' ? ` · ${c.tela}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ══ A CONVERSA ══════════════════════════════════════════════════════ */}
      {aba === 'conversa' && !verLista && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            {falas.length === 0 && (
              <div>
                {ligada ? (
                  <>
                    <p style={{ fontSize: 12.5, color: 'var(--soft)', margin: '2px 0 12px', lineHeight: 1.55 }}>
                      Pergunte sobre o CRM. Ela lê o banco com as <b>suas</b> permissões e monta tabela
                      e gráfico de verdade quando a pergunta pedir.
                    </p>
                    {sugestoesDa(rota).map((s) => (
                      <button
                        key={s} onClick={() => perguntar(s)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', marginBottom: 7,
                          background: '#fff', border: '1px solid var(--border)', borderRadius: 9,
                          padding: '9px 11px', fontSize: 12.5, color: '#26374a', cursor: 'pointer',
                          lineHeight: 1.45,
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </>
                ) : (
                  /* Desligada, esta aba explica o que ela ganharia se fosse
                     ligada, e manda de volta para o que funciona agora. Não é
                     mais um erro vermelho no meio de uma tela vazia. */
                  <div style={{
                    background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
                    padding: '13px 14px',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0a1628', marginBottom: 7 }}>
                      A pergunta livre depende da API
                    </div>
                    <p style={{ fontSize: 12.5, color: '#5a7290', lineHeight: 1.6, margin: '0 0 10px' }}>
                      Sem ela ninguém interpreta uma frase escrita à mão, e chutar por
                      palavra-chave erraria na sua frente. Com a API ligada entram: pergunta
                      livre, relatório, e tabela e gráfico montados na hora, do jeito que você
                      pedir.
                    </p>
                    <p style={{ fontSize: 12.5, color: '#5a7290', lineHeight: 1.6, margin: '0 0 12px' }}>
                      Enquanto isso, o <b>Painel</b> responde as perguntas de diretoria com o
                      dado real do banco, na hora e sem custo.
                    </p>
                    <button
                      onClick={() => setAba('painel')}
                      style={{
                        background: '#1e4080', color: '#fff', border: 'none', borderRadius: 8,
                        padding: '8px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Ir para o Painel
                    </button>
                  </div>
                )}
              </div>
            )}

            {falas.map((f, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                {f.quem === 'pessoa' ? (
                  <div style={{
                    background: '#1e4080', color: '#fff', borderRadius: '10px 10px 3px 10px',
                    padding: '8px 11px', fontSize: 12.5, marginLeft: 34, lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}>{f.texto}</div>
                ) : (
                  <>
                    <div style={{
                      background: f.erro ? '#fbe9e9' : '#fff',
                      border: '1px solid ' + (f.erro ? '#e8b4b4' : 'var(--border)'),
                      borderRadius: '10px 10px 10px 3px', padding: '9px 12px',
                      fontSize: 12.5, color: f.erro ? '#a02020' : '#26374a', lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}>{f.texto}</div>
                    {(f.blocos ?? []).map((b, j) => <BlocoIA key={j} bloco={b} />)}
                    {f.custo != null && (
                      <div style={{ fontSize: 10, color: 'var(--soft)', marginTop: 5 }}>
                        US$ {f.custo.toFixed(4)}{f.cache ? ' · leu do cache' : ' · primeira do prefixo (grava o cache)'}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {pensando && (
              <div style={{ fontSize: 12, color: 'var(--soft)', padding: '4px 2px' }}>
                consultando o banco…
              </div>
            )}
            <div ref={fim} />
          </div>

          {/* o campo */}
          <div style={{
            borderTop: '1px solid var(--border)', background: '#fff',
            padding: '10px 12px', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
              <textarea
                ref={campo} value={texto} rows={2}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); perguntar(texto) }
                }}
                placeholder={ligada ? 'Pergunte, ou peça um gráfico…' : 'Ligue a API para perguntar. O Painel funciona sem ela.'}
                disabled={!ligada || pensando}
                style={{
                  flex: 1, resize: 'none', fontSize: 12.5, lineHeight: 1.5,
                  border: '1px solid var(--border)', borderRadius: 8, padding: '7px 9px',
                  fontFamily: 'inherit', color: '#0a1628', background: ligada ? '#fff' : '#f4f7fb',
                }}
              />
              <button
                onClick={() => perguntar(texto)} disabled={!ligada || pensando || !texto.trim()}
                style={{
                  background: '#1e4080', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '9px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  opacity: !ligada || pensando || !texto.trim() ? 0.45 : 1, flexShrink: 0,
                }}
              >
                {pensando ? '…' : 'Enviar'}
              </button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--soft)', marginTop: 6, lineHeight: 1.45 }}>
              Ela enxerga só o que o seu perfil enxerga. Todo número vem de consulta ao banco,
              e cada pergunta fica registrada com quem perguntou e quanto custou.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
