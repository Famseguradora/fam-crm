// ============================================================================
//  O Financeiro dentro do CRM, pelo HTTP, no app de verdade.
//
//  O que este teste prova: SEM SESSÃO, nada do caixa sai do servidor. É o
//  caminho negativo que importa · foi por achar que `public/` bastava que eu
//  quase entreguei a tela aberta para quem tivesse o endereço.
//
//  Uso (da raiz do repositório, com `npm run build` já feito):
//    node fam-financeiro/teste-crm-financeiro.cjs
//
//  Servidor, testes e desligamento moram no mesmo processo: o ambiente bloqueia
//  processo solto em segundo plano.
// ============================================================================
const { spawn } = require('node:child_process');

const PORTA = 3987;
const BASE = 'http://127.0.0.1:' + PORTA;
let falhas = 0;
const ok = (t, c, extra) => {
  console.log((c ? '  ok    · ' : '  FALHA · ') + t + (extra ? '  -> ' + extra : ''));
  if (!c) falhas++;
};

/** Não segue redirecionamento: o 307 para /login É a resposta que interessa. */
async function pega(caminho) {
  const r = await fetch(BASE + caminho, { redirect: 'manual' });
  const corpo = await r.text().catch(() => '');
  return { status: r.status, destino: r.headers.get('location') || '', corpo };
}

async function esperarDePe(tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    try {
      await fetch(BASE + '/login', { redirect: 'manual' });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}

(async () => {
  const servidor = spawn('npx', ['next', 'start', '-p', String(PORTA)], {
    cwd: process.cwd(), shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  servidor.stdout.on('data', () => {});
  servidor.stderr.on('data', () => {});

  try {
    if (!await esperarDePe()) { console.log('  FALHA · o servidor nao subiu'); process.exitCode = 1; return; }
    console.log('\n=== SEM SESSAO: nada do caixa pode sair ===');

    const pagina = await pega('/api/financeiro/pagina');
    ok('a rota que serve o sistema nao entrega o HTML',
      pagina.status === 307 || pagina.status === 302 || pagina.status === 403,
      'status ' + pagina.status + (pagina.destino ? ' -> ' + pagina.destino : ''));
    ok('e nao vaza nem um pedaco do sistema no corpo',
      !/FAM Financeiro|Acompanhamento mensal|saldoInicial|lancamentos/i.test(pagina.corpo),
      pagina.corpo.slice(0, 70).replace(/\s+/g, ' '));

    const estado = await pega('/api/financeiro/estado');
    ok('a rota do estado nao entrega o caixa',
      estado.status === 307 || estado.status === 302 || estado.status === 403, 'status ' + estado.status);
    ok('e nao vaza numero nenhum',
      !/saldo|lancamentos|"db"/i.test(estado.corpo), estado.corpo.slice(0, 70).replace(/\s+/g, ' '));

    const acesso = await pega('/api/financeiro/acesso');
    ok('a lista de quem tem acesso nao sai',
      acesso.status === 307 || acesso.status === 302 || acesso.status === 403, 'status ' + acesso.status);
    ok('e nao vaza nome de ninguem',
      !/Aldeir|Marco|Abenaias|Sergio/i.test(acesso.corpo), acesso.corpo.slice(0, 70).replace(/\s+/g, ' '));

    const trilha = await pega('/api/financeiro/auditoria');
    ok('a trilha de auditoria nao sai',
      trilha.status === 307 || trilha.status === 302 || trilha.status === 403, 'status ' + trilha.status);

    const tela = await pega('/financeiro');
    ok('a tela do CRM manda para o login',
      tela.status === 307 || tela.status === 302, 'status ' + tela.status + ' -> ' + tela.destino);

    console.log('\n=== o resto do CRM continua de pe ===');
    const login = await pega('/login');
    ok('a tela de login abre normalmente', login.status === 200, 'status ' + login.status);
  } finally {
    servidor.kill('SIGKILL');
    // no Windows o npx deixa filho: garante que a porta nao fica presa
    try { spawn('taskkill', ['/pid', String(servidor.pid), '/T', '/F'], { shell: true }); } catch {}
  }

  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo verde.');
  process.exitCode = falhas ? 1 : 0;
})();
