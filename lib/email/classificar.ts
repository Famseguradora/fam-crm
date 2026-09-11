/* O CARTEIRO GERENCIAL · o que cada e-mail é, e por quê
   ═══════════════════════════════════════════════════════════════════════════

   Pedido do Marco em 11/09/2026: "eu peço uma análise ao Agente de IA carteiro
   sobre os e-mails recebidos na data de 10/09, então ele me informa: você
   recebeu 50 e-mails, dos quais 35 são demandas de corretoras, sendo 25
   demanda de tomador + operação e 10 somente demanda de análise de crédito...
   10 são de Judiciais, a qual a FAM não tem interesse no momento".

   Este arquivo responde, para UM e-mail: é pedido? de operação ou só de
   crédito? de qual modalidade? a FAM tem apetite? E guarda o PORQUÊ de cada
   resposta como passos, que viram o recibo da decisão na tela.

   A ORDEM DE QUEM MANDA, da mais forte para a mais fraca:

     1. o que já aconteceu     virou caso, ou foi analisado por fora
     2. a pessoa               "não é pedido", "só crédito", "operação de X"
     3. a IA                   (fase 2) grava com recibo e confiança
     4. a régua                o que se lê no assunto, no começo do e-mail e
                               no nome dos anexos, com a versão que valia
                               quando o e-mail chegou

   A IA NUNCA CONTA. Ela classifica um e-mail por vez; quem soma a ponte é
   `lib/email/ponte.ts`, em código. É a regra da casa desde a IA Gestor.

   PURO, sem banco: a tela, a simulação da régua e o teste chamam a mesma
   função. */

import { acharTermo, normalizar, type ParametrosRegua, type VersaoRegua } from '@/lib/email/regua'
import { cnpjDoAssunto, nomeDoTomador, valorDoAssunto } from '@/lib/casos/pistas'
import type { PedidoLido } from '@/lib/email/metricas'

export type TipoDemanda = 'operacao' | 'so_credito'
export type Confianca = 'seguro' | 'revisar' | 'incerto'
export type Apetite = 'dentro' | 'fora' | null
export type FontePasso = 'caixa' | 'assunto' | 'previa' | 'anexo' | 'remetente' | 'humano' | 'ia' | 'regua' | 'sistema'

/** Um passo do recibo. `trecho` é o pedaço exato do e-mail que sustenta o passo. */
export interface Passo {
  texto: string
  fonte: FontePasso
  trecho?: string
}

/** O e-mail com o que a view `painel_pedidos` traz a mais para classificar. */
export type PedidoComTexto = PedidoLido & {
  previa?: string | null
  anexos?: { nome?: string | null }[] | null
}

/** Uma linha de `email_classificacao`. */
export interface ClassificacaoGravada {
  email_id: string
  origem: 'humano' | 'ia'
  /** `sem_apetite` é a decisão individual: produto que a FAM não opera.
   *  `indefinido` é só da IA: ela leu e não soube dizer. */
  tipo: 'operacao' | 'so_credito' | 'nao_demanda' | 'sem_apetite' | 'indefinido' | null
  modalidade: string | null
  cnpj: string | null
  tomador: string | null
  confianca: Confianca | null
  motivo: string | null
  recibo: Passo[] | null
  regua_versao: number | null
  classificado_por: string | null
  classificado_em: string
}

export interface ClassificacaoEmail {
  demanda: boolean
  tipo: TipoDemanda | null
  /** Candidatas. Mais de uma quando o e-mail cita duas, ou quando veio de família. */
  modalidades: string[]
  apetite: Apetite
  confianca: Confianca
  /** Quem decidiu o que prevaleceu. */
  origem: 'caixa' | 'regua' | 'humano' | 'ia' | 'sistema'
  regua_versao: number | null
  cnpj: string | null
  valor: string | null
  tomador: string | null
  passos: Passo[]
}

const LIMITE_TRECHO = 90

/* ══════════════════════════════════════════════════════════════════════════
   ACHAR A MODALIDADE NUM TEXTO

   Quem casa primeiro é o termo MAIS LONGO, e o mais curto que está dentro dele
   não conta de novo: "Garantia de Pagamento de Energia" não pode virar também
   "Garantia de Pagamento", nem "judicial cível" virar também a família
   "judicial".
   ══════════════════════════════════════════════════════════════════════════ */

interface Acerto {
  termo: string
  modalidades: string[]
  familia: boolean
  inicio: number
  fim: number
}

/* EXPRESSÕES QUE PARECEM MODALIDADE E NÃO SÃO. "Em recuperação judicial" fala
   da saúde da empresa, e não de garantia judicial; "passivo trabalhista" fala
   do balanço. Achado da revisão de 11/09: as duas tiravam pedido bom da conta.
   Não é parâmetro da régua de propósito: é português, e não política. */
const NAO_E_MODALIDADE = [
  'recuperação judicial', 'recuperação extrajudicial', 'processo de recuperação judicial',
  'passivo trabalhista', 'passivos trabalhistas', 'contingência trabalhista', 'contingências trabalhistas',
]

function semFalsosAmigos(alvo: string): string {
  let s = ` ${alvo} `
  for (const f of NAO_E_MODALIDADE) {
    const n = ` ${normalizar(f)} `
    // Mesmo tamanho, sem letra: a posição dos outros termos não muda.
    while (s.includes(n)) s = s.replace(n, ` ${'_'.repeat(n.length - 2)} `)
  }
  return s.slice(1, -1)
}

export function acharModalidades(
  texto: string,
  modalidades: readonly string[],
  sinonimos: ParametrosRegua['sinonimos'],
): Acerto[] {
  const alvo = semFalsosAmigos(normalizar(texto))
  if (!alvo.replace(/[_\s]/g, '')) return []

  const candidatos = [
    ...[...new Set(modalidades)].map((m) => ({ termo: m, modalidades: [m], familia: false })),
    ...sinonimos.map((s) => ({ termo: s.termo, modalidades: s.modalidades, familia: s.modalidades.length > 1 })),
  ]

  /* TODAS as ocorrências, e não só a primeira: "Garantia de Pagamento de
     Energia e Garantia de Pagamento" cita duas modalidades, e ler só a
     primeira escondia a segunda. */
  const achados: Acerto[] = []
  const comBordas = ` ${alvo} `
  for (const c of candidatos) {
    const t = normalizar(c.termo)
    if (!t) continue
    for (let de = 0; ;) {
      const i = comBordas.indexOf(` ${t} `, de)
      if (i < 0) break
      achados.push({ ...c, inicio: i, fim: i + t.length })
      de = i + 1
    }
  }

  achados.sort((a, b) => (b.fim - b.inicio) - (a.fim - a.inicio))
  const aceitos: Acerto[] = []
  for (const a of achados) {
    if (aceitos.some((x) => a.inicio < x.fim && x.inicio < a.fim)) continue
    aceitos.push(a)
  }
  return aceitos.sort((a, b) => a.inicio - b.inicio)
}

/**
 * O apetite de um conjunto de acertos. Só decide quando todos concordam.
 * Família mista ("judicial" com uma judicial liberada e três não) e e-mail que
 * cita uma modalidade com apetite E outra sem não decidem nada: viram
 * pergunta, e não palpite. Foi medido: "Seguro Garantia Judicial - Uriel
 * Gaspar 1 Empreendimento Imobiliário" citava as duas, e a primeira versão
 * desta regra deixou passar como trabalho a fazer.
 */
export function apetiteDe(acertos: { modalidades: string[] }[], excluidas: readonly string[]): Apetite {
  if (!acertos.length) return null
  const fora = new Set(excluidas)
  let algumFora = false
  let algumDentro = false
  for (const a of acertos) {
    const n = a.modalidades.filter((m) => fora.has(m)).length
    if (n === 0) algumDentro = true
    else if (n === a.modalidades.length) algumFora = true
    else return null
  }
  if (algumFora && algumDentro) return null
  return algumFora ? 'fora' : 'dentro'
}

const cortar = (s: string) => (s.length > LIMITE_TRECHO ? s.slice(0, LIMITE_TRECHO - 1) + '…' : s)

/** O pedaço do texto original em volta de onde o termo apareceu. */
function trechoEmVolta(original: string, termo: string): string {
  /* Sem acento, mas com o MESMO tamanho do original: o NFC recompõe a letra,
     e cada letra acentuada volta a ser um caractere só. É o que deixa usar a
     posição achada aqui para cortar o texto original. */
  const semAcento = (x: string) =>
    Array.from(x.normalize('NFC'), (ch) => ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0) || ch)
      .join('')
      .toLowerCase()
  original = original.normalize('NFC')
  const o = semAcento(original)
  const t = semAcento(termo)
  const i = o.indexOf(t)
  if (i < 0) return cortar(original.trim())
  const de = Math.max(0, i - 30)
  const ate = Math.min(original.length, i + t.length + 30)
  return (de > 0 ? '…' : '') + original.slice(de, ate).trim() + (ate < original.length ? '…' : '')
}

const listaDeNomes = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ou ${xs[xs.length - 1]}`

/** Termo curto ("IS", "LMG") só vale no assunto: no corpo, "is" é inglês de rodapé. */
const termoCurto = (t: string) => normalizar(t).length <= 3

function achouTermoEm(texto: string, termos: readonly string[], soLongos: boolean): string | null {
  const alvo = normalizar(texto)
  if (!alvo) return null
  for (const t of termos) {
    if (soLongos && termoCurto(t)) continue
    if (acharTermo(alvo, t) >= 0) return t
  }
  return null
}

const ETAPA_NOME: Record<string, string> = {
  comercial: 'no Comercial', triagem: 'na Triagem', analise: 'na Análise',
  encerrado: 'encerrado', descartado: 'descartado na triagem',
}

/* ══════════════════════════════════════════════════════════════════════════
   CLASSIFICAR UM E-MAIL
   ══════════════════════════════════════════════════════════════════════════ */
export function classificarEmail(
  p: PedidoComTexto,
  regua: VersaoRegua | null,
  modalidades: readonly string[],
  gravadas: readonly ClassificacaoGravada[] = [],
): ClassificacaoEmail {
  const passos: Passo[] = []
  const par: ParametrosRegua | null = regua?.parametros ?? null
  const versao = regua?.versao ?? null
  const assunto = String(p.assunto ?? '')
  const previa = String(p.previa ?? '')
  /* Anexo .msg ou .eml é OUTRO e-mail encaminhado dentro deste, e o nome dele
     fala do outro pedido. Medido: "MATRIZ DE ALÇADA" trazia "RE PERMUTA
     FISICA ... .msg" e a primeira versão leu como Garantia Imobiliária. */
  const nomesAnexos = (p.anexos ?? [])
    .map((a) => String(a?.nome ?? ''))
    .filter((n) => n && !/\.(msg|eml)$/i.test(n))

  const humano = gravadas.find((g) => g.email_id === p.id && g.origem === 'humano') ?? null
  const ia = gravadas.find((g) => g.email_id === p.id && g.origem === 'ia') ?? null

  const resolvido = p.estado_trabalho === 'trazido' || p.estado_trabalho === 'ja_analisado'
  const cnpjAchado = cnpjDoAssunto(assunto) ?? cnpjDoAssunto(previa)
  /* SEMPRE SÓ OS 14 DÍGITOS. `casos.cnpj` guarda com máscara e o CNPJ lido do
     assunto vem sem: comparados assim, o mesmo pedido virava dois (achado
     crítico da revisão de 11/09). */
  const catorze = (x: string | null | undefined) => {
    const d = String(x ?? '').replace(/\D/g, '')
    return d.length === 14 ? d : null
  }
  const base = {
    regua_versao: versao,
    // O caso (que já passou por gente) vence a IA.
    cnpj: catorze(humano?.cnpj) ?? catorze(p.cnpj) ?? catorze(ia?.cnpj) ?? catorze(cnpjAchado?.valor),
    valor: valorDoAssunto(assunto)?.valor ?? null,
    tomador: humano?.tomador || p.razao_social || ia?.tomador || nomeDoTomador(assunto)?.valor || null,
  }

  const naoDemanda = (origem: ClassificacaoEmail['origem']): ClassificacaoEmail => ({
    ...base, demanda: false, tipo: null, modalidades: [], apetite: null, confianca: 'seguro', origem, passos,
  })

  // ── 1. o que já aconteceu ────────────────────────────────────────────────
  if (p.estado_trabalho === 'trazido') {
    const onde = p.caso_etapa ? ETAPA_NOME[p.caso_etapa] ?? p.caso_etapa : ''
    passos.push({
      fonte: 'sistema',
      texto: `Já virou ${p.caso_numero ? `o caso #${p.caso_numero}` : 'caso'}${onde ? `, ${onde}` : ''}.`,
    })
  } else if (p.estado_trabalho === 'ja_analisado') {
    passos.push({ fonte: 'humano', texto: `Marcado como já analisado por fora${p.analisado_fora_por ? ` por ${p.analisado_fora_por}` : ''}.` })
  }

  // ── 2. não é pedido ─────────────────────────────────────────────────────
  if (!resolvido) {
    if (humano?.tipo === 'nao_demanda' || p.eh_pedido === false) {
      passos.push({
        fonte: 'humano',
        texto: `${humano?.classificado_por ?? 'Alguém'} disse que não é pedido${humano?.motivo ? `: ${humano.motivo}` : '.'}`,
      })
      return naoDemanda('humano')
    }
    if (p.estado === 'tratado') {
      passos.push({ fonte: 'humano', texto: 'Tirado da frente na caixa ("marcar como tratado"), sem virar caso.' })
      return naoDemanda('humano')
    }
    if (p.eh_pedido !== true && !p.serve && !humano) {
      passos.push({ fonte: 'caixa', texto: `A régua da caixa não deixou passar${p.motivo ? `: ${p.motivo.toLowerCase()}` : '.'}` })
      return naoDemanda('caixa')
    }
    if (par && !humano && p.eh_pedido !== true) {
      const termoAssunto = achouTermoEm(assunto, par.nao_demanda_assunto, false)
      if (termoAssunto) {
        passos.push({
          fonte: 'regua',
          texto: `Régua v${versao}: assunto com “${termoAssunto}” não é pedido.`,
          trecho: trechoEmVolta(assunto, termoAssunto),
        })
        return naoDemanda('regua')
      }
      const de = String(p.email_de ?? '').toLowerCase()
      const remetente = par.nao_demanda_remetentes.find((r) => {
        const x = r.trim().toLowerCase()
        return !!x && !!de && (x.startsWith('@') ? de.endsWith(x) : de === x)
      })
      if (remetente) {
        passos.push({ fonte: 'regua', texto: `Régua v${versao}: ${remetente} nunca manda pedido.`, trecho: de })
        return naoDemanda('regua')
      }
    }
    if (p.serve) passos.push({ fonte: 'caixa', texto: `Passou na régua da caixa${p.motivo ? `: ${p.motivo.toLowerCase()}` : '.'}` })
    else if (p.eh_pedido === true) passos.push({ fonte: 'humano', texto: `${p.classificado_por ?? 'Alguém'} disse que é pedido.` })
  }

  const excluidas = par?.excluidas ?? []

  // ── 3. a pessoa decidiu o tipo ───────────────────────────────────────────
  if (humano && humano.tipo && humano.tipo !== 'nao_demanda') {
    const quem = humano.classificado_por ?? 'Alguém'
    if (humano.tipo === 'sem_apetite') {
      passos.push({ fonte: 'humano', texto: `${quem} decidiu: fora do apetite${humano.motivo ? `, ${humano.motivo}` : '.'}` })
      return { ...base, demanda: true, tipo: 'operacao', modalidades: humano.modalidade ? [humano.modalidade] : [], apetite: 'fora', confianca: 'seguro', origem: 'humano', passos }
    }
    if (humano.tipo === 'so_credito') {
      passos.push({ fonte: 'humano', texto: `${quem} decidiu: pedido só de análise de crédito.` })
      return { ...base, demanda: true, tipo: 'so_credito', modalidades: [], apetite: 'dentro', confianca: 'seguro', origem: 'humano', passos }
    }
    const mods = humano.modalidade ? [humano.modalidade] : []
    /* Operação sem modalidade dita pela pessoa é a EXCEÇÃO INDIVIDUAL: "é
       trabalho, mesmo fora do que a régua sabe ler". Com modalidade, o apetite
       continua sendo o da régua, e a tela mostra se ela bateu de frente. */
    const apetite: Apetite = mods.length ? apetiteDe([{ modalidades: mods }], excluidas) : 'dentro'
    passos.push({
      fonte: 'humano',
      texto: `${quem} decidiu: operação${mods.length ? ` de ${mods[0]}` : ', dentro do apetite'}.`,
    })
    if (mods.length && apetite === 'fora') passos.push({ fonte: 'regua', texto: `Régua v${versao}: ${mods[0]} está sem apetite.` })
    return { ...base, demanda: true, tipo: 'operacao', modalidades: mods, apetite, confianca: 'seguro', origem: 'humano', passos }
  }

  // ── 4. a IA decidiu (fase 2) ─────────────────────────────────────────────
  if (ia && ia.tipo) {
    if (ia.recibo?.length) passos.push(...ia.recibo)
    /* A IA "incerta" ou "sem saber" não decide: o recibo mostra que ela leu, e
       a régua continua valendo. É a mesma regra do incerto da régua. */
    const iaDecide = ia.tipo !== 'indefinido' && ia.confianca !== 'incerto'
    if (!iaDecide) {
      passos.push({
        fonte: 'ia',
        texto: ia.tipo === 'indefinido' ? 'A IA leu e também não soube dizer. A régua segue valendo.' : 'A IA não teve certeza, e por isso não decide. A régua segue valendo.',
      })
    } else if (ia.tipo === 'nao_demanda') {
      if (!resolvido) return { ...naoDemanda('ia'), confianca: ia.confianca ?? 'revisar' }
    } else {
      const tipo: TipoDemanda = ia.tipo === 'so_credito' ? 'so_credito' : 'operacao'
      const mods = ia.modalidade ? [ia.modalidade] : []
      const apetite: Apetite = ia.tipo === 'sem_apetite'
        ? 'fora'
        : tipo === 'so_credito' ? 'dentro' : apetiteDe(mods.map((m) => ({ modalidades: [m] })), excluidas)
      if (mods.length && apetite === 'fora' && ia.tipo !== 'sem_apetite') {
        passos.push({ fonte: 'regua', texto: `Régua v${versao}: ${mods[0]} está sem apetite. A operação morre; o tomador fica vivo.` })
      }
      return { ...base, demanda: true, tipo, modalidades: mods, apetite, confianca: ia.confianca ?? 'revisar', origem: 'ia', passos }
    }
  }

  // ── 5. a régua lê o e-mail ───────────────────────────────────────────────
  if (!par) {
    passos.push({ fonte: 'sistema', texto: 'Sem régua cadastrada: o tipo do pedido fica sem classificação.' })
    return { ...base, demanda: true, tipo: null, modalidades: [], apetite: null, confianca: 'incerto', origem: 'sistema', passos }
  }

  const fontes: { fonte: FontePasso; nome: string; texto: string }[] = [
    { fonte: 'assunto', nome: 'No assunto', texto: assunto },
    { fonte: 'previa', nome: 'No começo do e-mail', texto: previa },
    ...nomesAnexos.map((n) => ({ fonte: 'anexo' as const, nome: `No anexo ${n}`, texto: n })),
  ]

  let acertos: Acerto[] = []
  let fonteMod: (typeof fontes)[number] | null = null
  for (const f of fontes) {
    const a = acharModalidades(f.texto, modalidades, par.sinonimos)
    if (a.length) { acertos = a; fonteMod = f; break }
  }

  /* O SINAL DO ASSUNTO VENCE O DO CORPO, de qualquer tipo. "Cadastro
     Construtora Horizonte" com "futura emissão de apólices" no corpo é pedido
     de cadastro: o assunto é o que a pessoa escreveu para dizer o que quer. */
  const [doAssunto, doCorpo] = fontes
  // "Pagamento 15MM", "IS 6 mi": valor sem o R$, que é como a corretora escreve.
  const valorSemReal = /\b\d+(?:[.,]\d+)?\s?(?:mm|mi|milh(?:õ|o)es)\b/i.exec(assunto)
  const opAssunto = achouTermoEm(assunto, par.termos_operacao, false) ?? base.valor ?? valorSemReal?.[0] ?? null
  const credAssunto = achouTermoEm(assunto, par.termos_so_credito, false)
  const opCorpo = achouTermoEm(previa, par.termos_operacao, true)
  const credCorpo = achouTermoEm(previa, par.termos_so_credito, true)

  const sinalOperacao: { termo: string; fonte: (typeof fontes)[number] } | null =
    opAssunto ? { termo: opAssunto, fonte: doAssunto }
      : !credAssunto && opCorpo ? { termo: opCorpo, fonte: doCorpo } : null
  const sinalCredito: { termo: string; fonte: (typeof fontes)[number] } | null =
    credAssunto ? { termo: credAssunto, fonte: doAssunto }
      : !opAssunto && credCorpo ? { termo: credCorpo, fonte: doCorpo } : null

  /* O ASSUNTO FALA DE PEDIDO? Modalidade achada só no corpo ou no anexo, com
     um assunto que não fala de pedido nenhum, é menção solta (um rodapé, um
     histórico colado) e não decide nada sozinha. */
  const assuntoFalaDePedido =
    fonteMod?.fonte === 'assunto' || sinalOperacao?.fonte.fonte === 'assunto' || sinalCredito?.fonte.fonte === 'assunto'

  if (acertos.length && fonteMod) {
    for (const a of acertos) {
      passos.push({
        fonte: fonteMod.fonte,
        texto: a.familia
          ? `${fonteMod.nome}: “${a.termo}” aponta a família ${listaDeNomes(a.modalidades)}.`
          : `${fonteMod.nome}: “${a.termo}”${normalizar(a.termo) === normalizar(a.modalidades[0]) ? '' : ` é ${a.modalidades[0]}`}.`,
        trecho: trechoEmVolta(fonteMod.texto, a.termo),
      })
    }
    const apetite = apetiteDe(acertos, excluidas)
    const mods = [...new Set(acertos.flatMap((a) => a.modalidades))]
    const semApetite = mods.filter((m) => excluidas.includes(m))
    if (apetite === 'fora') {
      passos.push({
        fonte: 'regua',
        texto: `Régua v${versao}: ${listaDeNomes(semApetite)} ${semApetite.length > 1 ? 'estão' : 'está'} sem apetite. A operação morre; o tomador fica vivo.`,
      })
    } else if (apetite === 'dentro') {
      passos.push({ fonte: 'regua', texto: `Régua v${versao}: modalidade com apetite.` })
    } else {
      passos.push({ fonte: 'regua', texto: `Régua v${versao}: a família mistura modalidade com e sem apetite. Precisa dizer qual.` })
    }
    const foraDoAssunto = fonteMod.fonte !== 'assunto'
    if (foraDoAssunto && !assuntoFalaDePedido) {
      passos.push({ fonte: 'regua', texto: 'Achado só fora do assunto, e o assunto não fala de pedido: precisa confirmar.' })
    } else if (foraDoAssunto && apetite === 'fora') {
      /* Tirar da conta exige o assunto. Uma menção no corpo ("sem processos
         trabalhistas", "judicial" num histórico colado) não pode sumir com um
         pedido que ninguém olhou. */
      passos.push({ fonte: 'regua', texto: 'Sem apetite achado só no corpo: para tirar da conta, precisa confirmar.' })
    }
    const confianca: Confianca =
      apetite === null || (foraDoAssunto && !assuntoFalaDePedido) || (foraDoAssunto && apetite === 'fora')
        ? 'incerto'
        : foraDoAssunto ? 'revisar' : 'seguro'
    return { ...base, demanda: true, tipo: 'operacao', modalidades: mods, apetite, confianca, origem: 'regua', passos }
  }

  if (sinalOperacao) {
    passos.push({
      fonte: sinalOperacao.fonte.fonte,
      texto: `${sinalOperacao.fonte.nome}: “${sinalOperacao.termo}” indica operação, mas nenhuma modalidade foi reconhecida.`,
      trecho: trechoEmVolta(sinalOperacao.fonte.texto, sinalOperacao.termo),
    })
    return { ...base, demanda: true, tipo: 'operacao', modalidades: [], apetite: null, confianca: 'incerto', origem: 'regua', passos }
  }

  if (sinalCredito) {
    passos.push({
      fonte: sinalCredito.fonte.fonte,
      texto: `${sinalCredito.fonte.nome}: “${sinalCredito.termo}” indica pedido só de análise de crédito.`,
      trecho: trechoEmVolta(sinalCredito.fonte.texto, sinalCredito.termo),
    })
    return {
      ...base, demanda: true, tipo: 'so_credito', modalidades: [], apetite: 'dentro',
      confianca: sinalCredito.fonte.fonte === 'assunto' ? 'seguro' : 'revisar', origem: 'regua', passos,
    }
  }

  passos.push({
    fonte: 'regua',
    texto: `Régua v${versao}: nada no assunto, no começo do e-mail nem nos anexos diz o que é o pedido.`,
  })
  return { ...base, demanda: true, tipo: null, modalidades: [], apetite: null, confianca: 'incerto', origem: 'regua', passos }
}

const PREFIXO_MARCA = /^\s*\[(externo|external|ext)\]\s*-?\s*/i
const PREFIXO_RESPOSTA =
  /^\s*(re|res|enc|fw|fwd|tr|rv|aw|encaminhar|encaminhado|resposta automática|resposta automatica|automatic reply)\s*(\[\d+\])?\s*\.?\s*[:_-]\s*/i

function tirarPrefixos(assunto: string | null | undefined): { resto: string; resposta: boolean } {
  let s = String(assunto ?? '')
  let resposta = false
  for (let i = 0; i < 8; i++) {
    const antes = s
    s = s.replace(PREFIXO_MARCA, '')
    const semResposta = s.replace(PREFIXO_RESPOSTA, '')
    if (semResposta !== s) resposta = true
    s = semResposta
    if (s === antes) break
  }
  return { resto: s, resposta }
}

/** "Re: ENC: [EXTERNO] Cotação X", "Enc.: Cotação X" e "Cotação X" são o mesmo pedido. */
export const chaveDoAssunto = (assunto: string | null | undefined): string => normalizar(tirarPrefixos(assunto).resto)

/** O assunto começa com RE, ENC e parecidos: é resposta ou encaminhamento de algo. */
export const ehResposta = (assunto: string | null | undefined): boolean => tirarPrefixos(assunto).resposta
