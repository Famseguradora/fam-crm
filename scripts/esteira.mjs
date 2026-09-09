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
//     3. lê o estado real do disco pelo motor   (fila.mjs `listar`)
//     4. manda esse retrato para o CRM          (POST sincronizar)
//     5. executa as ordens que uma pessoa deu
//
//  O GASTO DE IA CONTINUA ZERO. Quem responde é o `claude.exe` desta máquina,
//  pela assinatura que já se paga: sem chave de API, sem serviço contratado e
//  sem fatura de token. Ver o cabeçalho do `_sistema/ponte.mjs`.
//
//  ---------------------------------------------------------------------------
//  RODAR A ANÁLISE SOZINHO NASCE DESLIGADO, e não é cautela: é o mesmo
//  precedente do Carteiro, escrito lá com todas as letras. Uma análise de
//  crédito é uma sessão do Claude Code com Write e Bash na máquina dele. Ligar
//  isso sem ele mandar seria a máquina decidir sozinha mexer no computador de
//  alguém. De fábrica, o agente prepara tudo e ENTREGA O COMANDO pronto; ele
//  cola numa sessão e roda, como faz hoje. Ligar o automático é uma linha no
//  esteira.json, decisão dele.
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

/* O MOTOR, carregado por caminho e não por dependência.
   É a peça de transição: hoje quem sabe olhar uma pasta de análise é o
   `_sistema/fila.mjs`. No dia em que essa leitura for reescrita dentro do CRM,
   muda este import e mais nada. Foi assim que o `ponte.mjs` tratou a troca da
   IA por API, e funcionou. */
let motor = null
async function carregarMotor() {
  if (motor) return motor
  if (!c.raiz) {
    console.error('Falta "raiz" no esteira.json: é a pasta Analises FAM, onde o motor mora.')
    return null
  }
  const alvo = path.join(c.raiz, '_sistema', 'fila.mjs')
  if (!fs.existsSync(alvo)) {
    console.error(`Não achei o motor em ${alvo}. Confira a "raiz" no esteira.json.`)
    return null
  }
  motor = await import(pathToFileURL(alvo).href)
  return motor
}

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

// ── 3 e 4. o retrato do disco, e ele vai inteiro ────────────────────────────
async function sincronizar() {
  const m = await carregarMotor()
  if (!m) return

  let lista
  try {
    lista = m.listar()
  } catch (e) {
    console.error('  O motor não conseguiu ler a fila:', e.message)
    return
  }

  /* O `listar()` devolve `{ resumo, a_fazer, travadas, analises }`, e o que
     interessa é `analises`: as outras chaves são atalhos com só o nome da pasta.
     Daqui sai só o que o CRM precisa saber, e nada mais: cada campo que
     atravessa é um campo que os dois lados têm que concordar para sempre.

     CNPJ e chave NÃO viajam, e a ausência é de propósito: o `avaliar()` do
     motor não os conhece (quem identifica a empresa é a análise, depois). Se
     eu mandasse vazio, apagaria no CRM o CNPJ que a Triagem já tinha apurado. */
  const pastas = (lista.analises ?? []).map((p) => ({
    pasta: p.pasta,
    situacao: p.situacao,
    motivo: p.motivo,
    hash_documentos: p.hash_atual,
    documentos: p.documentos ?? 0,
    documentos_faltando: p.documentos_faltando ?? [],
    razao_social: p.razao_social ?? '',
    trava_maquina: c.maquina,
    trava_pid: process.pid,
  }))

  if (!pastas.length) return
  const r = await crm('/api/esteira', { acao: 'sincronizar', maquina: c.maquina, pastas })
  if (!r.ok) return console.error('  CRM recusou a sincronização:', r.erro)
  console.log(`  Esteira: ${pastas.length} pastas, ${r.criadas} novas, ${r.atualizadas} atualizadas.`)
  if (r.recusadas?.length) console.log('    Recusadas:', r.recusadas.join(' · '))
}

// ── 5. as ordens que uma pessoa deu ─────────────────────────────────────────
async function executarOrdens(ordens) {
  const m = await carregarMotor()
  for (const o of ordens) {
    console.log(`  Ordem "${o.ordem}" em "${o.pasta}" (${o.ordem_por ?? 'alguém'})`)

    if (o.ordem === 'parar') {
      try { m?.parar?.(o.pasta, `Interrompida por ${o.ordem_por ?? 'alguém'} pelo CRM.`) }
      catch (e) { console.error('   ', e.message) }
      await crm('/api/esteira', { acao: 'ordem-aceita', id: o.id })
      continue
    }

    if (o.ordem === 'pausar' || o.ordem === 'retomar') {
      // Estas duas já mudaram a situação no CRM na hora do clique: valem
      // sozinhas, sem nada precisar rodar. Aqui é só dar baixa no pedido.
      await crm('/api/esteira', { acao: 'ordem-aceita', id: o.id })
      continue
    }

    if (o.ordem === 'iniciar') {
      const comando = `/analise ${o.pasta}`
      if (!c.rodar_sozinho) {
        /* O CAMINHO DE FÁBRICA: bate na porta com os papéis na mão. Ver o
           cabeçalho. A ordem some da fila (foi entregue) e a tela mostra o
           comando pronto para ele colar. */
        console.log('\n  ┌─ Para rodar esta análise, cole numa sessão do Claude Code:')
        console.log(`  │  ${comando}`)
        console.log('  └─ (ligue "rodar_sozinho" no esteira.json para eu fazer isso sozinho)\n')
        await crm('/api/esteira', {
          acao: 'progresso', id: o.id, etapa: 'fila',
          mensagem: `Pasta pronta no notebook. Rode "${comando}" numa sessão do Claude Code.`,
          maquina: c.maquina, pid: process.pid,
        })
        await crm('/api/esteira', { acao: 'ordem-aceita', id: o.id })
        continue
      }
      await crm('/api/esteira', { acao: 'ordem-aceita', id: o.id })
      await rodarAnalise(o)
      continue
    }
  }
}

/* RODAR A ANÁLISE SOZINHO. Só entra aqui com `rodar_sozinho` ligado à mão.
   É o mesmo `/analise <pasta>` que ele digita hoje, na mesma máquina, com o
   mesmo binário e a mesma assinatura: nenhum custo novo, nenhuma chave de API.
   A diferença é que ninguém está olhando, e por isso o progresso sobe a cada
   evento em vez de ficar só no terminal. */
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

/* ── A IA DE GESTÃO ──────────────────────────────────────────────────────────
   A pergunta nasce no CRM (de qualquer lugar, inclusive do celular) e é
   respondida AQUI, pelo `gestao.mjs` do Sistema de Análise, que chama o
   claude.exe desta máquina pela assinatura que já se paga. Gasto de IA: zero,
   pelo mesmo motivo do resto da esteira.

   Uma por rodada, de propósito: uma resposta sobre o acervo inteiro leva de 20
   a 90 segundos, e enfileirar três aqui deixaria a esteira parada nesse tempo.

   Ela SÓ RESPONDE E SUGERE: o gestao.mjs não tem Write, Edit nem Bash na lista
   de ferramentas (ver o cabeçalho dele). A garantia é técnica, não é promessa
   escrita no preâmbulo. */
async function responderIA(pedidos) {
  const pedido = pedidos[0]
  if (!pedido) return

  const pego = await crm('/api/esteira', { acao: 'ia-pegar', id: pedido.id, maquina: c.maquina })
  if (!pego.ok || !pego.pegou) return  // outra máquina pegou primeiro

  console.log(`  IA de Gestão: "${String(pedido.pergunta).slice(0, 70)}…"`)
  try {
    const gestao = await import(pathToFileURL(path.join(c.raiz, '_sistema', 'gestao.mjs')).href)
    if (typeof gestao.conversar !== 'function') throw new Error('O gestao.mjs desta máquina não expõe `conversar`.')

    /* `conversar` é o mesmo caminho do `node gestao.mjs perguntar "..."`, com o
       mesmo fio de conversa: a resposta entra no histórico dele, e não numa
       segunda memória que ninguém revisa. Devolve
       { ok, resposta, segundos } — ou { ok: false, motivo } quando recusa. */
    const r = await gestao.conversar(String(pedido.pergunta))
    if (!r?.ok) throw new Error(r?.motivo ?? 'a IA de Gestão recusou a pergunta')
    const texto = String(r.resposta ?? '').trim()
    if (!texto) throw new Error('A IA não devolveu texto.')

    await crm('/api/esteira', { acao: 'ia-resposta', id: pedido.id, resposta: texto, maquina: c.maquina })
    console.log('  IA de Gestão: respondida.')
  } catch (e) {
    await crm('/api/esteira', { acao: 'ia-resposta', id: pedido.id, erro: String(e.message ?? e), maquina: c.maquina })
    console.error('  IA de Gestão falhou:', e.message ?? e)
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
  // Depois das ordens: quem perguntou está olhando a tela, mas quem mandou
  // analisar está esperando há mais tempo.
  if (ordem.ia?.length) await responderIA(ordem.ia)

  if (forcar || Date.now() - ultimaSincronia >= c.sincronia_seg * 1000) {
    ultimaSincronia = Date.now()
    await sincronizar()
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
  console.log('CRM             :', c.url)
  const r = await crm(`/api/esteira?maquina=${encodeURIComponent(c.maquina)}`)
  console.log('Resposta do CRM :', r.ok ? `${r.fila?.length ?? 0} na fila, ${r.ordens?.length ?? 0} ordem(ns)` : `NÃO respondeu (${r.erro ?? r.status})`)
  console.log('Rodar sozinho   :', c.rodar_sozinho ? 'LIGADO' : 'desligado (entrega o comando para você colar)')
} else if (cmd === 'uma-vez') {
  await rodada({ forcar: true })
} else {
  console.log(`Esteira de pé. CRM em ${c.url}.`)
  console.log(`Raiz das análises: ${c.raiz || '(faltando no esteira.json)'}`)
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
