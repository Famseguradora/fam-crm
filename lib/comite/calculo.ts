// ============================================================================
//  Comitê — Fórmulas do Cálculo e do Resultado
//  Puro (sem React, sem Supabase). Fonte ÚNICA para a aba "📐 Cálculo" /
//  "📊 Resultado" do CRM e para a cédula de votação do celular — se um dia os
//  dois divergirem, um diretor vota num número e o subscritor vê outro.
//  Extraído de app/(dashboard)/operacoes/page.tsx (anosVig/sufVig + as
//  derivações do card expandido do Comitê).
// ============================================================================

export interface VigenciaLike {
  vigencia_dias?: number | null
  vigencia_anos?: number | null
  periodicidade_vigencia?: string | null
}

// Anos-equivalente de uma operação (para cálculos que pensam em anos),
// tolerante a dados antigos. `vigencia_dias` tem precedência.
export function anosVig(op: VigenciaLike): number {
  if (op.vigencia_dias != null) return op.vigencia_dias / 365
  const v = op.vigencia_anos ?? 1
  const p = op.periodicidade_vigencia
  if (p === 'Meses') return v / 12
  if (p === 'Dias' || p === 'Data') return v / 365
  return v
}

// Sufixo curto da unidade de vigência (para tabelas/PDF).
export function sufVig(p: string | null | undefined): string {
  if (p === 'Meses') return 'm'
  if (p === 'Dias' || p === 'Data') return 'd'
  return 'a'
}

// Unidade da vigência já com singular/plural certo ("1 ano", "28 meses",
// "1 dia"). Para valores ≠ 1 devolve exatamente o rótulo antigo (em minúsculas),
// então não muda nada dos casos comuns — só corrige o singular.
//
// 'Data' significa que o usuário informou a data FINAL da vigência, e o que o
// banco guarda em `vigencia_anos` é o número de DIAS (conferido: em todas as 24
// operações com essa periodicidade, vigencia_anos == vigencia_dias). Antes,
// o fallback devolvia o próprio rótulo e a tela mostrava "1983 data".
function unidadeVig(periodicidade: string | null | undefined, valor: number): string {
  const p = periodicidade ?? 'Anos'
  const uno = valor === 1
  if (p === 'Anos') return uno ? 'ano' : 'anos'
  if (p === 'Meses') return uno ? 'mês' : 'meses'
  if (p === 'Dias' || p === 'Data') return uno ? 'dia' : 'dias'
  // Periodicidade fora do padrão: mantém o rótulo original em minúsculas.
  return p.toLowerCase()
}

// Número da vigência em pt-BR, sem casas decimais inúteis: 2 → "2",
// 0.3 → "0,3". Antes saía "0.3 anos", com ponto, num relatório em português.
// useGrouping:false de propósito — com separador de milhar, "1729 dias" viraria
// "1.729 dias" e mudaria o texto que a cédula e o WhatsApp já mostram hoje.
function numeroVig(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: false })
}

// Vigência por extenso, como aparece na aba "Dados" do Comitê.
// ATENÇÃO: aqui `vigencia_anos` tem precedência — regra DIFERENTE de anosVig().
// FONTE ÚNICA: usada pela aba "Dados" (OperacaoDados.tsx), pela cédula pública,
// pelo convite do WhatsApp e pelo relatório gerencial de "KPIs por Mês" — todos
// precisam mostrar o mesmo texto.
export function vigenciaTxt(op: VigenciaLike): string {
  if (op.vigencia_anos != null) {
    const v = Number(op.vigencia_anos)
    return `${numeroVig(v)} ${unidadeVig(op.periodicidade_vigencia, v)}`
  }
  if (op.vigencia_dias != null) return `${op.vigencia_dias} ${op.vigencia_dias === 1 ? 'dia' : 'dias'}`
  return '—'
}

// Comissão padrão do simulador de cenário no CRM.
export const COMISSAO_PADRAO = 25

export interface CenarioEntrada {
  lmg: number
  taxa: number          // em % (ex.: 0.84)
  anos: number
  comissaoPct: number   // em %
}

export interface Cenario {
  premio: number
  comissao: number
  liquidoFAM: number
  taxaLiquida: number   // em %
}

// Prêmio de um cenário: LMG × taxa × anos. SEM o teto de 80 mi — o teto existe
// só no agregado do book (lib/financeiro/analise.mjs), não na operação.
export function calcularCenario({ lmg, taxa, anos, comissaoPct }: CenarioEntrada): Cenario {
  const premio = lmg * (taxa / 100) * anos
  const comissao = premio * (comissaoPct / 100)
  return {
    premio,
    comissao,
    liquidoFAM: premio - comissao,
    taxaLiquida: taxa * (1 - comissaoPct / 100),
  }
}

export interface ImpactoMeta {
  meta: number
  realizado: number
  pctAtual: number       // realizado / meta
  pctNovo: number        // (realizado + prêmio) / meta
  pctOperacao: number    // prêmio / meta — quanto esta operação representa
  novoPatamar: number
  gap: number            // quanto falta DEPOIS desta operação
  opsParaFechar: number  // gap / ticket médio
}

// Impacto da operação sobre uma meta (mensal ou anual). Espelha as derivações
// pMAt/pMNv/cMes/gapM/nOps de operacoes/page.tsx.
export function calcularImpacto(
  meta: number,
  realizado: number,
  premio: number,
  ticketMedio: number,
): ImpactoMeta {
  const pctAtual = meta > 0 ? (realizado / meta) * 100 : 0
  const pctNovo = meta > 0 ? ((realizado + premio) / meta) * 100 : 0
  const pctOperacao = meta > 0 ? (premio / meta) * 100 : 0
  const gap = meta > 0 ? Math.max(0, meta - realizado - premio) : 0
  return {
    meta,
    realizado,
    pctAtual,
    pctNovo,
    pctOperacao,
    novoPatamar: realizado + premio,
    gap,
    opsParaFechar: ticketMedio > 0 && gap > 0 ? Math.ceil(gap / ticketMedio) : 0,
  }
}
