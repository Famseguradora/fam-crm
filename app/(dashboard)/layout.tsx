import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from './DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // MODO SANDBOX: pula o login e entra direto como "Marco", sem tocar no
  // Supabase real. Em produção (flag ausente) o fluxo normal continua igual.
  if (process.env.NEXT_PUBLIC_SANDBOX === 'true') {
    return (
      <DashboardShell
        nomeUsuario="Marco Dragone (Sandbox)"
        perfilUsuario="admin"
        proprietario={true}
        podePublicarAvisos={true}
        emailUsuario="sandbox@fam.local"
        userId="sandbox-user"
        dataInicio={null}
      >
        {children}
      </DashboardShell>
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Busca dados do usuário para exibir perfil e nome
  const { data: usuarioDb } = await supabase
    .from('usuarios')
    .select('nome, perfil, proprietario, pode_publicar_avisos')
    .eq('auth_id', user.id)
    .single()

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
      podePublicarAvisos={usuarioDb?.pode_publicar_avisos ?? false}
      emailUsuario={user.email ?? ''}
      userId={user.id}
      dataInicio={config?.valor ?? null}
    >
      {children}
    </DashboardShell>
  )
}
