// ============================================================================
//  O ROBÔ DO SERASA  ·  a consulta pelo navegador, sem API (14/09/2026)
// ============================================================================
//
//  Pedido do Marco: quando faltar o Serasa, o sistema busca sozinho, pelo
//  navegador, com o login da FAM. As decisões dele, de 14/09/2026:
//
//    login      o da FAM, num Chrome SÓ DO ROBÔ nesta máquina (perfil em
//               %LOCALAPPDATA%\fam-serasa\chrome). Ele entra uma vez e a sessão
//               fica. Nenhuma senha é guardada aqui.
//    código     se o Serasa pedir código, ele chega no e-mail do Marco, e o robô
//               está AUTORIZADO a ler e digitar (pelo outlook.ps1, só leitura).
//    quando     na esteira, só quando falta o Serasa: cada consulta é cobrada.
//    resultado  o PDF vai para a pasta do tomador e a esteira segue sozinha.
//
//  NUNCA ACEITAR EXTRA (ordem dele). O portal oferece o relatório dos sócios,
//  "Incluir no relatório", "Monitorar", consulta mensal e a IA do Serasa. Este
//  arquivo trabalha por LISTA DE PERMISSÃO: só toca no campo do CNPJ, no botão
//  "Gerar relatório" e no "Não, obrigado". A única exceção é a tela do código de
//  confirmação (campo do código e o botão de confirmar), que vem ANTES da
//  consulta e não cobra nada. O PDF sai pelo protocolo do próprio Chrome, sem
//  nem clicar em "Salvar ou imprimir".
//
//  O QUE CUSTOU DINHEIRO NO MAPEAMENTO, e virou regra:
//    · ENTER NO CAMPO GERA O RELATÓRIO (a dica do portal diz, e só foi lida
//      depois). Enter seguido do botão gerou o Usiblend DUAS vezes. Aqui o CNPJ
//      entra com Tab, e o robô confere UM chip só antes do único clique.
//    · O AVISO DOS SÓCIOS ("Deseja gerar também o relatório dos 2 principais
//      sócios?", cobrado) aparece na hora de gerar. Resposta: "Não, obrigado".
//
//  NÃO COMPRA DUAS VEZES. Toda consulta fica guardada FORA do OneDrive
//  (%LOCALAPPDATA%\fam-serasa\relatorios), e por 30 dias o mesmo CNPJ é COPIADO
//  dali em vez de consultado de novo. Aba de relatório do mesmo CNPJ aberta hoje
//  também é aproveitada: foi assim que o Usiblend, já pago, virou o primeiro PDF.
//
//  COMO USAR
//    node scripts/serasa.mjs diagnostico                   a sessão está de pé?
//    node scripts/serasa.mjs ensaio <cnpj>                 tudo até ANTES de gerar
//    node scripts/serasa.mjs consultar <cnpj> "<pasta>"    consulta e salva o PDF
//         (--forcar consulta mesmo com relatório guardado dos últimos 30 dias)
//    node scripts/serasa.mjs salvar-aberto <cnpj> "<pasta>" só salva o que já está
//         aberto na janela do robô; nunca gera, nunca cobra
// ============================================================================

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const BASE = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'fam-serasa')
const PERFIL = path.join(BASE, 'chrome')
const GUARDADOS = path.join(BASE, 'relatorios')
const REGISTRO = path.join(BASE, 'consultas.json')
const TRAVA = path.join(BASE, 'consultando.trava')
const PORTA = 9333
const CDP = `http://127.0.0.1:${PORTA}`
export const PORTAL = 'https://cs-reports-web-prod.serasaexperian.com.br/relatorioavancado/home'
const DIAS_REAPROVEITA = 30
const LOGIN = 'https://empresas.serasaexperian.com.br/meus-produtos/login'
/* O recibo da última tentativa de login automático. Senha recusada NUNCA é
   tentada de novo enquanto o .env.local não mudar: errar em laço bloqueia a
   conta da FAM. Falha por outro motivo espera 30 minutos. */
const TENTATIVA_LOGIN = path.join(BASE, 'login-tentativa.json')
const ENV_LOCAL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local')

// A lista de permissão, num lugar só.
const CAMPO = '#input-multiple-document'
const CHIP = 'mat-chip-row'
const TIRAR_CHIP = 'button.mat-mdc-chip-remove'
const GERAR = /Gerar relat/i
const RECUSAR = /N[ãa]o,?\s*obrigad/i
// As duas abas do portal. O sócio pessoa física sai pela de CPF.
const ABA = { PJ: 'CNPJ - Pessoa jurídica', PF: 'CPF - Pessoa física' }

const digitos = (v) => String(v ?? '').replace(/\D/g, '')
const hoje = () => new Date().toISOString().slice(0, 10)
const hojeBR = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const lerJson = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')) } catch { return padrao } }

// ── o Chrome do robô ────────────────────────────────────────────────────────
/* UM CHROME PRÓPRIO, ABERTO COMO GENTE ABRE. O Playwright não lança o
   navegador: o Chrome sobe normal, com a porta de depuração, e o robô se liga
   nele. Assim não carrega a marca de "navegador automatizado" que faz o Serasa
   desconfiar e pedir código. O perfil é outro diretório, e por isso o Chrome
   do Marco, com as senhas dele, nunca é tocado. */
async function chromeDePe() {
  try { return (await fetch(`${CDP}/json/version`, { signal: AbortSignal.timeout(2000) })).ok } catch { return false }
}

function acharChrome() {
  return [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]
    .filter(Boolean)
    .map((b) => path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    .find((p) => fs.existsSync(p))
}

async function conectar() {
  if (!(await chromeDePe())) {
    const exe = acharChrome()
    if (!exe) throw new Error('Não achei o Google Chrome instalado nesta máquina.')
    fs.mkdirSync(PERFIL, { recursive: true })
    /* JANELA COM NOME (15/09/2026): o Marco usa várias janelas do Chrome, algumas
       da conta pessoal. Esta é outra instância, com perfil próprio, e o robô só
       fala com ela (porta 9333): as outras janelas ele não enxerga. O nome serve
       para ele reconhecer a do robô na barra de tarefas. */
    spawn(exe, [`--user-data-dir=${PERFIL}`, `--remote-debugging-port=${PORTA}`, '--window-name=Robô do Serasa (FAM)', '--no-first-run', '--no-default-browser-check', PORTAL],
      { detached: true, stdio: 'ignore' }).unref()
    for (let i = 0; i < 40 && !(await chromeDePe()); i++) await esperar(500)
    if (!(await chromeDePe())) throw new Error('Abri o Chrome do robô, mas ele não respondeu.')
  }
  // close() numa conexão por CDP só DESCONECTA: o Chrome e a sessão continuam.
  return chromium.connectOverCDP(CDP)
}

/* UMA ABA SÓ (15/09/2026, pedido do Marco). O robô trabalha sempre na mesma aba
   da janela dele: a do Relatório Avançado, senão uma do Serasa já logada, senão
   a primeira que houver. Aba nova só se a janela estiver vazia. */
async function abaDoRobo(ctx) {
  const abas = ctx.pages()
  return abas.find((p) => p.url().includes('/relatorioavancado/'))
    || abas.find((p) => p.url().includes('serasaexperian') && !p.url().includes('/login'))
    || abas.find((p) => p.url().includes('serasaexperian'))
    || abas[0]
    || await ctx.newPage()
}

/* Depois do trabalho, fecha as outras abas da janela do robô (o "Acessar" do
   produto abre aba nova). Fica aberta a aba de um relatório já cobrado cujo PDF
   não saiu: é o único jeito de salvá-lo sem pagar outra consulta. */
async function ficarComUmaAba(ctx, fica) {
  if (!fica || fica.isClosed()) return
  for (const p of ctx.pages()) {
    if (p === fica) continue
    if (p.url().includes('/relatorioavancado/report')) {
      const cab = await cabecalho(p).catch(() => null)
      if (!cab || consultaRecente(digitos(cab.documento))?.gerado_sem_pdf) continue
    }
    await p.close().catch(() => { })
  }
}

// ── a tela ──────────────────────────────────────────────────────────────────
async function textoDa(page) {
  return page.evaluate(() => document.body?.innerText || '').catch(() => '')
}

async function campoDeCodigo(page) {
  if (!/c[óo]digo|token|verifica[çc][ãa]o/i.test(await textoDa(page))) return null
  const cand = page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[maxlength="6"], input[type="tel"], input[type="number"], input[type="text"]')
  const n = await cand.count()
  for (let i = 0; i < n; i++) {
    const el = cand.nth(i)
    if (await el.isVisible().catch(() => false)) return el
  }
  return null
}

async function estadoDaTela(page, limiteMs = 60000) {
  const fim = Date.now() + limiteMs
  while (Date.now() < fim) {
    if (await page.locator(CAMPO).isVisible().catch(() => false)) return 'pronto'
    if (await page.locator('input[type=password]').first().isVisible().catch(() => false)) return 'login'
    if (await campoDeCodigo(page)) return 'codigo'
    await esperar(1000)
  }
  return 'desconhecido'
}

/* O CABEÇALHO DO RELATÓRIO é a prova de qual empresa está na tela:
     14/09/2026 19:02:17  RELATÓRIO AVANÇADO  CNPJ: 03.972.433/0001-05 | USIBLEND ...
   Nada é salvo sem ele bater com o CNPJ pedido. */
async function cabecalho(page) {
  const m = /(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}:\d{2}\s*RELAT[ÓO]RIO AVAN[ÇC]ADO\s*(?:CNPJ|CPF):\s*([\d./-]{11,18})\s*\|\s*([^\n]+)/i.exec(await textoDa(page))
  return m ? { data: m[1], documento: digitos(m[2]), razao: m[3].trim() } : null
}

const dialogoAberto = (page) => page.locator('mat-dialog-container').first().isVisible().catch(() => false)

// ── o código pelo e-mail ────────────────────────────────────────────────────
function outlook(args, timeout = 90000) {
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(AQUI, 'outlook.ps1'), ...args],
      { timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true, encoding: 'utf8' },
      (err, saida) => {
        try { resolve(JSON.parse(String(saida || '').trim())) }
        catch { resolve({ ok: false, erro: err ? err.message : 'a ponte com o Outlook não respondeu' }) }
      })
  })
}

/* Só olha e-mail do Serasa chegado depois do pedido, e só devolve o número.
   Nada do e-mail sai daqui. */
export async function codigoDoEmail(desdeIso, { limiteMs = 4 * 60000 } = {}) {
  const fim = Date.now() + limiteMs
  while (Date.now() < fim) {
    const r = await outlook(['-Acao', 'listar', '-Desde', desdeIso, '-Max', '30'])
    for (const e of (r.ok ? r.emails : []) || []) {
      if (!/serasa|experian/i.test(`${e.email_de} ${e.de} ${e.assunto}`)) continue
      /* O número tem que estar COLADO na palavra (até 40 caracteres sem dígito
         no meio). "Qualquer 6 dígitos do e-mail" pegaria protocolo, CEP ou
         data, e código errado digitado gasta tentativa e pode travar a conta. */
      const t = `${e.assunto}\n${e.corpo}`
      const m = /(?:c[óo]digo|code|token)[^0-9]{0,40}\b(\d{4,8})\b/i.exec(t)
      if (m) return m[1]
    }
    await esperar(10000)
  }
  return null
}

async function passarPeloCodigo(page, log) {
  const desde = new Date(Date.now() - 3 * 60000).toISOString()
  log('O Serasa pediu código de confirmação. Procurando no e-mail…')
  const codigo = await codigoDoEmail(desde)
  if (!codigo) return { ok: false, motivo: 'O Serasa pediu código de confirmação e ele não chegou no e-mail em 4 minutos.' }
  const campo = await campoDeCodigo(page)
  if (!campo) return { ok: false, motivo: 'O Serasa pediu código, mas não achei onde digitar.' }
  await campo.fill(codigo)
  const botao = page.getByRole('button', { name: /confirmar|continuar|validar|verificar|entrar|enviar|acessar/i }).first()
  if (await botao.isVisible().catch(() => false)) await botao.click()
  else await page.keyboard.press('Enter')
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => { })
  return { ok: true }
}

// ── entrar sozinho ──────────────────────────────────────────────────────────
/* A SESSÃO DO SERASA CAI (15/09/2026): quando o Chrome do robô fecha e em ~12 h.
   Decisão do Marco: o robô entra sozinho, com SERASA_USUARIO e SERASA_SENHA do
   .env.local desta máquina (fora do Git, digitados por ele). Se o Serasa pedir
   código, ele vem pelo e-mail, como já autorizado. A senha nunca vai para log. */
function credenciais() {
  try {
    const env = {}
    for (const linha of fs.readFileSync(ENV_LOCAL, 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*(SERASA_USUARIO|SERASA_SENHA)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    return { usuario: env.SERASA_USUARIO || '', senha: env.SERASA_SENHA || '', versao: fs.statSync(ENV_LOCAL).mtimeMs }
  } catch {
    return { usuario: '', senha: '', versao: 0 }
  }
}

async function entrar(page, log) {
  const cred = credenciais()
  const manual = 'Entre na janela do robô (o Chrome que ficou na frente) com o login da FAM.'
  if (!cred.usuario || !cred.senha) {
    await page.bringToFront().catch(() => { })
    return { ok: false, login: true, motivo: `O Serasa pediu login e não há SERASA_USUARIO e SERASA_SENHA no .env.local. ${manual}` }
  }
  const antes = lerJson(TENTATIVA_LOGIN, null)
  if (antes && antes.versao === cred.versao && (antes.recusada || Date.now() - Date.parse(antes.em) < 30 * 60000)) {
    await page.bringToFront().catch(() => { })
    return {
      ok: false, login: true,
      motivo: antes.recusada
        ? `O Serasa recusou o usuário ou a senha do .env.local em ${new Date(antes.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Não tento de novo até o .env.local mudar, para não bloquear a conta. ${manual}`
        : `O login automático falhou há menos de 30 minutos (${antes.motivo}). ${manual}`,
    }
  }
  const falhou = (motivo, recusada = false) => {
    fs.mkdirSync(BASE, { recursive: true })
    fs.writeFileSync(TENTATIVA_LOGIN, JSON.stringify({ em: new Date().toISOString(), versao: cred.versao, recusada, motivo }, null, 2))
    return { ok: false, login: true, motivo: `${motivo} ${manual}` }
  }

  log('O Serasa pediu login. Entrando com o usuário do .env.local…')
  if (!page.url().includes('/login')) await page.goto(LOGIN, { waitUntil: 'domcontentloaded' })
  const usuario = page.locator('#userLogon')
  await usuario.waitFor({ state: 'visible', timeout: 30000 }).catch(() => { })
  if (!(await usuario.isVisible().catch(() => false))) return falhou('Não achei a tela de login do Serasa.')
  await usuario.fill(cred.usuario)
  await page.locator('#userPassword').fill(cred.senha)
  await page.getByRole('button', { name: /^\s*Acessar\s*$/i }).first().click()

  const fim = Date.now() + 60000
  while (Date.now() < fim) {
    if (!page.url().includes('/login')) break
    if (await campoDeCodigo(page)) break
    const texto = await textoDa(page)
    if (/(usu[áa]rio|senha|login)[^.\n]{0,40}(inv[áa]lid|incorret)|bloquead/i.test(texto)) return falhou('O Serasa recusou o usuário ou a senha.', true)
    await esperar(1000)
  }
  if (await campoDeCodigo(page)) {
    const r = await passarPeloCodigo(page, log)
    if (!r.ok) return falhou(r.motivo)
  }
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => { })
  if (page.url().includes('/login')) return falhou('Mandei o login e o Serasa continuou na tela de login.')

  try { fs.unlinkSync(TENTATIVA_LOGIN) } catch { }
  log('Login feito.')
  return { ok: true }
}

/* O RELATÓRIO AVANÇADO MORA EM OUTRO ENDEREÇO (cs-reports), que só abre pelo
   "Acessar" do produto em "Meus produtos": é ali que o portal emite o passe da
   sessão. É navegação para o produto contratado, não cobra nada. */
async function abrirRelatorioAvancado(page) {
  if (!page.url().includes('meus-produtos')) await page.goto('https://empresas.serasaexperian.com.br/meus-produtos/', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => { })
  const cartao = page.locator('div, li, section, mat-card', { hasText: 'Serasa Relatório Avançado PJ' })
    .filter({ has: page.getByText('Acessar', { exact: true }) }).last()
  const acessar = cartao.getByText('Acessar', { exact: true }).first()
  if (!(await acessar.isVisible().catch(() => false))) return null
  const [nova] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null),
    acessar.click(),
  ])
  const alvo = nova || page
  await alvo.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => { })
  return alvo
}

// ── gerar ───────────────────────────────────────────────────────────────────
async function gerar(page, doc, { tipo = 'PJ', ensaio, log, antesDeGerar }) {
  await page.goto(PORTAL, { waitUntil: 'domcontentloaded' })
  let estado = await estadoDaTela(page)
  if (estado === 'codigo') {
    const r = await passarPeloCodigo(page, log)
    if (!r.ok) return r
    await page.goto(PORTAL, { waitUntil: 'domcontentloaded' })
    estado = await estadoDaTela(page)
  }
  if (estado === 'login') {
    const r = await entrar(page, log)
    if (!r.ok) return r
    const aberta = await abrirRelatorioAvancado(page)
    if (aberta && aberta !== page) { await page.close().catch(() => { }); page = aberta }
    if (!page.url().includes('/relatorioavancado/home')) await page.goto(PORTAL, { waitUntil: 'domcontentloaded' })
    estado = await estadoDaTela(page)
    if (estado === 'login') return { ok: false, login: true, motivo: 'Entrei no Serasa, mas o Relatório Avançado pediu login de novo. Entre na janela do robô com o login da FAM.' }
  }
  if (estado !== 'pronto') return { ok: false, motivo: `Não reconheci a tela do Serasa (${page.url()}).` }
  await page.waitForTimeout(1500)

  // A aba certa (CNPJ ou CPF) e o tipo contratado: só o Relatório Avançado.
  await page.getByText(ABA[tipo], { exact: true }).click()
  await page.waitForTimeout(1200)
  const tipoRelatorio = (await page.locator('mat-select').first().textContent().catch(() => '')) || ''
  if (!/Avan[çc]ado/i.test(tipoRelatorio)) {
    return { ok: false, motivo: `O tipo de relatório no portal não é o Avançado ("${tipoRelatorio.trim()}"). Não gerei nada.` }
  }

  // A lista começa vazia: tirar chip não cobra nada.
  const chips = page.locator(CHIP)
  for (let n = await chips.count(); n > 0; n--) await chips.first().locator(TIRAR_CHIP).click()

  const campo = page.locator(CAMPO)
  await campo.click()
  await campo.pressSequentially(doc, { delay: 40 })
  await page.keyboard.press('Tab') // Tab ADICIONA; Enter GERARIA
  await page.waitForTimeout(1500)

  const lista = (await chips.allInnerTexts()).map(digitos)
  if (lista.length !== 1 || lista[0] !== doc) {
    return { ok: false, motivo: `A lista de documentos no portal ficou diferente do esperado (${lista.join(', ') || 'vazia'}). Não gerei nada.` }
  }
  if (await page.locator('input[type=checkbox]:checked').count()) {
    return { ok: false, motivo: 'Havia uma opção extra marcada no portal. Não gerei nada, para não cobrar extra.' }
  }
  if (await dialogoAberto(page)) return { ok: false, motivo: 'Havia um aviso aberto no portal antes de gerar. Não gerei nada.' }
  if (ensaio) {
    await chips.first().locator(TIRAR_CHIP).click()
    return { ok: true, ensaio: true, motivo: `Tudo pronto para gerar: um ${tipo === 'PF' ? 'CPF' : 'CNPJ'} na lista, Relatório Avançado, nenhum extra marcado. Não gerei.` }
  }

  /* A ÚLTIMA PERGUNTA ANTES DE COBRAR (15/09/2026). Entre aceitar o pedido e
     clicar em Gerar passam de segundos a minutos (login, código por e-mail). Um
     pedido apagado ou fechado nesse meio tempo foi cobrado assim mesmo: um
     teste apagou o pedido e o robô gerou o CNPJ 11.222.333/0001-81. Quem chama
     diz se o pedido ainda vale; sem resposta clara, não gera. */
  if (antesDeGerar) {
    let vale = false
    try { vale = await antesDeGerar() } catch { vale = false }
    if (!vale) {
      await chips.first().locator(TIRAR_CHIP).click().catch(() => { })
      return { ok: false, motivo: 'O pedido não está mais valendo no CRM (apagado, fechado ou sem resposta). Não gerei nada.' }
    }
  }
  log(`Gerando o Relatório Avançado de ${doc} (uma consulta cobrada).`)
  marcarGerado(doc)
  await page.getByRole('button', { name: GERAR }).click()

  const fim = Date.now() + 120000
  while (Date.now() < fim) {
    const recusar = page.getByRole('button', { name: RECUSAR })
    if (await recusar.isVisible().catch(() => false)) {
      await recusar.click()
      log('Recusei o relatório dos sócios (cobrado à parte).')
    }
    // Devolve a aba: depois do login o relatório pode ter aberto numa aba nova.
    if (page.url().includes('/relatorioavancado/report') && (await cabecalho(page))) return { ok: true, page }
    await esperar(1000)
  }
  return { ok: false, motivo: 'Cliquei em Gerar e o relatório não abriu em 2 minutos.' }
}

async function abaDoRelatorioDeHoje(ctx, doc) {
  for (const p of ctx.pages()) {
    if (!p.url().includes('/relatorioavancado/report')) continue
    const cab = await cabecalho(p)
    if (cab?.documento === doc && cab.data === hojeBR()) return p
  }
  return null
}

/* O QUADRO SOCIETÁRIO, lido da tabela do próprio relatório (#pj-partner-child-
   table). É dele que nascem os pedidos de sócio, que esperam aprovação no CRM.
   Documento que não é CPF nem CNPJ inteiro (sócio estrangeiro sem cadastro,
   campo mascarado) fica de fora: não há o que consultar. */
async function lerSocios(page) {
  const linhas = await page.evaluate(() => [...document.querySelectorAll('#pj-partner-child-table mat-row')].map((r) => {
    const celula = (k) => (r.querySelector(`.mat-column-${k}`)?.textContent || '').trim()
    return { nome: celula('name'), documento: celula('documentId'), participacao: celula('capitalTotalValue'), anotacoes: celula('restrictionSign') }
  })).catch(() => [])
  return linhas
    .map((s) => ({ ...s, documento: digitos(s.documento) }))
    .filter((s) => s.documento.length === 11 || s.documento.length === 14)
    .map((s) => ({ ...s, tipo: s.documento.length === 11 ? 'PF' : 'PJ' }))
}

async function esperarCompleto(page) {
  // "Consultas à Serasa Experian" é a última seção do relatório.
  await page.waitForFunction(() => /Consultas\s+à\s+Serasa/i.test(document.body?.innerText || ''), null, { timeout: 60000 }).catch(() => { })
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => { })
  await page.waitForTimeout(1500)
}

async function imprimir(page) {
  const s = await page.context().newCDPSession(page)
  try {
    await s.send('Emulation.setEmulatedMedia', { media: 'print' })
    const r = await s.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true })
    return Buffer.from(r.data, 'base64')
  } finally {
    await s.send('Emulation.setEmulatedMedia', { media: '' }).catch(() => { })
    await s.detach().catch(() => { })
  }
}

// ── o que já foi pago ───────────────────────────────────────────────────────
/* A MARCA DE COBRANÇA vai no clique em "Gerar", e não no fim: é ali que o
   Serasa cobra. Se o processo cair antes de o PDF sair, a próxima chamada vê
   a marca e não paga de novo. `guardar` troca a marca pelo registro completo. */
function marcarGerado(cnpj) {
  fs.mkdirSync(BASE, { recursive: true })
  const reg = lerJson(REGISTRO, {})
  reg[cnpj] = [{ em: new Date().toISOString(), arquivo: null, razao: null }, ...(reg[cnpj] || [])].slice(0, 10)
  fs.writeFileSync(REGISTRO, JSON.stringify(reg, null, 2))
}

function guardar(buf, cnpj, razao, socios = []) {
  fs.mkdirSync(GUARDADOS, { recursive: true })
  const local = path.join(GUARDADOS, `${cnpj}-${hoje()}.pdf`)
  fs.writeFileSync(local, buf)
  const reg = lerJson(REGISTRO, {})
  const anteriores = (reg[cnpj] || []).filter((e, i) => !(i === 0 && !e.arquivo))
  // Os sócios vão junto: quem reaproveita a consulta também precisa deles.
  reg[cnpj] = [{ em: new Date().toISOString(), arquivo: local, razao, socios }, ...anteriores].slice(0, 10)
  fs.writeFileSync(REGISTRO, JSON.stringify(reg, null, 2))
  return local
}

function consultaRecente(cnpj) {
  const u = (lerJson(REGISTRO, {})[cnpj] || [])[0]
  if (!u) return null
  const dias = (Date.now() - Date.parse(u.em)) / 86400000
  if (dias > DIAS_REAPROVEITA) return null
  if (!u.arquivo) return { ...u, dias, gerado_sem_pdf: true }
  return { ...u, dias, existe: fs.existsSync(u.arquivo) }
}

/* O NOME é o mesmo que o Marco já usava ("Serasa Experian - RAZÃO.pdf"): a
   triagem reconhece pelo nome E pelo conteúdo. */
function entregar(local, destino, razao, socio = false) {
  /* O Serasa de SÓCIO leva "Sócio" no nome: numa pasta de análise, um PJ de
     sócio sem essa marca seria confundido com o Serasa do próprio tomador. */
  const nome = `Serasa Experian - ${socio ? 'Sócio - ' : ''}${String(razao || 'tomador').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()}`
  let alvo = path.join(destino, `${nome}.pdf`)
  if (fs.existsSync(alvo)) alvo = path.join(destino, `${nome} (${hoje()}).pdf`)
  fs.copyFileSync(local, alvo)
  return alvo
}

// ── a porta de entrada ──────────────────────────────────────────────────────
/* `soAbaAberta`: salva o relatório que já está aberto na janela do robô e NUNCA
   gera. É o caminho de quem consultou à mão ali e só quer o PDF na pasta. */
/* `tipo` 'PF' consulta CPF (sócio pessoa física). `socio` marca o nome do
   arquivo e não lê o quadro societário: aprovação é de uma camada só. */
export async function consultarSerasa({ cnpj, documento, tipo = 'PJ', socio = false, destino, forcar = false, ensaio = false, soAbaAberta = false, log = console.log, antesDeGerar = null }) {
  let jaCobradoEm = null
  const doc = digitos(documento || cnpj)
  if (doc.length !== (tipo === 'PF' ? 11 : 14)) return { ok: false, motivo: `${tipo === 'PF' ? 'CPF' : 'CNPJ'} inválido.` }
  if (!ensaio && (!destino || !fs.existsSync(destino))) return { ok: false, motivo: `A pasta de destino não existe: ${destino}` }

  if (!ensaio && !forcar) {
    const antes = consultaRecente(doc)
    if (antes?.gerado_sem_pdf) {
      /* JÁ FOI COBRADO E O PDF NÃO SAIU (achado da revisão de 14/09/2026): o
         processo caiu entre o "Gerar" e o salvar. Gerar de novo seria pagar duas
         vezes; só vale a aba que ainda estiver aberta na janela do robô. */
      soAbaAberta = true
      jaCobradoEm = antes.em
    } else if (antes?.existe) {
      const alvo = entregar(antes.arquivo, destino, antes.razao, socio)
      return { ok: true, arquivo: path.basename(alvo), razao: antes.razao, reaproveitado: true, consultado_em: antes.em, socios: socio ? [] : (antes.socios || []) }
    } else if (antes) {
      return { ok: false, motivo: `Este documento foi consultado há ${Math.floor(antes.dias)} dia(s) e a cópia sumiu de ${GUARDADOS}. Não consultei de novo para não cobrar duas vezes.` }
    }
  }

  fs.mkdirSync(BASE, { recursive: true })
  try {
    if (Date.now() - fs.statSync(TRAVA).mtimeMs < 10 * 60000) return { ok: false, motivo: 'Outra consulta ao Serasa está em andamento nesta máquina.' }
  } catch { }
  fs.writeFileSync(TRAVA, String(process.pid))
  /* A trava pulsa enquanto a consulta anda: o pior caso (código por e-mail +
     relatório lento) passa de 9 minutos, e um teto fixo deixaria uma segunda
     chamada entrar na mesma aba no meio do caminho. */
  const pulso = setInterval(() => { try { const t = new Date(); fs.utimesSync(TRAVA, t, t) } catch { } }, 60000)

  let browser, ctx, page
  try {
    browser = await conectar()
    ctx = browser.contexts()[0] || await browser.newContext()
    page = ensaio ? null : await abaDoRelatorioDeHoje(ctx, doc)
    const abaAproveitada = !!page
    if (!page && soAbaAberta) {
      return {
        ok: false,
        motivo: jaCobradoEm
          ? `O relatório deste CNPJ já foi gerado (e cobrado) em ${new Date(jaCobradoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}, mas o PDF não chegou a sair e a aba não está mais aberta. Não gerei de novo. Abra em "Gerenciar consulta" no portal, ou rode com --forcar para pagar outra consulta.`
          : 'Não há relatório deste CNPJ aberto hoje na janela do robô. Nada foi gerado.',
      }
    }
    if (!page) {
      /* A ABA LOGADA PRIMEIRO (15/09/2026). A sessão de "Meus produtos" vale só
         para a aba onde se entrou: aba nova cai no login. Ver abaDoRobo. */
      page = await abaDoRobo(ctx)
      const g = await gerar(page, doc, { tipo, ensaio, log, antesDeGerar })
      if (g.page) page = g.page
      if (!g.ok || ensaio) return g
    }
    const cab = await cabecalho(page)
    if (!cab || cab.documento !== doc) return { ok: false, motivo: 'O relatório na tela não é do documento pedido. Não salvei nada.' }
    await esperarCompleto(page)
    const socios = tipo === 'PJ' && !socio ? await lerSocios(page) : []
    const buf = await imprimir(page)
    if (buf.length < 20000) return { ok: false, motivo: 'O PDF do relatório saiu vazio.' }
    const local = guardar(buf, doc, cab.razao, socios)
    const alvo = entregar(local, destino, cab.razao, socio)
    return { ok: true, arquivo: path.basename(alvo), razao: cab.razao, aba_aproveitada: abaAproveitada, socios }
  } finally {
    clearInterval(pulso)
    if (ctx) await ficarComUmaAba(ctx, page).catch(() => { })
    try { fs.unlinkSync(TRAVA) } catch { }
    await browser?.close().catch(() => { })
  }
}

export async function diagnostico() {
  let browser
  try {
    browser = await conectar()
    const ctx = browser.contexts()[0]
    const page = await abaDoRobo(ctx)
    if (!page.url().includes('/relatorioavancado/home')) await page.goto(PORTAL, { waitUntil: 'domcontentloaded' })
    const estado = await estadoDaTela(page, 45000)
    const reg = lerJson(REGISTRO, {})
    return { ok: estado === 'pronto', estado, url: page.url(), consultas_guardadas: Object.keys(reg).length, perfil: PERFIL }
  } finally {
    await browser?.close().catch(() => { })
  }
}

/* `node scripts/serasa.mjs entrar`: faz o login e abre o Relatório Avançado, e
   para aí. Não gera relatório, não cobra. Serve para testar o .env.local. */
async function entrarPelaLinhaDeComando() {
  let browser, ctx, page
  try {
    browser = await conectar()
    ctx = browser.contexts()[0]
    page = await abaDoRobo(ctx)
    await page.goto(PORTAL, { waitUntil: 'domcontentloaded' })
    let estado = await estadoDaTela(page)
    if (estado === 'login') {
      const r = await entrar(page, console.log)
      if (!r.ok) return r
      const aberta = await abrirRelatorioAvancado(page)
      if (aberta) page = aberta
      if (!page.url().includes('/relatorioavancado/home')) await page.goto(PORTAL, { waitUntil: 'domcontentloaded' })
      estado = await estadoDaTela(page)
    }
    return { ok: estado === 'pronto', estado, url: page.url().split('?')[0], abas: ctx.pages().length }
  } finally {
    if (ctx) await ficarComUmaAba(ctx, page).catch(() => { })
    await browser?.close().catch(() => { })
  }
}

// ── linha de comando ────────────────────────────────────────────────────────
function pastaDoTomador(arg) {
  if (!arg || path.isAbsolute(arg)) return arg
  const raiz = lerJson(path.join(AQUI, 'esteira.json'), {}).raiz || process.env.ANALISES_RAIZ || ''
  return path.join(raiz, arg)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [cmd, a, b] = process.argv.slice(2)
  let r
  // --pf: o documento é CPF (sócio pessoa física)
  const tipo = process.argv.includes('--pf') ? 'PF' : 'PJ'
  if (cmd === 'diagnostico') r = await diagnostico()
  else if (cmd === 'entrar') r = await entrarPelaLinhaDeComando()
  else if (cmd === 'ensaio') r = await consultarSerasa({ documento: a, tipo, ensaio: true })
  else if (cmd === 'consultar') r = await consultarSerasa({ documento: a, tipo, destino: pastaDoTomador(b), forcar: process.argv.includes('--forcar') })
  else if (cmd === 'salvar-aberto') r = await consultarSerasa({ documento: a, tipo, destino: pastaDoTomador(b), forcar: true, soAbaAberta: true })
  else r = { ok: false, motivo: 'Use: diagnostico | ensaio <doc> | consultar <doc> "<pasta>" [--forcar] | salvar-aberto <doc> "<pasta>"  (acrescente --pf para CPF)' }
  console.log(JSON.stringify(r, null, 2))
  process.exit(r.ok ? 0 : 1)
}
