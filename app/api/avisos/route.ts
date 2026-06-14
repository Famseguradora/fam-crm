import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Sempre dinâmico: lê a sessão pelo cookie e precisa refletir na hora os avisos
// que acabaram de expirar / ser criados / ligados-desligados.
export const dynamic = 'force-dynamic'

interface AvisoBanner {
  id: string
  mensagem: string
  tipo: 'parabens' | 'info' | 'alerta'
}

export async function GET() {
  try {
    const supabase = await createClient()
    // RLS (SELECT) já restringe a usuários autenticados. Aqui filtramos só o que
    // deve passar no banner: ativo e ainda dentro do prazo.
    const { data, error } = await supabase
      .from('avisos')
      .select('id, mensagem, tipo')
      .eq('ativo', true)
      .gt('expira_em', new Date().toISOString())
      .order('criado_em', { ascending: false })

    if (error) return NextResponse.json({ avisos: [] as AvisoBanner[] })
    return NextResponse.json({ avisos: (data ?? []) as AvisoBanner[] })
  } catch {
    return NextResponse.json({ avisos: [] as AvisoBanner[] })
  }
}
