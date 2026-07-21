// ============================================================================
//  Comitê — Construtor das mensagens do WhatsApp (SIMULADO no sandbox)
//  Gera o texto do convite e das respostas do "bot", reutilizando a mesma
//  formatação de moeda do CRM. NÃO envia nada para a Meta — é o roteiro que o
//  simulador de WhatsApp renderiza dentro do CRM.
// ============================================================================
import { fmtMoeda, fmtPercent } from '@/lib/utils'
import { VOTO_META, type PlacarComite } from '@/lib/comite/votacao'
import type { Operacao, VotoComite, ParecerFinal } from '@/types'

export interface DadosConvite {
  // Nome do diretor, quando a mensagem é individual. Passe `null` para o envio
  // por LISTA DE TRANSMISSÃO: como todos recebem o mesmo texto, é impossível
  // personalizar — e "Olá, Sr(a). Diretor(a)" soa a formulário. Nesse caso a
  // saudação vira coletiva.
  diretorNome: string | null
  subscritorNome: string
  // Cargo de QUEM envia (usuário logado), como cadastrado em `usuarios.cargo`.
  // Nem sempre é subscritor — um diretor ou executivo também pode enviar a
  // cédula. Sem cargo cadastrado, cai no rótulo genérico "Subscritor".
  remetenteCargo?: string | null
  op: Operacao
}

function primeiroNome(nome: string): string {
  return (nome || '').trim().split(/\s+/)[0] || nome
}

function prazoTxt(op: Operacao): string {
  if (op.vigencia_anos != null) return `${op.vigencia_anos} ${op.vigencia_anos === 1 ? 'ano' : 'anos'}`
  if (op.vigencia_dias != null) return `${op.vigencia_dias} dias`
  return '—'
}

// Convite personalizado que cada diretor "recebe" no WhatsApp.
export function montarConvite({ diretorNome, subscritorNome, remetenteCargo, op }: DadosConvite): string {
  const tomador = op.tomador?.razao_social ?? 'Tomador'
  // Cargo antes do nome, sem artigo — assim funciona para qualquer gênero
  // ("Executivo de Crédito Marco", "Diretora de Produtos Camila").
  const cargo = (remetenteCargo ?? '').trim() || 'Subscritor'
  const linhas = [
    diretorNome ? `Olá, *Sr(a). ${diretorNome}* 👋` : 'Prezados Diretores 👋',
    '',
    diretorNome
      ? `${cargo} *${subscritorNome}* acabou de te convidar a conhecer uma operação que entrou em *Comitê*.`
      : `${cargo} *${subscritorNome}* convida o Comitê a analisar uma operação que entrou em julgamento.`,
    '',
    `🏢 *Tomador:* ${tomador}`,
    `📋 *Operação:* ${op.modalidade ?? op.produto?.nome ?? '—'}`,
    '',
    `💰 Prêmio: *${op.premio_previsto ? fmtMoeda(op.premio_previsto) : '—'}*`,
    `🛡️ LMG: *${op.lmg ? fmtMoeda(op.lmg) : '—'}*`,
    `📈 Taxa: *${op.taxa ? fmtPercent(op.taxa / 100) : '—'}*`,
    `⏳ Prazo: *${prazoTxt(op)}*`,
    '',
    op.parecer_subscricao
      ? `🖋️ _Parecer da Subscrição:_ "${op.parecer_subscricao}"`
      : '',
    'Toque abaixo para abrir a análise de crédito ou registrar seu voto. ⚖️',
  ].filter((l) => l !== '')
  return linhas.join('\n')
}

// Resposta do bot logo após o diretor votar (confirmação + placar parcial).
export function montarConfirmacaoVoto(diretorNome: string, voto: VotoComite, placar: PlacarComite): string {
  const m = VOTO_META[voto]
  const linhas = [
    `${m.emoji} Voto registrado, *${primeiroNome(diretorNome)}*! Você votou: *${m.label}*.`,
    '',
    '*Placar parcial do Comitê:*',
    `✅ Aprovado: ${placar.aprovado}`,
    `⚠️ Com ressalva: ${placar.aprovado_ressalva}`,
    `❌ Reprovado: ${placar.reprovado}`,
    placar.pendentes > 0
      ? `\n⏳ Faltam *${placar.pendentes}* diretor(es) votar(em).`
      : '\n🎉 Todos votaram! Veja o resultado final abaixo.',
  ]
  return linhas.join('\n')
}

// Mensagem de encerramento quando a bancada fecha o veredito.
export function montarVeredito(diretorNome: string, parecer: ParecerFinal): string {
  const frases: Record<ParecerFinal, string> = {
    'Aprovada': '🏆 Parabéns! O Comitê *APROVOU* a operação. Excelente decisão colegiada!',
    'Aprovada com Ressalva': '📐 O Comitê aprovou a operação *COM RESSALVA*. Confira as condições no CRM.',
    'Reprovada': '🚫 O Comitê *REPROVOU* a operação. O subscritor definirá os próximos passos.',
    'Empate': '⚖️ A votação terminou *EMPATADA*. O subscritor fará o desempate.',
  }
  return [
    `Obrigado pela participação, *${primeiroNome(diretorNome)}*.`,
    '',
    frases[parecer],
  ].join('\n')
}
