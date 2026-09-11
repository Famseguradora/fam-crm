/* OS COMANDOS DA IA GESTOR PARA O E-MAIL · a barra `/` e a arroba `@`
   ═══════════════════════════════════════════════════════════════════════════

   Fase 3 do plano aprovado em 11/09/2026. A ideia foi dele: "os parâmetros
   podem ser atualizados dentro da própria caixa de fala com a IA, usando a
   barra / ou @, é o que mais se assemelha usando você na web ou aqui. O
   simples é melhor."

   AS TRÊS REGRAS QUE SEGURAM ISTO SIMPLES E SEGURO:

   1. COMANDO NÃO PRECISA DE IA. "/analisar ontem" e "/regra sem apetite
      @[Garantia Imobiliária]" são lidos aqui, em código, de graça e sem API.
      Só a frase livre ("/regra judicial trabalhista voltou a interessar") vai
      para a IA, e mesmo assim ela só PROPÕE operações da mesma lista abaixo.
   2. A IA PROPÕE, A PESSOA APLICA. Nenhum comando grava a régua: ele monta a
      proposta, mostra o que muda e a simulação, e o "Aplicar" chama a mesma
      rota da tela da régua (só o proprietário grava, e vira versão).
   3. QUEM CONTA É A PONTE. O /analisar narra os números de lib/email/ponte.ts,
      num texto de modelo fixo. Nenhum número sai de dentro de IA.

   Menção: `@[Nome]` com colchetes, porque nome de modalidade tem espaço
   ("Judicial Cível"). A tela insere assim quando a pessoa escolhe na lista.

   PURO: a tela e o teste chamam as mesmas funções. */

import { normalizar, type ParametrosRegua } from '@/lib/email/regua'
import { janelaDoPeriodo, type Janela, type PeriodoId, type Ponte } from '@/lib/email/ponte'

export interface InfoComando {
  nome: string
  resumo: string
  exemplo: string
}

export const COMANDOS: InfoComando[] = [
  { nome: '/analisar', resumo: 'a ponte dos e-mails de um período, em texto e tabela', exemplo: '/analisar ontem' },
  { nome: '/regras', resumo: 'a régua que vale hoje, e as últimas versões', exemplo: '/regras' },
  { nome: '/regra', resumo: 'propõe uma mudança na régua, com simulação antes de aplicar', exemplo: '/regra sem apetite @[Garantia Imobiliária]' },
  { nome: '/ajuda', resumo: 'o que cada comando faz', exemplo: '/ajuda' },
]

export type Operacao =
  | { acao: 'sem_apetite' | 'com_apetite'; modalidade: string }
  | { acao: 'sinonimo'; termo: string; modalidades: string[] }
  | { acao: 'tirar_sinonimo'; termo: string }
  | { acao: 'termo_operacao' | 'termo_credito' | 'nao_e_pedido'; termo: string }
  | { acao: 'remetente'; endereco: string }
  | { acao: 'tirar_termo'; termo: string }

export type Comando =
  | { tipo: 'ajuda' }
  | { tipo: 'analisar'; periodo: PeriodoId; dia?: string; janela: Janela }
  | { tipo: 'regras' }
  | { tipo: 'regra'; operacoes: Operacao[] }
  | { tipo: 'regra_livre'; texto: string }
  | { tipo: 'erro'; mensagem: string }

/* ══════════════════════════════════════════════════════════════════════════
   LER
   ══════════════════════════════════════════════════════════════════════════ */

/** As menções `@[Nome]` de um texto, na ordem. */
export function mencoesDe(texto: string): string[] {
  return [...String(texto ?? '').matchAll(/@\[([^\]]{1,120})\]/g)].map((m) => m[1].trim()).filter(Boolean)
}

/** Os termos entre aspas duplas ("retas" ou “curvas”). O apóstrofo NÃO é aspa:
 *  "Relatório D'Ávila" virava "Relatório D" (achado da revisão de 11/09). */
const ASPAS = /"([^"]{1,80})"|“([^”]{1,80})”/g
function aspasDe(texto: string): string[] {
  return [...String(texto ?? '').matchAll(ASPAS)].map((m) => (m[1] ?? m[2] ?? '').trim()).filter(Boolean)
}

/** Endereço inteiro ou @domínio escrito solto (e não a menção com colchete). */
function enderecosDe(texto: string): string[] {
  const semMencao = String(texto ?? '').replace(/@\[[^\]]*\]/g, ' ')
  return [...semMencao.matchAll(/(?:^|\s)([\w.+-]*@[\w-]+(?:\.[\w-]+)+)/g)].map((m) => m[1].toLowerCase())
}

const EXEMPLOS_REGRA = [
  '/regra sem apetite @[Garantia Imobiliária]',
  '/regra com apetite @[Judicial Cível]',
  '/regra sinônimo "performance bond" @[Executante - Construtor]',
  '/regra operação "cotação"   ·   /regra crédito "limite"',
  '/regra não é pedido "relatório semanal"',
  '/regra remetente @newsletter.com.br',
  '/regra tirar "rating"',
]

export const TEXTO_AJUDA = [
  'Comandos que funcionam sem a API, de graça:',
  ...COMANDOS.map((c) => `${c.nome}: ${c.resumo}. Ex.: ${c.exemplo}`),
  '',
  'Para mudar a régua, a frase curta vira proposta na hora:',
  ...EXEMPLOS_REGRA.map((e) => `· ${e}`),
  '',
  'Frase livre depois de /regra ("/regra judicial trabalhista voltou a interessar") vai para a IA, que propõe as mesmas operações. Nada é gravado sem o seu "Aplicar".',
  'Digite @ para citar uma modalidade, corretora ou tomador.',
].join('\n')

function lerPeriodo(arg: string, agora: Date): { periodo: PeriodoId; dia?: string } | null {
  const a = normalizar(arg)
  if (!a || a === 'ontem') return { periodo: 'ontem' }
  if (a === 'hoje') return { periodo: 'hoje' }
  if (a === 'tudo' || a === 'todos' || a === 'sempre') return { periodo: 'tudo' }
  if (/^7( dias)?$/.test(a) || a === 'semana') return { periodo: '7' }
  if (/^30( dias)?$/.test(a) || a === 'mes') return { periodo: '30' }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(arg.trim())
  if (iso) return { periodo: 'dia', dia: arg.trim() }
  const br = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(arg.trim())
  if (br) {
    const anoSP = new Date(agora.getTime() - 3 * 3_600_000).getUTCFullYear()
    const ano = br[3] ? (br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3])) : anoSP
    return { periodo: 'dia', dia: `${ano}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}` }
  }
  return null
}

/**
 * Lê o que a pessoa digitou. `null` quando não é comando (não começa com `/`):
 * aí é pergunta para a IA, como sempre foi.
 */
export function lerComando(entrada: string, agora: Date): Comando | null {
  const texto = String(entrada ?? '').trim()
  if (!texto.startsWith('/')) return null
  const [cabeca, ...resto] = texto.split(/\s+/)
  const nome = normalizar(cabeca.slice(1))
  const argumento = texto.slice(cabeca.length).trim()

  if (nome === 'ajuda' || nome === '') return { tipo: 'ajuda' }
  if (nome === 'regras' || nome === 'regua') return { tipo: 'regras' }

  if (nome === 'analisar' || nome === 'analise') {
    const p = lerPeriodo(argumento, agora)
    if (!p) return { tipo: 'erro', mensagem: `Não entendi o período "${argumento}". Use hoje, ontem, 7, 30, tudo ou uma data (10/09).` }
    return { tipo: 'analisar', ...p, janela: janelaDoPeriodo(p.periodo, agora, p.dia) }
  }

  if (nome !== 'regra') {
    return { tipo: 'erro', mensagem: `Não conheço o comando ${cabeca}. Os que existem: ${COMANDOS.map((c) => c.nome).join(', ')}.` }
  }
  if (!resto.length) return { tipo: 'erro', mensagem: `Diga o que muda. Exemplos:\n${EXEMPLOS_REGRA.join('\n')}` }

  const mods = mencoesDe(argumento)
  const termos = aspasDe(argumento)
  // O verbo, sem menção, sem aspas e sem acento: "sem apetite", "sinonimo", "nao e pedido".
  const verbo = normalizar(argumento.replace(/@\[[^\]]*\]/g, ' ').replace(ASPAS, ' '))
  /* O exemplo certo para o que faltou: "/regra dar apetite" sem menção não pode
     sugerir o exemplo de TIRAR apetite (achado da revisão). */
  const exemploDe = (): string => {
    if (/^(com apetite|dar apetite|voltar( o)? apetite|com interesse)\b/.test(verbo)) return EXEMPLOS_REGRA[1]
    if (/sinonimo/.test(verbo)) return EXEMPLOS_REGRA[2]
    if (/operacao|credito/.test(verbo)) return EXEMPLOS_REGRA[3]
    if (/pedido/.test(verbo)) return EXEMPLOS_REGRA[4]
    if (/remetente/.test(verbo)) return EXEMPLOS_REGRA[5]
    if (/tirar|remover|apagar/.test(verbo)) return EXEMPLOS_REGRA[6]
    return EXEMPLOS_REGRA[0]
  }
  const falta = (o: string) => ({ tipo: 'erro' as const, mensagem: `Falta ${o}. Ex.: ${exemploDe()}` })

  if (/^(sem apetite|tirar( o)? apetite|sem interesse)\b/.test(verbo)) {
    return mods.length ? { tipo: 'regra', operacoes: mods.map((m) => ({ acao: 'sem_apetite', modalidade: m })) } : falta('a modalidade (digite @)')
  }
  if (/^(com apetite|dar apetite|voltar( o)? apetite|com interesse)\b/.test(verbo)) {
    return mods.length ? { tipo: 'regra', operacoes: mods.map((m) => ({ acao: 'com_apetite', modalidade: m })) } : falta('a modalidade (digite @)')
  }
  if (/^(tirar|remover|apagar) (o )?sinonimo\b/.test(verbo)) {
    return termos.length ? { tipo: 'regra', operacoes: termos.map((t) => ({ acao: 'tirar_sinonimo', termo: t })) } : falta('o termo entre aspas')
  }
  if (/^sinonimo\b/.test(verbo)) {
    if (!termos.length) return falta('o termo entre aspas')
    if (!mods.length) return falta('a modalidade (digite @)')
    return { tipo: 'regra', operacoes: termos.map((t) => ({ acao: 'sinonimo', termo: t, modalidades: mods })) }
  }
  if (/^(sinal de )?operacao\b/.test(verbo)) {
    return termos.length ? { tipo: 'regra', operacoes: termos.map((t) => ({ acao: 'termo_operacao', termo: t })) } : falta('o termo entre aspas')
  }
  if (/^(sinal de )?(so )?credito\b/.test(verbo)) {
    return termos.length ? { tipo: 'regra', operacoes: termos.map((t) => ({ acao: 'termo_credito', termo: t })) } : falta('o termo entre aspas')
  }
  if (/^remetente\b/.test(verbo)) {
    const ends = enderecosDe(argumento)
    return ends.length ? { tipo: 'regra', operacoes: ends.map((e) => ({ acao: 'remetente', endereco: e })) } : falta('o endereço ou @domínio')
  }
  if (/^nao (e )?pedido\b/.test(verbo)) {
    const ends = enderecosDe(argumento)
    if (!termos.length && !ends.length) return falta('o assunto entre aspas, ou o remetente')
    return {
      tipo: 'regra',
      operacoes: [
        ...termos.map((t) => ({ acao: 'nao_e_pedido' as const, termo: t })),
        ...ends.map((e) => ({ acao: 'remetente' as const, endereco: e })),
      ],
    }
  }
  if (/^(tirar|remover|apagar)\b/.test(verbo) && termos.length) {
    return { tipo: 'regra', operacoes: termos.map((t) => ({ acao: 'tirar_termo', termo: t })) }
  }

  // Nenhuma forma curta bateu: é frase livre, e quem lê frase livre é a IA.
  return { tipo: 'regra_livre', texto: argumento }
}

/* ══════════════════════════════════════════════════════════════════════════
   APLICAR AS OPERAÇÕES NUMA RÉGUA (sem gravar nada)
   ══════════════════════════════════════════════════════════════════════════ */

const semRepetir = (xs: string[]) => {
  const vistos = new Set<string>()
  return xs.filter((x) => {
    const k = normalizar(x)
    if (!k || vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}

export function aplicarOperacoes(base: ParametrosRegua, operacoes: Operacao[]): ParametrosRegua {
  const p: ParametrosRegua = structuredClone(base)
  const igual = (a: string, b: string) => normalizar(a) === normalizar(b)
  for (const o of operacoes) {
    switch (o.acao) {
      case 'sem_apetite': p.excluidas = semRepetir([...p.excluidas, o.modalidade]); break
      case 'com_apetite': p.excluidas = p.excluidas.filter((m) => !igual(m, o.modalidade)); break
      case 'sinonimo':
        p.sinonimos = [...p.sinonimos.filter((s) => !igual(s.termo, o.termo)), { termo: o.termo, modalidades: [...new Set(o.modalidades)] }]
        break
      case 'tirar_sinonimo': p.sinonimos = p.sinonimos.filter((s) => !igual(s.termo, o.termo)); break
      case 'termo_operacao': p.termos_operacao = semRepetir([...p.termos_operacao, o.termo]); break
      case 'termo_credito': p.termos_so_credito = semRepetir([...p.termos_so_credito, o.termo]); break
      case 'nao_e_pedido': p.nao_demanda_assunto = semRepetir([...p.nao_demanda_assunto, o.termo]); break
      case 'remetente': p.nao_demanda_remetentes = [...new Set([...p.nao_demanda_remetentes, o.endereco.toLowerCase()])]; break
      case 'tirar_termo':
        p.termos_operacao = p.termos_operacao.filter((t) => !igual(t, o.termo))
        p.termos_so_credito = p.termos_so_credito.filter((t) => !igual(t, o.termo))
        p.nao_demanda_assunto = p.nao_demanda_assunto.filter((t) => !igual(t, o.termo))
        p.nao_demanda_remetentes = p.nao_demanda_remetentes.filter((t) => t !== o.termo.toLowerCase())
        p.sinonimos = p.sinonimos.filter((s) => !igual(s.termo, o.termo))
        break
    }
  }
  return p
}

/** A operação em português, para a proposta dizer o que entendeu. */
export function descreverOperacao(o: Operacao): string {
  switch (o.acao) {
    case 'sem_apetite': return `tirar o apetite de ${o.modalidade}`
    case 'com_apetite': return `voltar a ter apetite por ${o.modalidade}`
    case 'sinonimo': return `“${o.termo}” passa a apontar ${o.modalidades.join(', ')}`
    case 'tirar_sinonimo': return `“${o.termo}” deixa de apontar modalidade`
    case 'termo_operacao': return `“${o.termo}” vira sinal de operação`
    case 'termo_credito': return `“${o.termo}” vira sinal de pedido só de crédito`
    case 'nao_e_pedido': return `assunto com “${o.termo}” deixa de ser pedido`
    case 'remetente': return `e-mail de ${o.endereco} deixa de ser pedido`
    case 'tirar_termo': return `“${o.termo}” sai da régua`
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   NARRAR A PONTE, em modelo fixo (sem IA)
   ══════════════════════════════════════════════════════════════════════════ */

const n = (x: number, um: string, varios: string) => `${x} ${x === 1 ? um : varios}`

/**
 * O texto do /analisar, na mesma ordem do exemplo dele de 11/09: quantos
 * chegaram, quantos eram pedido, quantos saíram por apetite, quantos já foram
 * trazidos, e a conclusão. Todo número vem da ponte.
 */
export function narrarPonte(p: Ponte): string {
  const b = p.baldes
  if (!p.recebidos) return `Nenhum e-mail chegou ${p.janela.frase}.`
  const um = (x: number, singular: string, plural: string) => (x === 1 ? singular : plural)
  const pedidos = b.fora_apetite + b.sem_classificacao + b.resolvido + b.a_fazer
  const partes: string[] = []
  partes.push(`${p.janela.frase.charAt(0).toUpperCase()}${p.janela.frase.slice(1)} ${um(p.recebidos, 'chegou', 'chegaram')} ${n(p.recebidos, 'e-mail', 'e-mails')}.`)
  const fora: string[] = []
  if (b.nao_demanda) fora.push(`${b.nao_demanda} não ${um(b.nao_demanda, 'era pedido', 'eram pedido')}`)
  if (b.continuacao) fora.push(`${b.continuacao} ${um(b.continuacao, 'era resposta ou encaminhamento', 'eram respostas ou encaminhamentos')} de pedido que já tinha chegado`)
  if (fora.length) partes.push(`Desses, ${fora.join(' e ')}.`)
  partes.push(`${um(pedidos, 'Ficou', 'Ficaram')} ${n(pedidos, 'pedido novo', 'pedidos novos')}.`)
  if (b.fora_apetite) partes.push(`${b.fora_apetite} ${um(b.fora_apetite, 'está', 'estão')} fora do apetite da régua.`)
  if (b.sem_classificacao) {
    partes.push(`${b.sem_classificacao} a régua não soube classificar: ${um(b.sem_classificacao, 'precisa', 'precisam')} de você.`)
  }
  partes.push(`${um(p.elegiveis.total, 'É', 'São')} ${n(p.elegiveis.total, 'elegível', 'elegíveis')} (${p.elegiveis.operacao} com operação e ${p.elegiveis.credito} só de crédito).`)
  if (b.resolvido) partes.push(`Desses, você já resolveu ${b.resolvido}${p.excecoes ? `, ${p.excecoes} por exceção` : ''}.`)
  /* A conclusão não pode dizer "nada a fazer" quando há pedido esperando a sua
     classificação: é trabalho também, só que antes da análise. */
  const conclusao = b.a_fazer
    ? `Conclusão: ${n(b.a_fazer, 'análise de crédito a fazer', 'análises de crédito a fazer')}${p.parados_a_fazer ? `, ${p.parados_a_fazer} já passando do prazo` : ''}` +
      (b.sem_classificacao ? `, e ${b.sem_classificacao} ${um(b.sem_classificacao, 'pedido esperando', 'pedidos esperando')} a sua classificação.` : '.')
    : b.sem_classificacao
      ? `Conclusão: nenhuma análise confirmada, e ${b.sem_classificacao} ${um(b.sem_classificacao, 'pedido esperando', 'pedidos esperando')} a sua classificação.`
      : 'Conclusão: nada a fazer neste período.'
  partes.push(conclusao)
  return partes.join(' ')
}

/** A mesma ponte em tabela, para a IA Gestor desenhar com o componente de sempre. */
export function tabelaDaPonte(p: Ponte): { colunas: string[]; linhas: (string | number)[][] } {
  const b = p.baldes
  return {
    colunas: ['Degrau', 'Quantidade'],
    linhas: [
      ['Recebidos (e-mails)', p.recebidos],
      ['− Não é pedido', b.nao_demanda],
      ['− Continuação do mesmo pedido', b.continuacao],
      ['− Fora do apetite', b.fora_apetite],
      ['− Sem classificação', b.sem_classificacao],
      ['= Elegíveis', p.elegiveis.total],
      ['− Já resolvidos', b.resolvido],
      ['= A fazer', b.a_fazer],
    ],
  }
}
