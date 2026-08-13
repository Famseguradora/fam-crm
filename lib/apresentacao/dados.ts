// ============================================================
//  Dados da Apresentação Executiva.
//
//  Uma leitura só do banco, na hora em que a tela abre e a cada vez que se
//  exporta. NADA aqui é fixo no código: se uma operação for emitida durante a
//  reunião, o próximo export já sai com ela.
//
//  Todo número passa pelas FONTES ÚNICAS do CRM:
//   - taxaMediaMensal / taxaMediaPonderada → lib/corretoras/agregacoes.ts
//   - premioMensalizado                    → lib/operacoes/premio-vigencia.ts
//   - CAP_LMG (teto de R$ 80 Mi por op)    → lib/operacoes/kpis.ts
//  Assim a apresentação bate com o Dashboard, com Operações e com KPIs por Mês.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { CAP_LMG } from '@/lib/operacoes/kpis'
import { taxaMediaMensal, taxaMediaPonderada, type OpTaxaLike } from '@/lib/corretoras/agregacoes'
import { premioMensalizado, type OpPremioLike } from '@/lib/operacoes/premio-vigencia'

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function mesLabel(key: string): string {
  const [yyyy, mm] = key.split('-')
  return `${MESES_PT[parseInt(mm, 10) - 1]}/${yyyy.slice(2)}`
}

export type OpApres = OpTaxaLike & OpPremioLike & {
  id: string
  status: string
  data_emissao: string | null
  data_entrada: string | null
  premio_previsto: number | null
  modalidade: string | null
  tomador_id: string | null
  corretora_id: string | null
  tomador: { razao_social: string | null } | null
  corretora: { razao_social: string | null; nome_fantasia: string | null } | null
}

const capLmg = (l: number | null | undefined) => Math.min(Number(l) || 0, CAP_LMG)

export interface KpisBloco {
  qtd: number
  lmg: number
  premio: number
  premioMes: number
  taxaMedia: number
  taxaPonderada: number
  ticketMedio: number
  nTomadores: number
  nCorretoras: number
}

function kpisDe(ops: OpApres[]): KpisBloco {
  const premio = ops.reduce((s, o) => s + (Number(o.premio_previsto) || 0), 0)
  return {
    qtd: ops.length,
    lmg: ops.reduce((s, o) => s + capLmg(o.lmg), 0),
    premio,
    premioMes: premioMensalizado(ops),
    taxaMedia: taxaMediaMensal(ops),
    taxaPonderada: taxaMediaPonderada(ops),
    ticketMedio: ops.length > 0 ? premio / ops.length : 0,
    nTomadores: new Set(ops.map(o => o.tomador_id).filter(Boolean)).size,
    nCorretoras: new Set(ops.map(o => o.corretora_id).filter(Boolean)).size,
  }
}

export interface LinhaMes {
  mesKey: string
  mesLabel: string
  qtd: number
  lmg: number
  premio: number
  premioMes: number
  taxaMedia: number
}

export interface LinhaFunil {
  status: string
  ordem: number
  cor: string
  qtd: number
  lmg: number
  premio: number
}

export interface LinhaRanking {
  nome: string
  qtd: number
  premio: number
  lmg: number
  pct: number // fração 0..1 do prêmio
}

export interface DadosApresentacao {
  geradoEm: Date
  ano: string
  anosDisponiveis: string[]
  // Base cadastral (posição de HOJE, não do ano).
  baseTomadores: number
  baseCorretoras: number
  // Emissões do ano escolhido.
  emitidas: KpisBloco
  meses: LinhaMes[]
  // Esteira inteira (posição de hoje: "Para Analisar" não tem data de emissão).
  funil: LinhaFunil[]
  totalEsteira: number
  decididas: number
  recusadas: number
  perdidas: number
  pipeline: KpisBloco       // Aprovado, aguardando emissão
  emAnalise: KpisBloco      // Para Analisar + Em Análise + Minuta + Comitê
  // Rankings do ano (sobre as emitidas).
  corretoras: LinhaRanking[]
  modalidades: LinhaRanking[]
}

// Ordena por prêmio e calcula a participação de cada linha.
function ranquear(mapa: Map<string, OpApres[]>, totalPremio: number): LinhaRanking[] {
  return [...mapa.entries()]
    .map(([nome, ops]) => {
      const premio = ops.reduce((s, o) => s + (Number(o.premio_previsto) || 0), 0)
      return {
        nome,
        qtd: ops.length,
        premio,
        lmg: ops.reduce((s, o) => s + capLmg(o.lmg), 0),
        pct: totalPremio > 0 ? premio / totalPremio : 0,
      }
    })
    .sort((a, b) => b.premio - a.premio)
}

export async function carregarDadosApresentacao(
  supabase: SupabaseClient,
  anoPedido?: string,
): Promise<DadosApresentacao> {
  const [resOps, resTom, resCor, resStatus] = await Promise.all([
    supabase
      .from('operacoes')
      .select(`
        id, status, data_emissao, data_entrada, lmg, premio_previsto, taxa, modalidade,
        vigencia_dias, vigencia_anos, periodicidade_vigencia, tomador_id, corretora_id,
        tomador:tomadores(razao_social),
        corretora:corretoras(razao_social, nome_fantasia)
      `)
      .eq('ativo', true),
    supabase.from('tomadores').select('id', { count: 'exact', head: true }),
    supabase.from('corretoras').select('id', { count: 'exact', head: true }),
    supabase.from('status_fluxo_operacao').select('nome, ordem, cor').order('ordem'),
  ])

  if (resOps.error) throw resOps.error
  const ops = (resOps.data ?? []) as unknown as OpApres[]

  const emitidasTodas = ops.filter(o => o.status === 'Emitido' && o.data_emissao)
  const anosDisponiveis = [...new Set(emitidasTodas.map(o => (o.data_emissao ?? '').substring(0, 4)))]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))
  const ano = anoPedido && anosDisponiveis.includes(anoPedido)
    ? anoPedido
    : (anosDisponiveis[0] ?? String(new Date().getFullYear()))

  const doAno = emitidasTodas.filter(o => (o.data_emissao ?? '').startsWith(ano))

  // Meses do ano, em ordem cronológica.
  const porMes = new Map<string, OpApres[]>()
  for (const o of doAno) {
    const k = (o.data_emissao ?? '').substring(0, 7)
    porMes.set(k, [...(porMes.get(k) ?? []), o])
  }
  const meses: LinhaMes[] = [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mesKey, lista]) => ({
      mesKey,
      mesLabel: mesLabel(mesKey),
      qtd: lista.length,
      lmg: lista.reduce((s, o) => s + capLmg(o.lmg), 0),
      premio: lista.reduce((s, o) => s + (Number(o.premio_previsto) || 0), 0),
      premioMes: premioMensalizado(lista),
      taxaMedia: taxaMediaMensal(lista),
    }))

  // Funil: posição de hoje da esteira inteira.
  const metaStatus = new Map<string, { ordem: number; cor: string }>()
  for (const s of (resStatus.data ?? []) as { nome: string; ordem: number; cor: string }[]) {
    metaStatus.set(s.nome, { ordem: s.ordem, cor: s.cor })
  }
  const porStatus = new Map<string, OpApres[]>()
  for (const o of ops) porStatus.set(o.status, [...(porStatus.get(o.status) ?? []), o])

  const funil: LinhaFunil[] = [...porStatus.entries()]
    .map(([status, lista]) => ({
      status,
      ordem: metaStatus.get(status)?.ordem ?? 99,
      cor: metaStatus.get(status)?.cor ?? '#6080a0',
      qtd: lista.length,
      lmg: lista.reduce((s, o) => s + capLmg(o.lmg), 0),
      premio: lista.reduce((s, o) => s + (Number(o.premio_previsto) || 0), 0),
    }))
    .sort((a, b) => a.ordem - b.ordem)

  const qtdDe = (...sts: string[]) => ops.filter(o => sts.includes(o.status)).length
  const recusadas = qtdDe('Recusado')
  const perdidas = qtdDe('Perdido')

  // Rankings do ano, sobre o prêmio emitido.
  const premioAno = doAno.reduce((s, o) => s + (Number(o.premio_previsto) || 0), 0)
  const porCorretora = new Map<string, OpApres[]>()
  for (const o of doAno) {
    const nome = (o.corretora?.nome_fantasia || o.corretora?.razao_social)?.trim() || 'Sem corretora'
    porCorretora.set(nome, [...(porCorretora.get(nome) ?? []), o])
  }
  const porModalidade = new Map<string, OpApres[]>()
  for (const o of doAno) {
    const nome = o.modalidade?.trim() || 'Sem modalidade'
    porModalidade.set(nome, [...(porModalidade.get(nome) ?? []), o])
  }

  return {
    geradoEm: new Date(),
    ano,
    anosDisponiveis,
    baseTomadores: resTom.count ?? 0,
    baseCorretoras: resCor.count ?? 0,
    emitidas: kpisDe(doAno),
    meses,
    funil,
    totalEsteira: ops.length,
    decididas: qtdDe('Emitido', 'Recusado', 'Perdido'),
    recusadas,
    perdidas,
    pipeline: kpisDe(ops.filter(o => o.status === 'Aprovado')),
    emAnalise: kpisDe(ops.filter(o => ['Para Analisar', 'Em Análise', 'Minuta Enviada para Corretor', 'Comitê'].includes(o.status))),
    corretoras: ranquear(porCorretora, premioAno),
    modalidades: ranquear(porModalidade, premioAno),
  }
}
