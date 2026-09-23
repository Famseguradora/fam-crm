/* A FILA DO DIA · o que o Carteiro põe na mesa para as análises começarem
   ═══════════════════════════════════════════════════════════════════════════

   Ordem do Marco em 17/09/2026: "preciso do Agente de E-mail (carteiro), que
   seja ativo. Preciso que ele me ajude a zerar a fila de análises. Entenda: os
   e-mails sempre serão analisados até o dia útil anterior ao dia de hoje.
   Então, tudo que está antes dessa data precisa apresentar o relatório para
   iniciarmos as análises."

   DUAS CONTAS, E SÓ ELAS, MORAM AQUI:

     1. O CORTE. A fila vai até o FIM do último dia útil anterior a hoje. O
        e-mail que chegou hoje NÃO entra: ele ainda é de hoje, e o combinado é
        analisar o de ontem. Numa segunda-feira, "ontem" é a sexta.

     2. O AGRUPAMENTO. Um bloco por remetente, porque é assim que a fila é
        zerada na prática: "o que a Isabela mandou", e não uma lista solta de
        39 assuntos fora de ordem.

   POR QUE ISTO É UM ARQUIVO PURO, sem React e sem Supabase: conta de data é
   onde erro se esconde calado. Um corte errado numa segunda-feira esconde a
   sexta inteira, e ninguém percebe olhando a tela — a tela fica bonita e
   vazia. Aqui a conta é testada (`npm run fila:test`), inclusive na virada de
   fim de semana e na virada de mês.

   QUEM DECIDE O QUE "SERVE" CONTINUA SENDO A RÉGUA (`lib/email/regras.ts`).
   Esta peça não reescreve nenhum critério: ela chama `avaliarEmail` com a
   régua da caixa e só desliga o teste de remetente, que é o filtro próprio da
   fila. Duas cópias da mesma regra divergem no primeiro ajuste. */

import { avaliarEmail, type RegrasEmail, REGRAS_PADRAO } from './regras'

/* O fuso do Brasil, fixo em -03:00, igual a `lib/email/metricas.ts`: não há
   horário de verão desde 2019, e um `new Date()` do navegador de alguém em
   outro fuso não pode mudar qual é "o dia útil anterior" da FAM. */
const FUSO_MS = 3 * 3_600_000
const DIA_MS = 86_400_000

/** A meia-noite (de Brasília) do dia em que este instante caiu. */
export function inicioDoDia(d: Date): Date {
  const b = new Date(d.getTime() - FUSO_MS)
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) + FUSO_MS)
}

/** Domingo é 0 e sábado é 6, contados em Brasília e não no fuso de quem olha. */
export function ehFimDeSemana(d: Date): boolean {
  const dia = new Date(d.getTime() - FUSO_MS).getUTCDay()
  return dia === 0 || dia === 6
}

/* FERIADO NÃO CONTA, por ora (decisão dele em 17/09/2026: "só fim de semana").
   É o mesmo que o CRM já faz nas horas úteis do pedido, e não depende de
   nenhuma fonte externa para a fila do dia abrir. Quando entrar feriado, entra
   aqui dentro, e a tela não muda uma linha. */

/** A meia-noite do último dia útil ANTES do dia de hoje. Nunca devolve hoje. */
export function ultimoDiaUtil(agora: Date): Date {
  let d = new Date(inicioDoDia(agora).getTime() - DIA_MS)
  // 10 voltas é folga de sobra para um fim de semana; existe só para uma data
  // corrompida não virar laço infinito na tela de alguém.
  for (let i = 0; i < 10 && ehFimDeSemana(d); i++) d = new Date(d.getTime() - DIA_MS)
  return d
}

export interface JanelaDaFila {
  /** Nulo em "tudo": aí a fila não tem começo, só o corte. */
  desde: Date | null
  /** O último instante que entra: 23:59:59.999 do último dia útil. */
  ate: Date
  /** O dia do corte, para escrever "até quarta, 16/09". */
  corte: Date
  frase: string
}

const DIA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const ddmm = (d: Date) => {
  const b = new Date(d.getTime() - FUSO_MS)
  return `${String(b.getUTCDate()).padStart(2, '0')}/${String(b.getUTCMonth() + 1).padStart(2, '0')}`
}
const nomeDoDia = (d: Date) => DIA_SEMANA[new Date(d.getTime() - FUSO_MS).getUTCDay()]

/** O próximo dia útil depois de hoje. É quando o e-mail que chegou hoje entra na fila. */
export function proximoDiaUtil(agora: Date): Date {
  let d = new Date(inicioDoDia(agora).getTime() + DIA_MS)
  for (let i = 0; i < 10 && ehFimDeSemana(d); i++) d = new Date(d.getTime() + DIA_MS)
  return d
}

/** "quarta, 16/09". O dia por extenso, para a frase do boletim. */
export function diaPorExtenso(d: Date): string {
  return `${nomeDoDia(d)}, ${ddmm(d)}`
}

/** A janela da fila: `dias` dias corridos terminando no último dia útil. `dias = 0` é tudo. */
export function janelaDaFila(agora: Date, dias = 7): JanelaDaFila {
  const corte = ultimoDiaUtil(agora)
  const ate = new Date(corte.getTime() + DIA_MS - 1)
  const desde = dias > 0 ? new Date(corte.getTime() - (dias - 1) * DIA_MS) : null
  const fimTexto = `${nomeDoDia(corte)}, ${ddmm(corte)}`
  return {
    desde,
    ate,
    corte,
    frase: desde ? `de ${ddmm(desde)} até ${fimTexto}` : `até ${fimTexto}`,
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   OS REMETENTES

   A lista aceita o endereço inteiro (`ivan.lima@famseguradora.com.br`) e o
   domínio (`@atix.com.br`). O domínio existe para o colega que vai cuidar da
   caixa do Comercial: o pedido dele chega de fora da FAM, de uma corretora, e
   ninguém vai cadastrar os doze e-mails de uma corretora um a um.
   ──────────────────────────────────────────────────────────────────────────── */

/** Serve para o campo de digitar: aceita `fulano@empresa.com` e `@empresa.com`. */
export function remetenteValido(x: string): boolean {
  const s = String(x ?? '').trim().toLowerCase()
  if (s.startsWith('@')) return /^@[a-z0-9.-]+\.[a-z]{2,}$/.test(s)
  return /^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s)
}

/** O endereço de quem escreveu, em minúsculas. É a chave do agrupamento. */
export function enderecoDe(e: EmailDaFila): string {
  return String(e.email_de ?? e.de ?? '').trim().toLowerCase()
}

export function bateRemetente(e: EmailDaFila, lista: string[]): boolean {
  if (!lista.length) return true // sem lista, a fila mostra todo mundo e a tela avisa isso
  const alvo = `${e.email_de ?? ''} ${e.de ?? ''}`.toLowerCase()
  return lista.some((x) => alvo.includes(String(x).trim().toLowerCase()))
}

/* ────────────────────────────────────────────────────────────────────────────
   A FILA
   ──────────────────────────────────────────────────────────────────────────── */

export interface EmailDaFila {
  id: string
  assunto?: string | null
  de?: string | null
  email_de?: string | null
  recebido_em?: string | null
  nao_lido?: boolean | null
  anexos_uteis?: number | null
  anexos?: { nome?: string | null }[] | null
  previa?: string | null
  estado?: string | null
  caso_id?: string | null
  conta_id?: string | null
  estado_erro?: string | null
  /** Marcado no "já analisei" (analisado por fora do sistema). Sai da fila. */
  analisado_fora_em?: string | null
}

/* O QUE É "FALTA TRATAR" (decisão dele em 17/09/2026: "só o que falta
   tratar"). `trazido` e `tratado` saíram da fila porque já foram decididos; o
   `a_trazer` fica, e de propósito: ele está a caminho, e se o Carteiro estiver
   parado esse e-mail some do radar de todo mundo. `erro` fica pelo mesmo
   motivo, com a falha à vista. A fila zera de verdade quando a tela esvazia. */
const PENDENTES = new Set(['novo', 'a_trazer', 'erro'])

/* O "JÁ ANALISEI" SAI DA FILA NA HORA (ordem dele em 17/09/2026: "quando eu
   clicar em já analisei, tem que sair essa linha desse e-mail"). O botão grava
   `analisado_fora_em` e NÃO mexe em `estado` — o estado continua 'novo', que
   era justamente o que trazia a linha de volta a cada recarga. Quem já virou
   caso (`caso_id`) sai pelo mesmo motivo: foi decidido, não falta tratar. */
export const pendente = (e: EmailDaFila) =>
  !e.analisado_fora_em && !e.caso_id && PENDENTES.has(String(e.estado ?? 'novo'))

export interface GrupoDaFila {
  remetente: string
  /** "Isabela Paixão", quando o Outlook mandou o nome. */
  nome: string
  emails: EmailDaFila[]
}

export interface Fila {
  grupos: GrupoDaFila[]
  total: number
  /** Os que a régua da caixa recusou (sem anexo, auto-resposta), com o motivo. */
  foraDaRegua: { email: EmailDaFila; motivo: string }[]
  /** Remetentes que escreveram na janela e NÃO estão na lista, do que mais escreveu ao que menos. */
  sugestoes: { remetente: string; nome: string; quantos: number }[]
}

export interface OpcoesDaFila {
  remetentes: string[]
  janela: JanelaDaFila
  regras?: RegrasEmail
  /** Liga os que a régua recusou (o botão "mostrar também os sem anexo"). */
  incluirForaDaRegua?: boolean
}

export function montarFila(emails: EmailDaFila[], o: OpcoesDaFila): Fila {
  const { desde, ate } = o.janela
  const regras = o.regras ?? REGRAS_PADRAO

  /* A RÉGUA SEM O TESTE DE REMETENTE. Quem decide o remetente na fila é a
     lista da tela, e deixar os dois ligados faria a régua recusar por
     "remetente fora da lista" o e-mail que a fila acabou de escolher —
     o motivo na tela sairia mentindo. */
  const reguaDaFila: RegrasEmail = { ...regras, remetentes: [], so_remetente_interno: false }

  const naJanela = emails.filter((e) => {
    if (!e.recebido_em) return false
    const t = new Date(e.recebido_em).getTime()
    if (!Number.isFinite(t)) return false
    return t <= ate.getTime() && (!desde || t >= desde.getTime())
  })

  const daLista = naJanela.filter((e) => pendente(e) && bateRemetente(e, o.remetentes))

  const foraDaRegua: { email: EmailDaFila; motivo: string }[] = []
  const dentro: EmailDaFila[] = []
  for (const e of daLista) {
    const { serve, motivo } = avaliarEmail(e, reguaDaFila)
    if (serve || o.incluirForaDaRegua) dentro.push(e)
    if (!serve) foraDaRegua.push({ email: e, motivo })
  }

  const porRemetente = new Map<string, GrupoDaFila>()
  for (const e of dentro) {
    const chave = enderecoDe(e) || '(sem remetente)'
    const g = porRemetente.get(chave) ?? {
      remetente: chave,
      nome: String(e.de ?? '').split(/[<(|]/)[0].trim() || chave,
      emails: [],
    }
    g.emails.push(e)
    porRemetente.set(chave, g)
  }

  const quando = (e: EmailDaFila) => new Date(e.recebido_em ?? 0).getTime() || 0
  const grupos = [...porRemetente.values()]
    .map((g) => ({ ...g, emails: g.emails.sort((a, b) => quando(b) - quando(a)) }))
    .sort((a, b) => b.emails.length - a.emails.length || a.remetente.localeCompare(b.remetente))

  /* AS SUGESTÕES são o caminho curto para cadastrar remetente novo: quem
     escreveu de verdade na janela e ainda não está na lista. Vale para o
     funcionário que entrou esta semana e para a corretora de fora, que é o que
     o Comercial vai precisar. Só conta quem passa na régua, senão a sugestão
     mais forte seria sempre um robô de notificação. */
  const contagem = new Map<string, { nome: string; quantos: number }>()
  for (const e of naJanela) {
    if (bateRemetente(e, o.remetentes) && o.remetentes.length) continue
    if (!o.remetentes.length && porRemetente.has(enderecoDe(e))) continue
    if (!avaliarEmail(e, reguaDaFila).serve) continue
    const chave = enderecoDe(e)
    if (!chave) continue
    const atual = contagem.get(chave)
    contagem.set(chave, {
      nome: atual?.nome || String(e.de ?? '').split(/[<(|]/)[0].trim() || chave,
      quantos: (atual?.quantos ?? 0) + 1,
    })
  }
  const sugestoes = [...contagem.entries()]
    .map(([remetente, v]) => ({ remetente, ...v }))
    .sort((a, b) => b.quantos - a.quantos || a.remetente.localeCompare(b.remetente))
    .slice(0, 8)

  return { grupos, total: dentro.length, foraDaRegua, sugestoes }
}

/* ────────────────────────────────────────────────────────────────────────────
   O BOLETIM DO DIA

   Pedido dele em 17/09/2026: "precisa mostrar um aviso de e-mails que
   chegaram. Também pode fazer um aviso sobre relatório do dia anterior,
   informar que está pronto, e quando eu fizer análise e finalizar análise do
   dia em questão, apresente um aviso de quantas empresas eu analisei e quantas
   ainda faltam."

   O boletim fecha o dia útil anterior: quantas empresas chegaram elegíveis
   naquele dia, quantas já saíram da sua mão e quantas ainda esperam. É a mesma
   régua da fila — o que muda é que aqui o que JÁ FOI FEITO continua contando,
   senão não existiria "de 5, faltam 3".

   POR QUE EMPRESA, E NÃO E-MAIL: ele conta em empresa ("quantas empresas eu
   analisei"), e dois e-mails do mesmo pedido são um trabalho só. Quando o caso
   já foi aberto, o nome vem do cadastro (`razao_social`), que é firme; antes
   disso vem do assunto, e a tela mostra o assunto embaixo para conferir. Nome
   de empresa adivinhado e apresentado como certo seria a tela mentindo.
   ──────────────────────────────────────────────────────────────────────────── */

/** O que a view `painel_pedidos` acrescenta ao e-mail. Tudo opcional: sem ela,
 *  o boletim ainda monta, só sem o nome firme e sem o estado da análise. */
export interface LinhaBoletim extends EmailDaFila {
  razao_social?: string | null
  cnpj?: string | null
  caso_numero?: number | null
  caso_etapa?: string | null
  fila_situacao?: string | null
  fila_concluido_em?: string | null
  analisado_fora_em?: string | null
}

/** Tira o "ENC:", o "RE:", os códigos entre colchetes e o excesso de espaço. */
export function limparAssunto(a?: string | null): string {
  return String(a ?? '')
    .replace(/^\s*((RES?|ENC|FW|FWD)\s*\.?\s*:\s*)+/gi, '')
    .replace(/\[[^\]]{1,40}\]/g, ' ')
    /* O PARÊNTESE NA FRENTE é a corretora, do jeito que o Comercial escreve:
       "(HORIENS) RI HAPPY BRINQUEDOS SA - CARTA DE NOMEAÇÃO". Sem tirar, o
       boletim listaria a empresa como "(HORIENS) RI HAPPY BRINQUEDOS SA", que
       é o nome de duas empresas grudadas. Só o do começo sai: parêntese no
       meio costuma ser informação do pedido. */
    .replace(/^\s*\([^)]{1,40}\)\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/* O sufixo societário é o sinal mais confiável de "aqui está o nome da
   empresa" num assunto de e-mail da FAM: "RI HAPPY BRINQUEDOS SA - CARTA DE
   NOMEAÇÃO - FAM" tem o nome no primeiro pedaço, e "PGTO. ENERGIA - R$ ... -
   LIGAS DE ALUMINIO SA LIASA - 17.221.771/0001-01" tem no terceiro. Sem esse
   sinal, o boletim NÃO adivinha: mostra o assunto limpo, e a tela diz que
   aquilo é o assunto e não o cadastro. */
const SOCIETARIO = /(^|\s)(s\.?\/?a\.?|ltda\.?|eireli|epp|s\/s)(\s|$|\.)/i
const PEDACOS = /\s+[-–—|·]\s+/

export function empresaDoEmail(e: LinhaBoletim): { nome: string; firme: boolean } {
  const doCadastro = String(e.razao_social ?? '').trim()
  if (doCadastro) return { nome: doCadastro, firme: true }
  const limpo = limparAssunto(e.assunto)
  const pedaco = limpo.split(PEDACOS).map((x) => x.trim()).filter(Boolean).find((x) => SOCIETARIO.test(x))
  return { nome: (pedaco || limpo || '(sem assunto)').slice(0, 70), firme: false }
}

// `\p{M}` (marca de combinação) em vez da faixa U+0300-U+036F escrita à mão:
// a faixa crua é invisível no arquivo, e regex que ninguém lê é regex que
// ninguém revisa.
const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** A chave que junta dois e-mails na mesma empresa: o CNPJ manda; depois o nome. */
export function chaveDaEmpresa(e: LinhaBoletim): string {
  const cnpj = String(e.cnpj ?? '').replace(/\D/g, '')
  if (cnpj.length === 14) return cnpj
  return semAcento(empresaDoEmail(e).nome).replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Onde o pedido parou. A ordem da lista abaixo é a de precedência. */
export type SituacaoBoletim = 'analisada' | 'na_esteira' | 'dispensada' | 'a_caminho' | 'falta'
const ORDEM: SituacaoBoletim[] = ['analisada', 'na_esteira', 'dispensada', 'a_caminho', 'falta']

export function situacaoDe(e: LinhaBoletim): SituacaoBoletim {
  if (e.fila_concluido_em) return 'analisada'
  if (e.caso_id) return 'na_esteira'
  if (e.analisado_fora_em) return 'dispensada'
  const estado = String(e.estado ?? 'novo')
  if (estado === 'tratado') return 'dispensada'
  if (estado === 'trazido') return 'na_esteira'
  if (estado === 'a_trazer') return 'a_caminho'
  return 'falta'
}

export interface ItemDoBoletim {
  chave: string
  nome: string
  /** Falso quando o nome saiu do assunto, e não do cadastro do caso. */
  firme: boolean
  assunto: string
  remetente: string
  /** A situação mais avançada entre os e-mails desta empresa. */
  situacao: SituacaoBoletim
  /** Verdadeiro enquanto sobrar e-mail sem decisão: é o que "faltam" conta. */
  pendente: boolean
  emails: LinhaBoletim[]
  caso_id?: string | null
  caso_numero?: number | null
}

export interface Boletim {
  /** O dia que o boletim fecha (o último dia útil anterior a hoje). */
  dia: Date
  diaTexto: string
  /** Uma empresa por linha, da que falta para a que já foi. */
  itens: ItemDoBoletim[]
  empresas: number
  faltam: number
  feitas: number
  analisadas: number
  /** Quantos e-mails elegíveis o dia teve (uma empresa pode ter mais de um). */
  emails: number
  fechado: boolean
}

export function montarBoletim(linhas: LinhaBoletim[], o: {
  remetentes: string[]
  /** O dia a fechar: a meia-noite dele. É o `corte` da janela. */
  dia: Date
  regras?: RegrasEmail
}): Boletim {
  const regras = o.regras ?? REGRAS_PADRAO
  const reguaDoDia: RegrasEmail = { ...regras, remetentes: [], so_remetente_interno: false }
  const comeco = o.dia.getTime()
  const fim = comeco + DIA_MS - 1

  const doDia = linhas.filter((e) => {
    if (!e.recebido_em) return false
    const t = new Date(e.recebido_em).getTime()
    if (!Number.isFinite(t) || t < comeco || t > fim) return false
    if (!bateRemetente(e, o.remetentes)) return false
    /* A MESMA RÉGUA DA FILA, por um motivo prático: se o boletim contasse o
       e-mail sem anexo que a fila não mostra, ele diria "faltam 3" com a fila
       vazia, e a pessoa procuraria na tela um trabalho que não está lá. */
    return avaliarEmail(e, reguaDoDia).serve
  })

  const porEmpresa = new Map<string, ItemDoBoletim>()
  for (const e of doDia) {
    const chave = chaveDaEmpresa(e)
    const { nome, firme } = empresaDoEmail(e)
    const situacao = situacaoDe(e)
    const atual = porEmpresa.get(chave)
    if (!atual) {
      porEmpresa.set(chave, {
        chave, nome, firme, assunto: limparAssunto(e.assunto), remetente: enderecoDe(e),
        situacao, pendente: situacao === 'falta', emails: [e],
        caso_id: e.caso_id ?? null, caso_numero: e.caso_numero ?? null,
      })
      continue
    }
    atual.emails.push(e)
    // O nome do cadastro vence o tirado do assunto, sempre.
    if (firme && !atual.firme) { atual.nome = nome; atual.firme = true }
    if (ORDEM.indexOf(situacao) < ORDEM.indexOf(atual.situacao)) atual.situacao = situacao
    /* PENDENTE É "SOBROU ALGO": a empresa só sai da conta de "faltam" quando
       nenhum e-mail dela está mais esperando decisão. Dar o dia por encerrado
       com um e-mail parado na fila seria a tela decidindo no lugar dele. */
    if (situacao === 'falta') atual.pendente = true
    atual.caso_id = atual.caso_id ?? e.caso_id ?? null
    atual.caso_numero = atual.caso_numero ?? e.caso_numero ?? null
  }

  const itens = [...porEmpresa.values()].sort((a, b) => {
    if (a.pendente !== b.pendente) return a.pendente ? -1 : 1
    return ORDEM.indexOf(a.situacao) - ORDEM.indexOf(b.situacao) || a.nome.localeCompare(b.nome)
  })
  const faltam = itens.filter((i) => i.pendente).length

  return {
    dia: o.dia,
    diaTexto: diaPorExtenso(o.dia),
    itens,
    empresas: itens.length,
    faltam,
    feitas: itens.length - faltam,
    analisadas: itens.filter((i) => i.situacao === 'analisada').length,
    emails: doDia.length,
    fechado: itens.length > 0 && faltam === 0,
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   A PONTE COM AS ANÁLISES QUE JÁ EXISTEM

   Pergunta dele em 17/09/2026: "tem análises que foram feitas. Consegue
   vincular? ou insere uma opção de eu informar que já foi feita?"

   As duas coisas, e a diferença entre elas fica À VISTA na tela:

     por CNPJ    o assunto traz o CNPJ ("... LIASA - 17.221.771/0001-01") e
                 existe análise vigente para ele. É casamento FIRME.
     por nome    o nome da empresa lido do assunto bate com a razão social de
                 uma análise ("DEMANDA GLOBALX" ↔ "Globalx Pharma"). É PISTA,
                 e a tela diz que é pista: quem confirma é ele, no botão.

   Nenhum dos dois marca nada sozinho. Dar um pedido por analisado porque dois
   nomes se parecem seria o sistema fechando trabalho no lugar do analista.
   ──────────────────────────────────────────────────────────────────────────── */

export interface AnaliseConhecida {
  cnpj?: string | null
  razao_social?: string | null
  nome_curto?: string | null
  data_analise?: string | null
}

/** O primeiro CNPJ que aparecer no texto, só com os dígitos. */
export function extrairCnpj(texto?: string | null): string | null {
  const m = String(texto ?? '').match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}/)
  if (!m) return null
  const so = m[0].replace(/\D/g, '')
  return so.length === 14 ? so : null
}

/* UMA PALAVRA SÓ, E A MAIS DISTINTIVA. A primeira versão casava com QUALQUER
   palavra de cinco letras do nome, e a tela de 17/09/2026 mostrou na hora o
   estrago: "MEZ Energia" apareceu como "parece já analisada: Renova Energia",
   porque as duas têm "energia". Um pedido novo marcado como repetido é pior do
   que pista nenhuma.

   Agora vale uma palavra por análise: a mais longa depois de tirar o que é
   setor ou forma jurídica. "Renova Energia" vira `renova`, "Globalx Pharma"
   vira `globalx`, "Ligas de Alumínio SA LIASA" vira `aluminio`. Se sobrar
   nada, aquela análise não entra na comparação por nome — casar por CNPJ
   continua valendo. */
const GENERICAS = new Set([
  'ltda', 'eireli', 'grupo', 'empresa', 'empresas', 'construtora', 'construcoes',
  'comercio', 'comercial', 'industria', 'industrias', 'servicos', 'participacoes',
  'holding', 'energia', 'energias', 'pharma', 'farma', 'transportes', 'logistica',
  'engenharia', 'incorporadora', 'incorporacoes', 'agropecuaria', 'alimentos',
  'distribuidora', 'seguros', 'brasil', 'nacional', 'judicial', 'recuperacao',
  'montagens', 'tecnologia', 'solucoes', 'administradora', 'investimentos',
  'imoveis', 'empreendimentos', 'consorcio', 'projetos',
])
const MINIMO_DO_NOME = 4

function palavraChaveDoNome(s: string): string | null {
  const palavras = semAcento(String(s ?? ''))
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((p) => p.length >= MINIMO_DO_NOME && !GENERICAS.has(p))
  if (!palavras.length) return null
  return palavras.sort((a, b) => b.length - a.length)[0]
}

export interface Vinculo {
  analise: AnaliseConhecida
  /** Verdadeiro só quando casou por CNPJ. No nome é pista, e a tela avisa. */
  firme: boolean
}

/** Procura, para um pedido, uma análise que já exista no CRM. */
export function acharAnalise(item: { assunto?: string | null; nome?: string | null; cnpj?: string | null }, analises: AnaliseConhecida[]): Vinculo | null {
  const cnpjDoPedido = String(item.cnpj ?? '').replace(/\D/g, '') || extrairCnpj(item.assunto)
  if (cnpjDoPedido) {
    const porCnpj = analises.find((a) => String(a.cnpj ?? '').replace(/\D/g, '') === cnpjDoPedido)
    if (porCnpj) return { analise: porCnpj, firme: true }
  }
  const alvo = ` ${semAcento(`${item.nome ?? ''} ${item.assunto ?? ''}`).replace(/[^a-z0-9]+/g, ' ')} `
  for (const a of analises) {
    for (const campo of [a.nome_curto, a.razao_social]) {
      const chave = palavraChaveDoNome(String(campo ?? ''))
      // Palavra inteira, e não pedaço: "bouw" não pode casar dentro de "bouwer".
      if (chave && alvo.includes(` ${chave} `)) return { analise: a, firme: false }
    }
  }
  return null
}

/* O QUE CHEGOU HOJE, e que por combinado NÃO entra na fila ainda. Existe para
   a tela poder dizer isso em vez de ficar calada: sem o aviso, quem viu o
   e-mail chegar no Outlook e não o achou aqui concluiria que o Carteiro falhou. */
export function chegaramDepoisDoCorte(emails: EmailDaFila[], o: {
  janela: JanelaDaFila
  remetentes: string[]
  regras?: RegrasEmail
}): EmailDaFila[] {
  const regras = o.regras ?? REGRAS_PADRAO
  const regua: RegrasEmail = { ...regras, remetentes: [], so_remetente_interno: false }
  return emails.filter((e) => {
    if (!e.recebido_em) return false
    const t = new Date(e.recebido_em).getTime()
    if (!Number.isFinite(t) || t <= o.janela.ate.getTime()) return false
    if (!pendente(e)) return false
    if (!bateRemetente(e, o.remetentes)) return false
    return avaliarEmail(e, regua).serve
  })
}
