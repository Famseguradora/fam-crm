/* REGISTRAR O CRM NO MICROSOFT 365, DE DENTRO DO CRM  ·  23/09/2026
   ═══════════════════════════════════════════════════════════════════════════

   Ordem dele, e ela desmonta a versão anterior: "não sou o admin dessa conta de
   e-mails... isso tem que ser feito para todos os usuários, vão acessar somente
   o CRM e pronto. Se tiver que clicar em algum botão de ligar o Outlook, tudo
   bem, mas tem que ficar dentro do CRM também".

   O QUE ESTAVA ERRADO: o registro era um `.cmd` na máquina dele, que escrevia
   variáveis num arquivo. A equipe usa o CRM PUBLICADO, que não lê arquivo
   nenhum da máquina de ninguém — então aquilo nunca serviria para eles.

   AGORA SÃO DOIS BOTÕES, os dois dentro do CRM:

     "Registrar o CRM no Microsoft 365"   uma vez, por quem puder registrar
                                          aplicativos na FAM. Cria o aplicativo
                                          e guarda o resultado no banco.
     "Ligar minha caixa do Outlook"       cada pessoa, uma vez, no navegador.

   COMO O SERVIDOR FAZ LOGIN NA MICROSOFT sem abrir navegador nenhum: pelo
   fluxo de código de dispositivo, com o identificador público do Azure CLI —
   o mesmo caminho do `az login`. A tela mostra o código, a pessoa digita na
   página da Microsoft, e o servidor confere. O código em andamento fica em
   `ms_registro_pendente` porque em produção não há memória que sobreviva de
   uma requisição para a outra.

   O QUE ELE CRIA, e nada além: um aplicativo com permissões DELEGADAS
   (Mail.Read, User.Read, offline_access). Nenhuma permissão de aplicativo,
   que leria a caixa da empresa inteira sem ninguém autorizar. */

const GRAPH = 'https://graph.microsoft.com'
const APP_GRAPH = '00000003-0000-0000-c000-000000000000'
/** O identificador público do Azure CLI: documentado pela Microsoft, e sozinho
 *  não dá poder nenhum — o poder é o do usuário que faz o login. */
export const CLIENTE_CLI = '04b07795-8ddb-461a-bbee-02f9e1bf7b46'

export const PERMISSOES = ['Mail.Read', 'Mail.Read.Shared', 'User.Read', 'offline_access'] as const
export const NOME_APP = 'FAM CRM'

export interface CodigoDeLogin {
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
  expires_in: number
}

/** Pede à Microsoft o código que a pessoa vai digitar. */
export async function pedirCodigo(): Promise<{ ok: true; codigo: CodigoDeLogin } | { ok: false; erro: string }> {
  const r = await fetch('https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENTE_CLI, scope: `${GRAPH}/.default offline_access` }),
  })
  const d = await r.json().catch(() => ({}))
  if (!d.device_code) return { ok: false, erro: d.error_description ?? d.error ?? 'A Microsoft não devolveu o código.' }
  return {
    ok: true,
    codigo: {
      device_code: d.device_code,
      user_code: d.user_code,
      verification_uri: d.verification_uri ?? 'https://microsoft.com/devicelogin',
      interval: Number(d.interval ?? 5),
      expires_in: Number(d.expires_in ?? 900),
    },
  }
}

export type Espiada =
  | { estado: 'esperando' }
  | { estado: 'pronto'; token: string }
  | { estado: 'erro'; erro: string }

/** Olha uma vez se a pessoa já terminou o login. Nunca fica em laço: quem
 *  insiste é a tela, de cinco em cinco segundos. Laço no servidor seria uma
 *  requisição pendurada por quinze minutos. */
export async function espiarLogin(deviceCode: string): Promise<Espiada> {
  const r = await fetch('https://login.microsoftonline.com/organizations/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: CLIENTE_CLI,
      device_code: deviceCode,
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (j.access_token) return { estado: 'pronto', token: j.access_token }
  if (j.error === 'authorization_pending' || j.error === 'slow_down') return { estado: 'esperando' }
  return { estado: 'erro', erro: explicar(j.error_description ?? j.error ?? 'o login não foi concluído') }
}

/** O erro da Microsoft, em português de gente. */
export function explicar(msg: string): string {
  if (/Authorization_RequestDenied|Insufficient privileges/i.test(msg)) {
    return 'esta conta não tem permissão para registrar aplicativos na FAM. Quem administra o Microsoft 365 precisa fazer este passo (é o mesmo botão, com a conta dele).'
  }
  if (/AADSTS50020|AADSTS700016|AADSTS50059/i.test(msg)) {
    return 'a conta usada não é do diretório da FAM (foi uma conta pessoal, como @gmail). Repita escolhendo a conta @famseguradora.com.br.'
  }
  if (/expired_token|code_expired/i.test(msg)) return 'o código expirou. Comece de novo.'
  return msg
}

/* O QUE O GRAPH DEVOLVE, só na parte que este arquivo lê. Tipar a resposta
   inteira seria copiar a documentação da Microsoft para dentro do CRM; tipar
   nada deixaria erro de digitação passar. O meio-termo é este. */
interface CorpoGraph {
  id?: string
  appId?: string
  secretText?: string
  displayName?: string
  userPrincipalName?: string
  value?: {
    id?: string
    appId?: string
    oauth2PermissionScopes?: { id: string; value: string }[]
  }[]
  error?: { message?: string; code?: string }
  cru?: string
}

async function graph(token: string, caminho: string, opcoes: RequestInit = {}) {
  const r = await fetch(`${GRAPH}/v1.0${caminho}`, {
    ...opcoes,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opcoes.headers ?? {}) },
  })
  const txt = await r.text()
  let corpo: CorpoGraph = {}
  try { corpo = txt ? JSON.parse(txt) : {} } catch { corpo = { cru: txt } }
  return { ok: r.ok, status: r.status, corpo }
}

export interface Registro {
  tenant_id: string
  client_id: string
  secret: string
  secret_expira: string | null
  consentido: boolean
  quem: string | null
}

/**
 * Cria (ou atualiza) o aplicativo do CRM no Entra ID da FAM.
 *
 * `voltas` são os endereços para onde a Microsoft devolve a pessoa depois do
 * login — o CRM publicado e o CRM rodando na máquina. Os dois precisam estar
 * no registro, senão um deles recusa o login com "redirect_uri mismatch".
 */
export async function registrarAplicativo(
  token: string,
  voltas: string[],
): Promise<{ ok: true; registro: Registro } | { ok: false; erro: string }> {
  /* O DIRETÓRIO VEM DO PRÓPRIO TOKEN. Perguntar em `GET /organization` exige
     uma permissão que conta comum não tem — e foi exatamente aí que a primeira
     versão morreu, depois do login, sem explicação. */
  let tenant = ''
  try {
    const meio = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    tenant = String(meio.tid ?? '')
  } catch { /* cai no plano B */ }
  if (!tenant) {
    const org = await graph(token, '/organization?$select=id')
    tenant = org.corpo?.value?.[0]?.id ?? ''
  }
  if (!tenant) return { ok: false, erro: 'Não consegui descobrir o diretório da FAM a partir deste login.' }

  const eu = await graph(token, '/me?$select=displayName,userPrincipalName')
  const quem = eu.ok ? (eu.corpo.userPrincipalName ?? eu.corpo.displayName ?? null) : null

  // Os identificadores das permissões, lidos do catálogo (em vez de fixos aqui).
  const sp = await graph(token, `/servicePrincipals?$filter=appId eq '${APP_GRAPH}'&$select=id,oauth2PermissionScopes`)
  const catalogo = sp.corpo?.value?.[0]
  if (!catalogo) return { ok: false, erro: 'Não consegui ler o catálogo de permissões do Microsoft Graph.' }
  const porNome = new Map<string, string>(
    (catalogo.oauth2PermissionScopes ?? []).map((s) => [s.value, s.id]),
  )
  const acesso = PERMISSOES.map((p) => ({ id: porNome.get(p), type: 'Scope' })).filter((a) => a.id)
  if (acesso.length !== PERMISSOES.length) {
    return { ok: false, erro: 'O catálogo do Microsoft Graph não trouxe todas as permissões necessárias.' }
  }

  const corpoApp = {
    displayName: NOME_APP,
    signInAudience: 'AzureADMyOrg',
    web: { redirectUris: voltas },
    requiredResourceAccess: [{ resourceAppId: APP_GRAPH, resourceAccess: acesso }],
  }

  /* JÁ EXISTE? Registrar duas vezes criaria dois aplicativos com o mesmo nome,
     e no mês seguinte ninguém saberia qual é o que vale. */
  const busca = await graph(token, `/applications?$filter=displayName eq '${NOME_APP}'&$select=id,appId`)
  let app: { id?: string; appId?: string } | null = busca.corpo?.value?.[0] ?? null

  if (app) {
    const ajuste = await graph(token, `/applications/${app.id}`, { method: 'PATCH', body: JSON.stringify(corpoApp) })
    if (!ajuste.ok) return { ok: false, erro: explicar(ajuste.corpo?.error?.message ?? `erro ${ajuste.status}`) }
  } else {
    const criado = await graph(token, '/applications', { method: 'POST', body: JSON.stringify(corpoApp) })
    if (!criado.ok) return { ok: false, erro: explicar(criado.corpo?.error?.message ?? `erro ${criado.status}`) }
    app = { id: criado.corpo.id, appId: criado.corpo.appId }
    // O Entra leva alguns segundos para o registro novo valer em toda parte.
    await new Promise((r) => setTimeout(r, 6000))
  }

  const expira = new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000).toISOString()
  const segredo = await graph(token, `/applications/${app.id}/addPassword`, {
    method: 'POST',
    body: JSON.stringify({ passwordCredential: { displayName: 'CRM', endDateTime: expira } }),
  })
  if (!segredo.ok || !segredo.corpo.secretText) {
    return { ok: false, erro: explicar(segredo.corpo?.error?.message ?? `erro ${segredo.status}`) }
  }

  /* O CONSENTIMENTO DA EMPRESA é opcional e só o admin consegue. Com ele,
     ninguém mais vê tela de permissão; sem ele, cada pessoa autoriza a própria
     caixa no primeiro arrasto — desde que a FAM permita. Falhar aqui não
     invalida o registro. */
  let consentido = false
  const novoSp = await graph(token, '/servicePrincipals', { method: 'POST', body: JSON.stringify({ appId: app.appId }) })
  if (novoSp.ok && novoSp.corpo?.id) {
    const grant = await graph(token, '/oauth2PermissionGrants', {
      method: 'POST',
      body: JSON.stringify({
        clientId: novoSp.corpo.id,
        consentType: 'AllPrincipals',
        resourceId: catalogo.id,
        scope: PERMISSOES.join(' '),
      }),
    })
    consentido = grant.ok
  }

  /* Sem identificador do aplicativo não há registro nenhum: melhor recusar
     aqui do que gravar uma linha pela metade que só falharia no primeiro
     arrasto de alguém. */
  if (!app.appId) return { ok: false, erro: 'A Microsoft criou o aplicativo mas não devolveu o identificador dele. Tente de novo.' }

  return {
    ok: true,
    registro: {
      tenant_id: tenant,
      client_id: app.appId,
      secret: segredo.corpo.secretText,
      secret_expira: expira,
      consentido,
      quem,
    },
  }
}
