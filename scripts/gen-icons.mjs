// Gera os ícones do PWA a partir do logo "F" da FAM, via Playwright.
// Saída em public/: icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png
import { chromium } from 'playwright-core'

const browser = await chromium.launch()

function html(size, pad) {
  const fontPx = Math.round(size * (pad ? 0.42 : 0.52))
  return `<!doctype html><html><body style="margin:0">
    <div style="width:${size}px;height:${size}px;
      background:linear-gradient(135deg,#0a1628 0%,#1a3560 55%,#2255a4 100%);
      display:flex;align-items:center;justify-content:center;">
      <span style="font-family:'Segoe UI',Arial,sans-serif;font-weight:900;
        font-size:${fontPx}px;color:#fff;line-height:1;
        text-shadow:0 ${Math.round(size*0.01)}px ${Math.round(size*0.03)}px rgba(0,0,0,.35)">F</span>
    </div></body></html>`
}

async function gen(name, size, pad = false) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(html(size, pad))
  await page.locator('div').screenshot({ path: `public/${name}` })
  await page.close()
  console.log('✓ public/' + name)
}

await gen('icon-192.png', 192)
await gen('icon-512.png', 512)
await gen('icon-512-maskable.png', 512, true) // mais padding p/ máscaras circulares
await gen('apple-touch-icon.png', 180)

await browser.close()
console.log('ok')
