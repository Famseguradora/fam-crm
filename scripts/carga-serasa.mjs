// ============================================================
//  CARGA DO SERASA DAS ANALISES  ·  o que faltava na gaveta "Serasa" da Mesa
//
//  O dado do Serasa (score, risco, PEFIN, protestos, acoes, recuperacao e as
//  consultas recentes) sempre existiu dentro do arquivo da analise, mas nao
//  tinha coluna no banco: por isso a gaveta aparecia vazia. Esta carga le as
//  copias de `_sistema/registro/json/<chave_local>.json` e preenche as colunas
//  novas de `analises`.
//
//  AS DUAS REGRAS HERDADAS DA CARGA DAS ANALISES, que nao se afrouxam:
//   1. a versao REVISADA manda quando existe (foi a que ele salvou);
//   2. nunca chutar numero. Score "—" vira NULO, e nao zero. Um zero aqui
//      viraria "empresa com score zero" na tela, que e mentira grave.
//
//  A carga NUNCA aborta: analise sem copia, ou copia sem Serasa, entra no
//  relatorio e o script segue.
//
//  COMO USAR
//    node scripts/carga-serasa.mjs            ensaio: le tudo, NAO grava
//    node scripts/carga-serasa.mjs --gravar   grava nas colunas serasa_*
//    node scripts/carga-serasa.mjs --limpar   devolve as colunas a nulo
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RAIZ_ANALISES = path.join('C:', 'Users', 'MarcoDragoneFAMSEGUR',
  'OneDrive - FAM Seguradora', 'Documents', 'Analises FAM')
const COPIAS = path.join(RAIZ_ANALISES, '_sistema', 'registro', 'json')

const MODO = process.argv.includes('--gravar') ? 'gravar'
  : process.argv.includes('--limpar') ? 'limpar'
  : 'ensaio'

// ─────────────────────────────────────────────────────────────
// Banco
// ─────────────────────────────────────────────────────────────
function lerEnv() {
  const txt = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
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
// Limpeza de texto e leitura de numero
// ─────────────────────────────────────────────────────────────
const semTags = (v) => String(v ?? '')
  .replace(/<br\s*\/?>/gi, ' · ')
  .replace(/<\/(p|li|div|tr)>/gi, ' · ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s*·\s*(·\s*)+/g, ' · ')
  .replace(/\s+/g, ' ')
  .replace(/^\s*·\s*|\s*·\s*$/g, '')
  .trim()

const VAZIO = /^(n\/?d|n\/?a|nao informado|não informado|sem dados|sem informacao|sem informação|-{1,3}|—|–|s\/d|\?)$/i

/** Texto util, ou null. Nunca devolve string vazia nem tracinho. */
function txt(v) {
  const s = semTags(v)
  if (!s || VAZIO.test(s)) return null
  return s
}

/** Inteiro do score. So aceita 0..1000; qualquer outra coisa vira null. */
function score(v) {
  const s = semTags(v).replace(/[^\d]/g, '')
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0 || n > 1000) return null
  return n
}

/**
 * Dinheiro em pt-BR. Devolve null quando nao da para ter certeza: e a regra
 * que impediu a carga anterior de somar R$ 97 bilhoes de limite.
 */
function dinheiro(v) {
  const s = semTags(v)
  if (!s || VAZIO.test(s)) return null
  const m = s.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{1,2}|\d{4,})/)
  if (!m) return null
  let bruto = m[1]
  const milhao = /milh(ao|ões|oes|ão)/i.test(s)
  const mil = /\bmil\b/i.test(s)
  bruto = bruto.replace(/\./g, '').replace(',', '.')
  let n = Number(bruto)
  if (!Number.isFinite(n)) return null
  if (milhao && n < 1000) n = n * 1_000_000
  else if (mil && n < 1000) n = n * 1000
  return n > 0 ? n : null
}

/** As consultas recentes, nos dois vocabularios. Sai sempre lista limpa. */
function consultas(lista) {
  if (!Array.isArray(lista)) return null
  const saida = []
  for (const c of lista) {
    if (!c || typeof c !== 'object') continue
    const data = txt(c.data)
    const empresa = txt(c.empresa ?? c.nome)
    // `tipo` na revisada, `segmento` na gerada. Sao a mesma coluna na tela.
    const tipo = txt(c.tipo ?? c.segmento)
    if (!data && !empresa) continue
    saida.push({ data, empresa, tipo })
  }
  return saida.length ? saida : null
}

// ─────────────────────────────────────────────────────────────
// A leitura da copia
// ─────────────────────────────────────────────────────────────
function copiaFunda(chave) {
  const p = path.join(COPIAS, chave + '.json')
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

/**
 * O bloco do Serasa, com a revisada mandando campo a campo.
 *
 * A revisada guarda tudo dentro de `serasa: {score, risco, prob, limite,
 * pefin, protestos, acoes, recuperacao, consultas, interp}`. A gerada espalha
 * em chaves soltas (`score_serasa`, `risco_serasa`, ...) e nao tem PEFIN,
 * protestos nem acoes: nesses tres, quando so ha gerada, fica nulo (a tela
 * escreve "a analise nao registrou", nunca "sem registros" inventado).
 */
function serasaDa(rev, ger) {
  const s = (rev && typeof rev.serasa === 'object' && rev.serasa) ? rev.serasa : null
  const g = ger ?? {}

  const escolher = (a, b) => {
    const va = txt(a)
    return va !== null ? va : txt(b)
  }

  const bloco = {
    serasa_score: score(s?.score) ?? score(g.score_serasa),
    serasa_risco: escolher(s?.risco, g.risco_serasa),
    serasa_interpretacao: escolher(s?.interp, g.interpretacao_serasa),
    serasa_prob: escolher(s?.prob, g.prob_inadimplencia),
    serasa_limite_txt: escolher(s?.limite, g.limite_serasa_pj),
    serasa_pefin: txt(s?.pefin),
    serasa_protestos: txt(s?.protestos),
    serasa_acoes: txt(s?.acoes),
    serasa_recuperacao: escolher(s?.recuperacao, g.serasa_recuperacao),
    serasa_consultas: consultas(s?.consultas) ?? consultas(g.consultas_serasa),
    serasa_fonte: s ? 'revisada' : (ger ? 'gerada' : null),
  }
  bloco.serasa_limite_num = dinheiro(bloco.serasa_limite_txt)
  bloco.serasa_consultas_qtd = bloco.serasa_consultas ? bloco.serasa_consultas.length : null

  const temAlgo = Object.entries(bloco).some(([k, v]) =>
    k !== 'serasa_fonte' && v !== null && v !== undefined)
  return temAlgo ? bloco : null
}

// ─────────────────────────────────────────────────────────────
// Rodar
// ─────────────────────────────────────────────────────────────
const COLUNAS_NULAS = {
  serasa_score: null, serasa_risco: null, serasa_interpretacao: null, serasa_prob: null,
  serasa_limite_txt: null, serasa_limite_num: null, serasa_pefin: null, serasa_protestos: null,
  serasa_acoes: null, serasa_recuperacao: null, serasa_consultas: null,
  serasa_consultas_qtd: null, serasa_fonte: null,
}

async function main() {
  const db = conectar()

  const { data: analises, error } = await db
    .from('analises')
    .select('id, chave_local, razao_social, data_analise, vigente')
    .order('razao_social')
  if (error) throw new Error('nao consegui ler `analises`: ' + error.message)

  console.log(`modo: ${MODO}`)
  console.log(`analises no banco: ${analises.length}`)

  if (MODO === 'limpar') {
    const { error: errL } = await db.from('analises').update(COLUNAS_NULAS).not('id', 'is', null)
    if (errL) throw new Error('falhei ao limpar: ' + errL.message)
    console.log('colunas serasa_* devolvidas a nulo nas ' + analises.length + ' analises.')
    return
  }

  let comSerasa = 0, semCopia = 0, semSerasa = 0, gravadas = 0, falhas = 0
  const semDado = []
  const amostra = []

  for (const a of analises) {
    const { rev, ger, erro } = copiaFunda(a.chave_local)
    if (erro) { semCopia++; semDado.push({ razao: a.razao_social, motivo: erro }); continue }

    const bloco = serasaDa(rev, ger)
    if (!bloco) { semSerasa++; semDado.push({ razao: a.razao_social, motivo: 'copia sem bloco de Serasa' }); continue }

    comSerasa++
    if (amostra.length < 3 && a.vigente) amostra.push({ razao: a.razao_social, ...bloco, serasa_consultas: (bloco.serasa_consultas ?? []).length + ' consultas' })

    if (MODO === 'gravar') {
      const { error: errU } = await db.from('analises').update(bloco).eq('id', a.id)
      if (errU) { falhas++; console.log('  ! falhou ' + a.razao_social + ': ' + errU.message) }
      else gravadas++
    }
  }

  console.log('')
  console.log('com Serasa na copia .......... ' + comSerasa)
  console.log('sem copia no registro ........ ' + semCopia)
  console.log('copia sem bloco de Serasa .... ' + semSerasa)
  if (MODO === 'gravar') {
    console.log('gravadas ..................... ' + gravadas)
    console.log('falhas na gravacao ........... ' + falhas)
  }

  if (semDado.length) {
    console.log('')
    console.log('as que ficam sem Serasa, uma a uma:')
    for (const s of semDado) console.log('  · ' + s.razao + ' — ' + s.motivo)
  }

  console.log('')
  console.log('amostra do que foi lido:')
  console.log(JSON.stringify(amostra, null, 2))

  if (MODO === 'ensaio') {
    console.log('')
    console.log('ENSAIO: nada foi gravado. Rode com --gravar quando conferir.')
  }
}

main().catch(e => { console.error('parou: ' + e.message); process.exit(1) })
