// Gera public/whatsapp/banner-fam.png a partir de scripts/banner-fam.html
// Uso: node scripts/gen-banner.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const htmlPath = path.join(__dirname, 'banner-fam.html')
const outPath = path.join(__dirname, '..', 'public', 'whatsapp', 'banner-fam.png')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1024, height: 536 } })
await page.goto('file://' + htmlPath)
await page.locator('.banner').screenshot({ path: outPath })
await browser.close()
console.log('Banner gerado em', outPath)
