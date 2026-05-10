'use client'

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
  { label: '📊 Dashboard',              href: '/' },
  { label: '👥 Tomadores',              href: '/tomadores' },
  { label: '📋 Operações / Subscrição', href: '/operacoes' },
  { label: '🏢 Corretoras',             href: '/corretoras', adminOnly: true },
  { label: '📦 Produtos',               href: '/produtos',   adminOnly: true },
  { label: '⚙️ Usuários',              href: '/usuarios',   adminOnly: true },
]

export default function DashboardShell({ nomeUsuario, perfilUsuario, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const isAdmin = perfilUsuario === 'admin'
  const hoje = fmtDataExtenso()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const tabsVisiveis = TABS.filter((t) => !t.adminOnly || isAdmin)

  return (
    <>
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
            display: 'flex', alignItems: 'center', gap: 10,
            borderLeft: '1px solid rgba(255,255,255,.15)', paddingLeft: 20,
          }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>{nomeUsuario}</div>
              <div style={{
                color: '#e8b84b', fontSize: 11, textTransform: 'uppercase',
                letterSpacing: '0.8px', fontWeight: 600,
              }}>{isAdmin ? 'Administrador' : 'Usuário'}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Sair"
              style={{
                background: 'rgba(255,255,255,.1)',
                border: '1px solid rgba(255,255,255,.2)',
                borderRadius: 6,
                color: '#a0c0e8',
                cursor: 'pointer',
                padding: '6px 10px',
                fontSize: 12,
                fontFamily: "'Calibri','Segoe UI',sans-serif",
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.1)')}
            >
              Sair
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

      {/* ── Conteúdo ── */}
      <div style={{ padding: '28px 32px' }}>
        {children}
      </div>
    </>
  )
}
