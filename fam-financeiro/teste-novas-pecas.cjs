// Testa as peças novas: carga limpa da Matriz, muitos meses na tela com faixa
// de trimestre, a barra de comandos compacta, a HP-12C (teclado da máquina,
// RPN, as cinco financeiras, e a janela e o ícone que se arrastam), a trilha
// de auditoria e a assinatura no rodapé.
// Uso: node fam-financeiro/teste-novas-pecas.cjs fam-financeiro/dashboard.html
const path = require('node:path');
const { chromium } = require('playwright');

const ARQ = 'file:///' + path.resolve(process.argv[2] || 'fam-financeiro/dashboard.html').replace(/\\/g, '/');
let falhas = 0;
const ok = (t, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + ' · ' + t + (extra ? '  -> ' + extra : '')); if (!c) falhas++; };
const txt = e => e.textContent.replace(/\s+/g, ' ').trim();

(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const p = await b.newPage({ viewport: { width: 1500, height: 980 } });
  const erros = [];
  p.on('pageerror', e => erros.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

  await p.goto(ARQ);
  await p.evaluate(() => { localStorage.clear(); });
  await p.reload();
  await p.waitForSelector('#comp-corpo table');

  console.log('\n=== CARGA DE FÁBRICA: só a planilha Matriz ===');
  const meses = await p.evaluate(() => mesesOrdenados());
  ok('só julho/2026 está carregado', meses.length === 1 && meses[0] === '2026-07', meses.join(','));
  const jul = await p.evaluate(() => ({
    n: DB.meses['2026-07'].lancamentos.length,
    e: apurar('2026-07').entradas, s: apurar('2026-07').saidas,
    d: apurar('2026-07').diferenca, si: DB.meses['2026-07'].saldoInicial,
    origem: DB.meses['2026-07'].origem || '',
  }));
  ok('93 lançamentos da Matriz', jul.n === 93, String(jul.n));
  ok('entradas fecham em 953.892,67', Math.abs(jul.e - 953892.67) < 0.005, jul.e.toFixed(2));
  ok('saídas fecham em -914.986,87', Math.abs(jul.s + 914986.87) < 0.005, jul.s.toFixed(2));
  ok('saldo inicial 4.779,38', Math.abs(jul.si - 4779.38) < 0.005, jul.si.toFixed(2));
  ok('conciliação zero', Math.abs(jul.d) < 0.005, jul.d.toFixed(2));
  ok('o mês diz que veio da Matriz', /Matriz/.test(jul.origem), jul.origem);
  ok('nenhuma simulação ficou de pé', (await p.evaluate(() => RAIZ.cenarios.length)) === 0);

  console.log('\n=== ASSINATURA NO RODAPÉ ===');
  ok('rodapé da tela traz o nome', /Desenvolvido por: Marco Aurélio Dragone/.test(await p.$eval('.credito', txt)));
  ok('existe a assinatura de impressão', await p.$eval('.credito-papel', e => /Marco Aurélio Dragone/.test(e.textContent)));

  console.log('\n=== TRILHA DE AUDITORIA ===');
  let aud = await p.evaluate(() => AUDITORIA.map(r => r.acao));
  ok('a carga inicial ficou registrada', aud.some(a => /Primeira abertura|Carga de fábrica/.test(a)), aud.join(' | '));

  // uma edição de valor tem que virar de -> para
  await p.evaluate(() => { abertasComp.add('Tarifa bancária'); render(); });
  await p.click('#comp-corpo tr.cp');
  await p.waitForSelector('td[data-edit="valor"]');
  await p.evaluate(() => salvarCelula(document.querySelector('td[data-edit="valor"]'), '99,00'));
  aud = await p.evaluate(() => AUDITORIA[AUDITORIA.length - 1]);
  ok('a correção de valor entrou na trilha', aud.acao === 'Valor corrigido na linha', aud.acao);
  ok('a trilha guarda de -> para', !!aud.de && !!aud.para && aud.de !== aud.para, aud.de + ' -> ' + aud.para);

  /* a trilha saiu da barra de cima: os caminhos que restaram sao o rodape e o
     botao direito da tela */
  await p.click('footer button:has-text("Trilha de auditoria")');
  await p.waitForSelector('#aud-tab');
  const linhasAud = await p.$$eval('#aud-tab tbody tr', els => els.length);
  ok('a janela da trilha lista os registros', linhasAud >= 2, String(linhasAud));
  ok('a trilha não tem botão de apagar registro',
    !(await p.$$eval('#modais button', els => els.some(e => /apagar|excluir|limpar/i.test(e.textContent)))));
  await p.selectOption('.aud-filtros select >> nth=1', 'alteracao');
  const soAlt = await p.$$eval('#aud-tab tbody tr .aud-tag', els => els.every(e => e.classList.contains('alteracao')));
  ok('o filtro por tipo funciona', soAlt);
  await p.click('.modal-rodape .btn-primary');

  console.log('\n=== A TELA LIMPA: O QUE SAIU DA BARRA VIVE NO BOTÃO DIREITO ===');
  const naBarra = await p.$$eval('.acoes-tela button', els => els.map(e => e.textContent.trim()));
  ok('"Meses na tela" saiu da barra de cima', !naBarra.some(t => /Meses na tela/.test(t)), naBarra.join(' | '));
  ok('"Trilha de auditoria" saiu da barra de cima', !naBarra.some(t => /Trilha de auditoria/.test(t)), naBarra.join(' | '));
  ok('o chip "Total por trimestre" saiu da barra de cima',
    !/trimestre/i.test(await p.$eval('#sel-meses', txt)), await p.$eval('#sel-meses', txt));
  await p.click('#comp-corpo', { button: 'right', position: { x: 8, y: 8 } });
  await p.waitForSelector('#ctx-menu');
  const menuTela = await p.$$eval('#ctx-menu .ctx-item', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  for (const t of ['Escolher os meses da tela', 'agrupamento por trimestre', 'Trilha de auditoria'])
    ok('o botao direito da tela oferece "' + t + '"', menuTela.some(x => x.includes(t)), menuTela.join(' | '));
  await p.keyboard.press('Escape');

  console.log('\n=== BARRA DE CIMA, EM TAMANHO DE SISTEMA ===');
  const barra = await p.$eval('.filter-row', e => Math.round(e.getBoundingClientRect().height));
  ok('a barra de comandos cabe em pouca altura', barra <= 175, barra + 'px');
  /* So os botoes VISIVEIS entram na conta. O Simulador fica escondido na aba
     Principal (ele so vale dentro de uma simulacao), e escondido tem top = 0 ·
     sem filtrar, esse zero virava uma "segunda linha" que nao existe na tela. */
  const linhasAcoes = await p.$$eval('.acoes-tela button',
    els => [...new Set(els.filter(e => e.getClientRects().length)
      .map(e => Math.round(e.getBoundingClientRect().top)))].length);
  ok('os botoes de acao cabem numa linha so', linhasAcoes === 1, linhasAcoes + ' linha(s)');
  /* com dois botoes a menos a barra sobra folga na direita de proposito: o
     que nao pode e ela QUEBRAR em duas linhas, que era o que comia altura */
  const alturaLinha = await p.$eval('.acoes-tela button', e => Math.round(e.getBoundingClientRect().height));
  ok('e os botoes ficaram em tamanho de sistema', alturaLinha <= 32, alturaLinha + 'px de altura');

  console.log('\n=== HP-12C ===');
  await p.click('#btn-calc');
  await p.waitForSelector('#hp12c.aberta');
  ok('nao existe mais a calculadora normal', (await p.$$('#cm-norm')).length === 0);
  ok('o botao se chama HP-12C', /hp\s*12C/i.test(await p.$eval('#btn-calc', txt)), await p.$eval('#btn-calc', txt));

  // teclado de verdade: 4 fileiras por 10 colunas, com o ENTER de duas fileiras
  const grade = await p.$$eval('#hp12c .hp-tecla', els => els.map(e => getComputedStyle(e).gridArea));
  ok('o teclado tem as 39 teclas da maquina', grade.length === 39, String(grade.length));
  const cols = await p.$eval('#hp12c .hp-teclado', e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
  ok('em dez colunas', cols === 10, String(cols));
  const enter = await p.$eval('#hp12c .hp-tecla.alto', e => getComputedStyle(e).gridArea);
  ok('o ENTER ocupa duas fileiras', /span 2|4 \/ 6 \/ 6/.test(enter), enter);
  const legendas = await p.$$eval('#hp12c .hp-tecla', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  for (const t of ['n12x', 'i12÷', 'CHSDATE', 'CLxx=0', 'ENTERLST x', 'Σ+Σ-'])
    ok('a tecla "' + t + '" esta no teclado', legendas.includes(t), legendas.slice(0, 3).join(' | '));

  /* na maquina de verdade a legenda laranja do f fica IMPRESSA NO CORPO, acima
     da tecla, e nao dentro dela · e tres arcos amarram grupos de teclas */
  const laranja = await p.$$eval('#hp12c .hp-lf', els => els.map(e => e.textContent.trim()));
  ok('as legendas laranja do f estao acima das teclas, e todas as 16 estao la',
    laranja.join(',') === 'AMORT,INT,NPV,RND,IRR,PRICE,YTM,SL,SOYD,DB,P/R,Σ,PRGM,FIN,REG,PREFIX', laranja.join(','));
  const arcos = await p.$$eval('#hp12c .hp-cinta', els => els.map(e => e.textContent.trim()));
  ok('os arcos BOND, DEPRECIATION e CLEAR estao no lugar',
    arcos.join(',') === 'BOND,DEPRECIATION,CLEAR', arcos.join(','));
  const cores = await p.evaluate(() => {
    const t = [...document.querySelectorAll('#hp12c .hp-tecla')];
    const cor = el => getComputedStyle(el).backgroundImage;
    const pretas = t.filter(e => !e.classList.contains('pf') && !e.classList.contains('pg'));
    return [new Set(pretas.map(cor)).size, cor(t.find(e => e.classList.contains('pf'))) !== cor(pretas[0])];
  });
  ok('todas as teclas sao pretas, menos o f e o g', cores[0] === 1 && cores[1], cores.join(' · '));
  ok('a placa de cima traz o selo hp 12C', (await p.$eval('#hp12c .hp-selo', txt)) === 'hp12C', await p.$eval('#hp12c .hp-selo', txt));
  ok('e o pe da maquina diz HEWLETT-PACKARD',
    (await p.$eval('#hp12c .hp-marca', txt)).replace(/\s/g, '') === 'HEWLETT·PACKARD', await p.$eval('#hp12c .hp-marca', txt));

  const visor = () => p.$eval('#hp12c .hp-x', txt);
  const tecla = t => p.click(`#hp12c .hp-tecla .tx:text-is("${t}")`);
  // RPN: 3 ENTER 4 +
  await tecla('3');
  await tecla('ENTER');
  await tecla('4');
  await tecla('+');
  ok('RPN: 3 ENTER 4 + = 7', (await visor()) === '7,00', await visor());

  // o visor mostra os avisos da maquina
  await p.click('#hp12c .hp-tecla.pg');
  ok('apertar g acende o aviso g no visor', (await p.$$eval('#hp12c .hp-flags i.on', els => els.map(e => e.textContent))).includes('g'));
  await tecla('7');
  ok('g 7 liga o BEGIN', (await p.$$eval('#hp12c .hp-flags i.on', els => els.map(e => e.textContent))).includes('BEGIN'));
  await p.click('#hp12c .hp-tecla.pg');
  await tecla('8');
  ok('e g 8 volta para END', !(await p.$$eval('#hp12c .hp-flags i.on', els => els.map(e => e.textContent))).includes('BEGIN'));

  // tecla que a maquina tem e esta nao faz
  await tecla('EEX');
  ok('tecla nao implementada avisa em vez de inventar numero',
    /não existe nesta HP/i.test(await p.$eval('#hp12c .hp-eco', txt)), await p.$eval('#hp12c .hp-eco', txt));

  // TVM: 100.000 em 24x a 1,5% ao mes -> PMT de -4.992,41
  const pmt = await p.evaluate(() => { hpLimparTudo(); hp.n = 24; hp.i = 1.5; hp.pv = 100000; hp.fv = 0; return tvmResolver('pmt'); });
  ok('PMT de 100.000 em 24x a 1,5% ao mes', Math.abs(pmt + 4992.41) < 0.01, pmt.toFixed(2));
  const iCalc = await p.evaluate(() => { hpLimparTudo(); hp.n = 24; hp.pv = 100000; hp.pmt = -4992.41; hp.fv = 0; return tvmResolver('i'); });
  ok('e a taxa volta a ser 1,5% ao mes', Math.abs(iCalc - 1.5) < 0.001, iCalc.toFixed(6));
  const nCalc = await p.evaluate(() => { hpLimparTudo(); hp.i = 1.5; hp.pv = 100000; hp.pmt = -4992.41; hp.fv = 0; return tvmResolver('n'); });
  ok('e o prazo volta a ser 24 meses', Math.abs(nCalc - 24) < 0.01, nCalc.toFixed(4));
  const fvCalc = await p.evaluate(() => { hpLimparTudo(); hp.n = 12; hp.i = 1; hp.pv = -1000; hp.pmt = 0; return tvmResolver('fv'); });
  ok('1.000 a 1% por 12 meses vira 1.126,83', Math.abs(fvCalc - 1126.825) < 0.01, fvCalc.toFixed(2));
  const guardou = await p.evaluate(() => { hpLimparTudo(); hp.digitando = true; hp.ent = '36'; hpFin('n'); return hp.n; });
  ok('digitou e apertou n: guardou', guardou === 36, String(guardou));
  const begEnd = await p.evaluate(() => {
    hpLimparTudo(); hp.n = 24; hp.i = 1.5; hp.pv = 100000;
    const fim = tvmResolver('pmt'); hp.begin = true;
    return [fim, tvmResolver('pmt')];
  });
  ok('BEGIN deixa a prestacao menor que END', Math.abs(begEnd[1]) < Math.abs(begEnd[0]), begEnd.map(v => v.toFixed(2)).join(' -> '));
  const est = await p.evaluate(() => {
    hpLimparTudo();
    for (const v of [10, 20, 60]) { hp.x = v; hp.digitando = false; hpSoma(1); }
    hpMedia();
    const media = hp.x;
    hpDesvio();
    return [media, hp.x];
  });
  ok('Σ+ e x̄ dao a media de 10, 20 e 60', Math.abs(est[0] - 30) < 0.001, est[0].toFixed(4));
  ok('e s da o desvio da amostra', Math.abs(est[1] - 26.4575) < 0.001, est[1].toFixed(4));

  console.log('\n=== A HP SE ARRASTA, E O ICONE TAMBEM ===');
  const arrastar = async (sel, dx, dy) => {
    const c = await p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x + Math.min(30, r.width / 2), y: r.y + r.height / 2 }; });
    await p.mouse.move(c.x, c.y);
    await p.mouse.down();
    for (let k = 1; k <= 6; k++) { await p.mouse.move(c.x + dx * k / 6, c.y + dy * k / 6); await p.waitForTimeout(12); }
    await p.mouse.up();
    await p.waitForTimeout(180);
  };
  const lugar = sel => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)]; });

  const janAntes = await lugar('#hp12c');
  await arrastar('#hp12c .hp-placa', -260, 130);
  const janDepois = await lugar('#hp12c');
  ok('a janela anda junto com o mouse', Math.abs((janDepois[0] - janAntes[0]) + 260) <= 3 && Math.abs((janDepois[1] - janAntes[1]) - 130) <= 3,
    janAntes.join(',') + ' -> ' + janDepois.join(','));
  await p.reload();
  await p.waitForTimeout(500);
  await p.click('#btn-calc');
  await p.waitForSelector('#hp12c.aberta');
  ok('e ela reabre onde foi largada', (await lugar('#hp12c')).join(',') === janDepois.join(','), (await lugar('#hp12c')).join(','));
  await p.click('#hp12c .hp-fechar');

  const botAntes = await lugar('#btn-calc');
  await arrastar('#btn-calc', -300, -240);
  const botDepois = await lugar('#btn-calc');
  ok('o proprio icone se arrasta', Math.abs((botDepois[0] - botAntes[0]) + 300) <= 3 && Math.abs((botDepois[1] - botAntes[1]) + 240) <= 3,
    botAntes.join(',') + ' -> ' + botDepois.join(','));
  ok('e arrastar o icone nao abre a calculadora', (await p.$$('#hp12c.aberta')).length === 0);
  await p.click('#btn-calc');
  await p.waitForTimeout(250);
  ok('mas um clique limpo nele continua abrindo', (await p.$$('#hp12c.aberta')).length === 1);
  await tecla('ON');
  ok('a tecla ON desliga a maquina', (await p.$$('#hp12c.aberta')).length === 0);

  console.log('\n=== VÁRIOS MESES NA TELA E TRIMESTRE ===');
  // cria maio, junho, agosto e setembro a partir de julho
  await p.evaluate(() => {
    for (const mk of ['2026-05', '2026-06', '2026-08', '2026-09']) {
      DB.meses[mk] = {
        rotulo: rotuloMes(mk), saldoInicial: 1000, saldoFinalBancario: 0, simulado: false,
        lancamentos: DB.meses['2026-07'].lancamentos.slice(0, 20).map(l => ({ ...l, id: novoId(), data: mk + l.data.slice(7) })),
      };
    }
    verMeses({ modo: 'tudo' });
  });
  await p.waitForSelector('#comp-corpo table');
  /* De fábrica a tela é limpa: uma coluna por mês, sem faixa e sem total de
     trimestre. É o desenho que o Marco pediu depois de ver os dois. */
  ok('de fabrica nao ha faixa de trimestre', (await p.$$('#comp-corpo thead tr.faixa-tri')).length === 0);
  const soMeses = await p.$$eval('#comp-corpo thead th', els => els.map(e => e.textContent.trim()));
  ok('cinco meses, so eles, mais Dif. e Var.',
    soMeses.join('|') === '|mai/26|jun/26|jul/26|ago/26|set/26|Dif. R$|Var. %', soMeses.join('|'));

  /* ligado pelo botao direito, o trimestre volta inteiro */
  await p.evaluate(() => alternarTotalTri());
  await p.waitForTimeout(200);
  const cabTri = await p.$$eval('#comp-corpo thead tr.faixa-tri th.tri', els => els.map(e => e.textContent.trim()));
  ok('ligado, a faixa de trimestre agrupa os meses', cabTri.length === 2 && /T2/.test(cabTri[0]) && /T3/.test(cabTri[1]), cabTri.join(' | '));
  const cabMes = await p.$$eval('#comp-corpo thead tr:nth-child(2) th', els => els.map(e => e.textContent.trim()));
  ok('e entram os dois totais de trimestre', cabMes.length === 7, cabMes.join(' | '));
  /* T3 tem os três meses na tela e é "Total T3". T2 só tem maio e junho, então
     ele NÃO pode se chamar total do trimestre: aparece como "T2 parcial". */
  ok('trimestre completo vira Total, trimestre pela metade vira parcial',
    cabMes.includes('Total T3') && cabMes.includes('T2 parcial'), cabMes.join(' | '));
  const nCel = await p.$$eval('#comp-corpo tbody tr.linha-nat td', els => els.length);
  const nLinhas = await p.$$eval('#comp-corpo tbody tr.linha-nat', els => els.length);
  ok('a linha da conta tem uma célula por coluna', nCel === nLinhas * 10, nCel + ' em ' + nLinhas + ' linhas');
  await p.evaluate(() => alternarTotalTri());

  const par = await p.evaluate(() => [compA, compB, parFixado]);
  ok('a diferença é entre os dois últimos meses', par[0] === '2026-08' && par[1] === '2026-09', par.join(','));
  const marcadas = await p.$$eval('#comp-corpo thead th.par', els => els.map(e => e.textContent.trim()));
  ok('as colunas do par ficam marcadas', marcadas.length === 2, marcadas.join(' | '));

  // total do trimestre = soma dos meses dele (com o agrupamento ligado)
  const bateTri = await p.evaluate(() => {
    if (!totalTriLigado()) alternarTotalTri();
    const l = linhasComparativo().find(x => x.natureza === 'Premio recebido');
    const t3 = ['2026-07', '2026-08', '2026-09'].reduce((s, mk) => s + (l.vals[mk] || 0), 0);
    const { cols } = colunasDaTela();
    const col = cols.find(c => c.tipo === 'tot' && c.tri === '2026-T3');
    const par = [t3, valorCol(col, l.vals)];
    alternarTotalTri();
    return par;
  });
  ok('o total do trimestre é a soma dos meses dele', Math.abs(bateTri[0] - bateTri[1]) < 0.005, bateTri.join(' vs '));

  // trocar o par na mão
  await p.evaluate(() => fixarPar('2026-05', '2026-07'));
  const par2 = await p.evaluate(() => [compA, compB, parFixado]);
  ok('dá para escolher outro par na mão', par2[0] === '2026-05' && par2[1] === '2026-07' && par2[2] === true, par2.join(','));
  await p.click('#btn-solta-par');
  const par3 = await p.evaluate(() => [compA, compB, parFixado]);
  ok('e voltar para os dois últimos', par3[0] === '2026-08' && par3[1] === '2026-09' && par3[2] === false, par3.join(','));

  // recorte de meses
  await p.evaluate(() => verMeses({ modo: 'ultimos', n: 3 }));
  ok('o recorte "últimos 3" mostra 3 meses', (await p.evaluate(() => mesesNaTela().length)) === 3);
  await p.evaluate(() => alternarTotalTri());
  const comTot = await p.$$eval('#comp-corpo thead th', els => els.map(e => e.textContent.trim()));
  ok('e "últimos 3" com o trimestre ligado fecha o Total T3', comTot.some(t => /Total T3/.test(t)), comTot.join(' | '));
  await p.evaluate(() => alternarTotalTri());
  ok('desligado de novo, some a faixa e o total',
    (await p.$$('#comp-corpo thead tr.faixa-tri')).length === 0 &&
    !(await p.$$eval('#comp-corpo thead th', els => els.some(e => /Total T/.test(e.textContent)))));

  // drill-down com muitos meses
  await p.evaluate(() => verMeses({ modo: 'tudo' }));
  await p.evaluate(() => { abertasComp.add('Comissão Corretoras'); render(); });
  await p.click('#comp-corpo tr.cp >> nth=0');
  await p.waitForSelector('tr.lanc');
  const nCelLanc = await p.$eval('tr.lanc', e => e.children.length);
  ok('o lançamento também abre em todas as colunas', nCelLanc === 8, String(nCelLanc));
  const ids = await p.$eval('tr.lanc', e => e.dataset.ids || '');
  ok('a linha sabe qual lançamento é em cada mês', /2026-\d\d\|/.test(ids), ids.slice(0, 60));

  console.log('\n=== DESFAZER (Ctrl+Z) E REFAZER (Ctrl+Y) ===');
  p.on('dialog', d => d.accept());
  await p.evaluate(() => { verMeses({ modo: 'tudo' }); recolherTudo(); });
  await p.waitForTimeout(200);
  const qtdJul = () => p.evaluate(() => DB.meses['2026-07'].lancamentos.length);

  ok('sem mexer em nada, nao ha botao de desfazer',
    !(await p.$eval('#btn-desfazer', e => e.offsetParent !== null)));

  const idL = await p.evaluate(() => DB.meses['2026-07'].lancamentos[0].id);
  await p.evaluate(id => { mesAtual = '2026-07'; duplicarLancamento(id, '2026-07'); }, idL);
  await p.waitForTimeout(200);
  ok('duplicar levou julho a 94', (await qtdJul()) === 94, String(await qtdJul()));
  ok('o botao Desfazer apareceu', await p.$eval('#btn-desfazer', e => e.offsetParent !== null));
  ok('e ele diz o que vai desfazer',
    /Lançamento duplicado/.test(await p.$eval('#btn-desfazer', e => e.title)), await p.$eval('#btn-desfazer', e => e.title));

  await p.keyboard.press('Control+z');
  await p.waitForTimeout(250);
  ok('Ctrl+Z desfez a duplicacao', (await qtdJul()) === 93, String(await qtdJul()));
  ok('e apareceu o Refazer', await p.$eval('#btn-refazer', e => e.offsetParent !== null));
  await p.keyboard.press('Control+y');
  await p.waitForTimeout(250);
  ok('Ctrl+Y refez', (await qtdJul()) === 94, String(await qtdJul()));
  await p.click('#btn-desfazer');
  await p.waitForTimeout(250);
  ok('e o botao desfaz igual ao atalho', (await qtdJul()) === 93, String(await qtdJul()));

  /* desfazer nao apaga a trilha: escreve mais uma linha nela */
  const acoes = await p.evaluate(() => AUDITORIA.map(r => r.acao));
  ok('a trilha guarda a acao E o desfazer dela',
    acoes.includes('Lançamento duplicado') && acoes.some(a => /^Desfez: Lançamento duplicado/.test(a)),
    acoes.slice(-4).join(' | '));

  /* dentro de um campo de texto o Ctrl+Z e do navegador, nao do sistema */
  await p.evaluate(() => { mesAtual = '2026-07'; abrirLancamento(); });
  await p.waitForSelector('#f-cp');
  await p.fill('#f-cp', 'TESTE CTRL Z');
  await p.focus('#f-cp');
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(200);
  ok('Ctrl+Z dentro de um campo nao mexe nos lancamentos', (await qtdJul()) === 93, String(await qtdJul()));
  await p.click('.modal-rodape .btn-clear');
  await p.waitForTimeout(200);

  /* o caso que importa de verdade: zerar tudo sem querer, e voltar */
  const mesesAntes = await p.evaluate(() => mesesOrdenados().length);
  await p.evaluate(() => restaurar());
  await p.waitForTimeout(300);
  ok('zerar deixou so a Matriz', (await p.evaluate(() => mesesOrdenados().length)) === 1);
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  ok('e Ctrl+Z trouxe os meses de volta',
    (await p.evaluate(() => mesesOrdenados().length)) === mesesAntes,
    (await p.evaluate(() => mesesOrdenados().join(','))));

  console.log('\n=== O BACKUP VOLTA (ele nao voltava) ===');
  await p.evaluate(() => { novaSimulacao(); });
  await p.waitForTimeout(250);
  const retrato = await p.evaluate(() => ({ meses: mesesOrdenados().length, cenarios: RAIZ.cenarios.length }));
  ok('preparado: meses e uma simulacao', retrato.cenarios === 1, JSON.stringify(retrato));
  await p.evaluate(() => abrirAba('principal'));

  const [arquivo] = await Promise.all([
    p.waitForEvent('download'),
    p.click('footer button:has-text("Salvar cópia dos dados")'),
  ]);
  const caminho = await arquivo.path();
  ok('a copia de seguranca saiu em arquivo', !!caminho, arquivo.suggestedFilename());

  await p.evaluate(() => restaurar());
  await p.waitForTimeout(300);
  ok('zerado antes de restaurar', (await p.evaluate(() => mesesOrdenados().length)) === 1);

  const [escolha] = await Promise.all([
    p.waitForEvent('filechooser'),
    p.click('footer button:has-text("Restaurar de um arquivo")'),
  ]);
  await escolha.setFiles(caminho);
  await p.waitForTimeout(600);
  const voltou = await p.evaluate(() => ({ meses: mesesOrdenados().length, cenarios: RAIZ.cenarios.length }));
  ok('o sistema restaura o proprio backup', voltou.meses === retrato.meses, JSON.stringify(voltou));
  ok('e as simulacoes voltam junto', voltou.cenarios === retrato.cenarios, JSON.stringify(voltou));
  ok('a restauracao ficou na trilha',
    (await p.evaluate(() => AUDITORIA.map(r => r.acao))).includes('Backup restaurado de arquivo'));

  console.log('\n=== DIGITAR NA CÉLULA VAZIA (jeito Excel) ===');
  /* Os lançamentos se repetem quase iguais todo mês. O mês que ainda não teve
     aquele lançamento mostra uma travinha, e dois cliques nela lançam ali. */
  await p.evaluate(() => {
    /* precisa de dois meses na tela: casa vazia só existe quando um mês teve o
       lançamento e o outro não */
    DB.meses['2026-08'] = {
      rotulo: rotuloMes('2026-08'), saldoInicial: 0, saldoFinalBancario: 0, simulado: false,
      lancamentos: DB.meses['2026-07'].lancamentos
        .filter(l => l.natureza === 'Fornecedores').slice(0, 3)
        .map(l => ({ ...l, id: novoId(), data: '2026-08' + l.data.slice(7) })),
    };
    /* um lançamento que existe só em julho: a linha dele fica com a casa vazia
       em agosto, que é o caso que o Marco pediu */
    DB.meses['2026-07'].lancamentos.push({
      id: novoId(), data: '2026-07-10', natureza: 'Fornecedores',
      contraparte: 'PAPELARIA DO CENTRO', descritivo: 'Material de escritório',
      valor: -1250, obs: '',
    });
    gravar();
    verMeses({ modo: 'tudo' });
    abertasComp.add('Fornecedores');
    render();
  });
  await p.click('#comp-corpo tr.cp:has-text("PAPELARIA DO CENTRO")');
  await p.waitForSelector('tr.lanc td.vazia');
  const vazias = await p.$$eval('tr.lanc:has(td[data-desc="Material de escritório"]) td.vazia',
    els => els.map(e => e.dataset.mk));
  ok('a linha tem casa vazia nos meses que nao tiveram o lancamento',
    vazias.length >= 1 && !vazias.includes('2026-07'), vazias.join(','));

  const alvoMk = vazias[0];
  const antesAlvo = await p.evaluate(mk => DB.meses[mk].lancamentos.length, alvoMk);
  await p.dblclick(`tr.lanc td.vazia[data-mk="${alvoMk}"][data-desc="Material de escritório"]`);
  await p.waitForSelector('tr.lanc td.vazia input.edit-campo');
  ok('a casa vazia abre em branco, esperando o valor',
    (await p.inputValue('tr.lanc td.vazia input.edit-campo')) === '');
  await p.type('tr.lanc td.vazia input.edit-campo', '99000');
  ok('e ela usa a mascara de dinheiro',
    (await p.inputValue('tr.lanc td.vazia input.edit-campo')) === 'R$ 990,00',
    await p.inputValue('tr.lanc td.vazia input.edit-campo'));
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);

  const nasceu = await p.evaluate(mk => {
    const l = DB.meses[mk].lancamentos.find(x => x.contraparte === 'PAPELARIA DO CENTRO');
    return l ? { data: l.data, valor: l.valor, nat: l.natureza, desc: l.descritivo, n: DB.meses[mk].lancamentos.length } : null;
  }, alvoMk);
  ok('o lancamento nasceu no mes da casa', !!nasceu && nasceu.n === antesAlvo + 1, JSON.stringify(nasceu));
  ok('com a natureza, a contraparte e o descritivo da linha',
    nasceu.nat === 'Fornecedores' && nasceu.desc === 'Material de escritório', JSON.stringify(nasceu));
  ok('no mesmo dia do mes', nasceu.data.slice(8) === '10', nasceu.data);
  ok('e com o SINAL da linha: saida continua saida', nasceu.valor === -990, String(nasceu.valor));
  const audNova = await p.evaluate(() => AUDITORIA[AUDITORIA.length - 1]);
  ok('e entrou na trilha como inclusao', audNova.acao === 'Lançamento digitado na linha', audNova.acao);
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(250);
  ok('Ctrl+Z desfaz o que foi digitado na casa',
    (await p.evaluate(mk => DB.meses[mk].lancamentos.length, alvoMk)) === antesAlvo);
  await p.evaluate(() => recolherTudo());

  console.log('\n=== ZERAR E VOLTAR À MATRIZ ===');
  await p.evaluate(() => restaurar());
  const depois = await p.evaluate(() => ({ meses: mesesOrdenados(), n: DB.meses['2026-07'].lancamentos.length }));
  ok('zerar deixa só julho da Matriz', depois.meses.length === 1 && depois.meses[0] === '2026-07', depois.meses.join(','));
  ok('e os 93 lançamentos voltam', depois.n === 93, String(depois.n));
  const audZ = await p.evaluate(() => AUDITORIA[AUDITORIA.length - 1]);
  ok('o zerar ficou registrado na trilha', /zerado/i.test(audZ.acao), audZ.acao);
  const audTudo = await p.evaluate(() => AUDITORIA.map(r => r.acao));
  ok('a trilha sobreviveu ao zerar', audTudo.some(a => /Primeira abertura/.test(a)) && audTudo.some(a => /Valor corrigido/.test(a)),
    audTudo.join(' | '));

  console.log('\n=== ERROS DE PÁGINA ===');
  ok('nenhum erro de JavaScript', erros.length === 0, erros.slice(0, 4).join(' | '));

  await b.close();
  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo certo'));
  process.exit(falhas ? 1 : 0);
})();
