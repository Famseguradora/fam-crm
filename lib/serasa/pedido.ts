// ============================================================================
//  O PEDIDO DE SERASA DA EMPRESA, lido do mesmo jeito em toda tela  (15/09/2026)
//
//  O botão "Serasa" mora em dois lugares: o cadastro do tomador (o PDF vira
//  anexo) e o card da análise (o PDF cai na pasta). O que o pedido diz ao
//  usuário é um texto só, e mora aqui.
// ============================================================================

export interface PedidoSerasa {
  id: string
  estado: string
  criado_em: string
  feito_em: string | null
  resultado: string | null
  pedido_por: string | null
}

export const SERASA_ABERTO = ['pendente', 'consultando']

/** `onde`: onde o PDF aparece para quem lê ("nos anexos abaixo", "na pasta da análise"). */
export function situacaoSerasa(p: PedidoSerasa, onde = 'nos anexos abaixo'): { texto: string; erro?: boolean } | null {
  const hora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  if (p.estado === 'pendente') {
    // Pedido devolvido pela máquina (o Serasa pediu login): o motivo vale mais que o relógio.
    if (p.resultado) return { texto: `Serasa pedido em ${hora(p.criado_em)}. ${p.resultado}`, erro: true }
    return (Date.now() - Date.parse(p.criado_em)) / 60000 > 2
      ? { texto: `Serasa pedido em ${hora(p.criado_em)} e o notebook ainda não pegou o pedido. A esteira está ligada?`, erro: true }
      : { texto: `Serasa pedido em ${hora(p.criado_em)}. Aguardando o notebook…` }
  }
  if (p.estado === 'consultando') return { texto: `O robô está consultando o Serasa. O PDF aparece ${onde}.` }
  // Recibo de pedido fechado só aparece no mesmo dia: depois vira ruído.
  if (!p.feito_em || Date.now() - Date.parse(p.feito_em) > 24 * 3600000) return null
  if (p.estado === 'falhou') return { texto: `O robô do Serasa parou: ${p.resultado ?? 'sem motivo registrado.'}`, erro: true }
  return { texto: `Serasa de ${hora(p.feito_em)} ${onde}. ${p.resultado ?? ''}` }
}

/** "40%", "33,33%", "0%" do quadro societário, em número. Sem percentual é 0. */
export function percentualDoSocio(participacao: string | null | undefined): number {
  return parseFloat(String(participacao ?? '').replace('%', '').replace(',', '.').trim()) || 0
}
