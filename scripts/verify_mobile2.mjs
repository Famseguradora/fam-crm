// Recaptura legível (viewport-only, fullPage:false) da dobra das telas internas.
import { chromium } from 'playwright-core'
const BASE = process.env.FAM_BASE || 'http://localhost:3000'
const EMAIL = process.env.FAM_EMAIL, PASS = process.env.FAM_PASS
const OUT = 'mobile-shots'

const browser = await chromium.launch()
// Viewport fiel de celular (390px de largura real, sem a distorção da emulação isMobile)
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
const page = await ctx.newPage()
async function vshot(name) { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('✓', name) }

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', EMAIL)
await page.fill('input[type="password"]', PASS)
await page.click('button:has-text("Entrar")')
await page.waitForTimeout(5000)

// Dashboard — topo (header + hero + KPIs)
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
await vshot('v-dashboard-topo')

// Operações — topo (header + KPIs + filtros + início da tabela)
await page.goto(`${BASE}/operacoes`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
await vshot('v-operacoes-topo')

// Comitê — topo (metas + exposição)
const comite = page.locator('button:has-text("Comitê")')
if (await comite.count()) { await comite.first().click(); await page.waitForTimeout(1500) }
await vshot('v-comite-topo')
// rola um pouco pra ver gráficos/fila
await page.evaluate(() => window.scrollBy(0, 700)); await page.waitForTimeout(500)
await vshot('v-comite-meio')

// Tomadores — topo
await page.goto(`${BASE}/tomadores`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
await vshot('v-tomadores-topo')

await browser.close()
console.log('ok')
