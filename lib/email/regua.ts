/* A RÉGUA DO E-MAIL · os parâmetros que dizem o que é trabalho da FAM
   ═══════════════════════════════════════════════════════════════════════════

   Ordem do Marco em 11/09/2026: "crie uma tela de parâmetros, onde o usuário
   irá parametrizar a análise dos e-mails, e quando ele precisar fazer algo
   fora do parâmetro, ele faz individual. Repare que isso é um painel gerencial
   operacional, antes de realizar trabalho errado."

   TRÊS DECISÕES QUE NÃO SE LEEM NO CÓDIGO:

   1. OS TIPOS DE PARÂMETRO SÃO FIXOS, OS VALORES SÃO LIVRES. A régua tem seis
      listas e só seis. Quem mexe (a tela, e depois a IA pela conversa) muda o
      que está DENTRO delas. Tipo novo passa por engenharia: sem essa trava, em
      três meses são 200 parâmetros que ninguém entende.

   2. VERSÃO É FOTOGRAFIA, NUNCA EDIÇÃO. Cada mudança grava a régua inteira com
      número, autor, data e motivo, e a versão velha não se apaga (a tabela não
      tem UPDATE nem DELETE para ninguém). O e-mail é julgado pela versão que
      valia quando ele CHEGOU: mudar a régua hoje não reescreve o relatório de
      ontem. Foi a regra do protótipo de 04/09 ("régua nova não muda o
      passado"), e é a do Stripe Radar, que o mercado usa.

   3. É PURO. Sem banco aqui dentro: a tela, a rota que grava e o teste usam o
      MESMO validador, senão a tela aceita o que o servidor recusa.

   A régua NÃO é a régua da caixa (`lib/email/regras.ts`). Aquela decide o que
   o Carteiro deixa a FAM ver (privacidade: anexo, remetente interno). Esta
   decide o que, do que passou, é trabalho de análise. */

/** Termo que aponta modalidade. Com mais de uma modalidade, é uma FAMÍLIA:
 *  "judicial" sozinho não diz qual das quatro, mas se as quatro estão sem
 *  apetite, a decisão já está tomada. */
export interface Sinonimo {
  termo: string
  modalidades: string[]
}

export interface ParametrosRegua {
  /** Modalidades SEM apetite hoje. A operação morre ao nascer; o tomador fica vivo. */
  excluidas: string[]
  /** Palavra que aponta modalidade. O nome oficial da modalidade já vale sozinho. */
  sinonimos: Sinonimo[]
  /** Sinal de que o pedido traz operação ("cotação", "IS"). */
  termos_operacao: string[]
  /** Sinal de pedido só de análise de crédito ("cadastro", "limite de crédito"). */
  termos_so_credito: string[]
  /** Assunto que diz: isto não é pedido de corretora. */
  nao_demanda_assunto: string[]
  /** Remetente (endereço inteiro ou @domínio) que nunca é pedido. */
  nao_demanda_remetentes: string[]
}

export interface VersaoRegua {
  versao: number
  parametros: ParametrosRegua
  motivo: string
  criada_por_nome: string | null
  criada_em: string
}

/** Os nomes das listas, como a tela e o histórico escrevem. */
export const NOME_DO_PARAMETRO: Record<keyof ParametrosRegua, string> = {
  excluidas: 'Modalidades sem apetite',
  sinonimos: 'Como a modalidade aparece no e-mail',
  termos_operacao: 'Sinais de operação',
  termos_so_credito: 'Sinais de pedido só de crédito',
  nao_demanda_assunto: 'Assunto que não é pedido',
  nao_demanda_remetentes: 'Remetente que não é pedido',
}

/* A PRIMEIRA RÉGUA, a mesma que a migration grava como versão 1.

   Judicial fora do apetite porque foi o que ele disse no exemplo de 11/09
   ("Judiciais, a qual a FAM não tem interesse no momento") e é o que o
   relatório de crédito já escreve ("Judicial Cível e Trabalhista; Judicial
   Fiscal e Arbitral ficam bloqueados"). É ponto de partida, e a tela diz isso.

   Os sinônimos só levam o que é inequívoco no seguro garantia. "Performance"
   entra como família das três Executante (as três com apetite, então a decisão
   não depende de qual). "Transporte", "WCC" e parecidos ficam de fora: é para
   a pessoa ensinar, não para a régua adivinhar.

   "IMOBILIÁRIA" E "IMOBILIÁRIO" SAÍRAM DEPOIS DE RODAR NOS E-MAILS REAIS: são
   nome de empresa ("Uriel Gaspar 1 Empreendimento Imobiliário", "Terra Nobre
   Incorporações Imobiliárias"), e fizeram um pedido de garantia JUDICIAL cair
   como Garantia Imobiliária. Fica "permuta" e o nome oficial. */
export const REGUA_INICIAL: ParametrosRegua = {
  excluidas: [
    'Judicial Cível',
    'Judicial para Execução Fiscal',
    'Judicial Trabalhista',
    'Judicial Depósito Recursal',
  ],
  sinonimos: [
    { termo: 'execução fiscal', modalidades: ['Judicial para Execução Fiscal'] },
    { termo: 'judicial fiscal', modalidades: ['Judicial para Execução Fiscal'] },
    { termo: 'judicial cível', modalidades: ['Judicial Cível'] },
    { termo: 'trabalhista', modalidades: ['Judicial Trabalhista'] },
    { termo: 'depósito recursal', modalidades: ['Judicial Depósito Recursal'] },
    {
      termo: 'judicial',
      modalidades: ['Judicial Cível', 'Judicial para Execução Fiscal', 'Judicial Trabalhista', 'Judicial Depósito Recursal'],
    },
    {
      termo: 'judiciais',
      modalidades: ['Judicial Cível', 'Judicial para Execução Fiscal', 'Judicial Trabalhista', 'Judicial Depósito Recursal'],
    },
    { termo: 'permuta', modalidades: ['Garantia Imobiliária'] },
    { termo: 'contrato de fornecimento', modalidades: ['Executante - Fornecedor'] },
    { termo: 'licitante', modalidades: ['Licitante'] },
    { termo: 'bid bond', modalidades: ['Licitante'] },
    { termo: 'adiantamento', modalidades: ['Adiantamento de Pagamentos'] },
    { termo: 'retenção', modalidades: ['Retenção de Pagamentos'] },
    { termo: 'manutenção corretiva', modalidades: ['Manutenção Corretiva'] },
    { termo: 'aduaneiro', modalidades: ['Garantia Aduaneiro'] },
    { termo: 'aduaneira', modalidades: ['Garantia Aduaneiro'] },
    { termo: 'concessão', modalidades: ['Concessão'] },
    { termo: 'parcelamento', modalidades: ['Parcelamento Administrativo Fiscal'] },
    {
      termo: 'performance',
      modalidades: ['Executante - Construtor', 'Executante - Fornecedor', 'Executante - Prestador de Serviços'],
    },
    {
      termo: 'executante',
      modalidades: ['Executante - Construtor', 'Executante - Fornecedor', 'Executante - Prestador de Serviços'],
    },
  ],
  termos_operacao: [
    'cotação', 'cotacao', 'cotar', 'IS', 'importância segurada', 'LMG', 'apólice',
    'emissão', 'endosso', 'proposta', 'renovação da apólice',
  ],
  termos_so_credito: [
    'cadastro', 'cadastral', 'análise de crédito', 'análise cadastral',
    'análise de tomador', 'análise do tomador',
    'limite de crédito', 'aprovação de limite', 'revisão de limite',
    'renovação de limite', 'rating',
  ],
  nao_demanda_assunto: [],
  nao_demanda_remetentes: [],
}

/* ══════════════════════════════════════════════════════════════════════════
   NORMALIZAR  ·  a comparação que não tropeça em acento nem em caixa
   ══════════════════════════════════════════════════════════════════════════ */

/** Minúsculo, sem acento, e tudo que não é letra ou número vira espaço. */
export function normalizar(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    // As marcas de acento que o NFD separou da letra (U+0300 a U+036F).
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Onde o termo aparece como PALAVRA INTEIRA no texto já normalizado.
 * Devolve a posição em caracteres, ou -1. Palavra inteira de propósito:
 * "is" não pode casar dentro de "análise", nem "retenção" dentro de outra
 * palavra que só começa igual.
 */
export function acharTermo(textoNormalizado: string, termo: string): number {
  const t = normalizar(termo)
  if (!t) return -1
  const i = ` ${textoNormalizado} `.indexOf(` ${t} `)
  return i
}

/* ══════════════════════════════════════════════════════════════════════════
   VALIDAR  ·  a mesma régua na tela e no servidor
   ══════════════════════════════════════════════════════════════════════════ */

const LISTAS_DE_TERMOS = ['termos_operacao', 'termos_so_credito', 'nao_demanda_assunto', 'nao_demanda_remetentes'] as const
const MAX_ITENS = 200
const MAX_TERMO = 80

export interface ResultadoValidacao {
  ok: boolean
  erros: string[]
  /** A régua limpa: sem espaço sobrando, sem repetido, na ordem em que veio. */
  parametros: ParametrosRegua
}

const unicos = (xs: string[]) => {
  const vistos = new Set<string>()
  const saida: string[] = []
  for (const x of xs) {
    const chave = normalizar(x)
    if (!chave || vistos.has(chave)) continue
    vistos.add(chave)
    saida.push(x.trim())
  }
  return saida
}

/**
 * Valida e limpa uma régua. `modalidades` são os NOMES cadastrados em
 * `modalidades` (a fonte oficial): régua que cita modalidade que não existe
 * seria regra que nunca dispara, e ninguém perceberia.
 */
export function validarParametros(entrada: unknown, modalidades: readonly string[]): ResultadoValidacao {
  const erros: string[] = []
  const e = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, unknown>
  const nomes = new Map(modalidades.map((m) => [normalizar(m), m]))

  const lista = (campo: string): string[] => {
    const v = e[campo]
    if (v === undefined || v === null) return []
    if (!Array.isArray(v)) { erros.push(`${campo}: precisa ser uma lista.`); return [] }
    const xs = v.map((x) => String(x ?? '').trim()).filter(Boolean)
    if (xs.length > MAX_ITENS) erros.push(`${campo}: mais de ${MAX_ITENS} itens.`)
    for (const x of xs) if (x.length > MAX_TERMO) erros.push(`"${x.slice(0, 30)}…" passa de ${MAX_TERMO} caracteres.`)
    return unicos(xs)
  }

  const oficial = (nome: string, onde: string): string | null => {
    const achado = nomes.get(normalizar(nome))
    if (!achado) { erros.push(`${onde}: "${nome}" não é uma modalidade cadastrada.`); return null }
    return achado
  }

  const excluidas = lista('excluidas').map((m) => oficial(m, 'Sem apetite')).filter((m): m is string => !!m)

  const sinonimos: Sinonimo[] = []
  const brutos = e.sinonimos
  if (brutos !== undefined && brutos !== null && !Array.isArray(brutos)) erros.push('sinonimos: precisa ser uma lista.')
  const vistos = new Set<string>()
  for (const s of Array.isArray(brutos) ? brutos : []) {
    const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
    const termo = String(o.termo ?? '').trim()
    if (!termo) continue
    if (termo.length > MAX_TERMO) { erros.push(`"${termo.slice(0, 30)}…" passa de ${MAX_TERMO} caracteres.`); continue }
    if (normalizar(termo).length < 2) { erros.push(`"${termo}" é curto demais para reconhecer modalidade.`); continue }
    const chave = normalizar(termo)
    if (vistos.has(chave)) { erros.push(`"${termo}" aparece duas vezes como sinônimo.`); continue }
    vistos.add(chave)
    const mods = (Array.isArray(o.modalidades) ? o.modalidades : [])
      .map((m) => oficial(String(m ?? ''), `Sinônimo "${termo}"`))
      .filter((m): m is string => !!m)
    if (!mods.length) { erros.push(`Sinônimo "${termo}" não aponta para nenhuma modalidade.`); continue }
    sinonimos.push({ termo, modalidades: [...new Set(mods)] })
  }
  if (sinonimos.length > MAX_ITENS) erros.push(`sinonimos: mais de ${MAX_ITENS} itens.`)

  const limpas = Object.fromEntries(LISTAS_DE_TERMOS.map((c) => [c, lista(c)])) as Pick<ParametrosRegua, typeof LISTAS_DE_TERMOS[number]>

  /* TAMANHO MÍNIMO EM TODA LISTA. "a" como assunto que não é pedido tirava da
     conta qualquer assunto com a palavra "a" (achado da revisão). Para tirar
     da conta, o termo precisa de corpo: 4 letras. */
  for (const t of [...limpas.termos_operacao, ...limpas.termos_so_credito]) {
    if (normalizar(t).length < 2) erros.push(`"${t}" é curto demais para ser sinal de pedido.`)
  }
  for (const t of limpas.nao_demanda_assunto) {
    if (normalizar(t).length < 4) erros.push(`"${t}" é curto demais: tiraria da conta qualquer assunto com essa palavra.`)
  }

  /* Remetente compara pelo endereço em minúsculas, e não normalizado:
     "joao.silva@x.com" e "joao-silva@x.com" são duas pessoas. */
  const remetentesBrutos = e.nao_demanda_remetentes
  limpas.nao_demanda_remetentes = [...new Set(
    (Array.isArray(remetentesBrutos) ? remetentesBrutos : []).map((x) => String(x ?? '').trim().toLowerCase()).filter(Boolean),
  )]
  for (const r of limpas.nao_demanda_remetentes) {
    if (!r.includes('@')) erros.push(`"${r}" não é endereço de e-mail nem @domínio.`)
  }

  /* Um termo não pode dizer duas coisas: se "cadastro" é sinal de pedido E
     assunto que não é pedido, a régua decide pela ordem do código, e ninguém
     que lê a tela saberia qual venceu. */
  const naoDemanda = new Set(limpas.nao_demanda_assunto.map(normalizar))
  for (const t of [...limpas.termos_operacao, ...limpas.termos_so_credito]) {
    if (naoDemanda.has(normalizar(t))) erros.push(`"${t}" está como sinal de pedido e como assunto que não é pedido.`)
  }

  return {
    ok: erros.length === 0,
    erros,
    parametros: { excluidas: [...new Set(excluidas)], sinonimos, ...limpas },
  }
}

/**
 * LER uma régua que veio do banco, sem confiar no formato. O validador acima
 * é o porteiro da gravação; este é o do caminho de volta: uma versão gravada
 * por fora da tela (direto no banco, com lista virando texto) não pode
 * derrubar a ponte de todo mundo, porque versão não se apaga. O que não tem
 * forma de lista vira lista vazia, e o que não é texto sai.
 */
export function lerParametros(bruto: unknown): ParametrosRegua {
  const o = (bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {}) as Record<string, unknown>
  const textos = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [])
  return {
    excluidas: textos(o.excluidas),
    sinonimos: (Array.isArray(o.sinonimos) ? o.sinonimos : [])
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map((s) => ({ termo: typeof s.termo === 'string' ? s.termo : '', modalidades: textos(s.modalidades) }))
      .filter((s) => s.termo.trim() && s.modalidades.length),
    termos_operacao: textos(o.termos_operacao),
    termos_so_credito: textos(o.termos_so_credito),
    nao_demanda_assunto: textos(o.nao_demanda_assunto),
    nao_demanda_remetentes: textos(o.nao_demanda_remetentes),
  }
}

/** A versão com os parâmetros já lidos com desconfiança. */
export const lerVersao = (v: { versao: number; parametros: unknown; motivo?: string | null; criada_por_nome?: string | null; criada_em: string }): VersaoRegua => ({
  versao: v.versao,
  parametros: lerParametros(v.parametros),
  motivo: v.motivo ?? '',
  criada_por_nome: v.criada_por_nome ?? null,
  criada_em: v.criada_em,
})

/* ══════════════════════════════════════════════════════════════════════════
   QUAL VERSÃO JULGA QUAL E-MAIL
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A versão que valia no instante. `versoes` em qualquer ordem. E-mail que
 * chegou antes da primeira régua é julgado pela primeira: antes dela não havia
 * régua nenhuma, e deixar o passado sem julgamento esconderia o passivo.
 */
export function reguaDoInstante(versoes: readonly VersaoRegua[], instante: string | Date | null | undefined): VersaoRegua | null {
  if (!versoes.length) return null
  const ordem = [...versoes].sort((a, b) => a.versao - b.versao)
  const t = instante ? new Date(instante).getTime() : NaN
  // Sem data, a mesma regra de "antes de tudo": a primeira.
  if (Number.isNaN(t)) return ordem[0]
  let vale = ordem[0]
  for (const v of ordem) if (new Date(v.criada_em).getTime() <= t) vale = v
  return vale
}

export const reguaVigente = (versoes: readonly VersaoRegua[]): VersaoRegua | null =>
  versoes.length ? [...versoes].sort((a, b) => b.versao - a.versao)[0] : null

/* ══════════════════════════════════════════════════════════════════════════
   O QUE MUDOU DE UMA VERSÃO PARA OUTRA  ·  o "antes e depois" do histórico
   ══════════════════════════════════════════════════════════════════════════ */

export interface MudancaRegua {
  parametro: keyof ParametrosRegua
  entrou: string[]
  saiu: string[]
}

const rotuloSinonimo = (s: Sinonimo) =>
  `${s.termo} → ${s.modalidades.length > 1 ? s.modalidades.join(', ') : s.modalidades[0]}`

export function diferencas(antes: ParametrosRegua | null, depois: ParametrosRegua): MudancaRegua[] {
  const a = antes ?? { excluidas: [], sinonimos: [], termos_operacao: [], termos_so_credito: [], nao_demanda_assunto: [], nao_demanda_remetentes: [] }
  const saida: MudancaRegua[] = []
  const comparar = (parametro: keyof ParametrosRegua, xa: string[], xd: string[]) => {
    const na = new Set(xa.map(normalizar))
    const nd = new Set(xd.map(normalizar))
    const entrou = xd.filter((x) => !na.has(normalizar(x)))
    const saiu = xa.filter((x) => !nd.has(normalizar(x)))
    if (entrou.length || saiu.length) saida.push({ parametro, entrou, saiu })
  }
  comparar('excluidas', a.excluidas, depois.excluidas)
  comparar('sinonimos', a.sinonimos.map(rotuloSinonimo), depois.sinonimos.map(rotuloSinonimo))
  for (const c of LISTAS_DE_TERMOS) comparar(c, a[c], depois[c])
  return saida
}
