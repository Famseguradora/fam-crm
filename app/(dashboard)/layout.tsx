import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from './DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Busca dados do usuário para exibir perfil e nome
  const { data: usuarioDb } = await supabase
    .from('usuarios')
    .select('nome, perfil, primeiro_acesso, proprietario')
    .eq('auth_id', user.id)
    .single()

  // Se é primeiro acesso, redireciona para troca de senha
  if (usuarioDb?.primeiro_acesso) {
    redirect('/alterar-senha')
  }

  // Se onboarding não concluído, redireciona (fora deste layout, sem loop)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('onboarding_completo')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.onboarding_completo) {
    redirect('/onboarding')
  }

  // Carrega configuração global de data de início dos cálculos
  const { data: config } = await supabase
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', 'data_inicio_calculos')
    .single()

  return (
    <DashboardShell
      nomeUsuario={usuarioDb?.nome ?? user.email ?? ''}
      perfilUsuario={usuarioDb?.perfil ?? 'usuario'}
      proprietario={usuarioDb?.proprietario ?? false}
      dataInicio={config?.valor ?? null}
    >
      {children}
    </DashboardShell>
  )
}
