// ============================================================
//  ⭐ FONTE ÚNICA do "Prêmio por Mês de Vigência".
//
//  O CRM lança o prêmio INTEIRO da apólice no mês da emissão
//  (premio_previsto é coluna GENERATED, calculada uma vez). Isso é correto
//  para caixa, mas distorce a leitura de performance mensal: uma apólice de
//  5 anos emitida em junho faz junho parecer um mês excepcional.
//
//  Caso real que motivou o módulo (posição de 13/08/2026): a apólice da
//  Nfe Power Latam, emitida em 26/06/2026 com 1.983 dias de vigência,
//  responde sozinha por R$ 5,70 Mi dos R$ 5,86 Mi de junho, 72% do prêmio
//  emitido do ano inteiro.
//
//  Aqui o prêmio é diluído pela vigência: quanto daquela apólice entra em
//  CADA mês em que ela está vigente. É a leitura de performance, e anda
//  SEMPRE ao lado do prêmio de emissão, nunca no lugar dele.
//
//  Usado por: "KPIs por Mês" e pela Apresentação Executiva. As duas telas
//  importam daqui para que o número bate onde quer que o sócio olhe.
// ============================================================
import { anosVigencia, type OpAgg } from '@/lib/corretoras/agregacoes'

// Meses por ano, na mesma base de 365 dias que anosVigencia() usa.
// Manter 365/12 (e não 30,44) é o que faz este módulo bater com a taxa
// média ponderada, que divide os dias de vigência por 365.
const MESES_POR_ANO = 12

// Campos mínimos para diluir o prêmio pela vigência.
export type OpPremioLike = Pick<
  OpAgg,
  'premio_previsto' | 'vigencia_dias' | 'vigencia_anos' | 'periodicidade_vigencia'
>

// Prêmio que entra em UM mês de vigência desta operação.
// Operação sem vigência utilizável cai para o prêmio cheio (1 mês), que é o
// comportamento conservador: nunca infla o número mensal.
export function premioPorMesDeVigencia(o: OpPremioLike): number {
  const premio = Number(o.premio_previsto) || 0
  if (premio === 0) return 0
  const meses = anosVigencia(o) * MESES_POR_ANO
  if (!Number.isFinite(meses) || meses <= 0) return premio
  return premio / meses
}

// Soma do prêmio mensalizado de um conjunto de operações. Somando as
// operações emitidas EM um mês, dá o quanto aquela safra passou a render
// por mês; somando o ano todo, dá o run-rate acumulado da carteira.
export function premioMensalizado(ops: OpPremioLike[]): number {
  return ops.reduce((s, o) => s + premioPorMesDeVigencia(o), 0)
}

// Vigência média em meses de um conjunto (contexto para o racional).
export function vigenciaMediaMeses(ops: OpPremioLike[]): number {
  if (ops.length === 0) return 0
  const soma = ops.reduce((s, o) => s + anosVigencia(o) * MESES_POR_ANO, 0)
  return soma / ops.length
}

// Explicação exibida no ⓘ, no mesmo formato de TAXA_MENSAL_INFO
// (consumido pelo componente RacionalTaxaBox).
export const PREMIO_VIGENCIA_INFO = {
  titulo: 'Prêmio por Mês de Vigência',
  formula: 'Σ ( prêmio previsto ÷ (vigência em dias ÷ 365 × 12) )',
  texto:
    'Quanto cada apólice representa POR MÊS em que fica vigente. O CRM lança o prêmio inteiro no mês da emissão, o que é certo para caixa mas engana na leitura de desempenho: uma apólice de 5 anos faz o mês da emissão parecer excepcional. Aqui o prêmio é dividido pelo número de meses de vigência, contados em DIAS e divididos por 365, a mesma base da Taxa Média Ponderada (por isso captura o ano bissexto). Esta leitura ANDA AO LADO do prêmio de emissão, nunca no lugar dele: uma responde "quanto vendemos naquele mês", a outra responde "quanto a carteira passou a render por mês".',
}
