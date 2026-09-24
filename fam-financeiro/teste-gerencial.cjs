// Testa a classificação gerencial (operacional × não operacional) e o Resumo
// gerencial, no arquivo que vai para o ar.
// Uso (a partir da raiz do repositório):
//   node fam-financeiro/teste-gerencial.cjs fam-financeiro/dashboard.html
//
// O teste NÃO usa o caixa real: ele monta em memória seis lançamentos de
// laboratório, com valores redondos e escolhidos para as contas baterem à mão.
// Assim ele roda na cópia de publicação (semente neutra) e não encosta em nada
// do Aldeir.
const path = require('node:path');
const { chromium } = require('playwright');

const ARQ = 'file:///' + path.resolve(process.argv[2] || 'fam-financeiro/dashboard.html').replace(/\\/g, '/');
let falhas = 0;
const ok = (t, c, extra) => {
  console.log((c ? '  ok   ' : '  FALHA') + ' · ' + t + (extra ? '  -> ' + extra : ''));
  if (!c) falhas++;
};
const perto = (a, b) => Math.abs(a - b) < 0.005;

/* jul/26 e ago/26, seis lançamentos por mês, em três contas:
     Prêmios          (entrada, operacional na cabeça do CFO)
     Receitas Financeiras (entrada, NÃO operacional)
     Fornecedores     (saída)
   Os valores são redondos de propósito: dá para conferir a soma sem calculadora. */
const SEMENTE = {
  '2026-07': [
    { natureza: 'Prêmios', contraparte: 'Alfa Corretora', descritivo: 'Prêmio de garantia', valor: 100000 },
    { natureza: 'Prêmios', contraparte: 'Beta Corretora', descritivo: 'Prêmio de garantia', valor: 40000 },
    { natureza: 'Receitas Financeiras', contraparte: 'Banco Santander', descritivo: 'Rendimento da aplicação', valor: 9000 },
    { natureza: 'Fornecedores', contraparte: 'Gama Serviços', descritivo: 'Serviço de TI', valor: -20000 },
    { natureza: 'Fornecedores', contraparte: 'Delta Consultoria', descritivo: 'Consultoria atuarial', valor: -5000 },
    { natureza: 'Fornecedores', contraparte: 'Gama Serviços', descritivo: 'Multa de rescisão', valor: -3000 },
  ],
  '2026-08': [
    { natureza: 'Prêmios', contraparte: 'Alfa Corretora', descritivo: 'Prêmio de garantia', valor: 120000 },
    { natureza: 'Receitas Financeiras', contraparte: 'Banco Santander', descritivo: 'Rendimento da aplicação', valor: 11000 },
    { natureza: 'Fornecedores', contraparte: 'Gama Serviços', descritivo: 'Serviço de TI', valor: -25000 },
  ],
};

(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  await p.addInitScript(() => { window.__printou = 0; window.print = () => { window.__printou++; }; });
  const erros = [];
  p.on('pageerror', e => erros.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  p.on('dialog', d => d.accept());

  await p.goto(ARQ);
  await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(400);

  await p.evaluate(s => {
    for (const mk of Object.keys(s)) {
      if (!DB.meses[mk]) DB.meses[mk] = { rotulo: mk, saldoInicial: 0, saldoFinalBancario: 0, simulado: false, lancamentos: [] };
      DB.meses[mk].lancamentos = s[mk].map((l, i) => ({ ...l, id: 'T' + mk + i, data: mk + '-10' }));
      DB.meses[mk].saldoFinalBancario = DB.meses[mk].saldoInicial + s[mk].reduce((t, l) => t + l.valor, 0);
    }
    verMeses({ modo: 'ultimos', n: 2 });
    gravar(); render();
  }, SEMENTE);
  await p.waitForTimeout(300);

  const ap = mk => p.evaluate(m => apurar(m), mk);
  /* a janela do resumo, lida como o CFO lê: rótulo da linha e as células */
  const lerResumo = () => p.evaluate(() => ({
    aberta: document.getElementById('rg-janela').classList.contains('aberta'),
    sub: document.getElementById('rg-sub').textContent.trim(),
    kpis: [...document.querySelectorAll('#rg-janela .rg-kpi')].map(k => ({
      rot: k.querySelector('.rg-kpi-rot').textContent.trim(),
      num: k.querySelector('.rg-kpi-num').textContent.trim(),
      varia: k.querySelector('.rg-kpi-var .badge').textContent.trim(),
      classe: k.querySelector('.rg-kpi-var .badge').className,
    })),
    faixas: [...document.querySelectorAll('#rg-janela tr.grupo td')].map(t => t.textContent.trim()),
    linhas: [...document.querySelectorAll('#rg-janela tbody tr:not(.grupo)')].map(tr => ({
      rot: tr.querySelector('td').textContent.trim(),
      nums: [...tr.querySelectorAll('td.num')].map(t => t.textContent.trim()),
      classe: tr.className,
      selo: (tr.querySelector('td.num .badge') || {}).className || '',
    })),
    barras: [...document.querySelectorAll('#rg-janela .rg-comp-linha')].map(l => l.textContent.replace(/\s+/g, ' ').trim()),
    falta: document.querySelectorAll('#rg-janela .rg-aviso').length,
    ok: document.querySelectorAll('#rg-janela .rg-ok').length,
  }));

  console.log('\n═══ 1. sem classificação, tudo cai em "sem" ═══');
  let a = await ap('2026-07');
  ok('entradas de julho somam 149.000', perto(a.entradas, 149000), String(a.entradas));
  ok('saídas de julho somam -28.000', perto(a.saidas, -28000), String(a.saidas));
  ok('nada é operacional ainda', perto(a.entOp, 0) && perto(a.saiOp, 0));
  ok('nada é não operacional ainda', perto(a.entNop, 0) && perto(a.saiNop, 0));
  ok('tudo está sem classificação', perto(a.entSem, 149000) && perto(a.saiSem, -28000));
  ok('as caixas fecham com o total de entradas', perto(a.entOp + a.entNop + a.entSem, a.entradas));
  ok('as caixas fecham com o total de saídas', perto(a.saiOp + a.saiNop + a.saiSem, a.saidas));

  console.log('\n═══ 2. a conta classifica, e os lançamentos dela herdam ═══');
  await p.evaluate(() => {
    classificarConta('Prêmios', GER_OP);
    classificarConta('Receitas Financeiras', GER_NOP);
    classificarConta('Fornecedores', GER_OP);
  });
  await p.waitForTimeout(200);
  a = await ap('2026-07');
  ok('entrada operacional = 140.000 (os dois prêmios)', perto(a.entOp, 140000), String(a.entOp));
  ok('entrada NÃO operacional = 9.000 (receita financeira)', perto(a.entNop, 9000), String(a.entNop));
  ok('saída operacional = -28.000', perto(a.saiOp, -28000), String(a.saiOp));
  ok('não sobrou nada sem classificação', perto(a.entSem, 0) && perto(a.saiSem, 0));
  ok('resultado operacional = 112.000', perto(a.gerResOp, 112000), String(a.gerResOp));
  ok('resultado não operacional = 9.000', perto(a.gerResNop, 9000), String(a.gerResNop));
  ok('operacional + não operacional = resultado do mês',
     perto(a.gerResOp + a.gerResNop + a.gerResSem, a.resultado));
  ok('os totais de entrada/saída NÃO mudaram', perto(a.entradas, 149000) && perto(a.saidas, -28000));

  console.log('\n═══ 3. a contraparte discorda da conta (override do nível 2) ═══');
  await p.evaluate(() => classificarContraparte('Fornecedores', normalizar('Delta Consultoria'), 'Delta Consultoria', GER_NOP));
  await p.waitForTimeout(200);
  a = await ap('2026-07');
  ok('saída operacional caiu para -23.000', perto(a.saiOp, -23000), String(a.saiOp));
  ok('saída não operacional = -5.000', perto(a.saiNop, -5000), String(a.saiNop));
  ok('o total de saídas continua -28.000', perto(a.saidas, -28000), String(a.saidas));

  console.log('\n═══ 4. o lançamento discorda da contraparte (override do nível 3) ═══');
  await p.evaluate(() => classificarLancamentos([['2026-07', 'T2026-075']], GER_NOP));  // a multa de rescisão
  await p.waitForTimeout(200);
  a = await ap('2026-07');
  ok('saída operacional caiu para -20.000', perto(a.saiOp, -20000), String(a.saiOp));
  ok('saída não operacional subiu para -8.000', perto(a.saiNop, -8000), String(a.saiNop));
  ok('o total de saídas continua -28.000', perto(a.saidas, -28000), String(a.saidas));
  const org = await p.evaluate(() => {
    const l = DB.meses['2026-07'].lancamentos.find(z => z.id === 'T2026-075');
    const o = DB.meses['2026-07'].lancamentos.find(z => z.id === 'T2026-073');
    return { dele: origemGer(l), daConta: origemGer(o) };
  });
  ok('o lançamento marcado diz que a etiqueta é dele', org.dele === 'lancamento', org.dele);
  ok('o lançamento vizinho continua herdando da conta', org.daConta === 'conta', org.daConta);

  console.log('\n═══ 5. herança e override valem para o mês seguinte também ═══');
  const b8 = await ap('2026-08');
  ok('ago/26 herda sem ninguém classificar de novo',
     perto(b8.entOp, 120000) && perto(b8.entNop, 11000) && perto(b8.saiOp, -25000),
     b8.entOp + ' / ' + b8.entNop + ' / ' + b8.saiOp);

  console.log('\n═══ 6. renomear NÃO desclassifica ═══');
  await p.evaluate(() => {
    for (const d of todosOsDb()) for (const mk of Object.keys(d.meses))
      for (const l of d.meses[mk].lancamentos) if (l.natureza === 'Prêmios') l.natureza = 'Prêmios Emitidos';
    gerRenomearConta('Prêmios', 'Prêmios Emitidos');
    gravar(); render();
  });
  await p.waitForTimeout(200);
  a = await ap('2026-07');
  ok('depois de renomear, a conta continua operacional', perto(a.entOp, 140000), String(a.entOp));

  console.log('\n═══ 7. a etiqueta sobrevive a fechar e abrir o sistema ═══');
  await p.reload();
  await p.waitForTimeout(500);
  a = await ap('2026-07');
  ok('depois do reload, entrada operacional = 140.000', perto(a.entOp, 140000), String(a.entOp));
  ok('depois do reload, saída não operacional = -8.000', perto(a.saiNop, -8000), String(a.saiNop));
  const naRaiz = await p.evaluate(() => JSON.parse(localStorage.getItem('fam-financeiro-tela1')).gerencial);
  ok('a classificação está gravada na RAIZ', !!naRaiz && !!naRaiz.contas, JSON.stringify(naRaiz && naRaiz.contas));

  console.log('\n═══ 8. o selo aparece na tela, e só onde diz algo novo ═══');
  await p.evaluate(() => {
    expandirTudo();
    // expandirTudo abre as contas (nivel 1); os lancamentos moram no nivel 3
    abertasCP.add(idCP('Fornecedores', normalizar('Gama Serviços')));
    render();
  });
  await p.waitForTimeout(400);
  const selos = await p.evaluate(() => {
    const tr = [...document.querySelectorAll('#comp-corpo tr.linha-nat')]
      .find(t => t.dataset.nat === 'Prêmios Emitidos');
    const cp = [...document.querySelectorAll('#comp-corpo tr.cp')]
      .find(t => t.dataset.nat === 'Fornecedores' && t.dataset.cp === normalizar('Delta Consultoria'));
    const cpHerda = [...document.querySelectorAll('#comp-corpo tr.cp')]
      .find(t => t.dataset.nat === 'Fornecedores' && t.dataset.cp === normalizar('Gama Serviços'));
    return {
      conta: tr ? (tr.querySelector('.ger') || {}).textContent || null : 'sem linha',
      cpOverride: cp ? (cp.querySelector('.ger') || {}).textContent || null : 'sem linha',
      cpHerdando: cpHerda ? !!cpHerda.querySelector('.ger') : 'sem linha',
    };
  });
  ok('a conta operacional mostra o selo "Oper."', selos.conta === 'Oper.', String(selos.conta));
  ok('a contraparte com etiqueta própria mostra "Não oper."', selos.cpOverride === 'Não oper.', String(selos.cpOverride));
  ok('a contraparte que só herda NÃO mostra selo', selos.cpHerdando === false, String(selos.cpHerdando));

  console.log('\n═══ 9. o menu do botão direito oferece as duas opções, nos três níveis ═══');
  const abrirMenu = async sel => {
    await p.click(sel, { button: 'right' });
    await p.waitForTimeout(180);
    const itens = await p.$$eval('#ctx-menu .ctx-item', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(120);
    return itens;
  };
  const mConta = await abrirMenu('#comp-corpo tr.linha-nat[data-nat="Prêmios Emitidos"] td:first-child');
  ok('menu da conta tem "Classificação gerencial"', mConta.some(t => /Classificação gerencial/.test(t)), mConta.length + ' itens');
  ok('menu da conta tem Operacional e Não operacional',
     mConta.some(t => /^[^ ]*\s*Operacional$/.test(t)) && mConta.some(t => /Não operacional$/.test(t)),
     mConta.filter(t => /perac/.test(t)).join(' | '));
  ok('menu da conta marca a que está valendo', mConta.some(t => /^✔️\s*Operacional$/.test(t)), mConta.filter(t => /perac/.test(t)).join(' | '));

  const mCp = await abrirMenu(`#comp-corpo tr.cp[data-nat="Fornecedores"] td:first-child`);
  ok('menu da contraparte tem a classificação', mCp.some(t => /Classificação gerencial/.test(t)));
  ok('menu da contraparte diz de quem está herdando', mCp.some(t => /Herdando|Voltar a herdar/.test(t)),
     mCp.filter(t => /Herd/.test(t)).join(' | '));

  const mLanc = await abrirMenu('#comp-corpo tr.lanc td.rot');
  ok('menu do lançamento tem a classificação', mLanc.some(t => /Classificação gerencial/.test(t)));

  console.log('\n═══ 10. a janela do Resumo gerencial ═══');
  await p.click('button:has-text("📊 Resumo gerencial")');
  await p.waitForTimeout(400);
  let R = await lerResumo();
  const achar = r => (R.linhas.find(l => l.rot === r) || {}).nums;
  ok('a janela abriu', R.aberta === true);
  ok('o subtítulo diz a aba e o par comparado', /Principal.*Julho\/2026.*Agosto\/2026/.test(R.sub), R.sub);
  ok('tem as três faixas', R.faixas.join('|') === 'Entradas|Saídas|Resultado', R.faixas.join('|'));
  ok('tem os três números grandes',
     R.kpis.map(k => k.rot).join('|') === 'Resultado operacional|Resultado não operacional|Resultado do mês',
     R.kpis.map(k => k.rot).join('|'));
  ok('e eles saem em caixa alta na tela',
     (await p.$eval('#rg-janela .rg-kpi-rot', e => getComputedStyle(e).textTransform)) === 'uppercase');
  ok('Operacionais (entradas) = 140.000 em jul e 120.000 em ago',
     /140\.000/.test((achar('Operacionais') || [])[0] || '') && /120\.000/.test((achar('Operacionais') || [])[1] || ''),
     JSON.stringify(achar('Operacionais')));
  ok('Total de entradas é o mesmo da tela (149.000)',
     /149\.000/.test((achar('Total de entradas') || [])[0] || ''), JSON.stringify(achar('Total de entradas')));
  ok('Total de saídas é o mesmo da tela (28.000)',
     /28\.000/.test((achar('Total de saídas') || [])[0] || ''), JSON.stringify(achar('Total de saídas')));

  /* A REGRESSÃO DA PRIMEIRA VERSÃO: a classe `sem` colidia com o ponto do
     semáforo (9px, redondo) e a linha inteira virava uma bolinha, com os
     valores derramados ao lado. A linha tem que ser uma linha de tabela, com
     uma célula por coluna, e nunca um quadrado de 9px. */
  const forma = await p.evaluate(() => {
    const tr = [...document.querySelectorAll('#rg-janela tbody tr')].find(t => /Sem classificação/.test(t.textContent));
    if (!tr) return { achou: false };
    const r = tr.getBoundingClientRect();
    return { achou: true, largura: Math.round(r.width), altura: Math.round(r.height),
             celulas: tr.querySelectorAll('td').length, display: getComputedStyle(tr).display };
  });
  ok('não há linha "Sem classificação" com tudo classificado', forma.achou === false, JSON.stringify(forma));

  ok('a barra de composição existe para entradas e saídas', R.barras.length === 2, JSON.stringify(R.barras));
  ok('a composição mostra a fatia operacional', /operacional/.test(R.barras[0] || ''), R.barras[0]);
  ok('o resumo avisa que nada falta classificar', R.ok === 1 && R.falta === 0);

  // o total da janela tem que bater com o total da tabela de trás, ao centavo
  const totalTabela = await p.evaluate(() => {
    const tr = [...document.querySelectorAll('#comp-corpo tr.subtotal')].find(t => /TOTAL ENTRADAS/.test(t.textContent));
    return tr ? tr.querySelectorAll('td')[1].textContent.trim() : null;
  });
  ok('o total de entradas da janela e o da tela são o mesmo texto',
     totalTabela === (achar('Total de entradas') || [])[0],
     totalTabela + ' × ' + (achar('Total de entradas') || [])[0]);

  console.log('\n═══ 10b. a janela se arrasta, e lembra onde foi largada ═══');
  const antesDrag = await p.evaluate(() => {
    const r = document.getElementById('rg-janela').getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top) };
  });
  const cx = await (await p.$('.rg-barra')).boundingBox();
  await p.mouse.move(cx.x + 180, cx.y + 14);
  await p.mouse.down();
  await p.mouse.move(cx.x + 180 - 120, cx.y + 14 + 210, { steps: 12 });
  await p.mouse.up();
  await p.waitForTimeout(250);
  const depoisDrag = await p.evaluate(() => {
    const r = document.getElementById('rg-janela').getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top) };
  });
  ok('a janela saiu do lugar quando arrastada',
     Math.abs(depoisDrag.x - antesDrag.x) > 80 && Math.abs(depoisDrag.y - antesDrag.y) > 150,
     JSON.stringify(antesDrag) + ' -> ' + JSON.stringify(depoisDrag));
  ok('o lugar ficou gravado',
     !!(await p.evaluate(() => localStorage.getItem('fam-financeiro-resumo-lugar'))),
     await p.evaluate(() => localStorage.getItem('fam-financeiro-resumo-lugar')));
  ok('a janela continua aberta depois do arrasto',
     (await lerResumo()).aberta === true);
  /* arrastada para baixo, a janela não pode empurrar o rodapé para fora:
     as ações (copiar, imprimir, PDF) moram lá e não teriam como voltar */
  const rodape = await p.evaluate(() => {
    const r = document.querySelector('#rg-janela .rg-rodape').getBoundingClientRect();
    const j = document.getElementById('rg-janela').getBoundingClientRect();
    return { dentro: r.bottom <= window.innerHeight + 1 && r.top >= 0,
             janelaCabe: j.bottom <= window.innerHeight + 1,
             bottom: Math.round(r.bottom), tela: window.innerHeight };
  });
  ok('o rodapé com as ações continua dentro da tela', rodape.dentro === true, JSON.stringify(rodape));
  ok('e a janela inteira encolheu para caber', rodape.janelaCabe === true, JSON.stringify(rodape));

  console.log('\n═══ 10c. fecha no Esc, no × e clicando fora ═══');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(220);
  ok('Esc fecha', (await lerResumo()).aberta === false);

  await p.click('button:has-text("📊 Resumo gerencial")');
  await p.waitForTimeout(300);
  ok('reabriu no lugar onde foi largada',
     Math.abs((await p.evaluate(() => Math.round(document.getElementById('rg-janela').getBoundingClientRect().left))) - depoisDrag.x) < 3);
  await p.click('#rg-fundo', { position: { x: 12, y: 12 } });
  await p.waitForTimeout(220);
  ok('clicar fora fecha', (await lerResumo()).aberta === false);

  await p.click('button:has-text("📊 Resumo gerencial")');
  await p.waitForTimeout(300);
  await p.click('#rg-janela .rg-x');
  await p.waitForTimeout(220);
  ok('o × fecha', (await lerResumo()).aberta === false);

  await p.click('button:has-text("📊 Resumo gerencial")');
  await p.waitForTimeout(300);
  const tapa = await p.evaluate(() => {
    const f = document.getElementById('rg-fundo').getBoundingClientRect();
    return f.width >= window.innerWidth && f.height >= window.innerHeight;
  });
  ok('o fundo cobre a tela inteira, então clicar em qualquer lugar fora fecha', tapa === true);
  /* clicando justo em cima do botão que a abriu: o fundo está por cima, e
     quem responde é ele · a janela fecha, e o botão não reabre atrás */
  const bt = await (await p.$('button:has-text("📊 Resumo gerencial")')).boundingBox();
  await p.mouse.click(bt.x + bt.width / 2, bt.y + bt.height / 2);
  await p.waitForTimeout(250);
  ok('clicar sobre o botão de abrir também fecha, e não reabre', (await lerResumo()).aberta === false);

  console.log('\n═══ 10d. imprimir e PDF montam a folha, e não a deixam presa ═══');
  await p.click('button:has-text("📊 Resumo gerencial")');
  await p.waitForTimeout(300);
  await p.click('#rg-janela .rg-link:has-text("Imprimir")');
  await p.waitForTimeout(150);
  const impr = await p.evaluate(() => ({
    marcou: document.body.classList.contains('imprimindo-resumo'),
    cabecalho: (document.getElementById('rg-papel') || {}).textContent || '',
    chamou: window.__printou,
  }));
  ok('a impressão foi disparada', impr.chamou >= 1, String(impr.chamou));
  ok('a folha ganhou o cabeçalho com data e responsável',
     /FAM SEGURADORA · Resumo gerencial/.test(impr.cabecalho) && /CFO/.test(impr.cabecalho),
     impr.cabecalho.slice(0, 90));
  await p.waitForTimeout(800);
  ok('a marca de impressão sai sozinha depois',
     (await p.evaluate(() => document.body.classList.contains('imprimindo-resumo'))) === false);
  await p.click('#rg-janela .rg-link:has-text("PDF")');
  await p.waitForTimeout(150);
  ok('o PDF usa o mesmo caminho', (await p.evaluate(() => window.__printou)) >= 2);
  await p.waitForTimeout(800);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  console.log('\n═══ 11. tirar a classificação devolve a linha para quem está em cima ═══');
  await p.evaluate(() => classificarLancamentos([['2026-07', 'T2026-075']], null));
  await p.waitForTimeout(200);
  a = await ap('2026-07');
  ok('a multa voltou a herdar de Fornecedores (operacional)', perto(a.saiOp, -23000), String(a.saiOp));
  await p.evaluate(() => classificarConta('Fornecedores', null));
  await p.waitForTimeout(200);
  a = await ap('2026-07');
  ok('tirando a da conta, sobra só o override da contraparte',
     perto(a.saiNop, -5000) && perto(a.saiOp, 0) && perto(a.saiSem, -23000),
     a.saiNop + ' / ' + a.saiOp + ' / ' + a.saiSem);
  ok('e as caixas continuam fechando com o total', perto(a.saiOp + a.saiNop + a.saiSem, a.saidas));

  console.log('\n═══ 12. o resumo passa a cobrar o que falta, e a linha âmbar é uma LINHA ═══');
  await p.click('button:has-text("📊 Resumo gerencial")');
  await p.waitForTimeout(400);
  R = await lerResumo();
  ok('agora existe o aviso do que falta classificar', R.falta === 1 && R.ok === 0);
  const semLinha = R.linhas.filter(l => l.rot === 'Sem classificação');
  ok('a linha "Sem classificação" aparece nas saídas', semLinha.length === 1, JSON.stringify(R.linhas.map(l => l.rot)));
  ok('e ela está marcada em âmbar', /rg-falta-linha/.test((semLinha[0] || {}).classe || ''), (semLinha[0] || {}).classe);
  /* a regressão do `.sem`: a linha precisa ocupar a largura da tabela e ter
     uma célula por coluna, e não virar um ponto de 9px */
  const f2 = await p.evaluate(() => {
    const tr = [...document.querySelectorAll('#rg-janela tbody tr')].find(t => /Sem classificação/.test(t.textContent));
    const tab = document.querySelector('#rg-janela table');
    const r = tr.getBoundingClientRect(), t = tab.getBoundingClientRect();
    return { largura: Math.round(r.width), larguraTab: Math.round(t.width), altura: Math.round(r.height),
             celulas: tr.querySelectorAll('td').length, display: getComputedStyle(tr).display };
  });
  ok('a linha ocupa a largura da tabela (não virou bolinha de 9px)',
     f2.largura > f2.larguraTab - 4 && f2.altura > 16, JSON.stringify(f2));
  ok('e tem uma célula por coluna', f2.celulas === 5, String(f2.celulas));
  ok('o resultado sem classificação também aparece',
     R.linhas.some(l => l.rot === 'Resultado sem classificação'), JSON.stringify(R.linhas.map(l => l.rot)));

  /* O SINAL DO RESULTADO: -23.000 em jul contra -23.000 em ago não muda, mas a
     conta que interessa aqui é a do resultado piorando · variacao() em módulo
     pintava de verde um resultado negativo que ficou mais negativo. */
  const sinal = await p.evaluate(() => {
    const v1 = variacaoResultado(-18000, -21000);
    const v2 = variacaoResultado(-21000, -18000);
    const v3 = variacaoResultado(10000, -5000);
    const v4 = variacaoResultado(0, 0);
    return { v1, v2, v3, v4 };
  });
  ok('resultado de -18 mil para -21 mil é VERMELHO e negativo',
     sinal.v1.classe === 'badge-red' && sinal.v1.dif === -3000 && /16,7/.test(sinal.v1.texto),
     JSON.stringify(sinal.v1));
  ok('e o caminho de volta é VERDE', sinal.v2.classe === 'badge-green' && sinal.v2.dif === 3000, JSON.stringify(sinal.v2));
  ok('trocar de sinal não vira percentual inventado', sinal.v3.texto === 'virou negativo', JSON.stringify(sinal.v3));
  ok('zero contra zero não inventa variação', sinal.v4.texto === '-', JSON.stringify(sinal.v4));

  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  /* a cópia para o Excel tem que dizer a MESMA coisa que a janela: um texto
     colado numa apresentação não pode discordar da tela de onde saiu */
  const excel = await p.evaluate(() => {
    let pego = null;
    const antes = window.copiar;
    window.copiar = t => { pego = t; };
    copiarResumoGerencial();
    window.copiar = antes;
    return pego;
  });
  const colada = r => (excel.split('\n').find(l => l.startsWith(r)) || '').split('\t');
  const naJanela = (R.linhas.find(l => l.rot === 'Resultado sem classificação') || {}).nums || [];
  ok('a cópia traz o resultado sem classificação igualzinho ao da janela',
     colada('Resultado sem classificação')[3] === naJanela[2].replace(/[^\d.,-]/g, '') &&
     colada('Resultado sem classificação')[4] === naJanela[3],
     JSON.stringify(colada('Resultado sem classificação')) + ' vs ' + JSON.stringify(naJanela));
  ok('e o sinal é de piora (vermelho e negativo)',
     colada('Resultado sem classificação')[3].startsWith('-') &&
     colada('Resultado sem classificação')[4].startsWith('▼'),
     JSON.stringify(colada('Resultado sem classificação')));
  ok('e o total de entradas colado é o mesmo da janela',
     colada('TOTAL ENTRADAS')[1] === '149.000,00',
     JSON.stringify(colada('TOTAL ENTRADAS')));

  console.log('\n═══ 13. a trilha de auditoria registrou cada decisão ═══');
  const trilha = await p.evaluate(() => AUDITORIA.filter(r => /Classificação gerencial/.test(r.acao))
    .map(r => r.acao + ' · ' + r.onde + ' · ' + r.de + ' > ' + r.para));
  ok('a trilha tem as classificações', trilha.length >= 6, trilha.length + ' registros');
  ok('a trilha diz o antes e o depois', trilha.some(t => /Sem classificação > Operacional/.test(t)),
     trilha.slice(0, 2).join(' || '));

  console.log('\n═══ 14. copiar a linha NÃO leva o selo junto ═══');
  const copiado = await p.evaluate(() => {
    const tr = [...document.querySelectorAll('#comp-corpo tr.linha-nat')]
      .find(t => t.dataset.nat === 'Prêmios Emitidos');
    let pego = null;
    const antes = window.copiar;
    window.copiar = t => { pego = t; };
    copiarLinhaTela(tr);
    window.copiar = antes;
    return pego;
  });
  ok('a linha copiada tem o nome da conta', /Prêmios Emitidos/.test(copiado || ''), JSON.stringify(copiado));
  ok('a linha copiada NÃO leva o selo "Oper."', !/Oper\./.test(copiado || ''), JSON.stringify(copiado));

  console.log('\n═══ 15. no celular o resumo continua abrindo (ele é de ler) ═══');
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(350);
  await p.click('button:has-text("📊 Resumo gerencial")');
  await p.waitForTimeout(450);
  const noCelular = await p.evaluate(() => {
    const j = document.getElementById('rg-janela');
    const r = j.getBoundingClientRect();
    return {
      abriu: j.classList.contains('aberta'),
      linhas: document.querySelectorAll('#rg-janela tbody tr').length,
      kpisEmpilhados: getComputedStyle(document.querySelector('#rg-janela .rg-kpis')).gridTemplateColumns.split(' ').length === 1,
      dentroDaTela: r.left >= -1 && r.right <= window.innerWidth + 1,
      semRolagemLateral: document.documentElement.scrollWidth <= window.innerWidth + 1,
      rodapeVisivel: !!document.querySelector('#rg-janela .rg-rodape'),
    };
  });
  ok('o resumo abre no celular', noCelular.abriu === true);
  ok('com as linhas todas', noCelular.linhas >= 12, String(noCelular.linhas));
  ok('os três números empilham', noCelular.kpisEmpilhados === true);
  ok('a janela cabe na largura da tela', noCelular.dentroDaTela === true);
  ok('e a página não ganha rolagem lateral', noCelular.semRolagemLateral === true);
  ok('as ações continuam no rodapé', noCelular.rodapeVisivel === true);
  await p.keyboard.press('Escape');
  await p.setViewportSize({ width: 1440, height: 950 });
  await p.waitForTimeout(250);

  console.log('\n═══ 16. desfazer (Ctrl+Z) volta a classificação também ═══');
  await p.evaluate(() => { classificarConta('Receitas Financeiras', GER_OP); });
  await p.waitForTimeout(200);
  let d = await ap('2026-07');
  ok('a receita financeira virou operacional', perto(d.entOp, 149000), String(d.entOp));
  await p.evaluate(() => desfazer());
  await p.waitForTimeout(250);
  d = await ap('2026-07');
  ok('desfazer devolveu a etiqueta antiga', perto(d.entNop, 9000) && perto(d.entOp, 140000),
     d.entOp + ' / ' + d.entNop);
  await p.evaluate(() => refazer());
  await p.waitForTimeout(250);
  d = await ap('2026-07');
  ok('refazer traz a nova de volta', perto(d.entOp, 149000), String(d.entOp));
  await p.evaluate(() => desfazer());
  await p.waitForTimeout(250);

  console.log('\n═══ 17. a cópia de segurança leva a classificação junto ═══');
  const backup = await p.evaluate(() => JSON.stringify({ db: RAIZ, auditoria: AUDITORIA, visaoMeses }));
  ok('o arquivo de backup carrega RAIZ.gerencial', /"gerencial"/.test(backup));
  const restaurado = await p.evaluate(txt => {
    const o = JSON.parse(txt);
    RAIZ = o.db; RAIZ.cenarios = RAIZ.cenarios || [];
    DB = RAIZ.principal; gravar(); render();
    return apurar('2026-07');
  }, backup);
  ok('depois de restaurar, os números gerenciais são os mesmos',
     perto(restaurado.entOp, 140000) && perto(restaurado.entNop, 9000) && perto(restaurado.saiNop, -5000),
     restaurado.entOp + ' / ' + restaurado.entNop + ' / ' + restaurado.saiNop);

  console.log('\n═══ 18. nenhum erro de JavaScript no caminho ═══');
  ok('sem erro no console', erros.length === 0, erros.slice(0, 3).join(' | '));

  await b.close();
  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo certo') + '\n');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
