// ============================================================================
//  O cofre com MAIS DE UMA PESSOA dentro, testado do jeito que acontece.
//
//  O que este teste prova, na ordem em que a vida acontece:
//    1. o primeiro (Marco) cria o cofre e recebe a chave de recuperação
//    2. ele gera um código de uso único para o segundo (Aldeir)
//    3. o segundo abre a tela e ENCONTRA a porta · era isto que faltava: ele
//       caía em modo manutenção, com dados de mentira e nenhum lugar para
//       digitar coisa alguma
//    4. o segundo entra com o código e escolhe A SENHA DELE, que o primeiro
//       não conhece, e o código é queimado no mesmo ato
//    5. o segundo passa a ver O MESMO CAIXA que o primeiro gravou, cifrado
//    6. o primeiro continua entrando com a senha dele
//
//  O servidor aqui é de mentira (as rotas do CRM em memória, com as MESMAS
//  regras da rota de verdade), mas a criptografia é a real: o navegador cifra,
//  envelopa e abre como faz no CRM. Nenhum número da FAM entra neste teste: a
//  semente é inventada aqui.
//
//  Uso: node fam-financeiro/teste-cofre-equipe.cjs
// ============================================================================
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ARQ = path.join(__dirname, 'dashboard.html');
const SENHA_MARCO = 'senha-do-marco-2026';
const SENHA_ALDEIR = 'senha-do-aldeir-2026';

/* números inventados, para o teste nunca depender do caixa de verdade */
const SEMENTE = {
  saldoInicial: 11111.11,
  saldoFinalBancario: 33333.33,
  lancamentos: [
    { id: 'T1', data: '2026-07-03', natureza: 'Receita de teste', contraparte: 'ALFA TESTE',
      descritivo: 'entrada inventada', valor: 30000, obs: '' },
    { id: 'T2', data: '2026-07-10', natureza: 'Despesa de teste', contraparte: 'BETA TESTE',
      descritivo: 'saida inventada', valor: -7777.78, obs: '' },
  ],
};

const PESSOAS = {
  marco: { usuarioId: 'u-marco', nome: 'Marco de Teste', edita: true, dono: true },
  aldeir: { usuarioId: 'u-aldeir', nome: 'Aldeir de Teste', edita: true, dono: true },
};

let falhas = 0;
const ok = (t, c, extra) => {
  console.log((c ? '  ok    · ' : '  FALHA · ') + t + (extra ? '  -> ' + extra : ''));
  if (!c) falhas++;
};

/* ── o servidor de mentira, com as regras de verdade ───────────────────────── */
const BANCO = { envelopes: [], estado: null, versao: 0, auditoria: [] };
let QUEM = PESSOAS.marco;

function corpo(req) {
  return new Promise(r => { let s = ''; req.on('data', c => s += c); req.on('end', () => r(s ? JSON.parse(s) : {})); });
}
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };

function servirPagina(res) {
  let html = fs.readFileSync(ARQ, 'utf8');
  const cercado = /\/\*__J0__\*\/[\s\S]*?\/\*__J1__\*\//;
  if (!cercado.test(html)) throw new Error('a carga de fábrica não está cercada no dashboard.html');
  /* como a rota de verdade: quem tem envelope pessoal recebe a semente, quem
     não tem recebe a tela sem número nenhum */
  const tenho = BANCO.envelopes.some(e => !e.revogado && e.tipo === 'senha' && e.usuario_id === QUEM.usuarioId);
  const semente = (BANCO.envelopes.length && !tenho)
    ? '{"saldoInicial":0,"saldoFinalBancario":0,"lancamentos":[]}'
    : JSON.stringify(SEMENTE);
  html = html.replace(cercado, semente);
  const sessao = '<script>window.FAM_SESSAO=' + JSON.stringify(QUEM).replace(/</g, '\\u003c') + ';</script>';
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html.replace('</head>', sessao + '</head>'));
}

const servidor = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/' || url === '/index.html') return servirPagina(res);

  if (url === '/api/financeiro/cofre') {
    const vivos = BANCO.envelopes.filter(e => !e.revogado);
    if (req.method === 'GET') {
      return json(res, 200, {
        envelopes: vivos, eu: QUEM.usuarioId, virgem: vivos.length === 0,
        jaTiveChave: BANCO.envelopes.some(e => e.revogado && e.tipo === 'senha' && e.usuario_id === QUEM.usuarioId),
      });
    }
    if (req.method === 'POST') {
      const c = await corpo(req);
      if (!QUEM.edita) return json(res, 403, { erro: 'Seu acesso ao Financeiro é somente de leitura.' });
      // a REGRA CORRIGIDA: `usuarioId: null` é convite, e não vira o id de quem grava
      const donoDoEnvelope = c.tipo !== 'senha' ? null
        : c.usuarioId === undefined ? QUEM.usuarioId : c.usuarioId;
      if (donoDoEnvelope && donoDoEnvelope !== QUEM.usuarioId && !QUEM.dono) {
        return json(res, 403, { erro: 'Só os donos criam a senha de outra pessoa.' });
      }
      // o índice único parcial do banco: uma senha viva por pessoa (NULL não conta)
      if (donoDoEnvelope && vivos.some(e => e.tipo === 'senha' && e.usuario_id === donoDoEnvelope)) {
        return json(res, 409, { erro: 'Essa pessoa já tem uma senha do cofre. Revogue a antiga primeiro.' });
      }
      const novo = {
        id: 'env' + (BANCO.envelopes.length + 1), rotulo: c.rotulo, tipo: c.tipo,
        usuario_id: donoDoEnvelope, iteracoes: c.iteracoes, sal: c.sal, nonce: c.nonce,
        cofre_cifrado: c.cofreCifrado, criado_por: QUEM.usuarioId, revogado: false,
      };
      BANCO.envelopes.push(novo);
      return json(res, 200, { ok: true, id: novo.id });
    }
    if (req.method === 'PATCH') {
      const c = await corpo(req);
      const alvo = vivos.find(e => e.id === c.envelopeId);
      if (!alvo) return json(res, 409, { erro: 'Envelope não encontrado ou já revogado.' });
      const meuOuConvite = alvo.tipo === 'senha' && (alvo.usuario_id === null || alvo.usuario_id === QUEM.usuarioId);
      if (!QUEM.dono && !meuOuConvite) return json(res, 403, { erro: 'Só os donos revogam a chave de outra pessoa.' });
      if (vivos.length <= 1) return json(res, 409, { erro: 'Este é o último jeito de abrir o cofre.' });
      alvo.revogado = true;
      return json(res, 200, { ok: true });
    }
  }

  if (url === '/api/financeiro/estado') {
    if (req.method === 'GET') {
      return json(res, 200, { db: BANCO.estado, versao: BANCO.versao, quem: QUEM });
    }
    if (req.method === 'PUT') {
      const c = await corpo(req);
      if (c.versaoBase !== BANCO.versao) return json(res, 409, { versao: BANCO.versao, db: BANCO.estado });
      BANCO.estado = c.db; BANCO.versao++;
      return json(res, 200, { versao: BANCO.versao });
    }
  }

  if (url === '/api/financeiro/auditoria') {
    if (req.method === 'GET') return json(res, 200, { registros: BANCO.auditoria });
    if (req.method === 'POST') { const c = await corpo(req); BANCO.auditoria.push(...(c.registros || [])); return json(res, 200, { ok: true }); }
  }

  if (url === '/api/financeiro/acesso') {
    return json(res, 200, {
      ativos: Object.values(PESSOAS).map((p, i) => ({
        id: 'a' + i, dono: p.dono, pode_editar: p.edita, concedido_em: '2026-08-29T00:00:00Z',
        revogado_em: null, usuarios: { id: p.usuarioId, nome: p.nome, cargo: null },
      })),
      historico: [], avisos: [],
    });
  }

  res.writeHead(404); res.end('nao');
});

const visivel = el => el.count().then(n => n > 0);

(async () => {
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + servidor.address().port + '/';

  const b = await chromium.launch({ channel: process.env.FAM_CANAL || 'msedge' });
  const ctx = await b.newContext();
  const erros = [];

  // ── 1. o Marco cria o cofre ────────────────────────────────────────────────
  console.log('\n=== 1. O PRIMEIRO CRIA O COFRE ===');
  QUEM = PESSOAS.marco;
  const pm = await ctx.newPage();
  pm.on('pageerror', e => erros.push('marco: ' + e));
  await pm.goto(BASE);
  await pm.waitForSelector('#c1', { timeout: 15000 });
  ok('a tela de criar o cofre aparece para quem chega primeiro', true);
  await pm.fill('#c1', SENHA_MARCO);
  await pm.fill('#c2', SENHA_MARCO);
  await pm.click('button:has-text("Criar o cofre")');
  await pm.waitForSelector('#c-ok', { timeout: 15000 });
  const recuperacao = (await pm.locator('#cofre-overlay div[style*="dashed"]').first().textContent()).trim();
  ok('a chave de recuperação foi mostrada uma vez', /^[A-Za-z0-9-]{20,}$/.test(recuperacao));
  await pm.check('#c-ok');
  await pm.click('button:has-text("Entrar no Financeiro")');
  await pm.waitForTimeout(2500);

  ok('nasceram os dois envelopes (senha do dono + recuperação)', BANCO.envelopes.length === 2,
    BANCO.envelopes.map(e => e.tipo).join(','));
  ok('o caixa subiu para o servidor CIFRADO', !!BANCO.estado && BANCO.estado.fam_cofre === 1);
  const cru = JSON.stringify(BANCO.estado || {});
  ok('o que está no servidor não tem os números da tela', !cru.includes('7777.78') && !cru.includes('ALFA TESTE'));

  // ── 2. o convite ───────────────────────────────────────────────────────────
  console.log('\n=== 2. O CÓDIGO DE USO ÚNICO ===');
  pm.on('dialog', d => d.accept('Aldeir de Teste'));
  await pm.click('button:has-text("Dar a chave a alguém")');
  await pm.waitForSelector('#cofre-overlay div[style*="dashed"]', { timeout: 15000 });
  const codigo = (await pm.locator('#cofre-overlay div[style*="dashed"]').first().textContent()).trim();
  ok('o código de convite apareceu', /^[A-Za-z0-9-]{20,}$/.test(codigo));

  const convite = BANCO.envelopes.find(e => e.tipo === 'senha' && e.usuario_id === null);
  ok('o convite foi gravado SEM dono (era o bug: virava a senha de quem convida)', !!convite,
    JSON.stringify(BANCO.envelopes.map(e => ({ t: e.tipo, u: e.usuario_id }))));
  ok('a senha do primeiro continua viva ao lado do convite',
    BANCO.envelopes.filter(e => !e.revogado && e.tipo === 'senha').length === 2);
  await pm.click('#cofre-overlay button:has-text("Fechar")');

  // ── 3 e 4. o segundo encontra a porta e cria a senha dele ──────────────────
  console.log('\n=== 3. O SEGUNDO ABRE A TELA ===');
  QUEM = PESSOAS.aldeir;
  const pa = await ctx.newPage();
  pa.on('pageerror', e => erros.push('aldeir: ' + e));
  await pa.goto(BASE);
  await pa.waitForSelector('#cofre-senha', { timeout: 15000 });
  const titulo = await pa.locator('#cofre-overlay').first().textContent();
  ok('ele encontra a porta em vez de cair em modo manutenção', /Criar a minha senha do cofre/.test(titulo));
  ok('a tela explica que o cofre é um só para a equipe', /um só para a equipe/.test(titulo));
  ok('o modo manutenção continua a um clique', await visivel(pa.locator('button:has-text("Entrar em modo manutenção")')));

  await pa.fill('#cofre-senha', 'chute-errado-de-proposito');
  await pa.click('#cofre-overlay button:has-text("Abrir o cofre")');
  await pa.waitForTimeout(2500);
  const depoisDoErro = await pa.locator('#cofre-overlay').first().textContent();
  ok('código errado é recusado', /Não confere com nenhuma chave/.test(depoisDoErro));
  ok('e a recusa volta para a tela certa, não para a que pede senha que ele não tem',
    /Criar a minha senha do cofre/.test(depoisDoErro));

  console.log('\n=== 4. ELE ESCOLHE A SENHA DELE ===');
  await pa.fill('#cofre-senha', codigo);
  await pa.click('#cofre-overlay button:has-text("Abrir o cofre")');
  await pa.waitForSelector('#ms1', { timeout: 20000 });
  ok('o código abre e a tela pede a senha PRÓPRIA dele', true);
  await pa.fill('#ms1', SENHA_ALDEIR);
  await pa.fill('#ms2', SENHA_ALDEIR);
  await pa.click('button:has-text("Criar a minha senha")');
  await pa.waitForTimeout(3000);

  const dele = BANCO.envelopes.find(e => e.tipo === 'senha' && e.usuario_id === PESSOAS.aldeir.usuarioId && !e.revogado);
  ok('a senha dele foi gravada no nome dele', !!dele);
  ok('o código de convite foi queimado', !!convite && convite.revogado === true);
  ok('a senha do primeiro não foi tocada',
    BANCO.envelopes.some(e => e.tipo === 'senha' && e.usuario_id === PESSOAS.marco.usuarioId && !e.revogado));

  // ── 5. ele vê o mesmo caixa ────────────────────────────────────────────────
  console.log('\n=== 5. ELE VÊ O CAIXA DE VERDADE ===');
  const vistoPeloAldeir = await pa.evaluate(() => {
    const m = RAIZ.principal.meses['2026-07'];
    return { saldoInicial: m.saldoInicial, quantos: m.lancamentos.length };
  });
  ok('o caixa que ele vê é o que o outro gravou, e não a semente vazia',
    vistoPeloAldeir.saldoInicial === SEMENTE.saldoInicial && vistoPeloAldeir.quantos === SEMENTE.lancamentos.length,
    JSON.stringify(vistoPeloAldeir));
  ok('a página dele foi servida SEM a carga de fábrica (ele não tinha envelope na hora)',
    !(await pa.content()).includes('ALFA TESTE'));

  // ── 6. os dois entram, cada um com a sua ───────────────────────────────────
  console.log('\n=== 6. CADA UM COM A SUA SENHA ===');
  const pa2 = await ctx.newPage();
  pa2.on('pageerror', e => erros.push('aldeir2: ' + e));
  await pa2.goto(BASE);
  await pa2.waitForSelector('#cofre-senha', { timeout: 15000 });
  ok('na volta, a tela dele já é a de senha', /Cofre do Financeiro/.test(await pa2.locator('#cofre-overlay').first().textContent()));
  await pa2.fill('#cofre-senha', SENHA_ALDEIR);
  await pa2.click('#cofre-overlay button:has-text("Abrir o cofre")');
  await pa2.waitForTimeout(3000);
  ok('a senha dele abre o cofre', !(await visivel(pa2.locator('#cofre-overlay'))));

  QUEM = PESSOAS.marco;
  const pm2 = await ctx.newPage();
  pm2.on('pageerror', e => erros.push('marco2: ' + e));
  await pm2.goto(BASE);
  await pm2.waitForSelector('#cofre-senha', { timeout: 15000 });
  await pm2.fill('#cofre-senha', SENHA_MARCO);
  await pm2.click('#cofre-overlay button:has-text("Abrir o cofre")');
  await pm2.waitForTimeout(3000);
  ok('o primeiro continua entrando com a senha dele', !(await visivel(pm2.locator('#cofre-overlay'))));
  ok('a senha de um NÃO é a do outro', SENHA_MARCO !== SENHA_ALDEIR);

  // a chave de recuperação, que é uma por cofre, abre para qualquer um dos dois
  const pr = await ctx.newPage();
  pr.on('pageerror', e => erros.push('recup: ' + e));
  await pr.goto(BASE);
  await pr.waitForSelector('#cofre-senha', { timeout: 15000 });
  await pr.fill('#cofre-senha', recuperacao);
  await pr.click('#cofre-overlay button:has-text("Abrir o cofre")');
  await pr.waitForTimeout(3000);
  ok('a chave de recuperação lacrada continua abrindo', !(await visivel(pr.locator('#cofre-overlay'))));

  /* ── 7. o segundo gera A CHAVE DE RECUPERAÇÃO DELE ────────────────────────
     A do cofre nasceu na tela de quem criou e ficou com ele. Quem entra depois
     precisa poder gerar a sua, senão esquecer a senha custa o caixa inteiro. */
  console.log('\n=== 7. O SEGUNDO GERA A CHAVE DE RECUPERAÇÃO DELE ===');
  QUEM = PESSOAS.aldeir;
  const recupAntes = BANCO.envelopes.filter(e => e.tipo === 'recuperacao' && !e.revogado).length;
  ok('o botão aparece para quem está com o cofre aberto',
    await pa2.locator('button:has-text("Nova chave de recuperação")').isVisible());
  await pa2.click('button:has-text("Nova chave de recuperação")');
  await pa2.waitForSelector('#cofre-overlay div[style*="dashed"]', { timeout: 15000 });
  const recupDele = (await pa2.locator('#cofre-overlay div[style*="dashed"]').first().textContent()).trim();
  ok('saiu uma chave nova', /^[A-Za-z0-9-]{20,}$/.test(recupDele) && recupDele !== recuperacao);
  ok('e ela não apagou a que já existia',
    BANCO.envelopes.filter(e => e.tipo === 'recuperacao' && !e.revogado).length === recupAntes + 1);
  ok('o envelope nasceu sem dono, como toda recuperação',
    BANCO.envelopes.some(e => e.tipo === 'recuperacao' && e.usuario_id === null && /Aldeir/.test(e.rotulo || '')));
  await pa2.click('#cofre-overlay button:has-text("Guardei")');

  // ela abre o cofre sozinha, sem senha de ninguém
  const pr2 = await ctx.newPage();
  pr2.on('pageerror', e => erros.push('recup2: ' + e));
  await pr2.goto(BASE);
  await pr2.waitForSelector('#cofre-senha', { timeout: 15000 });
  await pr2.fill('#cofre-senha', recupDele);
  await pr2.click('#cofre-overlay button:has-text("Abrir o cofre")');
  await pr2.waitForTimeout(3000);
  ok('a chave nova abre o cofre sozinha', !(await visivel(pr2.locator('#cofre-overlay'))));
  const pelaChaveNova = await pr2.evaluate(() => RAIZ.principal.meses['2026-07'].saldoInicial);
  ok('e devolve o caixa de verdade', pelaChaveNova === SEMENTE.saldoInicial, 'saldo: ' + pelaChaveNova);

  // ── 8. abrir mão da chave: nem o dono vê os números ──────────────────────
  console.log('\n=== 8. O DONO ABRE MÃO DA CHAVE ===');
  QUEM = PESSOAS.marco;
  ok('o botão existe para quem está com o cofre aberto',
    await pm2.locator('button:has-text("Abrir mão da minha chave")').isVisible());
  await pm2.click('button:has-text("Abrir mão da minha chave")');
  await pm2.waitForSelector('#lg-ok', { timeout: 15000 });
  const aviso = await pm2.locator('#cofre-overlay').first().textContent();
  ok('a tela diz quem continua entrando', /Aldeir de Teste/.test(aviso), aviso.slice(0, 80));
  ok('e avisa que não tem volta pela tela', /chave de recuperação lacrada/.test(aviso));
  await pm2.check('#lg-ok');
  pm2.once('dialog', d => d.accept());
  await pm2.click('#cofre-overlay button:has-text("Abrir mão da minha chave")');
  await pm2.waitForTimeout(4000);

  const meuEnv = BANCO.envelopes.find(e => e.tipo === 'senha' && e.usuario_id === PESSOAS.marco.usuarioId);
  ok('o envelope dele foi revogado no servidor', !!meuEnv && meuEnv.revogado === true);
  ok('o do outro continua vivo',
    BANCO.envelopes.some(e => e.tipo === 'senha' && e.usuario_id === PESSOAS.aldeir.usuarioId && !e.revogado));

  // a tela recarrega sozinha: agora é a de quem abriu mão
  await pm2.waitForSelector('#cofre-overlay', { timeout: 20000 });
  const telaDepois = await pm2.locator('#cofre-overlay').first().textContent();
  ok('a tela dele virou a de modo manutenção', /Modo manutenção/.test(telaDepois), telaDepois.slice(0, 70));
  ok('e ela NÃO oferece criar senha nova', !/Criar a minha senha do cofre/.test(telaDepois));

  await pm2.click('#cofre-overlay button:has-text("Entrar em modo manutenção")');
  await pm2.waitForTimeout(2500);
  const oQueEleVe = await pm2.evaluate(() => {
    const m = RAIZ.principal.meses['2026-07'];
    return {
      saldo: m.saldoInicial,
      cps: m.lancamentos.map(l => l.contraparte).join(','),
      guardado: localStorage.getItem('fam-financeiro-tela1') || '',
      trilha: localStorage.getItem('fam-financeiro-auditoria') || '',
    };
  });
  ok('o caixa que ele vê NÃO é o de verdade', oQueEleVe.saldo !== SEMENTE.saldoInicial, 'saldo: ' + oQueEleVe.saldo);
  ok('nenhuma contraparte de verdade na tela dele', !/ALFA TESTE|BETA TESTE/.test(oQueEleVe.cps), oQueEleVe.cps.slice(0, 60));
  ok('o caixa guardado no navegador dele não tem os números de verdade',
    !oQueEleVe.guardado.includes(String(SEMENTE.saldoInicial)) && !/ALFA TESTE/.test(oQueEleVe.guardado));
  ok('a trilha decifrada foi apagada do navegador dele',
    !/ALFA TESTE|BETA TESTE/.test(oQueEleVe.trilha), oQueEleVe.trilha.slice(0, 60));

  // e o outro continua enxergando tudo
  QUEM = PESSOAS.aldeir;
  const pa3 = await ctx.newPage();
  pa3.on('pageerror', e => erros.push('aldeir3: ' + e));
  await pa3.goto(BASE);
  await pa3.waitForSelector('#cofre-senha', { timeout: 15000 });
  await pa3.fill('#cofre-senha', SENHA_ALDEIR);
  await pa3.click('#cofre-overlay button:has-text("Abrir o cofre")');
  await pa3.waitForTimeout(3000);
  const doAldeir = await pa3.evaluate(() => RAIZ.principal.meses['2026-07'].saldoInicial);
  ok('o outro continua vendo o caixa de verdade', doAldeir === SEMENTE.saldoInicial, 'saldo: ' + doAldeir);

  console.log('\n=== ERROS DE JAVASCRIPT ===');
  ok('nenhum erro de script em nenhuma das telas', erros.length === 0, erros.slice(0, 3).join(' | '));

  await b.close();
  servidor.close();
  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo certo'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
