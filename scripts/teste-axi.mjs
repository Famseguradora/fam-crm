// Teste ponta a ponta da API AxiMobius: sobe o servidor de verdade, exercita
// por HTTP como o outro sistema fará, e mata o servidor no finally.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const RAIZ = 'c:/Users/MarcoDragoneFAMSEGUR/fam-crm'
const env = Object.fromEntries(
  readFileSync(`${RAIZ}/.env.local`, 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const TOKEN = env.AXI_API_TOKEN
const BASE = 'http://127.0.0.1:3311'

let passou = 0, falhou = 0
const falhas = []
function ok(cond, nome, extra = '') {
  if (cond) { passou++; console.log(`  ok   ${nome}`) }
  else { falhou++; falhas.push(nome); console.log(`  FALHA ${nome} ${extra}`) }
}

const get = (caminho, token = TOKEN) =>
  fetch(`${BASE}${caminho}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {})

const servidor = spawn('npx', ['next', 'start', '-p', '3311'], {
  cwd: RAIZ, shell: true, env: { ...process.env, ...env },
})
servidor.stderr.on('data', (d) => { const s = String(d); if (s.includes('Error')) console.error('[srv]', s.trim()) })

try {
  // Espera o servidor responder
  let vivo = false
  for (let i = 0; i < 60; i++) {
    try { await fetch(`${BASE}/api/axi/schema`); vivo = true; break } catch { await new Promise((r) => setTimeout(r, 1000)) }
  }
  if (!vivo) throw new Error('servidor nao subiu')
  console.log('\n=== 1. AUTENTICACAO (caminhos negativos primeiro) ===')

  const semToken = await get('/api/axi/schema', null)
  ok(semToken.status === 401, 'sem token -> 401', `(veio ${semToken.status})`)

  const tokenErrado = await get('/api/axi/schema', 'x'.repeat(43))
  ok(tokenErrado.status === 403, 'token errado -> 403', `(veio ${tokenErrado.status})`)

  const tokenCurto = await get('/api/axi/schema', 'abc')
  ok(tokenCurto.status === 403, 'token curto -> 403', `(veio ${tokenCurto.status})`)

  // A promessa central: nenhuma rota aceita escrita.
  for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const rota of ['/api/axi/dados', '/api/axi/kpis', '/api/axi/historico', '/api/axi/schema']) {
      const r = await fetch(`${BASE}${rota}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 1 }),
      })
      ok(r.status === 405, `${metodo} ${rota} -> 405 (nao permitido)`, `(veio ${r.status})`)
    }
  }

  console.log('\n=== 2. SCHEMA ===')
  const sch = await (await get('/api/axi/schema')).json()
  ok(sch.ok === true, 'schema responde ok')
  ok(Array.isArray(sch.tabelas) && sch.tabelas.length >= 16, `schema lista ${sch.tabelas?.length} tabelas`)
  const opSchema = sch.tabelas.find((t) => t.nome === 'operacoes')
  ok(opSchema?.linhas === 200, `schema conta 200 operacoes (veio ${opSchema?.linhas})`)
  ok(Array.isArray(opSchema?.colunas) && opSchema.colunas.length > 20, `schema traz colunas reais (${opSchema?.colunas?.length})`)
  ok(!!sch.regras_de_negocio?.teto_lmg, 'schema documenta o teto de LMG')
  ok(!!sch.regras_de_negocio?.vigencia, 'schema alerta sobre a unidade da vigencia')

  console.log('\n=== 3. DADOS: carga completa e paginacao ===')
  const d1 = await (await get('/api/axi/dados?tabela=operacoes')).json()
  ok(d1.ok && d1.dados.length === 200, `operacoes completo = 200 linhas (veio ${d1.dados?.length})`)
  ok(d1.modo === 'completo', 'modo = completo sem "desde"')
  ok(d1.proximo_cursor === null, 'sem proxima pagina quando cabe tudo')

  const p1 = await (await get('/api/axi/dados?tabela=operacoes&limite=50')).json()
  ok(p1.dados.length === 50 && p1.proximo_cursor === 50, 'paginacao: 1a pagina de 50')
  const p2 = await (await get(`/api/axi/dados?tabela=operacoes&limite=50&cursor=${p1.proximo_cursor}`)).json()
  ok(p2.dados.length === 50 && p2.cursor === 50, 'paginacao: 2a pagina')
  const ids1 = new Set(p1.dados.map((o) => o.id))
  const repetidos = p2.dados.filter((o) => ids1.has(o.id))
  ok(repetidos.length === 0, 'paginacao nao repete registro entre paginas')

  // Varre a tabela inteira paginando e confere que nada se perde.
  const vistos = new Set()
  let cursor = 0, voltas = 0
  while (cursor !== null && voltas < 20) {
    const r = await (await get(`/api/axi/dados?tabela=tomadores&limite=100&cursor=${cursor}`)).json()
    r.dados.forEach((x) => vistos.add(x.id))
    cursor = r.proximo_cursor; voltas++
  }
  ok(vistos.size === 447, `varredura paginada de tomadores pega os 447 (pegou ${vistos.size})`)

  // Cada tabela da whitelist tem um `ordenarPor` proprio; uma so pode quebrar
  // sozinha. Exercita TODAS contra o que o /schema declara.
  console.log('\n=== 3b. TODAS as tabelas da whitelist ===')
  for (const t of sch.tabelas) {
    const r = await get(`/api/axi/dados?tabela=${t.nome}&limite=5`)
    const j = r.ok ? await r.json() : null
    ok(r.status === 200 && j?.ok === true, `${t.nome}: responde 200`, `(status ${r.status})`)
    if (j?.ok) {
      ok(j.total === t.linhas, `${t.nome}: total ${j.total} = schema ${t.linhas}`)
    }
  }

  console.log('\n=== 4. DADOS: delta incremental ===')
  const futuro = new Date(Date.now() + 86400000).toISOString()
  const dFut = await (await get(`/api/axi/dados?tabela=operacoes&desde=${futuro}`)).json()
  ok(dFut.total === 0 && dFut.dados.length === 0, 'delta do futuro = vazio')
  ok(dFut.modo === 'delta', 'modo = delta com "desde"')

  const passado = new Date('2020-01-01').toISOString()
  const dPass = await (await get(`/api/axi/dados?tabela=operacoes&desde=${passado}`)).json()
  ok(dPass.total === 200, `delta desde 2020 traz tudo (veio ${dPass.total})`)
  ok(dPass.marca_dagua !== null, 'delta devolve marca_dagua')

  const dRuim = await get('/api/axi/dados?tabela=operacoes&desde=ontem')
  ok(dRuim.status === 400, 'desde invalido -> 400 (nao vira full silencioso)')

  const tRuim = await get('/api/axi/dados?tabela=usuarios_secretos')
  ok(tRuim.status === 400, 'tabela fora da whitelist -> 400')

  const semDelta = await get('/api/axi/dados?tabela=anexos&desde=2020-01-01')
  ok(semDelta.status === 400, 'desde em tabela sem coluna de delta -> 400 explicito')

  console.log('\n=== 5. HISTORICO (a trilha temporal) ===')
  const h = await (await get('/api/axi/historico?limite=10')).json()
  ok(h.ok && h.dados.length === 10, 'historico responde paginado')
  ok(h.total_no_filtro > 2000, `historico tem ${h.total_no_filtro} eventos`)
  ok(h.proximo_apos_id !== null, 'historico devolve cursor keyset')

  const hSt = await (await get('/api/axi/historico?campo=status&tabela=operacoes&limite=5')).json()
  ok(hSt.dados.every((x) => x.campo === 'status' && x.tabela === 'operacoes'), 'filtro campo+tabela funciona')
  ok(hSt.dados.every((x) => x.valor_antes !== undefined && x.valor_depois !== undefined), 'historico traz de/para')

  // Keyset: varre e confere que nao repete nem pula
  const idsH = new Set()
  let apos = 0, v2 = 0
  while (apos !== null && v2 < 10) {
    const r = await (await get(`/api/axi/historico?tabela=operacoes&campo=status&limite=100&apos_id=${apos}`)).json()
    r.dados.forEach((x) => idsH.add(x.id))
    apos = r.proximo_apos_id; v2++
  }
  ok(idsH.size === 223, `varredura keyset pega as 223 transicoes de status (pegou ${idsH.size})`)

  console.log('\n=== 6. KPIS: paridade com o CRM ===')
  const k = await (await get('/api/axi/kpis')).json()
  ok(k.ok === true, 'kpis responde ok')
  ok(k.carteira.n_operacoes === 200, `kpis conta 200 operacoes (veio ${k.carteira.n_operacoes})`)
  ok(k.carteira.premio_total > 0, `premio total = ${k.carteira.premio_total}`)
  ok(k.carteira.taxa_media_ponderada > 0, `taxa ponderada = ${k.carteira.taxa_media_ponderada}`)
  ok(k.carteira.taxa_media_ponderada !== k.carteira.taxa_media_mensal, 'ponderada e mensal sao metricas distintas')
  ok(!!k.racional?.ponderada?.formula, 'kpis traz o racional da formula')
  ok(Array.isArray(k.ranking_corretoras) && k.ranking_corretoras.length > 0, `ranking com ${k.ranking_corretoras?.length} corretoras`)
  ok(k.aviso === null, 'sem aviso de truncamento')

  // Participacao tem que somar ~100%
  const somaPart = k.ranking_corretoras.reduce((s, c) => s + (c.participacao_pct ?? 0), 0)
  ok(Math.abs(somaPart - 1) < 0.001, `participacao soma 100% (somou ${(somaPart * 100).toFixed(2)}%)`)

  const kMes = await (await get('/api/axi/kpis?de=2026-07&ate=2026-07')).json()
  ok(kMes.filtro.operacoes_no_filtro <= 200, `filtro de julho: ${kMes.filtro.operacoes_no_filtro} operacoes`)
  ok(kMes.carteira.n_operacoes === kMes.filtro.operacoes_no_filtro, 'filtro de periodo e coerente')

  const kRuim = await get('/api/axi/kpis?de=julho')
  ok(kRuim.status === 400, 'periodo mal formatado -> 400')

  // PARIDADE: o cockpit usa .eq('ativo', true). A API tem que usar o mesmo recorte.
  ok(k.filtro.somente_ativas === true, 'kpis aplica o mesmo recorte da tela (somente ativas)')
  ok(/cockpit/i.test(k.paridade ?? ''), 'kpis declara a paridade com o cockpit')
  const kInat = await (await get('/api/axi/kpis?incluir_inativas=true')).json()
  ok(kInat.filtro.somente_ativas === false, 'override incluir_inativas funciona')
  ok(/NÃO batem/.test(kInat.paridade ?? ''), 'override avisa que perde a paridade')

  console.log('\n=== 7. CABECALHOS ===')
  const hr = await get('/api/axi/schema')
  ok(hr.headers.get('x-axi-modo') === 'somente-leitura', 'cabecalho X-Axi-Modo presente')
  ok((hr.headers.get('cache-control') ?? '').includes('no-store'), 'resposta nao e cacheada')

} catch (e) {
  console.error('\nERRO NO TESTE:', e.message)
  falhou++
} finally {
  // No Windows ha DOIS processos entre nos e o servidor (cmd.exe do shell:true
  // e o npx), entao nem `kill` nem `taskkill /T` no PID que temos alcancam o
  // next. Se o servidor sobrevive, ele segura a porta e a proxima execucao do
  // teste conecta no build ANTIGO — os testes entao passam ou falham por um
  // motivo que nao tem nada a ver com o codigo. Matar por PORTA e o unico jeito
  // confiavel: quem estiver escutando ali morre, seja qual for a arvore.
  servidor.kill('SIGKILL')
  try {
    const { execSync } = await import('node:child_process')
    execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3311 -State Listen -ErrorAction SilentlyContinue | ` +
      `Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore' },
    )
  } catch {}
  console.log(`\n${'='.repeat(56)}`)
  console.log(`PASSOU: ${passou}   FALHOU: ${falhou}`)
  if (falhas.length) console.log('Falhas:\n - ' + falhas.join('\n - '))
  setTimeout(() => process.exit(falhou > 0 ? 1 : 0), 500)
}
