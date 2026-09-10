// ============================================================================
//  A ESTEIRA  ·  o agente da análise de crédito, no notebook
// ============================================================================
//
//  Ordem do Marco em 07/09/2026: "a análise de crédito será feita através do meu
//  notebook, eu só quero que seja dentro do CRM FAM e não no sistema análise de
//  crédito".
//
//  Então a divisão é esta, e é a mesma do Carteiro:
//
//     o NOTEBOOK executa    o motor lê PDF, faz OCR e chama o claude.exe
//     o CRM decide e mostra a tela, o banco, e o que uma pessoa mandou fazer
//
//  O QUE ELE FAZ, em cada volta:
//
//     1. pergunta ao CRM o que fazer            (GET /api/esteira)
//     2. MATERIALIZA a pasta de um caso novo    (baixa os documentos do Storage)
//     3. executa as ordens que uma pessoa deu   (pelo servidor local, quando ele
//                                               está de pé; senão pelos módulos)
//     4. aplica no disco o que o CRM decidiu    (recado lido, alçada, arquivo fora)
//     5. responde a IA do card e a de Gestão
//     6. manda o retrato do disco para o CRM    (a Mesa inteira: fichas, arquivos,
//                                               triagem, linha, notas, mural, alçadas)
//
//  A MESA INTEIRA SOBE (09/09/2026). Até aqui o CRM só recebia situação, hash e
//  contagem de documentos; a tela do card ficava no 127.0.0.1. Agora o mesmo
//  `visao.mjs montar()` que enche o cockpit enche o CRM: fase, triagem item a
//  item, lista de arquivos, linha de processos, retrato do bibliotecário, notas,
//  o mural de recados e as alçadas. O CRM desenha; o disco continua aqui.
//
//  O GASTO DE IA CONTINUA ZERO. Quem responde é o `claude.exe` desta máquina,
//  pela assinatura que já se paga: sem chave de API, sem serviço contratado e
//  sem fatura de token. Ver o cabeçalho do `_sistema/ponte.mjs`.
//
//  ---------------------------------------------------------------------------
//  AS ORDENS PASSAM PELO SERVIDOR LOCAL QUANDO ELE ESTÁ DE PÉ. "Analisar agora"
//  no CRM vira o MESMO POST /api/analisar que o botão do cockpit faz, com a
//  seleção de arquivos gravada no _instrucoes.txt e o executar.ps1 subindo o
//  Claude. Não é a máquina decidindo sozinha: é o clique dele, dado de outra
//  tela. Com o servidor desligado, vale o que já valia: `rodar_sozinho` nasce
//  DESLIGADO e o agente ENTREGA O COMANDO pronto para ele colar.
//  ---------------------------------------------------------------------------
//
//  COMO INSTALAR
//    1. Node 20 ou mais novo, na máquina onde o motor da análise já roda.
//    2. Ao lado deste arquivo, um esteira.json:
//         {
//           "url": "http://localhost:3000",
//           "token": "o segredo do CRM",
//           "raiz": "C:\\...\\Analises FAM",
//           "rodar_sozinho": false
//         }
//       (`url` e `token` também saem do .env.local quando isto roda dentro do
//        repositório do CRM; `raiz` é a única coisa que sempre precisa estar aqui)
//    3. `node scripts/esteira.mjs` e deixe a janela aberta.
// ============================================================================

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
/** A raiz do repositório do CRM (este arquivo mora em `scripts/`). É de onde a
 *  carga é chamada quando alguém manda publicar uma análise pelo card. */
const RAIZ_CRM = path.resolve(AQUI, '..')

function doEnvLocal(chave) {
  try {
    const caminho = path.join(AQUI, '..', '.env.local')
    if (!fs.existsSync(caminho)) return ''
    const linha = fs.readFileSync(caminho, 'utf8')
      .split('\n').find((l) => l.trim().startsWith(chave + '='))
    return linha ? linha.slice(linha.indexOf('=') + 1).trim() : ''
  } catch { return '' }
}

function config() {
  let arq = {}
  const caminho = path.join(AQUI, 'esteira.json')
  try {
    if (fs.existsSync(caminho)) arq = JSON.parse(fs.readFileSync(caminho, 'utf8'))
  } catch (e) {
    console.error('esteira.json existe mas não é um JSON válido:', e.message)
    process.exit(1)
  }
  return {
    url: String(process.env.CRM_URL || arq.url || 'http://localhost:3000').replace(/\/+$/, ''),
    token: String(
      process.env.CARTEIRO_TOKEN || arq.token ||
      doEnvLocal('CARTEIRO_TOKEN') || doEnvLocal('ANALISE_EVENTO_TOKEN') || '',
    ),
    raiz: String(arq.raiz || process.env.ANALISES_RAIZ || ''),
    // Ver o cabeçalho: nasce desligado, e ligar é decisão dele.
    rodar_sozinho: !!arq.rodar_sozinho,
    // O servidor do Sistema de Análise nesta máquina. É por ele que as ordens
    // do CRM viram o mesmo clique do cockpit.
    servidor: String(arq.servidor || 'http://127.0.0.1:7311').replace(/\/+$/, ''),
    batida_seg: Number(arq.batida_seg ?? 10),
    sincronia_seg: Number(arq.sincronia_seg ?? 90),
    maquina: String(arq.maquina || os.hostname()),
  }
}

const c = config()

// ── a ponte com o CRM ───────────────────────────────────────────────────────
async function crm(caminho, corpo) {
  const r = await fetch(c.url + caminho, {
    method: corpo ? 'POST' : 'GET',
    headers: { 'x-carteiro-token': c.token, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const t = await r.text()
  let j = {}
  try { j = JSON.parse(t) } catch { j = { erro: t.slice(0, 300) } }
  return r.ok ? { ok: true, ...j } : { ok: false, status: r.status, ...j }
}

// ── o servidor local do Sistema de Análise, quando está de pé ───────────────
let servidorVivoAte = 0
async function servidorLocal() {
  if (Date.now() < servidorVivoAte) return true
  try {
    const r = await fetch(c.servidor + '/api/status', { signal: AbortSignal.timeout(2500) })
    const j = await r.json()
    // A raiz tem que ser a mesma que a nossa: subir a cópia errada já custou uma tarde.
    const ok = !!j && (!c.raiz || String(j.raiz || '').toLowerCase().startsWith(c.raiz.toLowerCase().slice(0, 20)))
    if (ok) servidorVivoAte = Date.now() + 30_000
    return ok
  } catch { return false }
}
async function servidor(caminho, corpo) {
  const r = await fetch(c.servidor + caminho, {
    method: corpo ? 'POST' : 'GET',
    headers: corpo ? { 'Content-Type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(120_000),
  })
  const t = await r.text()
  let j = {}
  try { j = JSON.parse(t) } catch { j = { erro: t.slice(0, 300) } }
  return r.ok ? { ok: true, ...j } : { ok: false, status: r.status, ...j }
}

/* OS MÓDULOS DO MOTOR, carregados por caminho e não por dependência.
   É a peça de transição: hoje quem sabe olhar uma pasta de análise é o
   `_sistema`. No dia em que essa leitura for reescrita dentro do CRM, muda
   este import e mais nada. Foi assim que o `ponte.mjs` tratou a troca da IA
   por API, e funcionou. */
const modulos = new Map()
async function mod(nome) {
  if (modulos.has(nome)) return modulos.get(nome)
  if (!c.raiz) {
    console.error('Falta "raiz" no esteira.json: é a pasta Analises FAM, onde o motor mora.')
    return null
  }
  const alvo = path.join(c.raiz, '_sistema', nome)
  if (!fs.existsSync(alvo)) {
    console.error(`Não achei ${alvo}. Confira a "raiz" no esteira.json.`)
    return null
  }
  const m = await import(pathToFileURL(alvo).href)
  modulos.set(nome, m)
  return m
}
const carregarMotor = () => mod('fila.mjs')

const digitos = (v) => String(v ?? '').replace(/\D/g, '')

// ── 2. materializar: o caso do CRM vira pasta no disco ──────────────────────
/* Este é o passo que faltava para a análise COMEÇAR dentro do CRM. O e-mail
   entrou pela Caixa, virou caso, a Triagem conferiu, e os documentos estão no
   Storage. O motor lê arquivo. Aqui os dois mundos se encontram. */
async function materializar(pendentes) {
  for (const p of pendentes) {
    const destino = path.join(c.raiz, p.pasta)
    console.log(`  Montando a pasta "${p.pasta}"…`)

    const r = await crm(`/api/esteira/documentos?id=${encodeURIComponent(p.id)}`)
    if (!r.ok) {
      console.error('   ', r.erro ?? `HTTP ${r.status}`)
      await crm('/api/esteira', { acao: 'erro', id: p.id, erro: `Não consegui pegar os documentos: ${r.erro ?? r.status}` })
      continue
    }
    if (!r.documentos?.length) {
      await crm('/api/esteira', {
        acao: 'erro', id: p.id,
        erro: 'O caso não tem nenhum documento guardado. Sem documento não há o que analisar.',
      })
      console.error('    Sem documentos.')
      continue
    }

    try {
      fs.mkdirSync(destino, { recursive: true })
      let baixados = 0
      const falhas = [...(r.falhas ?? [])]
      for (const d of r.documentos) {
        /* Nome de arquivo do Windows não aceita estes caracteres, e um anexo
           chamado "Balanço 2025 (consolidado): final.pdf" derrubaria a pasta
           inteira em vez de um arquivo só. */
        const nome = String(d.nome).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 150)
        const alvo = path.join(destino, nome)
        if (fs.existsSync(alvo)) { baixados++; continue }
        try {
          const resp = await fetch(d.url)
          if (!resp.ok) { falhas.push(`${nome} (HTTP ${resp.status})`); continue }
          fs.writeFileSync(alvo, Buffer.from(await resp.arrayBuffer()))
          baixados++
        } catch (e) {
          falhas.push(`${nome} (${e.message})`)
        }
      }
      console.log(`    ${baixados} de ${r.documentos.length} documento(s) na pasta.`)
      if (falhas.length) console.log('    Não vieram:', falhas.join(' · '))

      /* SEM NENHUM ARQUIVO, a pasta não presta e é melhor dizer isso do que
         deixar o motor achar uma pasta vazia e concluir "aguardando documentos",
         que é a mesma tela para dois problemas diferentes. */
      if (!baixados) {
        await crm('/api/esteira', {
          acao: 'erro', id: p.id,
          erro: `Nenhum documento chegou na pasta. ${falhas.join(' · ')}`,
        })
      }
    } catch (e) {
      console.error('   ', e.message)
      await crm('/api/esteira', { acao: 'erro', id: p.id, erro: `Não consegui montar a pasta: ${e.message}` })
    }
  }
}

// ── 6. o retrato do disco, e ele vai INTEIRO ────────────────────────────────
/* Quem monta a Mesa do cockpit é o `visao.mjs montar()`: uma leitura de disco,
   com a fase, a triagem item a item, a chave do tomador e as páginas (linha de
   processos, parado há quantos dias). A Mesa do CRM sai da MESMA função, para
   as duas telas nunca discordarem. Sem o visao.mjs (motor mais antigo), cai
   no `fila.mjs listar()` de antes, que dá situação, hash e contagem. */
async function retratoDoDisco() {
  const Fila = await carregarMotor()
  if (!Fila) return null
  let V = null
  try { V = (await mod('visao.mjs'))?.montar?.() ?? null } catch (e) { console.error('  visao.mjs:', e.message) }

  const Arquivos = await mod('arquivos.mjs').catch(() => null)
  const Biblioteca = await mod('biblioteca.mjs').catch(() => null)
  const Notas = await mod('notas.mjs').catch(() => null)
  const Marcador = await mod('marcador.mjs').catch(() => null)

  if (!V) {
    let lista
    try { lista = Fila.listar() } catch (e) { console.error('  O motor não conseguiu ler a fila:', e.message); return null }
    return {
      pastas: (lista.analises ?? []).map((p) => ({
        pasta: p.pasta, situacao: p.situacao, motivo: p.motivo, hash_documentos: p.hash_atual,
        documentos: p.documentos ?? 0, documentos_faltando: p.documentos_faltando ?? [],
        razao_social: p.razao_social ?? '', trava_maquina: c.maquina, trava_pid: process.pid,
      })),
      estado: null,
    }
  }

  const pastas = (V.esteira ?? []).map((p) => {
    const a = p.a || {}
    const pg = (V.paginas || {})[p.chave] || {}
    const ident = p.ident || {}
    const cnpj = digitos(p.confiavel ? ident.cnpj : '') || digitos(String(p.chave || '').length >= 14 ? p.chave : '')

    // A lista de arquivos e o retrato do bibliotecário: por pasta viva ou por
    // retrato guardado, exatamente como o card do cockpit lê.
    let arquivos = null, biblioteca = null
    try {
      const B = Biblioteca?.paraOCard?.(a.pasta || '', p.chave || '') ?? null
      if (B) {
        arquivos = B.arquivos ?? null
        biblioteca = { demonstrativos: B.demonstrativos ?? null, leitura: B.leitura ?? null, leitura_velha: !!B.leitura_velha, pode_ler: !!B.pode_ler }
      } else if (Arquivos && a.pasta) {
        arquivos = Arquivos.listar(a.pasta, p.chave || '')
      }
    } catch (e) { console.error(`  arquivos de "${a.pasta}":`, e.message) }

    let notas = []
    try { notas = p.chave && Notas ? (Notas.emOrdem(p.chave).notas || []) : [] } catch { notas = [] }

    let substatus = null
    try { substatus = a.pasta && Marcador ? Marcador.ler(a.pasta) : null } catch { substatus = null }

    return {
      pasta: a.pasta,
      situacao: a.situacao,
      motivo: a.motivo,
      hash_documentos: a.hash_atual ?? null,
      documentos: a.documentos ?? 0,
      documentos_faltando: a.documentos_faltando ?? [],
      razao_social: a.razao_social ?? '',
      cnpj,
      cnpj_confiavel: !!p.confiavel,
      chave: p.chave || '',
      fase: p.fase || '',
      nome: p.nome || '',
      corretora: ident.corretora || '',
      produto: ident.produto || '',
      docs: { feitos: p.emOrdem ?? 0, total: p.total ?? 0, falta: (p.faltando || []).map((x) => x.d?.chip || x.d?.nome || '').filter(Boolean) },
      cadastro: {
        status: p.cad?.status || 'pendente', rotulo: p.cad?.rotulo || '', motivo: p.cad?.motivo || '',
        bloqueios: (p.cad?.bloqueios || []).map((b) => ({ id: b.id, nome: b.nome })),
        pendencias: (p.cad?.pendencias || []).map((b) => ({ id: b.id, nome: b.nome })),
        itens: (p.itens || []).map(({ d, item }) => ({
          id: d.id, nome: d.nome, chip: d.chip, exigencia: d.exigencia,
          situacao: item?.situacao || 'faltando', obs: item?.obs || '',
        })),
        produto: ident.produto || '', corretora: ident.corretora || '',
      },
      arquivos,
      biblioteca,
      linha: (pg.linha || []).slice(0, 200).map((l) => ({ em: l.em, tipo: l.tipo, txt: l.txt, quem: l.quem || '', abrir: l.abrir || '', id: l.id || '' })),
      parado_desde: pg.parado_desde || null,
      analise_chave: pg.analise_atual || '',
      substatus_motor: substatus,
      arquivada: !!p.arquivada,
      concluido_em: a.concluido_em || null,
      notas: notas.map((n) => ({ id: n.id, titulo: n.titulo || '', html: n.html || '', fixada: !!n.fixada, em: n.em, nome: n.nome || '' })),
      trava_maquina: c.maquina,
      trava_pid: process.pid,
    }
  })

  const ex = V.execucao || {}
  const estado = {
    gerado_em: V.gerado_em,
    raiz: V.raiz,
    internet_ok: V.internet_ok !== false,
    execucao: {
      rodando: !!ex.rodando,
      vagas: ex.vagas ?? 0,
      max: ex.max ?? 0,
      execucoes: (ex.execucoes || []).map((x) => ({
        pasta: x.pasta, razao: x.razao, etapa: x.etapa, etapaTxt: x.etapaTxt, idxAtual: x.idxAtual,
        mensagem: x.mensagem || '', segundosDesde: x.segundosDesde ?? 0, travado: !!x.travado,
        // O painel de missão da Mesa desenha estes três; o cockpit já os lia
        // do mesmo lugar. Levar campo a mais não custa nada e evita que a tela
        // do CRM seja para sempre mais pobre que a da máquina.
        paradoHa: x.paradoHa ?? 0,
        etapas_seg: (x.etapas_seg || []).map((t) => ({ etapa: t.etapa, segundos: t.segundos })),
        retomadas: x.retomadas ?? 0,
      })),
    },
    varredura: V.varredura ? {
      novidades: V.varredura.novidades ?? 0, quando: V.varredura.quando ?? V.varredura.ultima_varredura ?? null,
      quando_txt: V.varredura.quando_txt ?? '', pastas: V.varredura.pastas ?? 0,
    } : null,
    contas: { ...(V.contas?.porFase || {}), total: V.contas?.total ?? pastas.length },
  }
  return { pastas, estado }
}

async function sincronizar() {
  const r0 = await retratoDoDisco()
  if (!r0) return
  const { pastas, estado } = r0
  if (!pastas.length && !estado) return
  const r = await crm('/api/esteira', { acao: 'sincronizar', maquina: c.maquina, pastas, estado })
  if (!r.ok) return console.error('  CRM recusou a sincronização:', r.erro)
  console.log(`  Esteira: ${pastas.length} pastas, ${r.criadas} novas, ${r.atualizadas} atualizadas.`)
  if (r.recusadas?.length) console.log('    Recusadas:', r.recusadas.join(' · '))
  if (r.publicar_pendentes?.length) await publicarPendentes(r.publicar_pendentes)
}

/* PUBLICAR SOZINHO O QUE JÁ FOI ANALISADO  ·  09/09/2026
   ---------------------------------------------------------------------------
   Antes disto, uma análise terminava e ficava invisível no CRM até alguém
   lembrar de rodar `npm run publicar`. Foi o que aconteceu com a Rialma: o
   card abriu sem Relatório, e o único caminho para ler e corrigir era abrir o
   sistema antigo. Um passo manual entre terminar a análise e poder trabalhar
   nela não é uma regra, é um tropeço.

   O CRM diz quais chaves estão analisadas e não publicadas; aqui elas são
   publicadas, uma a uma, com o mesmo `carga-analises.mjs --so <chave>
   --gravar` de sempre. Não sobrescreve edição feita no CRM: a carga respeita
   `editado_no_crm` e manda a divergência para `analise_conflitos`.

   Duas travas para isto não virar um moinho: uma chave que falha entra na
   lista negra da rodada (não se tenta de novo em looping), e nunca há duas
   cargas ao mesmo tempo. */
const naoPublicar = new Set()
let publicando = false

async function publicarPendentes(chaves) {
  const fila = chaves.filter((k) => !naoPublicar.has(k))
  if (!fila.length || publicando) return
  const carga = path.join(RAIZ_CRM, 'scripts', 'carga-analises.mjs')
  if (!fs.existsSync(carga)) return
  publicando = true
  try {
    for (const chave of fila) {
      const cod = await new Promise((resolve) => {
        const proc = spawn(process.execPath, [carga, '--so', chave, '--gravar'], {
          cwd: RAIZ_CRM, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
        })
        let erro = ''
        proc.stderr.on('data', (b) => { erro += b.toString() })
        proc.on('close', (c2) => {
          if (c2 === 0) console.log(`  Publicada sozinha no CRM: ${chave}`)
          else console.error(`  Nao consegui publicar ${chave}: ${erro.trim().split(/\r?\n/).slice(-1)[0] || 'codigo ' + c2}`)
          resolve(c2)
        })
      })
      if (cod !== 0) naoPublicar.add(chave)
    }
  } finally {
    publicando = false
  }
}

/* O MURAL E AS ALÇADAS sobem com a esteira: são o que a aba Recados e a tela
   de Alçadas do CRM desenham. Recado é lido do disco inteiro (`todos: true`),
   porque o arquivado continua sendo história. */
async function sincronizarMural() {
  const Recados = await mod('recados.mjs').catch(() => null)
  if (!Recados) return
  let lista = []
  try { lista = Recados.listar({ todos: true, limite: 300 }).recados || [] } catch (e) { return console.error('  recados:', e.message) }
  let relatorio = null, escrevendo = false
  try {
    const Auditoria = await mod('auditoria.mjs')
    relatorio = Auditoria?.ultimo?.() ?? null
    escrevendo = !!Auditoria?.escrevendoAgora?.()
  } catch { }
  const r = await crm('/api/esteira', { acao: 'recados', recados: lista, relatorio, escrevendo })
  if (!r.ok) console.error('  CRM recusou o mural:', r.erro)
}

/* AS CONVERSAS DA IA DE GESTÃO sobem inteiras: são 37 assuntos e ~160 falas
   que ele acumulou desde 12/08/2026, e sem elas a IA no CRM parece um sistema
   recém-instalado. O disco é a fonte (o `conversas.mjs`), e o CRM espelha.

   O id da fala é `motor:<conversa>:<índice>`: o jsonl é append-only, então o
   índice não muda e o upsert nunca duplica uma fala já espelhada. */
async function sincronizarConversas() {
  const Conversas = await mod('conversas.mjs').catch(() => null)
  if (!Conversas) return
  try {
    const lista = Conversas.listar()
    if (!lista.length) return
    const conversas = lista.map((c) => ({
      id: c.id, titulo: c.titulo || '', titulo_dele: !!c.titulo_dele,
      criada: c.criada, ultima: c.ultima, trocas: c.trocas ?? 0,
    }))
    const mensagens = []
    for (const c of lista) {
      const msgs = Conversas.ler(c.id, { limite: 500 })
      msgs.forEach((m, i) => {
        if (!m?.texto) return
        mensagens.push({
          id: `motor:${c.id}:${i}`, conversa_id: c.id,
          quem: m.quem === 'ia' ? 'ia' : 'marco',
          texto: String(m.texto), em: m.em, segundos: m.segundos ?? null,
        })
      })
    }
    const r = await crm('/api/esteira', { acao: 'conversas', conversas, mensagens, atual: Conversas.atual() })
    if (!r.ok) console.error('  CRM recusou as conversas:', r.erro)
    else if (r.conversas) console.log(`  Conversas da IA: ${r.conversas} assunto(s), ${r.mensagens} fala(s).`)
  } catch (e) { console.error('  conversas:', e.message) }
}

async function sincronizarAlcadas() {
  const Alcadas = await mod('alcadas.mjs').catch(() => null)
  if (!Alcadas) return
  try {
    const cat = Alcadas.catalogo()
    const ped = Alcadas.pedidos({})
    const dia = Alcadas.diario({ limite: 120 })
    const r = await crm('/api/esteira', { acao: 'alcadas', catalogo: cat.acoes || [], pedidos: ped.pedidos || [], diario: dia.linhas || [] })
    if (!r.ok) console.error('  CRM recusou as alçadas:', r.erro)
  } catch (e) { console.error('  alcadas:', e.message) }
}

// ── 3. as ordens que uma pessoa deu ─────────────────────────────────────────
async function executarOrdens(ordens) {
  const Fila = await carregarMotor()
  for (const o of ordens) {
    console.log(`  Ordem "${o.ordem}" em "${o.pasta}" (${o.ordem_por ?? 'alguém'})`)
    const dados = o.ordem_dados || {}
    const instrucoes = String(o.instrucao || dados.instrucao || '').trim()
    const modo = String(o.modo || dados.modo || '')
    const feito = (resultado) => crm('/api/esteira', { acao: 'ordem-aceita', id: o.id, resultado })
    const falhou = (erro) => crm('/api/esteira', { acao: 'ordem-falhou', id: o.id, erro })
    const local = await servidorLocal()

    try {
      if (o.ordem === 'pausar' || o.ordem === 'retomar') {
        // Estas duas já mudaram a situação no CRM na hora do clique: valem
        // sozinhas, sem nada precisar rodar. Aqui é só dar baixa no pedido.
        await feito(o.ordem === 'pausar' ? 'Parada.' : 'De volta à fila.')
        continue
      }

      if (o.ordem === 'parar') {
        if (local) {
          const r = await servidor('/api/parar/' + encodeURIComponent(o.pasta), {})
          await (r.ok ? feito('Interrompida.') : falhou(r.erro || r.motivo || 'o servidor recusou'))
        } else {
          const r = Fila?.parar?.(o.pasta, `Interrompida por ${o.ordem_por ?? 'alguém'} pelo CRM.`)
          await (r?.ok === false ? falhou(r.motivo || 'não consegui parar') : feito('Interrompida.'))
        }
        continue
      }

      if (o.ordem === 'reconferir') {
        if (local) {
          const r = await servidor('/api/destravar/' + encodeURIComponent(o.pasta), {})
          await (r.ok
            ? feito(r.destravou ? `Reli a pasta e destravou: ${r.motivo || 'os documentos estão aí.'}`
              : r.anexos_extraidos ? `Abri o e-mail e tirei ${r.anexos_extraidos} anexo(s).`
                : 'Reli a pasta. ' + (r.motivo || ''))
            : falhou(r.erro || r.motivo || 'não consegui reler'))
        } else {
          const D = await mod('destravar.mjs')
          const r = D?.destravar?.(o.pasta)
          try { Fila?.listar?.() } catch { }
          await (r?.ok ? feito(r.destravou ? 'Reli a pasta e destravou.' : 'Reli a pasta.') : falhou(r?.motivo || 'não consegui reler'))
        }
        await sincronizar()
        continue
      }

      if (o.ordem === 'forcar') {
        if (local) {
          const r = await servidor('/api/destravar/' + encodeURIComponent(o.pasta), {
            forcar: true, analisar: true, instrucoes, modo, motivo: dados.motivo || '',
          })
          await (r.ok && r.analisando
            ? feito('Comecei a análise.' + (r.liberada ? ' Liberada por você, com o que falta registrado.' : ''))
            : falhou(r.erro || r.motivo || (r.destravou ? 'destravou, mas a análise não começou' : 'o servidor recusou')))
        } else {
          const Cad = await mod('cadastro.mjs')
          try { Cad?.liberar?.(o.pasta, `Você mandou analisar mesmo assim (${o.ordem_por ?? 'CRM'}).`) } catch (e) { await falhou(e.message); continue }
          try { Fila?.listar?.() } catch { }
          await iniciarSemServidor(o, instrucoes, modo, feito, falhou)
        }
        continue
      }

      if (o.ordem === 'refazer') {
        if (local) {
          const r = await servidor('/api/refazer/' + encodeURIComponent(o.pasta), { instrucao: instrucoes, escopo: dados.escopo || 'completa' })
          await (r.ok ? feito('De volta à fila para refazer.') : falhou(r.erro || r.motivo || 'o servidor recusou'))
        } else {
          const r = Fila?.refazer?.(o.pasta, { instrucao: instrucoes, escopo: dados.escopo || 'completa' })
          await (r?.ok === false ? falhou(r.motivo || 'não consegui refazer') : feito('De volta à fila para refazer.'))
        }
        await sincronizar()
        continue
      }

      if (o.ordem === 'ler_pasta') {
        const B = await mod('biblioteca.mjs')
        if (!B?.lerAPasta) { await falhou('este motor não tem o bibliotecário'); continue }
        await feito('O bibliotecário começou a ler a pasta. Leva alguns minutos; a aba Arquivos avisa quando terminar.')
        // Vai solto: leva minutos, e a rodada não pode ficar presa nele.
        B.lerAPasta(o.pasta, o.chave || '').then(() => sincronizar()).catch((e) => console.error('  bibliotecario:', e.message))
        continue
      }

      /* PUBLICAR: roda a carga SÓ para esta análise (`--so <chave>`), que é o
         mesmo `npm run publicar` de sempre, com um filtro. A chave é o id da
         análise no acervo (`analise_chave`), e sem ela não há o que publicar:
         a pasta terminou sem gravar o resultado no disco.

         Vai solto e a rodada não espera: a carga leva dezenas de segundos, e
         segurar o agente aqui atrasaria tudo o mais. Quem avisa o fim é o
         `ultima_ordem_resultado`, como em toda ordem. */
      if (o.ordem === 'publicar') {
        const chave = String(o.analise_chave || dados.chave || '').trim()
        if (!chave) { await falhou('esta pasta não tem análise no acervo para publicar'); continue }
        const carga = path.join(RAIZ_CRM, 'scripts', 'carga-analises.mjs')
        if (!fs.existsSync(carga)) { await falhou('não achei o scripts/carga-analises.mjs nesta máquina'); continue }
        await feito('Publicando no banco do CRM. Leva alguns segundos.')
        const proc = spawn(process.execPath, [carga, '--so', chave, '--gravar'], {
          cwd: RAIZ_CRM, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        })
        let saida = ''
        proc.stdout.on('data', (b) => { saida += b.toString() })
        proc.stderr.on('data', (b) => { saida += b.toString() })
        proc.on('close', async (cod) => {
          const cauda = saida.trim().split(/\r?\n/).slice(-3).join(' · ').slice(0, 400)
          if (cod === 0) console.log(`  Publicada: ${chave}`)
          else console.error(`  Carga falhou (${cod}): ${cauda}`)
          await crm('/api/esteira', {
            acao: cod === 0 ? 'ordem-aceita' : 'ordem-falhou', id: o.id,
            [cod === 0 ? 'resultado' : 'erro']: cod === 0 ? 'Publicada no banco do CRM.' : `a carga não gravou: ${cauda}`,
          }).catch(() => { })
          await sincronizar().catch(() => { })
        })
        continue
      }

      if (o.ordem === 'iniciar') {
        if (local) {
          const r = await servidor('/api/analisar', { pastas: [o.pasta], chave: o.chave || '', instrucoes, modo })
          await (r.ok ? feito(r.mensagem || 'Comecei a análise.') : falhou(r.erro || r.motivo || 'o servidor recusou'))
          continue
        }
        await iniciarSemServidor(o, instrucoes, modo, feito, falhou)
        continue
      }

      await falhou(`ordem "${o.ordem}" desconhecida neste agente`)
    } catch (e) {
      console.error('   ', e.message)
      await falhou(e.message)
    }
  }
}

/* SEM O SERVIDOR LOCAL, vale o que já valia: com `rodar_sozinho` desligado, o
   agente ENTREGA o comando para ele colar; ligado, sobe o Claude ele mesmo. */
async function iniciarSemServidor(o, instrucoes, modo, feito, falhou) {
  if (instrucoes) {
    /* NÃO ENGOLIR ESTA FALHA. Rodar a análise achando que a ordem chegou é
       pior do que não rodar: o relatório sai sem o que ele mandou observar, e
       ninguém descobre. É a mesma regra do `/api/analisar` do servidor. */
    try {
      fs.writeFileSync(path.join(c.raiz, o.pasta, '_instrucoes.txt'), `[ordem dada pelo CRM, ${new Date().toLocaleString('pt-BR')}]\nO QUE OBSERVAR NESTA ANALISE:\n${instrucoes}\n`, 'utf8')
    } catch (e) {
      console.error('    _instrucoes.txt:', e.message)
      await falhou(`nao consegui gravar o que voce mandou observar (${e.message}). Nao comecei: a analise rodaria sem a sua ordem.`)
      return
    }
  }
  const comando = `/analise ${o.pasta}`
  if (!c.rodar_sozinho) {
    console.log('\n  ┌─ Para rodar esta análise, cole numa sessão do Claude Code:')
    console.log(`  │  ${comando}`)
    console.log('  └─ (ligue "rodar_sozinho" no esteira.json, ou suba o Sistema de Análise, para eu fazer isso sozinho)\n')
    await crm('/api/esteira', {
      acao: 'progresso', id: o.id, etapa: 'fila',
      mensagem: `Pasta pronta no notebook. O Sistema de Análise está desligado: rode "${comando}" numa sessão do Claude Code, ou abra o Analisar.cmd.`,
      maquina: c.maquina, pid: process.pid,
    })
    await feito(`O sistema local está desligado. Entreguei o comando "${comando}" no terminal do agente.`)
    return
  }
  await feito('Subindo o Claude para analisar.')
  await rodarAnalise(o, modo)
}

/* RODAR A ANÁLISE SOZINHO. Só entra aqui com `rodar_sozinho` ligado à mão e o
   servidor local desligado. É o mesmo `/analise <pasta>` que ele digita hoje,
   na mesma máquina, com o mesmo binário e a mesma assinatura. */
function rodarAnalise(o) {
  return new Promise(async (resolver) => {
    const { acharClaude } = await import(pathToFileURL(path.join(c.raiz, '_sistema', 'ponte.mjs')).href)
    const bin = acharClaude()
    if (!bin) {
      await crm('/api/esteira', { acao: 'erro', id: o.id, erro: 'Não achei o Claude nesta máquina.' })
      return resolver()
    }

    console.log(`  Rodando /analise ${o.pasta}…`)
    const proc = spawn(bin, [
      '--permission-mode', 'acceptEdits',
      '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '-p', `/analise ${o.pasta}`,
    ], { cwd: c.raiz, windowsHide: true })

    let resto = ''
    let ultimoAviso = 0
    proc.stdout.on('data', async (d) => {
      resto += d.toString('utf8')
      const linhas = resto.split('\n')
      resto = linhas.pop()
      for (const l of linhas) {
        let ev
        try { ev = JSON.parse(l) } catch { continue }
        const texto = ev?.message?.content?.find?.((x) => x.type === 'text')?.text
        // Uma batida a cada 20s: cada evento viraria dezenas de escritas por minuto.
        if (texto && Date.now() - ultimoAviso > 20_000) {
          ultimoAviso = Date.now()
          await crm('/api/esteira', {
            acao: 'progresso', id: o.id, etapa: 'leitura',
            mensagem: String(texto).replace(/\s+/g, ' ').slice(0, 200),
            maquina: c.maquina, pid: proc.pid,
          })
        }
      }
    })

    let erro = ''
    proc.stderr.on('data', (d) => { erro += d.toString('utf8') })

    proc.on('close', async (codigo) => {
      if (codigo === 0) {
        console.log('    Terminou. O motor grava o resultado; a próxima sincronização confirma.')
      } else {
        await crm('/api/esteira', {
          acao: 'erro', id: o.id,
          erro: `A análise terminou com erro ${codigo}. ${erro.slice(0, 400)}`,
        })
        console.error(`    Terminou com erro ${codigo}.`)
      }
      resolver()
    })
  })
}

// ── 4. o que o CRM decidiu sobre coisa que mora no disco ────────────────────
async function aplicarDecisoes(ordem) {
  // recados lidos / arquivados no CRM
  if (ordem.recados_marcados?.length) {
    const Recados = await mod('recados.mjs').catch(() => null)
    if (Recados) {
      const lidos = ordem.recados_marcados.filter((r) => r.lido_no_crm_em && r.id !== 'relatorio').map((r) => r.id)
      const arquivados = ordem.recados_marcados.filter((r) => r.arquivado_no_crm_em && r.id !== 'relatorio').map((r) => r.id)
      try { if (lidos.length) Recados.marcarLido(lidos) } catch (e) { console.error('  lido:', e.message) }
      try { if (arquivados.length) Recados.arquivar(arquivados) } catch (e) { console.error('  arquivar:', e.message) }
      await crm('/api/esteira', { acao: 'recados-ok', ids: ordem.recados_marcados.map((r) => r.id) })
    }
  }

  // alçadas: autorizar / negar / redefinir
  if (ordem.alcadas_decisoes?.length || ordem.alcadas_definidas?.length) {
    const Alcadas = await mod('alcadas.mjs').catch(() => null)
    const local = await servidorLocal()
    const pedidosOk = [], acoesOk = []
    for (const d of ordem.alcadas_decisoes || []) {
      try {
        const por = d.decisao_crm_por || 'marco'
        let r
        if (d.decisao_crm === 'negar') {
          r = local ? await servidor(`/api/alcadas/pedido/${encodeURIComponent(d.id)}/negar`, { motivo: d.decisao_crm_motivo || '' })
            : Alcadas?.negar?.(d.id, { por, motivo: d.decisao_crm_motivo || '' })
        } else {
          const sempre = d.decisao_crm === 'autorizar_sempre'
          // O servidor tem os executores (o `analisar` é injetado por ele); o
          // módulo sozinho não sabe disparar análise. Por isso o servidor vem
          // primeiro, e o módulo é a rede para quem não está com ele de pé.
          r = local ? await servidor(`/api/alcadas/pedido/${encodeURIComponent(d.id)}/autorizar`, { liberar_sempre: sempre })
            : await Alcadas?.autorizar?.(d.id, { por, liberar_sempre: sempre })
        }
        console.log(`  Alçada ${d.decisao_crm} em ${d.id}: ${r?.ok ? 'ok' : (r?.motivo || r?.erro || 'falhou')}`)
      } catch (e) { console.error('  alcada:', e.message) }
      pedidosOk.push(d.id)
    }
    for (const a of ordem.alcadas_definidas || []) {
      try {
        const r = local ? await servidor('/api/alcadas/definir', { acao: a.acao, alcada: a.alcada, motivo: 'definida no CRM' })
          : Alcadas?.definir?.(a.acao, a.alcada, { por: a.alterado_por || 'marco', motivo: 'definida no CRM' })
        console.log(`  Alçada de ${a.acao} -> ${a.alcada}: ${r?.ok ? 'ok' : (r?.motivo || 'falhou')}`)
      } catch (e) { console.error('  definir:', e.message) }
      acoesOk.push(a.acao)
    }
    await crm('/api/esteira', { acao: 'alcadas-ok', pedidos: pedidosOk, acoes: acoesOk })
    await sincronizarAlcadas()
  }

  // arquivos tirados da análise pelo CRM
  if (ordem.arquivos_fora?.length) {
    const Arquivos = await mod('arquivos.mjs').catch(() => null)
    if (Arquivos) {
      for (const f of ordem.arquivos_fora) {
        try {
          const lista = Arquivos.listar(f.pasta, f.chave || '')
          const fora = new Set(f.arquivos_fora || [])
          let mudou = 0
          for (const a of lista.arquivos || []) {
            if (a.ignorado) continue
            const quer = !fora.has(a.rel)
            if (a.usar !== quer) { Arquivos.escolher(f.chave || '', a.rel, quer); mudou++ }
          }
          if (mudou) console.log(`  Seleção de "${f.pasta}": ${mudou} arquivo(s) ajustado(s).`)
        } catch (e) { console.error('  selecao:', e.message) }
      }
    }
  }

  // os comandos da Mesa
  for (const cmd of ordem.comandos || []) {
    await crm('/api/esteira', { acao: 'comando-aceito', id: cmd.id })
    try {
      if (cmd.comando === 'varrer') {
        const local = await servidorLocal()
        const r = local ? await servidor('/api/varredura', {}) : (await mod('varredura.mjs'))?.varrer?.()
        const n = r?.novidades ?? r?.pastas_novas?.length ?? 0
        await crm('/api/esteira', { acao: 'comando-feito', id: cmd.id, resultado: `Varri. ${n} novidade(s).` })
        await sincronizar()
      } else if (cmd.comando === 'relatorio') {
        const local = await servidorLocal()
        const r = local ? await servidor('/api/auditoria', {}) : await (await mod('auditoria.mjs'))?.reportar?.()
        await crm('/api/esteira', { acao: 'comando-feito', id: cmd.id, resultado: r?.ok === false ? (r.motivo || 'não deu') : 'Relatório pedido ao auditor-chefe.' })
        await sincronizarMural()
      }
    } catch (e) {
      await crm('/api/esteira', { acao: 'comando-feito', id: cmd.id, resultado: 'Não deu: ' + e.message })
    }
  }
}

/* ── 5. A IA ─────────────────────────────────────────────────────────────────
   A pergunta nasce no CRM (de qualquer lugar, inclusive do celular) e é
   respondida AQUI, com o claude.exe desta máquina pela assinatura que já se
   paga. Gasto de IA: zero, pelo mesmo motivo do resto da esteira.

   Três auditores, e a régua do ia-card.mjs decide qual:
     escopo gestao ............ gestao.mjs, o acervo inteiro
     escopo analise + análise . ia.mjs, a MESMA conversa do relatório
     escopo analise sem análise ia-card.mjs, ancorado na pasta do tomador

   Uma por rodada, de propósito: uma resposta leva de 20 a 90 segundos, e
   enfileirar três aqui deixaria a esteira parada nesse tempo.

   Ela SÓ RESPONDE E SUGERE: nenhum dos três tem Write, Edit nem Bash na lista
   de ferramentas. A garantia é técnica, não é promessa escrita no preâmbulo. */
async function responderIA(pedidos) {
  const pedido = pedidos[0]
  if (!pedido) return

  const pego = await crm('/api/esteira', { acao: 'ia-pegar', id: pedido.id, maquina: c.maquina })
  if (!pego.ok || !pego.pegou) return  // outra máquina pegou primeiro

  console.log(`  IA (${pedido.escopo}): "${String(pedido.pergunta).slice(0, 70)}…"`)
  try {
    let r
    if (pedido.escopo === 'analise') {
      if (pedido.analise_chave) {
        const Ia = await mod('ia.mjs')
        r = await Ia.conversar(String(pedido.analise_chave), String(pedido.pergunta))
      } else if (pedido.pasta) {
        const IaCard = await mod('ia-card.mjs')
        r = await IaCard.conversar(String(pedido.chave || pedido.pasta), String(pedido.pasta), String(pedido.pergunta))
      } else {
        throw new Error('Este card não tem pasta na raiz nem análise no banco: não há material para a IA ler.')
      }
    } else {
      const gestao = await mod('gestao.mjs')
      if (typeof gestao?.conversar !== 'function') throw new Error('O gestao.mjs desta máquina não expõe `conversar`.')
      /* A pergunta cai NA CONVERSA que ele escolheu na tela. O `conversar`
         aceita o id direto (`Conversas.escolher`), e cria a pasta na primeira
         fala se a conversa nasceu no CRM — por isso o CRM gera o id no mesmo
         formato do motor. Separar assunto é separar a memória: sem passar o
         id, tudo cairia no assunto aberto no notebook. */
      r = await gestao.conversar(String(pedido.pergunta), pedido.conversa_id ? { id: String(pedido.conversa_id) } : {})
    }
    if (!r?.ok) throw new Error(r?.motivo ?? 'a IA recusou a pergunta')
    const texto = String(r.resposta ?? '').trim()
    if (!texto) throw new Error('A IA não devolveu texto.')

    await crm('/api/esteira', { acao: 'ia-resposta', id: pedido.id, resposta: texto, maquina: c.maquina })
    console.log('  IA: respondida.')
  } catch (e) {
    await crm('/api/esteira', { acao: 'ia-resposta', id: pedido.id, erro: String(e.message ?? e), maquina: c.maquina })
    console.error('  IA falhou:', e.message ?? e)
  }
}

// ── a rodada ────────────────────────────────────────────────────────────────
let ultimaSincronia = 0

async function rodada({ forcar = false } = {}) {
  const ordem = await crm(`/api/esteira?maquina=${encodeURIComponent(c.maquina)}`)
  if (!ordem.ok) return console.error('CRM:', ordem.erro ?? `HTTP ${ordem.status}`)

  // Materializar e executar vêm PRIMEIRO: alguém está olhando a tela esperando.
  if (ordem.a_materializar?.length) await materializar(ordem.a_materializar)
  if (ordem.ordens?.length) await executarOrdens(ordem.ordens)
  await aplicarDecisoes(ordem)
  // Depois das ordens: quem perguntou está olhando a tela, mas quem mandou
  // analisar está esperando há mais tempo.
  if (ordem.ia?.length) {
    await responderIA(ordem.ia)
    // A fala que acabou de ser escrita no jsonl sobe na hora: quem perguntou
    // está com a tela aberta esperando ela aparecer no fio.
    await sincronizarConversas()
  }

  if (forcar || Date.now() - ultimaSincronia >= c.sincronia_seg * 1000) {
    ultimaSincronia = Date.now()
    await sincronizar()
    await sincronizarMural()
    await sincronizarAlcadas()
    await sincronizarConversas()
    // Execução que morreu sem avisar volta para a fila. A conta é do servidor.
    const f = await crm('/api/esteira', { acao: 'faxina' })
    if (f.ok && f.devolvidas) console.log(`  ${f.devolvidas} análise(s) travada(s) voltaram para a fila.`)
  }
}

// ── entrada ─────────────────────────────────────────────────────────────────
const cmd = process.argv[2] ?? ''

if (!c.token) {
  console.error('Falta o segredo. Ponha CARTEIRO_TOKEN no ambiente ou "token" no esteira.json.')
  process.exit(1)
}

if (cmd === 'diagnostico') {
  const m = await carregarMotor()
  console.log('Motor           :', m ? 'carregado de ' + path.join(c.raiz, '_sistema', 'fila.mjs') : 'NÃO carregado')
  console.log('Servidor local  :', (await servidorLocal()) ? c.servidor + ' (de pé)' : c.servidor + ' (desligado)')
  console.log('CRM             :', c.url)
  const r = await crm(`/api/esteira?maquina=${encodeURIComponent(c.maquina)}`)
  console.log('Resposta do CRM :', r.ok ? `${r.fila?.length ?? 0} na fila, ${r.ordens?.length ?? 0} ordem(ns), ${r.ia?.length ?? 0} pergunta(s)` : `NÃO respondeu (${r.erro ?? r.status})`)
  console.log('Rodar sozinho   :', c.rodar_sozinho ? 'LIGADO' : 'desligado (entrega o comando para você colar)')
} else if (cmd === 'uma-vez') {
  await rodada({ forcar: true })
} else {
  console.log(`Esteira de pé. CRM em ${c.url}.`)
  console.log(`Raiz das análises: ${c.raiz || '(faltando no esteira.json)'}`)
  console.log(`Sistema de Análise local: ${c.servidor} (${(await servidorLocal()) ? 'de pé' : 'desligado'}).`)
  console.log(`Rodar sozinho: ${c.rodar_sozinho ? 'LIGADO' : 'desligado'}. Deixe esta janela aberta. Ctrl+C para parar.\n`)
  await rodada({ forcar: true })
  let rodando = false
  setInterval(async () => {
    if (rodando) return
    rodando = true
    try { await rodada() } catch (e) { console.error('Rodada falhou:', e.message) }
    finally { rodando = false }
  }, Math.max(c.batida_seg, 3) * 1000)
}
