'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtDataExtenso } from '@/lib/utils'
import { DateRangeProvider } from '@/lib/context/date-range-context'
import { PermissoesProvider } from '@/lib/context/permissoes-context'
import InstallPrompt from './InstallPrompt'
import NewsTicker from './NewsTicker'
import MarketTicker from './MarketTicker'

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
  children: React.ReactNode
}

interface Tab {
  label: string
  href: string
  adminOnly?: boolean
  disabled?: boolean
  /** Subitens que aparecem ao passar o mouse na aba. */
  sub?: { label: string; href: string }[]
}

const TABS: Tab[] = [
  { label: '📊 Dashboard',  href: '/' },
  /* A análise de crédito é um subitem de Tomadores: passa o mouse, aparece.
     É a porta de entrada da frente 1 (a análise dentro do CRM). */
  { label: '👥 Tomadores',  href: '/tomadores', sub: [
    { label: '🔎 Análise de crédito', href: '/tomadores/analise-credito' },
    { label: '⚖️ Conferência', href: '/tomadores/conferencia' },
  ] },
  { label: '📋 Operações',  href: '/operacoes' },
  { label: '🏢 Corretoras', href: '/corretoras', adminOnly: true },
  { label: '📦 Produtos',   href: '/produtos',   adminOnly: true },
]

/* Telas sem a moldura clara da área de conteúdo: elas são painéis inteiros e
   usam a janela toda. Uma lista só, para o próximo caso não virar mais um
   ternário aninhado aqui dentro. */
const TELA_CHEIA = ['/corretoras', '/financeiro', '/tomadores/analise-credito']

// Telas que aparecem no menu do app no celular (as demais ficam só no desktop).
// Corretoras entra no mobile (respeitando adminOnly); o cockpit é responsivo.
const MOBILE_NAV_HREFS = ['/', '/operacoes', '/tomadores', '/corretoras']

const SUBSCRICAO_ITEMS: { label: string; href: string; icon: string; disabled?: boolean }[] = []

const PERFORMANCE_ITEMS = [
  { label: 'Performance', href: '/performance', icon: '📊', disabled: true },
]

const CONFIG_ITEMS: {
  label: string; href: string; icon: string;
  proprietarioOnly?: boolean; emailOnly?: string; avisosOnly?: boolean; disabled?: boolean
}[] = [
  { label: 'Central de Avisos', href: '/configuracoes/avisos', icon: '📢', avisosOnly: true },
  { label: 'Skills de IA', href: '/configuracoes/skills',  icon: '🧠', proprietarioOnly: false, emailOnly: 'marcodragone@gmail.com', disabled: true },
  { label: 'Sistema',      href: '/configuracoes/sistema', icon: '⚙️', proprietarioOnly: true },
]

export default function DashboardShell({ nomeUsuario, perfilUsuario, proprietario, podePublicarAvisos, emailUsuario, userId, dataInicio, veFinanceiro = false, children }: Props) {
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
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    // Celular em QUALQUER orientação: largura pequena (retrato) OU altura
    // pequena (paisagem — ao deitar o celular a largura passa de 768px, mas a
    // altura cai p/ ~390px). Sem o 2º critério, o celular deitado virava
    // "desktop" e aparecia a barra lateral + abas de cima.
    const mq = window.matchMedia('(max-width: 768px), (max-height: 600px)')
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

  const tabsVisiveis = TABS.filter((t) => !t.adminOnly || veTelasGerenciais)

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
  const [medidas, setMedidas] = useState({ grude: 118, doTopo: 118 })

  useEffect(() => {
    if (isMobile) return
    const medir = () => {
      const grude = Math.round(zonaFixa.current?.getBoundingClientRect().height ?? 118)
      const el = menuLateral.current
      const doTopo = el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : grude
      // O guarda de 1px é o que impede o laço: mudar a altura do menu muda a
      // altura do corpo, o observador dispara de novo, e sem ele isso não pararia.
      setMedidas(m => (Math.abs(m.grude - grude) < 1 && Math.abs(m.doTopo - doTopo) < 1)
        ? m : { grude, doTopo })
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(document.body)
    if (zonaFixa.current) ro.observe(zonaFixa.current)
    window.addEventListener('resize', medir)
    return () => { ro.disconnect(); window.removeEventListener('resize', medir) }
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
          const isActive = !tab.disabled && (
            tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
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
        <div ref={menuLateral} style={{
          width: sidebarW,
          minWidth: sidebarW,
          background: '#0d1e3a',
          borderRight: '1px solid #1a3560',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s ease, min-width 0.2s ease',
          overflowY: 'auto',
          overflowX: 'hidden',
          flexShrink: 0,
          // Menu lateral SEMPRE visível: gruda abaixo do topo fixo do app e não
          // acompanha a rolagem da página.
          //
          // OS DOIS NÚMEROS SÃO MEDIDOS, e não escritos (consertado em 29/08/2026).
          // Eram 118px fixos nos dois lugares, e o menu NASCE em 167 (barra + os dois
          // tickers + as abas). Resultado: ele terminava 49px abaixo da janela, e o CRM
          // inteiro ganhava uma segunda barra de rolagem que deslocava o layout.
          //
          // `grude` é onde ele para ao rolar (a altura da zona fixa). `doTopo` é onde ele
          // COMEÇA, e é dele que sai a altura: assim o pé do menu encosta no pé da janela
          // e não passa. Os dois mudam quando o ticker de notícias é fechado no X.
          position: 'sticky',
          top: medidas.grude,
          alignSelf: 'flex-start',
          height: `calc(100vh - ${medidas.doTopo}px)`,
        }}>

          {/* Performance — com a seta de recolher na mesma linha do título
              (evita a linha vazia que a seta ocupava sozinha). */}
          <div style={{ paddingTop: 10 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarOpen ? 'space-between' : 'center',
              padding: sidebarOpen ? '0 10px 8px 16px' : '0 0 8px',
            }}>
              {sidebarOpen && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#4a7ab5',
                  letterSpacing: '1.5px', textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>
                  Performance
                </span>
              )}
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
        )}

        {/* ── Conteúdo ── */}
        {/* Corretoras usa o cockpit em tela cheia (full-bleed): sem o padding da
            área de conteúdo, o painel ocupa todo o espaço, sem a moldura clara.
            Financeiro entra na mesma regra: é um sistema inteiro dentro da tela,
            e o CFO passa o dia nele · 60px de moldura clara em volta custam uma
            faixa de lançamentos que ele deixaria de ver. */}
        <div style={{ flex: 1, padding: TELA_CHEIA.includes(pathname) ? 0 : (isMobile ? '16px 12px' : '28px 32px'), minWidth: 0 }}>
          <PermissoesProvider perfil={perfilUsuario} proprietario={proprietario} podePublicarAvisos={podePublicarAvisos}>
            <DateRangeProvider initialDate={dataInicio}>
              {children}
            </DateRangeProvider>
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
                ...TABS.filter((t) => MOBILE_NAV_HREFS.includes(t.href) && (!t.adminOnly || veTelasGerenciais)),
                /* Financeiro no celular pela MESMA regra do desktop: a lista de
                   `financeiro_acesso`, não o perfil. Quem não está nela não vê o
                   item em lugar nenhum · duas telas com dois critérios seria a
                   porta dos fundos que este projeto inteiro existe para não ter. */
                ...(veFinanceiro ? [{ label: '💰 Financeiro', href: '/financeiro' }] : []),
              ].map((tab) => {
                const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
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

    </div>
  )
}
