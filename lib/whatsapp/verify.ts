import crypto from 'crypto'

// Valida a assinatura X-Hub-Signature-256 enviada pela Meta.
// O HMAC SHA-256 é calculado sobre o corpo CRU da requisição (string exata),
// usando o App Secret. Comparação em tempo constante para evitar timing attacks.
export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret || !signatureHeader) return false

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')

  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
