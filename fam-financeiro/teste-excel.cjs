// Testa o "jeito Excel" na tela de Acompanhamento mensal: menu do botão direito
// nos três níveis (conta, contraparte, lançamento), sempre dizendo em que mês mexe.
// Uso: node fam-financeiro/teste-excel.cjs fam-financeiro/dashboard.html [pasta-das-imagens]
const path = require('node:path');
const { chromium } = require('playwright');

const ARQ = 'file:///' + path.resolve(process.argv[2]).replace(/\\/g, '/');
const OUT = path.resolve(process.argv[3] || '.');
let falhas = 0;
const ok = (t, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + ' · ' + t + (extra ? '  → ' + extra : '')); if (!c) falhas++; };

const MENU = '#ctx-menu';
const itens = p => p.$$eval('#ctx-menu .ctx-item', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
const clicar = (p, texto) => p.click(`#ctx-menu .ctx-item:has-text("${texto}")`);

(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  const erros = [];
  p.on('pageerror', e => erros.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto(ARQ);
  await p.waitForTimeout(400);

  /* A carga de fábrica passou a ser só a planilha Matriz: julho/2026 e mais
     nada. Estas duas suítes foram escritas sobre duas colunas, julho e agosto,
     e continuam valendo para o par comparado · o agosto delas nasce aqui, pelo
     mesmo gerador de cenário base de sempre, e a tela fica presa em dois meses
     para o que elas conferem continuar sendo o que elas conferem. */
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    gerarAgostoPadrao(); gravar();
    verMeses({ modo: 'ultimos', n: 2 });
    if (totalTriLigado()) alternarTotalTri();   // aqui a conferência é do desenho de duas colunas
  });
  await p.waitForTimeout(250);

  const qtd = mk => p.evaluate(m => DB.meses[m].lancamentos.length, mk);
  const lancs = mk => p.evaluate(m => DB.meses[m].lancamentos.map(l => ({ id: l.id, cp: l.contraparte, data: l.data })), mk);

  // ═══ 1 · fora dos alvos, o menu do navegador continua valendo ═══
  await p.click('footer', { button: 'right' }).catch(() => {});
  await p.waitForTimeout(150);
  ok('botão direito fora da tabela não abre menu do sistema', (await p.$(MENU)) === null);

  // ═══ 2 · nível 1 · a conta, com os dois meses à mostra ═══
  await p.click('#comp-corpo tr.linha-nat:has-text("Comissão Corretoras")', { button: 'right' });
  await p.waitForTimeout(200);
  const mConta = await itens(p);
  ok('menu da conta abriu', (await p.$(MENU)) !== null);
  ok('a conta oferece inserir nos dois meses',
    mConta.filter(t => /Novo lançamento em/.test(t)).length === 2, mConta.filter(t => /Novo/.test(t)).join(' | '));
  ok('a conta oferece excluir mês a mês, nunca os dois de uma vez',
    mConta.some(t => /Excluir os \d+ de Julho\/2026/.test(t)) && mConta.some(t => /Excluir os \d+ de Agosto\/2026/.test(t)),
    mConta.filter(t => /Excluir/.test(t)).join(' | '));
  ok('a linha do menu fica marcada, como a seleção do Excel', (await p.$$('#comp-corpo tr.alvo-ctx')).length === 1);
  await clicar(p, 'Abrir as contrapartes');
  await p.waitForTimeout(250);
  ok('menu fecha depois de agir', (await p.$(MENU)) === null);
  ok('a conta abriu pelo próprio menu', (await p.$$('#comp-corpo tr.cp')).length === 3);

  // ═══ 3 · nível 2 · a contraparte ═══
  await p.click('#comp-corpo tr.cp:has-text("VERAZ")', { button: 'right' });
  await p.waitForTimeout(200);
  const mCP = await itens(p);
  ok('menu da contraparte abriu com o nome dela no título',
    /VERAZ/i.test(await p.$eval('#ctx-menu .ct', e => e.textContent)), await p.$eval('#ctx-menu .ct', e => e.textContent));
  ok('a contraparte abre os lançamentos e deixa copiar',
    mCP.some(t => /Abrir os lançamentos/.test(t)) && mCP.some(t => /Copiar os lançamentos desta contraparte/.test(t)),
    mCP.join(' | ').slice(0, 110));
  await clicar(p, 'Abrir os lançamentos');
  await p.waitForTimeout(250);
  ok('nível 3 abriu pelo menu, com os dois meses em colunas',
    (await p.$$('#comp-corpo tr.lanc')).length === 3 &&
    (await p.$$('#comp-corpo tr.lanc td[data-ctx="lanc"]')).length === 6);

  // ═══ 4 · o menu age no mês da CÉLULA em que o clique caiu ═══
  await p.click('#comp-corpo tr.lanc td[data-mk="2026-07"]', { button: 'right' });
  await p.waitForTimeout(200);
  const mLanc = await itens(p);
  ok('menu do lançamento tem os verbos do Excel',
    ['Corrigir o valor aqui na linha','Editar o lançamento inteiro','Inserir lançamento acima',
     'Inserir lançamento abaixo','Duplicar lançamento','Copiar a linha','Excluir lançamento']
      .every(v => mLanc.some(t => t.includes(v))), mLanc.join(' | ').slice(0, 130));
  ok('o título do menu diz de que mês é a célula', /jul\/26/.test(await p.$eval('#ctx-menu .ct', e => e.textContent)));
  ok('a linha inteira fica marcada, mesmo clicando numa célula', (await p.$$('#comp-corpo tr.lanc.alvo-ctx')).length === 1);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  // clicando na coluna de agosto, o mesmo menu passa a falar de agosto
  await p.click('#comp-corpo tr.lanc td[data-mk="2026-08"]', { button: 'right' });
  await p.waitForTimeout(200);
  ok('a coluna de agosto abre o menu de agosto', /ago\/26/.test(await p.$eval('#ctx-menu .ct', e => e.textContent)));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  ok('Esc fecha o menu', (await p.$(MENU)) === null);
  ok('Esc não mexeu em nada', (await qtd('2026-07')) === 93 && (await qtd('2026-08')) === 89);

  // ═══ 5 · inserir abaixo entra na posição certa, no mês da célula ═══
  const antes7 = await lancs('2026-07');
  const celJul = '#comp-corpo tr.lanc >> nth=1 >> css=td[data-mk="2026-07"]';
  const alvo = await p.$eval(celJul, e => e.dataset.id);
  ok('a célula da esquerda é a de julho', (await p.$eval(celJul, e => e.dataset.mk)) === '2026-07');
  const i = antes7.findIndex(l => l.id === alvo);
  await p.click(celJul, { button: 'right' });
  await p.waitForTimeout(200);
  await clicar(p, 'Inserir lançamento abaixo');
  await p.waitForTimeout(300);
  ok('o modal abre no mês da linha, não no mês da barra', /Julho\/2026/.test(await p.$eval('.modal-title', e => e.textContent)));
  ok('já vem com a conta da linha', (await p.inputValue('#f-nat')) === 'Comissão Corretoras', await p.inputValue('#f-nat'));
  ok('já vem com a data da linha', (await p.inputValue('#f-data')) === antes7[i].data, await p.inputValue('#f-data'));
  await p.fill('#f-cp', 'INSERIDO ABAIXO');
  await p.fill('#f-valor', '10,00');
  await p.click('button:has-text("Incluir lançamento")');
  await p.waitForTimeout(350);
  const dep7 = await lancs('2026-07');
  ok('inserir abaixo: julho vai a 94', dep7.length === 94, String(dep7.length));
  ok('agosto continua intocado', (await qtd('2026-08')) === 89, String(await qtd('2026-08')));
  ok('o novo entrou logo abaixo da linha clicada',
    dep7[i].id === alvo && dep7[i + 1].cp === 'INSERIDO ABAIXO', dep7[i].cp + ' → ' + dep7[i + 1].cp);

  // ═══ 6 · inserir acima ═══
  await p.click('#comp-corpo tr.cp:has-text("INSERIDO ABAIXO")');
  await p.waitForTimeout(250);
  const idNovo = await p.$eval('#comp-corpo tr.lanc td[data-mk="2026-07"]', e => e.dataset.id);
  const iNovo = (await lancs('2026-07')).findIndex(l => l.id === idNovo);
  await p.click('#comp-corpo tr.lanc td[data-mk="2026-07"]', { button: 'right' });
  await p.waitForTimeout(200);
  await clicar(p, 'Inserir lançamento acima');
  await p.waitForTimeout(300);
  await p.fill('#f-cp', 'INSERIDO ABAIXO');
  await p.fill('#f-valor', '20,00');
  await p.click('button:has-text("Incluir lançamento")');
  await p.waitForTimeout(350);
  const dep7b = await lancs('2026-07');
  ok('inserir acima entrou antes da linha clicada',
    dep7b[iNovo].cp === 'INSERIDO ABAIXO' && dep7b[iNovo + 1].id === idNovo, dep7b[iNovo].cp + ' → ' + dep7b[iNovo + 1].cp);

  // ═══ 7 · duplicar ═══
  await p.click('#comp-corpo tr.cp:has-text("INSERIDO ABAIXO")');
  await p.waitForTimeout(250);
  await p.click('#comp-corpo tr.lanc td[data-mk="2026-07"]', { button: 'right' });
  await p.waitForTimeout(200);
  await clicar(p, 'Duplicar lançamento');
  await p.waitForTimeout(350);
  ok('duplicar cria uma cópia em julho', (await qtd('2026-07')) === 96, String(await qtd('2026-07')));
  ok('duplicar avisa em que mês foi', /Julho\/2026/.test(await p.textContent('.aviso-flutua')), await p.textContent('.aviso-flutua'));

  // ═══ 8 · excluir o lançamento pelo menu ═══
  await p.click('#comp-corpo tr.cp:has-text("INSERIDO ABAIXO")');
  await p.waitForTimeout(250);
  await p.click('#comp-corpo tr.lanc td[data-mk="2026-07"]', { button: 'right' });
  await p.waitForTimeout(200);
  await clicar(p, 'Excluir lançamento');
  await p.waitForTimeout(400);
  ok('excluir pelo menu tira uma linha de julho', (await qtd('2026-07')) === 95, String(await qtd('2026-07')));

  // ═══ 9 · excluir a conta inteira num mês só ═══
  await p.click('#comp-corpo tr.linha-nat:has-text("Tarifa bancária")', { button: 'right' });
  await p.waitForTimeout(250);
  const mTarifa = await itens(p);
  ok('o menu conta quantos há em cada mês',
    mTarifa.some(t => /Excluir os 18 de Julho\/2026/.test(t)), mTarifa.filter(t => /Excluir/.test(t)).join(' | '));
  await clicar(p, 'Excluir os 18 de Julho/2026');
  await p.waitForTimeout(400);
  ok('tirou os 18 de julho', (await qtd('2026-07')) === 77, String(await qtd('2026-07')));
  const sobrouAgo = await p.evaluate(() => DB.meses['2026-08'].lancamentos.filter(l => l.natureza === 'Tarifa bancária').length);
  ok('e não encostou nos de agosto', sobrouAgo === 18, String(sobrouAgo));
  ok('a conta continua na tabela, agora como "zerou" de um lado',
    /zerou|novo/.test(await p.$eval('#comp-corpo tr:has-text("Tarifa bancária")', e => e.textContent)));

  // ═══ 10 · o formato do copiar ═══
  const tsv = await p.evaluate(() => {
    const l = DB.meses['2026-07'].lancamentos.find(x => x.natureza === 'Fornecedores');
    return linhaExcel(l, '2026-07');
  });
  ok('a linha copiada sai com 6 colunas separadas por tabulação', tsv.split('\t').length === 6, tsv.slice(0, 80));
  ok('a primeira coluna é o mês', tsv.split('\t')[0] === 'Julho/2026', tsv.split('\t')[0]);
  ok('o valor vai no formato brasileiro, do jeito que o Excel lê',
    /^-?\d{1,3}(\.\d{3})*,\d{2}$/.test(tsv.split('\t')[5]), tsv.split('\t')[5]);

  // ═══ 11 · menu do espaço da tela ═══
  await p.click('#comp-corpo .comp-quadro .cc-rodape, #comp-corpo tr.subtotal', { button: 'right' }).catch(async () => {
    await p.click('#comp-corpo tr.subtotal:has-text("TOTAL ENTRADAS")', { button: 'right' });
  });
  await p.waitForTimeout(250);
  const mTela = await itens(p);
  ok('o menu da tela traz copiar a tabela e o PDF',
    mTela.some(t => /Copiar a tabela/.test(t)) && mTela.some(t => /Gerar PDF da tela/.test(t)), mTela.join(' | ').slice(0, 120));
  ok('e traz inverter os períodos', mTela.some(t => /Inverter os períodos/.test(t)));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);

  await p.screenshot({ path: path.join(OUT, 'tela-menu-direito.png'), fullPage: false });

  // ═══ 12 · corrigir a linha ali mesmo, com o percentual se refazendo sozinho ═══
  await p.reload();
  await p.waitForTimeout(450);
  await p.click('#comp-corpo tr.linha-nat:has-text("Premio recebido")');
  await p.waitForTimeout(250);
  await p.click('#comp-corpo tr.cp:has-text("MASKAN")');
  await p.waitForTimeout(300);
  const linhaMaskan = '#comp-corpo tr.lanc';
  const varAntes = await p.$eval(linhaMaskan + ' .badge.var', e => e.textContent.trim());
  const idJul = await p.$eval(linhaMaskan + ' td[data-mk="2026-07"]', e => e.dataset.id);
  ok('a variação de MASKAN começa em 15%', varAntes === '▲ 15,0%', varAntes);

  await p.dblclick(linhaMaskan + ' td[data-mk="2026-07"]');
  await p.waitForTimeout(250);
  ok('dois cliques no valor abrem o campo na própria célula', (await p.$$('.edit-campo.num')).length === 1);
  await p.fill('.edit-campo', '100.000,00');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(350);
  ok('o valor gravou no lançamento certo',
    (await p.evaluate(id => DB.meses['2026-07'].lancamentos.find(l => l.id === id).valor, idJul)) === 100000);
  const varDepois = await p.$eval(linhaMaskan + ' .badge.var', e => e.textContent.trim());
  ok('e o percentual se refez sozinho', varDepois !== varAntes && /74,3%/.test(varDepois), varAntes + ' → ' + varDepois);
  const difDepois = await p.$eval(linhaMaskan + ' td:nth-child(4)', e => e.textContent.trim());
  ok('a diferença também', /74\.327,67/.test(difDepois), difDepois);
  const totalConta = await p.$eval('#comp-corpo tr.linha-nat:has-text("Premio recebido")', e => e.textContent.replace(/\s+/g, ' ').trim());
  ok('e o total da conta lá em cima acompanhou', /404\.025,42/.test(totalConta), totalConta.slice(0, 90));
  const entradasQuadro = await p.$eval('#comp-corpo .cc-linha:nth-of-type(3)', e => e.textContent.replace(/\s+/g, ' ').trim());
  ok('o quadro de indicadores acompanhou junto', /902\.303,39/.test(entradasQuadro), entradasQuadro.slice(0, 90));

  // Esc desiste sem gravar
  await p.dblclick(linhaMaskan + ' td[data-mk="2026-07"]');
  await p.waitForTimeout(200);
  await p.fill('.edit-campo', '9,99');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  ok('Esc desiste da edição sem gravar',
    (await p.evaluate(id => DB.meses['2026-07'].lancamentos.find(l => l.id === id).valor, idJul)) === 100000);

  /* R$ 0,00 É VALOR, e a linha aceita ser zerada · a regra antiga recusava, e o
     Marco não conseguia zerar uma linha que veio e voltou no mesmo mês. */
  await p.dblclick(linhaMaskan + ' td[data-mk="2026-07"]');
  await p.waitForTimeout(200);
  await p.fill('.edit-campo', '0,00');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(350);
  ok('a linha aceita ser zerada',
    (await p.evaluate(id => DB.meses['2026-07'].lancamentos.find(l => l.id === id).valor, idJul)) === 0);

  // rabisco que não vira número continua sendo recusado, e a linha não se mexe
  await p.dblclick(linhaMaskan + ' td[data-mk="2026-07"]');
  await p.waitForTimeout(200);
  await p.fill('.edit-campo', 'abc');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(350);
  ok('texto que não é número continua recusado',
    (await p.evaluate(id => DB.meses['2026-07'].lancamentos.find(l => l.id === id).valor, idJul)) === 0);

  // devolve o valor para o resto do teste seguir com os números de sempre
  await p.dblclick(linhaMaskan + ' td[data-mk="2026-07"]');
  await p.waitForTimeout(200);
  await p.fill('.edit-campo', '100.000,00');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(350);

  // ═══ 13 · a descrição, que pareia os dois meses, muda nos dois ═══
  await p.dblclick(linhaMaskan + ' td[data-edit="desc"]');
  await p.waitForTimeout(250);
  ok('dois cliques na descrição abrem o campo', (await p.$$('.edit-campo')).length === 1);
  await p.fill('.edit-campo', 'Premio MASKAN corrigido');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(350);
  const nosDois = await p.evaluate(() => ['2026-07','2026-08'].map(mk =>
    DB.meses[mk].lancamentos.filter(l => l.descritivo === 'Premio MASKAN corrigido').length));
  ok('a descrição muda nos dois meses, para o par não se desfazer', nosDois.join(',') === '1,1', nosDois.join(','));
  ok('e a linha continua pareada, não virou duas', (await p.$$('#comp-corpo tr.lanc')).length === 1);
  await p.reload();
  await p.waitForTimeout(450);
  ok('o que foi corrigido na linha sobrevive ao recarregar', await p.evaluate(() =>
    DB.meses['2026-07'].lancamentos.some(l => l.descritivo === 'Premio MASKAN corrigido' && l.valor === 100000)));

  // ═══ 14 · o respiro entre entradas e saídas ═══
  const respiro = await p.evaluate(() => {
    const l = document.querySelector('#comp-corpo tr.respiro');
    if (!l) return null;
    const antes = l.previousElementSibling, depois = l.nextElementSibling;
    return { alt: Math.round(l.getBoundingClientRect().height),
             de: antes.textContent.replace(/\s+/g, ' ').trim().slice(0, 14),
             para: depois.textContent.replace(/\s+/g, ' ').trim().slice(0, 7) };
  });
  ok('existe um respiro entre entradas e saídas', respiro !== null && respiro.alt >= 6,
    respiro && respiro.alt + 'px, de "' + respiro.de + '" para "' + respiro.para + '"');
  ok('ele fica entre o total de entradas e a faixa de saídas',
    respiro && /TOTAL ENTRADAS/.test(respiro.de) && /Sa/.test(respiro.para));
  const respiroTopo = await p.evaluate(() => Math.round(parseFloat(getComputedStyle(document.querySelector('#comp-corpo .cc')).marginBottom)));
  ok('e mede o mesmo que o respiro do quadro de cima', respiro.alt === respiroTopo, respiro.alt + 'px × ' + respiroTopo + 'px');

  // ═══ 15 · máscara de dinheiro: quem digita mexe só nos dígitos ═══
  await p.reload();
  await p.waitForTimeout(450);
  await p.click('button:has-text("＋ Novo lançamento")');
  await p.waitForTimeout(300);
  await p.click('#f-valor');
  for (const k of '123456') await p.keyboard.press(k);
  ok('digitar 123456 vira R$ 1.234,56', (await p.inputValue('#f-valor')) === 'R$ 1.234,56', await p.inputValue('#f-valor'));
  await p.keyboard.press('Backspace');
  ok('apagar tira o último dígito, não a máscara', (await p.inputValue('#f-valor')) === 'R$ 123,45', await p.inputValue('#f-valor'));
  await p.keyboard.press('Control+a');
  for (const k of '900000') await p.keyboard.press(k);
  ok('selecionar tudo e digitar troca o valor inteiro', (await p.inputValue('#f-valor')) === 'R$ 9.000,00', await p.inputValue('#f-valor'));
  await p.fill('#f-nat', 'Fornecedores');
  await p.fill('#f-cp', 'TESTE MASCARA');
  await p.click('button:has-text("Incluir lançamento")');
  await p.waitForTimeout(350);
  ok('e o valor mascarado entra certo no lançamento', await p.evaluate(() =>
    DB.meses[compB].lancamentos.some(l => l.contraparte === 'TESTE MASCARA' && l.valor === -9000)));

  // na edição da linha a máscara vale igual · salvar já deixou a conta aberta
  await p.click('#comp-corpo tr.cp:has-text("TESTE MASCARA")');
  await p.waitForTimeout(250);
  const celMasc = '#comp-corpo tr.lanc td[data-edit="valor"]';
  await p.dblclick(celMasc);
  await p.waitForTimeout(250);
  ok('o campo da linha abre já com R$', /^-?R\$ /.test(await p.inputValue('.edit-campo')), await p.inputValue('.edit-campo'));
  await p.keyboard.press('Control+a');
  for (const k of '150000') await p.keyboard.press(k);
  ok('e mascara enquanto se digita na linha', (await p.inputValue('.edit-campo')) === 'R$ 1.500,00', await p.inputValue('.edit-campo'));
  await p.keyboard.press('-');
  ok('a tecla - inverte o sinal onde ele importa', (await p.inputValue('.edit-campo')) === '-R$ 1.500,00', await p.inputValue('.edit-campo'));
  await p.keyboard.press('Enter');
  await p.waitForTimeout(350);
  ok('o valor com sinal grava como negativo', await p.evaluate(() =>
    DB.meses[compB].lancamentos.some(l => l.contraparte === 'TESTE MASCARA' && l.valor === -1500)));

  // ═══ 16 · largura de coluna arrastável, como no Excel ═══
  const largJul = () => p.$eval('#comp-corpo > .comp-quadro > table.fam-table thead th:nth-child(2)',
    e => Math.round(e.getBoundingClientRect().width));
  const alca = await p.$('#comp-corpo > .comp-quadro > table.fam-table thead th:nth-child(2) .puxador');
  ok('a coluna tem alça no cabeçalho', alca !== null);
  ok('e a alça mostra o cursor de redimensionar',
    (await p.$eval('#comp-corpo > .comp-quadro > table.fam-table thead th:nth-child(2) .puxador', e => getComputedStyle(e).cursor)) === 'col-resize');
  // alça invisível ninguém acha: a divisória fica à mostra e a área de pega é larga
  const pega = await p.$eval('#comp-corpo > .comp-quadro > table.fam-table thead th:nth-child(2) .puxador', e => Math.round(e.getBoundingClientRect().width));
  ok('a área de pega é larga o bastante para a mão', pega >= 12, pega + 'px');
  const divisoria = await p.$eval('#comp-corpo > .comp-quadro > table.fam-table thead th:nth-child(2) .puxador', e => {
    const c = getComputedStyle(e, '::before');
    return { cor: c.backgroundColor, larg: c.width };
  });
  ok('e a divisória aparece sem precisar do mouse em cima',
    divisoria.cor !== 'rgba(0, 0, 0, 0)' && divisoria.cor !== 'transparent', divisoria.cor + ' · ' + divisoria.larg);
  // a alça existe também dentro das gavetas, onde a vista está na hora do ajuste
  if ((await p.$$('#comp-corpo tr.cp')).length === 0) {
    await p.click('#comp-corpo tr.linha-nat:has-text("Comissão Corretoras")');
    await p.waitForTimeout(250);
  }
  /* A gaveta não tem mais cabeçalho próprio, e é isso que se confere aqui: uma
     alça só, a de cima, que manda na coluna inteira · alça repetida dentro da
     conta era cabeçalho repetido, e cabeçalho repetido era a poluição. */
  ok('a gaveta não tem cabeçalho nem alça próprios',
    (await p.$$('#comp-corpo tr.cp .puxador, #comp-corpo tr.lanc .puxador')).length === 0);

  // arrastar partindo da borda, com o mouse andando de pouco em pouco, como uma pessoa
  await p.evaluate(() => document.querySelector('#comp-corpo .comp-quadro').scrollIntoView({ block: 'start' }));
  await p.waitForTimeout(250);
  // a alça mora na borda ESQUERDA da coluna: é a borda que se move nesta tabela
  const bordaTh = await p.$eval('#comp-corpo > .comp-quadro > table.fam-table thead th:nth-child(2)',
    e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2 }; });
  ok('o cabeçalho está à vista para o teste do arrasto', bordaTh.y > 0 && bordaTh.y < 950, 'y = ' + Math.round(bordaTh.y));
  const noPonto = await p.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el ? (el.className || el.tagName) + '|' + getComputedStyle(el).cursor : 'nada';
  }, [bordaTh.x, bordaTh.y]);
  ok('parando o mouse na borda da coluna, quem responde é a alça',
    /puxador\|col-resize/.test(noPonto), noPonto);

  /* O que o Marco reclamou: a alça ficava parada enquanto a coluna crescia
     para o outro lado. O teste agora mede exatamente isso · a linha tem que
     terminar onde o mouse terminou, para os dois lados. */
  const posAlca = () => p.$eval('#comp-corpo > .comp-quadro > table.fam-table thead th:nth-child(2) .puxador',
    e => { const r = e.getBoundingClientRect(); return r.x + r.width / 2; });
  for (const dx of [-80, 60]) {
    const ini = await posAlca();
    const largIni = await largJul();
    await p.mouse.move(ini, bordaTh.y);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) { await p.mouse.move(ini + dx * i / 8, bordaTh.y); await p.waitForTimeout(12); }
    await p.mouse.up();
    await p.waitForTimeout(200);
    const andou = Math.round((await posAlca()) - ini);
    const largFim = await largJul();
    ok('a alça anda junto com o mouse (' + (dx > 0 ? '+' : '') + dx + 'px)',
      Math.abs(andou - dx) <= 3, 'mouse ' + dx + 'px · alça ' + andou + 'px');
    ok('e a coluna ' + (dx < 0 ? 'cresce indo para a esquerda' : 'encolhe indo para a direita'),
      dx < 0 ? largFim > largIni : largFim < largIni, largIni + 'px → ' + largFim + 'px');
  }
  await p.dblclick('#comp-corpo > .comp-quadro > table.fam-table thead th:nth-child(2) .puxador');
  await p.waitForTimeout(200);
  const antesL = await largJul();
  const cx = await p.$eval('#comp-corpo > .comp-quadro > table.fam-table thead th:nth-child(2) .puxador', e => {
    const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await p.mouse.move(cx.x, cx.y);
  await p.mouse.down();
  await p.mouse.move(cx.x - 60, cx.y, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(250);
  const depoisL = await largJul();
  /* A borda andou 60px para a esquerda, e há DUAS colunas de mês dividindo a
     mesma largura: cada uma cresce 30px, e as duas somadas dão os 60px que a
     mão andou. É por isso que a conta aqui divide pelo número de meses. */
  const meses = await p.evaluate(() => mesesNaTela().length);
  ok('levar a borda para a esquerda alarga a coluna', Math.abs((depoisL - antesL) - 60 / meses) <= 2,
    antesL + 'px → ' + depoisL + 'px com ' + meses + ' meses na tela');

  // com uma gaveta aberta dá para conferir que a coluna é uma só de ponta a ponta
  if ((await p.$$('#comp-corpo tr.cp')).length === 0) {
    await p.click('#comp-corpo tr.linha-nat:has-text("Comissão Corretoras")');
    await p.waitForTimeout(250);
  }
  const largGaveta = await p.$eval('#comp-corpo tr.cp',
    e => Math.round(e.children[1].getBoundingClientRect().width));
  ok('a gaveta acompanha a mesma largura', Math.abs(largGaveta - depoisL) <= 1, largGaveta + 'px × ' + depoisL + 'px');
  const largQuadro = await p.evaluate(() => {
    const l = document.querySelector('#comp-corpo .cc-linha:nth-of-type(3)');
    return Math.round(l.children[1].getBoundingClientRect().width);
  });
  ok('e o quadro resumo também', Math.abs(largQuadro - depoisL) <= 1, largQuadro + 'px × ' + depoisL + 'px');

  await p.reload();
  await p.waitForTimeout(450);
  ok('a largura escolhida sobrevive ao recarregar', Math.abs((await largJul()) - depoisL) <= 1, String(await largJul()));

  await p.dblclick('#comp-corpo > .comp-quadro > table.fam-table thead th:nth-child(2) .puxador');
  await p.waitForTimeout(250);
  ok('dois cliques na alça devolvem o tamanho de fábrica', (await largJul()) === 120, String(await largJul()));

  // ═══ 12 · no papel, nada de menu ═══
  await p.emulateMedia({ media: 'print' });
  await p.waitForTimeout(150);
  const escondeMenu = await p.evaluate(() => {
    const d = document.createElement('div'); d.className = 'ctx-menu'; document.body.appendChild(d);
    const r = getComputedStyle(d).display === 'none'; d.remove(); return r;
  });
  ok('o menu não sai no PDF', escondeMenu);
  await p.emulateMedia({ media: 'screen' });

  // ═══ 17 · arrastar o mouse para selecionar não pode fechar nada ═══
  await p.reload();
  await p.waitForTimeout(450);
  await p.click('button:has-text("＋ Novo lançamento")');
  await p.waitForTimeout(300);
  const tit = await p.$eval('.modal-title', e => { const r = e.getBoundingClientRect(); return { x: r.x + 4, y: r.y + r.height / 2 }; });
  await p.mouse.move(tit.x, tit.y);
  await p.mouse.down();
  await p.mouse.move(tit.x + 180, tit.y, { steps: 6 });
  await p.waitForTimeout(120);
  ok('o arrasto está mesmo selecionando texto na janela',
    (await p.evaluate(() => String(getSelection()).trim().length)) > 0);
  await p.mouse.move(120, tit.y + 40, { steps: 8 });     // sai da janela ainda apertando
  await p.mouse.up();
  await p.waitForTimeout(300);
  ok('selecionar texto e soltar o mouse fora não fecha a janela', (await p.$('.modal-box')) !== null);
  await p.mouse.click(120, 600);
  await p.waitForTimeout(300);
  ok('um clique de verdade no fundo fecha', (await p.$('.modal-box')) === null);
  await p.click('button:has-text("＋ Novo lançamento")');
  await p.waitForTimeout(300);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(250);
  ok('e o Esc também', (await p.$('.modal-box')) === null);

  // o mesmo vale para a linha da tabela: selecionar não abre nem fecha a gaveta
  await p.click('#comp-corpo tr.linha-nat:has-text("Comissão Corretoras")');
  await p.waitForTimeout(250);
  const abertaAntes = (await p.$$('#comp-corpo tr.cp')).length;
  const linha = await p.$eval('#comp-corpo tr.linha-nat:has-text("Comissão Corretoras")',
    e => { const r = e.getBoundingClientRect(); return { x: r.x + 90, y: r.y + r.height / 2 }; });
  await p.mouse.move(linha.x, linha.y);
  await p.mouse.down();
  await p.mouse.move(linha.x + 120, linha.y, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  ok('arrastar para selecionar na linha não recolhe a gaveta',
    (await p.$$('#comp-corpo tr.cp')).length === abertaAntes,
    abertaAntes + ' → ' + (await p.$$('#comp-corpo tr.cp')).length);
  await p.evaluate(() => getSelection().removeAllRanges());
  await p.click('#comp-corpo tr.linha-nat:has-text("Comissão Corretoras")');
  await p.waitForTimeout(300);
  ok('mas um clique limpo continua recolhendo', (await p.$$('#comp-corpo tr.cp')).length === 0);

  ok('nenhum erro de JavaScript', erros.length === 0, erros.slice(0, 3).join(' | '));
  await b.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo verde.');
  process.exit(falhas ? 1 : 0);
})();
