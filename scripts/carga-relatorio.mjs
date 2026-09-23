// ============================================================
//  O RELATORIO COMPLETO PARA LER NO CRM DO AR  ·  23/09/2026
//
//  Pedido dele: "eu preciso que apareca igual antes, mas que as pessoas tenham
//  acesso ao relatorio sem editar". O relatorio de verdade (template v13) e
//  servido pelo motor local, que so responde no notebook dele. Esta carga
//  guarda no banco uma copia SOMENTE LEITURA, e a tela do CRM a mostra num
//  quadro isolado.
//
//  COMO E FEITA (a mesma montagem do `paginaDaAnalise` do servidor.mjs, sem
//  servidor por tras, no modo AVULSO que o proprio template ja tem):
//    'modelo'        v13.html + auditor.js embutido + robo de bordo. Um so.
//    <chave_local>   o que e da analise: contexto + dados + memoria do robo.
//  A tela junta as duas. O template NAO e tocado: so lido.
//
//  SOMENTE LEITURA DE VERDADE: `somente_leitura` esconde salvar e baixar,
//  `avulso` desliga toda chamada ao servidor, e o modelo ainda remove o botao
//  Editar e o modo de edicao. Quem edita e o analista, pelo template no
//  notebook ou pelo editor do CRM.
//
//  A COPIA E O RETRATO DO DISCO. Editou pelo CRM, ela nao acompanha: a
//  "Base compartilhada" continua sendo a leitura viva do banco.
//
//  COMO USAR
//    node scripts/carga-relatorio.mjs                ensaio: monta tudo, NAO grava
//    node scripts/carga-relatorio.mjs --gravar       grava as analises vigentes
//    node scripts/carga-relatorio.mjs --gravar --so <chave_local>
//  E ela roda sozinha no fim de `carga-analises.mjs --gravar`, entao o
//  Finalizar Analise e o `npm run publicar` ja a levam junto.
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const RAIZ_ANALISES = path.join('C:', 'Users', 'MarcoDragoneFAMSEGUR',
  'OneDrive - FAM Seguradora', 'Documents', 'Analises FAM')
const SISTEMA = path.join(RAIZ_ANALISES, '_sistema')
const COPIAS = path.join(SISTEMA, 'registro', 'json')
const TEMPLATE = path.join(SISTEMA, 'template')

const AVISO = 'Relatório da equipe, somente leitura. Quem edita é o analista.'

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
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local')
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

// Escapar </script e obrigatorio, senao um texto da analise fecha a tag no meio.
const seguro = (o) => JSON.stringify(o).replace(/<\/script/gi, '<\\/script')
const comoTexto = (s) => String(s || '').replace(/<\/script/gi, '<\\/script')
const hashDe = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

const lerJson = (arq) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')) } catch { return null } }

/** O nome da corretora como o CRM a conhece (o mesmo de-para do motor). Sem par
 *  ou sem o modulo, fica o nome cru: nada some. */
let _nomeDoCRM = null
async function nomeDoCRM(v) {
  if (_nomeDoCRM === null) {
    try {
      const mod = await import(pathToFileURL(path.join(SISTEMA, 'corretoras.mjs')).href)
      _nomeDoCRM = typeof mod.nomeDoCRM === 'function' ? mod.nomeDoCRM : (x) => x
    } catch { _nomeDoCRM = (x) => x }
  }
  try { return _nomeDoCRM(v) } catch { return v }
}

/** O mesmo que `analiseParaTemplate` do servidor.mjs: a revisada manda; sem ela, a gerada. */
async function dadosDaAnalise(copia) {
  let dados = null
  if (copia.revisada) {
    dados = { _fam_studio: 1, salvo_em: null, state: copia.revisada, _fonte: 'revisada', ano_corrente: (copia.gerada || {}).ano_corrente || null }
  } else if (copia.gerada) {
    dados = { ...copia.gerada, _fonte: 'gerada' }
  }
  if (!dados) return null
  try {
    if (dados.state && dados.state.meta && dados.state.meta.corretora) {
      dados.state.meta.corretora = await nomeDoCRM(dados.state.meta.corretora)
    } else if (dados.corretora) {
      dados.corretora = await nomeDoCRM(dados.corretora)
    }
  } catch { /* nome de corretora nunca impede a analise de entrar */ }
  return dados
}

/** A peca que nao muda de analise para analise. */
export function montarModelo() {
  const nome = fs.readFileSync(path.join(TEMPLATE, 'atual.txt'), 'utf8').trim() || 'v13.html'
  let html = fs.readFileSync(path.join(TEMPLATE, nome), 'utf8')
  const auditor = fs.readFileSync(path.join(TEMPLATE, 'auditor.js'), 'utf8')
  const auditorCss = fs.readFileSync(path.join(TEMPLATE, 'auditor.css'), 'utf8')
  const bordoJs = fs.readFileSync(path.join(TEMPLATE, 'bordo.js'), 'utf8')
  const bordoCss = fs.readFileSync(path.join(TEMPLATE, 'bordo.css'), 'utf8')

  const marca = '<!--FAM-DADOS-->'
  const tag = '<script src="/auditor.js"></script>'
  const tagCss = '<link rel="stylesheet" href="/auditor.css">'
  if (!html.includes(marca)) throw new Error(`o template ${nome} perdeu a marca ${marca}`)
  if (!html.includes(tag)) throw new Error(`o template ${nome} perdeu a linha ${tag}`)
  if (!html.includes(tagCss)) throw new Error(`o template ${nome} perdeu a linha ${tagCss}`)

  /* A TRAVA DE LEITURA. O template so entra em modo de edicao pelo botao
     Editar (`#bt-edit`, toggleEdit); o `somente_leitura` cuida de salvar e
     baixar, mas nao disso. Sem servidor atras nada seria gravado, e mesmo
     assim quem le nao deve ver um documento que parece editavel. Some o botao
     de editar e os de importar, e o selo "Cópia sua" do modo avulso (que fala
     de salvar no computador e nao se aplica). NAO se usa observador que
     desfaca o modo de edicao: o template reage a ele e os dois brigariam em
     laco infinito (medido). */
  const trava = `<style>#bt-edit,#bt-import,#bt-import2,.fam-selo{display:none!important}</style>`

  const bordo = `<script id="fam-bordo-js" type="text/plain">${comoTexto(bordoJs)}</script>\n`
    + `<script id="fam-bordo-css" type="text/plain">${comoTexto(bordoCss)}</script>\n`

  // O auditor.js entra no lugar do <script src>. Troca por FUNCAO, nunca por
  // string: um "$'" dentro do codigo colaria o resto do documento de novo
  // (o acidente da JKDI, 04/08/2026, esta contado no servidor.mjs).
  html = html.replace(tag, () => `<script>${comoTexto(auditor)}</script>`)
  html = html.replace(tagCss, () => `<style>${String(auditorCss).replace(/<\/style/gi, '<\\/style')}</style>`)
  html = html.replace(marca, () => marca + '\n' + bordo + trava)
  return { nome, html }
}

/** A conversa com a IA gravada no dossie (`conversa.jsonl`), como o motor a
 *  entrega em `GET /api/ia/<id>`: as ultimas 60 linhas. Sem arquivo, vazia. */
function lerConversa(id) {
  try {
    const bruto = fs.readFileSync(path.join(SISTEMA, 'registro', 'dossie', id, 'conversa.jsonl'), 'utf8')
    const linhas = bruto.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean).slice(-60)
    return linhas.some((m) => m.tipo !== 'decisao' && m.texto) ? linhas : []
  } catch { return [] }
}

/** A peca de uma analise: o que o servidor injeta na marca do template. */
export async function montarPeca(id, nomeTemplate) {
  const copia = lerJson(path.join(COPIAS, id + '.json'))
  if (!copia) return null
  const dados = await dadosDaAnalise(copia)
  if (!dados) return null
  /* A CONVERSA COM A IA (23/09/2026). O template so desenha a secao "Conversa
     com o auditor de IA" quando pergunta ao servidor (`GET /api/ia/<id>`), e no
     modo avulso ele nunca pergunta. Para as analises que tem conversa, a peca
     leva um `fetch` de mentira ANTES do auditor, que responde essa rota com a
     conversa gravada no dossie e recusa todo o resto; nesse caso o documento
     abre no modo normal (nao avulso), ja em somente leitura. Sem conversa, fica
     o avulso, que nunca chama nada. */
  const conversa = lerConversa(id)
  const contexto = {
    id,
    versao_template: nomeTemplate,
    razao_social: copia.gerada?.razao_social || copia.revisada?.meta?.razao_social || '',
    pasta: '',
    fonte: dados._fonte,
    revisado_em: null,
    tem_dossie: false,
    somente_leitura: true,
    aviso_versao: AVISO,
    carimbo: '',
    embutido: false,
    avulso: conversa.length === 0,
  }
  const memoria = copia.gerada?.memoria || null
  const falsoFetch = conversa.length
    ? `<script>(function(){var C=${seguro(conversa)};window.fetch=function(u,o){try{if(/\\/api\\/ia\\/[^\\/?]+$/.test(String(u))&&(!o||!o.method||o.method==='GET')){return Promise.resolve(new Response(JSON.stringify({ok:true,conversa:C,em_curso:false}),{headers:{'Content-Type':'application/json'}}));}}catch(e){}return Promise.reject(new Error('somente leitura'));};})();</script>\n`
    : ''
  return falsoFetch
    + `<script id="fam-contexto" type="application/json">${seguro(contexto)}</script>\n`
    + `<script id="fam-analise" type="application/json">${seguro(dados)}</script>\n`
    + `<script id="fam-memoria" type="application/json">${seguro(memoria)}</script>\n`
}

/**
 * Monta e (em `gravar`) guarda o modelo e as pecas. `so` limita a uma analise.
 * Nunca lanca: quem chama e a carga das analises, e o relatorio de leitura nao
 * pode derrubar a publicacao dela.
 */
export async function publicarRelatorios({ gravar = false, so = '' } = {}) {
  const sb = conectar()
  const { html: modelo, nome } = montarModelo()

  const { data: vigentes, error } = await sb.from('analises').select('chave_local').eq('vigente', true).limit(2000)
  if (error) throw new Error('nao consegui ler as analises vigentes: ' + error.message)
  let chaves = (vigentes ?? []).map((a) => a.chave_local).filter(Boolean)
  if (so) chaves = chaves.filter((c) => c === so)
  if (so && !chaves.length) throw new Error(`--so ${so}: essa analise nao esta entre as vigentes do banco`)

  const linhas = [{ id: 'modelo', html: modelo, hash: hashDe(modelo), atualizado_em: new Date().toISOString() }]
  const semCopia = []
  let exportadas = 0
  for (const chave of chaves) {
    /* O HTML QUE ELE BAIXA VALE PRIMEIRO (23/09/2026). Cada vez que ele clica
       em "Baixar HTML", o servidor guarda a MESMA copia em `registro/html`: o
       arquivo com o robo de bordo e a conversa com a IA dentro, do jeito que
       vai para o comite. Ele pediu "igual aquele que baixo em HTML", entao vai
       o arquivo inteiro, sem remontar nada. Quem nunca baixou o HTML cai na
       montagem ao vivo (modelo + peca), que nao traz a conversa. */
    const exportado = path.join(SISTEMA, 'registro', 'html', chave + '.html')
    if (fs.existsSync(exportado)) {
      try {
        const doc = fs.readFileSync(exportado, 'utf8')
        // Baixado ANTES da conversa (3 arquivos de 03/08): sem ela dentro, o
        // documento ao vivo, que a leva, e mais fiel do que o arquivo velho.
        const faltaConversa = lerConversa(chave).length > 0 && !/Conversa com o auditor de IA/.test(doc)
        if (/^\s*<!doctype html/i.test(doc) && !faltaConversa) {
          linhas.push({ id: chave, html: doc, hash: hashDe(doc), atualizado_em: new Date().toISOString() })
          exportadas++
          continue
        }
      } catch { /* arquivo so na nuvem ou preso: cai na montagem ao vivo */ }
    }
    const peca = await montarPeca(chave, nome)
    if (!peca) { semCopia.push(chave); continue }
    linhas.push({ id: chave, html: peca, hash: hashDe(peca), atualizado_em: new Date().toISOString() })
  }

  const kb = (n) => Math.round(n / 1024)
  console.log(`\nrelatorio de leitura: modelo ${nome} (${kb(modelo.length)} KB) + ${linhas.length - 1} analise(s)`
    + ` (${exportadas} com o HTML baixado, ${linhas.length - 1 - exportadas} montadas ao vivo)`
    + ` · ${kb(linhas.reduce((s, l) => s + l.html.length, 0))} KB no total`)
  if (semCopia.length) console.log(`sem copia no disco (${semCopia.length}): ${semCopia.slice(0, 5).join(', ')}${semCopia.length > 5 ? '…' : ''}`)
  if (!gravar) { console.log('ensaio: nada foi gravado.'); return { gravadas: 0, semCopia } }

  // Em lotes pequenos: cada linha pesa algumas centenas de KB.
  let gravadas = 0
  for (let i = 0; i < linhas.length; i += 3) {
    const lote = linhas.slice(i, i + 3)
    const { error: e } = await sb.from('analise_relatorio_leitura').upsert(lote, { onConflict: 'id' })
    if (!e) { gravadas += lote.length; continue }
    // Lote que estoura o tempo do banco: tenta linha a linha, que e mais leve.
    for (const linha of lote) {
      const { error: e1 } = await sb.from('analise_relatorio_leitura').upsert(linha, { onConflict: 'id' })
      if (!e1) { gravadas++; continue }
      /* O HTML baixado que passa de uns MB estoura o tempo do banco (o de
         09/2026 da Ebix tem 9,8 MB, com imagens dentro). Cai na montagem ao
         vivo, que e leve; se nem ela couber, a aba abre a Base compartilhada. */
      let salvou = false
      if (/^\s*<!doctype html/i.test(linha.html) && linha.id !== 'modelo') {
        const peca = await montarPeca(linha.id, nome)
        if (peca) {
          const { error: e2 } = await sb.from('analise_relatorio_leitura')
            .upsert({ id: linha.id, html: peca, hash: hashDe(peca), atualizado_em: new Date().toISOString() }, { onConflict: 'id' })
          if (!e2) { gravadas++; salvou = true; console.log(`  ${linha.id}: o HTML baixado e grande demais, entrou a montagem ao vivo`) }
        }
      }
      if (!salvou) console.log(`  nao gravou ${linha.id}: ${e1.message}`)
    }
  }
  console.log(`gravadas ${gravadas} de ${linhas.length}.`)
  return { gravadas, semCopia }
}

const chamadoDireto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (chamadoDireto) {
  const iSo = process.argv.indexOf('--so')
  publicarRelatorios({
    gravar: process.argv.includes('--gravar'),
    so: iSo > -1 ? String(process.argv[iSo + 1] || '').trim() : '',
  }).catch((e) => { console.error('\nFALHOU:', e.message); process.exit(1) })
}
