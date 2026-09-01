// ============================================================
//  CARGA DAS ANALISES DE CREDITO PARA O CRM  ·  passo 3 do tomador unico
//
//  A REGRA QUE MANDA EM TUDO, dada pelo Marco:
//    "Isso dara conflito, tem varios tomadores sem CNPJ, razao erradas, limites
//     divergentes. Isso NAO PODE TRAVAR, tem que ter um relatorio do que esta
//     errado e ajustarmos."
//
//  Entao: a carga NUNCA aborta. Toda analise ou entra, ou vira linha em
//  `analise_conflitos` com o motivo escrito. E ela NUNCA escreve em `tomadores`:
//  quem faz isso e a tela de conferencia, com a aprovacao dele em lote.
//
//  A segunda regra: nunca chutar numero. Sem certeza, fica nulo e vai para o
//  relatorio. Um numero plausivel sem prova e pior que um nulo.
//
//  COMO USAR
//    node scripts/carga-analises.mjs            ensaio: le tudo, NAO grava nada
//    node scripts/carga-analises.mjs --gravar   grava nas tabelas da analise
//    node scripts/carga-analises.mjs --limpar   apaga o que a carga gravou
//
//  DE ONDE VEM O DADO (medido em 30/08/2026, nao suposto)
//    · o resumo das 131: `normalizar.mjs` do proprio sistema de analises, que ja
//      classifica limite, rating e porte. Reuso, e nao parser novo: o parser
//      ingenuo que existia antes ja somou R$ 97 bilhoes de limite uma vez.
//    · o dado fundo (balanco, DRE, 3 C's): `_sistema/registro/json/<id>.json`,
//      que tem UMA COPIA POR ANALISE, as 131. O caminho gravado no indice
//      (`onde`) esta velho em 117 dos 131 casos, porque a analise renomeia a
//      pasta depois; por isso a copia do registro e a fonte, e nao a pasta.
//    · a copia tem DOIS vocabularios: `revisada` (110, chaves curtas do template)
//      e `gerada` (84, chaves longas). A revisada MANDA quando existe, que e a
//      regra do sistema: so a versao que ele salvou vale.
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { acervo } from 'file:///C:/Users/MarcoDragoneFAMSEGUR/OneDrive%20-%20FAM%20Seguradora/Documents/Analises%20FAM/_sistema/normalizar.mjs'

const RAIZ_ANALISES = path.join('C:', 'Users', 'MarcoDragoneFAMSEGUR',
  'OneDrive - FAM Seguradora', 'Documents', 'Analises FAM')
const COPIAS = path.join(RAIZ_ANALISES, '_sistema', 'registro', 'json')

/* PUBLICAR UMA SO (31/08/2026), para o botao Finalizar Analise.
   Sem isto o botao teria de reprocessar as 137 analises a cada clique: leitura
   de disco, normalizacao e upsert de tudo, para publicar uma. Com o filtro, o
   clique mexe so na analise que ele acabou de terminar.
   Seguro em modo `gravar`: o unico ponto que APAGA em massa (os conflitos
   abertos) mora no `--limpar`, e a gravacao e toda por upsert. */
const iSo = process.argv.indexOf('--so')
const SO = iSo > -1 ? String(process.argv[iSo + 1] || '').trim() : ''

const MODO = process.argv.includes('--gravar') ? 'gravar'
  : process.argv.includes('--limpar') ? 'limpar'
  : 'ensaio'

// ─────────────────────────────────────────────────────────────
// Ligacao com o banco
// ─────────────────────────────────────────────────────────────
function lerEnv() {
  const arq = path.join(process.cwd(), '.env.local')
  const txt = fs.readFileSync(arq, 'utf8')
  const env = {}
  for (const linha of txt.split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

function conectar() {
  const env = lerEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─────────────────────────────────────────────────────────────
// Leitura de numero, com a regra de nunca chutar
// ─────────────────────────────────────────────────────────────
const semTags = (v) => String(v ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

const VAZIO = /^(n\/?d|n\/?a|nao informado|não informado|-{1,3}|—|–|s\/d)$/i

/**
 * Numero em pt-BR, com sinal. Devolve null quando NAO da para ter certeza.
 *
 * O sinal e tratado aqui de proposito: o `valorEmReais` do sistema de analises
 * captura so os digitos, entao um lucro liquido de "-50.039" voltaria +50.039 e
 * o prejuizo viraria lucro em tela. Este e o unico ponto em que nao reuso o
 * parser de la, e a diferenca esta coberta por teste.
 */
export function numeroBR(v) {
  const t = semTags(v)
  if (!t || VAZIO.test(t)) return null
  const negativo = /^\(.*\)$/.test(t) || /^\s*[-−]/.test(t)
  const m = t.match(/(\d{1,3}(?:\.\d{3})+,\d{1,4}|\d{1,3}(?:\.\d{3})+|\d+,\d{1,4}|\d+(?:\.\d+)?)/)
  if (!m) return null
  let cru = m[1]
  if (/\.\d{3}(\D|$)/.test(cru)) cru = cru.replace(/\./g, '')   // ponto de milhar
  cru = cru.replace(',', '.')
  const n = parseFloat(cru)
  if (!Number.isFinite(n)) return null
  return negativo ? -n : n
}

/** Taxa "2,23%" -> 2.23. "-" ou vazio -> null. Nunca zero por engano. */
export function taxaPct(v) {
  const t = semTags(v)
  if (!t || VAZIO.test(t)) return null
  const n = numeroBR(t.replace('%', ''))
  if (n === null) return null
  if (n < 0 || n > 100) return null   // fora de faixa e dado torto, nao taxa
  return n
}

/** So os digitos. 14 posicoes exatas, ou null. Nunca "o primeiro que aparecer". */
export const cnpjLimpo = (v) => {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length === 14 ? d : null
}

/** Todos os CNPJs que aparecem num texto: viram CANDIDATOS, nunca escolha. */
export function cnpjsNoTexto(v) {
  const t = String(v ?? '')
  const achados = t.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) ?? []
  return [...new Set(achados.map(c => c.replace(/\D/g, '')).filter(c => c.length === 14))]
}

/**
 * A celula do balanco traz a escala escrita DENTRO dela ("R$ 12,5 milhoes")?
 *
 * Se traz, o numero e ambiguo: a escala do campo `unidade` valeria em cima de um
 * valor que ja esta na sua propria escala, e o erro seria de mil ou de um milhao
 * de vezes. Medido em 30/08/2026: NENHUMA das 131 copias tem isso nos 14 campos
 * numericos (so nos campos de observacao, que a carga nao le). E uma trava para
 * o futuro, e ela devolve nulo em vez de adivinhar.
 */
export const temEscalaEscrita = (v) =>
  /\b(mil|milhar|milhares|milh[õo]es|milh[ãa]o|bilh|MM)\b/i.test(semTags(v))

/**
 * A ESCALA em que o balanco foi escrito. Achado da auditoria de 30/08/2026:
 * 140 das 262 linhas financeiras NAO estavam em reais (138 em milhares, 2 em
 * milhoes), e isso vivia so como texto livre. A Amper tinha PL de 865,10 no
 * banco para um patrimonio de R$ 865,1 MILHOES.
 *
 * A ORDEM DOS TESTES E O PONTO: "milhares" comeca com "milh", entao testar
 * /milh/ primeiro transformaria milhar em milhao, com erro de mil vezes. Por
 * isso `milhoes` e testado pela forma completa, e `milhar` vem antes de `reais`.
 *
 * Devolve null quando nao da para ler: nesse caso os numeros ficam nulos e a
 * analise vira linha de relatorio. Nunca chutar.
 */
export function escalaDaUnidade(v) {
  const t = semTags(v)
  if (!t) return null
  if (/milh[õo]e?s?|milh[ãa]o|\bMM\b/i.test(t)) return 1000000
  if (/\bmil\b|milhar|milhares/i.test(t)) return 1000
  if (/reais|^\s*R\$/i.test(t)) return 1
  return null
}

/**
 * O MESMO LIMITE, LIDO POR OUTRO LEITOR. Existe para CONFERIR, nao para mandar.
 *
 * Achado da segunda auditoria, e e um irmao do caso da Conata. O
 * `valorEmReais` do sistema de analises nao entende escala ABREVIADA colada num
 * decimal com ponto: em `"R$ 80.0 milhoes"` ele captura so o `"80"`, sobra
 * `".0 milhoes"`, e o teste de escala dele exige que o resto COMECE com "milh".
 * Nao comeca, entao o limite virou **R$ 80,00** com o selo de `efetivo`, que
 * quer dizer "confiavel". Tres analises vigentes estavam assim:
 *
 *   Construtora Metropolitana  "R$ 80.0 milhoes"   -> 80,00
 *   Usina Termeletrica Pampa Sul "R$ 80.0 milhoes" -> 80,00
 *   Amper                      "...os R$ 90M..."   -> 90,00
 *
 * Este leitor entende `milhoes`, `MM`, `M` e `bi`. Ele NAO substitui o numero do
 * sistema: os dois sao comparados, e **quando discordam o numero fica nulo e a
 * analise vai para o relatorio**. Conferir e seguro; escolher sozinho nao seria.
 */
export function valorComEscala(texto) {
  const t = semTags(texto)
  if (!t) return null
  const m = t.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d+)?)/)
  if (!m) return null
  let cru = m[1]
  if (/\.\d{3}/.test(cru)) cru = cru.replace(/\./g, '')   // ponto de milhar
  cru = cru.replace(',', '.')
  let n = parseFloat(cru)
  if (!Number.isFinite(n)) return null
  // A janela e curta de proposito: 24 caracteres. Maior que isso capturaria o
  // "milhoes" de outra frase mais adiante no mesmo campo.
  const depois = t.slice(m.index + m[1].length, m.index + m[1].length + 24)
  if (/^\s*(bilh|bi\b)/i.test(depois)) n *= 1e9
  else if (/^\s*(milh[õo]|milh[ãa]o|mm\b|mi\b|m\b)/i.test(depois)) n *= 1e6
  else if (/^\s*mil\b/i.test(depois)) n *= 1e3
  return n
}

/**
 * O TETO DO CONTRATO AUTOMATICO DE RESSEGURO, POR TOMADOR.
 *
 * NAO e regra minha: e regra do acervo, e foi medida antes de virar codigo.
 * Das 120 analises vigentes, **44 citam este teto no proprio texto** ("Limite
 * FAM: R$ 80 milhoes por tomador", "teto do contrato automatico de resseguro"),
 * **20 param exatamente em R$ 80.000.000,00**, e o maior valor abaixo do teto e
 * exatamente 80 milhoes. So tres passavam dele, e os tres eram erro de leitura.
 *
 * O limite APROVADO pelo comite pode passar disto (e decisao dele, e ha
 * tomadores no CRM com 200 milhoes). O limite RECOMENDADO pela analise, nao.
 */
export const TETO_POR_TOMADOR = 80000000

/**
 * O NUMERO PASSA O TETO? Terceira familia de dinheiro errado, achada na 3a
 * auditoria, e a unica que ja estava visivel numa ficha de tomador real.
 *
 * A **Conasa Infraestrutura** aparecia com **R$ 727.192.500,00** de limite
 * recomendado. O texto e:
 *   "R$ 727.192.500,00 (75% do PL consolidado) - Limite FAM: R$ 80 milhoes por
 *    tomador. R$ 54.529.338,26 (importancia segurada pretendida)"
 * Ou seja: a frase traz TRES numeros e o parser pegou o primeiro, que e a conta
 * de capacidade teorica, e nao o limite. Os outros dois casos:
 *   Castilho Engenharia    R$ 242.795.271,83  ("Limite calculado... 67,5% do PL")
 *   Cia Aguas de Itapema   R$  81.250.000,00  ("R$ 81,25MM - Limite FAM: R$ 80 milhoes")
 *
 * Um numero acima do teto NAO PODE ser o limite recomendado deste tomador.
 * Entao ele nao vira limite: fica nulo e vai para o relatorio, com o texto
 * inteiro do lado, para o Marco ler e dizer qual dos numeros vale.
 */
export const limiteAcimaDoTeto = (numero) =>
  numero !== null && numero > TETO_POR_TOMADOR

/**
 * O TEXTO DO LIMITE DESMENTE O NUMERO?
 *
 * Achado de 30/08/2026, e o motivo desta funcao existir. A **Conata Engenharia**
 * escreveu *"Nenhum limite concedido: Tomador bloqueado nesta data; Exposicao
 * zero ate reanalise"* e o numero extraido foi **R$ 2.026,00**: o parser pegou o
 * ANO 2026 de dentro da frase e o serviu como limite de credito. Isso e numero
 * inventado, e ia direto para a ficha do tomador.
 *
 * Outros dois casos reais, menos grotescos e igualmente enganosos:
 *   BRNPAR:  "Limite tecnico de R$ 142.337.044,20 (60% do PL), porem
 *             recomenda-se operar com teto de R$ 80.000.000,00"
 *   CP Construplan: "BLOQUEADO  Limite tecnico calculado: R$ 95.455.962,28..."
 *
 * Devolve o motivo quando o texto nega ou condiciona o numero. Nesse caso o
 * numero fica NULO e a analise vai para o relatorio: sem certeza, nulo.
 *
 * O zero e poupado de proposito: "R$ 0,00 (credito nao recomendado)" e um texto
 * que CONCORDA com o numero, e zero ali e informacao, nao ruido.
 */
export function limiteDesmentido(texto, numero) {
  if (numero === null || numero === 0) return null
  const t = semTags(texto)
  if (!t) return null
  if (/nenhum limite|sem limite|exposi[çc][ãa]o zero/i.test(t))
    return 'o texto diz que NAO ha limite concedido'
  if (/bloquead|n[ãa]o aprovad|reprovad|n[ãa]o recomend|suspens[ãa]o/i.test(t))
    return 'o texto diz que o tomador esta bloqueado ou reprovado'
  if (/limite t[ée]cnico|referencial|recomenda-se operar|sujeito [àa]s? condi[çc][õo]es/i.test(t))
    return 'o texto apresenta o numero como tecnico ou condicionado, e nao como limite a usar'
  return null
}

/** Data "2026-08-28" (o campo `ordem`), que e ISO. O `data_analise` e dd/mm/aaaa. */
function dataISO(a) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(a.ordem ?? ''))) return a.ordem
  const m = String(a.data_analise ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** Razao social comparavel: sem acento, sem pontuacao, sem enfeite juridico. */
const RUIDO = /\b(LTDA|EIRELI|EPP|ME|SA|S\/A|S A|MEI|SPE|CIA|COMPANHIA|DO BRASIL)\b/g
export function razaoComparavel(v) {
  return semTags(v).toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,/\\'"()\-–—&]/g, ' ')
    .replace(RUIDO, ' ')
    .replace(/\s+/g, ' ').trim()
}

/**
 * A razao da analise nomeia MAIS DE UMA empresa? Acontece de verdade:
 * "WDS PRIME ALFREDO PUJOL (tomadora) NELLI INCORPORACOES LTDA (holding)".
 * Uma string dessas NAO pode virar sugestao de nome numa aprovacao em lote: ele
 * aprovaria 17 de uma vez e duas empresas virariam uma. Ela ainda entra no
 * relatorio, mas SEM sugestao: ele le e resolve a mao.
 */
export function nomeiaMaisDeUma(v) {
  const t = semTags(v)
  if (/\((tomadora?|holding|garantidora|controladora|spe|fiadora|matriz|consorciada)\)/i.test(t)) return true
  const sufixos = t.match(/\b(LTDA|S\/A|S\.A|EIRELI)\b/gi) ?? []
  return sufixos.length > 1
}

/**
 * Dois nomes que PROVAVELMENTE sao a mesma empresa, para propor o par. Nunca
 * aplica nada: devolve o motivo da proposta, para ele julgar em vez de confiar.
 * Casa por igualdade e tambem quando um nome e o comeco do outro, porque o CRM
 * corta nome ("Qualieng Engenharia" x "QUALIENG ENGENHARIA DE MONTAGENS LTDA").
 */
export function mesmoNome(a, b) {
  const A = razaoComparavel(a), B = razaoComparavel(b)
  if (!A || !B || A.length < 8 || B.length < 8) return null
  if (A === B) return 'nome identico'
  const [curto, longo] = A.length <= B.length ? [A, B] : [B, A]
  if (curto.length >= 12 && longo.startsWith(curto)) return 'um nome e o comeco do outro (o CRM costuma cortar o nome)'
  return null
}

// ─────────────────────────────────────────────────────────────
// A copia funda de cada analise
// ─────────────────────────────────────────────────────────────
/**
 * Le `registro/json/<id>.json` e devolve { rev, ger, erro }.
 * NUNCA lanca: arquivo faltando ou ilegivel vira `erro`, que vai para o
 * relatorio. Uma analise sem copia ainda entra no banco com o resumo.
 */
function copiaFunda(id) {
  const p = path.join(COPIAS, id + '.json')
  try {
    if (!fs.existsSync(p)) return { rev: null, ger: null, erro: 'copia nao encontrada em registro/json' }
    const j = JSON.parse(fs.readFileSync(p, 'utf8'))
    const rev = j?.revisada?.state ?? j?.revisada ?? null
    const ger = j?.gerada ?? null
    return {
      rev: rev && typeof rev === 'object' && Object.keys(rev).length > 5 ? rev : null,
      ger: ger && typeof ger === 'object' ? ger : null,
      erro: null,
    }
  } catch (e) {
    return { rev: null, ger: null, erro: 'copia ilegivel: ' + e.message }
  }
}

/** Pontos: array na versao gerada, HTML na revisada. Sai sempre array de texto. */
function pontos(rev, ger, qual) {
  const arr = qual === 'positivos' ? ger?.pontos_positivos : ger?.pontos_atencao
  if (Array.isArray(arr) && arr.length) return arr.map(s => semTags(s)).filter(Boolean)
  const html = qual === 'positivos' ? rev?.ppHtml : rev?.paHtml
  if (typeof html === 'string' && html.trim()) {
    const itens = html.split(/<\/li>|<br\s*\/?>|<\/p>/i).map(s => semTags(s)).filter(Boolean)
    if (itens.length) return itens
  }
  return null
}

/** Os 3 C's: `tres_cs` na gerada, `cs` na revisada. Guardado como veio. */
function tresCs(rev, ger) {
  const c = ger?.tres_cs ?? rev?.cs ?? null
  return c && typeof c === 'object' && Object.keys(c).length ? c : null
}

/**
 * Os exercicios. `balanco` e `dre` usam as MESMAS chaves nos dois vocabularios
 * (`pl_a1`, `rol_a2`…), o que foi conferido nas 131 copias. `ano1`/`ano2` dao os
 * rotulos; quando o rotulo nao e um ano, ele fica no `rotulo` e `exercicio` vai
 * nulo (existe balancete de 31/03/2026).
 */
function exercicios(rev, ger) {
  const d = rev ?? ger
  if (!d) return []
  const bal = d.balanco ?? {}
  const dre = d.dre ?? {}
  const cx = ger?.caixa_estoque ?? d.caixa_estoque ?? {}
  const base = semTags(d.base_demonstracoes ?? d.baseDemonstracoes ?? '') || null
  const unidade = semTags(d.unidade ?? 'R$') || 'R$'
  // A escala manda no numero. Quando ela nao sai do texto, os numeros ficam
  // nulos e quem chamou reporta: e a mesma regra do limite, aplicada ao balanco.
  const escala = escalaDaUnidade(unidade)

  const linhas = []
  for (const [suf, rotuloCru] of [['a1', d.ano1], ['a2', d.ano2]]) {
    const rotulo = semTags(rotuloCru)
    if (!rotulo) continue
    const ano = (String(rotulo).match(/(19|20)\d{2}/) ?? [null])[0]
    // Ja em REAIS. O texto do analista continua em `unidade`, e `escala` diz
    // por quanto foi multiplicado, para a conta ser auditavel depois.
    const v = (obj, k) => {
      const cru = obj?.[k + '_' + suf]
      // Celula com a escala escrita dentro dela e ambigua: multiplicar pela
      // escala do campo `unidade` erraria por mil ou por um milhao.
      if (temEscalaEscrita(cru)) return null
      const n = numeroBR(cru)
      return n === null || escala === null ? null : n * escala
    }
    const linha = {
      rotulo,
      exercicio: ano ? Number(ano) : null,
      base,
      unidade,          // inteiro, sem cortar: cortar em 120 ja truncou uma explicacao no meio
      escala,
      ativo_total: v(bal, 'ativo_total'),
      ativo_circulante: v(bal, 'ativo_circulante'),
      ativo_nao_circulante: v(bal, 'ativo_nao_circulante'),
      realizavel_lp: v(bal, 'realizavel_lp'),
      passivo_circulante: v(bal, 'passivo_circulante'),
      passivo_nao_circulante: v(bal, 'passivo_nao_circulante'),
      exigivel_total: v(bal, 'exigivel_total'),
      patrimonio_liquido: v(bal, 'pl'),
      receita_operacional: v(dre, 'rol'),
      receita_liquida: v(dre, 'rl'),
      ebitda: v(dre, 'ebitda'),
      lucro_liquido: v(dre, 'll'),
      caixa: v(cx, 'caixa'),
      estoques: v(cx, 'estoques'),
    }
    // Linha sem NENHUM numero nao serve para nada e so suja a tabela.
    // `escala` entra na lista de fora senao uma linha com escala lida e zero
    // numeros seria guardada como se tivesse conteudo.
    const temAlgo = Object.entries(linha).some(([k, x]) =>
      !['rotulo', 'exercicio', 'base', 'unidade', 'escala'].includes(k) && x !== null)
    if (temAlgo) linhas.push(linha)
  }
  return linhas
}

// ─────────────────────────────────────────────────────────────
// Montagem de uma analise
// ─────────────────────────────────────────────────────────────
function montar(a, avisos) {
  const { rev, ger, erro } = copiaFunda(a.id)
  if (erro) avisos.push({ id: a.id, razao: a.razao_social, aviso: erro })

  const cnpj = cnpjLimpo(a.cnpj)
  const candidatos = cnpj ? [] : cnpjsNoTexto(a.cnpj)
  const data = dataISO(a)

  // limite: SO `efetivo` e `zero` viram numero confiavel. `teorico` e `teto` tem
  // numero no texto, mas nao sao limite do tomador, e somar isso e o erro caro.
  const tipoRec = a.limite_recomendado_tipo || 'vazio'
  let numRec = (tipoRec === 'efetivo' || tipoRec === 'zero') ? a.limite_recomendado_num : null
  const tipoRs = a.limite_tipo || 'vazio'
  let numRs = (tipoRs === 'efetivo' || tipoRs === 'zero') ? a.limite_num : null

  // A ULTIMA TRAVA, e a que pegou a Conata: mesmo classificado como `efetivo`,
  // o numero cai fora quando o proprio texto o desmente. Ver `limiteDesmentido`.
  const desmenteRec = limiteDesmentido(a.limite_recomendado, numRec)
  if (desmenteRec) numRec = null
  if (limiteDesmentido(a.limite_rs, numRs)) numRs = null

  // DOIS LEITORES TEM QUE CONCORDAR. Quando discordam, o numero cai fora: nao
  // da para saber qual dos dois esta certo, e um limite errado com selo de
  // confiavel e pior que um campo vazio. Ver `valorComEscala`.
  const conferir = (num, texto) => {
    if (num === null || num === 0) return null
    const meu = valorComEscala(texto)
    if (meu === null) return null
    const maior = Math.max(Math.abs(meu), Math.abs(num))
    if (maior === 0) return null
    if (Math.abs(meu - num) / maior <= 0.01) return null      // concordam
    return { deles: num, meu }
  }
  const discordaRec = conferir(numRec, a.limite_recomendado)
  if (discordaRec) numRec = null
  if (conferir(numRs, a.limite_rs)) numRs = null

  // A TERCEIRA TRAVA: acima do teto de resseguro nao e limite deste tomador.
  // Pegou a Conasa, que estava com R$ 727 milhoes na ficha. Ver `limiteAcimaDoTeto`.
  const acimaDoTeto = limiteAcimaDoTeto(numRec) ? numRec : null
  if (acimaDoTeto !== null) numRec = null
  if (limiteAcimaDoTeto(numRs)) numRs = null

  return {
    linha: {
      chave_local: a.id,
      cnpj,
      cnpj_texto: semTags(a.cnpj) || null,
      razao_social: semTags(a.razao_social) || '(sem razao social)',
      nome_curto: semTags(a.nome_curto) || null,
      razao_original: semTags(a.razao_original) || null,
      corretora: semTags(a.corretora_canonica || a.corretora) || null,
      grupo: semTags(a.grupo) || null,
      segmento: semTags(a.segmento) || null,
      setor: a.setor || null,
      data_analise: data,
      score_final: Number.isFinite(Number(a.score_final)) && String(a.score_final ?? '') !== '' ? Number(a.score_final) : null,
      classe: semTags(a.classe) || null,
      porte: semTags(a.porte) || null,
      porte_cod: a.porte_canonico || null,
      rating_txt: semTags(a.rating) || null,
      rating_cod: a.rating_principal || null,
      rating_numero: Number.isInteger(Number(a.rating_numero)) && String(a.rating_numero ?? '') !== '' ? Number(a.rating_numero) : null,
      nivel_risco: semTags(a.nivel_risco) || null,
      nivel_cod: a.nivel_canonico || null,
      recomendacao: semTags(a.recomendacao) || null,
      decisao_cod: a.decisao_canonica || null,
      limite_recomendado_txt: semTags(a.limite_recomendado) || null,
      limite_recomendado_num: numRec,
      limite_recomendado_tipo: tipoRec,
      // O MOTIVO VIAJA COM O DADO. Sem esta coluna a ficha do tomador nao tem
      // como saber que o numero foi anulado, cai no texto cru e mostra de novo
      // o valor que a trava tirou. Foi o que aconteceu com a Conasa.
      limite_recomendado_motivo:
        desmenteRec ? `O texto desmente o numero: ${desmenteRec}.`
          : discordaRec ? `Dois leitores tiraram valores diferentes do mesmo texto (${brl(discordaRec.deles)} e ${brl(discordaRec.meu)}), quase sempre por escala abreviada.`
            : acimaDoTeto !== null ? `O numero lido (${brl(acimaDoTeto)}) passa o teto de ${brl(TETO_POR_TOMADOR)} por tomador do contrato de resseguro, entao nao pode ser o limite.`
              : null,
      limite_rs_txt: semTags(a.limite_rs) || null,
      limite_rs_num: numRs,
      limite_rs_tipo: tipoRs,
      taxa_tradicional: taxaPct(a.taxa_tradicional),
      taxa_judicial: taxaPct(a.taxa_judicial),
      taxa_estruturada: taxaPct(a.taxa_estruturada),
      condicoes: semTags(a.condicoes) || null,
      conclusao: semTags(a.conclusao) || null,
      tres_cs: tresCs(rev, ger),
      pontos_positivos: pontos(rev, ger, 'positivos'),
      pontos_atencao: pontos(rev, ger, 'atencao'),
      revisada: !!a.revisada || a.fonte === 'revisada',
      revisado_em: a.revisado_em || null,
      fonte: a.fonte || null,
      correcoes: a.correcoes && Object.keys(a.correcoes).length ? a.correcoes : null,
      pasta: a.pasta || null,
      arquivo: a.arquivo || null,
      onde: a.onde || null,
      registrado_em: a.registrado_em || null,
      publicado_por: 'carga-analises.mjs',
    },
    exercicios: exercicios(rev, ger),
    candidatos,
    // Quando a escala do balanco nao pode ser lida, os numeros ficaram nulos e
    // isso PRECISA aparecer no relatorio: silencio aqui seria um balanco vazio
    // sem ninguem saber por que.
    // por que o numero do limite caiu fora, quando caiu
    limiteDesmentidoPor: desmenteRec,
    limiteDiscordante: discordaRec,
    limiteAcimaDoTeto: acimaDoTeto,
    escalaIlegivel: (() => {
      const d = rev ?? ger
      const u = semTags(d?.unidade ?? '')
      return u && escalaDaUnidade(u) === null ? u.slice(0, 80) : null
    })(),
  }
}

// ─────────────────────────────────────────────────────────────
// O relatorio de conflitos
// ─────────────────────────────────────────────────────────────
const brl = (n) => n === null || n === undefined ? '(vazio)'
  : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function conflitos(montadas, tomadores) {
  const porCnpj = new Map()
  for (const t of tomadores) {
    const c = cnpjLimpo(t.cnpj)
    if (c) porCnpj.set(c, t)
  }
  // indice por razao comparavel, para propor par a quem esta sem CNPJ
  const analisePorRazao = new Map()
  for (const m of montadas) {
    if (!m.linha.cnpj) continue
    const k = razaoComparavel(m.linha.razao_original || m.linha.razao_social)
    if (k) analisePorRazao.set(k, m)
  }

  const saida = []
  const juntar = (o) => saida.push(o)

  for (const m of montadas) {
    const L = m.linha
    const t = L.cnpj ? porCnpj.get(L.cnpj) : null

    // ── qualidade do proprio dado: vale para TODA versao ────────────────
    // Fica antes do filtro de vigencia de proposito. Isto nao e comparacao com
    // o CRM: e defeito da analise em si, e uma versao anterior com o dado torto
    // continua sendo dado torto no banco.
    const fora = []
    if (L.score_final === null) fora.push('sem Score')
    else if (L.score_final > 10) fora.push(`Score ${String(L.score_final).replace('.', ',')} acima de 10`)
    if (L.rating_txt && !L.rating_cod) fora.push('rating sem codigo unico')
    if (!L.rating_txt) fora.push('sem rating')
    if (L.taxa_tradicional === null) fora.push('sem taxa tradicional')
    if (!L.data_analise) fora.push('sem data legivel')
    if (m.escalaIlegivel) fora.push(`escala do balanco ilegivel ("${m.escalaIlegivel}"), entao os numeros do balanco ficaram nulos`)
    if (fora.length) {
      juntar({
        tipo: 'dado_fora_do_padrao', chave_local: L.chave_local, tomador_id: t?.id ?? null, campo: 'resultado',
        valor_crm: null, valor_analise: fora.join(' · '),
        sugestao: null, candidatos: null,
        motivo: 'Dado que nao encaixa no padrao do acervo. Nao impede a carga; e para voce olhar.',
      })
    }

    // ── duplicata: duas analises da mesma empresa no mesmo dia ──────────
    if (m.duplicataDe) {
      juntar({
        tipo: 'dado_fora_do_padrao', chave_local: L.chave_local, tomador_id: t?.id ?? null, campo: 'duplicata',
        valor_crm: null, valor_analise: `${L.chave_local} e ${m.duplicataDe}`,
        sugestao: null, candidatos: null,
        motivo: `Duas analises da MESMA empresa na MESMA data, sem CNPJ unico para separar. A carga marcou uma como vigente para nao mostrar a mesma empresa duas vezes, mas quem diz qual vale e voce. Confira as duas antes de usar os numeros.`,
      })
    }

    // A comparacao com o CRM so vale para a analise VIGENTE. Sem isto, a Bracon
    // (que tem 2 versoes) pedia a MESMA aprovacao de nome duas vezes, e ele
    // decidiria o mesmo caso duas vezes numa tela de aprovacao em lote.
    // A versao antiga entra no banco normalmente, so nao pergunta nada.
    if (!L.vigente) continue

    // 1. sem chave
    if (!L.cnpj) {
      juntar({
        tipo: 'sem_chave', chave_local: L.chave_local, tomador_id: null, campo: 'cnpj',
        valor_crm: null, valor_analise: L.cnpj_texto,
        sugestao: null, candidatos: m.candidatos.length ? m.candidatos : null,
        motivo: m.candidatos.length
          ? `A analise cita ${m.candidatos.length} CNPJs no mesmo campo (consorcio, holding ou grupo). Escolha qual e o tomador: a carga nao escolhe por voce.`
          : 'A analise nao tem CNPJ no Brasil. Aponte o tomador a mao, ou deixe sem par.',
      })
    } else if (!t) {
      juntar({
        tipo: 'sem_chave', chave_local: L.chave_local, tomador_id: null, campo: 'cnpj',
        valor_crm: null, valor_analise: L.cnpj,
        sugestao: null, candidatos: null,
        motivo: `CNPJ analisado que nao existe em tomadores. Ou o tomador ainda nao foi cadastrado, ou esta cadastrado sem CNPJ.`,
      })
    }

    // 2. razao divergente
    if (t) {
      const nomeAnalise = L.razao_original || L.razao_social
      const A = razaoComparavel(nomeAnalise)
      const C = razaoComparavel(t.razao_social)
      if (A && C && A !== C) {
        const duas = nomeiaMaisDeUma(nomeAnalise)
        juntar({
          tipo: 'razao_divergente', chave_local: L.chave_local, tomador_id: t.id, campo: 'razao_social',
          valor_crm: t.razao_social, valor_analise: nomeAnalise,
          // sugestao NULA quando o texto da analise nomeia duas empresas: aprovar
          // isso em lote juntaria tomadora e holding num cadastro so.
          sugestao: duas ? null : nomeAnalise,
          candidatos: null,
          motivo: duas
            ? 'O campo da analise nomeia MAIS DE UMA empresa (tomadora e holding, por exemplo). Nao ha sugestao de proposito: aprovar isso em lote juntaria duas empresas num cadastro so. Escreva o nome certo a mao.'
            : 'A analise apurou o nome no contrato social; a triagem so chutou. Trocar so com a sua aprovacao.',
        })
      }
    }

    // 3. limite
    if (L.limite_recomendado_num !== null && t) {
      const ap = t.limite_aprovado === null || t.limite_aprovado === undefined ? null : Number(t.limite_aprovado)
      const rec = L.limite_recomendado_num

      // OS DOIS JA CONCORDAM: nao e conflito, e nao pode ocupar a fila.
      // Sem esta linha, 7 das 10 propostas de limite eram "trocar 0,00 por 0",
      // que nao muda nada. Fila com item inutil ensina a aprovar sem ler, e e
      // isso que faz a aprovacao em lote virar risco.
      const jaConcordam = ap !== null && Math.abs(ap - rec) <= 0.01
      const semLimiteDosDoisLados = ap === null && rec === 0

      if (jaConcordam || semLimiteDosDoisLados) {
        // nada a decidir
      } else if (ap === null || ap === 0) {
        juntar({
          tipo: 'limite_divergente', chave_local: L.chave_local, tomador_id: t.id, campo: 'limite_aprovado',
          valor_crm: ap === null ? '(sem limite)' : brl(0), valor_analise: brl(rec),
          sugestao: String(rec), candidatos: null,
          motivo: 'O CRM nao tem limite aprovado e a analise recomenda um. Recomendado nao vira aprovado sozinho: quem aprova e o comite.',
        })
      } else if (Math.abs(ap - L.limite_recomendado_num) > 0.01) {
        juntar({
          tipo: 'limite_divergente', chave_local: L.chave_local, tomador_id: t.id, campo: 'limite_aprovado',
          valor_crm: brl(ap), valor_analise: brl(L.limite_recomendado_num),
          sugestao: null, candidatos: null,
          motivo: ap > L.limite_recomendado_num
            ? 'O limite aprovado e MAIOR que o recomendado pela analise. Pode ser decisao de comite, que ganha do recomendado. Confira.'
            : 'O limite aprovado e menor que o recomendado. Pode ser corte deliberado. Confira.',
        })
      }
    }

    // 4c. o numero passa o teto de resseguro (a Conasa, a Castilho, a Itapema)
    if (m.limiteAcimaDoTeto !== null && m.limiteAcimaDoTeto !== undefined) {
      juntar({
        tipo: 'limite_incerto', chave_local: L.chave_local, tomador_id: t?.id ?? null, campo: 'limite_acima_do_teto',
        valor_crm: t ? brl(t.limite_aprovado === null ? null : Number(t.limite_aprovado)) : null,
        valor_analise: `${brl(m.limiteAcimaDoTeto)} · ${L.limite_recomendado_txt}`,
        sugestao: null, candidatos: null,
        motivo: `O numero lido (${brl(m.limiteAcimaDoTeto)}) passa o teto de ${brl(TETO_POR_TOMADOR)} por tomador do contrato automatico de resseguro, entao ele nao pode ser o limite recomendado. Quase sempre e a capacidade teorica (uma porcentagem do PL) que estava na mesma frase que o limite de verdade. O numero foi ANULADO: leia o texto e diga qual dos valores vale.`,
      })
    }

    // 4b. os dois leitores discordaram do valor (a Pampa Sul, a Amper)
    if (m.limiteDiscordante) {
      juntar({
        tipo: 'limite_incerto', chave_local: L.chave_local, tomador_id: t?.id ?? null, campo: 'limite_discordante',
        valor_crm: t ? brl(t.limite_aprovado === null ? null : Number(t.limite_aprovado)) : null,
        valor_analise: `${L.limite_recomendado_txt} · um leitor entendeu ${brl(m.limiteDiscordante.deles)}, o outro ${brl(m.limiteDiscordante.meu)}`,
        sugestao: null, candidatos: null,
        motivo: 'Dois leitores independentes tiraram valores diferentes do mesmo texto, quase sempre por escala abreviada ("80.0 milhoes", "R$ 90M"). O numero foi ANULADO: nao da para saber qual esta certo, e limite errado com selo de confiavel e pior que campo vazio. Leia o texto e diga o valor.',
      })
    }

    // 4a. o texto desmentiu o numero (a Conata, a BRNPAR, a CP Construplan)
    if (m.limiteDesmentidoPor) {
      juntar({
        tipo: 'limite_incerto', chave_local: L.chave_local, tomador_id: t?.id ?? null, campo: 'limite_desmentido',
        valor_crm: t ? brl(t.limite_aprovado === null ? null : Number(t.limite_aprovado)) : null,
        valor_analise: L.limite_recomendado_txt,
        sugestao: null, candidatos: null,
        motivo: `Havia um numero neste campo, mas ${m.limiteDesmentidoPor}. O numero foi ANULADO de proposito, para nao aparecer como limite recomendado na ficha do tomador. Leia o texto e decida.`,
      })
    }

    // 4. limite incerto
    if (L.limite_recomendado_tipo && !['efetivo', 'zero'].includes(L.limite_recomendado_tipo)) {
      const porque = {
        teorico: 'A propria analise escreveu que o numero e TEORICO. Nao e limite concedido.',
        teto: 'O numero e o TETO OPERACIONAL da FAM, e nao a capacidade do tomador.',
        sem_limite: 'A analise decidiu por extenso que nao ha limite. Nao e campo faltando: e decisao.',
        vazio: 'O campo nao tem numero que de para ler com seguranca.',
      }[L.limite_recomendado_tipo] ?? 'Tipo de limite sem numero confiavel.'
      juntar({
        tipo: 'limite_incerto', chave_local: L.chave_local, tomador_id: t?.id ?? null, campo: 'limite_recomendado',
        valor_crm: t ? brl(t.limite_aprovado === null ? null : Number(t.limite_aprovado)) : null,
        valor_analise: L.limite_recomendado_txt,
        sugestao: null, candidatos: null,
        motivo: porque + ' Por isso o numero ficou NULO no banco, em vez de chutado.',
      })
    }

    // 5. status contraditorio
    if (t) {
      const d = L.decisao_cod || ''
      const s = String(t.status || '')
      const negou = d === 'Reprovar' || d === 'Bloqueio'
      const aprovou = d === 'Aprovar' || d === 'Aprovar com ressalvas'
      if (negou && !['Recusado', 'Perdido'].includes(s)) {
        juntar({
          tipo: 'status_contraditorio', chave_local: L.chave_local, tomador_id: t.id, campo: 'status',
          valor_crm: s, valor_analise: d, sugestao: null, candidatos: null,
          motivo: 'A analise negou e o CRM segue com o tomador em andamento. Status do tomador e status da operacao sao eixos diferentes; ninguem copia um do outro sem voce.',
        })
      } else if (aprovou && s === 'Recusado') {
        juntar({
          tipo: 'status_contraditorio', chave_local: L.chave_local, tomador_id: t.id, campo: 'status',
          valor_crm: s, valor_analise: d, sugestao: null, candidatos: null,
          motivo: 'O CRM marca Recusado e a analise aprovou. Pode ser recusa comercial, que nao e recusa de credito. Confira.',
        })
      }
    }

    // (o bloco de qualidade do dado subiu para antes do filtro de vigencia)
  }

  // 7. tomadores do CRM sem CNPJ, com par PROPOSTO pelo nome.
  //    A igualdade exata nao servia: achou zero em 213, porque o CRM tem
  //    "Yazebek" onde a analise tem "Yazbek" e corta nomes longos. Aqui a
  //    proposta e mais larga de proposito, e o motivo diz em que ela se apoia,
  //    para ele julgar caso a caso em vez de confiar no lote.
  const candidatasSemPar = [...analisePorRazao.values()]
  for (const t of tomadores) {
    if (cnpjLimpo(t.cnpj)) continue
    let par = null, base = null
    for (const m of candidatasSemPar) {
      const r = mesmoNome(t.razao_social, m.linha.razao_original || m.linha.razao_social)
      if (r) { par = m; base = r; break }
    }
    juntar({
      tipo: 'sem_chave', chave_local: par ? par.linha.chave_local : null, tomador_id: t.id, campo: 'cnpj_tomador',
      valor_crm: t.razao_social, valor_analise: par ? `${par.linha.razao_original || par.linha.razao_social} (${par.linha.cnpj})` : null,
      sugestao: par ? par.linha.cnpj : null,
      candidatos: null,
      motivo: par
        ? `Tomador sem CNPJ. Existe uma analise que parece ser a mesma empresa: ${base}. Confira o nome dos dois lados antes de aprovar; a carga so propoe.`
        : 'Tomador sem CNPJ e sem analise parecida. Precisa de pesquisa por fora (fase de saneamento).',
    })
  }

  return saida
}

// ─────────────────────────────────────────────────────────────
// Versao e vigencia: a ultima analise de cada CNPJ e a vigente
// ─────────────────────────────────────────────────────────────
/**
 * A chave que agrupa as versoes da mesma empresa.
 *
 * Quando ha CNPJ, e ele. Quando NAO ha, era o `chave_local` — e isso estava
 * errado: a SIG 12 esta duas vezes no acervo, com ids diferentes e o MESMO
 * `cnpj_texto`, mesmo score e a mesma conclusao. Como cada uma virava um grupo
 * de um, as duas ficavam vigentes, e o Marco recebia a mesma decisao duas vezes
 * numa tela de aprovacao em lote. Agrupando pelo texto do CNPJ elas viram uma
 * empresa so, com uma vigente e uma versao anterior.
 */
const chaveDeGrupo = (L) =>
  L.cnpj ? 'cnpj:' + L.cnpj
    : L.cnpj_texto ? 'txt:' + razaoComparavel(L.cnpj_texto)
      : 'so:' + L.chave_local

function versionar(montadas) {
  const grupos = new Map()
  for (const m of montadas) {
    const k = chaveDeGrupo(m.linha)
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(m)
  }
  for (const [, lista] of grupos) {
    // Desempate estavel: data, e depois a chave_local. Sem o segundo criterio,
    // duas analises do MESMO dia trocariam de vigente entre execucoes, e o
    // banco mudaria sozinho a cada carga.
    lista.sort((a, b) =>
      String(a.linha.data_analise ?? '').localeCompare(String(b.linha.data_analise ?? ''))
      || String(a.linha.chave_local).localeCompare(String(b.linha.chave_local)))
    lista.forEach((m, i) => {
      m.linha.versao = i + 1
      m.linha.vigente = i === lista.length - 1
      // Duas analises da mesma empresa no MESMO dia nao e versao: e duplicata.
      // Quem decide qual vale e ele, nao a carga.
      if (i < lista.length - 1
        && m.linha.data_analise === lista[lista.length - 1].linha.data_analise) {
        m.duplicataDe = lista[lista.length - 1].linha.chave_local
      }
    })
  }
}

// ─────────────────────────────────────────────────────────────
// Principal
// ─────────────────────────────────────────────────────────────
async function principal() {
  console.log(`\n=== CARGA DAS ANALISES · modo ${MODO.toUpperCase()} ===\n`)
  const sb = conectar()

  if (MODO === 'limpar') {
    // AS DECISOES DELE NAO SAO APAGADAS. `--limpar` existe para refazer a carga
    // ("se der errado, apaga e refaz"), e nao para desfazer a conferencia: um
    // conflito ja aplicado ou ignorado e trabalho dele, e some sem aviso se a
    // limpeza for cega. So o que esta `aberto` sai.
    const c = await sb.from('analise_conflitos').delete().eq('situacao', 'aberto')
    if (c.error) console.log('erro limpando conflitos:', c.error.message)
    const { count: guardados } = await sb.from('analise_conflitos')
      .select('*', { count: 'exact', head: true }).neq('situacao', 'aberto')
    if (guardados) console.log(`${guardados} conflitos JA DECIDIDOS foram preservados.`)

    // As analises so podem sair depois, porque os conflitos decididos apontam
    // para elas. Se sobrou decisao, as analises ficam: apagar quebraria o elo.
    if (guardados) {
      console.log('as analises NAO foram apagadas: ha decisoes suas apontando para elas.')
      console.log('para zerar mesmo assim, apague a mao em analise_conflitos primeiro.')
    } else {
      const d = await sb.from('analise_documentos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (d.error) console.log('erro limpando documentos:', d.error.message)
      const a = await sb.from('analises').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (a.error) console.log('erro limpando analises:', a.error.message)
    }
    const { count: qa } = await sb.from('analises').select('*', { count: 'exact', head: true })
    const { count: qc } = await sb.from('analise_conflitos').select('*', { count: 'exact', head: true })
    const { count: qe } = await sb.from('analise_exercicios').select('*', { count: 'exact', head: true })
    console.log(`sobrou: analises ${qa} · exercicios ${qe} · conflitos ${qc}`)
    return
  }

  // ── ler os dois lados
  let { analises } = acervo()
  if (SO) {
    const antes = analises.length
    analises = analises.filter((a) => String(a.id) === SO)
    if (!analises.length) {
      // Falhar ALTO. Um id errado com filtro silencioso publicaria zero analises
      // e imprimiria "0 de 0, nenhuma rejeitada", que le como sucesso.
      throw new Error(`--so ${SO}: nao achei essa analise no acervo (${antes} disponiveis).`)
    }
    console.log(`filtrado por --so: 1 de ${antes} analises`)
  }
  const { data: tomadores, error: errT } = await sb
    .from('tomadores').select('id, razao_social, cnpj, limite_aprovado, status').limit(2000)
  if (errT) throw new Error('nao consegui ler tomadores: ' + errT.message)
  console.log(`acervo local: ${analises.length} analises · CRM: ${tomadores.length} tomadores`)

  // ── montar, sem nunca abortar
  const avisos = []
  const montadas = []
  const rejeitadas = []
  for (const a of analises) {
    try {
      const m = montar(a, avisos)
      if (!m.linha.data_analise) {
        // sem data nao da para versionar nem ordenar: entra com a data do registro
        m.linha.data_analise = String(a.registrado_em ?? '').slice(0, 10) || '1970-01-01'
        avisos.push({ id: a.id, razao: a.razao_social, aviso: 'sem data legivel; usei a data do registro' })
      }
      montadas.push(m)
    } catch (e) {
      rejeitadas.push({ id: a.id, razao: a.razao_social, erro: e.message })
    }
  }
  versionar(montadas)

  const confl = conflitos(montadas, tomadores)

  // ── o que foi medido
  const conta = (lista, f) => lista.reduce((m, x) => (m[f(x)] = (m[f(x)] ?? 0) + 1, m), {})
  const comCnpj = montadas.filter(m => m.linha.cnpj).length
  const casadas = new Set(tomadores.map(t => cnpjLimpo(t.cnpj)).filter(Boolean))
  const casam = montadas.filter(m => m.linha.cnpj && casadas.has(m.linha.cnpj)).length
  const exs = montadas.reduce((s, m) => s + m.exercicios.length, 0)

  console.log(`\nMONTADAS: ${montadas.length} de ${analises.length}` +
    (rejeitadas.length ? `  ·  REJEITADAS: ${rejeitadas.length}` : '  ·  nenhuma rejeitada'))
  for (const r of rejeitadas) console.log('   REJEITADA', r.id, r.razao, '->', r.erro)
  console.log(`com CNPJ unico: ${comCnpj}  ·  sem CNPJ: ${montadas.length - comCnpj}`)
  console.log(`casam com tomador do CRM: ${casam}`)
  console.log(`vigentes: ${montadas.filter(m => m.linha.vigente).length}  ·  versoes anteriores: ${montadas.filter(m => !m.linha.vigente).length}`)
  console.log(`exercicios financeiros: ${exs} linhas`)
  console.log(`limite com numero confiavel: ${montadas.filter(m => m.linha.limite_recomendado_num !== null).length}`)
  console.log(`tres_cs preenchido: ${montadas.filter(m => m.linha.tres_cs).length}  ·  pontos: ${montadas.filter(m => m.linha.pontos_positivos).length}`)
  console.log(`avisos de leitura: ${avisos.length}`)
  for (const v of avisos.slice(0, 8)) console.log('   aviso:', v.id, v.razao, '->', v.aviso)

  console.log(`\nRELATORIO DE CONFLITOS: ${confl.length} linhas`)
  for (const [k, n] of Object.entries(conta(confl, c => c.tipo)).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${k}`)
  }

  // guarda o relatorio para o auditor e para a tela
  const saida = path.join(process.cwd(), 'scripts', '_carga-relatorio.json')
  fs.writeFileSync(saida, JSON.stringify({
    modo: MODO, quando: new Date().toISOString(),
    totais: { analises: analises.length, montadas: montadas.length, rejeitadas: rejeitadas.length,
      comCnpj, casam, exercicios: exs, conflitos: confl.length },
    porTipo: conta(confl, c => c.tipo), avisos, rejeitadas,
    conflitos: confl,
  }, null, 2))
  console.log(`\nrelatorio salvo em scripts/_carga-relatorio.json`)

  if (MODO === 'ensaio') {
    console.log('\nENSAIO: nada foi gravado no banco.')
    return
  }

  // ── gravar. So nas tabelas da analise. `tomadores` nao e tocada.
  //
  // NADA AQUI ABORTA. A versao anterior tinha quatro `throw` que derrubavam a
  // carga inteira no primeiro erro do banco, e o pior estado possivel para esta
  // etapa e analise gravada SEM o relatorio que a explica. Agora cada erro vira
  // linha de falha, o resto continua, e o fim mostra o que nao entrou.
  console.log('\ngravando…')
  const falhas = []

  const linhas = montadas.map(m => m.linha)

  /* APOSENTAR A VERSAO ANTERIOR ANTES DE PROMOVER A NOVA (31/08/2026).

     O banco tem `analises_vigente_por_cnpj`, um indice unico parcial:
       CREATE UNIQUE INDEX ... ON analises (cnpj) WHERE (vigente AND cnpj IS NOT NULL)
     Ou seja: UMA analise vigente por CNPJ. A regra esta certa e fica.

     O que faltava era aqui. Na carga de 30/08 nenhum CNPJ tinha duas analises,
     entao o upsert passou. Hoje, com a Engie reanalisada, a linha nova chega com
     `chave_local` diferente (CNPJ + data), o upsert NAO a reconhece como a mesma
     linha, tenta INSERIR uma segunda vigente para o mesmo CNPJ e o indice barra.
     E como o upsert vai em lote de 100, o lote inteiro cai junto: foi assim que
     101 analises ficaram de fora numa tacada, a Engie entre elas.

     Entao, antes de gravar, as versoes anteriores do mesmo CNPJ sao rebaixadas.
     Nao se apaga nada: a analise velha continua no banco, com `vigente = false`,
     que e exatamente o que o acervo local ja faz quando ele reanalisa um tomador. */
  const vigentePorCnpj = new Map()
  for (const l of linhas) {
    if (!l.vigente || !l.cnpj) continue
    const ja = vigentePorCnpj.get(l.cnpj)
    if (ja === undefined) { vigentePorCnpj.set(l.cnpj, l.chave_local); continue }
    if (ja && ja !== l.chave_local) {
      // Duas vigentes para o mesmo CNPJ no ACERVO. Nao da para escolher por conta
      // propria qual vale: nenhuma e promovida, e o caso vira falha visivel.
      falhas.push(`${l.cnpj}: o acervo tem duas analises vigentes (${ja} e ${l.chave_local}); nenhuma foi promovida`)
      vigentePorCnpj.set(l.cnpj, null)
    }
  }

  let aposentadas = 0
  for (const [cnpj, chave] of vigentePorCnpj) {
    if (!chave) continue
    const { data, error } = await sb.from('analises')
      .update({ vigente: false })
      .eq('cnpj', cnpj).eq('vigente', true).neq('chave_local', chave)
      .select('chave_local')
    if (error) { falhas.push(`aposentar vigente de ${cnpj}: ${error.message}`); continue }
    aposentadas += (data ?? []).length
  }
  console.log(`versoes anteriores aposentadas: ${aposentadas}`)

  const gravadas = []
  for (let i = 0; i < linhas.length; i += 100) {
    const lote = linhas.slice(i, i + 100)
    const { data, error } = await sb
      .from('analises').upsert(lote, { onConflict: 'chave_local' }).select('id, chave_local')
    if (error) { falhas.push(`analises, lote ${i}: ${error.message}`); continue }
    gravadas.push(...(data ?? []))
  }
  console.log(`analises gravadas: ${gravadas.length} de ${linhas.length}`)

  const idPorChave = new Map(gravadas.map(g => [g.chave_local, g.id]))

  const exLinhas = []
  for (const m of montadas) {
    const id = idPorChave.get(m.linha.chave_local)
    if (!id) {
      // Pular em silencio era o defeito: os exercicios sumiriam sem ninguem ver.
      if (m.exercicios.length) falhas.push(`${m.linha.chave_local}: ${m.exercicios.length} exercicios ficaram de fora, a analise nao voltou do banco`)
      continue
    }
    for (const e of m.exercicios) exLinhas.push({ analise_id: id, ...e })
  }
  let exOk = 0
  for (let i = 0; i < exLinhas.length; i += 200) {
    const lote = exLinhas.slice(i, i + 200)
    const { error } = await sb.from('analise_exercicios').upsert(lote, { onConflict: 'analise_id,rotulo' })
    if (error) { falhas.push(`exercicios, lote ${i}: ${error.message}`); continue }
    exOk += lote.length
  }
  console.log(`exercicios gravados: ${exOk} de ${exLinhas.length}`)

  const confLinhas = confl.map(c => ({
    tipo: c.tipo,
    analise_id: c.chave_local ? (idPorChave.get(c.chave_local) ?? null) : null,
    tomador_id: c.tomador_id,
    campo: c.campo,
    valor_crm: c.valor_crm,
    valor_analise: c.valor_analise,
    sugestao: c.sugestao,
    candidatos: c.candidatos,
    motivo: c.motivo,
  }))
  let cfOk = 0
  for (let i = 0; i < confLinhas.length; i += 200) {
    const lote = confLinhas.slice(i, i + 200)
    const { error } = await sb.from('analise_conflitos')
      .upsert(lote, { onConflict: 'chave', ignoreDuplicates: true })
    if (error) { falhas.push(`conflitos, lote ${i}: ${error.message}`); continue }
    cfOk += lote.length
  }
  console.log(`conflitos gravados: ${cfOk} de ${confLinhas.length}`)

  // ── conferir o que ficou
  const { count: qa } = await sb.from('analises').select('*', { count: 'exact', head: true })
  const { count: qe } = await sb.from('analise_exercicios').select('*', { count: 'exact', head: true })
  const { count: qc } = await sb.from('analise_conflitos').select('*', { count: 'exact', head: true })
  const { count: qt } = await sb.from('tomadores').select('*', { count: 'exact', head: true })
  console.log(`\nNO BANCO AGORA: analises ${qa} · exercicios ${qe} · conflitos ${qc}`)
  console.log(`tomadores: ${qt} (tem que continuar 542; a carga nao escreve nessa tabela)`)

  // ── conflitos que a carga NAO reencontrou
  // Nao sao apagados nem fechados: quem decide e ele. Mas ficar em aberto para
  // sempre, sem ninguem saber que sumiram, seria uma fila que so cresce.
  const { data: abertos } = await sb.from('analise_conflitos')
    .select('chave').eq('situacao', 'aberto').limit(3000)
  if (abertos) {
    const geradas = new Set(confLinhas.map(c =>
      `${c.tipo}|${c.analise_id ?? ''}|${c.tomador_id ?? ''}|${c.campo}`))
    const orfaos = abertos.filter(a => !geradas.has(a.chave)).length
    // Com `--so` o "nao reencontrado" e obvio e nao e noticia: as outras analises
    // nem foram lidas nesta volta. Avisar seria alarme falso a cada clique no
    // Finalizar Analise.
    if (orfaos && !SO) {
      console.log(`\nATENCAO: ${orfaos} conflitos continuam ABERTOS mas nao foram reencontrados`)
      console.log('nesta carga (o dado que os causou pode ter sido corrigido).')
      console.log('Eles NAO foram fechados: quem decide isso e voce, na tela de conferencia.')
    }
  }

  if (falhas.length) {
    console.log(`\nNAO ENTROU (${falhas.length}):`)
    for (const f of falhas.slice(0, 10)) console.log('   ' + f)
    console.log('A carga foi ate o fim assim mesmo, que e a regra.')
  }
}

// So roda quando chamado direto. Importado (pelo teste), exporta as funcoes e
// nao encosta no banco: sem isto, `node carga-analises.teste.mjs` dispararia uma
// carga de verdade so por causa do import.
const chamadoDireto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (chamadoDireto) {
  principal().catch(e => { console.error('\nFALHOU:', e.message); process.exit(1) })
}
