'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtDataExtenso } from '@/lib/utils'

interface Props {
  nomeUsuario: string
  perfilUsuario: string
  children: React.ReactNode
}

interface Tab {
  label: string
  href: string
  adminOnly?: boolean
}

const TABS: Tab[] = [
  { label: '📊 Dashboard',  href: '/' },
  { label: '🔍 Triagem',    href: '/triagem' },
  { label: '👥 Tomadores',  href: '/tomadores' },
  { label: '📋 Operações',  href: '/operacoes' },
  { label: '🏢 Corretoras', href: '/corretoras', adminOnly: true },
  { label: '📦 Produtos',   href: '/produtos',   adminOnly: true },
]

const SUBSCRICAO_ITEMS = [
  { label: 'Análise de Crédito',    href: '/subscricao/analise-credito',    icon: '📈' },
  { label: 'Análise de Subscrição', href: '/subscricao/analise-subscricao', icon: '📋' },
]

const PERFORMANCE_ITEMS = [
  { label: 'Performance', href: '/performance', icon: '📊' },
]

const CONFIG_ITEMS = [
  { label: 'Skills de IA', href: '/configuracoes/skills', icon: '🧠' },
]

export default function DashboardShell({ nomeUsuario, perfilUsuario, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const isAdmin = perfilUsuario === 'admin'
  const hoje = fmtDataExtenso()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const tabsVisiveis = TABS.filter((t) => !t.adminOnly || isAdmin)

  const sidebarW = sidebarOpen ? 220 : 52

  function SidebarBtn({
    href,
    icon,
    label,
  }: {
    href: string
    icon: string
    label: string
  }) {
    const isActive = href === '/'
      ? pathname === '/'
      : pathname.startsWith(href)
    return (
      <button
        onClick={() => router.push(href)}
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
          color: isActive ? 'white' : '#a0c0e8',
          fontFamily: "'Calibri','Segoe UI',sans-serif",
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all .18s',
          textAlign: 'left',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.color = 'white'
            e.currentTarget.style.background = 'rgba(255,255,255,.05)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.color = '#a0c0e8'
            e.currentTarget.style.background = 'transparent'
          }
        }}
      >
        <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1 }}>{icon}</span>
        {sidebarOpen && <span>{label}</span>}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg,#0a1628 0%,#1a3560 60%,#2255a4 100%)',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 64,
        boxShadow: '0 2px 16px rgba(10,22,40,.4)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38,
            background: 'linear-gradient(135deg,#3070c8,#a0c0e8)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 18, color: 'white',
          }}>F</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>FAM Seguradora</div>
            <div style={{ fontSize: 11, color: '#a0c0e8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Controle Comercial
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ color: '#a0c0e8', fontSize: 13 }}>{hoje}</div>
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

      {/* ── Tabs ── */}
      <div style={{
        background: '#102040',
        padding: '0 32px',
        display: 'flex',
        gap: 4,
        borderBottom: '2px solid #1e4080',
        overflowX: 'auto',
        flexShrink: 0,
      }}>
        {tabsVisiveis.map((tab) => {
          const isActive =
            tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              style={{
                padding: '11px 24px 10px',
                background: isActive ? 'rgba(232,184,75,.08)' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '3px solid #e8b84b' : '3px solid transparent',
                color: isActive ? 'white' : '#a0c0e8',
                fontFamily: "'Calibri','Segoe UI',sans-serif",
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all .18s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'white'
                  e.currentTarget.style.background = 'rgba(255,255,255,.05)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = '#a0c0e8'
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Body row ── */}
      <div style={{ display: 'flex', flex: 1 }}>

        {/* ── Sidebar ── */}
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
          <div style={{ paddingTop: 16 }}>
            {sidebarOpen && (
              <div style={{
                fontSize: 10, fontWeight: 700, color: '#4a7ab5',
                letterSpacing: '1.5px', textTransform: 'uppercase',
                padding: '0 16px 8px',
                whiteSpace: 'nowrap',
              }}>
                Subscrição
              </div>
            )}
            {SUBSCRICAO_ITEMS.map((item) => (
              <SidebarBtn key={item.href} href={item.href} icon={item.icon} label={item.label} />
            ))}
          </div>

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
              <SidebarBtn key={item.href} href={item.href} icon={item.icon} label={item.label} />
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
            {CONFIG_ITEMS.map((item) => (
              <SidebarBtn key={item.href} href={item.href} icon={item.icon} label={item.label} />
            ))}
          </div>

          {/* Separator */}
          <div style={{ height: 1, background: '#1a3560', margin: '12px 0' }} />

          {/* Usuários (admin only) */}
          {isAdmin && (
            <SidebarBtn href="/usuarios" icon="⚙️" label="Usuários" />
          )}
        </div>

        {/* ── Conteúdo ── */}
        <div style={{ flex: 1, padding: '28px 32px', minWidth: 0 }}>
          {children}
        </div>
      </div>

    </div>
  )
}
