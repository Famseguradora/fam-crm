// Verificação visual mobile do FAM CRM.
// Uso: FAM_EMAIL=... FAM_PASS=... node scripts/verify_mobile.mjs
// Tira prints das telas principais num viewport de iPhone (390x844).
import { chromium, devices } from 'playwright-core'

const BASE = process.env.FAM_BASE || 'http://localhost:3000'
const EMAIL = process.env.FAM_EMAIL
const PASS = process.env.FAM_PASS
const OUT = 'mobile-shots'

if (!EMAIL || !PASS) {
  console.error('Defina FAM_EMAIL e FAM_PASS no ambiente.')
  process.exit(1)
}

const iPhone = devices['iPhone 13']

const shots = []
async function shot(page, name) {
  const path = `${OUT}/${name}.png`
  await page.screenshot({ path, fullPage: true })
  shots.push(path)
  console.log('✓', path)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ ...iPhone })
const page = await ctx.newPage()

try {
  // Login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await shot(page, '00-login')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button:has-text("Entrar")')
  await page.waitForTimeout(5000)
  console.log('URL após login:', page.url())
  const erro = page.locator('.alert-error, [class*="erro"], [class*="error"]')
  if (await erro.count()) {
    const txt = (await erro.first().innerText().catch(() => '')).trim()
    if (txt) console.log('MENSAGEM DE ERRO NA TELA:', JSON.stringify(txt))
  }
  if (page.url().includes('/login')) {
    console.log('!! Ainda na tela de login — autenticação falhou (senha incorreta?)')
    await shot(page, '01-login-falhou')
    throw new Error('login não autenticou')
  }
  await shot(page, '01-dashboard')

  // Drawer de navegação (hambúrguer)
  const burger = page.locator('button[aria-label="Abrir menu"]')
  if (await burger.count()) {
    await burger.first().click()
    await page.waitForTimeout(500)
    await shot(page, '02-drawer')
    await page.locator('button[aria-label="Fechar menu"]').first().click()
    await page.waitForTimeout(300)
  } else {
    console.log('! hambúrguer não encontrado (viewport não-mobile?)')
  }

  // Operações
  await page.goto(`${BASE}/operacoes`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await shot(page, '03-operacoes')

  // Aba Comitê
  const comite = page.locator('button:has-text("Comitê")')
  if (await comite.count()) {
    await comite.first().click()
    await page.waitForTimeout(1200)
    await shot(page, '04-comite')
  }

  // Tomadores
  await page.goto(`${BASE}/tomadores`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await shot(page, '05-tomadores')

  console.log('\nPrints gerados:', shots.length)
} catch (e) {
  console.error('ERRO:', e.message)
  await shot(page, 'erro').catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
