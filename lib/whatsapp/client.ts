import { fmtMoeda } from '@/lib/utils'
import type { KpiResultado } from '@/lib/operacoes/kpis'
import type { Operacao, VotoComite } from '@/types'
import { montarConvite } from '@/lib/comite/whatsapp-sim'

// ── Provedor: Z-API (WhatsApp não-oficial) ─────────────────────────────────
// O CRM roda na Vercel (serverless), que não mantém a conexão viva do WhatsApp;
// por isso a sessão mora na Z-API (SaaS) e aqui só falamos HTTP. Antes esta
// camada falava com a Meta Cloud API — a troca foi só de transporte; toda a
// lógica do Comitê (placar, textos, banco) permanece a mesma.

// IDs estáveis dos botões de resposta — referenciados também no roteamento do webhook.
// Mantidos aqui para centralizar.
export const BTN = {
  comite: 'btn_comite',
  aprovadas: 'btn_aprovadas',
  emitidas: 'btn_emitidas',
  menu: 'btn_menu',
} as const

// Converte o telefone do banco (mascarado BR, sem DDI) para o formato da Z-API
// (só dígitos, com DDI). Ex.: "(11) 99999-8888" → "5511999998888".
export function toWhatsAppNumber(telefone: string | null): string | null {
  const d = (telefone ?? '').replace(/\D/g, '')
  // Sem DDI: 10 dígitos (fixo) ou 11 (celular com 9) → prepend '55'.
  if (d.length === 10 || d.length === 11) return '55' + d
  // Já com DDI 55: 12 dígitos (fixo) ou 13 (celular) → mantém como está.
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d
  return null
}

function apiUrl(path: string): string {
  const base = process.env.ZAPI_BASE_URL || 'https://api.z-api.io'
  return `${base}/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/${path}`
}

// Envia um payload para a Z-API. Nunca lança: erros são logados para não
// derrubar o webhook (a Z-API reenfileira respostas != 200).
async function send(path: string, payload: object): Promise<void> {
  try {
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Segurança da Z-API: token de cliente no header (menu "Segurança").
        'Client-Token': process.env.ZAPI_CLIENT_TOKEN ?? '',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
    if (!res.ok) {
      const detalhe = await res.text().catch(() => '')
      console.error(`[whatsapp] Falha ao enviar (${path}): ${res.status} ${detalhe}`)
    }
  } catch (e) {
    console.error('[whatsapp] Erro de rede ao enviar mensagem:', e)
  }
}

// Mensagem de texto simples (confirmação de voto, placar parcial, veredito, link da análise).
export function sendTextoWhats(to: string, texto: string): Promise<void> {
  return send('send-text', { phone: to, message: texto })
}

// Menu interativo com 3 botões de resposta: Comitê, Aprovadas, Emitidas.
export function sendMenu(to: string): Promise<void> {
  return send('send-button-list', {
    phone: to,
    message: [
      '*FAM Seguradora — Painel*',
      '',
      'Selecione o indicador de operações que deseja consultar:',
      '',
      '_Digite FAM a qualquer momento para reabrir este menu._',
    ].join('\n'),
    buttonList: {
      buttons: [
        { id: BTN.comite, label: 'Comitê' },
        { id: BTN.aprovadas, label: 'Aprovadas' },
        { id: BTN.emitidas, label: 'Emitidas' },
      ],
    },
  })
}

// Card de KPI (resumo de um status) com botão "Voltar ao menu".
export function sendKpiCard(to: string, kpi: KpiResultado, titulo: string): Promise<void> {
  const corpo = [
    `*${titulo}*`,
    '',
    `📊 Operações: *${kpi.count}*`,
    `💰 LMG total (cap 80M): *${fmtMoeda(kpi.lmgTotal)}*`,
    `📈 Prêmio total: *${fmtMoeda(kpi.premioTotal)}*`,
  ].join('\n')

  return send('send-button-list', {
    phone: to,
    message: corpo,
    buttonList: {
      buttons: [{ id: BTN.menu, label: 'Voltar ao menu' }],
    },
  })
}

// ── Votação do Comitê via WhatsApp ─────────────────────────────────────────
// IDs dos botões do fluxo de votação (prefixo cv_ — sem colisão com BTN.*).
// O operacao_id é embutido no id do botão para o webhook saber a qual operação
// o voto/ação se refere. A Z-API devolve esse id custom em buttonsResponseMessage.buttonId.
export const CV = {
  votar: (opId: string) => `cv_votar:${opId}`,
  anexo: (opId: string) => `cv_anexo:${opId}`,
  voto: (voto: VotoComite, opId: string) => `cv_voto:${voto}:${opId}`,
} as const

// Convite personalizado que cada diretor recebe ao abrir-se um Comitê.
export function sendConviteComite(
  to: string,
  op: Operacao,
  diretorNome: string,
  subscritorNome: string,
): Promise<void> {
  return send('send-button-list', {
    phone: to,
    message: montarConvite({ diretorNome, subscritorNome, op }),
    buttonList: {
      buttons: [
        { id: CV.anexo(op.id), label: '📄 Ver análise' },
        { id: CV.votar(op.id), label: '🗳️ Votar' },
      ],
    },
  })
}

// Três botões de voto, exibidos quando o diretor toca em "Votar".
export function sendBotoesVoto(to: string, opId: string): Promise<void> {
  return send('send-button-list', {
    phone: to,
    message: 'Qual é o seu voto nesta operação?\n\n_(ou responda 1 = Aprovar, 2 = Com ressalva, 3 = Reprovar)_',
    buttonList: {
      buttons: [
        { id: CV.voto('aprovado', opId), label: '✅ Aprovar' },
        { id: CV.voto('aprovado_ressalva', opId), label: '⚠️ Com ressalva' },
        { id: CV.voto('reprovado', opId), label: '❌ Reprovar' },
      ],
    },
  })
}
