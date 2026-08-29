// ============================================================================
//  Quem é você DENTRO do Financeiro — `lib/financeiro/acesso.ts`
//
//  Fonte única. Toda rota do Financeiro pergunta aqui, e nenhuma delas olha
//  `perfil`. É essa a diferença para o resto do CRM: lá, `fam_gerencia_usuarios()`
//  aceita `perfil = 'admin' OR proprietario`, e os 7 admins entram. Aqui quem
//  manda é a tabela `financeiro_acesso`, e ser admin não vale nada.
//
//  A checagem roda no SERVIDOR, antes de qualquer dado ser montado. Tela de
//  bloqueio dentro de componente client é `if` de renderização, não proteção:
//  o dado já teria sido enviado no HTML.
// ============================================================================
import { createClient } from '@/lib/supabase/server'

export interface QuemFinanceiro {
  /** id em `usuarios` (não é o auth_id) */
  usuarioId: string
  nome: string
  /** entra na tela */
  ve: boolean
  /** grava lançamento */
  edita: boolean
  /** concede e revoga acesso de outras pessoas */
  dono: boolean
}

/** Ninguém: sessão ausente, usuário fora da tabela, ou acesso revogado. */
export const NINGUEM: QuemFinanceiro = {
  usuarioId: '', nome: '', ve: false, edita: false, dono: false,
}

/**
 * Lê a sessão do CRM e devolve o que essa pessoa pode fazer no Financeiro.
 * Nunca lança: quem não tem acesso volta como NINGUEM, e a rota decide o 403.
 */
export async function quemFinanceiro(): Promise<QuemFinanceiro> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NINGUEM

  // A linha de acesso e o nome vêm juntos: o nome assina a trilha de auditoria,
  // e ele tem que vir do banco, nunca do que o navegador mandou.
  // O nome da FK é obrigatório aqui: `financeiro_acesso` aponta TRÊS vezes para
  // `usuarios` (quem recebeu, quem concedeu, quem revogou). Sem o nome, o
  // PostgREST não sabe por qual delas juntar e recusa a consulta inteira.
  const { data } = await supabase
    .from('financeiro_acesso')
    .select('dono, pode_editar, usuarios!financeiro_acesso_usuario_id_fkey!inner(id, nome, auth_id)')
    .is('revogado_em', null)
    .eq('usuarios.auth_id', user.id)
    .maybeSingle()

  if (!data) return NINGUEM

  const u = data.usuarios as unknown as { id: string; nome: string }
  const dono = Boolean(data.dono)

  return {
    usuarioId: u.id,
    nome: u.nome,
    ve: true,
    // dono edita por definição: quem manda em quem entra não pode ficar de fora
    edita: dono || Boolean(data.pode_editar),
    dono,
  }
}

/** Resposta padrão de quem não passou na porta. */
export function negado(motivo = 'Sem acesso ao Financeiro.') {
  return Response.json({ erro: motivo }, { status: 403 })
}
