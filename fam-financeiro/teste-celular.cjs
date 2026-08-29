// ============================================================================
//  O Financeiro no celular.
//
//  O Marco usa muito o telefone, e a regra da casa e dura: nada de rolagem
//  lateral, alvo de toque >= 44px, e campo com font-size >= 16px (abaixo disso
//  o iOS da zoom sozinho ao focar, e a tela "pula" na cara da pessoa).
//
//  Uso: node fam-financeiro/teste-celular.cjs fam-financeiro/dashboard.html
// ============================================================================
const path = require('node:path');
const { chromium, devices } = require('playwright');

const ARQ = 'file:///' + path.resolve(process.argv[2] || 'fam-financeiro/dashboard.html').replace(/\\/g, '/');
let falhas = 0;
const ok = (t, c, extra) => {
  console.log((c ? '  ok    · ' : '  FALHA · ') + t + (extra ? '  -> ' + extra : ''));
  if (!c) falhas++;
};

(async () => {
  const b = await chromium.launch({ channel: 'msedge' });

  /* Em pe E deitado. O deitado nao e capricho: um iPhone 12 na horizontal tem
     844px de largura e escapa de qualquer max-width:768px · foi por isso que a
     regra passou a ser por PONTEIRO. Sem este caso no teste, girar o aparelho
     traria de volta os botoes de lancamento sem ninguem perceber. */
  for (const nome of ['iPhone 12', 'Pixel 7', 'iPhone 12 landscape', 'Pixel 7 landscape']) {
    const d = devices[nome];
    if (!d) { console.log('  (aparelho ' + nome + ' nao existe nesta versao do Playwright)'); continue; }
    console.log('\n=== ' + nome + ' · ' + d.viewport.width + 'x' + d.viewport.height + ' ===');

    const ctx = await b.newContext({ ...d });
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', e => erros.push(String(e)));
    // dentro do CRM: sessao presente, cofre aberto pelo dono
    await p.addInitScript(s => { window.FAM_SESSAO = s },
      { nome: 'Aldeir Campelo', edita: true, dono: true, usuarioId: 'a' });
    await p.goto(ARQ);
    await p.waitForTimeout(500);
    await p.evaluate(() => localStorage.clear());
    await p.reload();
    await p.waitForTimeout(1500);

    const deitado = d.viewport.width > d.viewport.height;
    const modo = await p.evaluate(() => ({
      toque: matchMedia('(pointer:coarse) and (max-width:1024px)').matches,
      soVis: typeof soVisualizacao === 'function' ? soVisualizacao() : null,
    }));
    ok('o sistema se reconhece como aparelho de toque', modo.toque);
    ok('e a trava do CODIGO concorda com a do CSS', modo.soVis === true, String(modo.soVis));

    const lateral = await p.evaluate(() =>
      Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth));
    ok('sem rolagem lateral', lateral <= 1, lateral + 'px sobrando');

    const larguraOk = await p.evaluate(() => {
      const vp = document.documentElement.clientWidth;
      return [...document.querySelectorAll('.card-panel,.filter-row,.comp-quadro,.topo')]
        .filter(e => e.getBoundingClientRect().width > vp + 1)
        .map(e => e.className + ' (' + Math.round(e.getBoundingClientRect().width) + 'px)');
    });
    ok('nenhum bloco mais largo que a tela', larguraOk.length === 0, larguraOk.slice(0, 2).join(' | '));

    // alvos de toque
    const pequenos = await p.evaluate(() =>
      [...document.querySelectorAll('.acoes-tela button,.filter-row button,.flutua')]
        .filter(e => e.getClientRects().length)
        .filter(e => e.getBoundingClientRect().height < 36)
        .map(e => (e.textContent || '').trim().slice(0, 22) + ' ' + Math.round(e.getBoundingClientRect().height) + 'px'));
    ok('botoes com altura de dedo (>=36px)', pequenos.length === 0, pequenos.slice(0, 3).join(' | '));

    /* ── SO VISUALIZACAO ──
       No celular o sistema e para conferir. Lancar dinheiro com o polegar num
       extrato de 93 linhas e como o erro entra. */
    const escrita = await p.evaluate(() =>
      [...document.querySelectorAll('[data-escreve]')]
        .filter(e => e.getClientRects().length)
        .map(e => (e.textContent || '').trim().slice(0, 24)));
    ok('nenhum botao que ESCREVE aparece', escrita.length === 0, escrita.join(' | '));

    const ferramentas = await p.evaluate(() => ({
      hp: !!document.getElementById('btn-calc')?.getClientRects().length,
      lembretes: !!document.getElementById('btn-rev')?.getClientRects().length,
      robo: !!document.getElementById('btn-fin')?.getClientRects().length,
      pdf: [...document.querySelectorAll('.acoes-tela button')]
        .some(e => e.getClientRects().length && /PDF/.test(e.textContent || '')),
      rodape: !!document.querySelector('footer')?.getClientRects().length,
      /* a assinatura mora FORA do <footer> · esconder o rodape nao a alcancava,
         e era ela o "escrito la embaixo" que continuava grande no telefone */
      assinatura: !!document.querySelector('.credito')?.getClientRects().length,
      /* e ela continua existindo no PAPEL: quem sai no PDF e outro elemento */
      assinaturaNoPdf: !!document.querySelector('.credito-papel'),
      respiro: Math.round(parseFloat(getComputedStyle(document.querySelector('.wrap')).paddingBottom)),
    }));
    ok(deitado ? 'DEITADO: a HP aparece' : 'EM PE: a HP some (cobriria meia tela)',
      ferramentas.hp === deitado, 'hp visivel = ' + ferramentas.hp);
    ok('os lembretes somem', !ferramentas.lembretes);
    ok('o Robo Caixa FICA · e o basico que o Marco pediu', ferramentas.robo);
    ok('o PDF fica, que e visualizacao', ferramentas.pdf);
    /* ── O MESMO TAMANHO DE PE E DEITADO ──
       Estes valores moravam num @media de LARGURA, e telefone deitado tem 844px:
       girar o aparelho devolvia o tamanho de computador no cabecalho, nos cartoes
       e no pe da pagina. Os quatro aparelhos tem que dar o MESMO numero aqui. */
    const px = (sel, prop) => p.evaluate(([s, k]) => {
      const e = document.querySelector(s);
      return e ? parseFloat(getComputedStyle(e)[k]) : null;
    }, [sel, prop]);
    const tipo = {
      corpo: await px('body', 'fontSize'),
      tabela: await px('.comp-quadro .fam-table', 'fontSize'),
      selo: await px('.badge', 'fontSize'),
      topo: await px('.topo h1', 'fontSize'),
    };
    ok('letra de telefone · a MESMA de pe e deitado',
      tipo.corpo === 13 && tipo.tabela === 12 && tipo.selo === 10 && (tipo.topo === null || tipo.topo === 17),
      JSON.stringify(tipo));

    /* A HP encolhida vivia num @media de 500px, e ela so aparece DEITADO, com
       750px ou mais · nunca encolhia no aparelho. Era esta a letra grande que
       voltava no pe da tela ao girar o telefone. */
    if (deitado) {
      await p.evaluate(() => alternarCalc());
      await p.waitForTimeout(350);
      const hp = await p.evaluate(() => {
        const j = document.querySelector('.hp-janela'), t = document.querySelector('.hp-tecla');
        return {
          tecla: t ? parseFloat(getComputedStyle(t).fontSize) : null,
          legenda: parseFloat(getComputedStyle(document.querySelector('.hp-tecla .lg')).fontSize),
          altura: Math.round(j.getBoundingClientRect().height),
          vp: document.documentElement.clientHeight,
        };
      });
      ok('a HP abre encolhida, como no celular estreito', hp.tecla === 9.5 && hp.legenda === 5.5, JSON.stringify(hp));
      ok('e ela cabe na altura da tela deitada', hp.altura <= hp.vp, hp.altura + ' de ' + hp.vp + 'px');
      await p.evaluate(() => alternarCalc());
      await p.waitForTimeout(200);
    }

    ok('o rodape de faxina some', !ferramentas.rodape);
    ok('a assinatura do rodape some', !ferramentas.assinatura);
    ok('mas ela continua no PDF', ferramentas.assinaturaNoPdf);
    ok('sobra respiro para o Robo nao cobrir a ultima linha (>=46px)',
      ferramentas.respiro >= 46, ferramentas.respiro + 'px');

    // dois toques numa celula nao podem abrir campo: esconder botao nao basta
    const abriuCampo = await p.evaluate(() => {
      const td = document.querySelector('#comp-corpo td[data-edit]') ||
                 document.querySelector('#comp-corpo td.num');
      if (!td) return 'sem celula';
      editarCelula(td);
      return !!document.querySelector('.edit-campo');
    });
    ok('dois toques na celula NAO abrem campo de edicao', abriuCampo === false, String(abriuCampo));

    // modal: no celular ele PODE ocupar a tela toda · e o desenho certo la.
    // Chamado direto, por baixo da tela, so para conferir o desenho do formulario.
    await p.evaluate(() => novoLancamentoNaTela());
    await p.waitForTimeout(600);
    const modal = await p.evaluate(() => {
      const c = document.querySelector('.modal-box');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      const campos = [...c.querySelectorAll('input,select')]
        .filter(e => e.getClientRects().length)
        .map(e => parseFloat(getComputedStyle(e).fontSize));
      return {
        largura: Math.round(r.width), vp: document.documentElement.clientWidth,
        cabe: r.width <= document.documentElement.clientWidth + 1,
        menorFonte: campos.length ? Math.min(...campos) : 0,
        colunas: getComputedStyle(document.querySelector('.form-grid')).gridTemplateColumns,
      };
    });
    ok('o modal cabe na largura do aparelho', !!modal && modal.cabe, modal ? modal.largura + ' de ' + modal.vp + 'px' : 'sem modal');
    /* Quem decide a coluna e a LARGURA, nao a orientacao · um iPhone deitado
       tem 750px e um Pixel deitado tem 863px, e so o segundo comporta duas.
       Escrevi isto errado uma vez (assertando por orientacao) e o teste acusou:
       a regra e a largura, e o teste tem que dizer a mesma coisa que o CSS. */
    const cabemDuas = d.viewport.width >= 768;
    ok(cabemDuas ? 'duas colunas (largura >= 768)' : 'campos empilhados (largura < 768)',
      !!modal && (/ \d/.test(modal.colunas.trim()) === cabemDuas),
      d.viewport.width + 'px -> ' + (modal ? modal.colunas : ''));
    ok('campo com fonte >=16px (senao o iPhone da zoom sozinho)',
      !!modal && modal.menorFonte >= 16, modal ? modal.menorFonte + 'px' : '');

    ok('nenhum erro de JavaScript', erros.length === 0, erros.slice(0, 2).join(' | '));
    await p.screenshot({ path: path.join(process.argv[3] || '.', 'celular-' + nome.replace(/\s+/g, '-') + '.png') });
    await ctx.close();
  }

  await b.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo verde.');
  process.exitCode = falhas ? 1 : 0;
})();
