// ============================================================================
//  O cofre do Financeiro, testado de verdade.
//
//  Não basta "tem AES no código". O que importa é: o pacote que sobe para o
//  servidor contém algum número do caixa? A senha errada abre? A chave de
//  recuperação abre? Trocar a senha de um continua deixando o outro entrar?
//
//  Uso: node fam-financeiro/teste-cofre.cjs fam-financeiro/dashboard.html
// ============================================================================
const path = require('node:path');
const { chromium } = require('playwright');

const ARQ = 'file:///' + path.resolve(process.argv[2] || 'fam-financeiro/dashboard.html').replace(/\\/g, '/');
let falhas = 0;
const ok = (t, c, extra) => {
  console.log((c ? '  ok    · ' : '  FALHA · ') + t + (extra ? '  -> ' + extra : ''));
  if (!c) falhas++;
};

(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const p = await b.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(String(e)));
  await p.goto(ARQ);
  await p.waitForTimeout(700);

  console.log('\n=== IDA E VOLTA ===');
  const r = await p.evaluate(async () => {
    const segredo = { meses: { '2026-07': { lancamentos: [
      { contraparte: 'RESSEGURADORA FICTICIA SA', valor: -424242.42, descritivo: 'lancamento inventado para o teste' },
    ] } } };

    // cria o cofre como o sistema cria
    const chave = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    COFRE.chave = chave; COFRE.aberto = true;

    const pacote = await empacotar(segredo);
    const devolta = await desempacotar(pacote);

    return {
      pacoteTexto: JSON.stringify(pacote),
      voltouIgual: JSON.stringify(devolta) === JSON.stringify(segredo),
      ehPacote: ehPacoteCifrado(pacote),
    };
  });

  ok('o que entra volta idêntico', r.voltouIgual);
  ok('o pacote se identifica como cifrado', r.ehPacote);
  ok('o pacote NÃO contém o valor do lançamento', !r.pacoteTexto.includes('424242'), r.pacoteTexto.slice(0, 60));
  ok('o pacote NÃO contém o nome da contraparte', !/FICTICIA/i.test(r.pacoteTexto));
  ok('o pacote NÃO contém o descritivo', !/inventado para o teste/i.test(r.pacoteTexto));

  console.log('\n=== ENVELOPE: SENHA CERTA, SENHA ERRADA, RECUPERACAO ===');
  const e = await p.evaluate(async () => {
    const chave = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const bruta = await crypto.subtle.exportKey('raw', chave);

    // monta um envelope na mão, do mesmo jeito que envelopar() monta
    const fazer = async (senha) => {
      const sal = crypto.getRandomValues(new Uint8Array(16));
      const kek = await chaveDaSenha(senha, sal, 310000);
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const cif = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, kek, bruta);
      const b64 = x => btoa(String.fromCharCode(...new Uint8Array(x)));
      return { tipo: 'senha', usuario_id: 'u1', iteracoes: 310000, sal: b64(sal), nonce: b64(nonce), cofre_cifrado: b64(cif) };
    };

    const envSenha = await fazer('senha-do-aldeir-2026');
    const envRecup = await fazer('RECUP-AAAA-BBBB-CCCC');

    const tenta = async (env, senha) => {
      try {
        const k = await abrirEnvelope(env, senha);
        const raw = await crypto.subtle.exportKey('raw', k);
        return btoa(String.fromCharCode(...new Uint8Array(raw)));
      } catch (x) { return null; }
    };

    const alvo = btoa(String.fromCharCode(...new Uint8Array(bruta)));
    return {
      certa:   await tenta(envSenha, 'senha-do-aldeir-2026') === alvo,
      errada:  await tenta(envSenha, 'senha-do-aldeir-2027') === null,
      quase:   await tenta(envSenha, 'senha-do-aldeir-2026 ') === null,
      recup:   await tenta(envRecup, 'RECUP-AAAA-BBBB-CCCC') === alvo,
      cruzada: await tenta(envRecup, 'senha-do-aldeir-2026') === null,
      // dois envelopes diferentes guardam a MESMA chave de cofre
      mesmoCofre: await tenta(envSenha, 'senha-do-aldeir-2026') === await tenta(envRecup, 'RECUP-AAAA-BBBB-CCCC'),
    };
  });

  ok('a senha certa abre o envelope', e.certa);
  ok('a senha errada NÃO abre', e.errada);
  ok('um espaço a mais na senha NÃO abre', e.quase);
  ok('a chave de recuperação abre', e.recup);
  ok('a senha de um envelope não abre o outro', e.cruzada);
  ok('os dois envelopes guardam a MESMA chave do cofre', e.mesmoCofre);

  console.log('\n=== A TRILHA: quem/quando em claro, valores cifrados ===');
  const t = await p.evaluate(async () => {
    const chave = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    COFRE.chave = chave; COFRE.aberto = true;
    const reg = { id: 'A1', ts: '2026-08-29T10:00:00Z', quem: 'Aldeir Campelo', tipo: 'alteracao',
      acao: 'Valor corrigido na linha', onde: 'Conta de teste · FORNECEDOR FICTICIO', de: 'R$ 1.234,56', para: 'R$ 7.654,32', detalhe: '' };
    const cif = await cifrarRegistro(reg);
    const texto = JSON.stringify(cif);
    const volta = await decifrarRegistro(cif);

    COFRE.aberto = false; COFRE.chave = null;      // agora sem chave, como o Marco
    const semChave = await decifrarRegistro(cif);

    return {
      quemEmClaro: cif.quem === 'Aldeir Campelo' && cif.ts === reg.ts && cif.acao === reg.acao,
      valorSumiu: !texto.includes('1.234,56') && !texto.includes('7.654,32') && !/FICTICIO/.test(texto),
      voltaCerto: volta.de === reg.de && volta.onde === reg.onde,
      semChaveVeCadeado: semChave.de === '🔒' && semChave.onde === '🔒',
      semChaveVeQuem: semChave.quem === 'Aldeir Campelo' && semChave.acao === 'Valor corrigido na linha',
    };
  });

  ok('quem mexeu, quando e o tipo da ação ficam legíveis', t.quemEmClaro);
  ok('os valores e a contraparte somem do que sobe', t.valorSumiu);
  ok('com a chave, a trilha volta a ser legível', t.voltaCerto);
  ok('sem a chave, o conteúdo vira cadeado (não base64 cru)', t.semChaveVeCadeado);
  ok('sem a chave, ainda se vê QUEM fez e O QUE fez', t.semChaveVeQuem);

  console.log('\n=== MODO MANUTENCAO: numeros inventados, nada da FAM ===');
  const m = await p.evaluate(() => {
    const base = baseDeManutencao();
    const texto = JSON.stringify(base);
    /* "FAM" sozinho é contraparte de verdade (transferência entre contas da
       casa) e também aparece no rótulo honesto da base de demonstração ("não
       são da FAM"). Nomes curtos demais dão falso positivo por substring, então
       a conferência é sobre os nomes que identificam alguém. */
    /* As amostras saem do JULHO da própria página, nunca escritas neste
       arquivo: um teste versionado com "REASEGURADORA PATRIA" e o valor da
       SUSEP dentro vazaria, em miniatura, o que ele existe para proteger. */
    const reais = JULHO.lancamentos.map(l => l.contraparte).filter(c => c.length > 5);
    const valores = JULHO.lancamentos.map(l => String(Math.abs(l.valor))).filter(v => v.length > 6);
    return {
      temMeses: Object.keys(base.principal.meses).length === 2,
      temLancamentos: base.principal.meses['2026-07'].lancamentos.length > 0,
      semContraparteReal: !reais.some(cp => texto.includes(cp)),
      semValorReal: !valores.some(v => texto.includes(v)),
      // duas chamadas dão o mesmo resultado: defeito não pode mudar de número sozinho
      estavel: JSON.stringify(baseDeManutencao()) === texto,
    };
  });

  ok('a base de manutenção tem os dois meses', m.temMeses);
  ok('e tem lançamentos para a tela funcionar', m.temLancamentos);
  ok('NENHUMA contraparte real da FAM aparece', m.semContraparteReal);
  ok('NENHUM valor real da FAM aparece', m.semValorReal);
  ok('é estável entre aberturas', m.estavel);

  /* ═══════════════════════════════════════════════════════════════════════
     A CERCA DA CARGA DE FÁBRICA

     Este teste existe porque o cofre quase nasceu enfeite: os 93 lançamentos
     reais de julho ficam COMPILADOS dentro do dashboard.html, então servir o
     arquivo para quem não tem chave entregaria salários e resseguro no
     código-fonte, com a tela mostrando números de mentira por cima.

     A rota /api/financeiro/pagina arranca o que está entre as cercas. Aqui se
     confere que as cercas existem e que arrancar realmente esvazia. */
  console.log('\n=== A CERCA: o servidor consegue arrancar a carga real? ===');
  const fs = require('node:fs');
  const bruto = fs.readFileSync(path.resolve(process.argv[2] || 'fam-financeiro/dashboard.html'), 'utf8');
  const cerca = /\/\*__J0__\*\/[\s\S]*?\/\*__J1__\*\//;

  ok('a carga de fábrica está cercada no arquivo', cerca.test(bruto));

  /* Dois arquivos possíveis, e os dois são corretos:
       build local     → traz o julho real, e aqui se prova que a cerca o arranca
       build --publicar → já nasce com semente neutra, e o que se prova é que ele
                          está limpo (é este que vai para o git e para a Vercel)
     Sem esta distinção, o teste passaria "de graça" num arquivo neutro e diria
     que a cerca funciona sem nunca ter arrancado nada. */
  /* O que "não pode vazar" sai do julho.json LOCAL, que fica fora do git.
     Escrever os nomes e os valores aqui dentro seria versionar exatamente o que
     este teste protege · e este arquivo vai para o repositório. */
  const ARQ_JULHO = path.resolve('fam-financeiro/julho.json');
  const julhoLocal = fs.existsSync(ARQ_JULHO) ? JSON.parse(fs.readFileSync(ARQ_JULHO, 'utf8')) : null;
  /* NOME DE CONTA não é razão. `INTERNAS` (quais contas são transferência entre
     contas da própria casa) e as regras que leem o extrato ("resgate" → tal
     conta) são lógica do programa: precisam estar no código para o importador
     funcionar sem configuração. Elas revelam DOIS nomes de conta, sem valor,
     sem contraparte e sem data · é uma exposição de outra ordem, e está
     registrada de propósito em vez de escondida do teste. */
  const nomesDeConta = new Set((julhoLocal?.lancamentos ?? []).map(l => l.natureza));
  const amostras = julhoLocal
    ? [...new Set(julhoLocal.lancamentos.flatMap(l => [l.contraparte, l.descritivo, String(Math.abs(l.valor))]))]
        .filter(v => v && v.length > 6 && !nomesDeConta.has(v))
    : [];

  if (!julhoLocal) {
    console.log('  (sem julho.json por perto · a conferência de vazamento não roda)');
  } else {
    const vazou = txt => amostras.filter(v => txt.includes(v));
    const temDadoReal = vazou(bruto).length > 0;

    if (temDadoReal) {
      console.log('  (build local · dá para provar que a cerca arranca de verdade)');
      const podado = bruto.replace(cerca, '{"saldoInicial":0,"saldoFinalBancario":0,"lancamentos":[]}');
      const sobrou = vazou(podado);
      ok('depois de arrancada, nada do RAZÃO sobra (valor, contraparte, descritivo)',
        sobrou.length === 0, sobrou.slice(0, 3).join(' | '));
      ok('e o que sobra ainda é um HTML inteiro', podado.length > 200000 && podado.includes('</html>'));

      /* Não é asserção, é prestação de contas: diz na cara quais nomes de conta
         ficam no código por necessidade, para ninguém achar que "tudo saiu". */
      const contasNoCodigo = [...nomesDeConta].filter(n => n.length > 6 && podado.includes(n));
      console.log('  nota · nomes de conta que permanecem no código (lógica do importador): ' +
        (contasNoCodigo.length ? contasNoCodigo.join(' | ') : 'nenhum'));
    } else {
      console.log('  (build de publicação · o que se confere é que ele já está limpo)');
      ok('o arquivo de publicação não tem NADA do caixa real', true);
      ok('e ainda é o sistema inteiro', bruto.length > 200000 && bruto.includes('</html>'));
    }
  }

  ok('nenhum erro de JavaScript', erros.length === 0, erros.slice(0, 2).join(' | '));
  await b.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo verde.');
  process.exitCode = falhas ? 1 : 0;
})();
