'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtDataExtenso } from '@/lib/utils'
import { DateRangeProvider } from '@/lib/context/date-range-context'
import { PermissoesProvider } from '@/lib/context/permissoes-context'
import { MQ_MOBILE } from '@/lib/ui/mobile'
import AvisosAoVivo from './AvisosAoVivo'
import InstallPrompt from './InstallPrompt'
import NewsTicker from './NewsTicker'
import MarketTicker from './MarketTicker'
import GestorGlobal from '@/components/ia/GestorGlobal'

const IS_SANDBOX = process.env.NEXT_PUBLIC_SANDBOX === 'true'

interface Props {
  nomeUsuario: string
  perfilUsuario: string
  proprietario: boolean
  podePublicarAvisos: boolean
  emailUsuario: string
  userId: string
  dataInicio: string | null
  /* Vem de `financeiro_acesso`, NÃO de `perfil`. É a única entrada do menu que
     não se decide por ser admin: quem não está na lista do Financeiro não vê
     nem o item. Quem decide são o Marco e o Aldeir, na própria tela. */
  veFinanceiro?: boolean
  /* Vem de `usuarios.acesso_analise`, NÃO de `perfil`. Igual ao Financeiro:
     quem não está marcado não vê nem o item no menu. Até 23/09/2026 a análise
     era de todo mundo com login, e isso passou a entregar balanço e limite a
     dois e-mails de fora da FAM. Quem marca é o Marco, na tela /usuarios. */
  veAnalise?: boolean
  /* Ver mais perfil que não é `leitura`: arrasta card na coluna e escreve a
     nota do tomador. Pedido literal dele: "os que são somente leitura não
     podem arrastar cards, só visualizar". RLS `fam_ajuda_analise()`. */
  ajudaAnalise?: boolean
  /* Vem de `usuarios.analista_credito`, NÃO de `perfil`. A análise de crédito
     tem um analista só, e o que este sinal governa é se os botões de DECIDIR
     aparecem. A trava de verdade é a RLS `fam_e_analista()`. */
  editaAnalise?: boolean
  children: React.ReactNode
}

interface Tab {
  label: string
  href: string
  adminOnly?: boolean
  disabled?: boolean
  /** Subitens que aparecem ao passar o mouse na aba. */
  sub?: { label: string; href: string }[]
  /* O CAMINHO QUE ACENDE A ABA, quando ele é mais largo que o href. O item
     Comercial da equipe leva a /comercial/entrada, mas abrir um caso vai para
     /comercial/<id> — e sem isto a aba apagava justo dentro do próprio fluxo
     do Comercial (23/09/2026, achado da revisão). */
  ativoPor?: string
}

const TABS: Tab[] = [
  { label: '📊 Dashboard',  href: '/' },
  /* A ORDEM DAS QUATRO PRIMEIRAS É A DELE, e é a ordem do trabalho, não a de
     quando cada tela foi construída (pedido em 09/09/2026: "Dashboard >
     Comercial > Funil > Análises > e segue o demais"):

       Comercial  o e-mail chega e o caso nasce
       Funil      onde o caso está, em cartões, para todas as áreas
       Análise    a esteira do crédito, o acervo e o card do tomador

     A primeira estação da esteira: o Comercial sobe o e-mail e o caso nasce
     dentro do CRM. */
  { label: '📥 Comercial',  href: '/comercial' },
  /* O FUNIL VOLTOU AO MENU EM 22/09/2026, e a Esteira de Risco saiu.

     Em 21/09 a Esteira tomou este lugar. No dia seguinte ele olhou pronta e
     disse: "não é exatamente o que eu quero... vamos manter a tela Funil que
     está publicada e depois ajustaremos outras coisas."

     Então o item de menu é o Funil de novo. A Esteira continua INTEIRA no
     disco (`app/(dashboard)/esteira/`, `components/esteira/`), nunca foi
     commitada e a rota `/esteira` responde para quem digitar: é rascunho
     parado, não trabalho jogado fora. Quando o desenho dela for o que ele
     quer, troca-se esta linha de volta e mais nada.

     O que ficou da Esteira e NÃO se mexe é o fluxo por área DENTRO do card do
     tomador (`components/tomador/SecoesDoCard.tsx`, na gaveta "Fluxo" de
     `/tomadores/<id>`). Esse ele aprovou e está publicado. */
  { label: '📋 Funil',      href: '/fluxo' },
  /* A segunda estação: o caso que a Triagem concluiu vira análise de crédito.
     Item de primeiro nível, e não subitem de Tomadores, porque é ESTEIRA e não
     cadastro: quem abre esta tela quer saber o que está travado hoje, e isso
     não se procura dentro de um menu de ficha.
     A tela antiga (o iframe do 127.0.0.1) continua em Tomadores > Análise de
     crédito enquanto o sistema separado não for aposentado. */
  /* UMA PORTA SÓ para a análise de crédito (ordem dele, 08/09/2026). A esteira,
     o acervo e o motor embutido viraram abas de `/analises`; o resultado de uma
     empresa continua dentro do card dela. Item sem submenu de propósito: o
     submenu era o que fazia parecer que havia duas telas. */
  { label: '🔬 Análise',    href: '/analises' },
  { label: '👥 Tomadores',  href: '/tomadores', sub: [
    { label: '⚖️ Conferência', href: '/tomadores/conferencia' },
    /* O chão de fábrica: os funcionários virtuais trabalhando, ao vivo.
       Fica sob Tomadores porque os dois que reportam hoje (Triagem e Analista)
       trabalham a pasta do tomador do começo ao fim. */
    { label: '🤖 Equipe', href: '/tomadores/equipe' },
  ] },
  { label: '📋 Operações',  href: '/operacoes' },
  { label: '🏢 Corretoras', href: '/corretoras', adminOnly: true },
  { label: '📦 Produtos',   href: '/produtos',   adminOnly: true },
]

/* Telas sem a moldura clara da área de conteúdo: elas são painéis inteiros e
   usam a janela toda. Uma lista só, para o próximo caso não virar mais um
   ternário aninhado aqui dentro. */
const TELA_CHEIA = ['/corretoras', '/financeiro']

// Telas que aparecem no menu do app no celular (as demais ficam só no desktop).
// Corretoras entra no mobile (respeitando adminOnly); o cockpit é responsivo.
//
// `/analises` entrou em 08/09/2026, e o motivo é o ponto: o acervo e o relatório
// foram feitos justamente para a análise ser lida FORA da máquina onde o sistema
// roda — inclusive no celular — e sem esta linha não havia como chegar lá pelo
// telefone. Desde 08/09/2026 é uma tela só, com as abas Mesa · Acervo · Sistema
// no alto dela.
const MOBILE_NAV_HREFS = ['/', '/fluxo', '/comercial', '/analises', '/operacoes', '/tomadores', '/corretoras']

const SUBSCRICAO_ITEMS: { label: string; href: string; icon: string; disabled?: boolean }[] = []

/* Vazia por ordem do Marco (30/08/2026): o item "Performance" estava desativado
   desde sempre e o título da seção só ocupava altura no menu. A lista fica no
   lugar, e não o `map` sumindo do JSX, para o dia em que houver o que pôr aqui. */
const PERFORMANCE_ITEMS: { label: string; href: string; icon: string; disabled?: boolean }[] = []

const CONFIG_ITEMS: {
  label: string; href: string; icon: string;
  proprietarioOnly?: boolean; emailOnly?: string; avisosOnly?: boolean; disabled?: boolean
}[] = [
  { label: 'Central de Avisos', href: '/configuracoes/avisos', icon: '📢', avisosOnly: true },
  { label: 'Skills de IA', href: '/configuracoes/skills',  icon: '🧠', proprietarioOnly: false, emailOnly: 'marcodragone@gmail.com', disabled: true },
  { label: 'Sistema',      href: '/configuracoes/sistema', icon: '⚙️', proprietarioOnly: true },
]

export default function DashboardShell({ nomeUsuario, perfilUsuario, proprietario, podePublicarAvisos, emailUsuario, userId, dataInicio, veFinanceiro = false, veAnalise = false, ajudaAnalise = false, editaAnalise = false, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const isAdmin = perfilUsuario === 'admin'
  // Perfil "leitura" (investidor): enxerga TODAS as telas de consulta, inclusive
  // Corretoras, Produtos, Contábil e Apresentação. Não há informação que ele não
  // possa ver; o que ele não pode é editar, e isso já é travado no banco.
  const somenteLeitura = perfilUsuario === 'leitura'
  const veTelasGerenciais = isAdmin || somenteLeitura
  const hoje = fmtDataExtenso()
  // NASCE ENCOLHIDO, por ordem dele em 30/08/2026: "deixa ele encolhido, para
  // visualizar tem que clicar na setinha. Isso ajuda na hora de abrir o
  // sistema." A seta ▶ continua no mesmo lugar para expandir.
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    // Celular em QUALQUER orientação: largura pequena (retrato) OU tela baixa
    // com a mira do dedo (paisagem · ao deitar o celular a largura passa de
    // 768px, mas a altura cai p/ ~390px). Sem o 2º critério, o celular deitado
    // virava "desktop" e aparecia a barra lateral + abas de cima.
    // O `pointer: coarse` do 2º critério é o que impede um MONITOR de tela
    // baixa de cair aqui dentro. A regra mora em lib/ui/mobile.ts, com o
    // porquê inteiro escrito.
    const mq = window.matchMedia(MQ_MOBILE)
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Fecha o drawer ao navegar
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  async function handleLogout() {
    // No sandbox não há login real; "sair" apenas recarrega o ambiente fake.
    if (IS_SANDBOX) { window.location.reload(); return }
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function handleResetSandbox() {
    if (!window.confirm('Resetar o sandbox? Suas alterações de teste serão apagadas e os dados voltam ao estado da planilha.')) return
    // import dinâmico: mantém o 'xlsx' fora do bundle de produção.
    const { resetDB } = await import('@/lib/supabase/sandbox/store')
    await resetDB()
    window.location.reload()
  }

  /* O COMERCIAL TEM DUAS PORTAS, e cada um entra pela sua (23/09/2026).

     A /comercial é o posto de trabalho do e-mail: a Caixa da FAM lida pelo
     Carteiro na máquina do Comercial, a Fila do dia, a gestão da esteira.
     Isso só existe para quem tem aquela caixa configurada — hoje, ele.

     Para o resto da equipe o item do menu leva à Entrada de pedidos
     (/comercial/entrada): subir o e-mail salvo e abrir pelo CNPJ, sem caixa
     de e-mail nenhuma. Mesmo item, mesmo lugar no menu, porta certa para cada
     um. A trava não é só o menu: a própria /comercial manda para cá quem não
     é o dono da caixa. */
  const paraMim = (t: Tab): Tab =>
    t.href === '/comercial' && !proprietario
      ? { ...t, href: '/comercial/entrada', ativoPor: '/comercial' }
      : t

  /* A ANÁLISE SEGUE A MESMA REGRA DO FINANCEIRO: quem não tem a marca não vê o
     item. Menu que leva a uma tela que o `layout.tsx` de /analises vai recusar
     é pior que menu nenhum. */
  const podeVerTab = (t: Tab) =>
    (!t.adminOnly || veTelasGerenciais) && (t.href !== '/analises' || veAnalise)

  const tabsVisiveis = TABS.filter(podeVerTab).map(paraMim)

  const sidebarW = sidebarOpen ? 220 : 52

  const [toast, setToast] = useState<string | null>(null)
  /* Submenu aberto ao passar o mouse numa aba (o href da aba). Ancorado no
     próprio botão: posição fixa medida uma vez ficava no lugar errado quando
     o ticker carregava e empurrava a barra. */
  const [subAberto, setSubAberto] = useState<string | null>(null)

  /* ── a altura do topo, MEDIDA ────────────────────────────────────────────
     Nada aqui é número escrito à mão. A zona fixa (barra + ticker de mercado +
     ticker de notícias) e as abas mudam de altura sozinhas: o ticker de
     notícias tem um X que o fecha, e a barra das abas quebra em duas linhas em
     tela estreita. O 118px que estava aqui errava por 49px, e esses 49px eram
     a segunda barra de rolagem do CRM. */
  const zonaFixa = useRef<HTMLDivElement>(null)
  const menuLateral = useRef<HTMLDivElement>(null)
  /* UM NÚMERO SÓ, a altura da zona fixa (08/09/2026). Eram dois (`grude` e
     `doTopo`), e a discordância entre eles é que deixava o pé do menu solto no
     meio da janela. Quem manda na altura do menu agora é a coluna que o
     segura, e o CSS resolve o resto: ver o bloco da Sidebar mais abaixo. */
  const [medidas, setMedidas] = useState({ grude: 118 })

  useEffect(() => {
    if (isMobile) return

    /* A ALTURA DO MENU SEGUE O TOPO REAL DELE, e por isso é ajustada aqui e não
       só no CSS (08/09/2026). O menu tem DUAS posições e elas pedem alturas
       diferentes: no alto da página ele começa embaixo das abas do CRM (que
       rolam junto e não fazem parte da zona fixa) e, depois de rolar, ele gruda
       embaixo da zona fixa, 49px mais acima. Foram esses 49px, medidos na tela,
       que sobraram no pé da barra azul no print dele.

       Um número fixo acerta um estado e erra o outro. `getBoundingClientRect`
       já devolve a posição do sticky depois de grudado, então esta conta acerta
       os dois. Escreve direto no DOM, sem estado: é a cada rolagem.

       Não entra em laço com o observador porque a coluna que segura o menu tem
       a altura do CORPO, e não a do menu: mexer na altura do menu não mexe na
       altura da página. */
    const ajustarMenu = () => {
      const el = menuLateral.current
      if (!el) return
      const alto = Math.max(0, Math.round(window.innerHeight - el.getBoundingClientRect().top))
      /* VAI NUMA VARIÁVEL CSS, e não em `style.height` (medido em 08/09/2026).
         Escrevendo direto no `height`, o próximo render do React reescrevia a
         propriedade com o valor do JSX e o ajuste sumia: no topo da página a
         barra voltava a passar 49px da janela. `--menu-alto` o React não
         conhece, então ele nunca a toca, e o `height` do JSX é uma string fixa
         que só lê essa variável. */
      el.style.setProperty('--menu-alto', `${alto}px`)
    }

    const medir = () => {
      const grude = Math.round(zonaFixa.current?.getBoundingClientRect().height ?? 118)
      // O guarda de 1px é o que impede o laço: mudar a altura do menu muda a
      // altura do corpo, o observador dispara de novo, e sem ele isso não pararia.
      setMedidas(m => (Math.abs(m.grude - grude) < 1 ? m : { grude }))
      ajustarMenu()
    }
    medir()

    // rAF para não recalcular a cada pixel de rolagem numa lista de 26 mil px.
    let pedido = 0
    const naRolagem = () => {
      if (pedido) return
      pedido = requestAnimationFrame(() => { pedido = 0; ajustarMenu() })
    }

    const ro = new ResizeObserver(medir)
    ro.observe(document.body)
    if (zonaFixa.current) ro.observe(zonaFixa.current)
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', naRolagem, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', naRolagem)
      if (pedido) cancelAnimationFrame(pedido)
    }
  }, [isMobile])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function SidebarBtn({
    href,
    icon,
    label,
    disabled,
  }: {
    href: string
    icon: string
    label: string
    disabled?: boolean
  }) {
    const isActive = !disabled && (href === '/' ? pathname === '/' : pathname.startsWith(href))
    return (
      <button
        onClick={() => {
          if (disabled) {
            showToast(`🚧 "${label}" está em construção`)
          } else {
            router.push(href)
          }
        }}
        title={!sidebarOpen ? label : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: sidebarOpen ? 10 : 0,
          justifyContent: sidebarOpen ? 'flex-start' : 'center',
          width: '100%',
          padding: sidebarOpen ? '9px 16px' : '9px 0',
          background: isActive ? 'rgba(232,184,75,.08)' : 'transparent',
          border: 'none',
          borderLeft: isActive ? '3px solid #e8b84b' : '3px solid transparent',
          color: disabled ? '#4a6080' : isActive ? 'white' : '#a0c0e8',
          fontFamily: "'Calibri','Segoe UI',sans-serif",
          fontSize: 13,
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all .18s',
          textAlign: 'left',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          opacity: disabled ? 0.55 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isActive && !disabled) {
            e.currentTarget.style.color = 'white'
            e.currentTarget.style.background = 'rgba(255,255,255,.05)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive && !disabled) {
            e.currentTarget.style.color = '#a0c0e8'
            e.currentTarget.style.background = 'transparent'
          }
        }}
      >
        <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1 }}>{icon}</span>
        {sidebarOpen && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {label}
            {disabled && <span style={{ fontSize: 10, color: '#e8b84b', fontWeight: 700 }}>EM BREVE</span>}
          </span>
        )}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

      {/* ── Sticky zone: header + news ticker ── */}
      <div ref={zonaFixa} style={{ position: 'sticky', top: 0, zIndex: 100, flexShrink: 0 }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg,#0a1628 0%,#1a3560 60%,#2255a4 100%)',
        padding: isMobile ? '0 14px' : '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: isMobile ? 56 : 64,
        boxShadow: '0 2px 16px rgba(10,22,40,.4)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
          {isMobile && (
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menu"
              style={{
                background: 'transparent', border: 'none', color: 'white',
                fontSize: 24, lineHeight: 1, cursor: 'pointer', padding: '6px 8px 6px 0',
              }}
            >☰</button>
          )}
          <div style={{
            width: isMobile ? 32 : 38, height: isMobile ? 32 : 38,
            background: 'linear-gradient(135deg,#3070c8,#a0c0e8)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: isMobile ? 16 : 18, color: 'white', flexShrink: 0,
          }}>F</div>
          <div>
            <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, color: 'white' }}>FAM Seguradora</div>
            {!isMobile && (
              <div style={{ fontSize: 11, color: '#a0c0e8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                Controle Comercial
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 20 }}>
          {IS_SANDBOX && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                background: '#e8b84b', color: '#0a1628', fontWeight: 800,
                fontSize: 11, letterSpacing: '1px', padding: '3px 8px', borderRadius: 5,
                textTransform: 'uppercase',
              }}>🧪 Sandbox</span>
              <button
                onClick={handleResetSandbox}
                title="Apaga as alterações de teste e volta aos dados da planilha"
                style={{
                  background: 'transparent', border: '1px solid #e8b84b', color: '#e8b84b',
                  fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >Resetar</button>
            </div>
          )}
          {!isMobile && <div style={{ color: '#a0c0e8', fontSize: 13 }}>{hoje}</div>}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            borderLeft: '1px solid rgba(255,255,255,.15)', paddingLeft: 20,
          }}>
            <div style={{
              width: 32, height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg,#e8b84b,#c0901a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 14, color: '#0a1628',
              flexShrink: 0,
            }}>
              {nomeUsuario.charAt(0).toUpperCase()}
            </div>
            <div style={{
              color: '#e8b84b', fontSize: 12, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '1px',
            }}>
              {isAdmin ? 'Admin.' : perfilUsuario === 'leitura' ? '👁 Só leitura' : 'Usuário'}
            </div>
            <button
              onClick={handleLogout}
              title="Sair"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6090b8',
                cursor: 'pointer',
                padding: '4px 6px',
                fontSize: 17,
                lineHeight: 1,
                marginLeft: 4,
                borderRadius: 4,
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#a0c0e8')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#6090b8')}
            >
              ⏻
            </button>
          </div>
        </div>
      </div>

      {/* ── Faixa de cotações (rolando) + notícias (rolando), acima das abas ── */}
      <MarketTicker />
      <NewsTicker userId={userId} />

      </div>{/* end sticky zone */}

      {/* ── Tabs ── */}
      <div style={{
        background: '#102040',
        padding: '0 32px',
        display: isMobile ? 'none' : 'flex',
        gap: 4,
        borderBottom: '2px solid #1e4080',
        /* visível, e não auto: o submenu de Tomadores desce por baixo da barra.
           Com 6 abas ela cabe em qualquer desktop; no celular nem aparece. */
        overflow: 'visible',
        flexShrink: 0,
      }}>
        {tabsVisiveis.map((tab) => {
          const acende = tab.ativoPor ?? tab.href
          const isActive = !tab.disabled && (
            acende === '/' ? pathname === '/' : pathname.startsWith(acende)
          )
          const temSub = !!tab.sub?.length
          return (
            <div
              key={tab.href}
              style={{ position: 'relative' }}
              onMouseLeave={() => { if (temSub) setSubAberto(null) }}
            >
            <button
              onClick={() => {
                if (tab.disabled) {
                  showToast(`🚧 "${tab.label.replace(/^\S+\s/, '')}" está em construção`)
                } else {
                  router.push(tab.href)
                }
              }}
              style={{
                padding: '11px 24px 10px',
                background: isActive ? 'rgba(232,184,75,.08)' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '3px solid #e8b84b' : '3px solid transparent',
                color: tab.disabled ? '#4a6080' : isActive ? 'white' : '#a0c0e8',
                fontFamily: "'Calibri','Segoe UI',sans-serif",
                fontSize: 15,
                fontWeight: 600,
                cursor: tab.disabled ? 'not-allowed' : 'pointer',
                transition: 'all .18s',
                whiteSpace: 'nowrap',
                opacity: tab.disabled ? 0.55 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              onMouseEnter={(e) => {
                if (!isActive && !tab.disabled) {
                  e.currentTarget.style.color = 'white'
                  e.currentTarget.style.background = 'rgba(255,255,255,.05)'
                }
                if (temSub) setSubAberto(tab.href)
              }}
              onMouseLeave={(e) => {
                if (!isActive && !tab.disabled) {
                  e.currentTarget.style.color = '#a0c0e8'
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              {tab.label}
              {temSub && <span style={{ fontSize: 9, opacity: .7 }}>▾</span>}
              {tab.disabled && (
                <span style={{ fontSize: 9, color: '#e8b84b', fontWeight: 700, letterSpacing: '0.5px' }}>
                  EM BREVE
                </span>
              )}
            </button>

            {/* O submenu: colado no pé do botão (sem vão, senão o mouse "sai"
                no caminho e ele fecha). */}
            {temSub && subAberto === tab.href && (
              <div style={{
                position: 'absolute', left: 0, top: '100%', zIndex: 150,
                paddingTop: 2,
              }}>
                <div style={{
                  background: '#0d1e3a', border: '1px solid #1e4080', borderRadius: 10,
                  boxShadow: '0 12px 28px rgba(0,0,0,.55)', padding: 6, minWidth: 200,
                }}>
                  {tab.sub!.map((s) => {
                    const ativo = pathname.startsWith(s.href)
                    return (
                      <button
                        key={s.href}
                        onClick={() => { setSubAberto(null); router.push(s.href) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                          padding: '9px 12px', borderRadius: 7, border: 'none', textAlign: 'left',
                          background: ativo ? 'rgba(232,184,75,.10)' : 'transparent',
                          color: ativo ? 'white' : '#a0c0e8',
                          fontFamily: "'Calibri','Segoe UI',sans-serif", fontSize: 14, fontWeight: 600,
                          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; e.currentTarget.style.background = 'rgba(255,255,255,.06)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = ativo ? 'white' : '#a0c0e8'; e.currentTarget.style.background = ativo ? 'rgba(232,184,75,.10)' : 'transparent' }}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            </div>
          )
        })}
      </div>

      {/* ── Toast "Em construção" ── */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0a1628',
          border: '1px solid #e8b84b',
          color: 'white',
          padding: '14px 28px',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "'Calibri','Segoe UI',sans-serif",
          zIndex: 9999,
          boxShadow: '0 4px 24px rgba(0,0,0,.5)',
          letterSpacing: '0.3px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span>{toast}</span>
          <span style={{ fontSize: 11, color: '#a0c0e8', fontWeight: 400 }}>— disponível em breve</span>
        </div>
      )}

      {/* ── Body row ── */}
      <div style={{ display: 'flex', flex: 1 }}>

        {/* ── Sidebar (desktop) ── */}
        {!isMobile && (
        /* A COLUNA e o MENU são duas peças, e é o que conserta o pé solto
           (08/09/2026).
           Antes era uma peça só: um menu sticky com `top: grude` e
           `height: calc(100vh - doTopo)`. Dois números medidos em momentos
           diferentes mandando na mesma caixa, e bastava eles discordarem (o
           ticker de notícias fecha, a barra de abas passa de duas linhas para
           uma) para o menu terminar antes do pé da janela: a faixa clara embaixo
           da barra azul que ele mostrou no print.

           Agora a COLUNA se estica com o corpo da página (`align-self: stretch`),
           então nunca sobra faixa clara ao lado do conteúdo, e o MENU dentro dela
           gruda com um número só: a altura da zona fixa. O `maxHeight: 100%` é o
           que impede o menu de passar do fim do corpo em página curta, que era o
           outro defeito, o da segunda barra de rolagem. */
        <div style={{
          width: sidebarW,
          minWidth: sidebarW,
          background: '#0d1e3a',
          borderRight: '1px solid #1a3560',
          transition: 'width 0.2s ease, min-width 0.2s ease',
          flexShrink: 0,
          alignSelf: 'stretch',
        }}>
        <div ref={menuLateral} style={{
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
          position: 'sticky',
          top: medidas.grude,
          /* O `calc` é só o valor de partida, para o primeiro quadro não nascer
             torto. Quem manda daqui em diante é a variável, escrita por
             `ajustarMenu` no efeito lá em cima. */
          height: `var(--menu-alto, calc(100vh - ${medidas.grude}px))`,
          maxHeight: '100%',
        }}>

          {/* A seta de recolher, sozinha na linha. O título "Performance" saiu
              a pedido dele: não dizia nada e comia altura do menu. Com a seta
              sozinha, `flex-end` mantém ela encostada à direita como antes,
              onde a mão dele já procura. */}
          <div style={{ paddingTop: 10 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarOpen ? 'flex-end' : 'center',
              padding: sidebarOpen ? '0 10px 8px 16px' : '0 0 8px',
            }}>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                title={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#6090b8',
                  cursor: 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 4,
                  transition: 'color 0.15s',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#a0c0e8')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#6090b8')}
              >
                {sidebarOpen ? '◀' : '▶'}
              </button>
            </div>
            {PERFORMANCE_ITEMS.map((item) => (
              <SidebarBtn key={item.href} href={item.href} icon={item.icon} label={item.label} disabled={item.disabled} />
            ))}
            {/* Financeiro · lista própria de acesso, fora do perfil do CRM */}
            {veFinanceiro && (
              <SidebarBtn href="/financeiro" icon="💰" label="Financeiro" />
            )}
          </div>

          {/* Relatórios (gerencial / contábil) */}
          {(isAdmin || proprietario || somenteLeitura) && (
            <div style={{ paddingTop: 8 }}>
              {sidebarOpen && (
                <div style={{
                  fontSize: 10, fontWeight: 700, color: '#4a7ab5',
                  letterSpacing: '1.5px', textTransform: 'uppercase',
                  padding: '0 16px 8px',
                  whiteSpace: 'nowrap',
                }}>
                  Relatórios
                </div>
              )}
              <SidebarBtn href="/relatorios/contabil" icon="📑" label="Contábil" />
              <SidebarBtn href="/apresentacao" icon="🎬" label="Apresentação" />
            </div>
          )}

          {/* Auditoria — OCULTA por enquanto (agente de análise financeira).
              Para reativar: descomentar o bloco abaixo e reabilitar a tarefa
              agendada (Enable-ScheduledTask "FAM CRM - Analise Financeira").
          {(isAdmin || proprietario) && (
            <div style={{ paddingTop: 8 }}>
              {sidebarOpen && (
                <div style={{
                  fontSize: 10, fontWeight: 700, color: '#4a7ab5',
                  letterSpacing: '1.5px', textTransform: 'uppercase',
                  padding: '0 16px 8px',
                  whiteSpace: 'nowrap',
                }}>
                  Auditoria
                </div>
              )}
              <SidebarBtn href="/analise-financeira" icon="🔎" label="Análise Financeira" />
            </div>
          )}
          */}

          {/* Configurações */}
          <div style={{ paddingTop: 8 }}>
            {sidebarOpen && (
              <div style={{
                fontSize: 10, fontWeight: 700, color: '#4a7ab5',
                letterSpacing: '1.5px', textTransform: 'uppercase',
                padding: '0 16px 8px',
                whiteSpace: 'nowrap',
              }}>
                Configurações
              </div>
            )}
            {CONFIG_ITEMS.filter(item =>
              (!item.proprietarioOnly || proprietario) &&
              (!item.emailOnly || item.emailOnly === emailUsuario) &&
              (!item.avisosOnly || ((podePublicarAvisos || proprietario) && perfilUsuario !== 'leitura'))
            ).map((item) => (
              <SidebarBtn key={item.href} href={item.href} icon={item.icon} label={item.label} disabled={item.disabled} />
            ))}
          </div>

          {/* Separator */}
          <div style={{ height: 1, background: '#1a3560', margin: '12px 0' }} />

          {/* Usuários (admin only) */}
          {isAdmin && (
            <SidebarBtn href="/usuarios" icon="⚙️" label="Usuários" />
          )}
        </div>
        </div>
        )}

        {/* ── Conteúdo ── */}
        {/* Corretoras usa o cockpit em tela cheia (full-bleed): sem o padding da
            área de conteúdo, o painel ocupa todo o espaço, sem a moldura clara.
            Financeiro entra na mesma regra: é um sistema inteiro dentro da tela,
            e o CFO passa o dia nele · 60px de moldura clara em volta custam uma
            faixa de lançamentos que ele deixaria de ver. */}
        <div style={{ flex: 1, padding: TELA_CHEIA.includes(pathname) ? 0 : (isMobile ? '16px 12px' : '28px 32px'), minWidth: 0 }}>
          <PermissoesProvider perfil={perfilUsuario} proprietario={proprietario} podePublicarAvisos={podePublicarAvisos} veAnalise={veAnalise} ajudaAnalise={ajudaAnalise} editaAnalise={editaAnalise}>
            <DateRangeProvider initialDate={dataInicio}>
              {children}
            </DateRangeProvider>
            <AvisosAoVivo editaAnalise={editaAnalise} />
          </PermissoesProvider>
        </div>
      </div>

      {/* ── Drawer de navegação (mobile) ── */}
      {isMobile && drawerOpen && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(5,12,25,.55)', zIndex: 200 }}
          />
          <div style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, width: 256, maxWidth: '82vw',
            background: '#0d1e3a', borderRight: '1px solid #1a3560', zIndex: 201,
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
            boxShadow: '2px 0 24px rgba(0,0,0,.5)',
          }}>
            {/* Cabeçalho do drawer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderBottom: '1px solid #1a3560',
            }}>
              <span style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>Menu</span>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Fechar menu"
                style={{ background: 'transparent', border: 'none', color: '#a0c0e8', fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: 4 }}
              >✕</button>
            </div>

            {/* Navegação no mobile: Dashboard, Operações, Tomadores e Corretoras
                (esta só para admin, igual ao desktop). Demais telas de
                admin/cadastro (Produtos, Sistema, Usuários…) seguem só no desktop. */}
            <div style={{ paddingTop: 8 }}>
              {[
                ...TABS.filter((t) => MOBILE_NAV_HREFS.includes(t.href) && podeVerTab(t)).map(paraMim),
                /* Financeiro no celular pela MESMA regra do desktop: a lista de
                   `financeiro_acesso`, não o perfil. Quem não está nela não vê o
                   item em lugar nenhum · duas telas com dois critérios seria a
                   porta dos fundos que este projeto inteiro existe para não ter. */
                ...(veFinanceiro ? [{ label: '💰 Financeiro', href: '/financeiro' }] : []),
              ].map((tab) => {
                const acende = ('ativoPor' in tab && tab.ativoPor) || tab.href
                const isActive = acende === '/' ? pathname === '/' : pathname.startsWith(acende)
                return (
                  <button
                    key={tab.href}
                    onClick={() => { router.push(tab.href); setDrawerOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '14px 16px', background: isActive ? 'rgba(232,184,75,.08)' : 'transparent',
                      border: 'none', borderLeft: isActive ? '3px solid #e8b84b' : '3px solid transparent',
                      color: isActive ? 'white' : '#a0c0e8', fontFamily: 'inherit', fontSize: 16,
                      fontWeight: 600, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
                    }}
                  >{tab.label}</button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Banner de instalação do app (mobile) */}
      <InstallPrompt />

      {/* A IA GESTOR, EM TODA TELA. Ela mora aqui e não numa página porque a
          ordem dele em 09/09/2026 foi essa: "em todo o sistema, em todo o CRM".
          Ela sabe de que tela foi chamada (lê o pathname) e lê o banco com as
          permissões de quem está logado. No sandbox não entra: as rotas dela
          falam com o Supabase de verdade e responderiam 401. */}
      {!IS_SANDBOX && <GestorGlobal />}

    </div>
  )
}
