'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AlterarSenhaPage() {
  const router = useRouter()

  const [novaSenha, setNovaSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setErro('')

    if (novaSenha.length < 8) {
      setErro('A senha deve ter no mínimo 8 caracteres.')
      return
    }
    if (novaSenha !== confirmacao) {
      setErro('As senhas não coincidem. Verifique e tente novamente.')
      return
    }

    setCarregando(true)
    try {
      const supabase = createClient()

      // 1. Atualiza a senha no Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({ password: novaSenha })
      if (authError) {
        setErro('Não foi possível definir a senha. Tente novamente.')
        return
      }

      // 2. Marca primeiro_acesso como false via API admin (contorna RLS)
      await fetch('/api/primeiro-acesso', { method: 'POST' })

      // 3. Navega para o sistema
      router.push('/')
      router.refresh()
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#e8eef5',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: 'white',
        borderRadius: 14, boxShadow: '0 8px 40px rgba(10,22,40,.25)',
        border: '1px solid #c5d5e8', overflow: 'hidden',
      }}>
        <div style={{
          background: 'linear-gradient(135deg,#0a1628 0%,#1a3560 60%,#2255a4 100%)',
          padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 42, height: 42,
            background: 'linear-gradient(135deg,#3070c8,#a0c0e8)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 20, color: 'white',
          }}>F</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>FAM Seguradora</div>
            <div style={{ fontSize: 11, color: '#a0c0e8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Controle Comercial
            </div>
          </div>
        </div>

        <div style={{ padding: 28 }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#102040', marginBottom: 4 }}>
              Crie sua senha de acesso
            </div>
            <div style={{ fontSize: 13, color: '#6080a0' }}>
              Defina uma senha pessoal para acessar o sistema. Você usará ela em todos os próximos logins.
            </div>
          </div>

          {erro && <div className="alert-error" style={{ marginBottom: 16 }}>{erro}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-field">
              <label className="form-label">Nova senha</label>
              <input
                type="password"
                className="fam-input"
                placeholder="Mínimo 8 caracteres"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                required minLength={8} autoFocus
              />
            </div>
            <div className="form-field">
              <label className="form-label">Confirmar senha</label>
              <input
                type="password"
                className="fam-input"
                placeholder="Repita a nova senha"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                required minLength={8}
              />
            </div>
            <button
              type="submit" className="btn-primary" disabled={carregando}
              style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '12px 20px' }}
            >
              {carregando ? 'Salvando...' : 'Definir senha e entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
