// ============================================================================
//  GET /api/axi/historico — a trilha temporal do CRM
//
//  É a rota mais importante da integração: sem ela o AxiMobius só enxerga o
//  estado de agora, e "análise preditiva" sobre uma foto estática não existe.
//  Aqui ele recebe cada campo que mudou, quando, de quanto para quanto e por
//  quem, desde 02/06/2026.
//
//  Pagina por `apos_id` (keyset) e não por offset: a tabela só cresce, e com
//  offset uma inserção durante a varredura desloca a janela e faz uma linha
//  ser pulada. Com keyset, o que já passou não se move.
// ============================================================================
import { autorizar, clienteLeitura, lerLimite, lerDesde, erroJson, CABECALHOS } from '@/lib/axi/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = autorizar(request)
  if (!auth.ok) return erroJson(auth.erro, auth.status)

  const { searchParams } = new URL(request.url)

  const desde = lerDesde(searchParams)
  if (!desde.ok) return erroJson(desde.erro, 400)

  const limite = lerLimite(searchParams)
  const aposId = Number(searchParams.get('apos_id') ?? 0) || 0
  const tabela = searchParams.get('tabela')
  const campo = searchParams.get('campo')
  const registroId = searchParams.get('registro_id')

  const supabase = clienteLeitura()

  let q = supabase
    .from('fam_historico')
    .select('*', { count: 'exact' })
    .gt('id', aposId)
    .order('id', { ascending: true })
    .limit(limite)

  if (desde.valor) q = q.gt('mudou_em', desde.valor)
  if (tabela) q = q.eq('tabela', tabela)
  if (campo) q = q.eq('campo', campo)
  if (registroId) q = q.eq('registro_id', registroId)

  const { data, error, count } = await q

  if (error) {
    console.error('[axi/historico] falha:', error.message)
    return erroJson(`Falha ao ler o histórico: ${error.message}`, 500)
  }

  const linhas = data ?? []
  const ultimo = linhas.length > 0 ? (linhas[linhas.length - 1] as { id: number }).id : null

  return Response.json(
    {
      ok: true,
      filtros: { desde: desde.valor, tabela, campo, registro_id: registroId },
      total_no_filtro: count ?? 0,
      retornadas: linhas.length,
      // Passe este valor como `apos_id` na próxima chamada. Null = acabou.
      proximo_apos_id: linhas.length === limite ? ultimo : null,
      dados: linhas,
    },
    { headers: CABECALHOS },
  )
}
