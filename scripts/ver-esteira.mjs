// Print da Esteira de Risco, no computador e no celular.
//
//   $env:FAM_EMAIL="..."; $env:FAM_PASS="..."; node scripts/ver-esteira.mjs
//
// Usa o Chrome do sistema (`channel: 'chrome'`), e não o Chromium que o
// Playwright baixaria: nesta máquina só aquele está instalado.
//
// Os prints saem em `esteira-shots/`. O roteiro é o caminho de trabalho de
// verdade: o quadro dos casos andando, abrir um card, e percorrer as quatro
// áreas da esteira, para o visual ser conferido com DADO REAL.
import { chromium, devices } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.FAM_BASE || 'http://localhost:3000'
const EMAIL = process.env.FAM_EMAIL
const PASS = process.env.FAM_PASS
const OUT = 'esteira-shots'

if (!EMAIL || !PASS) {
  console.error('Defina FAM_EMAIL e FAM_PASS no ambiente.')
  process.exit(1)
}
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })

async function entrar(ctx) {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button:has-text("Entrar")')
  await page.waitForTimeout(5000)
  if (page.url().includes('/login')) throw new Error('login não autenticou')
  return page
}

const shot = async (page, nome) => {
  await page.screenshot({ path: `${OUT}/${nome}.png`, fullPage: true })
  console.log('✓', `${OUT}/${nome}.png`)
}

try {
  // ── computador ──
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await entrar(ctx)

  await page.goto(`${BASE}/esteira`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  await shot(page, '00-quadro')

  // O quadro dos casos: abre o primeiro card que tenha tomador.
  const card = page.locator('.er-card').first()
  if (await card.count()) {
    console.log('abrindo card:', (await card.innerText()).split('\n')[0])
    await card.click()
    await page.waitForTimeout(3000)
  } else {
    console.log('! quadro vazio, abrindo pela lista da esquerda')
    const primeiro = page.locator('.er-lista > button').first()
    await primeiro.waitFor({ timeout: 20000 })
    await primeiro.click()
    await page.waitForTimeout(3000)
  }
  await shot(page, '01-caso')

  const areas = ['Comercial', 'Cadastro e triagem', 'Análise de Crédito', 'Subscrição']
  for (const [i, nome] of areas.entries()) {
    const passo = page.locator('.er-esteira > button', { hasText: nome }).first()
    if (!(await passo.count())) { console.log('! etapa não achada:', nome); continue }
    await passo.click()
    await page.waitForTimeout(1200)
    await shot(page, `1${i}-${nome.split(' ')[0].toLowerCase()}`)

    // A segunda aba da área, para ver o conteúdo e não só a visão executiva.
    const aba = page.locator('.er-abas > button').nth(1)
    if (await aba.count()) {
      await aba.click()
      await page.waitForTimeout(1500)
      await shot(page, `1${i}b-${nome.split(' ')[0].toLowerCase()}-aba2`)
    }
  }

  // A asa "próxima área", que é o botão de seguir a esteira.
  const asa = page.locator('.er-asa.proxima:not(:disabled)').first()
  if (await asa.count()) {
    await asa.click()
    await page.waitForTimeout(1200)
    await shot(page, '20-pela-asa')
  }

  // ── celular ──
  const ctxM = await browser.newContext({ ...devices['iPhone 13'] })
  const pageM = await entrar(ctxM)
  await pageM.goto(`${BASE}/esteira`, { waitUntil: 'networkidle' })
  await pageM.waitForTimeout(2500)
  await shot(pageM, '30-celular-quadro')
  const cardM = pageM.locator('.er-card').first()
  if (await cardM.count()) { await cardM.click(); await pageM.waitForTimeout(3000) }
  await shot(pageM, '31-celular-caso')

  console.log('\nPrints em', OUT)
} catch (e) {
  console.error('FALHOU:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
