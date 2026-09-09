/* O QUE DÁ PARA LER DE UM E-MAIL SEM ABRIR NENHUM ANEXO.
   Portado da coluna "Tomador" de `_sistema/cockpit/outlook.html`.

   A HONESTIDADE É O DESENHO AQUI. O sistema só apura o tomador de verdade
   depois (é a análise que batiza a pasta, nunca a triagem). Então tudo neste
   arquivo é PISTA, e cada pista diz de onde veio, para a tela não parecer mais
   certa do que é. Foi o caso do Ivamar: o classificador escolheu a empresa que
   aparecia em quatro aditivos, e não a do tomador, que só estava no Serasa.

   Sem IA de propósito. Quando a IA entrar, ela vira outra origem de pista ao
   lado destas, com o mesmo formato, e a marca de quem apurou continua viajando. */

import { maskCNPJ, validarCNPJ } from '@/lib/utils'
import { limparNome } from '@/lib/email/ler-email'

/** De onde a pista veio. Vai para a tela e para `casos.identificado_por`. */
export type FontePista = 'assunto' | 'remetente' | 'anexo' | 'humano'

export interface Pista<T> {
  valor: T
  fonte: FontePista
  /** A frase que a tela mostra embaixo do campo. Curta, e sempre verdadeira. */
  origem: string
}

/* O CNPJ NO ASSUNTO. Aceita com e sem máscara, e só entrega o que passa no
   dígito verificador: número de 14 dígitos que não é CNPJ é quase sempre um
   número de processo ou de edital, e gravar isso como chave do caso quebraria
   exatamente o que o CNPJ existe para juntar. */
export function cnpjDoAssunto(assunto: string): Pista<string> | null {
  const achados = String(assunto ?? '').match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) ?? []
  for (const bruto of achados) {
    if (validarCNPJ(bruto)) {
      return { valor: maskCNPJ(bruto), fonte: 'assunto', origem: 'lido do assunto do e-mail' }
    }
  }
  return null
}

/* O NOME DO TOMADOR: o primeiro pedaço do assunto, antes do CNPJ, do traço ou
   do ponto médio. É palpite e a tela diz isso: o assunto inteiro, com ALPER,
   PERMUTA e R$37MM, não é nome de empresa. */
export function nomeDoTomador(assunto: string): Pista<string> | null {
  const limpo = limparNome(assunto)
  if (!limpo) return null
  const primeiro = limpo.split(/\s*[·\-|]\s*/)[0].trim()
  // Um pedaço com dois caracteres não é razão social, é ruído ("RE", "FW").
  if (primeiro.length < 3) return null
  return { valor: primeiro, fonte: 'assunto', origem: 'primeiro pedaço do assunto' }
}

/* O VALOR PEDIDO, quando ele vem no assunto ("R$ 37MM", "R$ 55 milhões").
   Não vira número: é só o que a tela mostra para quem está lendo decidir. */
export function valorDoAssunto(assunto: string): Pista<string> | null {
  const m = String(assunto ?? '').match(/R\$\s?[\d.,]+\s?(MM|MI|M|mil|milh[oõ]es|bi)?/i)
  return m ? { valor: m[0].trim(), fonte: 'assunto', origem: 'lido do assunto' } : null
}

/** O domínio de um endereço, minúsculo e sem o que vem antes do @. */
export const dominioDe = (email: string) =>
  (String(email ?? '').split('@')[1] ?? '').trim().toLowerCase().replace(/[>,;].*$/, '')

/* A CORRETORA PELO DOMÍNIO DE QUEM ESCREVEU. E-mail de dentro da FAM não é
   corretora: a demanda foi encaminhada por um colega, e mostrar "Fam" na linha
   da corretora seria pior do que mostrar vazio.

   Isto é só o PALPITE do nome. Quem transforma palpite em corretora cadastrada
   é `casarCorretora` (lib/analise/corretoras.mjs), que já é a regra única do
   CRM e se recusa a escolher quando há mais de uma candidata. */
export function corretoraDoRemetente(emailDe: string): Pista<string> | null {
  const dom = dominioDe(emailDe)
  if (!dom || /famseguradora/.test(dom)) return null
  // Domínio de webmail não diz nada sobre a casa: gmail.com viraria "Gmail".
  if (/^(gmail|hotmail|outlook|yahoo|live|icloud|uol|bol|terra|globo)\./.test(dom)) return null
  const bruto = dom.replace(/\.(com|com\.br|br|net|net\.br|org|org\.br|adv\.br)$/, '').split('.')[0]
  if (!bruto || bruto.length < 2) return null
  return {
    valor: bruto.charAt(0).toUpperCase() + bruto.slice(1),
    fonte: 'remetente',
    origem: `domínio ${dom}`,
  }
}

/** Tudo o que dá para ler de um cabeçalho, de uma vez, para a coluna do tomador. */
export interface PistasDoEmail {
  cnpj: Pista<string> | null
  tomador: Pista<string> | null
  valor: Pista<string> | null
  corretora: Pista<string> | null
}

export function pistasDoEmail(e: { assunto?: string | null; email_de?: string | null }): PistasDoEmail {
  const assunto = String(e.assunto ?? '')
  return {
    cnpj: cnpjDoAssunto(assunto),
    tomador: nomeDoTomador(assunto),
    valor: valorDoAssunto(assunto),
    corretora: corretoraDoRemetente(String(e.email_de ?? '')),
  }
}
