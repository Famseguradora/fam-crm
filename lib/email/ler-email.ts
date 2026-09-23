// ============================================================================
//  Leitor de e-mail salvo (.msg e .eml) — porte do `ler-emails.mjs` do motor
//
//  Por que portar em vez de instalar biblioteca: este código já resolveu, em
//  produção, quatro armadilhas que uma biblioteca genérica não resolve sozinha
//  (estão comentadas uma a uma abaixo). Trocar por um pacote novo seria refazer
//  a mesma descoberta do zero.
//
//  Diferença para o original: lá a entrada é um caminho no disco; aqui é o
//  Buffer que chegou pelo upload. Nada de `fs` — roda no servidor do CRM.
// ============================================================================

export type AnexoEmail = { nome: string; dados: Buffer; embutido: boolean }

export type EmailLido = {
  assunto: string
  de: string
  email_de: string
  para: string
  copia: string
  data: string
  corpo: string
  anexos: AnexoEmail[]
  /* A IDENTIDADE DO E-MAIL NO MUNDO, e ela existe por causa dos dois canos.
     O EntryID do Outlook só vale dentro daquela caixa naquela máquina (mover de
     pasta já o troca). O Message-ID vem no cabeçalho, é o mesmo no .msg baixado,
     no .eml e no Graph, e é ele que impede o mesmo e-mail de virar dois casos
     quando entra pelo Carteiro e alguém sobe o arquivo depois. Vazio quando o
     e-mail não traz o cabeçalho (raro, mas acontece em item local do Outlook). */
  message_id: string
}

// ─────────────────────────────────────────────── .msg (OLE Compound File)

const LIVRE = 0xffffffff
const FIM = 0xfffffffe

type EntradaCfbf = { nome: string; tipo: number; filho: number; inicio: number; tamanho: number; idx: number }

function abrirCfbf(b: Buffer) {
  const tamSetor = 1 << b.readUInt16LE(0x1e)
  const tamMini = 1 << b.readUInt16LE(0x20)
  const qtdFat = b.readUInt32LE(0x2c)
  const dirInicio = b.readUInt32LE(0x30)
  const corteMini = b.readUInt32LE(0x38)
  const miniFatInicio = b.readUInt32LE(0x3c)
  const difatInicio = b.readUInt32LE(0x44)
  const difatQtd = b.readUInt32LE(0x48)
  const desloc = (s: number) => (s + 1) * tamSetor

  // Os 109 primeiros setores da FAT ficam no cabeçalho. Arquivo grande transborda
  // para setores extras encadeados, e sem seguir essa corrente o .msg de 8 MB não abre.
  const setoresFat: number[] = []
  for (let i = 0; i < Math.min(qtdFat, 109); i++) setoresFat.push(b.readUInt32LE(0x4c + i * 4))
  let s = difatInicio
  for (let n = 0; n < difatQtd && s !== FIM && s !== LIVRE; n++) {
    const base = desloc(s)
    const cabem = tamSetor / 4 - 1
    for (let i = 0; i < cabem && setoresFat.length < qtdFat; i++) setoresFat.push(b.readUInt32LE(base + i * 4))
    s = b.readUInt32LE(base + cabem * 4)
  }

  const fat: number[] = []
  for (const sf of setoresFat) {
    if (sf === FIM || sf === LIVRE) continue
    const base = desloc(sf)
    for (let i = 0; i < tamSetor / 4; i++) fat.push(b.readUInt32LE(base + i * 4))
  }

  const cadeia = (inicio: number, tabela: number[]) => {
    const saida: number[] = []
    let c = inicio
    let guarda = 0
    while (c !== FIM && c !== LIVRE && c < tabela.length && guarda++ < 1e6) {
      saida.push(c)
      c = tabela[c]
    }
    return saida
  }
  const juntar = (inicio: number) =>
    Buffer.concat(cadeia(inicio, fat).map((x) => b.subarray(desloc(x), desloc(x) + tamSetor)))

  const dir = juntar(dirInicio)
  const entradas: EntradaCfbf[] = []
  for (let i = 0; i + 128 <= dir.length; i += 128) {
    const tamNome = dir.readUInt16LE(i + 64)
    if (!tamNome) continue
    entradas.push({
      nome: dir.subarray(i, i + Math.max(0, tamNome - 2)).toString('utf16le'),
      tipo: dir.readUInt8(i + 66),
      filho: dir.readUInt32LE(i + 76),
      inicio: dir.readUInt32LE(i + 116),
      tamanho: dir.readUInt32LE(i + 120),
      idx: entradas.length,
    })
  }

  const miniFat: number[] = []
  for (const x of cadeia(miniFatInicio, fat)) {
    const base = desloc(x)
    for (let i = 0; i < tamSetor / 4; i++) miniFat.push(b.readUInt32LE(base + i * 4))
  }
  const raizEntrada = entradas[0]
  const miniStream = raizEntrada && raizEntrada.tamanho ? juntar(raizEntrada.inicio) : Buffer.alloc(0)

  // Stream menor que o corte não ocupa setor inteiro: mora no mini stream da raiz.
  const conteudo = (e: EntradaCfbf): Buffer => {
    if (!e.tamanho) return Buffer.alloc(0)
    if (e.tamanho < corteMini) {
      return Buffer.concat(
        cadeia(e.inicio, miniFat).map((x) => miniStream.subarray(x * tamMini, x * tamMini + tamMini)),
      ).subarray(0, e.tamanho)
    }
    return juntar(e.inicio).subarray(0, e.tamanho)
  }

  const filhosDe = (idx: number): EntradaCfbf[] => {
    const inicio = entradas[idx]?.filho
    if (inicio === undefined || inicio === LIVRE) return []
    const saida: EntradaCfbf[] = []
    const pilha = [inicio]
    const visto = new Set<number>()
    while (pilha.length) {
      const i = pilha.pop() as number
      if (i === LIVRE || i >= entradas.length || visto.has(i)) continue
      visto.add(i)
      saida.push(entradas[i])
      pilha.push(dir.readUInt32LE(i * 128 + 68), dir.readUInt32LE(i * 128 + 72))
    }
    return saida
  }

  return { conteudo, filhosDe }
}

// __substg1.0_0037001F: 0037 é a propriedade (assunto) e 001F diz que o texto é UTF-16.
const DECODIFICA: Record<string, (b: Buffer) => string> = {
  '001f': (b) => b.toString('utf16le'),
  '001e': (b) => b.toString('latin1'),
}

// E-mail escrito no Outlook costuma vir só em HTML. Jogar fora as marcações de
// qualquer jeito gruda tudo numa linha só: fechamento de parágrafo e <br> viram
// quebra de linha de propósito, senão o corpo chega ilegível.
export const htmlParaTexto = (h: string) =>
  h
    .replace(/\r\n?/g, '\n')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<br[^>]*>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const htmlDoBuffer = (buf: Buffer) => {
  const latin = buf.toString('latin1')
  const jogo = (latin.match(/charset=["']?([\w-]+)/i) || [])[1] || ''
  return htmlParaTexto(/utf-?8/i.test(jogo) ? buf.toString('utf8') : latin)
}

function propriedadesDe(itens: EntradaCfbf[], conteudo: (e: EntradaCfbf) => Buffer) {
  const mapa: Record<string, string | Buffer> = {}
  for (const e of itens) {
    const m = e.nome.match(/^__substg1\.0_([0-9A-F]{4})([0-9A-F]{4})$/i)
    if (!m) continue
    const f = DECODIFICA[m[2].toLowerCase()]
    mapa[m[1].toUpperCase()] = f ? f(conteudo(e)).replace(/\0+$/, '') : conteudo(e)
  }
  return mapa
}

const texto = (v: string | Buffer | undefined) => (typeof v === 'string' ? v : '')

function lerMsg(buf: Buffer): EmailLido {
  const { conteudo, filhosDe } = abrirCfbf(buf)
  const topo = filhosDe(0)
  const p = propriedadesDe(topo, conteudo)

  const anexos: AnexoEmail[] = []
  for (const e of topo) {
    if (e.tipo !== 1 || !/^__attach_version1\.0_/i.test(e.nome)) continue
    const pa = propriedadesDe(filhosDe(e.idx), conteudo)
    // 3712 é o Content-ID: só imagem embutida no corpo tem, e é isso que separa a
    // assinatura do remetente de um documento anexado de verdade.
    if (Buffer.isBuffer(pa['3701'])) {
      anexos.push({
        nome: texto(pa['3707']) || texto(pa['3704']) || 'anexo',
        dados: pa['3701'] as Buffer,
        embutido: !!pa['3712'],
      })
    }
  }

  // Muito e-mail do Outlook não tem PR_BODY (1000) e guarda tudo em PR_BODY_HTML (1013).
  // Aconteceu em 3 dos 6 primeiros e-mails reais: o corpo chegava vazio, e é justamente
  // no corpo que estão corretora, produto e condições comerciais.
  let corpo = texto(p['1000'])
  if (!corpo.trim() && Buffer.isBuffer(p['1013'])) corpo = htmlDoBuffer(p['1013'] as Buffer)

  return {
    assunto: texto(p['0037']),
    de: texto(p['0C1A']) || texto(p['0042']),
    // 0C1F vem como "/O=EXCHANGELABS/OU=..." quando o remetente é interno, que não
    // serve para nada. O SMTP de verdade está no 5D01.
    email_de: texto(p['5D01']) || texto(p['5D02']) || (/@/.test(texto(p['0C1F'])) ? texto(p['0C1F']) : ''),
    para: texto(p['0E04']),
    copia: texto(p['0E03']),
    corpo,
    data: texto(p['007D']).match(/^Date:\s*(.+)$/im)?.[1]?.trim() || '',
    anexos,
    // 1035 é o PidTagInternetMessageId. Quando falta (item criado dentro do
    // Outlook, nunca transmitido), o cabeçalho bruto do 007D ainda o traz.
    message_id:
      texto(p['1035']) ||
      texto(p['007D']).match(/^Message-ID:\s*(.+)$/im)?.[1]?.trim() ||
      '',
  }
}

// ─────────────────────────────────────────────────────────── .eml (MIME)

// "=?UTF-8?B?...?=" é como o e-mail carrega acento no assunto. Sem desfazer isso o
// assunto sai com um monte de sinal no meio.
//
// O `\?=\s+=\?` PRECISA ser colado ANTES de decodificar, e isto é conserto de um
// defeito real, medido no acervo: assunto comprido é quebrado em vários pedaços
// codificados, e a RFC 2047 manda ignorar o espaço ENTRE dois pedaços. Sem colar
// antes, o espaço vira parte do texto e a palavra sai partida ao meio: os e-mails
// reais traziam "ATUALIZ AR CADASTRO", "Gar antia de Pagamento" e "R$ 55 milh ões".
// Colar depois de decodificar não funciona: os marcadores `?=` e `=?` já sumiram.
function decodificarCabecalho(s: string) {
  return String(s || '')
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, jogo: string, tipo: string, txt: string) => {
      try {
        const bruto =
          tipo.toUpperCase() === 'B'
            ? Buffer.from(txt, 'base64')
            : Buffer.from(
                txt.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, h: string) => String.fromCharCode(parseInt(h, 16))),
                'latin1',
              )
        return bruto.toString(/utf-?8/i.test(jogo) ? 'utf8' : 'latin1')
      } catch {
        return txt
      }
    })
    .replace(/\?=\s*=\?/g, '')
}

const desdobrar = (cab: string) => cab.replace(/\r?\n[ \t]+/g, ' ')

function quotedPrintable(txt: string, jogo: string) {
  const bytes: number[] = []
  const limpo = txt.replace(/=\r?\n/g, '')
  for (let i = 0; i < limpo.length; i++) {
    if (limpo[i] === '=' && /[0-9A-F]{2}/i.test(limpo.substr(i + 1, 2))) {
      bytes.push(parseInt(limpo.substr(i + 1, 2), 16))
      i += 2
    } else {
      bytes.push(limpo.charCodeAt(i) & 0xff)
    }
  }
  return Buffer.from(bytes).toString(/utf-?8/i.test(jogo || '') ? 'utf8' : 'latin1')
}

const partesMime = (corpo: string, fronteira: string) =>
  corpo
    .split('--' + fronteira)
    .slice(1, -1)
    .map((p) => p.replace(/^\r?\n/, ''))

type ParteMime = ReturnType<typeof analisarParte>

function analisarParte(bruto: string) {
  const corte = bruto.search(/\r?\n\r?\n/)
  const cab = desdobrar(corte < 0 ? bruto : bruto.slice(0, corte))
  const corpo = corte < 0 ? '' : bruto.slice(corte).replace(/^\r?\n\r?\n/, '')
  const pega = (n: string) => (cab.match(new RegExp('^' + n + ':\\s*(.*)$', 'im')) || [])[1] || ''
  const tipo = pega('Content-Type')
  return {
    cab,
    corpo,
    tipo: tipo.split(';')[0].trim().toLowerCase(),
    jogo: (tipo.match(/charset="?([^";]+)/i) || [])[1] || '',
    fronteira: (tipo.match(/boundary="?([^";]+)/i) || [])[1] || '',
    codificacao: pega('Content-Transfer-Encoding').trim().toLowerCase(),
    disposicao: pega('Content-Disposition'),
    nomeArquivo: decodificarCabecalho(
      (pega('Content-Disposition').match(/filename\*?="?([^";]+)/i) || [])[1] ||
        (tipo.match(/name\*?="?([^";]+)/i) || [])[1] ||
        '',
    ),
  }
}

function lerEml(buf: Buffer): EmailLido {
  const txt = buf.toString('utf8')
  const raiz = analisarParte(txt)
  const pega = (n: string) =>
    decodificarCabecalho((raiz.cab.match(new RegExp('^' + n + ':\\s*(.*)$', 'im')) || [])[1] || '')

  const textoDaParte = (parte: ParteMime) =>
    parte.codificacao === 'base64'
      ? Buffer.from(parte.corpo.replace(/\s/g, ''), 'base64').toString(/utf-?8/i.test(parte.jogo) ? 'utf8' : 'latin1')
      : parte.codificacao === 'quoted-printable'
        ? quotedPrintable(parte.corpo, parte.jogo)
        : parte.corpo

  let corpo = ''
  let html = ''
  const anexos: AnexoEmail[] = []

  const percorrer = (parte: ParteMime) => {
    if (parte.fronteira) {
      for (const p of partesMime(parte.corpo, parte.fronteira)) percorrer(analisarParte(p))
      return
    }
    const ehAnexo = /attachment/i.test(parte.disposicao) || (!!parte.nomeArquivo && !/^text\/(plain|html)$/.test(parte.tipo))
    if (ehAnexo) {
      const dados =
        parte.codificacao === 'base64'
          ? Buffer.from(parte.corpo.replace(/\s/g, ''), 'base64')
          : Buffer.from(parte.corpo, 'latin1')
      if (dados.length) {
        anexos.push({ nome: parte.nomeArquivo || 'anexo', dados, embutido: /^Content-ID:/im.test(parte.cab) })
      }
      return
    }
    if (parte.tipo === 'text/plain' && !corpo) corpo = textoDaParte(parte)
    if (parte.tipo === 'text/html' && !html) html = textoDaParte(parte)
  }
  percorrer(raiz)

  if (!corpo.trim() && html) corpo = htmlParaTexto(html)

  // "Fulano <fulano@x.com>" vem inteiro no From. Separar aqui evita o endereço sair
  // duas vezes quando o texto junta nome e e-mail.
  const remetente = pega('From')
  const email = (remetente.match(/<([^>]+)>/) || [])[1] || (/@/.test(remetente) ? remetente.trim() : '')
  const nome = remetente.replace(/<[^>]*>/g, '').replace(/^["'\s]+|["'\s]+$/g, '') || email

  return {
    assunto: pega('Subject'),
    de: nome,
    email_de: email,
    para: pega('To'),
    copia: pega('Cc'),
    data: pega('Date'),
    corpo,
    anexos,
    message_id: pega('Message-ID'),
  }
}

// ──────────────────────────────────────────────────────────────── entrada

export function ehArquivoDeEmail(nome: string) {
  return /\.(msg|eml)$/i.test(nome)
}

/* O ARQUIVO SE APRESENTA PELO CONTEÚDO, NÃO PELO NOME  ·  23/09/2026

   O nome é uma pista boa, e só. Quando o e-mail vem ARRASTADO do Outlook, o
   navegador monta o arquivo a partir de um item virtual (o e-mail mora no
   Exchange, não no disco), e o nome que ele inventa depende do assunto, da
   versão do Windows e do humor do dia: pode vir "Assunto.msg", pode vir sem
   extensão, pode vir cortado. Recusar por causa do nome é recusar um e-mail
   que está inteiro ali dentro.

   As duas assinaturas:
     .msg  é um arquivo composto do Windows (OLE/CFB), que começa com
           D0CF11E0A1B11AE1. Mas .doc e .xls antigos também começam assim, e
           por isso não basta: o .msg guarda as propriedades em streams com o
           nome `__substg1.0_`, escrito em UTF-16. É esse par que identifica.
     .eml  é texto puro que começa com cabeçalhos de e-mail. Basta achar um
           `From:`, `Subject:`, `Received:`, `Message-ID:` ou `MIME-Version:`
           no começo, antes do corpo.

   Isto NÃO substitui a leitura: é o porteiro. Quem lê de verdade é `lerEmail`,
   logo abaixo, e ele erra alto se o arquivo estiver corrompido. */
export function pareceEmail(buf: Buffer): boolean {
  if (buf.length < 16) return false

  if (buf.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1') {
    /* `__substg1.0_` em UTF-16LE. Procura no arquivo inteiro e não só no
       começo: a tabela de diretórios do CFB pode estar no fim, e um .msg
       grande (anexo pesado) empurra tudo para lá. */
    return buf.includes(Buffer.from('__substg1.0_', 'utf16le'))
  }

  /* O .eml: as primeiras linhas são cabeçalhos. 8 KB é muito mais do que
     qualquer bloco de cabeçalho precisa, e evita varrer um arquivo de 50 MB
     para responder "não". */
  const comeco = buf.subarray(0, 8192).toString('latin1')
  const primeiroBloco = comeco.split(/\r?\n\r?\n/)[0] ?? ''
  return /^(from|to|subject|date|received|message-id|mime-version|return-path|x-[a-z-]+):/im.test(primeiroBloco)
}

/** O nome diz que é e-mail, OU o conteúdo prova que é. */
export const ehEmail = (nome: string, buf: Buffer) => ehArquivoDeEmail(nome) || pareceEmail(buf)

/** O nome com que este e-mail deve ser guardado. Arrastado do Outlook, ele
 *  chega sem extensão com frequência, e arquivo sem extensão no Storage é
 *  arquivo que ninguém consegue abrir depois. */
export function nomeDeEmail(nome: string, buf: Buffer): string {
  if (ehArquivoDeEmail(nome)) return nome
  const ext = buf.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1' ? '.msg' : '.eml'
  const limpo = String(nome || 'e-mail').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').trim() || 'e-mail'
  return limpo + ext
}

export function lerEmail(buf: Buffer): EmailLido {
  const e = buf.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1' ? lerMsg(buf) : lerEml(buf)

  // NFC no assunto e em TODO nome de anexo, na porta de entrada, para nada
  // depois daqui precisar lembrar disso. Medido no acervo: o anexo "Balanço
  // Consolidado Maskan" chega com a cedilha em acento COMBINANTE, separada do
  // "c". Como a classificação de documento olha o NOME do arquivo, "balanco"
  // com cedilha solta não casa com o padrão que procura "balanco", e um balanço
  // patrimonial entraria como documento não identificado.
  e.assunto = e.assunto.normalize('NFC')
  for (const a of e.anexos) a.nome = a.nome.normalize('NFC')
  e.message_id = normalizarMessageId(e.message_id)
  return e
}

/* O Message-ID chega ora com os sinais de menor/maior, ora sem, dependendo de quem
   escreveu. Como ele é a chave que impede o e-mail de entrar duas vezes, as duas
   grafias TÊM que virar a mesma coisa: "<a@b>" e "a@b" são o mesmo e-mail, e um
   índice único não sabe disso sozinho.
   Não baixo para minúscula de propósito: a RFC 5322 trata a parte antes do @ como
   sensível a maiúscula, e juntar dois e-mails diferentes é pior do que deixar um
   duplicado passar. */
export const normalizarMessageId = (s: string) =>
  String(s || '').trim().replace(/^<|>$/g, '').trim().slice(0, 500)

// Assunto vira nome legível de caso.
//
// O `.normalize('NFC')` vem ANTES de tudo, e não é preciosismo: o primeiro anexo
// real que chegou pelo Outlook veio como "Balanço 2025.pdf" com a cedilha em acento
// COMBINANTE, separada do "c". Como o classificador de documento olha o NOME do
// arquivo, "balanco" com cedilha solta não casa com o padrão que procura "balanco",
// e um balanço patrimonial entraria como documento não identificado.
export const limparNome = (s: string) =>
  String(s || '')
    .normalize('NFC')
    .replace(/^\s*((RES|ENC|RE|FW|FWD|ENC_|RES_)\s*:\s*)+/i, '')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .slice(0, 120)
    .trim()

// Logo de assinatura não é documento: metade dos anexos do acervo é isso, e cada um
// viraria uma página inútil para a análise ler. Filtrar por tamanho não serve (já
// apareceu assinatura de 105 KB). O que separa de verdade é a imagem estar embutida
// no corpo (tem Content-ID) ou usar o nome que o Outlook dá para elas.
export const ehEnfeite = (a: AnexoEmail) =>
  /\.(png|jpe?g|gif|bmp)$/i.test(a.nome) && (a.embutido || /^image\d{3}\./i.test(a.nome))

// Extensões que valem como documento, por inclusão (mesma lista do Carteiro).
const UTEIS = /\.(pdf|docx?|xlsx?|xlsm|pptx?|zip|rar|7z|csv|txt|xml|ofx|rem|p7s|msg|eml)$/i

export function anexosUteis(email: EmailLido) {
  return email.anexos.filter(
    (a) =>
      // Anexo de zero byte é o marcador que o Outlook põe quando o arquivo foi
      // mandado por link do OneDrive ("You've been sent large files"): subir isso
      // criaria um documento vazio na triagem, e o arquivo de verdade continuaria
      // no link, que ninguém abriu.
      a.dados.length > 0 &&
      !ehEnfeite(a) &&
      (UTEIS.test(a.nome) || !/\.(png|jpe?g|gif|bmp)$/i.test(a.nome)),
  )
}
