'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Modo = 'login' | 'esqueci'

export default function LoginPage() {
  const router = useRouter()

  const [modo, setModo] = useState<Modo>('login')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  async function handleLogin(e: React.SyntheticEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
      if (error) {
        setErro('E-mail ou senha incorretos. Verifique e tente novamente.')
        return
      }
      router.push('/')
      router.refresh()
    } finally {
      setCarregando(false)
    }
  }

  async function handleEsqueci(e: React.SyntheticEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/alterar-senha`,
      })
      if (error) {
        setErro('Não foi possível enviar o e-mail. Verifique o endereço informado.')
        return
      }
      setSucesso('E-mail enviado! Verifique sua caixa de entrada para redefinir a senha.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#e8eef5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: 'white',
        borderRadius: '14px',
        boxShadow: '0 8px 40px rgba(10,22,40,.25)',
        border: '1px solid #c5d5e8',
        overflow: 'hidden',
      }}>

        {/* Cabeçalho com gradiente igual ao sistema */}
        <div style={{
          background: 'linear-gradient(135deg,#0a1628 0%,#1a3560 60%,#2255a4 100%)',
          padding: '24px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}>
          <div style={{
            width: 42, height: 42,
            background: 'linear-gradient(135deg,#3070c8,#a0c0e8)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 20, color: 'white', flexShrink: 0,
          }}>F</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>FAM Seguradora</div>
            <div style={{ fontSize: 11, color: '#a0c0e8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Controle Comercial
            </div>
          </div>
        </div>

        {/* Formulário */}
        <div style={{ padding: '28px' }}>
          {modo === 'login' ? (
            <>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#102040', marginBottom: 4 }}>
                  Bem-vindo de volta
                </div>
                <div style={{ fontSize: 13, color: '#6080a0' }}>
                  Faça login para acessar o sistema
                </div>
              </div>

              {erro && <div className="alert-error" style={{ marginBottom: 16 }}>{erro}</div>}

              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-field">
                  <label className="form-label">E-mail</label>
                  <input
                    type="email"
                    className="fam-input"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value.toLowerCase())}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-field">
                  <label className="form-label">Senha</label>
                  <input
                    type="password"
                    className="fam-input"
                    placeholder="••••••••"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={carregando}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '12px 20px' }}
                >
                  {carregando ? 'Entrando...' : 'Entrar'}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: 18 }}>
                <button
                  onClick={() => { setModo('esqueci'); setErro(''); setSucesso('') }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#3070c8', fontSize: 13, fontWeight: 600,
                    fontFamily: "'Calibri', 'Segoe UI', sans-serif",
                  }}
                >
                  Esqueci minha senha
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#102040', marginBottom: 4 }}>
                  Redefinir senha
                </div>
                <div style={{ fontSize: 13, color: '#6080a0' }}>
                  Informe seu e-mail e enviaremos um link para criar uma nova senha.
                </div>
              </div>

              {erro && <div className="alert-error" style={{ marginBottom: 16 }}>{erro}</div>}
              {sucesso && <div className="alert-success" style={{ marginBottom: 16 }}>{sucesso}</div>}

              {!sucesso && (
                <form onSubmit={handleEsqueci} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-field">
                    <label className="form-label">E-mail cadastrado</label>
                    <input
                      type="email"
                      className="fam-input"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value.toLowerCase())}
                      required
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={carregando}
                    style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '12px 20px' }}
                  >
                    {carregando ? 'Enviando...' : 'Enviar link de redefinição'}
                  </button>
                </form>
              )}

              <div style={{ textAlign: 'center', marginTop: 18 }}>
                <button
                  onClick={() => { setModo('login'); setErro(''); setSucesso('') }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#3070c8', fontSize: 13, fontWeight: 600,
                    fontFamily: "'Calibri', 'Segoe UI', sans-serif",
                  }}
                >
                  ← Voltar ao login
                </button>
              </div>
            </>
          )}
        </div>

        {/* Rodapé */}
        <div style={{
          padding: '12px 28px',
          borderTop: '1px solid #e8f0fa',
          textAlign: 'center',
          fontSize: 11,
          color: '#6080a0',
        }}>
          FAM Seguradora © {new Date().getFullYear()} — Uso interno
        </div>
      </div>
    </div>
  )
}
