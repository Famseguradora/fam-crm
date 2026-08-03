// ============================================================================
//  GET /api/axi/schema — o contrato, servido pelo próprio sistema
//
//  Existe para que o AxiMobius descubra o CRM sozinho, em vez de depender de
//  um documento que envelhece. Traz tabelas, colunas reais lidas do Postgres,
//  contagem de linhas e as regras de negócio que não estão no schema (o teto
//  de R$ 80 Mi, a unidade da vigência) mas sem as quais os números saem errados.
// ============================================================================
import { autorizar, clienteLeitura, TABELAS, VIEWS, ENRIQUECIMENTO, erroJson, CABECALHOS } from '@/lib/axi/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = autorizar(request)
  if (!auth.ok) return erroJson(auth.erro, auth.status)

  const supabase = clienteLeitura()

  // Colunas verdadeiras, lidas do catálogo do Postgres. Se alguém adicionar um
  // campo no CRM amanhã, ele aparece aqui sem ninguém editar código.
  const { data: colunas, error: erroCol } = await supabase.rpc('axi_colunas')

  // Contagem por tabela, para o outro lado dimensionar a paginação.
  const contagens: Record<string, number | null> = {}
  await Promise.all(
    TABELAS.map(async (t) => {
      const { count } = await supabase.from(t.nome).select('*', { count: 'exact', head: true })
      contagens[t.nome] = count ?? null
    }),
  )

  return Response.json(
    {
      ok: true,
      sistema: 'FAM CRM',
      papel: 'Fonte de verdade. Somente leitura para o AxiMobius.',
      gerado_em: new Date().toISOString(),

      tabelas: TABELAS.map((t) => ({
        ...t,
        linhas: contagens[t.nome] ?? null,
        colunas: erroCol
          ? null
          : (colunas as { tabela: string; coluna: string; tipo: string }[] | null)
              ?.filter((c) => c.tabela === t.nome)
              .map((c) => ({ nome: c.coluna, tipo: c.tipo })) ?? null,
        // Campos que /dados acrescenta e que NÃO aparecem em `colunas` acima,
        // porque não existem na tabela: são o nome por trás de cada FK.
        campos_resolvidos: (ENRIQUECIMENTO[t.nome] ?? []).flatMap((r) =>
          Object.values(r.campos).map((campo) => ({ campo, a_partir_de: `${r.fk} → ${r.origem}` })),
        ),
      })),

      resolucao_de_chaves: {
        texto:
          'GET /api/axi/dados resolve as chaves estrangeiras antes de responder. Um tomador vem com ' +
          'corretora_id (UUID) E TAMBÉM com corretora_razao_social. NÃO conclua "sem corretora" a partir ' +
          'da ausência de um campo de nome no seu lado: use corretora_id IS NULL, que é o único critério ' +
          'correto. Em 02/08/2026 os 448 tomadores e as 200 operações do CRM tinham corretora preenchida.',
        campos_sempre_presentes:
          'Os campos resolvidos são sempre escritos, inclusive como null quando a FK é nula. ' +
          'Campo ausente na resposta significa defeito, não dado vazio.',
        se_for_juntar_por_conta_propria:
          'Ao sincronizar corretoras, produtos ou status_fluxo_*, faça CARGA COMPLETA (sem "desde"). ' +
          'São tabelas pequenas e quase estáticas: só 11 das 93 corretoras mudaram nos últimos 30 dias. ' +
          'Sincronizá-las por delta deixa a sua cópia local quase vazia e o seu join falha para quase ' +
          'todo tomador, o que parece "faltando dado no CRM" e não é.',
      },

      views_analiticas: {
        aviso:
          'Estas views existem no schema `axi` do Postgres, mas NÃO são alcançáveis por esta API: ' +
          '/api/axi/dados só serve as tabelas listadas em `tabelas`. Elas só valem por SQL direto com ' +
          'a role aximobius_ro. O que elas resolveriam de mais útil (o nome por trás das FKs) o /dados ' +
          'já entrega, com os MESMOS nomes de campo.',
        lista: VIEWS,
      },

      // O que o schema sozinho não conta, e sem o que a análise sai errada.
      regras_de_negocio: {
        teto_lmg: {
          valor: 80_000_000,
          texto: 'O LMG entra em qualquer cálculo limitado a R$ 80 Mi por operação. A coluna operacoes.lmg guarda o valor REAL cadastrado, sem teto; quem aplica o teto é a fórmula. premio_previsto já nasce com o teto aplicado (é coluna gerada no banco).',
        },
        vigencia: {
          texto: 'ATENÇÃO: vigencia_anos guarda o número NA UNIDADE de periodicidade_vigencia. Se periodicidade_vigencia = "Meses", vigencia_anos = 22 significa 22 MESES, não 22 anos. Prefira sempre vigencia_dias quando não for nulo. Converter errado inflou o prazo de 29% da carteira num bug já corrigido no CRM.',
          conversao: 'anos = vigencia_dias/365; senão Meses ? v/12 : (Dias|Data) ? v/365 : v',
        },
        taxa_media: {
          texto: 'NÃO recalcule a Taxa Média por conta própria. Use GET /api/axi/kpis, que roda a fórmula canônica de lib/corretoras/agregacoes.ts, a mesma do cockpit de Corretoras e da tela de Operações. Duas implementações da mesma fórmula divergem, e aí o AxiMobius e o CRM mostram números diferentes para o mesmo mês.',
          ponderada: 'Σ(taxa × mín(lmg,80M) × mín(anosVigência,1)) ÷ Σ mín(lmg,80M)',
          mensal: 'Σ(taxa × mín(lmg,80M)) ÷ Σ mín(lmg,80M) — sem fator de prazo, regime de competência',
        },
        historico: {
          texto: 'fam_historico é gravada por trigger no BANCO desde 01/08/2026, e foi semeada com o audit_log a partir de 02/06/2026. Uma linha POR CAMPO alterado. Para funil, filtre campo = "status".',
        },
      },

      endpoints: {
        'GET /api/axi/schema': 'Este contrato.',
        'GET /api/axi/dados?tabela=&desde=&cursor=&limite=': 'Linhas de uma tabela. Sem "desde" = carga completa; com "desde" = só o que mudou.',
        'GET /api/axi/historico?desde=&tabela=&campo=&apos_id=&limite=': 'Trilha temporal campo a campo.',
        'GET /api/axi/kpis?de=&ate=': 'KPIs canônicos calculados pelo mesmo código das telas do CRM.',
      },
    },
    { headers: CABECALHOS },
  )
}
