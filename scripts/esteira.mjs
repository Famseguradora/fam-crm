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
import { atenderComplementos } from './complemento.mjs'

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
    // O robô do Serasa (scripts/serasa.mjs). Ligado por decisão dele em
    // 14/09/2026; "serasa": false no esteira.json desliga sem mexer em código.
    serasa: arq.serasa !== false,
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

/* A PASTA É NOME, NUNCA CAMINHO (11/09/2026, achado da revisão de segurança).
   O nome vem do banco, e um "..\..\AppData\...\Startup" gravado por quem pode
   escrever na fila faria este agente baixar anexo para fora das análises. O
   banco já recusa esse nome (restrição `analise_fila_pasta_e_nome`); esta é a
   segunda trava, do lado de quem grava no disco. */
function pastaDentroDaRaiz(pasta) {
  const raiz = path.resolve(c.raiz)
  const dir = path.resolve(raiz, String(pasta ?? ''))
  if (!pasta || !dir.startsWith(raiz + path.sep)) throw new Error(`pasta fora da raiz das analises: "${pasta}"`)
  return dir
}

// ── 2. materializar: o caso do CRM vira pasta no disco ──────────────────────
/* Este é o passo que faltava para a análise COMEÇAR dentro do CRM. O e-mail
   entrou pela Caixa, virou caso, a Triagem conferiu, e os documentos estão no
   Storage. O motor lê arquivo. Aqui os dois mundos se encontram. */
async function materializar(pendentes) {
  for (const p of pendentes) {
    let destino
    try { destino = pastaDentroDaRaiz(p.pasta) } catch (e) {
      console.error('   ', e.message)
      await crm('/api/esteira', { acao: 'erro', id: p.id, erro: `Nome de pasta recusado: ${e.message}` })
      continue
    }
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
      /* A MARCA DE "NASCEU NO CRM" (10/09/2026). Sem ela, a triagem do motor
         batizava a pasta com o que achasse nos documentos: a da C.e.I. virou
         "Extincao de Filial na UF da Sede", título de uma alteração contratual,
         a análise rodou com esse nome e o card do CRM ficou parado em "Na fila".
         Com a marca, a triagem não renomeia; quem batiza é a análise, no fim.
         Começa com `_`: fica fora do hash dos documentos. */
      try {
        const marca = path.join(destino, '_crm.json')
        if (!fs.existsSync(marca)) {
          fs.writeFileSync(marca, JSON.stringify({
            origem: 'crm', fila_id: p.id, caso_id: p.caso_id ?? null, cnpj: p.cnpj ?? null,
            razao_social: p.razao_social ?? null, pasta: p.pasta, em: new Date().toISOString(),
          }, null, 2), 'utf8')
        }
      } catch (e) { console.error('    _crm.json:', e.message) }
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
      // A marca de "montada": documento que chegar depois faz a pasta voltar aqui.
      if (baixados) await crm('/api/esteira', { acao: 'materializado', id: p.id })

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

/* O NOME ANTIGO DA PASTA  ·  10/09/2026
   A análise renomeia a pasta ao terminar, e o CRM só junta os dois cards se
   souber de onde a pasta veio (`pasta_anterior`). Este agente nunca mandava:
   toda análise que batizava a pasta deixava na Mesa um card fantasma parado em
   "analisando" (a Rialma em 09/09, a Bouw em 10/09). Quem sabe a corrente de
   nomes é o motor, no `_sistema/registro/renomeacoes.json`, o mesmo arquivo que
   o `visao.mjs pastaAtual()` lê. Aqui ele é lido AO CONTRÁRIO: do nome de hoje
   para os de antes.

   SÓ AS TROCAS RECENTES. O log guarda meses, e assunto de e-mail se repete:
   um nome que virou uma empresa em agosto pode voltar amanhã como outra. A
   sincronização roda a cada 90 s, então a troca de hoje chega ao CRM no mesmo
   minuto; troca velha não tem mais o que juntar. O CRM ainda confere o CNPJ
   antes de juntar. */
const DIAS_DE_TROCA = 3
function anotarNomesAntigos(pastas) {
  let trocas = []
  try {
    const bruto = fs.readFileSync(path.join(c.raiz, '_sistema', 'registro', 'renomeacoes.json'), 'utf8')
    const log = JSON.parse(bruto.replace(/^﻿/, ''))
    const desde = Date.now() - DIAS_DE_TROCA * 86400000
    trocas = (Array.isArray(log?.renomeacoes) ? log.renomeacoes : [])
      .filter((x) => x?.de && x?.para && new Date(x.em).getTime() >= desde)
  } catch { return }
  if (!trocas.length) return
  for (const p of pastas) {
    const antigos = []
    let atual = p.pasta
    for (let i = 0; i < 6; i++) {
      const salto = [...trocas].reverse().find((x) => x.para === atual && x.de !== atual && !antigos.includes(x.de))
      if (!salto) break
      antigos.push(salto.de)
      atual = salto.de
    }
    if (antigos.length) {
      p.pasta_anterior = antigos[0]
      p.pastas_anteriores = antigos
    }
  }
}

async function sincronizar() {
  const r0 = await retratoDoDisco()
  if (!r0) return
  const { pastas, estado } = r0
  if (!pastas.length && !estado) return
  temExecucaoViva = !!estado?.execucao?.rodando || pastas.some((p) => p.situacao === 'em_andamento')
  anotarNomesAntigos(pastas)
  const r = await crm('/api/esteira', { acao: 'sincronizar', maquina: c.maquina, pastas, estado })
  if (!r.ok) return console.error('  CRM recusou a sincronização:', r.erro)
  console.log(`  Esteira: ${pastas.length} pastas, ${r.criadas} novas, ${r.atualizadas} atualizadas.`)
  if (r.recusadas?.length) console.log('    Recusadas:', r.recusadas.join(' · '))
  if (r.publicar_pendentes?.length) await publicarPendentes(r.publicar_pendentes)
}

/* A PASTA QUE SAIU DO COMPUTADOR  ·  10/09/2026
   ---------------------------------------------------------------------------
   Pedido dele: terminada a análise e recortada a pasta para a rede da FAM, o
   card não precisa mais ficar na Mesa. O agente sempre soube que a pasta tinha
   sumido (ele parava de mandá-la), mas nunca DIZIA: o card ficava parado no
   banco para sempre. Foi o que aconteceu com Rialma, Renova Energia e BOUW.

   Aqui a fila do banco é comparada com os nomes da raiz e do _concluidas
   (qualquer idade, e não só as 24 h que o visao.mjs mostra como "Pronta").
   Quem decide o que sai da Mesa é o CRM (`naMesa`); este lado só informa.

   AS QUATRO TRAVAS, porque marcar errado some com card de verdade:
     · OneDrive caído ou raiz errada: se a listagem falhar ou vier sem o
       _sistema, NÃO se marca nada nesta rodada.
     · Pasta renomeada pela análise: o nome velho some antes de o CRM juntar os
       dois cards. Por isso a pasta tem que faltar por FORA_MIN minutos
       seguidos; se reaparecer no meio, a contagem zera.
     · Card que ainda não teve pasta (nasceu no CRM e espera ser montado), que
       está rodando, ou que tem ordem na mão (o Excluir move para _excluidas e
       apaga o card): fica de fora da conta.
     · Windows não diferencia maiúscula, o banco guarda o nome aparado (o
       `texto()` da rota faz trim) e acento pode vir em NFC ou NFD: os dois
       lados passam pela mesma `chaveDaPasta`.
   _excluidas NÃO conta como presente: pasta lá é pasta fora da esteira. */
const FORA_MIN = 5
const faltando = new Map()   // id do card -> desde quando a pasta falta

const chaveDaPasta = (nome) => String(nome ?? '').normalize('NFC').trim().toLowerCase()

function nomesNoDisco() {
  const pastas = (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => chaveDaPasta(d.name))
  let raiz, concluidas
  try {
    raiz = pastas(c.raiz)
    concluidas = pastas(path.join(c.raiz, '_concluidas'))
  } catch { return null }
  /* _concluidas VAZIO VALE (14/09/2026): recortar a última pasta de lá é o
     gesto normal dele, e a trava antiga fazia esse card nunca sair da Mesa.
     O OneDrive caído continua barrado pelo _sistema na raiz e pelos FORA_MIN
     minutos seguidos; marca errada em concluída se desfaz no `de_volta`. */
  if (!raiz.includes('_sistema')) return null
  return new Set([...raiz, ...concluidas])
}

/* `agora: true` é o botão Varrer de Novo (17/09/2026): ele clicou porque acabou de
   recortar pastas, então a pasta que falta sai já, sem os FORA_MIN minutos. As
   outras travas continuam valendo. Devolve o que fez, ou null se o disco não
   pôde ser lido (e aí nada foi marcado). */
async function conferirDisco(fila, { agora: ja = false } = {}) {
  if (!c.raiz || !Array.isArray(fila) || !fila.length) return { marcadas: 0, limpas: 0 }
  const disco = nomesNoDisco()
  if (!disco) return null
  const agora = Date.now()
  const fora = []
  const deVolta = []
  const vistos = new Set()
  for (const f of fila) {
    if (!f?.id || !f.pasta) continue
    vistos.add(f.id)
    if (disco.has(chaveDaPasta(f.pasta))) {
      faltando.delete(f.id)
      if (f.fora_do_disco_em) deVolta.push(f.id)
      continue
    }
    if (f.fora_do_disco_em) { faltando.delete(f.id); continue }
    if (!f.sincronizado_em || f.situacao === 'em_andamento' || f.ordem) { faltando.delete(f.id); continue }
    if (ja) { fora.push(f.id); continue }
    const desde = faltando.get(f.id)
    if (!desde) { faltando.set(f.id, agora); continue }
    if (agora - desde >= FORA_MIN * 60000) fora.push(f.id)
  }
  for (const id of [...faltando.keys()]) if (!vistos.has(id)) faltando.delete(id)
  if (!fora.length && !deVolta.length) return { marcadas: 0, limpas: 0 }
  const r = await crm('/api/esteira', { acao: 'fora_do_disco', fora, de_volta: deVolta })
  if (!r.ok) { console.error('  CRM recusou a marca de pasta fora do computador:', r.erro); throw new Error(r.erro || 'o CRM recusou a marca') }
  for (const id of fora) faltando.delete(id)
  if (r.marcadas) console.log(`  ${r.marcadas} pasta(s) saíram do computador: análise concluída sai da Mesa.`)
  if (r.limpas) console.log(`  ${r.limpas} pasta(s) voltaram ao computador.`)
  return { marcadas: r.marcadas ?? 0, limpas: r.limpas ?? 0 }
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
    /* SÓ FALA QUANDO ALGO MUDOU (17/09/2026). Desde que o CRM passou a gravar
       apenas o que mudou, a rodada normal devolve zero — e uma linha dizendo
       "0 assuntos, 0 falas" a cada 10 segundos pareceria pane, quando é o
       contrário: é o sistema não fazendo trabalho à toa. Quando muda, o log
       diz o que mudou E de quanto era o total, para não sumir a referência. */
    else if (r.conversas || r.mensagens) {
      console.log(
        `  Conversas da IA: ${r.conversas} assunto(s) e ${r.mensagens} fala(s) mudaram ` +
        `(de ${conversas.length} e ${mensagens.length}).`,
      )
    }
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
    let instrucoes = String(o.instrucao || dados.instrucao || '').trim()
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

      /* EXCLUIR (10/09/2026): o caso repetido saiu da triagem no CRM. A pasta vai
         para `_excluidas` pela mesma função do motor que o cockpit usa (nada é
         apagado), e só depois o CRM tira o card: senão a próxima sincronização
         acharia a pasta na raiz e recriaria o card. */
      if (o.ordem === 'excluir') {
        let r
        if (local) r = await servidor('/api/excluir/' + encodeURIComponent(o.pasta), { id: '' })
        else { try { r = Fila?.excluir?.(o.pasta, '') } catch (e) { r = { ok: false, motivo: e.message } } }
        if (r?.ok === false) { await falhou(r.erro || r.motivo || 'não consegui tirar a pasta da esteira'); continue }
        await crm('/api/esteira', { acao: 'excluida', id: o.id, resultado: r?.motivo || 'A pasta foi para _excluidas.' })
        console.log(`    Excluída: "${o.pasta}"`)
        continue
      }

      /* LIBERAR A TRIAGEM: na esteira automática, a liberação dele leva o caso
         para o Cadastro, e não direto para a análise como o `forcar`. */
      if (o.ordem === 'liberar_triagem') {
        const Cad = await mod('cadastro.mjs')
        let r
        try { r = Cad?.liberar?.(o.pasta, `Liberada por ${o.ordem_por ?? 'você'} no CRM${dados.motivo ? `: ${dados.motivo}` : ''}.`) }
        catch (e) { r = { ok: false, motivo: e.message } }
        try { Fila?.listar?.() } catch { }
        await (r?.ok === false ? falhou(r.motivo || 'não consegui liberar a triagem') : feito('Triagem liberada por você. O agente de Cadastro assume em seguida.'))
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
        if (dados.liberar) {
          const lib = await liberarPergunta(o, dados)
          if (!lib.ok) { await falhou(lib.motivo); continue }
          instrucoes = lib.decisao + (instrucoes ? `\n\n${instrucoes}` : '')
        }
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

/* LIBERAR A ANÁLISE QUE PAROU PARA PERGUNTAR (10/09/2026).

   O motor para de propósito (`_status.json` em `aguardando_resposta`) e só
   volta para a fila quando a pergunta é respondida. Às vezes ela está no
   `_perguntas.json`, às vezes só no `_status.json` (a Riosul), e nos dois
   casos não havia botão no CRM. Aqui: responde as perguntas abertas com a
   decisão da pessoa, destrava o status do mesmo jeito que o `responder()` do
   perguntas.mjs faz, e devolve a decisão escrita para ir junto na análise.
   Sem ela o motor relê os mesmos documentos e para na mesma dúvida. */
async function liberarPergunta(o, dados) {
  const C = await mod('comum.mjs')
  const P = await mod('perguntas.mjs')
  if (!C?.lerStatus || !C?.gravarStatus) return { ok: false, motivo: 'não achei o comum.mjs do motor nesta máquina' }

  const por = o.ordem_por || 'o analista'
  const st = C.lerStatus(o.pasta)
  const pergunta = String(st?.pergunta || '').trim()
  const resposta = String(dados.resposta || '').trim()
    || 'Seguir a análise com os documentos que estão na pasta; o que ficou em aberto entra como ressalva.'

  try {
    for (const p of P?.abertas?.(o.pasta) ?? []) P.responder(p.id, { texto: resposta })
    const agora = C.lerStatus(o.pasta)
    if (agora?.status === 'aguardando_resposta') {
      C.gravarStatus(o.pasta, {
        ...agora, status: 'reaberta', pergunta: null, pergunta_id: null,
        hash_documentos: null, concluido_em: null, erro: null,
      })
    }
  } catch (e) {
    return { ok: false, motivo: `não consegui destravar a pergunta (${e.message})` }
  }
  try { (await carregarMotor())?.listar?.() } catch { }

  // A decisão vai PRIMEIRO: sem o servidor, o recado viaja pela URL e é
  // cortado em 1200 caracteres, e o que pode sobrar cortado é a pergunta.
  const decisao = `DECISAO DE ${por.toUpperCase()} SOBRE A PERGUNTA QUE A ANALISE FEZ (liberada pelo CRM em ${new Date().toLocaleString('pt-BR')}):\n`
    + `${resposta}\n`
    + 'Siga a analise com esta decisao e nao pare de novo pela mesma duvida. O que continuar em aberto entra como ressalva no relatorio.'
    + (pergunta ? `\nA PERGUNTA ERA: ${pergunta.slice(0, 500)}${pergunta.length > 500 ? '...' : ''}` : '')
  console.log(`    Liberada por ${por}: "${resposta.slice(0, 80)}"`)
  return { ok: true, decisao }
}

/* SEM O SERVIDOR LOCAL, vale o que já valia: com `rodar_sozinho` desligado, o
   agente ENTREGA o comando para ele colar; ligado, sobe o Claude ele mesmo. */
async function iniciarSemServidor(o, instrucoes, modo, feito, falhou) {
  if (instrucoes) {
    /* NÃO ENGOLIR ESTA FALHA. Rodar a análise achando que a ordem chegou é
       pior do que não rodar: o relatório sai sem o que ele mandou observar, e
       ninguém descobre. É a mesma regra do `/api/analisar` do servidor. */
    try {
      fs.writeFileSync(path.join(pastaDentroDaRaiz(o.pasta), '_instrucoes.txt'), `[ordem dada pelo CRM, ${new Date().toLocaleString('pt-BR')}]\nO QUE OBSERVAR NESTA ANALISE:\n${instrucoes}\n`, 'utf8')
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
        /* O VARRER DE NOVO VIROU "CONFERIR O QUE SAIU DO COMPUTADOR" (17/09/2026).
           A varredura antiga era do pré-comercial (e-mail solto na raiz), que hoje
           chega pela esteira automática. Pedido dele: o botão olha a raiz e o
           _concluidas, e o card cuja pasta foi recortada para a rede sai da Mesa.
           Só a Mesa esconde (`fora_do_disco_em`): análise, tomador e caso ficam. */
        await sincronizar()
        const nova = await crm(`/api/esteira?maquina=${encodeURIComponent(c.maquina)}`)
        const r = await conferirDisco(nova.ok ? nova.fila : ordem.fila, { agora: true })
        const resultado = !r
          ? 'Não consegui ler a pasta Análises FAM no notebook (OneDrive fora?). Nada saiu da Mesa.'
          : [
              r.marcadas ? `${r.marcadas} card(s) saíram da Mesa: a pasta não está mais no notebook.` : 'Nenhuma pasta nova fora do notebook.',
              r.limpas ? `${r.limpas} voltaram (a pasta reapareceu).` : '',
            ].filter(Boolean).join(' ')
        await crm('/api/esteira', { acao: 'comando-feito', id: cmd.id, resultado })
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

/* ── 7. A ESTEIRA AUTOMÁTICA  ·  10/09/2026 ──────────────────────────────────
   Ordem do Marco: "Trazer para a esteira" e o resto anda sozinho. "Estou
   criando meus funcionários como agente de IA ao invés de ser humano."

   Cada fase é um funcionário, e uma fase só começa quando a anterior deu sinal
   verde, para nenhum trabalho ser gasto onde não tem como avançar:

     pasta montada ─▶ TRIAGEM ─▶ CADASTRO ─▶ ANÁLISE DE CRÉDITO
                      (robô)     (IA)        (o /analise de sempre)

     triagem     o `destravar.mjs` do motor: abre o e-mail, extrai o texto dos
                 documentos e confere o que a política exige. Faltou documento
                 obrigatório: PARA e espera ele (liberar ou colar na pasta).
     cadastro    a IA lê Serasa, contrato social e cartão CNPJ e confere um com
                 o outro; o CRM consulta a Receita, cria ou completa o tomador e,
                 sem pendência, dá a ordem de analisar.
     análise     a ordem `iniciar` que o CRM gravou, executada aqui como
                 qualquer outra.

   SÓ ANDA SOZINHA a análise marcada `automatica` (nascida do "Trazer"). As que
   já estavam na fila continuam esperando o clique.

   DOCUMENTO NOVO NA PASTA muda o hash, e a corrente recomeça sozinha da
   triagem: é o "quando eu tiver mais documentos, eu colo dentro da pasta".

   Uma de cada por vez (OCR e IA pesam), e o mesmo hash nunca é tentado duas
   vezes na mesma vida do agente: falha não vira moinho. */
let triando = null
let cadastrando = null
const tentados = new Map()

async function automatizar(fila) {
  const vivas = (fila || []).filter((f) => f.automatica && !f.arquivada && !f.ordem
    && !['concluida', 'em_andamento', 'aguardando_resposta', 'pausada'].includes(f.situacao))
  if (!vivas.length) return
  const Comum = await mod('comum.mjs')
  const Cad = await mod('cadastro.mjs')
  if (!Comum?.hashConjunto || !Cad?.lerCadastro) return

  for (const f of vivas) {
    let dir
    try { dir = pastaDentroDaRaiz(f.pasta) } catch { continue }
    if (!fs.existsSync(dir)) continue // ainda não montada
    let hash
    try { hash = Comum.hashConjunto(Comum.documentosDe(dir)) } catch { continue }
    if (!hash) continue
    const cad = Cad.lerCadastro(f.pasta)

    // 1. TRIAGEM: nunca feita, ou os documentos mudaram desde a última.
    if (!cad?.itens?.length || cad.hash_documentos !== hash) {
      if (triando || tentados.get(`triagem|${f.pasta}`) === hash) continue
      tentados.set(`triagem|${f.pasta}`, hash)
      triagemAutomatica(f)
      continue
    }

    // 2. CADASTRO: só com a triagem verde (ou liberada por ele).
    const sit = Cad.situacaoCadastro(cad)
    // 1b. SERASA: se é a ÚNICA coisa que falta, o robô busca. Com outro
    // documento faltando o caso não anda de qualquer jeito, e a consulta,
    // que é cobrada, esperaria à toa. O PDF novo muda o hash e a triagem
    // recomeça sozinha na volta seguinte.
    if (sit.status === 'bloqueado' && c.serasa && sit.bloqueios.length === 1 && sit.bloqueios[0].id === 'serasa_pj') {
      // O CNPJ lido pela triagem nos documentos vence o do banco, que pode ser
      // o chute do caso (revisão de 14/09/2026): consulta errada também é cobrada.
      const cnpj = digitos(cad?.identificacao?.cnpj || f.cnpj)
      if (cnpj.length === 14 && !buscandoSerasa && !serasaEsperandoLogin() && tentados.get(`serasa|${f.pasta}`) !== hash) {
        tentados.set(`serasa|${f.pasta}`, hash)
        buscarSerasa(f, dir, cnpj)
      }
    }
    if (sit.status === 'bloqueado' || sit.status === 'pendente') continue
    if (f.cadastro_agente?.hash === hash) continue
    if (cadastrando || tentados.get(`cadastro|${f.pasta}`) === hash) continue
    tentados.set(`cadastro|${f.pasta}`, hash)
    agenteDeCadastro(f, hash, cad)
  }
}

function triagemAutomatica(f) {
  triando = f.pasta
  console.log(`  Triagem automática de "${f.pasta}"…`)
  return new Promise((resolver) => {
    const proc = spawn(process.execPath, [path.join(c.raiz, '_sistema', 'destravar.mjs'), f.pasta], {
      cwd: path.join(c.raiz, '_sistema'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let saida = ''
    proc.stdout.on('data', (b) => { saida += b.toString('utf8') })
    proc.on('error', (e) => { console.error('    triagem:', e.message) })
    proc.on('close', async () => {
      let r = null
      try { r = JSON.parse(saida.slice(saida.indexOf('{'))) } catch { }
      console.log(r?.ok
        ? `    Triagem de "${f.pasta}": ${r.rotulo || r.status}${r.bloqueios?.length ? ` (falta ${r.bloqueios.map((b) => b.nome).join(', ')})` : ''}.`
        : `    Triagem de "${f.pasta}" não terminou: ${r?.motivo || 'sem resposta do motor'}.`)
      triando = null
      await sincronizar().catch(() => { })
      resolver()
    })
  })
}

async function agenteDeCadastro(f, hash, cad) {
  cadastrando = f.pasta
  console.log(`  Agente de Cadastro em "${f.pasta}"…`)
  try {
    // A situação no CRM precisa estar em dia antes: é por ela que ele decide
    // se a análise pode receber a ordem de começar.
    await sincronizar().catch(() => { })
    const lida = await lerCadastroComIA(f.pasta)
    const id = cad?.identificacao || {}
    const r = await crm('/api/esteira', {
      acao: 'cadastro', id: f.id, hash,
      triagem: { cnpj: id.cnpj || null, empresa: id.empresa_confiavel ? id.empresa : null, corretora: id.corretora || null },
      ...(lida.ok ? { leitura: lida.leitura } : { erro: lida.motivo }),
    })
    if (!r.ok) console.error('    O CRM recusou o cadastro:', r.erro)
    else {
      // Gravado no CRM: dali em diante quem impede repetir é o hash gravado lá,
      // e "Ler o cadastro de novo" no card (que apaga o resultado) volta a valer.
      tentados.delete(`cadastro|${f.pasta}`)
      const k = r.cadastro || {}
      console.log(`    Cadastro de "${f.pasta}": ${k.status}${k.motivos?.length ? ` (${k.motivos.join(' · ')})` : ''}${k.analise_mandada ? '. Mandado para a análise de crédito.' : '.'}`)
    }
  } catch (e) {
    console.error('    agente de cadastro:', e.message)
  } finally {
    cadastrando = null
  }
}

/* O ROBÔ DO SERASA (14/09/2026). Um de cada vez, como triagem e cadastro: é um
   Chrome só, com uma sessão só. O import é tardio porque o Playwright pesa, e a
   esteira não deve carregar isso enquanto nenhum caso precisar. Quem decide se
   consulta, reaproveita ou recusa é o serasa.mjs; aqui só se chama e se anota. */
let buscandoSerasa = null
/* SEM SESSÃO NO SERASA (15/09/2026): a sessão do portal cai quando o Chrome do
   robô fecha e em ~12 h. O robô para de tentar por 3 minutos, o caso da pasta
   não gasta a tentativa e o pedido do botão volta para a fila: depois do login,
   tudo anda sozinho. */
let loginSerasaEm = 0
const serasaEsperandoLogin = () => Date.now() - loginSerasaEm < 3 * 60000

async function buscarSerasa(f, dir, cnpj) {
  buscandoSerasa = f.pasta
  apressar()
  console.log(`  Robô do Serasa: buscando o Serasa de ${cnpj} para "${f.pasta}"…`)
  try {
    const S = await import(pathToFileURL(path.join(AQUI, 'serasa.mjs')).href)
    const r = await S.consultarSerasa({ cnpj, destino: dir, log: (m) => console.log(`    ${m}`) })
    if (!r.ok && r.login) { loginSerasaEm = Date.now(); tentados.delete(`serasa|${f.pasta}`) }
    console.log(r.ok
      ? `    Serasa salvo em "${f.pasta}": ${r.arquivo}${r.reaproveitado ? ' (reaproveitado de consulta recente, sem cobrança nova)' : ''}.`
      : `    Robô do Serasa parou em "${f.pasta}": ${r.motivo}`)
    /* A primeira camada entrou sozinha. Os sócios que o relatório trouxe vão
       para o CRM esperando aprovação: regra dele, sócio só com aprovação. */
    if (r.ok) {
      const s = await crm('/api/esteira/serasa', {
        acao: 'socios', pasta: f.pasta, cnpj, tomador_id: f.tomador_id || null, razao: r.razao || null,
        reaproveitado: !!r.reaproveitado, maquina: c.maquina, socios: r.socios || [],
      })
      if (!s.ok) console.log(`    O recibo da consulta não subiu para o CRM: ${s.erro || s.status}`)
      else if (s.socios) console.log(`    ${s.socios} sócio(s) do quadro societário esperando aprovação no CRM.`)
    }
  } catch (e) {
    console.error('    robô do Serasa:', e.message)
  } finally {
    buscandoSerasa = null
  }
}

/* O BOTÃO "SERASA" DO CADASTRO DO TOMADOR. A pessoa clica no CRM, o pedido
   fica em `serasa_pedidos`, e é aqui que ele vira consulta: o PDF sai numa
   pasta temporária FORA do OneDrive e sobe para o CRM como anexo do tomador.
   O ROBÔ É UM SÓ para a pasta e para o botão (`buscandoSerasa`). A marca só é
   posta DEPOIS de haver pedido de verdade, e sem await entre olhar e marcar.
   Na primeira versão ela ia antes da pergunta ao CRM, e como esta função roda
   junto com `automatizar()` em toda volta, a pasta sempre achava o robô
   "ocupado" e nunca era atendida (a ENGETECNICA ficou parada assim, 14/09). */
/* O SERASA DOS SÓCIOS COMPÕE A ANÁLISE (15/09/2026). Regra dele: "buscar os
   novos Serasas para compor a análise de cadastro e crédito". O PDF de cada
   sócio espera em `_serasa-socios/` (invisível para o motor) e, quando o lote
   aprovado acaba, passa inteiro para `Sócios - Serasa/`, que a triagem, o
   cadastro e a análise leem. Um sócio por vez mudaria o hash a cada PDF: uma
   triagem e um cadastro por sócio. Sócio esperando aprovação não segura o
   lote, e sócio que falhou também não. */
const PASTA_SOCIOS = 'Sócios - Serasa'
async function publicarSocios(pedido) {
  if (!pedido?.pasta) return
  let base
  try { base = pastaDentroDaRaiz(pedido.pasta) } catch { return }
  const espera = path.join(base, '_serasa-socios')
  if (!fs.existsSync(espera)) return
  const arquivos = fs.readdirSync(espera).filter((n) => n.toLowerCase().endsWith('.pdf'))
  if (!arquivos.length) return
  const r = await crm('/api/esteira/serasa', { acao: 'restantes', pasta: pedido.pasta, tomador_id: pedido.tomador_id || null })
  if (!r.ok) return console.log(`    Não soube se ainda há sócio na fila: ${r.erro || r.status}. O Serasa dos sócios espera.`)
  if (r.restantes > 0) return console.log(`    Ainda há ${r.restantes} sócio(s) na fila: o Serasa dos sócios entra na análise quando o lote acabar.`)
  const alvo = path.join(base, PASTA_SOCIOS)
  fs.mkdirSync(alvo, { recursive: true })
  let movidos = 0
  for (const n of arquivos) {
    let destino = path.join(alvo, n)
    if (fs.existsSync(destino)) destino = path.join(alvo, n.replace(/\.pdf$/i, ` (${new Date().toISOString().slice(0, 10)}).pdf`))
    // Arquivo preso pelo OneDrive fica para a próxima varredura, e não derruba os outros.
    try { fs.renameSync(path.join(espera, n), destino); movidos++ } catch (e) { console.log(`    "${n}" não saiu da espera agora (${e.code || e.message}): tento de novo depois.`) }
  }
  try { fs.rmdirSync(espera) } catch { }
  if (movidos) console.log(`    Serasa de ${movidos} sócio(s) em "${PASTA_SOCIOS}": entra na triagem, no cadastro e na análise.`)
}

/* A VARREDURA DOS LOTES PARADOS (achado da revisão de 15/09/2026). O
   `publicarSocios` só roda depois de um pedido de sócio: se no último do lote o
   CRM não respondeu ou o OneDrive prendeu o arquivo, os PDFs ficariam para
   sempre em `_serasa-socios/`, com a tela dizendo "consultado". A cada 10
   minutos a esteira olha as pastas da raiz e tenta de novo. */
let varridoSociosEm = 0
async function varrerSociosParados() {
  if (!c.serasa || buscandoSerasa || Date.now() - varridoSociosEm < 10 * 60000) return
  varridoSociosEm = Date.now()
  for (const d of fs.readdirSync(c.raiz, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('_')) continue
    if (!fs.existsSync(path.join(c.raiz, d.name, '_serasa-socios'))) continue
    await publicarSocios({ pasta: d.name, tomador_id: null }).catch((e) => console.log(`    Serasa dos sócios de "${d.name}": ${e.message}`))
  }
}

let olhandoPedidosSerasa = false
async function atenderPedidosSerasa() {
  if (!c.serasa || buscandoSerasa || olhandoPedidosSerasa || serasaEsperandoLogin()) return
  olhandoPedidosSerasa = true
  let pedido = null
  let peguei = false
  const dir = () => path.join(os.tmpdir(), 'fam-serasa-entrega', pedido.id)
  try {
    const r = await crm('/api/esteira/serasa')
    if (!r.ok || !r.pedidos?.length) return
    if (buscandoSerasa) return // a pasta pegou o robô enquanto eu perguntava
    buscandoSerasa = 'pedido do CRM'
    peguei = true
    const aceite = await crm('/api/esteira/serasa', { acao: 'aceito', id: r.pedidos[0].id, maquina: c.maquina })
    if (!aceite.ok) return
    pedido = r.pedidos[0]
    apressar()
    const socio = pedido.camada === 'socio'
    console.log(`  Robô do Serasa: ${socio ? `sócio ${pedido.nome || pedido.documento} (aprovado)` : `pedido de ${pedido.pedido_por || 'alguém'} no cadastro`}, documento ${pedido.documento}…`)
    fs.mkdirSync(dir(), { recursive: true })
    const S = await import(pathToFileURL(path.join(AQUI, 'serasa.mjs')).href)
    const res = await S.consultarSerasa({
      documento: pedido.documento, tipo: pedido.tipo_pessoa, socio, destino: dir(), log: (m) => console.log(`    ${m}`),
      // Pergunta de novo ao CRM no último segundo: pedido apagado ou fechado não é cobrado.
      antesDeGerar: async () => (await crm('/api/esteira/serasa', { acao: 'conferir', id: pedido.id })).estado === 'consultando',
    })
    if (!res.ok && res.login) {
      loginSerasaEm = Date.now()
      await crm('/api/esteira/serasa', { acao: 'devolver', id: pedido.id, motivo: 'O Serasa pediu login de novo no notebook. O pedido espera: entre na janela do robô com o login da FAM.' })
      console.log(`    ${res.motivo} O pedido voltou para a fila.`)
      return
    }
    if (!res.ok) {
      await crm('/api/esteira/serasa', { acao: 'falhou', id: pedido.id, motivo: res.motivo })
      console.log(`    Robô do Serasa parou: ${res.motivo}`)
      return
    }
    /* Pedido de uma PASTA de análise: o PDF fica guardado nela. O de SÓCIO
       espera em `_serasa-socios/`, que o motor não enxerga (o "_" é o prefixo
       dos arquivos de controle), e só entra à vista quando o lote acaba: ver
       `publicarSocios`. A pasta que chega aqui já é a de hoje (a rota resolve
       o nome novo quando a análise renomeou). */
    if (pedido.pasta) {
      try {
        const base = pastaDentroDaRaiz(pedido.pasta)
        if (fs.existsSync(base)) {
          const alvo = socio ? path.join(base, '_serasa-socios') : base
          fs.mkdirSync(alvo, { recursive: true })
          fs.copyFileSync(path.join(dir(), res.arquivo), path.join(alvo, res.arquivo))
        } else console.log(`    A pasta "${pedido.pasta}" não está mais no disco: o PDF fica só no CRM.`)
      } catch (e) { console.log(`    Não copiei o PDF para a pasta: ${e.message}`) }
    }
    const form = new FormData()
    form.set('id', pedido.id)
    form.set('reaproveitado', res.reaproveitado ? '1' : '')
    if (res.consultado_em) form.set('consultado_em', res.consultado_em)
    if (!socio) form.set('socios', JSON.stringify(res.socios || []))
    form.set('arquivo', new Blob([fs.readFileSync(path.join(dir(), res.arquivo))], { type: 'application/pdf' }), res.arquivo)
    const up = await fetch(c.url + '/api/esteira/serasa', { method: 'POST', headers: { 'x-carteiro-token': c.token }, body: form })
    const j = await up.json().catch(() => ({}))
    if (!up.ok) {
      await crm('/api/esteira/serasa', { acao: 'falhou', id: pedido.id, motivo: `O PDF saiu, mas não subiu para o CRM: ${j.erro || `HTTP ${up.status}`}` })
      console.log(`    O PDF do Serasa não subiu: ${j.erro || up.status}`)
      return
    }
    console.log(`    Serasa entregue: ${res.arquivo}${res.reaproveitado ? ' (reaproveitado, sem cobrança nova)' : ''}${j.socios ? `. ${j.socios} sócio(s) esperando aprovação` : ''}.`)
  } catch (e) {
    console.error('    pedido do Serasa:', e.message)
    if (pedido) await crm('/api/esteira/serasa', { acao: 'falhou', id: pedido.id, motivo: e.message }).catch(() => { })
  } finally {
    if (pedido?.camada === 'socio') await publicarSocios(pedido).catch((e) => console.log(`    Serasa dos sócios não entrou na pasta: ${e.message}`))
    if (pedido) { try { fs.rmSync(dir(), { recursive: true, force: true }) } catch { } }
    if (peguei) buscandoSerasa = null
    olhandoPedidosSerasa = false
  }
}

/* O QUE A IA RECEBE: só o texto que a triagem já extraiu, dos documentos que
   importam para o cadastro. Não lê balanço (é da análise), e cada classe tem
   teto, para um Serasa de 40 páginas não afogar o contrato social.

   `outro` ENTRA, com teto menor (medido na Riosul em 10/09/2026): a alteração
   contratual chamada "servico-assinado atualizacao 2024.pdf" é classificada
   como `outro` pelo robô da triagem, e sem ela a IA concluiu "não veio contrato
   social". A IA reconhece o documento pelo conteúdo; o robô só chuta a classe. */
/* `serasa_socio` (15/09/2026): o Serasa dos sócios que o robô pôs em "Sócios -
   Serasa". Tem teto próprio: sem ele, um PJ de sócio lido antes gastaria o teto
   do `serasa_pj` e o Serasa do próprio tomador ficaria de fora. */
const TETO_CADASTRO = { cartao_cnpj: 15000, serasa_pj: 70000, serasa_socio: 30000, contrato_social: 90000, email: 12000, outro: 40000 }

const PROMPT_CADASTRO = `Você é o agente de Cadastro da FAM Seguradora (seguro garantia). Abaixo estão os textos extraídos dos documentos de UM tomador: Serasa, contrato social, cartão CNPJ, o e-mail do pedido e outros documentos da pasta. A "classe provável" de cada um foi dada por um robô e pode estar errada: reconheça o documento pelo conteúdo (uma alteração contratual ou consolidação é contrato social, mesmo com outro nome de arquivo). O documento de classe "serasa_socio" é o Serasa de um SÓCIO (pessoa física ou empresa sócia), nunca o do tomador: não use para identificar o tomador; use para a situação dos sócios e escreva em "observacoes" a restrição ou anotação que pesar.

Faça três coisas:
1. Identifique o tomador (a empresa que pede a garantia, não a corretora, não o segurado, não o contador, não um avalista).
2. Monte o cadastro básico com o que os documentos dizem. Quando houver contrato social, ele é a fonte da razão social, capital e sócios; sem contrato, use o Serasa.
3. Confira contrato social contra Serasa, campo a campo: razão social, CNPJ, endereço, capital social, sócios e administradores. Sem contrato social, deixe "conferencia" vazia.

Gravidade de cada conferência:
- "ok": confere.
- "atencao": diferença que a análise de crédito deve pesar (capital diferente, sócio que entrou ou saiu, endereço desatualizado, nome antigo).
- "bloqueia": só quando não dá para seguir: documentos de empresas diferentes, CNPJ que não bate entre os documentos, contrato social de outra empresa.

Não invente. Campo que os documentos não trazem fica null. Responda SOMENTE com um JSON, sem texto antes ou depois, neste formato:
{
  "cnpj": "somente 14 digitos",
  "razao_social": "",
  "nome_fantasia": null,
  "endereco": { "logradouro": null, "numero": null, "complemento": null, "bairro": null, "cidade": null, "uf": null, "cep": null },
  "capital_social": null,
  "data_abertura": "AAAA-MM-DD ou null",
  "cnae": null,
  "socios": [ { "nome": "", "documento": null, "tipo": "PF ou PJ", "percentual": null, "cargo": null } ],
  "fontes": { "contrato_social": false, "serasa": false, "cartao_cnpj": false },
  "conferencia": [ { "campo": "", "contrato_social": null, "serasa": null, "confere": true, "gravidade": "ok", "nota": null } ],
  "bloqueios": [],
  "observacoes": "uma ou duas frases para o analista, ou null",
  "corretora": "a corretora de seguros que mandou o pedido (quase sempre quem escreve no e-mail original, abaixo do encaminhamento da FAM), ou null"
}`

async function lerCadastroComIA(pasta) {
  const P = await mod('ponte.mjs')
  const D = await mod('documentos.mjs').catch(() => null)
  if (!P?.rodar || !P.acharClaude?.()) return { ok: false, motivo: 'Não achei o Claude nesta máquina para ler os documentos.' }

  let dir
  try { dir = pastaDentroDaRaiz(pasta) } catch (e) { return { ok: false, motivo: e.message } }
  let rel = null
  try { rel = JSON.parse(fs.readFileSync(path.join(dir, '_extraido', '_relatorio.json'), 'utf8').replace(/^﻿/, '')) } catch { }
  if (!rel?.arquivos?.length) return { ok: false, motivo: 'A triagem ainda não extraiu o texto dos documentos desta pasta.' }

  const usados = Object.fromEntries(Object.keys(TETO_CADASTRO).map((k) => [k, 0]))
  const blocos = []
  for (const item of rel.arquivos) {
    if (item.tipo === 'duplicata') continue
    const arqTexto = item.texto_em || (/(_extraido\/[^\s"]+\.txt)/.exec(item.acao || '') || [])[1]
    let texto = ''
    try {
      if (arqTexto) texto = fs.readFileSync(path.join(dir, arqTexto), 'utf8')
      else if (item.tipo === 'texto' && item.caminho) texto = fs.readFileSync(item.caminho, 'utf8')
    } catch { texto = '' }
    if (texto.trim().length < 50) continue
    const nome = String(item.arquivo || '')
    let classe = 'outro'
    if (/^e-?mail/i.test(path.basename(nome))) classe = 'email'
    else if (/^S[óo]cios - Serasa[\\/]/i.test(nome) || /^Serasa Experian - S[óo]cio - /i.test(path.basename(nome))) classe = 'serasa_socio'
    else { try { classe = D?.classificarArquivo?.({ rel: nome, tipo: item.tipo, texto })?.classe || 'outro' } catch { } }
    if (!(classe in TETO_CADASTRO)) continue
    const resta = TETO_CADASTRO[classe] - usados[classe]
    if (resta < 500) continue
    const pedaco = texto.slice(0, resta)
    usados[classe] += pedaco.length
    blocos.push(`=== DOCUMENTO: ${nome} (classe provável: ${classe}) ===\n${pedaco}`)
  }
  if (!blocos.length) return { ok: false, motivo: 'Não achei Serasa, contrato social, cartão CNPJ nem e-mail com texto legível na pasta.' }

  const r = await P.rodar({
    dir,
    // Somente leitura: o texto já vai inteiro na entrada, e a IA não escreve nada.
    args: ['--output-format', 'json', '--model', 'sonnet', '--allowedTools', 'Read', '-p'],
    entrada: `${PROMPT_CADASTRO}\n\n${blocos.join('\n\n')}`,
    limiteMs: 10 * 60 * 1000,
  })
  if (!r.ok) return { ok: false, motivo: r.motivo || 'a IA não respondeu' }
  let resposta = ''
  try { resposta = String(JSON.parse(r.bruto).result || '') } catch { resposta = String(r.bruto || '') }
  const ini = resposta.indexOf('{'), fim = resposta.lastIndexOf('}')
  if (ini < 0 || fim <= ini) return { ok: false, motivo: 'A IA não devolveu a leitura no formato combinado.' }
  try { return { ok: true, leitura: JSON.parse(resposta.slice(ini, fim + 1)) } }
  catch { return { ok: false, motivo: 'A leitura da IA veio com o JSON quebrado.' } }
}

// ── a rodada ────────────────────────────────────────────────────────────────
let ultimaSincronia = 0
/* A PRESSA (10/09/2026). "O ser humano precisa sempre de visualização." Com a
   sincronia de 90 s, quem clicava em Analisar ficava um minuto e meio olhando
   uma tela sem mudança, achando que nada tinha acontecido. Depois de uma ordem,
   de um passo da automação ou com análise rodando, o retrato sobe a cada 15 s. */
let apressadoAte = 0
const apressar = (min = 6) => { apressadoAte = Math.max(apressadoAte, Date.now() + min * 60000) }
let temExecucaoViva = false

async function rodada({ forcar = false } = {}) {
  const ordem = await crm(`/api/esteira?maquina=${encodeURIComponent(c.maquina)}`)
  if (!ordem.ok) return console.error('CRM:', ordem.erro ?? `HTTP ${ordem.status}`)

  // Materializar e executar vêm PRIMEIRO: alguém está olhando a tela esperando.
  if (ordem.a_materializar?.length) { apressar(); await materializar(ordem.a_materializar) }
  if (ordem.ordens?.length) { apressar(); await executarOrdens(ordem.ordens) }
  if (triando || cadastrando) apressar(2)
  await aplicarDecisoes(ordem)
  // Não espera: triagem e cadastro rodam soltos, um de cada, e a rodada segue.
  automatizar(ordem.fila).catch((e) => console.error('  automação:', e.message))
  // O botão "Serasa" do cadastro: também solto, um de cada vez.
  atenderPedidosSerasa().catch((e) => console.error('  pedidos do Serasa:', e.message))
  varrerSociosParados().catch((e) => console.error('  sócios do Serasa:', e.message))
  // A análise complementar (17/09/2026): documento novo lido contra a análise anterior. Solta, uma por vez.
  atenderComplementos({ crm, raiz: c.raiz, maquina: c.maquina }).catch((e) => console.error('  complemento:', e.message))
  // Depois das ordens: quem perguntou está olhando a tela, mas quem mandou
  // analisar está esperando há mais tempo.
  if (ordem.ia?.length) {
    await responderIA(ordem.ia)
    // A fala que acabou de ser escrita no jsonl sobe na hora: quem perguntou
    // está com a tela aberta esperando ela aparecer no fio.
    await sincronizarConversas()
  }

  const ritmo = (Date.now() < apressadoAte || temExecucaoViva) ? Math.min(15, c.sincronia_seg) : c.sincronia_seg
  if (forcar || Date.now() - ultimaSincronia >= ritmo * 1000) {
    ultimaSincronia = Date.now()
    await sincronizar()
    try { await conferirDisco(ordem.fila) } catch (e) { console.error('  conferir o disco:', e.message) }
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
} else if (cmd === 'ler-cadastro') {
  // Só leitura: mostra o que o agente de Cadastro leria nesta pasta, sem mandar nada ao CRM.
  //   node scripts/esteira.mjs ler-cadastro "<pasta>"
  console.log(JSON.stringify(await lerCadastroComIA(process.argv[3] || ''), null, 2))
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
