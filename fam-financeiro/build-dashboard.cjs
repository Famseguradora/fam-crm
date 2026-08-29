// Junta as partes do dashboard.html e injeta os lançamentos de julho/2026.
// Uso: node fam-financeiro/build-dashboard.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const DIR = __dirname;
// _p5 vai por último: é ele que dispara o início e precisa de tudo já definido.
// O início chama nuvemIniciar() na primeira linha, e a nuvem chama o cofre. Daí
// a ordem do fim: _pc (o cofre), _pb (a nuvem) e só então _p5, que dá a partida.
const partes = ['_p1.html', '_p2.html', '_p3.html', '_p4.html', '_p6.html', '_p7.html', '_p8.html',
                '_p9.html', '_pa.html', '_pc.html', '_pb.html', '_p5.html'];

let html = partes.map(p => fs.readFileSync(path.join(DIR, p), 'utf8')).join('\n');

/* julho.json fica FORA do git (é o caixa real). Quem clonar o repositório não
   o tem, e ainda assim precisa conseguir gerar o arquivo de publicação · por
   isso ele é obrigatório só no build local, onde os números são conferidos. */
const ARQ_JULHO = path.join(DIR, 'julho.json');
const temJulho = fs.existsSync(ARQ_JULHO);
const julho = temJulho ? JSON.parse(fs.readFileSync(ARQ_JULHO, 'utf8')) : null;

/* ── PUBLICAR: `node build-dashboard.cjs --publicar` ────────────────────────
   O arquivo que vai para o git e para a Vercel nasce com semente NEUTRA. Os 93
   lançamentos reais de julho ficam compilados só na cópia local · commitar o
   caixa da FAM o deixaria no histórico do git para sempre, legível por quem
   tiver o repositório, no mesmo commit em que se constrói o cofre para
   escondê-lo. O julho de verdade entra uma vez, pelo "Restaurar de um arquivo",
   e passa a viver cifrado dentro do cofre, que é o lugar dele. */
const publicar = process.argv.includes('--publicar');
const SEMENTE_NEUTRA = {
  saldoInicial: 0, saldoFinalBancario: 0, lancamentos: [],
};
if (!publicar && !temJulho) {
  throw new Error('julho.json não está aqui. Ele fica fora do git de propósito (é o caixa real).\n' +
    'Para gerar o arquivo de publicação sem ele: node fam-financeiro/build-dashboard.cjs --publicar');
}
const semente = publicar ? SEMENTE_NEUTRA : julho;

if (!html.includes('/*__JULHO__*/null')) throw new Error('marcador /*__JULHO__*/null não encontrado');
// A carga de fábrica sai CERCADA. Servido dentro do CRM, quem não tem chave do
// cofre recebe a página com este trecho trocado por uma semente inventada · sem
// a cerca, os lançamentos reais viajariam no código-fonte para qualquer um com
// acesso à tela, e o cofre seria enfeite.
html = html.replace('/*__JULHO__*/null', '/*__J0__*/' + JSON.stringify(semente) + '/*__J1__*/');

// confere a sintaxe de cada bloco <script>
const blocos = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
blocos.forEach((b, i) => {
  try { new vm.Script(b[1]); }
  catch (e) { throw new Error(`erro de sintaxe no bloco <script> #${i + 1}: ${e.message}`); }
});

// confere que os números de julho fecham contra a planilha do Aldeir · só faz
// sentido quando julho.json está por perto (build local, não publicação)
let ent = 0, sai = 0;
if (temJulho) {
  ent = julho.lancamentos.filter(l => l.valor > 0).reduce((s, l) => s + l.valor, 0);
  sai = julho.lancamentos.filter(l => l.valor < 0).reduce((s, l) => s + l.valor, 0);
  const apurado = julho.saldoInicial + ent + sai;
  const conf = (a, b) => Math.abs(a - b) < 0.005;
  /* Os totais esperados vêm do próprio julho.json (campo `conferencia`), que
     fica fora do git. Antes estavam escritos aqui · dois números do caixa da
     FAM em arquivo versionado, que é justamente o que este projeto decidiu não
     fazer. Sem o campo, a conferência de totais não roda e o build avisa. */
  const esperado = julho.conferencia;
  if (!esperado) {
    console.log('aviso: julho.json sem o campo `conferencia` · totais não conferidos contra a planilha.');
  } else {
    if (!conf(ent, esperado.entradas)) throw new Error('entradas de julho não fecham: ' + ent.toFixed(2));
    if (!conf(sai, esperado.saidas)) throw new Error('saídas de julho não fecham: ' + sai.toFixed(2));
  }
  if (!conf(apurado, julho.saldoFinalBancario)) throw new Error('conciliação de julho não fecha: ' + apurado.toFixed(2));
}

// o Marco nao usa travessao: se algum voltar para o codigo, o build para aqui
for (const [nome, ch] of [['travessao grande', '—'], ['travessao medio', '–'], ['sinal de menos', '−']]) {
  const i = html.indexOf(ch);
  if (i >= 0) throw new Error(`${nome} encontrado no HTML: ...${html.slice(Math.max(0, i - 60), i + 30)}...`);
}

/* o icone e feito por codigo: sem ele o atalho do instalador nasce com a cara
   de arquivo de HTML solto, e o sistema deixa de parecer um programa */
const ICONE = path.join(DIR, 'fam-financeiro.ico');
if (!fs.existsSync(ICONE)) {
  execFileSync(process.execPath, [path.join(DIR, 'gerar-icone.cjs')], { stdio: 'inherit' });
}

/* ── Trava de segurança, ANTES de gravar ────────────────────────────────────
   Se um dado do razão sobrou no arquivo de publicação, o build para e não
   escreve nada. Rodar isto depois de gravar seria inútil: o arquivo já estaria
   no disco, pronto para o `git add`. Falhar aqui custa um minuto; descobrir
   depois do commit custa o histórico do git, que não se apaga.

   As amostras saem do julho.json, não escritas aqui · escrever "Remuneração
   Marco" e o valor da SUSEP neste arquivo versionado vazaria, em miniatura,
   exatamente o que a trava existe para impedir.

   NOME DE CONTA fica de fora da conferência: `INTERNAS` e as regras que leem o
   extrato precisam dos nomes para funcionar sem configuração. É exposição de
   outra ordem (sem valor, sem contraparte, sem data) e está listada abaixo,
   à vista, em vez de escondida. */
if (publicar && temJulho) {
  const contas = new Set(julho.lancamentos.map(l => l.natureza));
  const amostras = [...new Set(julho.lancamentos.flatMap(l => [l.contraparte, l.descritivo, String(Math.abs(l.valor))]))]
    .filter(v => v && v.length > 6 && !contas.has(v));
  const vestigios = amostras.filter(v => html.includes(v));
  if (vestigios.length) {
    throw new Error('ABORTADO, nada foi gravado: dado do razão no arquivo de publicação: ' + vestigios.join(', '));
  }
}

const destino = path.join(DIR, 'dashboard.html');
fs.writeFileSync(destino, html, 'utf8');
console.log(`gravado ${destino} · ${Math.round(html.length / 1024)} KB`);
console.log(`${blocos.length} blocos de script · sintaxe ok`);
if (temJulho && !publicar) {
  console.log(`julho: ${julho.lancamentos.length} lançamentos · entradas ${ent.toFixed(2)} · saídas ${sai.toFixed(2)} · conciliação zero`);
}

if (publicar) {
  console.log('PUBLICAÇÃO: semente neutra · nenhum lançamento da FAM neste arquivo.');
  if (temJulho) {
    const contas = [...new Set(julho.lancamentos.map(l => l.natureza))].filter(n => html.includes(n));
    console.log(`nomes de conta que ficam no código (lógica do importador): ${contas.length}`);
  }
  console.log('Depois do deploy, carregue o julho real uma vez por "Restaurar de um arquivo".');
}

/* A pasta do Aldeir é onde o Marco e ele abrem o sistema. Se ela existir, a
   cópia de lá é atualizada junto: sem isso, duas versões diferentes convivem e
   ninguém sabe qual é a boa. */
const PASTA_ALDEIR = path.join(process.env.USERPROFILE || '', 'OneDrive - FAM Seguradora', 'Documents', 'Aldeir - Projeto Fluxo de Caixa');
// Publicando, a cópia do Aldeir NÃO é tocada: ela é a que tem os dados dele, e
// sobrescrevê-la com a semente neutra apagaria o trabalho do CFO.
if (!publicar && fs.existsSync(PASTA_ALDEIR)) {
  for (const arq of ['dashboard.html', 'extrato-exemplo-agosto.pdf', 'fam-financeiro.ico',
                     'Abrir Dashboard.cmd', 'Instalar FAM Financeiro.cmd']) {
    const origem = path.join(DIR, arq);
    if (fs.existsSync(origem)) fs.copyFileSync(origem, path.join(PASTA_ALDEIR, arq));
  }
  /* o instalador antigo tinha outro nome: deixar os dois la e garantir que
     alguem um dia roda o errado */
  const velho = path.join(PASTA_ALDEIR, 'Instalar no computador do CFO.cmd');
  if (fs.existsSync(velho)) fs.unlinkSync(velho);
  console.log('copiado tambem para a pasta do Aldeir');
}
