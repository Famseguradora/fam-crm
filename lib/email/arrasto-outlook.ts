/* O QUE O NOVO OUTLOOK ENTREGA QUANDO ALGUÉM ARRASTA UM E-MAIL  ·  23/09/2026
   ═══════════════════════════════════════════════════════════════════════════

   Pedido do Marco: "quando algum colega for enviar alguma análise para eu
   fazer, basta ele arrastar o e-mail para dentro do sistema. Melhor do que ter
   que salvar e colar".

   O PROBLEMA, e ele é real: o Novo Outlook NÃO entrega o arquivo do e-mail
   para o navegador. O clássico entrega (o Chromium lê o formato de arquivo
   virtual do Windows desde 2019); o novo, que é uma aplicação web, não.

   O QUE ELE ENTREGA é um formato interno, `multimaillistconversationrows`, sem
   documentação pública nenhuma. Foi preciso arrastar um e-mail de verdade e
   olhar o que caiu. Caiu isto (recortado):

     {"itemType":"multimaillistconversationrows",
      "rowKeys":["AQAAAILPRYYBAAAAiAglbwAAAAA="],
      "subjects":["FAM & Atix | Linka \"Union\" | Garantia de Executante"],
      "latestItemIds":["AAMkADVjODRlZWU3...AACICCGEAAA="],
      "sizes":[5611066],
      "mailboxInfos":[{"mailboxSmtpAddress":"marco.dragone@famseguradora.com.br",
                       "mailboxProvider":"Office365", ...}]}

   `latestItemIds` é o identificador da mensagem no Exchange, e é com ele que o
   Microsoft Graph devolve o e-mail INTEIRO, em MIME, com anexos e tudo
   (`GET /me/messages/{id}/$value`). Ou seja: o arrasto não traz o e-mail, mas
   traz o endereço dele — e o CRM vai buscar.

   ESTE MÓDULO SÓ LÊ O BILHETE. Não fala com a Microsoft, não guarda nada, não
   decide permissão: recebe o texto que caiu na tela e diz o que dá para
   entender dele. Quem busca é `lib/ms/graph.ts`; quem autoriza é a conexão da
   pessoa com a própria caixa.

   POR QUE UM MÓDULO SÓ: a tela precisa saber se dá para buscar (para mostrar
   o botão certo) e a rota precisa validar o que recebeu (porque o navegador
   pode mandar qualquer coisa). Uma leitura só, dois usos. */

/** O formato que o Novo Outlook usa para arrastar linhas da lista de e-mail. */
export const FORMATO_ARRASTO = 'multimaillistconversationrows'

export interface EmailArrastado {
  /** O id da mensagem no Exchange (o que o Graph aceita, direto ou traduzido). */
  id: string
  /** O assunto, só para a tela dizer o que está buscando. */
  assunto: string | null
  /** A caixa de onde o e-mail veio. É a trava: só busco na caixa de quem arrastou. */
  caixa: string | null
  /** O tamanho em bytes, quando o Outlook informa. Serve para recusar cedo. */
  bytes: number | null
}

/* O e-mail com anexos grandes não cabe no que o CRM aceita hoje, e é melhor
   dizer isso antes de baixar 60 MB do Microsoft 365. É o mesmo limite do
   arquivo subido à mão (`MAX_BYTES_EMAIL`), repetido aqui como número porque
   este módulo não depende de nada do servidor. */
export const MAX_BYTES_ARRASTO = 50 * 1024 * 1024

/** Um id do Exchange é base64 e comprido. Isto não prova que ele existe — só
 *  impede que qualquer texto vire uma chamada ao Microsoft 365. */
const ID_PLAUSIVEL = /^[A-Za-z0-9+/=_-]{40,600}$/

/**
 * Lê o bilhete que o Novo Outlook deixou no arrasto.
 *
 * Devolve `[]` para qualquer coisa que não seja esse formato — texto de outro
 * programa, JSON quebrado, campo faltando. Nada aqui levanta erro: um arrasto
 * estranho é uma tela que explica, nunca uma tela que quebra.
 */
export function lerArrastoDoOutlook(cru: string): EmailArrastado[] {
  if (!cru || cru.length > 2_000_000) return []

  let dados: Record<string, unknown>
  try { dados = JSON.parse(cru) } catch { return [] }
  if (!dados || typeof dados !== 'object') return []
  if (dados.itemType !== FORMATO_ARRASTO) return []

  const ids = Array.isArray(dados.latestItemIds) ? dados.latestItemIds : []
  const assuntos = Array.isArray(dados.subjects) ? dados.subjects : []
  const tamanhos = Array.isArray(dados.sizes) ? dados.sizes : []
  const caixas = Array.isArray(dados.mailboxInfos) ? dados.mailboxInfos : []

  /* A CAIXA DA VEZ: o Outlook manda uma por linha arrastada, mas quando é só
     uma ele às vezes manda uma só para todas. A primeira serve de padrão. */
  const caixaDe = (i: number): string | null => {
    const m = (caixas[i] ?? caixas[0]) as { mailboxSmtpAddress?: unknown } | undefined
    const smtp = typeof m?.mailboxSmtpAddress === 'string' ? m.mailboxSmtpAddress.trim().toLowerCase() : ''
    return smtp || null
  }

  const achados: EmailArrastado[] = []
  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i] ?? '')
    if (!ID_PLAUSIVEL.test(id)) continue
    const assunto = typeof assuntos[i] === 'string' ? (assuntos[i] as string).trim() : ''
    const bytes = Number(tamanhos[i])
    achados.push({
      id,
      assunto: assunto || null,
      caixa: caixaDe(i),
      bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : null,
    })
  }
  /* ARRASTAR DEZ E-MAILS DE UMA VEZ é possível na lista do Outlook. O teto
     existe para um arrasto distraído não virar dez casos sem ninguém perceber. */
  return achados.slice(0, 10)
}

/** O que a tela mostra enquanto busca: "FAM & Atix | Linka…" ou "o e-mail". */
export const nomeDoArrastado = (e: EmailArrastado) =>
  e.assunto && e.assunto.length > 60 ? e.assunto.slice(0, 57) + '…' : e.assunto || 'o e-mail'
