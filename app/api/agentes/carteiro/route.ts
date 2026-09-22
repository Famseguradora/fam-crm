// ============================================================================
//  /api/agentes/carteiro  ·  o botão "Agente Carteiro" da tela do Comercial
//
//  Pedido dele em 10/09/2026: "aparece os e-mails, mas aparece atrasado. Eu
//  estou com o Outlook aberto, mas mesmo assim não aparece os e-mails de hoje.
//  Para não esquecer, crie um botão dentro do CRM: Agente Carteiro. Quando eu
//  clicar, abre o agente."
//
//  O diagnóstico dele estava certo e foi conferido: o atraso não era o ritmo do
//  Carteiro (ele olha o topo da caixa a cada 30 s), era o Carteiro NÃO ESTAR
//  RODANDO. Sem ele, nenhum e-mail novo chega ao banco, e a tela não tem como
//  saber que o Outlook recebeu alguma coisa.
//
//     GET   o Carteiro está de pé nesta máquina? (e quem pode ligar)
//     POST  liga o Carteiro, se não estiver de pé — nunca um segundo
//
//  SÓ FUNCIONA NA MÁQUINA DELE, e é de propósito. O Carteiro lê o Outlook
//  clássico pelo COM, e o COM só existe no Windows onde a caixa está aberta.
//  Este servidor liga o processo porque ELE PRÓPRIO roda nessa máquina (o
//  localhost:3000). Na Vercel não há Outlook nem Windows: a rota responde isso
//  com todas as letras, e a tela esconde o botão.
//
//  POR QUE NÃO MORA EM /api/carteiro: aquele prefixo é PÚBLICO no proxy.ts,
//  porque o próprio Carteiro fala com o CRM sem sessão (usa token). Uma rota
//  que liga processo na máquina de alguém debaixo de prefixo público seria uma
//  porta aberta. Aqui exige sessão E ser o proprietário do CRM.
//
//  UM CARTEIRO SÓ, SEMPRE. Dois leriam a mesma caixa duas vezes e dariam a
//  mesma ordem de "trazer" em dobro. Antes de ligar, procura qualquer
//  `node ... carteiro.mjs` de pé — por QUALQUER caminho. O agentes-subir.cmd
//  exige `fam-crm` na linha de comando e por isso não enxerga o Carteiro
//  aberto pelo CARTEIRO.cmd (que roda `node scripts\carteiro.mjs`, relativo);
//  esta rota não repete esse furo.
//
//  SEM JANELA. A saída vai para o agentes.log na raiz, com a mesma convenção do
//  agentes.vbs: é o que substitui a janela preta que ele tinha que manter
//  aberta.
// ============================================================================
import { NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@/lib/supabase/server'
// Achar o processo e ler o log moram num lugar só, com a Esteira (lib/agentes/processo.ts).
import { processosDoScript, pararProcessos, caudaDe, type Rodando } from '@/lib/agentes/processo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A raiz do repositório: o `next dev` e o `next start` sobem daqui. */
const RAIZ = process.cwd()
const SCRIPT = path.join(RAIZ, 'scripts', 'carteiro.mjs')
const LOG = path.join(RAIZ, 'agentes.log')

/** Este servidor está numa máquina capaz de rodar o Carteiro? */
const ehMaquinaLocal = () =>
  !process.env.VERCEL && process.platform === 'win32' && fs.existsSync(SCRIPT)

/* QUEM ESTÁ DE PÉ. O filtro `Name='node.exe'` fica no próprio CIM, e não só no
   `Where-Object`: sem ele, o powershell que faz a pergunta também tem
   "carteiro.mjs" na linha de comando e se acharia a si mesmo. Os argumentos
   vão em LISTA, nunca numa linha montada com aspas.

   O NOME TEM QUE SER O ARQUIVO, E NÃO UM PEDAÇO DELE (10/09/2026). A primeira
   versão procurava `*carteiro.mjs*`, e o ensaio desta rota — que se chama
   `ensaio-agente-carteiro.mjs` — contou a si mesmo como um segundo Carteiro.
   Pior que o falso alarme: qualquer script com esse final faria a rota achar
   que o Carteiro está de pé e NÃO ligá-lo. Agora `carteiro.mjs` precisa vir
   logo depois de uma barra, de um espaço, de aspas ou do começo da linha. */
const carteirosDePe = (): Promise<Rodando[]> => processosDoScript('carteiro.mjs')

/** As últimas linhas do agentes.log: é onde o Carteiro diz por que parou. */
const caudaDoLog = (linhas = 8): string => caudaDe(LOG, linhas)

async function quemPede() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 }) }
  const { data: eu } = await supabase
    .from('usuarios').select('nome, proprietario').eq('auth_id', user.id).maybeSingle()
  return { nome: (eu?.nome as string | null) ?? user.email ?? 'alguém', proprietario: !!eu?.proprietario }
}

export async function GET() {
  const q = await quemPede()
  if ('erro' in q) return q.erro

  /* Quem não pode ligar não precisa saber de PID nem de caminho. A tela só usa
     `pode_ligar` para decidir se o botão existe; o "está de pé ou não" que
     todos veem continua vindo do banco (`email_contas.ultimo_contato`). */
  const local = ehMaquinaLocal()
  if (!local || !q.proprietario) {
    return NextResponse.json({ pode_ligar: false, local })
  }

  const de_pe = await carteirosDePe()
  return NextResponse.json({
    pode_ligar: true,
    local: true,
    rodando: de_pe.length > 0,
    desde: de_pe[0]?.desde ?? null,
    quantos: de_pe.length,
  })
}

export async function POST() {
  const q = await quemPede()
  if ('erro' in q) return q.erro

  if (!ehMaquinaLocal()) {
    return NextResponse.json(
      {
        erro: 'O Carteiro roda no notebook onde o Outlook está aberto. Este CRM não está nessa máquina, então daqui não dá para ligá-lo: abra o CRM pelo localhost:3000 no notebook do Marco.',
        local: false,
      },
      { status: 409 },
    )
  }
  if (!q.proprietario) {
    return NextResponse.json(
      { erro: 'Só o proprietário do CRM liga o Carteiro: ele roda na máquina dele, com o Outlook dele.' },
      { status: 403 },
    )
  }

  // Um de cada: se já está de pé, não sobe outro.
  const antes = await carteirosDePe()
  if (antes.length) {
    return NextResponse.json({
      ok: true,
      ja_estava: true,
      rodando: true,
      desde: antes[0].desde,
      quantos: antes.length,
    })
  }

  /* LIGAR SEM JANELA. `detached` + `unref` fazem o Carteiro sobreviver ao
     próprio servidor do CRM: reiniciar o localhost não derruba a leitura do
     e-mail. `windowsHide` é o que impede a janela preta. A saída vai para o
     agentes.log, anexada, com a linha de cabeçalho dizendo quem ligou. */
  let fd: number | null = null
  try {
    fd = fs.openSync(LOG, 'a')
    fs.writeSync(fd, `\n==== Agente Carteiro ligado pelo CRM (${q.nome}) em ${new Date().toLocaleString('pt-BR')} ====\n`)
    const filho = spawn(process.execPath, [SCRIPT], {
      cwd: RAIZ,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', fd, fd],
    })
    filho.unref()
  } catch (e) {
    return NextResponse.json(
      { erro: `Não consegui ligar o Carteiro: ${(e as Error).message}` },
      { status: 500 },
    )
  } finally {
    if (fd !== null) { try { fs.closeSync(fd) } catch { /* o filho tem a própria cópia */ } }
  }

  /* CONFERIR QUE FICOU DE PÉ, e não só que foi disparado. O erro mais comum
     não é o processo não subir: é ele subir e morrer em dois segundos porque o
     Outlook clássico não está logado. Nesse caso a resposta leva o fim do log,
     que é onde o Carteiro escreve o motivo. */
  await new Promise((r) => setTimeout(r, 4000))
  const depois = await carteirosDePe()
  if (!depois.length) {
    return NextResponse.json(
      {
        erro: 'O Carteiro subiu e parou logo em seguida. O motivo está no agentes.log; quase sempre é o Outlook clássico fechado ou não logado.',
        log: caudaDoLog(),
      },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, ligado: true, rodando: true, desde: depois[0].desde })
}

/* ============================================================================
   DESLIGAR  ·  22/09/2026

   Ordem dele: "eu ligo clicando no botão dentro de comercial, mas eu preciso
   também ter a opção de desligar dentro do sistema, nesse mesmo botão". Até
   hoje desligar era o PARAR AGENTES.cmd, que é justamente o clique fora do
   sistema que ele mandou acabar em 10/09.

   MESMAS TRAVAS DO LIGAR, e não menos: sessão, proprietário e máquina local.
   Desligar não é a operação inofensiva das duas — enquanto o Carteiro está
   parado, e-mail novo não entra na caixa e o texto inteiro de um e-mail não
   pode ser buscado. Por isso a resposta diz quantos foram parados, e o
   agentes.log recebe a linha de quem desligou e quando: o dia em que alguém
   perguntar "por que não chegou e-mail desde as 15h" tem que ter resposta.

   PARA TODOS OS QUE ACHAR, e não só o primeiro. Se dois Carteiros subiram por
   engano, desligar um deixaria o outro lendo a caixa e a tela apagaria a
   bolinha: o estado mostrado mentiria sobre o que a máquina está fazendo.
============================================================================ */
export async function DELETE() {
  const q = await quemPede()
  if ('erro' in q) return q.erro

  if (!ehMaquinaLocal()) {
    return NextResponse.json(
      {
        erro: 'O Carteiro roda no notebook onde o Outlook está aberto. Este CRM não está nessa máquina, então daqui não dá para desligá-lo.',
        local: false,
      },
      { status: 409 },
    )
  }
  if (!q.proprietario) {
    return NextResponse.json(
      { erro: 'Só o proprietário do CRM desliga o Carteiro: ele roda na máquina dele.' },
      { status: 403 },
    )
  }

  const antes = await carteirosDePe()
  if (!antes.length) {
    // Já estava parado. Não é erro: o botão e a máquina só estavam fora de passo.
    return NextResponse.json({ ok: true, ja_estava: true, rodando: false, quantos: 0 })
  }

  try {
    fs.appendFileSync(
      LOG,
      `\n==== Agente Carteiro desligado pelo CRM (${q.nome}) em ${new Date().toLocaleString('pt-BR')} ====\n`,
    )
  } catch { /* o log é o registro, não a operação: falhar aqui não impede parar */ }

  await pararProcessos(antes.map((p) => p.pid))

  /* CONFERIR QUE PAROU MESMO. `Stop-Process` não devolve erro útil quando não
     consegue, então quem responde é a máquina: pergunta de novo. Sem isto a
     tela apagaria a bolinha com o Carteiro ainda lendo a caixa. */
  await new Promise((r) => setTimeout(r, 1500))
  const depois = await carteirosDePe()
  if (depois.length) {
    return NextResponse.json(
      {
        erro: `Mandei parar, mas ${depois.length === 1 ? 'o Carteiro continua' : `${depois.length} Carteiros continuam`} de pé. Tente de novo; se insistir, o PARAR AGENTES.cmd na máquina resolve.`,
        rodando: true,
        quantos: depois.length,
      },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, desligado: true, rodando: false, quantos: antes.length })
}
