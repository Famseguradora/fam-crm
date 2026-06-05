import { fmtMoeda } from '@/lib/utils'
import type { KpiResultado } from '@/lib/operacoes/kpis'

const GRAPH_VERSION = 'v21.0'

// IDs estáveis dos botões de resposta — referenciados também no roteamento do webhook.
// Mantidos aqui para centralizar e facilitar a futura votação do Comitê.
export const BTN = {
  comite: 'btn_comite',
  aprovadas: 'btn_aprovadas',
  emitidas: 'btn_emitidas',
  menu: 'btn_menu',
} as const

function apiUrl(): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`
}

// Envia um payload para a Graph API. Nunca lança: erros são logados para não
// derrubar o webhook (a Meta reenfileira respostas != 200).
async function send(payload: object): Promise<void> {
  try {
    const res = await fetch(apiUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
    if (!res.ok) {
      const detalhe = await res.text().catch(() => '')
      console.error(`[whatsapp] Falha ao enviar mensagem: ${res.status} ${detalhe}`)
    }
  } catch (e) {
    console.error('[whatsapp] Erro de rede ao enviar mensagem:', e)
  }
}

// Menu interativo com 3 botões de resposta: Comitê, Aprovadas, Emitidas.
export function sendMenu(to: string): Promise<void> {
  return send({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: { type: 'text', text: 'FAM Seguradora — Painel' },
      body: { text: 'Selecione o indicador de operações que deseja consultar:' },
      footer: { text: 'Digite FAM a qualquer momento para reabrir este menu.' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: BTN.comite, title: 'Comitê' } },
          { type: 'reply', reply: { id: BTN.aprovadas, title: 'Aprovadas' } },
          { type: 'reply', reply: { id: BTN.emitidas, title: 'Emitidas' } },
        ],
      },
    },
  })
}

// Card de KPI com cabeçalho de imagem (banner FAM) + corpo formatado.
// imageUrl é parametrizável para, no futuro, apontar para um card PNG renderizado no servidor.
export function sendKpiCard(
  to: string,
  kpi: KpiResultado,
  titulo: string,
  imageUrl = process.env.WHATSAPP_BANNER_URL,
): Promise<void> {
  const corpo = [
    `*${titulo}*`,
    '',
    `📊 Operações: *${kpi.count}*`,
    `💰 LMG total (cap 80M): *${fmtMoeda(kpi.lmgTotal)}*`,
    `📈 Prêmio total: *${fmtMoeda(kpi.premioTotal)}*`,
  ].join('\n')

  const header = imageUrl
    ? { type: 'image', image: { link: imageUrl } }
    : { type: 'text', text: 'FAM Seguradora' }

  return send({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      header,
      body: { text: corpo },
      action: {
        buttons: [{ type: 'reply', reply: { id: BTN.menu, title: 'Voltar ao menu' } }],
      },
    },
  })
}
