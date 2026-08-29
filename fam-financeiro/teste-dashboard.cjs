// Testa a tela de Acompanhamento mensal no Edge instalado.
// Uso (a partir da raiz do repositorio, senao o caminho do PDF de exemplo quebra):
//   node fam-financeiro/teste-dashboard.cjs fam-financeiro/dashboard.html <pasta-de-prints>
const path = require('node:path');
const { chromium } = require('playwright');

const ARQ = 'file:///' + path.resolve(process.argv[2]).replace(/\\/g, '/');
const OUT = path.resolve(process.argv[3] || '.');
let falhas = 0;
const ok = (t, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + ' · ' + t + (extra ? '  → ' + extra : '')); if (!c) falhas++; };
const txt = e => e.textContent.replace(/\s+/g, ' ').trim();

(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  // window.print() abriria a caixa de impressão e travaria o teste: aqui só contamos
  await p.addInitScript(() => { window.__printou = 0; window.print = () => { window.__printou++; }; });
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

  const ind = rot => p.$eval(`#comp-corpo .cc-linha:has(.cc-rot:text-is("${rot}"))`, txt);
  const qtdMes = mk => p.evaluate(m => DB.meses[m].lancamentos.length, mk);

  // ═══ a tela que abre é o Acompanhamento mensal, sem passar por lugar nenhum ═══
  ok('abre direto no Acompanhamento mensal', (await p.$$('#comp-corpo .comp-quadro')).length === 1);
  ok('não existe mais painel de cards', (await p.$$('.kpi-card')).length === 0);
  ok('não existe mais botão para abrir o acompanhamento', (await p.$$('button:has-text("📊 Acompanhamento mensal")')).length === 0);
  const per = await p.$$eval('#c-a option, #c-b option', els => els.length);
  ok('os dois períodos estão na barra', per >= 4 && (await p.$eval('#c-a', e => e.value)) === '2026-07', String(per));
  ok('o topo mostra os dois períodos', /Julho\/2026 × Agosto\/2026/.test(await p.$eval('#topo-mes', txt)));

  // ═══ indicadores do mês: ficaram cinco, na ordem pedida ═══
  const rots = await p.$$eval('#comp-corpo .cc .cc-rot', els => els.map(e => e.textContent.trim()));
  ok('cinco indicadores no quadro', rots.length === 5, rots.join(' · '));
  ok('Resultado do mês saiu', !rots.includes('Resultado do mês'), rots.join(' · '));
  ok('Saldo final bancário saiu', !rots.includes('Saldo final bancário'));
  ok('Diferença a conciliar saiu', !rots.includes('Diferença a conciliar'));
  ok('a linha de explicação embaixo do quadro saiu', (await p.$$('.cc-rodape')).length === 0);

  const li = await ind('Saldo inicial');
  ok('saldo inicial nos dois meses', /R\$ 4\.779,38/.test(li) && /R\$ 43\.685,18/.test(li), li.slice(0, 90));
  const le = await ind('Entradas do mês');
  ok('entradas nos dois meses', /R\$ 953\.892,67/.test(le) && /R\$ 1\.022\.234,87/.test(le), le.slice(0, 90));
  ok('a diferença sai com R$ e com sinal', /\+ R\$ 68\.342,20/.test(le), le.slice(0, 120));
  const ls = await ind('Saídas do mês');
  ok('saídas nos dois meses', /-R\$ 914\.986,87/.test(ls) && /-R\$ 785\.658,28/.test(ls), ls.slice(0, 90));
  const lq = await ind('Lançamentos no mês');
  ok('contagem de lançamentos não leva R$', /93/.test(lq) && !/R\$/.test(lq), lq.slice(0, 60));

  // ═══ o que o CFO pediu sobre número: R$ sempre e negativo vermelho ═══
  const semRS = await p.$$eval('#comp-corpo .fam-table tbody td.num:not(:has(.badge))', els =>
    els.map(e => e.textContent.trim()).filter(t => /\d/.test(t) && !t.includes('R$')));
  ok('todo valor da tabela sai com R$', semRS.length === 0, semRS.slice(0, 3).join(' | '));
  const negErrado = await p.$$eval('#comp-corpo .fam-table tbody td.num', els =>
    els.filter(e => e.textContent.includes('-R$') && !e.classList.contains('neg')).map(e => e.textContent.trim()));
  ok('todo negativo da tabela é vermelho', negErrado.length === 0, negErrado.slice(0, 3).join(' | '));
  const corNeg = await p.$eval('#comp-corpo .fam-table td.num.neg', e => getComputedStyle(e).color);
  ok('vermelho é o vermelho da FAM', corNeg === 'rgb(214, 69, 69)', corNeg);

  // ═══ selos de variação todos do mesmo tamanho ═══
  const larguras = await p.$$eval('#comp-corpo .badge.var', els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().width)))]);
  ok('os selos da direita têm todos a mesma largura', larguras.length === 1, larguras.join(' | ') + ' px');

  // ═══ cabeçalho e faixas na cor do quadro resumo ═══
  const cores = await p.evaluate(() => {
    const g = el => getComputedStyle(el).backgroundImage + ' | ' + getComputedStyle(el).backgroundColor;
    return { cc: g(document.querySelector('#comp-corpo .cc')), th: g(document.querySelector('#comp-corpo .fam-table thead')) };
  });
  ok('cabeçalho da tabela usa a cor do quadro resumo', cores.cc.split(' | ')[0] === cores.th.split(' | ')[0], cores.th.slice(0, 60));
  ok('o primeiro título da tabela está vazio (sem "Natureza / Conta")',
    (await p.$eval('#comp-corpo .fam-table thead th', e => e.textContent.trim())) === '');
  const faixaSai = await p.$eval('#comp-corpo tr.grupo:has-text("Saídas")', txt);
  ok('a faixa de saídas repete os títulos das colunas', /jul\/26/.test(faixaSai) && /Dif\. R\$/.test(faixaSai), faixaSai.slice(0, 80));

  // ═══ a tabela conta a conta ═══
  const contas = await p.$$eval('#comp-corpo tr.linha-nat', els => els.length);
  ok('14 contas na tabela', contas === 14, String(contas));
  const susep = await p.$eval('#comp-corpo tr:has-text("Taxa fiscalização SUSEP")', txt);
  ok('conta que zerou continua aparecendo', /zerou/.test(susep), susep.slice(0, 110));
  const totEnt = await p.$eval('#comp-corpo tr.subtotal:has-text("TOTAL ENTRADAS")', txt);
  ok('linha TOTAL ENTRADAS presente', /953\.892,67/.test(totEnt), totEnt.slice(0, 130));
  ok('sem travessão em lugar nenhum da tela', !(await p.evaluate(() => document.body.innerText.includes('—'))));

  // cabeçalho e tabela na MESMA grade de colunas
  const grade = await p.evaluate(() => {
    const cab = document.querySelector('#comp-corpo .cc-linha:nth-of-type(3)');
    /* o agrupamento por trimestre nasce desligado: o cabeçalho é uma linha só */
    const cel = document.querySelectorAll('#comp-corpo .fam-table thead th');
    return Math.abs(cab.children[2].getBoundingClientRect().right - cel[2].getBoundingClientRect().right);
  });
  ok('coluna do período B alinhada entre quadro e tabela', grade <= 2, 'diferença de ' + grade.toFixed(1) + 'px');

  // ═══ os três níveis: conta → contraparte → lançamento, sem repetir nada ═══
  const antes = await p.$$eval('#comp-corpo tr.linha-nat', els => els.length);
  /* O mês é nomeado uma vez por BLOCO (cabeçalho de entradas, faixa de saídas)
     e ponto. Abrir conta, contraparte e lançamento não pode criar nem mais um
     "jul/26" na tela · era essa a poluição que o Marco apontou. */
  const contarMeses = () => p.$$eval('#comp-corpo th, #comp-corpo td.rep', els =>
    els.filter(e => /^(jul|ago)\/26/.test(e.textContent.trim())).length);
  const mesesAntes = await contarMeses();
  await p.click('#comp-corpo tr.linha-nat:has-text("Comissão Corretoras")');
  await p.waitForTimeout(250);
  ok('abrir a conta não engole o resto da tabela', (await p.$$eval('#comp-corpo tr.linha-nat', els => els.length)) === antes);
  ok('nível 2 traz as contrapartes', (await p.$$('#comp-corpo tr.cp')).length === 3);
  ok('o bloco "lançamento a lançamento" duplicado saiu', (await p.$$('#comp-corpo .col2')).length === 0);
  ok('lançamento não aparece antes de clicar na contraparte', (await p.$$('#comp-corpo tr.lanc')).length === 0);

  await p.click('#comp-corpo tr.cp:has-text("VERAZ")');
  await p.waitForTimeout(250);
  const pares = await p.$$eval('#comp-corpo tr.lanc', els => els.length);
  ok('nível 3 pareia o mesmo lançamento dos dois meses na mesma linha', pares === 3, String(pares));
  const celulas = await p.$$eval('#comp-corpo tr.lanc td[data-ctx="lanc"]', els => els.length);
  ok('cada linha tem a coluna de julho e a de agosto', celulas === 6, String(celulas));
  const jul = await p.$$eval('#comp-corpo tr.lanc td[data-mk="2026-07"]', els => els.map(e => e.textContent.trim()));
  ok('a coluna de julho tem os valores de julho', jul.length === 3 && jul.every(t => t.includes('R$')), jul.join(' | '));

  /* ═══ O TRILHO: uma coluna só, do topo ao último lançamento ═══
     O pedido do Marco. Não basta a largura bater: a borda esquerda da célula
     de julho tem de ser a MESMA nos três níveis, senão o número escorrega. */
  const trilho = await p.evaluate(() => {
    const x = sel => {
      const tr = document.querySelector('#comp-corpo ' + sel);
      return tr ? Math.round(tr.children[1].getBoundingClientRect().left * 10) / 10 : null;
    };
    return { th: x('table.fam-table thead tr:last-child'), n1: x('tr.linha-nat'), n2: x('tr.cp'), n3: x('tr.lanc') };
  });
  const eixo = [trilho.th, trilho.n1, trilho.n2, trilho.n3];
  ok('julho cai no mesmo eixo vertical nos três níveis',
    eixo.every(v => v !== null && Math.abs(v - eixo[0]) < 1), eixo.join(' | '));

  /* ═══ Nenhum cabeçalho de mês repetido dentro das gavetas ═══ */
  const mesesDepois = await contarMeses();
  ok('abrir os três níveis não repete o nome do mês em lugar nenhum',
    mesesDepois === mesesAntes && mesesAntes === 4, mesesAntes + ' antes × ' + mesesDepois + ' depois');
  const poluicao = await p.$$eval('#comp-corpo *', els =>
    els.filter(e => e.children.length === 0 && /Data \/ descritivo|Contraparte/i.test(e.textContent)).length);
  ok('sumiram os rótulos "Data / descritivo" e "Contraparte" de dentro das contas', poluicao === 0, String(poluicao));

  /* ═══ A data à esquerda, na mesma linha do descritivo ═══ */
  const primeiroLanc = await p.$eval('#comp-corpo tr.lanc td.rot', e =>
    ({ dia: (e.querySelector('.dia') || {}).textContent || '', todo: e.textContent.replace(/\s+/g, ' ').trim() }));
  ok('a data abre a linha do lançamento, na mesma linha do descritivo',
    /^\d{2}\/\d{2}\/\d{2}/.test(primeiroLanc.dia.trim()) && primeiroLanc.todo.startsWith(primeiroLanc.dia.trim()),
    primeiroLanc.todo.slice(0, 60));

  /* ═══ As barras verticais do lado esquerdo saíram ═══ */
  const barras = await p.$$eval('#comp-corpo .gaveta-in, #comp-corpo .lancs-in', els => els.length);
  ok('não há mais barra vertical nem caixa dentro da linha', barras === 0, String(barras));
  await p.screenshot({ path: path.join(OUT, 'tela-niveis.png'), fullPage: false });
  await p.click('#comp-corpo tr.linha-nat:has-text("Comissão Corretoras")');
  await p.waitForTimeout(200);

  // ═══ CRUD pela barra: entra no período B ═══
  await p.click('button:has-text("＋ Novo lançamento")');
  await p.waitForTimeout(250);
  ok('o modal diz em que mês está entrando', /Agosto\/2026/.test(await p.$eval('.modal-title', txt)));
  await p.fill('#f-nat', 'Fornecedores');
  await p.fill('#f-cp', 'TESTE AUTOMATICO');
  await p.fill('#f-valor', '1.234,56');
  await p.fill('#f-desc', 'lançamento de teste');
  await p.click('button:has-text("Incluir lançamento")');
  await p.waitForTimeout(300);
  ok('CRUD incluir foi para agosto', (await qtdMes('2026-08')) === 90, String(await qtdMes('2026-08')));
  ok('julho não foi tocado', (await qtdMes('2026-07')) === 93, String(await qtdMes('2026-07')));
  const lqDepois = await ind('Lançamentos no mês');
  ok('o quadro acompanha a inclusão', /90/.test(lqDepois), lqDepois.slice(0, 60));

  // salvar já deixa a conta do lançamento aberta: clicar nela de novo fecharia
  ok('a conta do lançamento novo já abre sozinha', (await p.$$('#comp-corpo tr.cp:has-text("TESTE AUTOMATICO")')).length === 1);
  await p.click('#comp-corpo tr.cp:has-text("TESTE AUTOMATICO")');
  await p.waitForTimeout(250);
  // o botão direito age no mês da célula em que o clique caiu
  await p.click('#comp-corpo tr.lanc td[data-mk="2026-08"]', { button: 'right' });
  await p.waitForTimeout(250);
  await p.click('#ctx-menu .ctx-item:has-text("Excluir lançamento")');
  await p.waitForTimeout(350);
  ok('CRUD excluir: agosto volta a 89', (await qtdMes('2026-08')) === 89, String(await qtdMes('2026-08')));
  await p.click('#comp-corpo tr.linha-nat:has-text("Fornecedores")');
  await p.waitForTimeout(200);

  // ═══ criar uma natureza / conta antes de ela ter movimento ═══
  const contasAntes = await p.$$eval('#comp-corpo tr.linha-nat', els => els.length);
  await p.click('button:has-text("＋ Nova natureza")');
  await p.waitForTimeout(250);
  await p.fill('#n-nome', 'Aluguel da sede');
  await p.selectOption('#n-tipo', 'saida');
  await p.click('button:has-text("Criar natureza")');
  await p.waitForTimeout(300);
  ok('a natureza nova entra na tabela', (await p.$$eval('#comp-corpo tr.linha-nat', els => els.length)) === contasAntes + 1);
  const nova = await p.$eval('#comp-corpo tr.linha-nat:has-text("Aluguel da sede")', txt);
  ok('ela nasce zerada, nos dois meses', /Aluguel da sede/.test(nova) && !/R\$/.test(nova), nova.slice(0, 70));
  ok('e entra no bloco de saídas', await p.evaluate(() => {
    const ls = [...document.querySelectorAll('#comp-corpo tbody tr')];
    const i = ls.findIndex(t => t.textContent.includes('Aluguel da sede'));
    const s = ls.findIndex(t => t.classList.contains('grupo') && /Saídas/.test(t.textContent));
    return i > s;
  }));
  ok('e já aparece na lista do lançamento', await p.evaluate(() => naturezasConhecidas().includes('Aluguel da sede')));
  await p.reload(); await p.waitForTimeout(400);
  ok('a natureza nova sobrevive ao recarregar', (await p.$$('#comp-corpo tr.linha-nat:has-text("Aluguel da sede")')).length === 1);
  // e sai pelo menu dela, já que nunca teve movimento
  await p.click('#comp-corpo tr.linha-nat:has-text("Aluguel da sede")', { button: 'right' });
  await p.waitForTimeout(250);
  await p.click('#ctx-menu .ctx-item:has-text("Excluir esta natureza")');
  await p.waitForTimeout(300);
  ok('natureza sem movimento se apaga pelo menu', (await p.$$('#comp-corpo tr.linha-nat:has-text("Aluguel da sede")')).length === 0);

  // ═══ simulador ═══
  /* Ele deixou de existir na Principal: gerar um mês de mentira dentro da
     verdade da casa era exatamente o que as abas vieram impedir. Agora ele só
     abre DENTRO de uma simulação · e o teste tem que dizer isso. */
  ok('na Principal o Simulador não aparece', !(await p.$eval('#btn-sim', e => !!e.getClientRects().length)));
  await p.evaluate(() => novaSimulacao());
  await p.waitForTimeout(450);
  ok('dentro de uma simulação ele aparece', await p.$eval('#btn-sim', e => !!e.getClientRects().length));
  await p.click('button:has-text("🧪 Simulador")');
  await p.waitForTimeout(300);
  await p.click('button.preset:has-text("Subir 20% na folha")');
  await p.waitForTimeout(250);
  const prev = await p.$eval('#s-preview tr:has-text("Remuneração Time FAM")', txt);
  ok('prévia sobe a folha 20%', /117\.600,00/.test(prev), prev.slice(0, 110));
  await p.screenshot({ path: path.join(OUT, 'tela-simulador.png') });
  await p.fill('#s-dest', '2026-09');
  await p.fill('#s-nome', 'Folha +20%');
  await p.click('button:has-text("Gerar mês simulado")');
  await p.waitForTimeout(450);
  ok('a tela passa a comparar contra o mês simulado', (await p.$eval('#c-b', e => e.value)) === '2026-09', await p.$eval('#c-b', e => e.value));
  ok('faixa de aviso de mês simulado', (await p.$$('.faixa-sim')).length === 1);
  const folhaSet = await p.$eval('#comp-corpo tr:has-text("Remuneração Time FAM")', txt);
  ok('setembro com folha em 117.600,00', /117\.600,00/.test(folhaSet), folhaSet.slice(0, 110));

  // ═══ persistência · e a Principal intacta ═══
  await p.reload();
  await p.waitForTimeout(400);
  /* o F5 devolve sempre a Principal · e ela não pode ter o mês de mentira.
     Era exatamente isto que o botão solto quebrava: setembro simulado nascia
     dentro da verdade da casa. */
  const optsP = await p.evaluate(() => mesesOrdenados());
  ok('o F5 volta para a Principal, e ela segue SEM o mês simulado', optsP.join(',') === '2026-07,2026-08', optsP.join(','));
  await p.evaluate(() => abrirAba((RAIZ.cenarios || [])[0].id));
  await p.waitForTimeout(350);
  const opts = await p.evaluate(() => mesesOrdenados());
  ok('e a simulação guardou o mês dela', opts.join(',') === '2026-07,2026-08,2026-09', opts.join(','));
  /* e recolhe o rascunho: a seção das abas, mais adiante, parte de uma aba só.
     Teste que suja o estado de quem vem depois não é teste, é armadilha. */
  await p.evaluate(() => (RAIZ.cenarios || []).slice().forEach(c => excluirAba(c.id)));
  await p.waitForTimeout(400);
  ok('a simulação de teste foi recolhida', (await p.$$('.aba')).length === 1);

  // ═══ mobile ═══
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);
  const rolagem = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('sem rolagem lateral no celular', rolagem <= 1, 'sobra ' + rolagem + 'px');
  await p.screenshot({ path: path.join(OUT, 'tela-mobile.png'), fullPage: false });
  await p.setViewportSize({ width: 1440, height: 950 });
  await p.evaluate(() => { verMeses({ modo: 'lista', lista: ['2026-07', '2026-08'] }); fixarPar('2026-07', '2026-08'); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, 'tela-acompanhamento.png'), fullPage: true });

  // ═══ PDF da tela ═══
  await p.evaluate(() => { window.__printou = 0; });
  await p.click('button:has-text("🖨️ PDF")');
  await p.waitForTimeout(250);
  ok('botão PDF chama a impressão', (await p.evaluate(() => window.__printou)) === 1);
  const cabPdf = await p.$eval('#cab-impressao', txt);
  ok('PDF traz a FAM e o par comparado',
    /FAM SEGURADORA/.test(cabPdf) && cabPdf.includes('diferença Julho/2026 → Agosto/2026'), cabPdf.slice(0, 150));

  // ═══ robô Caixa ═══
  ok('botão Robô Caixa no lugar', (await p.$eval('#btn-fin', txt)) === '🤖 Robô Caixa');
  ok('botão Lembretes logo acima', (await p.$eval('#btn-rev', txt)) === '📌 Lembretes');
  ok('barra lateral começa fechada', !(await p.$eval('#robo', e => e.classList.contains('aberta'))));
  await p.click('#btn-fin');
  await p.waitForTimeout(350);
  ok('clicar abre a barra lateral', await p.$eval('#robo', e => e.classList.contains('aberta')));
  ok('FIN já responde o saldo ao abrir', /43\.685,18/.test(await p.$eval('#fin-resp', txt)));
  await p.click('.fin-chip:has-text("Quanto gastei com Fornecedores")');
  await p.waitForTimeout(250);
  const rFor = await p.$eval('#fin-resp', txt);
  ok('FIN acha a natureza Fornecedores', /31\.487,68/.test(rFor), rFor.slice(0, 90));
  ok('FIN mostra memória de cálculo', /AV%/.test(rFor));
  await p.fill('#fin-q', 'quanto paguei pra Veraz');
  await p.click('.fin-barra .btn-primary');
  await p.waitForTimeout(250);
  const rVer = await p.$eval('#fin-resp', txt);
  ok('FIN acha a contraparte Veraz', /VERAZ/i.test(rVer) && /13\.921,76/.test(rVer), rVer.slice(0, 100));
  await p.fill('#fin-q', 'compare julho com agosto');
  await p.click('.fin-barra .btn-primary');
  await p.waitForTimeout(250);
  ok('FIN compara dois meses', /Julho\/2026 × Agosto\/2026/.test(await p.$eval('#fin-resp', txt)));
  await p.fill('#fin-q', 'quantos jacarés cabem no elevador');
  await p.click('.fin-barra .btn-primary');
  await p.waitForTimeout(250);
  ok('FIN admite quando não entende', /Não entendi/.test(await p.$eval('#fin-resp', txt)));
  await p.screenshot({ path: path.join(OUT, 'tela-fin.png') });
  await p.click('.gl-cab .fechar');
  await p.waitForTimeout(300);
  ok('barra lateral fecha', !(await p.$eval('#robo', e => e.classList.contains('aberta'))));

  // ═══ lembretes: criar, escrever e APAGAR ═══
  await p.click('#btn-rev');
  await p.waitForTimeout(150);
  await p.mouse.click(700, 620);
  await p.waitForTimeout(200);
  ok('post-it criado', (await p.$$('.postit')).length === 1);
  await p.fill('.postit textarea', 'trocar o titulo deste bloco');
  await p.click('#btn-rev');
  await p.waitForTimeout(150);
  await p.reload(); await p.waitForTimeout(400);
  ok('post-it sobrevive ao recarregar', (await p.$$('.postit')).length === 1);
  await p.click('.postit .x');
  await p.waitForTimeout(250);
  ok('APAGAR o post-it funciona', (await p.$$('.postit')).length === 0);

  // ═══ importação de extrato em PDF ═══
  await p.click('button:has-text("📥 Importar extrato")');
  await p.waitForTimeout(300);
  await p.setInputFiles('#imp-file', path.resolve('fam-financeiro/extrato-exemplo-agosto.pdf'));
  await p.waitForTimeout(500);
  ok('11 lançamentos lidos do PDF', (await p.$$eval('#imp-corpo tbody tr', els => els.length)) === 11);
  const resumo = await p.$eval('.resumo-imp', txt);
  ok('semáforo: 9 por regra, 1 sugerido, 1 sem natureza', /9 categorizado/.test(resumo) && /1 sugerido/.test(resumo) && /1 sem natureza/.test(resumo), resumo);
  const comissao = await p.$eval('#imp-corpo tr:has-text("ITHERA")', e => e.querySelector('input[list]').value);
  ok('comissão não cai em tributos por causa do "iss"', comissao === 'Comissão Corretoras', comissao);
  ok('contraparte conhecida vira sugestão amarela', /parecida com uma/.test(await p.$eval('#imp-corpo tr:has-text("TELEFONICA")', txt)));
  ok('extrato traz o saldo para conciliar', /63\.482,72/.test(await p.$eval('#imp-corpo', e => e.textContent)));
  const campoNat = p.locator('#imp-corpo tr:has-text("CONSULTORIA NOVA HORIZONTE") input[list]');
  await campoNat.fill('Fornecedores');
  await campoNat.dispatchEvent('input');
  await p.waitForTimeout(300);

  // ═══ o robô chuta, mas o Aldeir corrige a natureza E o valor ═══
  const linhaGen = p.locator('#imp-corpo tbody tr').first();
  const campoVal = linhaGen.locator('td.num input');
  ok('o valor lido vem editável', await campoVal.isEditable());
  const valAntes = await p.evaluate(() => impTrans[0].valor);
  const fitAntes = await p.evaluate(() => impTrans[0].fitid);
  await campoVal.fill('1.500,00');
  await campoVal.dispatchEvent('input');
  await p.waitForTimeout(250);
  ok('corrigir o valor entra no lançamento', (await p.evaluate(() => impTrans[0].valor)) === 1500, String(await p.evaluate(() => impTrans[0].valor)));
  ok('e não mexe na identidade que evita duplicar', (await p.evaluate(() => impTrans[0].fitid)) === fitAntes);
  await campoVal.fill((valAntes < 0 ? '-' : '') + Math.abs(valAntes).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  await campoVal.dispatchEvent('input');
  await p.waitForTimeout(250);
  ok('e volta ao valor do extrato quando corrigido de novo', (await p.evaluate(() => impTrans[0].valor)) === valAntes, String(await p.evaluate(() => impTrans[0].valor)));

  // ═══ lançamento que o extrato não trouxe entra à mão, na mesma conferência ═══
  await p.click('button:has-text("＋ Adicionar linha à mão")');
  await p.waitForTimeout(300);
  ok('a linha à mão entra na conferência', (await p.$$('#imp-corpo tbody tr.manual')).length === 1);
  ok('a importação trava enquanto a linha à mão está vazia',
    /incompletas|Falta ajustar/.test(await p.$eval('#imp-rodape', txt)), (await p.$eval('#imp-rodape', txt)).slice(0, 80));
  const manual = p.locator('#imp-corpo tbody tr.manual');
  await manual.locator('input[type=date]').fill('2026-08-20');
  await manual.locator('td:nth-child(3) input').first().fill('CARTORIO DO CENTRO');
  await manual.locator('td:nth-child(3) input').nth(1).fill('registro de contrato');
  await manual.locator('td.num input').fill('-250,00');
  await manual.locator('td.num input').dispatchEvent('input');
  await manual.locator('input[list]').fill('Fornecedores');
  await manual.locator('input[list]').dispatchEvent('input');
  await p.waitForTimeout(300);
  ok('com a linha à mão preenchida, a trava sai',
    !/incompletas|Falta ajustar/.test(await p.$eval('#imp-rodape', txt)), (await p.$eval('#imp-rodape', txt)).slice(0, 70));
  await p.screenshot({ path: path.join(OUT, 'tela-importacao.png') });
  await p.click('button:has-text("Importar 12")');
  await p.waitForTimeout(600);
  ok('agosto virou mês real depois do extrato', (await p.$eval('#c-b', e => e.value)) === '2026-08', await p.$eval('#c-b', e => e.value));
  /* "real" tem que ser no dado, nao so na tela: antes do extrato agosto era um
     mês simulado, e o cabeçalho do PDF avisa isso por escrito. */
  ok('e o mês perdeu de fato a marca de simulado',
    await p.evaluate(() => DB.meses['2026-08'].simulado === false),
    String(await p.evaluate(() => DB.meses['2026-08'].simulado)));
  ok('os 11 do extrato mais o 1 digitado à mão', (await qtdMes('2026-08')) === 12, String(await qtdMes('2026-08')));
  ok('o lançamento à mão entrou com o que foi digitado', await p.evaluate(() =>
    DB.meses['2026-08'].lancamentos.some(l => l.contraparte === 'CARTORIO DO CENTRO' && l.valor === -250 && l.origem === 'manual')));
  // o manual não está no extrato: a conciliação tem que acusar, não esconder
  const conc = await p.evaluate(() => fmt(apurar('2026-08').diferenca));
  ok('a conciliação acusa o que não veio do extrato', conc === '-R$ 250,00', conc);
  await p.evaluate(() => {
    const m = DB.meses['2026-08'];
    m.lancamentos = m.lancamentos.filter(l => l.origem !== 'manual');
    gravar(); render();
  });
  const conc2 = await p.evaluate(() => fmt(apurar('2026-08').diferenca));
  ok('tirando o manual, o extrato fecha em zero', conc2 === 'R$ 0,00', conc2);

  // ═══ reimportar o mesmo arquivo não duplica ═══
  await p.click('button:has-text("📥 Importar extrato")');
  await p.waitForTimeout(300);
  await p.setInputFiles('#imp-file', path.resolve('fam-financeiro/extrato-exemplo-agosto.pdf'));
  await p.waitForTimeout(500);
  ok('mesmo arquivo de novo: 11 já importados', /11 já importado/.test(await p.$eval('.resumo-imp', txt)));
  ok('nada para importar na segunda vez', /Importar 0/.test(await p.$eval('.modal-rodape .btn-primary', txt)));
  await p.click('.modal-header .fechar');
  await p.waitForTimeout(200);

  const aprendeu = await p.evaluate(() => (DB.regras || []).some(r => /CONSULTORIA NOVA HORIZONTE/i.test(r.texto) && r.natureza === 'Fornecedores'));
  ok('confirmação virou regra nova', aprendeu);

  // ═══ backup em arquivo (o sistema não tem nuvem) ═══
  const dl = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Salvar cópia dos dados")')]);
  ok('backup baixa um .json', /^fam-financeiro-\d{8}-\d{4}\.json$/.test(dl[0].suggestedFilename()), dl[0].suggestedFilename());

  // ═══ abas: a Principal é a verdade, a simulação é cópia isolada ═══
  await p.reload();
  await p.waitForTimeout(450);
  ok('a tela abre na aba Principal', (await p.$$eval('.aba', els => els.map(e => e.textContent.trim()))).length === 1);
  ok('e ela não está vestida de simulação', !(await p.evaluate(() => document.body.classList.contains('simulando'))));
  const entradasPrinc = await p.evaluate(() => apurar(compA).entradas);

  await p.click('.aba-nova');
  await p.waitForTimeout(500);
  ok('a simulação vira uma aba nova', (await p.$$('.aba')).length === 2);
  ok('e a tela inteira muda de cor', await p.evaluate(() => document.body.classList.contains('simulando')));
  const corSim = await p.evaluate(() => getComputedStyle(document.querySelector('.cc')).backgroundImage);
  ok('o quadro resumo fica roxo na simulação', /42, 27, 77/.test(corSim), corSim.slice(0, 55));
  ok('a faixa diz por escrito que é simulação, não só pela cor',
    /Simulação 1/.test(await p.$eval('.faixa-simulacao', txt)));

  // mexer aqui não pode encostar na Principal
  await p.evaluate(() => {
    DB.meses[compA].lancamentos.push({ id: novoId(), data: compA + '-15', natureza: 'Premio recebido',
      contraparte: 'SO NA SIMULACAO', descritivo: 'teste', valor: 500000, obs: '' });
    gravar(); render();
  });
  const entradasSim = await p.evaluate(() => apurar(compA).entradas);
  ok('o lançamento entra na simulação', Math.round(entradasSim - entradasPrinc) === 500000, entradasSim.toFixed(2));
  await p.click('.aba:has-text("Principal")');
  await p.waitForTimeout(450);
  ok('e a Principal continua exatamente como estava',
    (await p.evaluate(() => apurar(compA).entradas)) === entradasPrinc, String(await p.evaluate(() => apurar(compA).entradas)));
  ok('voltando para a Principal, a cor volta ao azul',
    !(await p.evaluate(() => document.body.classList.contains('simulando'))));
  await p.reload();
  await p.waitForTimeout(500);
  ok('as abas sobrevivem ao recarregar', (await p.$$('.aba')).length === 2);
  ok('e a Principal segue intacta depois do F5',
    (await p.evaluate(() => apurar(compA).entradas)) === entradasPrinc);

  // ═══ mês novo, copiado do anterior ═══
  const antesMes = await p.evaluate(() => {
    const ms = mesesOrdenados(), ult = ms[ms.length - 1];
    return { qtd: ms.length, ultimo: ult, esperado: mesSeguinte(ult),
             saldo: valorEditavel(Number(apurar(ult).saldoApurado.toFixed(2))),
             lancsJul: DB.meses['2026-07'].lancamentos.length };
  });
  await p.click('button:has-text("📅 Novo mês")');
  await p.waitForTimeout(400);
  const mkNovo = await p.inputValue('#m-mes');
  ok('o mês sugerido é o seguinte ao último', mkNovo === antesMes.esperado, antesMes.ultimo + ' → ' + mkNovo);
  ok('o saldo inicial já vem do apurado do mês anterior',
    (await p.inputValue('#m-saldo')) === antesMes.saldo, await p.inputValue('#m-saldo'));
  await p.selectOption('#m-como', 'copia');
  await p.waitForTimeout(200);
  await p.selectOption('#m-de', '2026-07');
  await p.click('button:has-text("Criar mês")');
  await p.waitForTimeout(500);
  ok('o mês novo entra na lista', (await p.evaluate(() => mesesOrdenados().length)) === antesMes.qtd + 1);
  ok('e nasce com os lançamentos copiados',
    (await p.evaluate(mk => DB.meses[mk].lancamentos.length, mkNovo)) === antesMes.lancsJul,
    (await p.evaluate(mk => DB.meses[mk].lancamentos.length, mkNovo)) + ' × ' + antesMes.lancsJul);
  ok('com as datas já dentro do mês novo',
    await p.evaluate(mk => DB.meses[mk].lancamentos.every(l => l.data.startsWith(mk)), mkNovo));
  ok('e a tela já passa a comparar contra ele', (await p.$eval('#c-b', e => e.value)) === mkNovo);
  ok('o mês novo nasceu só na simulação? não: estamos na Principal',
    !(await p.evaluate(() => document.body.classList.contains('simulando'))));

  ok('nenhum erro de JavaScript', erros.length === 0, erros.slice(0, 3).join(' | '));
  await b.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo verde.');
  process.exit(falhas ? 1 : 0);
})();
