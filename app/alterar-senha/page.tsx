'use client'

export const dynamic = 'force-dynamic'

// ============================================================================
//  Tela de criação de senha. Atende DOIS caminhos, com o mesmo visual:
//
//  1. PRIMEIRO ACESSO — o admin entregou uma senha temporária. O layout do
//     dashboard manda para cá enquanto `usuarios.primeiro_acesso` for true, e
//     só solta o sistema depois que a senha definitiva é criada.
//  2. ESQUECI MINHA SENHA — o link do e-mail cai aqui já com a sessão de
//     recuperação. Se o link expirou ou já foi usado, avisa em português em
//     vez de estourar um erro seco.
// ============================================================================

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Estado = 'verificando' | 'pronto' | 'sem-sessao'

export default function AlterarSenhaPage() {
  const router = useRouter()

  const [estado, setEstado] = useState<Estado>('verificando')
  const [primeiroAcesso, setPrimeiroAcesso] = useState(false)
  const [nome, setNome] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  // Espera a sessão aparecer. No caminho do e-mail ela só existe depois que o
  // Supabase troca o código da URL, o que leva alguns instantes.
  useEffect(() => {
    const supabase = createClient()
    let vivo = true

    async function carregarDono(userId: string) {
      const { data } = await supabase
        .from('usuarios')
        .select('nome, primeiro_acesso')
        .eq('auth_id', userId)
        .maybeSingle()
      if (!vivo) return
      setNome((data?.nome ?? '').split(' ')[0] ?? '')
      setPrimeiroAcesso(!!data?.primeiro_acesso)
      setEstado('pronto')
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      if (data.session) { carregarDono(data.session.user.id); return }
      // Sem sessão ainda: pode ser o link do e-mail sendo processado.
      const { data: sub } = supabase.auth.onAuthStateChange((_evt, sessao) => {
        if (sessao && vivo) carregarDono(sessao.user.id)
      })
      const timer = setTimeout(() => { if (vivo) setEstado((e) => e === 'verificando' ? 'sem-sessao' : e) }, 4000)
      return () => { sub.subscription.unsubscribe(); clearTimeout(timer) }
    })

    return () => { vivo = false }
  }, [])

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

      // 1. Grava a senha nova
      const { error: authError } = await supabase.auth.updateUser({ password: novaSenha })
      if (authError) {
        const msg = authError.message.toLowerCase()
        if (msg.includes('session') || msg.includes('jwt')) {
          setErro('Sua sessão expirou. Volte ao login e peça um novo link.')
        } else if (msg.includes('different from the old') || msg.includes('should be different')) {
          setErro('A nova senha precisa ser diferente da anterior.')
        } else {
          setErro('Não foi possível definir a senha. Tente novamente.')
        }
        return
      }

      // 2. Libera o sistema (marca primeiro_acesso = false com a chave admin)
      await fetch('/api/primeiro-acesso', { method: 'POST' })

      // 3. Entra
      router.push('/')
      router.refresh()
    } finally {
      setCarregando(false)
    }
  }

  const senhaCurta = novaSenha.length > 0 && novaSenha.length < 8
  const naoConfere = confirmacao.length > 0 && novaSenha !== confirmacao

  return (
    <div style={{
      minHeight: '100vh', background: '#e8eef5',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 440, background: 'white',
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
            fontWeight: 700, fontSize: 20, color: 'white', flexShrink: 0,
          }}>F</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>FAM Seguradora</div>
            <div style={{ fontSize: 11, color: '#a0c0e8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Controle Comercial
            </div>
          </div>
        </div>

        <div style={{ padding: 28 }}>
          {estado === 'verificando' && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#6080a0', fontSize: 14 }}>
              Verificando seu acesso…
            </div>
          )}

          {estado === 'sem-sessao' && (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#102040', marginBottom: 6 }}>
                Este link não vale mais
              </div>
              <div style={{ fontSize: 13, color: '#6080a0', lineHeight: 1.55, marginBottom: 20 }}>
                O link de redefinição expira depois de um tempo e só pode ser usado uma vez.
                Volte ao login e peça um novo, que chega em instantes no seu e-mail.
              </div>
              <button
                onClick={() => router.push('/login')}
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '12px 20px' }}
              >
                Voltar ao login
              </button>
            </>
          )}

          {estado === 'pronto' && (
            <>
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#102040', marginBottom: 4 }}>
                  {primeiroAcesso
                    ? `Bem-vindo${nome ? `, ${nome}` : ''}! Crie sua senha`
                    : 'Crie sua nova senha'}
                </div>
                <div style={{ fontSize: 13, color: '#6080a0', lineHeight: 1.5 }}>
                  {primeiroAcesso
                    ? 'A senha que você recebeu era temporária. Defina agora uma senha pessoal, que só você conhece, para usar em todos os próximos acessos.'
                    : 'Defina uma senha pessoal. Você usará ela em todos os próximos acessos.'}
                </div>
              </div>

              {erro && <div className="alert-error" style={{ marginBottom: 16 }}>{erro}</div>}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-field">
                  <label className="form-label">Nova senha</label>
                  <input
                    type={mostrarSenha ? 'text' : 'password'}
                    className="fam-input"
                    placeholder="Mínimo 8 caracteres"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    required minLength={8} autoFocus
                    autoComplete="new-password"
                  />
                  {senhaCurta && (
                    <span style={{ fontSize: 11.5, color: '#a05010' }}>
                      Faltam {8 - novaSenha.length} caractere{8 - novaSenha.length !== 1 ? 's' : ''}.
                    </span>
                  )}
                </div>

                <div className="form-field">
                  <label className="form-label">Confirmar senha</label>
                  <input
                    type={mostrarSenha ? 'text' : 'password'}
                    className="fam-input"
                    placeholder="Repita a nova senha"
                    value={confirmacao}
                    onChange={(e) => setConfirmacao(e.target.value)}
                    required minLength={8}
                    autoComplete="new-password"
                  />
                  {naoConfere && (
                    <span style={{ fontSize: 11.5, color: '#a02020' }}>As duas senhas estão diferentes.</span>
                  )}
                </div>

                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  fontSize: 12.5, color: '#6080a0',
                }}>
                  <input
                    type="checkbox"
                    checked={mostrarSenha}
                    onChange={(e) => setMostrarSenha(e.target.checked)}
                    style={{ width: 15, height: 15, accentColor: '#3070c8', cursor: 'pointer' }}
                  />
                  Mostrar a senha enquanto digito
                </label>

                <button
                  type="submit" className="btn-primary"
                  disabled={carregando || novaSenha.length < 8 || novaSenha !== confirmacao}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '12px 20px' }}
                >
                  {carregando ? 'Salvando...' : 'Definir senha e entrar'}
                </button>
              </form>
            </>
          )}
        </div>

        <div style={{
          padding: '12px 28px', borderTop: '1px solid #e8f0fa',
          textAlign: 'center', fontSize: 11, color: '#6080a0',
        }}>
          FAM Seguradora © {new Date().getFullYear()} — Uso interno
        </div>
      </div>
    </div>
  )
}
