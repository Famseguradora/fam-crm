import type { SupabaseClient } from '@supabase/supabase-js'

// Cap de LMG por operação — mesmo limite aplicado no painel (operacoes/page.tsx:672)
export const CAP_LMG = 80_000_000

export interface KpiResultado {
  count: number
  lmgTotal: number // soma de min(lmg, 80M) por operação
  premioTotal: number // soma de premio_previsto (já limitado a 80M na origem)
}

// Calcula os KPIs de operações ativas de um determinado status.
// Replica fielmente o cálculo do painel: cap de 80M no LMG por operação.
// O prêmio é a soma direta de premio_previsto — coluna GENERATED no banco que,
// após a migração supabase-migration-premio-cap.sql, também aplica o teto de 80M.
export async function getKpisPorStatus(
  supabase: SupabaseClient,
  status: string, // 'Comitê' | 'Aprovado' | 'Emitido'
): Promise<KpiResultado> {
  const { data, error } = await supabase
    .from('operacoes')
    .select('lmg, premio_previsto')
    .eq('status', status)
    .eq('ativo', true)

  if (error) throw error

  const rows = data ?? []
  const lmgTotal = rows.reduce((s, op) => s + Math.min(op.lmg ?? 0, CAP_LMG), 0)
  const premioTotal = rows.reduce((s, op) => s + (op.premio_previsto ?? 0), 0)
  return { count: rows.length, lmgTotal, premioTotal }
}
