/* PARA ONDE A PESSOA VOLTA  ·  23/09/2026
   ═══════════════════════════════════════════════════════════════════════════

   Quem sai do CRM para o login da Microsoft precisa voltar para a tela de onde
   saiu — ela clicou em "ligar a caixa" no meio de um arrasto. Esse "de onde
   saiu" chega pela URL e por cookie, e portanto é texto de fora: tem que ser
   tratado como tal.

   O ERRO QUE ISTO CONSERTA, achado pela revisão de segurança desta mesma
   entrega: a conferência era `começa com "/" e não com "//"`. Ela parece
   bastar, e não basta —

     /\tevil.com   (com TAB de verdade no meio)

   começa com "/", não começa com "//", e passa. Só que `new URL()` joga fora
   caracteres de controle por especificação: o que sobra é `//evil.com`, uma
   URL relativa a protocolo, e o navegador vai parar em `http://evil.com`. Um
   link `/api/ms/login?depois=...` mandado a alguém já logado levaria a pessoa
   ao site do atacante DEPOIS de uma tela de login legítima da Microsoft — que
   é exatamente o cenário em que ela digitaria a senha de novo sem desconfiar.
   E nem precisava completar o consentimento: cancelar também voltava por ali.

   A REGRA AQUI É OUTRA: não se decide olhando o começo do texto. Monta-se a
   URL e pergunta-se em que origem ela caiu. Se não for a nossa, ninguém vai
   para lá. */

/**
 * Devolve um caminho interno seguro (`/comercial/entrada?x=1`), ou o padrão.
 *
 * `base` é a origem do próprio CRM nesta requisição.
 */
export function caminhoInterno(cru: string | null | undefined, base: string, padrao = '/'): string {
  const texto = String(cru ?? '')
  if (!texto) return padrao

  /* Nada de caractere de controle, espaço ou byte fora do ASCII imprimível: é
     justamente o que `new URL()` descarta em silêncio, mudando o significado
     do texto depois da conferência. */
  if (/[^\x21-\x7e]/.test(texto)) return padrao
  if (texto.length > 1000) return padrao

  try {
    const alvo = new URL(texto, base)
    if (alvo.origin !== new URL(base).origin) return padrao
    return `${alvo.pathname}${alvo.search}${alvo.hash}` || padrao
  } catch {
    return padrao
  }
}
