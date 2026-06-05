// ============================================================================
//  Núcleo do Agente de Análise Financeira do FAM CRM.
//
//  Lógica PURA (sem I/O, sem rede): recebe a lista de operações e devolve
//  um relatório estruturado de achados. É usada hoje pelo runner noturno
//  (scripts/analise-financeira.mjs) e foi escrita em JS puro (com JSDoc) para
//  no futuro ser importada diretamente pelo CRM (rotas/Server Components do
//  Next), permitindo que o agente atue e compartilhe informações com os
//  usuários dentro do sistema.
//
//  Regra de negócio central (FAM): o LMG é limitado a R$ 80 milhões por
//  operação para fins de exposição. O PRÊMIO também deve ser calculado sobre
//  o LMG limitado — nunca sobre o LMG cheio quando este excede o teto.
//
//  Fórmula do prêmio (igual à do banco e do formulário): a `taxa` está em
//  PONTOS PERCENTUAIS, então divide-se por 100:
//     premio = round(min(lmg, 80M) × taxa ÷ 100 × vigencia_anos, 2)
// ============================================================================

/** Teto de LMG por operação (regra FAM). Mesmo valor usado nos painéis. */
export const CAP_LMG = 80_000_000

/** Tolerância de arredondamento ao comparar prêmios (centavos). */
const TOL = 0.5

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v))

/**
 * Prêmio canônico segundo a regra FAM: usa o LMG LIMITADO a 80M.
 *   premio = round(min(lmg, 80M) × taxa ÷ 100 × vigencia_anos)
 * Espelha a coluna GENERATED do banco APÓS a correção do teto (taxa em %).
 * @returns {number|null} prêmio esperado, ou null se faltarem componentes.
 */
export function premioEsperado(lmg, taxa, vigencia) {
  const l = num(lmg), t = num(taxa), v = num(vigencia)
  if (l == null || t == null || v == null) return null
  return round2(Math.min(l, CAP_LMG) * t / 100 * v)
}

/** Prêmio "ingênuo" (LMG cheio, sem teto) — usado só para detectar o furo. */
function premioSemTeto(lmg, taxa, vigencia) {
  const l = num(lmg), t = num(taxa), v = num(vigencia)
  if (l == null || t == null || v == null) return null
  return round2(l * t / 100 * v)
}

/**
 * @typedef {Object} Achado
 * @property {string} id            id da operação
 * @property {'critico'|'alerta'|'info'} severidade
 * @property {string} regra         chave curta da regra violada
 * @property {string} mensagem      descrição legível
 * @property {Object} [valores]     números de apoio (impacto financeiro etc.)
 */

/**
 * Roda a bateria de verificações financeiras sobre as operações.
 * Considera apenas operações ativas por padrão.
 *
 * @param {Array<Object>} operacoes  linhas da tabela `operacoes`
 * @param {{somenteAtivas?: boolean}} [opts]
 * @returns {{resumo: Object, achados: Achado[], totaisPorStatus: Object}}
 */
export function analisarOperacoes(operacoes, opts = {}) {
  const somenteAtivas = opts.somenteAtivas !== false
  const rows = (operacoes ?? []).filter((o) => (somenteAtivas ? o.ativo !== false : true))

  /** @type {Achado[]} */
  const achados = []
  const totaisPorStatus = {}
  let impactoPremioTotal = 0 // R$ de prêmio inflado pelo não-limite do LMG
  let opsAcimaTeto = 0

  for (const op of rows) {
    const id = op.id ?? '(sem-id)'
    const lmg = num(op.lmg)
    const taxa = num(op.taxa)
    const vig = num(op.vigencia_anos)
    const premio = num(op.premio_previsto)
    const status = op.status ?? '(sem-status)'

    // Totais por status (com LMG limitado e prêmio canônico).
    const st = (totaisPorStatus[status] ??= { count: 0, lmgLimitado: 0, premioCanonico: 0, premioArmazenado: 0 })
    st.count++
    st.lmgLimitado += Math.min(lmg ?? 0, CAP_LMG)
    st.premioCanonico += premioEsperado(lmg, taxa, vig) ?? 0
    st.premioArmazenado += premio ?? 0

    // ---- 1. Valores inválidos -------------------------------------------
    if (lmg != null && lmg < 0)
      achados.push({ id, severidade: 'critico', regra: 'lmg-negativo', mensagem: `LMG negativo (${lmg}).`, valores: { lmg } })
    if (taxa != null && taxa < 0)
      achados.push({ id, severidade: 'critico', regra: 'taxa-negativa', mensagem: `Taxa negativa (${taxa}).`, valores: { taxa } })
    if (vig != null && vig <= 0)
      achados.push({ id, severidade: 'alerta', regra: 'vigencia-invalida', mensagem: `Vigência <= 0 (${vig}).`, valores: { vigencia_anos: vig } })
    if (lmg != null && lmg > 0 && premio == null)
      achados.push({ id, severidade: 'alerta', regra: 'premio-nulo', mensagem: 'LMG > 0 mas prêmio previsto nulo.', valores: { lmg } })

    // ---- 2. Teto de prêmio (regra FAM dos 80M) --------------------------
    if (lmg != null && lmg > CAP_LMG) {
      opsAcimaTeto++
      const esperado = premioEsperado(lmg, taxa, vig)
      const semTeto = premioSemTeto(lmg, taxa, vig)
      if (premio != null && esperado != null && semTeto != null) {
        const excedeCanonico = premio - esperado
        if (Math.abs(premio - semTeto) <= TOL && excedeCanonico > TOL) {
          // Prêmio foi calculado sobre o LMG cheio: viola a regra dos 80M.
          impactoPremioTotal += excedeCanonico
          achados.push({
            id, severidade: 'critico', regra: 'premio-nao-limitado',
            mensagem: `Prêmio calculado sobre LMG cheio (R$ ${fmt(lmg)}) em vez do teto de R$ ${fmt(CAP_LMG)}. `
              + `Prêmio armazenado R$ ${fmt(premio)}; correto seria R$ ${fmt(esperado)} (excesso R$ ${fmt(excedeCanonico)}).`,
            valores: { lmg, taxa, vigencia_anos: vig, premioArmazenado: premio, premioCorreto: esperado, excesso: round2(excedeCanonico) },
          })
        }
      }
    }

    // ---- 3. Divergência genérica prêmio × fórmula -----------------------
    const esperado = premioEsperado(lmg, taxa, vig)
    if (premio != null && esperado != null) {
      const diff = premio - esperado
      const jaSinalizado = lmg != null && lmg > CAP_LMG && Math.abs(premio - (premioSemTeto(lmg, taxa, vig) ?? NaN)) <= TOL
      if (!jaSinalizado && Math.abs(diff) > Math.max(TOL, esperado * 0.0001)) {
        achados.push({
          id, severidade: 'alerta', regra: 'premio-divergente',
          mensagem: `Prêmio armazenado (R$ ${fmt(premio)}) diverge do esperado pela fórmula (R$ ${fmt(esperado)}).`,
          valores: { premioArmazenado: premio, premioEsperado: esperado, diferenca: round2(diff) },
        })
      }
    }

    // ---- 4. Sanidade da taxa (taxa em pontos percentuais) ---------------
    // A taxa é armazenada em % (ex.: 0,5 = 0,5%). Valores plausíveis ~0–10%.
    if (taxa != null && lmg != null && lmg > 0) {
      if (taxa === 0)
        achados.push({ id, severidade: 'info', regra: 'taxa-zero', mensagem: 'Taxa zerada com LMG > 0 (prêmio fica zero).', valores: { lmg, taxa } })
      else if (taxa > 100)
        achados.push({ id, severidade: 'alerta', regra: 'taxa-absurda', mensagem: `Taxa acima de 100% (${taxa}).`, valores: { taxa } })
    }

    // ---- 5. Periodicidade em meses (banco não divide por 12) ------------
    // O formulário trata "Meses" (premio ÷ 12 × meses), mas a coluna GENERATED
    // calcula como se `vigencia_anos` fossem ANOS — superestimando ~12×.
    if (op.periodicidade_vigencia === 'Meses' && lmg != null && lmg > 0)
      achados.push({
        id, severidade: 'alerta', regra: 'periodicidade-meses',
        mensagem: `Vigência em MESES (${vig}). A fórmula do banco trata o valor como ANOS, inflando o prêmio ~12×. Padronizar conversão.`,
        valores: { vigencia_anos: vig, periodicidade: 'Meses' },
      })
  }

  for (const k of Object.keys(totaisPorStatus)) {
    const s = totaisPorStatus[k]
    s.lmgLimitado = round2(s.lmgLimitado)
    s.premioCanonico = round2(s.premioCanonico)
    s.premioArmazenado = round2(s.premioArmazenado)
  }

  const criticos = achados.filter((a) => a.severidade === 'critico').length
  const alertas = achados.filter((a) => a.severidade === 'alerta').length

  return {
    resumo: {
      operacoesAnalisadas: rows.length,
      operacoesAcimaDoTeto: opsAcimaTeto,
      criticos, alertas,
      infos: achados.length - criticos - alertas,
      impactoPremioInflado: round2(impactoPremioTotal),
      regra: `LMG e PRÊMIO limitados a R$ ${fmt(CAP_LMG)} por operação.`,
    },
    achados,
    totaisPorStatus,
  }
}

function fmt(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const fmtBR = fmt
