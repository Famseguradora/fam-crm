// ============================================================================
//  GET /api/axi/kpis — os números canônicos da FAM
//
//  Por que esta rota existe, e por que o AxiMobius deve preferi-la a somar por
//  conta própria: as fórmulas da FAM têm pegadinhas que só quem leu o código
//  sabe. O LMG tem teto de R$ 80 Mi. A vigência é armazenada na unidade de
//  `periodicidade_vigencia` (22 com "Meses" são 22 meses, não 22 anos). A Taxa
//  Média Ponderada leva fator de prazo; a Mensal, não.
//
//  Reimplementar isso do outro lado é garantir que um dia o AxiMobius e o
//  cockpit mostrem taxas diferentes para o mesmo mês, e ninguém saiba qual
//  está certa. Aqui os números saem de lib/corretoras/agregacoes.ts, que é o
//  MESMO módulo que o cockpit de Corretoras e a tela de Operações usam.
//
//  Os dados brutos continuam disponíveis em /api/axi/dados: para modelo
//  preditivo e cruzamento livre, use-os. Para "quanto foi o prêmio de julho",
//  use esta rota, para bater com a tela que o Diretor vê.
// ============================================================================
import { autorizar, clienteLeitura, erroJson, CABECALHOS } from '@/lib/axi/core'
import {
  kpisDeOperacoes, agregarPorCorretora, comParticipacao, comPareto,
  serieMensalPremioTaxa, rankingTomadores, distribuicaoPorStatus,
  taxaMediaPonderada, taxaMediaMensal,
  TAXA_PONDERADA_INFO, TAXA_MENSAL_INFO,
  type OpAgg, type TomAgg, type CorAgg,
} from '@/lib/corretoras/agregacoes'
import type { StatusFluxo } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Mês de referência da operação: a mesma regra de `evolucaoMensal`. */
function mesRef(o: OpAgg): string | null {
  const iso = o.data_emissao || o.data_entrada
  if (!iso) return null
  const mes = String(iso).slice(0, 7)
  return /^\d{4}-\d{2}$/.test(mes) ? mes : null
}

export async function GET(request: Request) {
  const auth = autorizar(request)
  if (!auth.ok) return erroJson(auth.erro, auth.status)

  const { searchParams } = new URL(request.url)
  const de = searchParams.get('de')      // YYYY-MM inclusive
  const ate = searchParams.get('ate')    // YYYY-MM inclusive
  const statusFiltro = searchParams.get('status')

  // O cockpit de Corretoras carrega operações com `.eq('ativo', true)`
  // (components/corretoras/PainelGerencial.tsx). Esta rota tem que aplicar o
  // MESMO recorte, senão no dia em que alguém inativar uma operação a API passa
  // a divergir da tela do Diretor sem nenhum sinal. Hoje as 200 estão ativas, o
  // que faz os números baterem por acaso — é justamente o tipo de coincidência
  // que esconde o defeito até o pior momento.
  const incluirInativas = searchParams.get('incluir_inativas') === 'true'

  for (const [rotulo, v] of [['de', de], ['ate', ate]] as const) {
    if (v && !/^\d{4}-\d{2}$/.test(v)) {
      return erroJson(`Parâmetro "${rotulo}" deve ser YYYY-MM (ex.: 2026-07). Recebido: ${v}`, 400)
    }
  }

  const supabase = clienteLeitura()

  // 200 operações e 447 tomadores cabem folgadamente numa tirada só; o limite
  // explícito existe para o dia em que não couberem, e aí o corte aparece no
  // `aviso` abaixo em vez de virar um número silenciosamente errado.
  const TETO = 5000
  const queryOps = supabase.from('operacoes').select('*').limit(TETO)
  if (!incluirInativas) queryOps.eq('ativo', true)

  const [rOps, rToms, rCors, rStatus] = await Promise.all([
    queryOps,
    supabase.from('tomadores').select('id,razao_social,nome_fantasia,corretora_id,status').limit(TETO),
    supabase.from('corretoras').select('id,razao_social,nome_fantasia,status').limit(TETO),
    supabase.from('status_fluxo_operacao').select('nome,cor,ordem,ativo').order('ordem'),
  ])

  const falha = [rOps, rToms, rCors, rStatus].find((r) => r.error)
  if (falha?.error) {
    console.error('[axi/kpis] falha ao carregar base:', falha.error.message)
    return erroJson(`Falha ao carregar a base: ${falha.error.message}`, 500)
  }

  const todasOps = (rOps.data ?? []) as unknown as OpAgg[]
  const tomadores = (rToms.data ?? []) as unknown as TomAgg[]
  const corretoras = (rCors.data ?? []) as unknown as CorAgg[]
  const statusFluxo = (rStatus.data ?? []) as unknown as StatusFluxo[]

  // Filtro de período pela MESMA definição de mês do cockpit.
  let ops = todasOps
  if (de || ate) {
    ops = ops.filter((o) => {
      const m = mesRef(o)
      if (!m) return false
      if (de && m < de) return false
      if (ate && m > ate) return false
      return true
    })
  }
  if (statusFiltro) ops = ops.filter((o) => o.status === statusFiltro)

  const kpis = kpisDeOperacoes(ops)
  const porCorretora = comPareto(comParticipacao(agregarPorCorretora(corretoras, tomadores, ops)))

  return Response.json(
    {
      ok: true,
      gerado_em: new Date().toISOString(),
      filtro: {
        de, ate, status: statusFiltro,
        somente_ativas: !incluirInativas,
        operacoes_no_filtro: ops.length,
        operacoes_na_base: todasOps.length,
      },

      paridade: incluirInativas
        ? 'ATENÇÃO: incluir_inativas=true. Estes números NÃO batem com o cockpit de Corretoras, que só considera operações ativas.'
        : 'Recorte idêntico ao do cockpit de Corretoras (somente operações ativas).',

      // Estes cinco números batem, dígito a dígito, com o cockpit de Corretoras.
      carteira: {
        n_operacoes: kpis.nOperacoes,
        premio_total: kpis.premioTotal,
        lmg_total: kpis.lmgTotal,
        ticket_medio: kpis.ticketMedio,
        taxa_media_ponderada: kpis.taxaMediaPond,
        taxa_media_mensal: taxaMediaMensal(ops),
      },

      // O racional das taxas, para o AxiMobius poder EXIBIR a explicação em vez
      // de reescrevê-la (e reescrever errado).
      racional: {
        ponderada: TAXA_PONDERADA_INFO,
        mensal: TAXA_MENSAL_INFO,
      },

      serie_mensal: serieMensalPremioTaxa(ops),
      distribuicao_status: distribuicaoPorStatus(ops, statusFluxo),

      ranking_corretoras: porCorretora.map((c) => ({
        id: c.id, nome: c.nome, ativa: c.ativa,
        n_operacoes: c.nOperacoes, n_tomadores: c.nTomadores,
        premio_total: c.premioTotal, lmg_total: c.lmgTotal,
        ticket_medio: c.ticketMedio, taxa_media_ponderada: c.taxaMediaPond,
        participacao_pct: c.participacaoPct ?? null,
        acumulado_pct: c.acumuladoPct ?? null,
      })),

      ranking_tomadores: rankingTomadores(tomadores, ops),

      aviso: todasOps.length >= TETO
        ? `A base atingiu o teto de ${TETO} operações lidas por requisição. Os números acima estão INCOMPLETOS. Ajuste o TETO em app/api/axi/kpis/route.ts.`
        : null,

      fonte: 'lib/corretoras/agregacoes.ts — o mesmo módulo do cockpit de Corretoras e da tela de Operações.',
    },
    { headers: CABECALHOS },
  )
}
