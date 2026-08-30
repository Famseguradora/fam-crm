// ============================================================================
//  Quem pode MEXER na análise de crédito — `lib/analise/acesso.ts`
//
//  Ordem do Marco, 30/08/2026: ele é o único analista. Todo mundo VÊ, para
//  acompanhar o trabalho acontecendo; ninguém além dele EDITA. A liberação de
//  outras pessoas ele fará depois, e não precisa de código: é um update.
//
//      update usuarios set analista_credito = true where email = '…';
//
//  Não confundir com `perfil`. Sete pessoas são `admin` no CRM e todas passam
//  por `fam_pode_escrever()`. Nenhuma delas é analista. É a mesma distinção que
//  o Financeiro já faz em `lib/financeiro/acesso.ts`, pelo mesmo motivo: cargo
//  no CRM não é a mesma coisa que autorização numa mesa específica.
//
//  ESTE ARQUIVO NÃO É A TRAVA. A trava é a RLS (`fam_e_analista()`), que roda
//  no banco e vale para qualquer caminho, inclusive quem chamar a API por fora
//  do navegador. O que está aqui serve para a tela não OFERECER um botão que o
//  banco vai recusar depois — frustração à toa e erro vermelho sem motivo.
// ============================================================================
import { createClient } from '@/lib/supabase/server'

export interface QuemAnalise {
  /** Entra na tela e lê tudo. Hoje é todo mundo que tem login. */
  ve: boolean
  /** Decide conflito, aplica ao cadastro, publica a análise. Só o analista. */
  edita: boolean
  /** Nome de quem está olhando, para assinar a decisão. Vem do banco. */
  nome: string
}

export const VISITANTE: QuemAnalise = { ve: true, edita: false, nome: '' }

/**
 * Lê a sessão do CRM e devolve o que essa pessoa pode fazer na análise.
 * Nunca lança: sem sessão, volta como visitante que não edita.
 */
export async function quemAnalise(): Promise<QuemAnalise> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ve: false, edita: false, nome: '' }

  const { data } = await supabase
    .from('usuarios')
    .select('nome, analista_credito')
    .eq('auth_id', user.id)
    .maybeSingle()

  return {
    ve: true,
    edita: Boolean(data?.analista_credito),
    nome: data?.nome ?? user.email ?? '',
  }
}
