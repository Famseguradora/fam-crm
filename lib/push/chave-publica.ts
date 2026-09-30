/* A CHAVE PÚBLICA DO PUSH (VAPID)  ·  30/09/2026

   Pública por definição: o navegador precisa dela para se inscrever, e ela
   vai no bundle de qualquer jeito. Por isso mora no código, e não só no
   ambiente: o deploy não depende de alguém cadastrar variável na Vercel.

   A PRIVADA NÃO mora aqui: está no cofre do Supabase (`vapid_private`), lida
   pelo servidor com a chave de serviço (`lembretes_segredos()`).
   Trocar este par desliga todo celular inscrito. */
export const VAPID_PUBLICA =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BMLiUOdHBv6ueJGELmPmo6olMLVxYFPiAZs4_zN8D3-0BRvEX0GzzlPfygygaLoeR7XGmZQPDcOeffdVqRIV1Kc'
