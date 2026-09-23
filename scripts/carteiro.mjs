// ============================================================================
//  O CARTEIRO  ·  o único pedaço do Comercial que roda numa máquina, e não no CRM
// ============================================================================
//
//  O QUE ELE FAZ, e o quanto é pouco:
//
//     1. pergunta ao CRM o que fazer      (GET /api/carteiro)
//     2. lê a caixa do Outlook clássico   (outlook.ps1, COM, só leitura)
//     3. manda os CABEÇALHOS para o CRM   (POST sincronizar)
//     4. sobe o .msg do que alguém pediu  (POST /api/carteiro/trazer)
//     5. busca o texto de quem alguém abriu na tela
//
//  Ele NÃO decide nada. Não sabe o que é análise, não classifica documento, não
//  cria caso, não responde e-mail. A régua está no banco do CRM e é aplicada no
//  servidor. Isso é de propósito: assim mudar uma regra não exige tocar em nada
//  instalado na máquina de ninguém, e trocar esta máquina (ou trocar o Outlook
//  pelo Microsoft Graph, um dia) não muda uma linha do CRM.
//
//  NÃO USA IA, NÃO USA CHAVE DE API, NÃO TEM DEPENDÊNCIA. Node puro e
//  PowerShell. A máquina do Comercial nunca vai precisar de chave de API, nem
//  quando a Subscrição tiver agentes que pensam: esses rodam no CRM.
//
//  O OUTLOOK NUNCA É ALTERADO: não marca como lido, não move, não apaga. Num
//  sistema que vai ser mostrado para a diretoria, a garantia de que a máquina
//  não mexe no e-mail de ninguém vale mais do que qualquer comodidade.
//
//  ---------------------------------------------------------------------------
//  COMO INSTALAR NUMA MÁQUINA NOVA (é isso, não tem mais nada)
//  ---------------------------------------------------------------------------
//    1. Node 20 ou mais novo.
//    2. Copie DOIS arquivos para uma pasta: carteiro.mjs e outlook.ps1.
//    3. Ao lado deles, um carteiro.json:
//         { "url": "https://o-crm.exemplo", "token": "o segredo do CRM" }
//       (ou as variáveis de ambiente CRM_URL e CARTEIRO_TOKEN)
//    4. Abra o Outlook CLÁSSICO e entre na conta uma vez. O Outlook novo (o da
//       Loja) não aceita ser automatizado por ninguém, e o comando
//       `node carteiro.mjs diagnostico` diz isso com todas as letras.
//    5. `node carteiro.mjs`  e deixe a janela aberta.
//    6. A caixa aparece sozinha no CRM, na tela do Comercial, e aparece
//       DESLIGADA. Quem liga é o dono dela. Enquanto ninguém ligar, este
//       processo bate no CRM e não lê e-mail nenhum.
//
//  Ninguém digita o endereço da caixa: ele é perguntado ao próprio Outlook. Só
//  se escreve `"conta"` no carteiro.json (ou CARTEIRO_CONTA no ambiente) para
//  caixa COMPARTILHADA (uma caixa de setor aberta dentro do Outlook de alguém).
//
//  UM PROCESSO, UMA CAIXA. Para ler duas na mesma máquina, sobem-se dois:
//     node scripts/carteiro.mjs                                  (a sua)
//     set CARTEIRO_CONTA=comercial@famseguradora.com.br & node scripts/carteiro.mjs
//  Quem VÊ cada caixa no CRM é outra conversa, e é decidida na tela de
//  Usuários: a máquina lê, as pessoas autorizadas dão as ordens.
//
//  O COM exige sessão de usuário aberta: máquina com a sessão encerrada não
//  responde, mesmo ligada. Máquina que fica logada resolve; serviço do Windows
//  com a tela deslogada, não.
// ============================================================================

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(AQUI, 'outlook.ps1')

/* ARQUIVO TEMPORÁRIO FORA DE QUALQUER PASTA SINCRONIZADA. O .msg de um pedido
   de análise passa de 20 MB, e escrever isso dentro do OneDrive já derrubou
   processo no meio com "WinError 32": o sincronizador segura o arquivo
   enquanto sobe, e o nosso lado não consegue apagar. */
const TEMP = path.join(os.tmpdir(), 'fam-carteiro')

/* O .env.local DO REPOSITÓRIO, quando este arquivo ainda estiver dentro dele.
   Na máquina do Marco o segredo já existe ali, e obrigar a copiá-lo para um
   segundo arquivo é criar uma chance de os dois discordarem. Na máquina do
   Comercial, que só recebe dois arquivos, este caminho não existe e o
   carteiro.json manda. */
function doEnvLocal(chave) {
  try {
    const caminho = path.join(AQUI, '..', '.env.local')
    if (!fs.existsSync(caminho)) return ''
    const linha = fs.readFileSync(caminho, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith(chave + '='))
    return linha ? linha.slice(linha.indexOf('=') + 1).trim() : ''
  } catch { return '' }
}

function config() {
  let arq = {}
  const caminho = path.join(AQUI, 'carteiro.json')
  try {
    if (fs.existsSync(caminho)) arq = JSON.parse(fs.readFileSync(caminho, 'utf8'))
  } catch (e) {
    console.error('carteiro.json existe mas não é um JSON válido:', e.message)
    process.exit(1)
  }
  const url = String(process.env.CRM_URL || arq.url || 'http://localhost:3000').replace(/\/+$/, '')
  const token = String(
    process.env.CARTEIRO_TOKEN || arq.token ||
    doEnvLocal('CARTEIRO_TOKEN') || doEnvLocal('ANALISE_EVENTO_TOKEN') || '',
  )
  return {
    url,
    token,
    /* DUAS VARREDURAS, e não uma (08/09/2026).

       A funda lê a régua inteira (200 e-mails, 7 dias) e custa caro: 18
       segundos de Outlook, medidos. A olhada lê só o topo da caixa (25
       e-mails, 1 dia) e custa quase nada.

       Uma só não servia para os dois pedidos ao mesmo tempo: ele quer a caixa
       INTEIRA na tela e quer que o e-mail novo apareça sozinho ("uma
       visualização real dos e-mails"). Varrer 200 de meio em meio minuto
       deixaria o COM do Outlook dele ocupado mais da metade do tempo, e o
       Outlook é o programa em que ele trabalha o dia todo.

       As tarefas de resposta rápida (trazer, buscar o texto de um e-mail que
       alguém abriu na tela) continuam sendo olhadas a cada `batida`. */
    varredura_seg: Number(arq.varredura_seg ?? 300),
    olhada_seg: Number(arq.olhada_seg ?? 30),
    olhada_max: Number(arq.olhada_max ?? 25),
    batida_seg: Number(arq.batida_seg ?? 5),
    por: String(arq.por || `Carteiro (${os.hostname()})`),
    /* Vazio = pergunta ao Outlook em qual conta ele está logado. Só se preenche
       para caixa compartilhada (uma caixa de setor aberta no Outlook de alguém).

       CADA PROCESSO LÊ UMA CAIXA (09/09/2026). Para ler a pessoal E a do
       Comercial na mesma máquina, sobem-se dois processos. Como o
       `carteiro.json` mora ao lado do script, duplicar a pasta seria a única
       saída — e duas cópias do mesmo script divergem no terceiro mês. Por isso
       o ambiente manda mais que o arquivo:

           set CARTEIRO_CONTA=comercial@famseguradora.com.br
           node scripts/carteiro.mjs

       Assim a segunda caixa é uma janela a mais, e não uma segunda instalação. */
    conta: String(process.env.CARTEIRO_CONTA || arq.conta || '').trim().toLowerCase(),
  }
}

// ── a ponte com o PowerShell ────────────────────────────────────────────────
/* `execFile` com os argumentos em LISTA, nunca uma linha de comando montada com
   aspas: assunto de e-mail tem aspas, endereço tem acento, e montar string aqui
   seria reabrir o buraco de citação que este sistema já fechou uma vez. */
function ps(args, { timeout = 240_000 } = {}) {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, ...args],
      { timeout, maxBuffer: 128 * 1024 * 1024, windowsHide: true, encoding: 'utf8' },
      (err, saida, erroTxt) => {
        const cru = String(saida || '').trim()
        if (!cru) {
          return resolve({
            ok: false,
            erro: err
              ? `Não consegui rodar a ponte com o Outlook: ${err.message}`
              : 'A ponte com o Outlook não respondeu nada.',
            detalhe: String(erroTxt || '').slice(0, 500),
          })
        }
        try { resolve(JSON.parse(cru)) }
        catch { resolve({ ok: false, erro: 'A ponte respondeu algo que não é JSON.', detalhe: cru.slice(0, 500) }) }
      },
    )
  })
}

/* DE QUAL CAIXA ESTA MÁQUINA FALA.
   Sai do próprio Outlook, e não de um arquivo de configuração: o `diagnostico`
   devolve a conta em que o Outlook clássico está logado. Assim, instalar numa
   máquina nova é copiar dois arquivos e rodar, sem ninguém digitar o endereço
   errado, e a caixa aparece no CRM com o nome certo.

   O `carteiro.json` pode forçar outra (`"conta": "..."`), que é o caso da caixa
   compartilhada: uma caixa de setor aberta dentro do Outlook de alguém. */
let contaDaMaquina = ''
async function descobrirConta(c) {
  if (c.conta) return c.conta
  if (contaDaMaquina) return contaDaMaquina
  const d = await ps(['-Acao', 'diagnostico'], { timeout: 60_000 })
  contaDaMaquina = (d.contas ?? [])[0] ?? ''
  if (!contaDaMaquina) {
    console.error('Não consegui descobrir a conta do Outlook.', d.erro ?? '', d.como_resolver ?? '')
  }
  return contaDaMaquina
}

// ── a ponte com o CRM ───────────────────────────────────────────────────────
async function crm(c, caminho, corpo) {
  const r = await fetch(c.url + caminho, {
    method: corpo ? 'POST' : 'GET',
    headers: {
      'x-carteiro-token': c.token,
      ...(corpo instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corpo instanceof FormData ? corpo : corpo ? JSON.stringify(corpo) : undefined,
  })
  const texto = await r.text()
  let json = {}
  try { json = JSON.parse(texto) } catch { json = { erro: texto.slice(0, 300) } }
  if (!r.ok) return { ok: false, status: r.status, ...json }
  return { ok: true, ...json }
}

// ── as três tarefas ─────────────────────────────────────────────────────────

/* VARRER: olhar é de graça e pode rodar sozinho; trazer é ação, e ação tem
   dono. Esta função nunca traz nada, nem quando a régua diz que o e-mail serve.

   `so_o_topo` é a olhada rápida: mesma régua, mesma rota, mesmo servidor, só
   que olhando o dia de hoje em vez da semana. Não existe caminho separado para
   ela de propósito: dois caminhos é onde nasce a diferença de comportamento que
   ninguém consegue explicar depois. */
async function varrer(c, regras, conta, { so_o_topo = false } = {}) {
  const dias = so_o_topo ? 1 : Math.min(Math.max(Number(regras.dias_para_tras) || 7, 1), 365)
  const max = so_o_topo
    ? Math.min(Math.max(c.olhada_max, 1), 100)
    : Math.min(Math.max(Number(regras.max_por_rodada) || 200, 1), 400)
  const desde = new Date(Date.now() - dias * 86400_000).toISOString()

  /* `-Pasta` SÓ ENTRA QUANDO TEM PASTA. Argumento com string vazia é engolido no
     caminho até o PowerShell, e o que chega lá é `-Pasta -Desde ...`: ele
     reclama que falta o valor de Pasta e a rodada inteira morre. Vazio quer
     dizer Caixa de Entrada, e a ponte já entende a ausência do argumento. */
  const args = ['-Acao', 'listar', '-Desde', desde, '-Max', String(max)]
  if (regras.pasta) args.push('-Pasta', regras.pasta)
  const r = await ps(args)
  if (!r.ok) {
    console.error('  Outlook:', r.erro, r.como_resolver ? `(${r.como_resolver})` : '')
    return
  }

  /* A VARREDURA FOI COMPLETA? (17/09/2026)
     Completa = varreu a régua inteira (não a olhada no topo) E o Outlook não
     bateu no teto de `max`. Só nesse caso o CRM pode concluir que o e-mail
     guardado e ausente da lista saiu da Caixa de Entrada.

     Se bateu no teto, a lista foi CORTADA, e o que ficou de fora do corte não
     sumiu de lugar nenhum: marcar aí seria o sistema apagando da tela e-mail
     que está na caixa, que é pior do que o problema que isto resolve.

     E SÓ PARA A CAIXA DE ENTRADA: se esta caixa estiver configurada para ler
     uma subpasta, a lista que volta é a daquela pasta, e concluir dela que o
     resto "saiu" apagaria da tela a caixa inteira de uma vez. */
  const lidos = (r.emails || []).length
  const completa = !so_o_topo && lidos > 0 && lidos < max && !regras.pasta

  const resp = await crm(c, '/api/carteiro', {
    acao: 'sincronizar',
    conta,
    maquina: os.hostname(),
    pasta: r.pasta || '',
    emails: r.emails || [],
    completa,
    janela_desde: desde,
  })
  if (!resp.ok) return console.error('  CRM recusou a sincronização:', resp.erro)
  console.log(
    `  ${so_o_topo ? 'Olhada' : 'Caixa'}: ${r.lidos} lidos, ${resp.novos} novos, ` +
    `${resp.atualizados} atualizados, ${resp.iguais ?? 0} sem mudança` +
    `${resp.sairam ? `, ${resp.sairam} saíram da caixa` : ''}` +
    `${resp.voltaram ? `, ${resp.voltaram} voltaram` : ''}.`,
  )
  /* O teto de saída foi batido: muita coisa sumindo de uma vez é sintoma de
     lista incompleta, não de faxina. O CRM marcou só os primeiros 100 e contou
     aqui; as rodadas seguintes vão limpando o resto, 100 por vez. */
  if (resp.saida_suspeita) {
    console.log(
      `  Atenção: ${resp.saida_suspeita} e-mails não apareceram na caixa nesta varredura. ` +
      `Marquei 100 como fora da caixa e parei; confira se a Caixa de Entrada está inteira.`,
    )
  }
}

/* O INVENTÁRIO DA CAIXA INTEIRA  ·  17/09/2026
   ═══════════════════════════════════════════════════════════════════════════
   Pergunta dele: "eu não entendo, porque ainda aparece e-mails que eu já tirei
   da caixa de entrada?" Eram 84, medidos na hora, e nenhum dos últimos 7 dias.

   A varredura lê a janela da régua (7 dias) e só sabe dizer "saiu da caixa"
   sobre o que está dentro dela. O que é mais antigo nunca era reavaliado.

   Este inventário pergunta outra coisa, sobre a caixa toda: quem está na Caixa
   de Entrada AGORA. Só os dois identificadores, sem corpo nem anexo — 619
   e-mails em 1,3 s. Roda junto da varredura completa, não da olhada de 30 s.

   NADA É APAGADO. O que muda é `saiu_em`, que é onde a mensagem está hoje; a
   linha continua inteira, e os KPIs, que leem a base toda, não sentem nada. */
async function inventariar(c, regras, conta) {
  const args = ['-Acao', 'inventario']
  if (regras.pasta) args.push('-Pasta', regras.pasta)
  const r = await ps(args, { timeout: 300_000 })
  if (!r.ok) return console.error('  Inventário:', r.erro)

  const resp = await crm(c, '/api/carteiro', {
    acao: 'inventario',
    conta,
    maquina: os.hostname(),
    itens: r.itens || [],
    cortado: r.cortado === true,
  })
  if (!resp.ok) return console.error('  CRM recusou o inventário:', resp.erro)
  if (resp.sairam || resp.voltaram) {
    console.log(
      `  Inventário: ${resp.na_caixa} na caixa` +
      `${resp.sairam ? `, ${resp.sairam} saíram da tela` : ''}` +
      `${resp.voltaram ? `, ${resp.voltaram} voltaram` : ''}` +
      `${resp.faltam ? ` (faltam ${resp.faltam} para as próximas rodadas)` : ''}.`,
    )
  }
}

/* COMO SE ALCANÇA UM E-MAIL  ·  17/09/2026
   ═══════════════════════════════════════════════════════════════════════════
   Caso dele: "estou tentando trazer um e-mail, mas não está trazendo, está
   dizendo que não encontrou o e-mail. Mas eu conferi e tem o e-mail."

   Tinha mesmo. O que não existia mais era o ENDEREÇO: o EntryID do Outlook
   carrega a pasta dentro de si, e aquele e-mail tinha sido arrastado da Caixa
   de Entrada para uma subpasta. O EntryID guardado no dia da varredura virou
   pó, e o script respondeu, com toda a razão do mundo, "não achei".

   Por isso os dois identificadores vão juntos daqui para o PowerShell: o
   EntryID, que resolve rápido quando nada mudou, e o Message-ID, que é o
   número de nascimento da mensagem e acompanha ela para qualquer pasta. A
   `pasta` guardada diz por qual caixa começar a procurar. */
const alcancar = (p, args) => [
  ...args,
  ...(p.entry_id ? ['-EntryId', p.entry_id] : []),
  ...(p.message_id ? ['-MessageId', p.message_id] : []),
  ...(p.pasta ? ['-Pasta', p.pasta] : []),
]

/* E QUANDO FOI O MESSAGE-ID QUE SALVOU, o CRM tem que aprender o endereço
   novo. Sem isto, cada leitura pagaria a varredura de todas as pastas outra
   vez, e o banco seguiria guardando um EntryID que não abre nada. */
async function guardarEndereco(c, p, r) {
  if (!r?.entry_id || r.entry_id === p.entry_id) return
  await crm(c, '/api/carteiro', { acao: 'endereco', id: p.id, entry_id: r.entry_id, pasta: r.pasta || '' })
  console.log(`    O e-mail tinha mudado de pasta${r.pasta ? ` (${r.pasta})` : ''}. Endereço novo guardado.`)
}

/* TRAZER: a tela marcou, a máquina executa. O arquivo temporário é apagado
   sempre, inclusive quando o envio falha: .msg de análise passa de 20 MB e
   deixar rastro na pasta temporária enche o disco em uma semana. */
async function trazer(c, pendentes) {
  for (const p of pendentes) {
    console.log(`  Trazendo: ${p.assunto ?? p.entry_id}`)
    fs.mkdirSync(TEMP, { recursive: true })
    const s = await ps(alcancar(p, ['-Acao', 'salvar', '-Destino', TEMP]), { timeout: 300_000 })
    if (!s.ok) {
      await crm(c, '/api/carteiro', { acao: 'erro', id: p.id, erro: s.erro })
      console.error('   ', s.erro)
      continue
    }
    await guardarEndereco(c, p, s)
    try {
      const buf = fs.readFileSync(s.caminho)
      const form = new FormData()
      form.append('id', p.id)
      form.append('por', c.por)
      form.append('email', new Blob([buf]), path.basename(s.caminho))
      const resp = await crm(c, '/api/carteiro/trazer', form)
      if (resp.ok) {
        console.log(`    Caso #${resp.caso?.numero ?? '?'} aberto, ${resp.documentos ?? 0} documento(s).`)
        if (resp.falhas?.length) console.log('    Não subiram:', resp.falhas.join(' · '))
      } else {
        console.error('   ', resp.erro)
      }
    } catch (e) {
      await crm(c, '/api/carteiro', { acao: 'erro', id: p.id, erro: e.message })
      console.error('   ', e.message)
    } finally {
      try { fs.rmSync(s.caminho, { force: true }) } catch { /* já foi */ }
    }
  }
}

/* O TEXTO DE UM E-MAIL, porque alguém abriu na tela. Texto, e não HTML: HTML de
   terceiro dentro de uma tela nossa obriga a sanitizar, e quem quer ver a
   assinatura com as imagens abre o e-mail no próprio Outlook. */
async function buscarTextos(c, pendentes) {
  for (const p of pendentes) {
    const r = await ps(alcancar(p, ['-Acao', 'texto']), { timeout: 120_000 })
    if (!r.ok) {
      await crm(c, '/api/carteiro', { acao: 'corpo', id: p.id, texto: `[não consegui ler: ${r.erro}]` })
      continue
    }
    await guardarEndereco(c, p, r)
    await crm(c, '/api/carteiro', { acao: 'corpo', id: p.id, texto: r.texto || '' })
    console.log('  Texto entregue de um e-mail.')
  }
}

// ── a rodada ────────────────────────────────────────────────────────────────
/* ── OS AVISOS DA LINHA DO TEMPO DO PEDIDO  ·  17/09/2026 ───────────────────
   Pedido dele: avisar a cada nó do pedido (recebemos, triagem, análise,
   subscrição), com a ordem dele por padrão e a chave de automático por nó.

   O CRM decide O QUE seria dito, para quem, e se já está autorizado. Esta
   máquina só entrega, porque é aqui que o Outlook está. A forma vem junto:
   'rascunho' grava em Rascunhos (nada sai), 'enviar' manda de verdade.

   Três travas, porque aqui sai e-mail em nome da FAM:
     · só chega aqui o que o CRM já marcou como autorizado;
     · `pegar` é uma corrida no banco: duas máquinas com o Carteiro de pé nunca
       entregam o mesmo aviso duas vezes;
     · falhou é gravado com o motivo, e o aviso fica visível na tela como erro,
       nunca some calado. */
async function entregarAvisos(c) {
  const r = await crm(c, '/api/carteiro/avisos')
  if (!r.ok || !r.avisos?.length) return
  for (const a of r.avisos) {
    const pego = await crm(c, '/api/carteiro/avisos', { acao: 'pegar', id: a.id, maquina: os.hostname() })
    if (!pego.ok || !pego.pegou) continue
    console.log(`  Aviso "${a.titulo}" de ${a.empresa ?? 'sem empresa'} para ${a.destino} (${a.modo}).`)
    const saida = await ps([
      '-Acao', 'novo',
      '-Destino', String(a.destino),
      '-Assunto', String(a.assunto),
      '-Corpo', String(a.corpo),
      '-Modo', a.modo === 'enviar' ? 'enviar' : 'rascunho',
    ])
    if (saida.ok) {
      await crm(c, '/api/carteiro/avisos', {
        acao: 'entregue', id: a.id, maquina: os.hostname(),
        entregue_como: saida.modo === 'enviado' ? 'enviado' : 'rascunho',
      })
      console.log(`    ${saida.modo === 'enviado' ? 'Enviado.' : 'Gravado em Rascunhos, no seu Outlook.'}`)
    } else {
      await crm(c, '/api/carteiro/avisos', { acao: 'falhou', id: a.id, maquina: os.hostname(), erro: saida.erro ?? 'falhou' })
      console.error('    Não deu:', saida.erro)
    }
  }
}

let ultimaVarredura = 0
let ultimaOlhada = 0

async function rodada(c, { forcarVarredura = false } = {}) {
  const conta = await descobrirConta(c)
  if (!conta) return

  const ordem = await crm(c, `/api/carteiro?conta=${encodeURIComponent(conta)}&maquina=${encodeURIComponent(os.hostname())}`)
  if (!ordem.ok) {
    console.error('CRM:', ordem.erro ?? `HTTP ${ordem.status}`)
    return
  }
  const regras = ordem.regras ?? {}

  // Trazer e buscar texto vêm PRIMEIRO: alguém está olhando a tela esperando.
  if (ordem.a_trazer?.length) await trazer(c, ordem.a_trazer)
  if (ordem.precisa_corpo?.length) await buscarTextos(c, ordem.precisa_corpo)

  // Os avisos do pedido: o CRM já autorizou, esta máquina entrega.
  try { await entregarAvisos(c) } catch (e) { console.error('  avisos:', e.message) }

  const naHoraDaFunda = Date.now() - ultimaVarredura >= c.varredura_seg * 1000
  const naHoraDaOlhada = Date.now() - ultimaOlhada >= c.olhada_seg * 1000
  if (regras.ligado && (forcarVarredura || naHoraDaFunda)) {
    // A funda também conta como olhada: ela já leu o topo da caixa.
    ultimaVarredura = Date.now()
    ultimaOlhada = Date.now()
    await varrer(c, regras, conta)
    /* O INVENTÁRIO VEM COLADO NA VARREDURA COMPLETA, e não tem relógio próprio:
       são a mesma pergunta em dois alcances (a janela da régua e a caixa toda),
       e dois relógios diferentes para elas seria a tela contando uma coisa numa
       hora e outra noutra, sem ninguém saber explicar por quê. */
    await inventariar(c, regras, conta)
  } else if (regras.ligado && naHoraDaOlhada) {
    ultimaOlhada = Date.now()
    await varrer(c, regras, conta, { so_o_topo: true })
  } else if (!regras.ligado && forcarVarredura) {
    /* A caixa desligada NÃO é erro, e a mensagem diz o que fazer. O Carteiro
       continua batendo: no instante em que o dono ligar na tela, a varredura
       começa sozinha, sem ninguém precisar reiniciar nada nesta máquina. */
    console.log(`  A caixa ${conta} está DESLIGADA. Quem liga é o dono dela, na tela do Comercial.`)
  }
}

// ── entrada ─────────────────────────────────────────────────────────────────
const c = config()
const cmd = process.argv[2] ?? ''

if (!c.token) {
  console.error('Falta o segredo. Ponha CARTEIRO_TOKEN no ambiente ou "token" no carteiro.json.')
  process.exit(1)
}

if (cmd === 'diagnostico') {
  const r = await ps(['-Acao', 'diagnostico'], { timeout: 60_000 })
  console.log(JSON.stringify(r, null, 2))
  const conta = await descobrirConta(c)
  console.log('Caixa desta máquina:', conta || '(não descobri)')
  const ordem = conta
    ? await crm(c, `/api/carteiro?conta=${encodeURIComponent(conta)}&maquina=${encodeURIComponent(os.hostname())}`)
    : { ok: false, erro: 'sem conta' }
  console.log('CRM em', c.url, ':', ordem.ok ? 'respondeu' : `NÃO respondeu (${ordem.erro ?? ordem.status})`)
  if (ordem.ok) console.log('Estado da caixa no CRM:', ordem.conta?.ligado ? 'LIGADA' : 'desligada')
} else if (cmd === 'uma-vez') {
  await rodada(c, { forcarVarredura: true })
} else {
  console.log(`Carteiro de pé. CRM em ${c.url}.`)
  console.log(`Caixa: ${(await descobrirConta(c)) || '(descobrindo)'}`)
  console.log(
    `Olha o topo da caixa a cada ${c.olhada_seg}s, varre a caixa inteira a cada ${c.varredura_seg}s ` +
    `e atende a tela a cada ${c.batida_seg}s.`,
  )
  console.log('Deixe esta janela aberta. Ctrl+C para parar.\n')
  await rodada(c, { forcarVarredura: true })
  /* UMA RODADA POR VEZ. Trazer um e-mail de 30 MB leva mais que a batida, e sem
     esta trava a rodada seguinte entraria por cima: o mesmo e-mail seria salvo
     duas vezes e o CRM levaria dois pedidos de abertura do mesmo caso. */
  let rodando = false
  setInterval(async () => {
    if (rodando) return
    rodando = true
    try { await rodada(c) } catch (e) { console.error('Rodada falhou:', e.message) }
    finally { rodando = false }
  }, Math.max(c.batida_seg, 2) * 1000)
}
