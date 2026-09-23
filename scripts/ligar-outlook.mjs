// ============================================================================
//  LIGAR O OUTLOOK NO CRM, sem entrar em portal nenhum  ·  23/09/2026
//
//  "Claude, tem que facilitar. Eu quero apenas arrastar o e-mail do Outlook
//  para dentro do sistema. Simples."
//
//  Estava certo: o passo a passo do Entra ID tinha oito telas. Isto faz as oito
//  por você. Você dá um duplo clique, faz UM login da Microsoft (o mesmo de
//  sempre, com um código de seis letras), e o script:
//
//    1. registra o aplicativo "FAM CRM" no Entra ID da FAM
//    2. cria o segredo dele, com validade de 2 anos
//    3. pede as permissões DELEGADAS (ler o e-mail de quem autorizar, e nada
//       mais) e tenta conceder o consentimento da empresa
//    4. escreve as quatro variáveis no .env.local, prontas para usar
//
//  COMO ELE FALA COM A MICROSOFT SEM INSTALAR NADA: pelo mesmo caminho do
//  `az login` — o fluxo de "código de dispositivo", com o identificador público
//  do Azure CLI, que é um aplicativo da própria Microsoft. Nada é inventado
//  aqui: é o que a ferramenta oficial faz por baixo, sem os 100 MB dela.
//
//  O QUE ELE NÃO FAZ: não lê e-mail nenhum, não toca em usuário, não muda
//  política. Cria um aplicativo e devolve as chaves dele. Se a FAM não permitir
//  que você registre aplicativos, ele para e diz exatamente isso — e aí o
//  caminho é o do documento (docs/LIGAR-OUTLOOK-NO-CRM.md), com quem for admin.
//
//  Rodar:  duplo clique em "LIGAR OUTLOOK.cmd", ou `node scripts/ligar-outlook.mjs`
// ============================================================================
import fs from 'node:fs'
import http from 'node:http'
import { spawn } from 'node:child_process'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV = path.join(RAIZ, '.env.local')

/* O identificador público do Azure CLI. Não é segredo (está na documentação da
   Microsoft e no código-fonte da CLI) e não dá poder nenhum sozinho: ele só
   serve para PEDIR um login, e o que sai desse login é um token do SEU
   usuário, com as SUAS permissões. */
const CLIENTE_CLI = '04b07795-8ddb-461a-bbee-02f9e1bf7b46'
const GRAPH = 'https://graph.microsoft.com'
const APP_GRAPH = '00000003-0000-0000-c000-000000000000'

const NOME_APP = process.env.FAM_APP_NOME || 'FAM CRM'
const URLS_VOLTA = [
  process.env.FAM_CRM_URL || 'https://fam-crm-five.vercel.app',
  'http://localhost:3000',
].map((u) => `${u.replace(/\/+$/, '')}/api/ms/callback`)

/* As permissões pedidas, e o porquê de cada uma. Nenhuma a mais: permissão
   sobrando é permissão que alguém um dia usa. */
const PERMISSOES = [
  ['Mail.Read', 'ler o e-mail de quem autorizar (é o que busca a mensagem arrastada)'],
  ['User.Read', 'saber de quem é a caixa que foi ligada'],
  ['offline_access', 'não precisar repetir o login todo dia'],
]

const cor = { ok: '\x1b[32m', erro: '\x1b[31m', tit: '\x1b[1m', fim: '\x1b[0m', fraco: '\x1b[90m' }

/* TUDO FICA NUM ARQUIVO, ALÉM DA TELA. A janela preta fecha quando se aperta a
   tecla, e na primeira tentativa o erro foi embora junto com ela — não dá para
   consertar o que ninguém viu. O log não guarda segredo: o do aplicativo é
   escrito só no .env.local. */
const LOG = path.join(RAIZ, 'ligar-outlook.log')
try { fs.writeFileSync(LOG, `Ligar o Outlook no CRM · ${new Date().toISOString()}\n\n`, 'utf8') } catch { /* segue sem log */ }
const anotar = (t) => {
  try { fs.appendFileSync(LOG, String(t).replace(/\x1b\[\d+m/g, '') + '\n', 'utf8') } catch { /* segue */ }
}
const diz = (t = '') => { console.log(t); anotar(t) }
const passo = (t) => diz(`\n${cor.tit}${t}${cor.fim}`)
const bem = (t) => diz(`  ${cor.ok}ok${cor.fim}   ${t}`)
const mal = (t) => diz(`  ${cor.erro}erro${cor.fim} ${t}`)
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

async function graph(token, caminho, opcoes = {}) {
  const r = await fetch(`${GRAPH}/v1.0${caminho}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers ?? {}),
    },
  })
  const txt = await r.text()
  let corpo = {}
  try { corpo = txt ? JSON.parse(txt) : {} } catch { corpo = { cru: txt } }
  return { ok: r.ok, status: r.status, corpo }
}

/** O erro da Microsoft, em português de gente. */
function explicar(corpo, status) {
  const msg = corpo?.error?.message || corpo?.error_description || corpo?.cru || `erro ${status}`
  if (/Authorization_RequestDenied|Insufficient privileges/i.test(msg)) {
    return 'a sua conta não tem permissão para registrar aplicativos nesta empresa. Quem tiver o papel de administrador precisa rodar isto (ou seguir docs/LIGAR-OUTLOOK-NO-CRM.md).'
  }
  if (/AADSTS50020|AADSTS700016|AADSTS50059/i.test(msg)) {
    return 'a conta do login não é do diretório da FAM (foi uma conta pessoal, como @gmail). Rode de novo e escolha "Usar outra conta" → marco.dragone@famseguradora.com.br.'
  }
  return msg
}

// ──────────────────────────────────────────────────────────── 1. o login
/* DUAS FORMAS DE ENTRAR, e a primeira não pede nada de você.

     pelo NAVEGADOR (padrão)  o script abre a página da Microsoft, você clica na
                              sua conta (a mesma do Windows) e acabou. A resposta
                              volta para um servidorzinho local que morre em
                              seguida. É o que o `az login` faz.
     pelo CÓDIGO (plano B)    se o navegador não abrir, volta o código de seis
                              letras para digitar à mão.

   O primeiro caminho existe porque o segundo já falhou na prática: código para
   copiar, janela para procurar, e no meio disso o trabalho do dia continua. */

function pkce() {
  const verificador = crypto.randomBytes(48).toString('base64url')
  const desafio = crypto.createHash('sha256').update(verificador).digest('base64url')
  return { verificador, desafio }
}

const urlAutorizar = (redirect, desafio, estado) =>
  'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?' +
  new URLSearchParams({
    client_id: CLIENTE_CLI,
    response_type: 'code',
    redirect_uri: redirect,
    response_mode: 'query',
    scope: GRAPH + '/.default offline_access',
    state: estado,
    code_challenge: desafio,
    code_challenge_method: 'S256',
    /* SEMPRE PERGUNTA QUAL CONTA. Sem isto, o navegador entra com a conta que
       já está logada nele — e a do Marco é a pessoal (@gmail), que não é do
       diretório da FAM e não pode registrar nada. O seletor aparece, ele clica
       na conta @famseguradora.com.br, e acabou. */
    prompt: 'select_account',
    ...(process.env.FAM_LOGIN ? { login_hint: process.env.FAM_LOGIN } : {}),
  })

/** A página que a pessoa vê no navegador quando o login termina. */
const PAGINA = (titulo, recado, tom) => `<!doctype html><meta charset="utf-8">
<title>${titulo}</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#f4f7fb;
 font:16px 'Segoe UI',system-ui,sans-serif;color:#26374a">
<div style="background:#fff;border:1px solid #c5d5e8;border-radius:14px;padding:32px 40px;
 text-align:center;max-width:460px;box-shadow:0 4px 14px -8px rgba(10,22,40,.4)">
  <div style="font-size:19px;font-weight:700;color:${tom};margin-bottom:8px">${titulo}</div>
  <div style="font-size:14px;line-height:1.6;color:#5a7290">${recado}</div>
</div></body>`

function abrirNavegador(url) {
  try {
    /* O `""` é o título da janela. Sem ele, o `start` do Windows trata a URL
       entre aspas COMO título e não abre nada — some sem erro nenhum. */
    spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    return true
  } catch {
    return false
  }
}

async function entrarPeloNavegador() {
  const { verificador, desafio } = pkce()
  const estado = crypto.randomBytes(16).toString('base64url')

  const servidor = http.createServer()
  try {
    await new Promise((pronto, falhou) => {
      servidor.once('error', falhou)
      servidor.listen(0, '127.0.0.1', pronto)
    })
  } catch {
    return null
  }
  const porta = servidor.address().port
  const redirect = 'http://localhost:' + porta

  const url = urlAutorizar(redirect, desafio, estado)
  diz('  ' + cor.fraco + 'abrindo o navegador para você escolher a sua conta…' + cor.fim)
  if (!abrirNavegador(url)) { servidor.close(); return null }
  diz('  ' + cor.fraco + 'se ele não abrir sozinho, cole este endereço no navegador:' + cor.fim)
  diz('  ' + cor.fraco + url + cor.fim)
  diz('')

  const codigo = await new Promise((resolver) => {
    const relogio = setTimeout(() => { try { servidor.close() } catch {} ; resolver(null) }, 5 * 60 * 1000)
    servidor.on('request', (req, res) => {
      const veio = new URL(req.url, redirect)
      if (veio.pathname !== '/') { res.writeHead(404); res.end(); return }

      const code = veio.searchParams.get('code')
      const erro = veio.searchParams.get('error_description') || veio.searchParams.get('error')
      const conferiu = veio.searchParams.get('state') === estado

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        code && conferiu
          ? PAGINA('Pronto!', 'Pode fechar esta aba e voltar para a janela preta: o resto é comigo.', '#2f7d55')
          : PAGINA('Não deu certo', erro || 'A resposta não bateu com o pedido. Rode de novo.', '#c0392b'),
      )
      clearTimeout(relogio)
      setTimeout(() => { try { servidor.close() } catch {} }, 300)
      resolver(code && conferiu ? code : null)
    })
  })
  if (!codigo) return null

  const r = await fetch('https://login.microsoftonline.com/organizations/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENTE_CLI,
      code: codigo,
      redirect_uri: redirect,
      code_verifier: verificador,
    }),
  })
  const j = await r.json()
  if (!j.access_token) {
    mal('a Microsoft não completou o login: ' + (j.error_description || j.error || 'resposta inesperada'))
    return null
  }
  return j.access_token
}

async function entrarPorCodigo() {
  const r = await fetch('https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENTE_CLI, scope: GRAPH + '/.default offline_access' }),
  })
  const d = await r.json()
  if (!d.device_code) {
    mal('não consegui começar o login: ' + (d.error_description || d.error || 'resposta inesperada'))
    process.exit(1)
  }

  diz('')
  diz('  Abra:   ' + cor.tit + d.verification_uri + cor.fim)
  diz('  Código: ' + cor.tit + d.user_code + cor.fim)
  diz('  ' + cor.fraco + 'Entre com a sua conta @famseguradora.com.br. Esperando aqui…' + cor.fim)
  diz('')
  abrirNavegador(d.verification_uri)

  const limite = Date.now() + (d.expires_in || 900) * 1000
  while (Date.now() < limite) {
    await espera((d.interval || 5) * 1000)
    const t = await fetch('https://login.microsoftonline.com/organizations/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: CLIENTE_CLI,
        device_code: d.device_code,
      }),
    })
    const j = await t.json()
    if (j.access_token) return j.access_token
    if (j.error === 'authorization_pending') continue
    if (j.error === 'slow_down') { await espera(5000); continue }
    mal('o login não foi concluído: ' + (j.error_description || j.error))
    process.exit(1)
  }
  mal('o código expirou. Rode de novo.')
  process.exit(1)
}

async function entrar() {
  passo('1 · Entrar com a sua conta da FAM')
  const pelaJanela = await entrarPeloNavegador()
  if (pelaJanela) return pelaJanela
  diz('  ' + cor.fraco + 'o navegador não respondeu; vamos pelo código.' + cor.fim)
  return entrarPorCodigo()
}

// ───────────────────────────────────────────── 2. o aplicativo e as permissões
async function acharPermissoes(token) {
  const { ok, corpo } = await graph(token, `/servicePrincipals?$filter=appId eq '${APP_GRAPH}'&$select=id,oauth2PermissionScopes`)
  if (!ok || !corpo.value?.length) return null
  const sp = corpo.value[0]
  const porNome = new Map((sp.oauth2PermissionScopes ?? []).map((s) => [s.value, s.id]))
  const faltando = PERMISSOES.filter(([nome]) => !porNome.has(nome)).map(([n]) => n)
  if (faltando.length) return null
  return {
    spGraph: sp.id,
    ids: PERMISSOES.map(([nome]) => ({ id: porNome.get(nome), type: 'Scope' })),
  }
}

async function main() {
  diz(`${cor.tit}\n  Ligar o Outlook no CRM da FAM${cor.fim}`)
  diz(`  ${cor.fraco}Registra o aplicativo, cria as chaves e escreve o .env.local.${cor.fim}`)
  diz(`  ${cor.fraco}Nenhum e-mail é lido aqui: isto só cria a permissão.${cor.fim}`)

  const token = await entrar()
  bem('login feito')

  const eu = await graph(token, '/me?$select=displayName,userPrincipalName')
  if (eu.ok) bem(`você é ${eu.corpo.displayName} (${eu.corpo.userPrincipalName})`)

  /* O DIRETÓRIO VEM DO PRÓPRIO TOKEN (`tid`), e não de uma chamada à API.
     A primeira versão perguntava em `GET /organization` — que exige a permissão
     `Organization.Read.All`, e uma conta comum não tem. O script morria aí,
     depois do login, dizendo "não consegui descobrir o diretório". O token já
     carrega o tenant: não havia nada a perguntar. */
  let tenant = ''
  try {
    const meio = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    tenant = String(meio.tid ?? '')
  } catch { /* cai no plano B */ }

  if (!tenant) {
    const org = await graph(token, '/organization?$select=id,displayName')
    tenant = org.corpo?.value?.[0]?.id ?? ''
  }
  if (!tenant) {
    mal('não consegui descobrir o diretório da FAM a partir do seu login.')
    process.exit(1)
  }
  bem(`diretório da FAM: ${tenant}`)

  passo('2 · Registrar o aplicativo')

  const perms = await acharPermissoes(token)
  if (!perms) {
    mal('não consegui ler o catálogo de permissões do Microsoft Graph.')
    process.exit(1)
  }

  /* JÁ EXISTE? Rodar duas vezes não pode criar dois aplicativos com o mesmo
     nome: no terceiro mês ninguém saberia qual é o que vale. */
  const busca = await graph(token, `/applications?$filter=displayName eq '${NOME_APP.replace(/'/g, "''")}'&$select=id,appId,displayName`)
  let app = busca.corpo?.value?.[0] ?? null

  if (app) {
    bem(`o aplicativo "${NOME_APP}" já existia: vou reaproveitar e só acertar o que falta`)
    const ajuste = await graph(token, `/applications/${app.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        web: { redirectUris: URLS_VOLTA },
        requiredResourceAccess: [{ resourceAppId: APP_GRAPH, resourceAccess: perms.ids }],
      }),
    })
    if (!ajuste.ok) { mal(explicar(ajuste.corpo, ajuste.status)); process.exit(1) }
  } else {
    const criado = await graph(token, '/applications', {
      method: 'POST',
      body: JSON.stringify({
        displayName: NOME_APP,
        signInAudience: 'AzureADMyOrg',
        web: { redirectUris: URLS_VOLTA },
        requiredResourceAccess: [{ resourceAppId: APP_GRAPH, resourceAccess: perms.ids }],
      }),
    })
    if (!criado.ok) { mal(explicar(criado.corpo, criado.status)); process.exit(1) }
    app = criado.corpo
    bem(`aplicativo "${NOME_APP}" registrado`)
    // O Entra leva alguns segundos para propagar o registro novo.
    await espera(6000)
  }

  for (const [nome, porque] of PERMISSOES) diz(`       ${cor.fraco}· ${nome} — ${porque}${cor.fim}`)
  diz(`       ${cor.fraco}· volta em: ${URLS_VOLTA.join('  e  ')}${cor.fim}`)

  passo('3 · Criar o segredo')
  const segredo = await graph(token, `/applications/${app.id}/addPassword`, {
    method: 'POST',
    body: JSON.stringify({
      passwordCredential: {
        displayName: 'CRM (criado pelo LIGAR OUTLOOK)',
        endDateTime: new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000).toISOString(),
      },
    }),
  })
  if (!segredo.ok || !segredo.corpo.secretText) {
    mal(explicar(segredo.corpo, segredo.status))
    process.exit(1)
  }
  bem('segredo criado (validade de 2 anos)')

  passo('4 · Autorizar a empresa')
  let consentido = false
  const sp = await graph(token, '/servicePrincipals', {
    method: 'POST',
    body: JSON.stringify({ appId: app.appId }),
  })
  const spId = sp.ok ? sp.corpo.id : null
  if (spId) {
    const grant = await graph(token, '/oauth2PermissionGrants', {
      method: 'POST',
      body: JSON.stringify({
        clientId: spId,
        consentType: 'AllPrincipals',
        resourceId: perms.spGraph,
        scope: PERMISSOES.map(([n]) => n).join(' '),
      }),
    })
    consentido = grant.ok
    if (grant.ok) bem('consentimento concedido para a FAM inteira: ninguém mais vê tela de permissão')
  }
  if (!consentido) {
    diz(`  ${cor.fraco}não consegui conceder o consentimento da empresa (é preciso ser administrador).${cor.fim}`)
    diz(`  ${cor.fraco}Não trava nada: cada pessoa autoriza a própria caixa no primeiro arrasto,${cor.fim}`)
    diz(`  ${cor.fraco}desde que a FAM permita. Se aparecer "precisa de aprovação do administrador",${cor.fim}`)
    diz(`  ${cor.fraco}peça a quem administra o Microsoft 365 para rodar este mesmo arquivo.${cor.fim}`)
  }

  passo('5 · Escrever o .env.local')
  const valores = {
    MS_TENANT_ID: tenant,
    MS_CLIENT_ID: app.appId,
    MS_CLIENT_SECRET: segredo.corpo.secretText,
    MS_TOKEN_KEY: crypto.randomBytes(32).toString('base64'),
  }

  let texto = ''
  try { texto = fs.readFileSync(ENV, 'utf8') } catch { texto = '' }

  /* A CHAVE QUE JÁ EXISTE É TROCADA NO LUGAR; a que não existe entra no fim.
     Nada mais do arquivo é tocado: ele guarda a chave da Anthropic, a do
     Supabase e a do Serasa, e um script que reescreve tudo é um script que um
     dia apaga o que não devia. A cópia de segurança fica ao lado. */
  if (texto) {
    fs.writeFileSync(`${ENV}.bak-${new Date().toISOString().slice(0, 10)}`, texto, 'utf8')
  }
  const fim = texto.includes('\r\n') ? '\r\n' : '\n'
  for (const [chave, valor] of Object.entries(valores)) {
    const linha = `${chave}=${valor}`
    const achou = new RegExp(`^${chave}=.*$`, 'm')
    if (achou.test(texto)) texto = texto.replace(achou, linha)
    else texto = texto.replace(/\s*$/, '') + fim + linha
  }
  if (!/MS_TENANT_ID/.test(texto)) texto += fim
  fs.writeFileSync(ENV, texto.replace(/\s*$/, '') + fim, 'utf8')

  bem('as quatro variáveis foram escritas')
  anotar('(o segredo não é escrito neste log)')
  diz(`       ${cor.fraco}MS_TENANT_ID=${tenant}${cor.fim}`)
  diz(`       ${cor.fraco}MS_CLIENT_ID=${app.appId}${cor.fim}`)
  diz(`       ${cor.fraco}MS_CLIENT_SECRET=(guardado, não vou imprimir)${cor.fim}`)
  diz(`       ${cor.fraco}MS_TOKEN_KEY=(nova, aleatória)${cor.fim}`)

  /* O CRM QUE A EQUIPE USA É O PUBLICADO, e ele lê as variáveis da Vercel, não
     deste arquivo. Sem este passo, ligar o Outlook funcionaria só na máquina
     do Marco — que é o contrário do pedido ("tem que ser de uma forma que os
     colegas possam usar também"). O arquivo abaixo existe para colar de uma
     vez só: a Vercel aceita várias linhas de uma vez. */
  const paraVercel = path.join(RAIZ, 'COLAR-NA-VERCEL.txt')
  fs.writeFileSync(
    paraVercel,
    [
      '# Cole TUDO isto de uma vez em:',
      '#   vercel.com → projeto fam-crm → Settings → Environment Variables',
      '#   (marque Production, Preview e Development) e depois refaça o deploy.',
      '#',
      '# É o que faz o ARRASTAR funcionar para o Abenaias, a Isabela e o Ivan,',
      '# que usam o CRM publicado e não esta máquina.',
      '#',
      '# APAGUE este arquivo depois de colar: ele tem o segredo do aplicativo.',
      '',
      ...Object.entries(valores).map(([k, v]) => `${k}=${v}`),
      '',
    ].join('\r\n'),
    'utf8',
  )
  bem('gerei COLAR-NA-VERCEL.txt (para a equipe usar o CRM publicado)')

  diz(`\n${cor.ok}${cor.tit}  Pronto. Faltam dois passos seus:${cor.fim}`)
  diz(`\n  ${cor.tit}1.${cor.fim} Aqui na máquina: duplo clique em ${cor.tit}"REINICIAR CRM.cmd"${cor.fim}`)
  diz(`  ${cor.tit}2.${cor.fim} Para a equipe: abra ${cor.tit}COLAR-NA-VERCEL.txt${cor.fim} e cole o conteúdo em`)
  diz(`     vercel.com → fam-crm → Settings → Environment Variables → refazer o deploy`)
  diz(`     ${cor.fraco}(depois apague o arquivo: ele tem o segredo)${cor.fim}`)

  diz(`\n${cor.tit}  E os colegas?${cor.fim} Não instalam nada, não mexem na máquina deles.`)
  diz('  Entram no CRM pelo navegador, vão em Comercial → Entrada de pedidos,')
  diz('  arrastam o e-mail e clicam uma vez em "Ligar minha caixa do Outlook".')
  diz(`  ${consentido ? '  Como o consentimento da empresa foi concedido, nem tela de permissão eles veem.' : '  (Cada um autoriza a própria caixa nesse clique.)'}`)
  diz('')
}

main().catch((e) => {
  mal(e instanceof Error ? e.message : String(e))
  diz('')
  diz(`  O que aconteceu ficou guardado em: ligar-outlook.log`)
  diz(`  Mande esse arquivo para o Claude que ele resolve.`)
  process.exit(1)
})
