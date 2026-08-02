// ============================================================================
//  GET /api/axi/dados — o cavalo de carga da integração
//
//  Um endpoint serve os dois modos porque são a mesma consulta:
//    . sem `desde`  → carga completa daquela tabela (primeira sincronização)
//    . com `desde`  → só o que mudou (sincronização incremental)
//
//  Sempre paginado. O PostgREST corta em 1.000 linhas por padrão, então
//  devolver "tudo" numa tirada só daria silenciosamente um resultado
//  truncado — o pior tipo de defeito, porque parece sucesso.
// ============================================================================
import {
  autorizar, clienteLeitura, acharTabela, TABELAS,
  lerLimite, lerDesde, erroJson, CABECALHOS,
} from '@/lib/axi/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = autorizar(request)
  if (!auth.ok) return erroJson(auth.erro, auth.status)

  const { searchParams } = new URL(request.url)

  const nome = searchParams.get('tabela')
  const tabela = acharTabela(nome)
  if (!tabela) {
    return erroJson(
      `Tabela "${nome ?? ''}" não é exposta. Disponíveis: ${TABELAS.map((t) => t.nome).join(', ')}`,
      400,
    )
  }

  const desde = lerDesde(searchParams)
  if (!desde.ok) return erroJson(desde.erro, 400)

  if (desde.valor && !tabela.colunaDelta) {
    return erroJson(
      `A tabela "${tabela.nome}" não tem coluna de atualização, então não suporta "desde". ` +
      `Busque-a inteira (ela é pequena) ou use /api/axi/historico para detectar mudanças nela.`,
      400,
    )
  }

  const limite = lerLimite(searchParams)
  const cursor = Math.max(0, Number(searchParams.get('cursor') ?? 0) || 0)

  const supabase = clienteLeitura()

  // A ordenação TEM que ser pela mesma coluna do filtro no modo delta. Ordenar
  // por `created_at` enquanto se filtra por `updated_at` faz a última linha da
  // página não ser a mais recente, e a marca d'água sai menor que o real — o
  // cliente então pularia tudo que ficou entre a marca falsa e a verdadeira.
  const ordem = desde.valor && tabela.colunaDelta ? tabela.colunaDelta : tabela.ordenarPor

  let q = supabase
    .from(tabela.nome)
    .select('*', { count: 'exact' })
    .order(ordem, { ascending: true })
    // Desempate estável: sem ele, linhas com o mesmo carimbo podem trocar de
    // ordem entre páginas e uma delas some do resultado paginado.
    .order('id', { ascending: true })
    .range(cursor, cursor + limite - 1)

  if (desde.valor && tabela.colunaDelta) {
    // `gt` e não `gte`: o cliente guarda o carimbo da última linha recebida,
    // então `gte` reentregaria essa linha em toda sincronização.
    q = q.gt(tabela.colunaDelta, desde.valor)
  }

  const { data, error, count } = await q

  if (error) {
    console.error('[axi/dados] falha ao ler', tabela.nome, error.message)
    return erroJson(`Falha ao ler ${tabela.nome}: ${error.message}`, 500)
  }

  const linhas = data ?? []
  const total = count ?? 0
  const proximo = cursor + linhas.length
  const acabou = proximo >= total

  return Response.json(
    {
      ok: true,
      tabela: tabela.nome,
      modo: desde.valor ? 'delta' : 'completo',
      desde: desde.valor,
      // `total` é o total do FILTRO, não da tabela: com `desde`, é quanto mudou.
      total,
      retornadas: linhas.length,
      cursor,
      proximo_cursor: acabou ? null : proximo,
      // Carimbo para a próxima sincronização. Vem da última linha desta página,
      // então só é seguro guardar quando `proximo_cursor` for null.
      marca_dagua: tabela.colunaDelta && linhas.length > 0
        ? (linhas[linhas.length - 1] as Record<string, unknown>)[tabela.colunaDelta] ?? null
        : null,
      dados: linhas,
    },
    { headers: CABECALHOS },
  )
}
