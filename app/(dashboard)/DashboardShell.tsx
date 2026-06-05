'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtDataExtenso } from '@/lib/utils'
import { DateRangeProvider } from '@/lib/context/date-range-context'
import InstallPrompt from './InstallPrompt'
// import NewsTicker from './NewsTicker'

interface Props {
  nomeUsuario: string
  perfilUsuario: string
  proprietario: boolean
  emailUsuario: string
  userId: string
  dataInicio: string | null
  children: React.ReactNode
}

interface Tab {
  label: string
  href: string
  adminOnly?: boolean
  disabled?: boolean
}

const TABS: Tab[] = [
  { label: '📊 Dashboard',  href: '/' },
  { label: '👥 Tomadores',  href: '/tomadores' },
  { label: '📋 Operações',  href: '/operacoes' },
  { label: '🏢 Corretoras', href: '/corretoras', adminOnly: true },
  { label: '📦 Produtos',   href: '/produtos',   adminOnly: true },
]

// Telas essenciais que aparecem no menu do app no celular (as demais ficam só no desktop)
const MOBILE_NAV_HREFS = ['/', '/operacoes', '/tomadores']

const SUBSCRICAO_ITEMS: { label: string; href: string; icon: string; disabled?: boolean }[] = []

const PERFORMANCE_ITEMS = [
  { label: 'Performance', href: '/performance', icon: '📊', disabled: true },
]

const CONFIG_ITEMS = [
  { label: 'Skills de IA', href: '/configuracoes/skills',  icon: '🧠', proprietarioOnly: false, emailOnly: 'marcodragone@gmail.com', disabled: true },
  { label: 'Sistema',      href: '/configuracoes/sistema', icon: '⚙️', proprietarioOnly: true },
]

export default function DashboardShell({ nomeUsuario, perfilUsuario, proprietario, emailUsuario, userId, dataInicio, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const isAdmin = perfilUsuario === 'admin'
  const hoje = fmtDataExtenso()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Fecha o drawer ao navegar
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const tabsVisiveis = TABS.filter((t) => !t.adminOnly || isAdmin)

  const sidebarW = sidebarOpen ? 220 : 52

  const [toast, setToast] = useState<string | null>(null)

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
      <div style={{ position: 'sticky', top: 0, zIndex: 100, flexShrink: 0 }}>

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
              {isAdmin ? 'Admin.' : 'Usuário'}
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

      {/* ── News Ticker ── (desabilitado) */}
      {/* <NewsTicker userId={userId} /> */}

      </div>{/* end sticky zone */}

      {/* ── Tabs ── */}
      <div style={{
        background: '#102040',
        padding: '0 32px',
        display: isMobile ? 'none' : 'flex',
        gap: 4,
        borderBottom: '2px solid #1e4080',
        overflowX: 'auto',
        flexShrink: 0,
      }}>
        {tabsVisiveis.map((tab) => {
          const isActive = !tab.disabled && (
            tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
          )
          return (
            <button
              key={tab.href}
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
              }}
              onMouseLeave={(e) => {
                if (!isActive && !tab.disabled) {
                  e.currentTarget.style.color = '#a0c0e8'
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              {tab.label}
              {tab.disabled && (
                <span style={{ fontSize: 9, color: '#e8b84b', fontWeight: 700, letterSpacing: '0.5px' }}>
                  EM BREVE
                </span>
              )}
            </button>
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
        <div style={{
          width: sidebarW,
          minWidth: sidebarW,
          background: '#0d1e3a',
          borderRight: '1px solid #1a3560',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s ease, min-width 0.2s ease',
          overflow: 'hidden',
          flexShrink: 0,
        }}>

          {/* Toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarOpen ? 'flex-end' : 'center',
              padding: '12px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #1a3560',
              color: '#6090b8',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              width: '100%',
              transition: 'color 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#a0c0e8')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#6090b8')}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>

          {/* Subscrição */}

          {/* Performance */}
          <div style={{ paddingTop: 8 }}>
            {sidebarOpen && (
              <div style={{
                fontSize: 10, fontWeight: 700, color: '#4a7ab5',
                letterSpacing: '1.5px', textTransform: 'uppercase',
                padding: '0 16px 8px',
                whiteSpace: 'nowrap',
              }}>
                Performance
              </div>
            )}
            {PERFORMANCE_ITEMS.map((item) => (
              <SidebarBtn key={item.href} href={item.href} icon={item.icon} label={item.label} disabled={item.disabled} />
            ))}
          </div>

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
              (!item.emailOnly || item.emailOnly === emailUsuario)
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
        <div style={{ flex: 1, padding: isMobile ? '16px 12px' : '28px 32px', minWidth: 0 }}>
          <DateRangeProvider initialDate={dataInicio}>
            {children}
          </DateRangeProvider>
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

            {/* Navegação essencial no mobile: Dashboard, Operações, Tomadores.
                Telas de admin/cadastro (Corretoras, Produtos, Sistema, Usuários…)
                ficam disponíveis só no desktop. */}
            <div style={{ paddingTop: 8 }}>
              {TABS.filter((t) => MOBILE_NAV_HREFS.includes(t.href)).map((tab) => {
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
