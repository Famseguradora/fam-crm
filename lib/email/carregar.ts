/* O QUE O CARTEIRO GERENCIAL LÊ DO BANCO, num lugar só.
   ═══════════════════════════════════════════════════════════════════════════

   A ponte aparece em três lugares: o painel do Comercial, a tela da régua (na
   simulação) e a IA Gestor (no /analisar). A conta mora em lib/email/ponte.ts;
   a LEITURA mora aqui, pelo mesmo motivo: se um lugar lesse 1.000 e-mails e
   outro 3.000, os três mostrariam números diferentes do mesmo dia, com a mesma
   fórmula.

   Cliente da SESSÃO sempre: cada pessoa soma o que a RLS deixa ela ver. */

import type { SupabaseClient } from '@supabase/supabase-js'
import { METAS_PADRAO, type LinhaPedido, type MetasEmail } from '@/lib/email/metricas'
import { lerVersao, type VersaoRegua } from '@/lib/email/regua'
import type { ClassificacaoGravada } from '@/lib/email/classificar'

export type LinhaDaPonte = LinhaPedido & { previa?: string | null; anexos?: { nome?: string | null }[] | null }

export interface BaseDoEmail {
  linhas: LinhaDaPonte[]
  versoes: VersaoRegua[]
  modalidades: string[]
  gravadas: ClassificacaoGravada[]
  metas: MetasEmail
  /** Sem a régua no banco (migration não aplicada), a tela segue e diz isso. */
  semRegua: boolean
  erro: string | null
}

/** 3.000 e-mails: com menos, "tudo" deixa de ser tudo e o RE vira pedido novo. */
export const LIMITE_EMAILS = 3000

export async function carregarBaseDoEmail(supabase: SupabaseClient): Promise<BaseDoEmail> {
  const [pedidos, m, regua, mods, classes] = await Promise.all([
    supabase.from('painel_pedidos').select('*').order('recebido_em', { ascending: false, nullsFirst: false }).limit(LIMITE_EMAILS),
    supabase.from('email_metas').select('*').eq('id', true).maybeSingle(),
    supabase.from('email_regua').select('versao, parametros, motivo, criada_por_nome, criada_em').order('versao'),
    supabase.from('modalidades').select('nome'),
    supabase.from('email_classificacao').select('*').limit(5000),
  ])
  return {
    linhas: (pedidos.data ?? []) as LinhaDaPonte[],
    // Lida com desconfiança: uma versão malformada gravada por fora não derruba a tela.
    versoes: ((regua.data ?? []) as Parameters<typeof lerVersao>[0][]).map(lerVersao),
    modalidades: [...new Set((mods.data ?? []).map((x: { nome: unknown }) => String(x.nome)))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    gravadas: (classes.data ?? []) as ClassificacaoGravada[],
    metas: m.data ? { ...METAS_PADRAO, ...m.data } : METAS_PADRAO,
    semRegua: !!regua.error || !(regua.data ?? []).length,
    erro: pedidos.error?.message ?? null,
  }
}
