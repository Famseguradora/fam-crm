// ─────────────────────────────────────────────────────────────────────────────
// Agente de verificação MOBILE do FAM CRM — "celular de verdade na tela".
//
// Abre o Chromium VISÍVEL (headed), do tamanho de um iPhone, e passa por TODAS
// as telas devagar, como se alguém estivesse navegando no celular. Em cada tela:
//   • rola de cima a baixo (você vê acontecendo),
//   • detecta elementos que ESTOURAM a largura da tela (causa de overlap),
//   • salva prints em mobile-shots/.
//
// DUAS FORMAS DE ENTRAR:
//   A) Sessão manual (padrão): apenas rode o script. A janela do celular abre; se
//      pedir login, você faz o login NA PRÓPRIA JANELA uma vez — o agente espera,
//      detecta que entrou e segue sozinho. A sessão fica salva para as próximas vezes.
//        node scripts/verify_celular.mjs
//   B) Automático com senha (opcional): defina FAM_EMAIL e FAM_PASS que ele loga só.
//        $env:FAM_EMAIL="..."; $env:FAM_PASS="..."; node scripts/verify_celular.mjs
//
// Variáveis opcionais:
//   FAM_BASE   (padrão http://localhost:3000)
//   FAM_HEADED (padrão "1" = visível; defina "0" para rodar oculto)
//   FAM_DEVICE (padrão "iPhone 13")
// ─────────────────────────────────────────────────────────────────────────────
import { chromium, devices } from 'playwright-core'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const BASE    = process.env.FAM_BASE   || 'http://localhost:3000'
const EMAIL   = process.env.FAM_EMAIL
const PASS    = process.env.FAM_PASS
const HEADED  = process.env.FAM_HEADED !== '0'
const DEVICE  = process.env.FAM_DEVICE || 'iPhone 13'
const OUT     = 'mobile-shots'
const SESSION = 'playwright-state.json'

const phone = devices[DEVICE] || devices['iPhone 13']
const problemas = []

async function pause(page, ms = 700) { await page.waitForTimeout(ms) }

// Detecta elementos cujo conteúdo ultrapassa a largura da viewport (overflow
// horizontal real — a origem de textos sobrepostos / barra de rolagem lateral).
async function checarOverflow(page, tela) {
  const achados = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    // Um elemento dentro de um container com overflow-x auto/scroll (ex.: a
    // .fam-table-wrap) PODE ser mais largo que a tela de propósito — rola na
    // horizontal. Isso não é bug, então ignoramos esses casos.
    const dentroDeRolavel = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return true
      }
      return false
    }
    const out = []
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const rolavel = /auto|scroll/.test(getComputedStyle(el).overflowX)
      if (!rolavel && !dentroDeRolavel(el) && r.right > vw + 2) {
        const txt = (el.textContent || '').trim().slice(0, 40)
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 40) : '',
          right: Math.round(r.right),
          vw,
          txt,
        })
      }
    }
    // só os mais "para fora" e sem repetir texto
    const vistos = new Set()
    return out
      .sort((a, b) => b.right - a.right)
      .filter(o => { const k = o.txt + o.right; if (vistos.has(k)) return false; vistos.add(k); return true })
      .slice(0, 8)
  })
  if (achados.length) {
    problemas.push({ tela, achados })
    console.log(`  ⚠ ${tela}: ${achados.length} elemento(s) estouram a largura (${achados[0].vw}px):`)
    for (const a of achados) console.log(`      <${a.tag}${a.cls ? ' .' + a.cls : ''}> right=${a.right}px  "${a.txt}"`)
  } else {
    console.log(`  ✓ ${tela}: nenhum estouro de largura`)
  }
}

// Confere se o app está em modo CELULAR: hambúrguer ☰ visível e SEM a barra
// lateral / abas de desktop. É justamente em PAISAGEM que o layout de desktop
// costuma "vazar" (a tela fica larga e o app se acha um computador).
async function assertModoCelular(page, tela) {
  const burger = await page.locator('button[aria-label="Abrir menu"]').first().isVisible().catch(() => false)
  const abasDesktop = await page.locator('button:has-text("📊 Dashboard")').first().isVisible().catch(() => false)
  if (!burger || abasDesktop) {
    const motivo = !burger ? 'sem hambúrguer ☰ (layout desktop vazou)' : 'abas/barra de desktop visíveis no celular'
    problemas.push({ tela, achados: [{ tag: 'layout', cls: '', right: 0, vw: 0, txt: motivo }] })
    console.log(`  ⚠ ${tela}: LAYOUT DESKTOP VAZOU — ${motivo} (☰=${burger}, abasDesktop=${abasDesktop})`)
    return false
  }
  console.log(`  ✓ ${tela}: modo celular correto (☰ visível, sem barra/abas de desktop)`)
  return true
}

// Rola a tela inteira devagar (você vê) e tira prints de topo + fim.
async function percorrerTela(page, nome) {
  console.log(`\n▶ Tela: ${nome}`)
  await pause(page, 900)
  await page.evaluate(() => window.scrollTo(0, 0))
  await pause(page, 400)
  await page.screenshot({ path: `${OUT}/cel-${nome}-1topo.png` })

  const altura = await page.evaluate(() => document.body.scrollHeight)
  const vh = await page.evaluate(() => window.innerHeight)
  let y = 0, passo = Math.round(vh * 0.85), i = 2
  while (y + vh < altura && i <= 6) {
    y += passo
    await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'smooth' }), y)
    await pause(page, 650)
    await page.screenshot({ path: `${OUT}/cel-${nome}-${i}.png` })
    i++
  }
  await checarOverflow(page, nome)
  await page.evaluate(() => window.scrollTo(0, 0))
  await pause(page, 300)
}

// Reaproveita a sessão salva (cookies), se existir e tiver conteúdo.
let storageState
if (existsSync(SESSION)) {
  try {
    const s = JSON.parse(readFileSync(SESSION, 'utf8'))
    if ((s.cookies?.length ?? 0) > 0 || (s.origins?.length ?? 0) > 0) storageState = s
  } catch { /* ignora estado inválido */ }
}

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 120 : 0 })
const ctx = await browser.newContext({ ...phone, ...(storageState ? { storageState } : {}) })
// Durante a verificação automática, dispensamos o banner "Instalar o app": ele
// é fixo no rodapé e tampa/atrapalha o conteúdo e os cliques. (No app real ele
// continua aparecendo normalmente para o usuário.)
await ctx.addInitScript(() => { try { localStorage.setItem('fam-install-dismissed', '1') } catch {} })
const page = await ctx.newPage()

try {
  // ── Login ──
  console.log(`\n🔐 Acessando ${BASE} (dispositivo: ${DEVICE})`)
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  if (page.url().includes('/login')) {
    if (PASS && EMAIL) {
      // Modo automático (B): loga com as credenciais do ambiente.
      console.log('  → login automático com FAM_EMAIL/FAM_PASS')
      await page.fill('input[type="email"]', EMAIL)
      await page.fill('input[type="password"]', PASS)
      await page.click('button:has-text("Entrar")')
      await page.waitForTimeout(5000)
    } else {
      // Modo manual (A): você loga na própria janela; o agente aguarda.
      console.log('\n  👉 FAÇA O LOGIN NA JANELA DO CELULAR QUE ABRIU.')
      console.log('     Assim que entrar, o agente segue sozinho (espero até 3 min)…\n')
      await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 180_000 })
      await page.waitForTimeout(2500)
    }
  }

  if (page.url().includes('/login')) {
    await page.screenshot({ path: `${OUT}/cel-00-login-falhou.png` })
    throw new Error('Não autenticou — login não concluído.')
  }
  // Persiste a sessão para as próximas execuções não pedirem login de novo.
  try { writeFileSync(SESSION, JSON.stringify(await ctx.storageState(), null, 2)) } catch { /* ok */ }
  console.log('  ✓ autenticado')

  // ── Dashboard (retrato) ──
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await assertModoCelular(page, 'retrato-dashboard')
  await percorrerTela(page, 'dashboard')

  // ── Drawer (menu hambúrguer) ──
  const burger = page.locator('button[aria-label="Abrir menu"]')
  if (await burger.count()) {
    await burger.first().click(); await pause(page, 700)
    await page.screenshot({ path: `${OUT}/cel-menu-drawer.png` })
    await checarOverflow(page, 'menu-drawer')
    const fechar = page.locator('button[aria-label="Fechar menu"]')
    if (await fechar.count()) { await fechar.first().click(); await pause(page, 400) }
  }

  // ── Operações ──
  await page.goto(`${BASE}/operacoes`, { waitUntil: 'networkidle' })
  await percorrerTela(page, 'operacoes')

  // ── Operações › aba Comitê ──
  try {
    const comite = page.locator('button:has-text("Comitê")')
    if (await comite.count()) {
      await comite.first().click({ timeout: 8000 }); await pause(page, 1200)
      await percorrerTela(page, 'operacoes-comite')
    }
  } catch (e) {
    console.log(`  · operacoes-comite: pulada (${e.message.split('\n')[0]})`)
  }

  // ── Tomadores ──
  await page.goto(`${BASE}/tomadores`, { waitUntil: 'networkidle' })
  await percorrerTela(page, 'tomadores')

  // As telas abaixo são acessíveis só no desktop pelo menu, mas existem por URL —
  // verificamos a responsividade delas também, por garantia.
  for (const [rota, nome] of [
    ['/corretoras', 'corretoras'],
    ['/produtos', 'produtos'],
    ['/usuarios', 'usuarios'],
  ]) {
    try {
      await page.goto(`${BASE}${rota}`, { waitUntil: 'networkidle' })
      await percorrerTela(page, nome)
    } catch (e) {
      console.log(`  · ${nome}: pulada (${e.message})`)
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // VARREDURA EM PAISAGEM (celular DEITADO) — aqui o layout de desktop costuma
  // vazar (barra lateral + abas de topo). Giramos a tela e conferimos cada uma.
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n📱↺ Girando para PAISAGEM (celular deitado, 844×390)…')
  await page.setViewportSize({ width: 844, height: 390 })
  await pause(page, 800)
  for (const [rota, nome] of [
    ['/', 'dashboard'],
    ['/operacoes', 'operacoes'],
    ['/tomadores', 'tomadores'],
  ]) {
    await page.goto(`${BASE}${rota}`, { waitUntil: 'networkidle' })
    await pause(page, 1100)
    console.log(`\n▶ Paisagem: ${nome}`)
    await page.evaluate(() => window.scrollTo(0, 0)); await pause(page, 300)
    await page.screenshot({ path: `${OUT}/cel-paisagem-${nome}.png` })
    await assertModoCelular(page, `paisagem-${nome}`)
    await checarOverflow(page, `paisagem-${nome}`)
  }
  // Abre o menu em paisagem p/ garantir que o drawer (e não a barra fixa) é o caminho.
  try {
    const bp = page.locator('button[aria-label="Abrir menu"]')
    if (await bp.first().isVisible().catch(() => false)) {
      await bp.first().click(); await pause(page, 700)
      await page.screenshot({ path: `${OUT}/cel-paisagem-drawer.png` })
    }
  } catch { /* ok */ }
  await page.setViewportSize({ width: 390, height: 844 }) // volta ao retrato

  // ── Relatório final ──
  console.log('\n══════════════════════════════════════════')
  if (problemas.length === 0) {
    console.log('✅ RESULTADO: tudo certo — retrato E paisagem, sem barra de desktop e sem estouro de largura.')
  } else {
    console.log(`⚠ RESULTADO: ${problemas.length} problema(s) — revisar:`)
    for (const p of problemas) console.log(`   • ${p.tela}: ${p.achados[0].txt}`)
  }
  console.log(`\n📸 Prints salvos em: ${OUT}/cel-*.png`)
  console.log('══════════════════════════════════════════')
} catch (e) {
  console.error('\n✗ ERRO:', e.message)
  await page.screenshot({ path: `${OUT}/cel-erro.png` }).catch(() => {})
  process.exitCode = 1
} finally {
  if (HEADED) { console.log('\n(janela fica aberta 4s para você ver…)'); await page.waitForTimeout(4000) }
  await browser.close()
}
