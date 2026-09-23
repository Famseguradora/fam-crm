/* A CONVERSA COM O MICROSOFT 365  ·  23/09/2026
   ═══════════════════════════════════════════════════════════════════════════

   Existe por um motivo só: o Novo Outlook não entrega o arquivo do e-mail para
   o navegador, mas entrega o IDENTIFICADOR dele no arrasto
   (`lib/email/arrasto-outlook.ts`). Com o identificador, o Microsoft Graph
   devolve o e-mail inteiro em MIME — o mesmo conteúdo de um `.eml` salvo à
   mão, com anexos. O arrastar volta a ser um passo só.

   CADA UM CONECTA A PRÓPRIA CAIXA, e isso não é detalhe de implementação: é a
   regra. O CRM pede permissão DELEGADA (o fluxo de login da Microsoft, com a
   pessoa vendo o que está autorizando) e guarda o consentimento daquela
   pessoa. Não existe aqui uma chave que leia a caixa de todo mundo — seria
   mais fácil de programar e seria a porta dos fundos que este projeto inteiro
   existe para não ter. É o mesmo princípio de "quem liga a caixa é o dono".

   O QUE FICA GUARDADO é o `refresh_token`, cifrado, na tabela `ms_conexoes`,
   que nenhuma sessão de navegador enxerga (RLS sem policy: só o servidor, com
   a chave de serviço, chega lá). O token de acesso, que vale uma hora, nunca é
   gravado: é pedido na hora de usar e esquecido em seguida.

   O QUE PRECISA ESTAR NO AMBIENTE (sem isso, o CRM diz o que falta em vez de
   fingir que funciona):
     MS_TENANT_ID      o diretório da FAM no Entra ID
     MS_CLIENT_ID      o aplicativo registrado
     MS_CLIENT_SECRET  o segredo dele
     MS_TOKEN_KEY      (opcional) a chave que cifra o refresh_token guardado;
                       sem ela, a chave é derivada do próprio MS_CLIENT_SECRET
*/

import crypto from 'node:crypto'

/* O QUE O CRM PEDE, e por que cada um (23/09/2026):

     Mail.Read         ler a caixa de quem autorizou. É o que busca o e-mail
                       arrastado — e é também o que permite o CRM MOSTRAR a
                       caixa, sem o Carteiro e sem o Outlook aberto.
     Mail.Read.Shared  as caixas compartilhadas a que essa pessoa já tem acesso
                       (a caixa do Comercial é uma). Sem esta, `Mail.Read` só
                       alcança a caixa pessoal, e o pedido ao administrador
                       teria que ser feito duas vezes.
     User.Read         saber de quem é a caixa que foi ligada.
     offline_access    não repetir o login todo dia.

   Nenhuma permissão de ESCRITA: o CRM não manda, não apaga e não move e-mail.
   E nenhuma permissão de aplicativo, que leria a caixa de quem não autorizou. */
export const ESCOPOS = [
  'offline_access', 'openid', 'profile', 'email',
  'User.Read', 'Mail.Read', 'Mail.Read.Shared',
] as const

/** O aplicativo registrado, já com o segredo decifrado. */
export interface AppRegistrado {
  tenant_id: string
  client_id: string
  secret: string
}

export interface ConfigMS {
  tenant: string
  clientId: string
  clientSecret: string
  redirect: string
}

/** A configuração, ou o que falta nela. Nunca joga: quem chama decide o que
 *  dizer na tela, e a tela diz a verdade ("falta a variável X"). */
export function configMS(base?: string, doBanco?: AppRegistrado | null): { ok: true; cfg: ConfigMS } | { ok: false; falta: string[] } {
  /* O REGISTRO FEITO PELA TELA VENCE O AMBIENTE. Ele é o caminho normal desde
     23/09/2026: a equipe usa o CRM publicado, e ninguém vai editar arquivo em
     máquina nenhuma. As variáveis continuam funcionando para quem já as tinha. */
  const tenant = doBanco?.tenant_id || process.env.MS_TENANT_ID || ''
  const clientId = doBanco?.client_id || process.env.MS_CLIENT_ID || ''
  const clientSecret = doBanco?.secret || process.env.MS_CLIENT_SECRET || ''
  if (!tenant || !clientId || !clientSecret) {
    return { ok: false, falta: ['registro'] }
  }

  /* O ENDEREÇO DE VOLTA. Em produção é o do CRM publicado; rodando na máquina,
     é o localhost. Os dois precisam estar registrados no aplicativo do Entra,
     senão a Microsoft recusa o login com "redirect_uri mismatch". */
  const origem = (base || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
  return { ok: true, cfg: { tenant, clientId, clientSecret, redirect: `${origem}/api/ms/callback` } }
}

// ─────────────────────────────────────────────────────────── o cofre do token

/* AES-256-GCM. O refresh_token é a chave da caixa de e-mail de uma pessoa:
   guardá-lo em texto puro seria transformar um vazamento de banco num
   vazamento de correspondência. O GCM também autentica: adulterar o registro
   faz a decifragem falhar em vez de devolver lixo. */
function chave(): Buffer {
  /* DE ONDE VEM A CHAVE, em ordem de preferência:
       MS_TOKEN_KEY               quando alguém quis uma chave só para isto
       SUPABASE_SERVICE_ROLE_KEY  o segredo que o servidor já tem, sempre
       MS_CLIENT_SECRET           o modo antigo, de quando havia .env

     A do meio é o que permite ligar o Outlook SEM configurar variável nenhuma:
     o CRM publicado já tem a chave de serviço, e ela nunca sai do servidor. O
     preço está escrito no documento: trocar a chave de serviço obriga a
     reconectar as caixas, porque o que estava cifrado com ela deixa de abrir. */
  const material = process.env.MS_TOKEN_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.MS_CLIENT_SECRET
    || ''
  if (!material) throw new Error('Sem chave para cifrar o token guardado.')
  return crypto.scryptSync(material, 'fam-crm-ms-conexoes', 32)
}

export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv)
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), dados.toString('base64')].join('.')
}

export function decifrar(guardado: string): string {
  const [iv, tag, dados] = String(guardado).split('.')
  if (!iv || !tag || !dados) throw new Error('Token guardado em formato desconhecido.')
  const d = crypto.createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]).toString('utf8')
}

// ──────────────────────────────────────────────────────────────────── o login

/** O par PKCE. Mesmo com segredo do lado do servidor, o desafio impede que um
 *  `code` interceptado seja trocado por token em outro lugar. */
export function parPKCE() {
  const verificador = crypto.randomBytes(48).toString('base64url')
  const desafio = crypto.createHash('sha256').update(verificador).digest('base64url')
  return { verificador, desafio }
}

export function urlDeLogin(cfg: ConfigMS, estado: string, desafio: string, dica?: string) {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: cfg.redirect,
    response_mode: 'query',
    scope: ESCOPOS.join(' '),
    state: estado,
    code_challenge: desafio,
    code_challenge_method: 'S256',
    /* SEMPRE PERGUNTA QUAL CONTA. Sem isto, a Microsoft entra com a que já
       está no navegador — e se for uma conta pessoal, recusa com "não existe
       neste diretório", que é um erro que ninguém sabe o que fazer com. */
    prompt: 'select_account',
  })
  // A dica só entra quando alguém disse a caixa: nunca o e-mail do login do CRM.
  if (dica && dica.includes('@')) p.set('login_hint', dica)
  return `https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/authorize?${p}`
}

interface RespostaToken {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

async function pedirToken(cfg: ConfigMS, corpo: Record<string, string>): Promise<RespostaToken> {
  const r = await fetch(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      ...corpo,
    }),
  })
  return (await r.json().catch(() => ({}))) as RespostaToken
}

export const trocarCodigo = (cfg: ConfigMS, codigo: string, verificador: string) =>
  pedirToken(cfg, {
    grant_type: 'authorization_code',
    code: codigo,
    redirect_uri: cfg.redirect,
    code_verifier: verificador,
    scope: ESCOPOS.join(' '),
  })

export const renovar = (cfg: ConfigMS, refresh: string) =>
  pedirToken(cfg, {
    grant_type: 'refresh_token',
    refresh_token: refresh,
    scope: ESCOPOS.join(' '),
  })

// ────────────────────────────────────────────────────────────────── o e-mail

/** Quem é o dono do token. Serve para gravar a conta conectada e para conferir,
 *  na hora de buscar, se a caixa do arrasto é a mesma que a pessoa conectou. */
export async function quemSou(acesso: string): Promise<{ conta: string | null; nome: string | null }> {
  const r = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName', {
    headers: { Authorization: `Bearer ${acesso}` },
  })
  if (!r.ok) return { conta: null, nome: null }
  const j = (await r.json().catch(() => ({}))) as { mail?: string; userPrincipalName?: string; displayName?: string }
  return {
    conta: (j.mail || j.userPrincipalName || '').toLowerCase() || null,
    nome: j.displayName ?? null,
  }
}

export type ResultadoMIME =
  | { ok: true; mime: Buffer }
  | { ok: false; erro: string; status: number }

/**
 * Baixa o e-mail inteiro, em MIME (o mesmo conteúdo de um .eml salvo à mão).
 *
 * O id que o arrasto entrega vem no formato do Exchange antigo (EWS). Às vezes
 * o Graph o aceita direto; quando não aceita, ele mesmo converte, pela API de
 * tradução de ids. Tentar e converter é mais confiável do que adivinhar o
 * formato pelo tamanho da string.
 */
export async function baixarMIME(acesso: string, id: string): Promise<ResultadoMIME> {
  const tentar = async (qual: string) =>
    fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(qual)}/$value`, {
      headers: { Authorization: `Bearer ${acesso}` },
    })

  let r = await tentar(id)

  if (!r.ok && (r.status === 400 || r.status === 404)) {
    const traduzido = await traduzirId(acesso, id)
    if (traduzido) r = await tentar(traduzido)
  }

  if (!r.ok) {
    /* O CORPO DA RESPOSTA FICA NO LOG, e não na tela. Era ele que ia para o
       aviso do usuário, e resposta de erro de API costuma trazer identificador
       de requisição, nome de propriedade interna e caminho — nada disso ajuda
       quem está tentando abrir um caso, e tudo isso vaza se a tela for
       fotografada ou se a URL de volta acabar no Referer de outro site. */
    const detalhe = await r.text().catch(() => '')
    console.error(`[ms/graph] baixarMIME respondeu ${r.status}:`, detalhe.slice(0, 500))

    if (r.status === 401 || r.status === 403) {
      return { ok: false, status: r.status, erro: 'O Microsoft 365 recusou a leitura deste e-mail. Conecte a caixa de novo.' }
    }
    if (r.status === 404) {
      return { ok: false, status: 404, erro: 'Não achei este e-mail na sua caixa. Ele pode ter sido movido ou apagado.' }
    }
    return {
      ok: false,
      status: r.status,
      erro: `O Microsoft 365 não entregou o e-mail agora (erro ${r.status}). Tente de novo em instantes; se insistir, salve o e-mail e solte o arquivo aqui.`,
    }
  }

  return { ok: true, mime: Buffer.from(await r.arrayBuffer()) }
}

/** Converte o id do Exchange antigo (EWS) no id que o Graph usa. */
export async function traduzirId(acesso: string, id: string): Promise<string | null> {
  const r = await fetch('https://graph.microsoft.com/v1.0/me/translateExchangeIds', {
    method: 'POST',
    headers: { Authorization: `Bearer ${acesso}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputIds: [id], sourceIdType: 'ewsId', targetIdType: 'restId' }),
  })
  if (!r.ok) return null
  const j = (await r.json().catch(() => ({}))) as { value?: { targetId?: string }[] }
  return j.value?.[0]?.targetId ?? null
}
