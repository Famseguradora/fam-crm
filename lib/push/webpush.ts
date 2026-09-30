/* NOTIFICAÇÃO NO CELULAR, ESCRITA À MÃO  ·  30/09/2026

   Pedido do Marco: o lembrete do tomador avisa "no sino e no celular". A FAM
   não usa componente de terceiros (ordem de 29/09/2026), então o Web Push é
   feito aqui com o `node:crypto`, seguindo duas normas públicas:

     RFC 8291   a criptografia da mensagem (aes128gcm): o serviço de push do
                Google/Apple/Mozilla carrega a mensagem sem conseguir lê-la
     RFC 8292   o VAPID: a assinatura que prova ao serviço que o envio é do CRM

   O TESTE É O DA PRÓPRIA NORMA: `npm run push:test` cifra o exemplo da seção 5
   da RFC 8291 com as mesmas chaves e confere o resultado BYTE A BYTE. Se um
   dia alguém mexer aqui e o teste quebrar, o celular para de receber.

   As chaves VAPID moram no ambiente (NEXT_PUBLIC_VAPID_PUBLIC_KEY e
   VAPID_PRIVATE_KEY), geradas uma vez por `npm run push:chaves`. */

import crypto from 'node:crypto'

export const b64url = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url')
export const deB64url = (s: string) => Buffer.from(s, 'base64url')

const hkdf = (ikm: Buffer, salt: Buffer, info: Buffer, tamanho: number) =>
  Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, tamanho))

export interface InscricaoPush {
  endpoint: string
  /** chave pública do navegador (P-256, 65 bytes), base64url */
  p256dh: string
  /** segredo de autenticação do navegador (16 bytes), base64url */
  auth: string
}

/**
 * Cifra a mensagem para UM navegador (RFC 8291, um registro só).
 * `fixo` existe só para o teste reproduzir o exemplo da norma.
 */
export function cifrar(
  mensagem: Buffer,
  inscricao: Pick<InscricaoPush, 'p256dh' | 'auth'>,
  fixo?: { privadaRemetente: Buffer; sal: Buffer },
): Buffer {
  const uaPublica = deB64url(inscricao.p256dh)
  const segredoAuth = deB64url(inscricao.auth)
  if (uaPublica.length !== 65 || uaPublica[0] !== 0x04) throw new Error('chave p256dh inválida')
  if (segredoAuth.length !== 16) throw new Error('segredo auth inválido')

  const ecdh = crypto.createECDH('prime256v1')
  if (fixo) ecdh.setPrivateKey(fixo.privadaRemetente)
  else ecdh.generateKeys()
  const asPublica = ecdh.getPublicKey()
  const segredoEcdh = ecdh.computeSecret(uaPublica)

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const infoChave = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublica, asPublica])
  const ikm = hkdf(segredoEcdh, segredoAuth, infoChave, 32)

  const sal = fixo?.sal ?? crypto.randomBytes(16)
  const cek = hkdf(ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdf(ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12)

  // Um registro só: a mensagem seguida do delimitador 0x02 (último registro).
  const cifra = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const corpo = Buffer.concat([cifra.update(Buffer.concat([mensagem, Buffer.from([2])])), cifra.final(), cifra.getAuthTag()])

  // Cabeçalho: sal (16) | tamanho do registro (4, 4096) | tamanho do id (1) | chave pública do remetente
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096)
  return Buffer.concat([sal, rs, Buffer.from([asPublica.length]), asPublica, corpo])
}

/** O cabeçalho Authorization do VAPID (RFC 8292), válido por 12 horas. */
export function cabecalhoVapid(endpoint: string, chaves: { publica: string; privada: string }, contato: string) {
  const pub = deB64url(chaves.publica)
  const jwk = {
    kty: 'EC', crv: 'P-256',
    d: chaves.privada,
    x: b64url(pub.subarray(1, 33)),
    y: b64url(pub.subarray(33, 65)),
  }
  const chave = crypto.createPrivateKey({ key: jwk, format: 'jwk' })
  const cab = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const corpo = b64url(Buffer.from(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: contato,
  })))
  const assinatura = crypto.sign('sha256', Buffer.from(`${cab}.${corpo}`), { key: chave, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${cab}.${corpo}.${b64url(assinatura)}, k=${chaves.publica}`
}

/** Um par novo de chaves VAPID. Só se gera uma vez: trocar desliga todo celular inscrito. */
export function novasChavesVapid() {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  return { publica: b64url(ecdh.getPublicKey()), privada: b64url(ecdh.getPrivateKey()) }
}

export type ResultadoPush = { ok: true } | { ok: false; status: number; expirada: boolean; erro: string }

/** Manda uma notificação. `expirada` = o navegador desinstalou ou revogou: apagar a inscrição. */
export async function enviarPush(
  inscricao: InscricaoPush,
  conteudo: { titulo: string; texto?: string | null; link?: string | null; tag?: string },
  chaves: { publica: string; privada: string },
  contato: string,
): Promise<ResultadoPush> {
  try {
    // Dentro do try: uma inscrição com chave quebrada não pode derrubar o lote.
    const corpo = cifrar(Buffer.from(JSON.stringify(conteudo)), inscricao)
    const r = await fetch(inscricao.endpoint, {
      method: 'POST',
      headers: {
        Authorization: cabecalhoVapid(inscricao.endpoint, chaves, contato),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'high',
      },
      body: new Uint8Array(corpo),
    })
    if (r.ok) return { ok: true }
    return { ok: false, status: r.status, expirada: r.status === 404 || r.status === 410, erro: (await r.text()).slice(0, 200) }
  } catch (e) {
    return { ok: false, status: 0, expirada: false, erro: e instanceof Error ? e.message : 'falha de rede' }
  }
}
