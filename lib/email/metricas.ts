/* AS CONTAS DO E-MAIL VIVO — a fonte única, e ela é PURA de propósito.
   ═══════════════════════════════════════════════════════════════════════════

   Ordem do Marco em 10/09/2026: "Eu preciso do e-mail inteligente. Deve fazer
   uma análise dos e-mails recebidos, um dashboard visual simples, mas que
   mostra quantos e-mails recebi com pedido de análise, quantos eu analisei,
   quantos estão paralisados."

   POR QUE ISTO É UM MÓDULO SEM BANCO DENTRO:
   a mesma conta vai aparecer no painel do Comercial e (quando as APIs
   entrarem) num aviso automático. Se a fórmula morar na tela, no terceiro mês
   o painel diz 7 parados e o aviso diz 9. A regra da casa é dura: se dois
   lugares mostram o mesmo número, a fórmula mora em UM módulo.

   ───────────────────────────────────────────────────────────────────────────
   O E-MAIL TEM UM TRABALHO SÓ: SER RESOLVIDO
   ───────────────────────────────────────────────────────────────────────────
   Correção do Marco, no mesmo dia, olhando a primeira versão na tela:
   "casos que eu já trouxe para o sistema e já fiz a análise, ou apenas trouxe,
   mesmo que em triagem, não precisam mais aparecer. O ideal é mostrar de fato
   os e-mails parados, que não trouxe para dentro do sistema."

   O erro da primeira versão era de FRONTEIRA: ela seguia o pedido até a
   análise pronta, e assim cobrava do e-mail um atraso que já é da esteira
   (triagem, cadastro, crédito), que tem tela e dono próprios.

   Agora o relógio do e-mail PARA quando ele é resolvido:

     a_classificar  passou na régua da caixa e ninguém disse se é pedido.
     pedido         alguém disse que é, e ainda não foi trazido.
     aguardando     é pedido, mas falta algo de fora antes de trazer (a
                    corretora mandou sem o balanço). A ação é cobrar.
     trazendo       o clique foi dado; a máquina do Comercial está subindo.
     trazido        virou caso. SAIU DO E-MAIL. Daqui em diante é a esteira,
                    esteja em triagem, em análise ou já concluído.
     ja_analisado   foi analisado POR FORA do sistema (pedido do Marco: "tem
                    e-mail que eu já analisei, mas de outra forma"). Conta
                    como resolvido, e nunca entra na mediana de tempo.
     descartado     não é pedido, foi tirado da frente, ou a régua recusou.

   Os quatro primeiros são FORA DO SISTEMA, e só eles podem estar parados.
   "trazido" e "ja_analisado" são RESOLVIDOS.

   ───────────────────────────────────────────────────────────────────────────
   "PARADO" NÃO É UM CRITÉRIO SÓ
   ───────────────────────────────────────────────────────────────────────────
   Cada motivo pede uma AÇÃO diferente, e por isso o painel nunca mostra só
   "7 parados":

     venceu      passou do prazo de entrada          -> trazer ou resolver
     aguardando  espera documento de fora há dias     -> cobrar
     falhou      a máquina tentou trazer e não deu    -> tentar de novo

   O "sem dono" da primeira versão (copiado do Front) saiu: na FAM ninguém
   "assume" um e-mail antes de trazê-lo, então ele marcava TODA linha, e selo
   que aparece em tudo não diz nada. */

/* ══════════════════════════════════════════════════════════════════════════
   AS METAS  ·  espelham a tabela `email_metas` (uma linha só)
   ══════════════════════════════════════════════════════════════════════════ */
export interface MetasEmail {
  /** Horas ÚTEIS para o e-mail entrar no sistema (ou ser resolvido). Fábrica: 4. */
  horas_primeira_resposta: number
  /** Dias ÚTEIS até a análise ficar pronta. Não é usado aqui: é da esteira. */
  dias_uteis_conclusao: number
  /** Em que % do prazo o painel começa a avisar. Fábrica: 75. */
  aviso_em_percent: number
  hora_inicio: number
  hora_fim: number
  conta_fim_de_semana: boolean
  /** Dias corridos esperando documento até contar como parado. */
  dias_sem_movimento: number
}

export const METAS_PADRAO: MetasEmail = {
  horas_primeira_resposta: 4,
  dias_uteis_conclusao: 5,
  aviso_em_percent: 75,
  hora_inicio: 9,
  hora_fim: 18,
  conta_fim_de_semana: false,
  dias_sem_movimento: 2,
}

/* ══════════════════════════════════════════════════════════════════════════
   O RELÓGIO ÚTIL

   Um e-mail que chega sexta às 17h não pode amanhecer vermelho na segunda.

   FUSO FIXO EM -03:00, e isso é decisão, não descuido: o Brasil não tem
   horário de verão desde 2019. Fixo é auditável e não depende de o servidor
   (Vercel, em UTC) ter o banco de fusos certo.
   ══════════════════════════════════════════════════════════════════════════ */
const FUSO_BR_MIN = -3 * 60

/** O instante, visto como se fosse relógio de parede de São Paulo. */
function emSaoPaulo(d: Date): Date {
  return new Date(d.getTime() + FUSO_BR_MIN * 60_000)
}

const ehFimDeSemana = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6

/**
 * Horas ÚTEIS entre dois instantes, respeitando a janela de trabalho e o fim
 * de semana. Devolve 0 quando `fim` é anterior a `inicio`.
 */
export function horasUteis(inicio: Date, fim: Date, m: MetasEmail = METAS_PADRAO): number {
  if (!(inicio instanceof Date) || !(fim instanceof Date)) return 0
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return 0
  if (fim <= inicio) return 0

  const a = emSaoPaulo(inicio)
  const b = emSaoPaulo(fim)
  const janela = Math.max(0, m.hora_fim - m.hora_inicio)
  if (janela === 0) return 0

  let total = 0
  const dia = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()))

  // Trava de segurança: 3 anos de dias. Sem ela, uma data corrompida no banco
  // (1970 contra hoje) trava a tela num laço de milhares de voltas.
  for (let i = 0; i < 1100 && dia <= b; i++) {
    if (m.conta_fim_de_semana || !ehFimDeSemana(dia)) {
      const abre = new Date(dia.getTime() + m.hora_inicio * 3_600_000)
      const fecha = new Date(dia.getTime() + m.hora_fim * 3_600_000)
      const de = a > abre ? a : abre
      const ate = b < fecha ? b : fecha
      if (ate > de) total += (ate.getTime() - de.getTime()) / 3_600_000
    }
    dia.setUTCDate(dia.getUTCDate() + 1)
  }
  return total
}

/** Dias úteis, na mesma régua das horas. */
export const diasUteis = (inicio: Date, fim: Date, m: MetasEmail = METAS_PADRAO) =>
  horasUteis(inicio, fim, m) / Math.max(1, m.hora_fim - m.hora_inicio)

/* ══════════════════════════════════════════════════════════════════════════
   A LINHA CRUA  ·  o que a tela busca da view `painel_pedidos`
   ══════════════════════════════════════════════════════════════════════════ */
export interface LinhaPedido {
  id: string
  conta_id: string | null
  conta: string | null
  assunto: string
  de: string | null
  email_de: string | null
  recebido_em: string | null
  anexos_uteis: number | null

  estado: string
  serve: boolean
  motivo: string | null

  eh_pedido: boolean | null
  /** Quem disse que é (ou não é) pedido. */
  classificado_por?: string | null
  dono_auth_id: string | null
  dono_nome: string | null
  assumido_em: string | null
  aguardando_desde: string | null
  aguardando_motivo: string | null
  cobrado_em: string | null
  analisado_fora_em?: string | null
  analisado_fora_por?: string | null

  caso_id: string | null
  caso_numero?: number | null
  caso_etapa?: string | null
  caso_criado_em?: string | null
  caso_concluido_em?: string | null
  corretora?: string | null
  /** O CNPJ do caso, quando o e-mail já virou caso. */
  cnpj?: string | null
  razao_social?: string | null

  fila_situacao?: string | null
  fila_concluido_em?: string | null
  /** O último movimento conhecido, de qualquer uma das três tabelas. */
  ultimo_movimento?: string | null
}

export type EstadoPedido =
  | 'a_classificar' | 'pedido' | 'aguardando' | 'trazendo'
  | 'trazido' | 'ja_analisado' | 'descartado'

export type MotivoParado = 'venceu' | 'aguardando' | 'falhou'

/** Os estados em que o e-mail ainda NÃO foi resolvido. Só eles param. */
export const FORA_DO_SISTEMA: readonly EstadoPedido[] = ['a_classificar', 'pedido', 'aguardando', 'trazendo']
export const estaForaDoSistema = (e: EstadoPedido) => FORA_DO_SISTEMA.includes(e)

/** Resolvido: entrou no sistema, ou foi analisado por fora. */
export const estaResolvido = (e: EstadoPedido) => e === 'trazido' || e === 'ja_analisado'

export interface PedidoLido extends LinhaPedido {
  estado_trabalho: EstadoPedido
  /**
   * Horas úteis. Fora do sistema: desde que chegou até agora. Trazido: da
   * chegada até virar caso. Já analisado: até o clique, e por isso NUNCA vai
   * para média nem mediana (o clique não é a data da análise).
   */
  horas: number
  parado: boolean
  motivos: MotivoParado[]
  /** Vai vencer, mas ainda não venceu. Não conta como parado. */
  em_risco: boolean
  /** Quanto do prazo de entrada já foi consumido (1 = estourou). */
  consumo: number
}

const dataOu = (t: string | null | undefined): Date | null => {
  if (!t) return null
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d
}

/* O ESTADO, derivado e nunca digitado. Um campo "estado de trabalho" gravado à
   mão seria mais uma verdade ao lado de `emails_caixa.estado`, `casos.etapa`
   e `analise_fila.situacao`, e elas divergiriam. */
export function estadoDoPedido(p: LinhaPedido): EstadoPedido {
  /* VIROU CASO, SAIU DO E-MAIL. Vale para o caso em triagem, em análise,
     concluído ou descartado na triagem: em todos, quem cuida é a esteira.
     `estado = trazido` sem `caso_id` também conta: `casos` apaga com
     ON DELETE SET NULL, e um e-mail cujo caso sumiu não pode voltar para a
     fila de "parados" como se nunca tivesse entrado. */
  if (p.caso_id || p.estado === 'trazido') return 'trazido'

  /* JÁ ANALISADO POR FORA vem antes de qualquer descarte: se alguém disse que
     analisou, a análise existiu, e a estatística tem que contar. */
  if (p.analisado_fora_em) return 'ja_analisado'

  if (p.eh_pedido === false) return 'descartado'
  // "Tratado" é o e-mail tirado da frente sem virar caso.
  if (p.estado === 'tratado') return 'descartado'
  /* Só pergunta quem passou na régua da caixa. Os outros (158 de 272, medido:
     sem anexo, remetente de fora, e-mail pessoal) não são pergunta para
     ninguém responder. */
  if (p.eh_pedido !== true && !p.serve) return 'descartado'

  if (p.estado === 'a_trazer') return 'trazendo'
  if (p.aguardando_desde) return 'aguardando'
  if (p.eh_pedido === true) return 'pedido'
  return 'a_classificar'
}

/**
 * Lê um e-mail: estado, relógio e por que está parado.
 *
 * `agora` entra por parâmetro para a função ser testável e para a tela
 * inteira ser calculada no MESMO instante.
 */
export function lerPedido(p: LinhaPedido, m: MetasEmail = METAS_PADRAO, agora: Date = new Date()): PedidoLido {
  const estado_trabalho = estadoDoPedido(p)
  const chegada = dataOu(p.recebido_em) ?? agora

  /* ONDE O RELÓGIO PARA. Trazido: quando virou caso. Já analisado: no clique.
     Descartado: no último movimento. Fora do sistema: não para. */
  const fim = estado_trabalho === 'trazido'
    ? (dataOu(p.caso_criado_em) ?? chegada)
    : estado_trabalho === 'ja_analisado'
      ? (dataOu(p.analisado_fora_em) ?? chegada)
      : estado_trabalho === 'descartado'
        ? (dataOu(p.ultimo_movimento) ?? chegada)
        : agora

  const horas = horasUteis(chegada, fim, m)
  const prazo = Math.max(0.25, m.horas_primeira_resposta)
  const consumo = horas / prazo

  const fora = estaForaDoSistema(estado_trabalho)
  // "Trazendo" não para: o clique foi dado, quem responde agora é a máquina.
  const cobravel = fora && estado_trabalho !== 'trazendo'

  const motivos: MotivoParado[] = []
  if (cobravel) {
    /* FALHOU não espera prazo nenhum: alguém quis trazer e não deu. */
    if (p.estado === 'erro') motivos.push('falhou')

    if (estado_trabalho === 'aguardando') {
      /* Esperando documento de fora NÃO vence pelo prazo de entrada: a bola
         não está com a FAM. Só vira parado se a espera passar do tolerado. */
      const desde = dataOu(p.aguardando_desde)
      if (desde && (agora.getTime() - desde.getTime()) / 86_400_000 >= m.dias_sem_movimento) {
        motivos.push('aguardando')
      }
    } else if (consumo >= 1) {
      motivos.push('venceu')
    }
  }

  return {
    ...p,
    estado_trabalho,
    horas,
    consumo,
    parado: motivos.length > 0,
    motivos,
    em_risco: cobravel && estado_trabalho !== 'aguardando' &&
      motivos.length === 0 && consumo >= m.aviso_em_percent / 100,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   O RESUMO  ·  os quatro números do topo
   ══════════════════════════════════════════════════════════════════════════ */
export interface ResumoEmail {
  /** Chegaram no período e são (ou podem ser) pedido de análise. */
  chegaram: number
  /** Fora do sistema AGORA: a decidir, pedido, aguardando, trazendo. */
  fora: number
  /** Dos de fora, quantos ninguém classificou. */
  a_classificar: number
  /** Parados agora, com o detalhe por motivo. */
  parados: number
  por_motivo: Record<MotivoParado, number>
  em_risco: number
  /** Resolvidos no período: trazidos + já analisados por fora. */
  resolvidos: number
  /** Viraram caso DENTRO do período. */
  trazidos: number
  /** Analisados por fora, contados pelo período em que o e-mail CHEGOU. */
  ja_analisados: number
  /** Dos trazidos, quantos têm hora de criação do caso (base das médias). */
  com_tempo: number
  /** Mediana e média de horas úteis do e-mail até virar caso. SÓ trazidos. */
  mediana_horas: number | null
  media_horas: number | null
  /** Quantos entraram dentro do prazo de entrada. */
  no_prazo: number
  /** O mais antigo parado, em horas úteis. */
  mais_antigo: { horas: number; assunto: string; id: string } | null
  /** Há quantos DIAS CORRIDOS espera o e-mail mais velho de fora do sistema. */
  espera_mais_antiga_dias: number | null
}

const mediana = (v: number[]): number | null => {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  const meio = Math.floor(s.length / 2)
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2
}

/**
 * A data que põe um e-mail RESOLVIDO num período. Trazido: quando virou caso.
 * Já analisado: o dia em que o e-mail CHEGOU, e não o do clique. Marcar hoje o
 * passivo de agosto não pode fazer o cartão dizer que hoje foram resolvidos 40
 * pedidos: quem analisou foi agosto. Não resolvido: nulo.
 *
 * Mora aqui, e não na tela, porque o cartão (a contagem) e a lista que abre
 * dentro dele têm que usar a MESMA regra, senão o cartão diz 12 e a lista
 * mostra 10.
 */
export function dataDaResolucao(p: PedidoLido): string | null {
  if (p.estado_trabalho === 'trazido') return p.caso_criado_em ?? p.recebido_em
  if (p.estado_trabalho === 'ja_analisado') return p.recebido_em
  return null
}

/**
 * `desde`/`ate` filtram só o que é contagem DE PERÍODO (chegaram, resolvidos).
 * O que é fotografia do agora (fora, parados) ignora o período de propósito.
 */
export function resumir(
  pedidos: PedidoLido[],
  m: MetasEmail = METAS_PADRAO,
  desde?: Date,
  ate?: Date,
): ResumoEmail {
  const dentro = (t: string | null | undefined) => {
    const d = dataOu(t)
    if (!d) return false
    if (desde && d < desde) return false
    if (ate && d > ate) return false
    return true
  }
  const referencia = ate ?? new Date()

  const fora = pedidos.filter((p) => estaForaDoSistema(p.estado_trabalho))
  const parados = fora.filter((p) => p.parado)

  const por_motivo: Record<MotivoParado, number> = { venceu: 0, aguardando: 0, falhou: 0 }
  for (const p of parados) for (const mo of p.motivos) por_motivo[mo]++

  const resolvidosNoPeriodo = pedidos.filter((p) => dentro(dataDaResolucao(p)))
  const trazidos = resolvidosNoPeriodo.filter((p) => p.estado_trabalho === 'trazido')
  const jaAnalisados = resolvidosNoPeriodo.filter((p) => p.estado_trabalho === 'ja_analisado')

  /* A MEDIANA É SÓ DE QUEM ENTROU NO SISTEMA. O já analisado fica fora de
     propósito: a hora dele é a do clique, não a da análise, e um e-mail de 47
     dias marcado hoje diria "levou 47 dias". E os casos antigos sem
     `criado_em` também ficam fora, para não entrarem com "zero horas". */
  const comTempo = trazidos.filter((p) => p.caso_criado_em)
  const duracoes = comTempo.map((p) => p.horas)

  const maisAntigo = parados.reduce<PedidoLido | null>(
    (velho, p) => (!velho || p.horas > velho.horas ? p : velho),
    null,
  )

  return {
    chegaram: pedidos.filter((p) => p.estado_trabalho !== 'descartado' && dentro(p.recebido_em)).length,
    fora: fora.length,
    a_classificar: fora.filter((p) => p.estado_trabalho === 'a_classificar').length,
    parados: parados.length,
    por_motivo,
    em_risco: fora.filter((p) => p.em_risco).length,
    resolvidos: trazidos.length + jaAnalisados.length,
    trazidos: trazidos.length,
    ja_analisados: jaAnalisados.length,
    com_tempo: comTempo.length,
    mediana_horas: mediana(duracoes),
    media_horas: duracoes.length ? duracoes.reduce((a, b) => a + b, 0) / duracoes.length : null,
    no_prazo: comTempo.filter((p) => p.consumo <= 1).length,
    mais_antigo: maisAntigo
      ? { horas: maisAntigo.horas, assunto: maisAntigo.assunto, id: maisAntigo.id }
      : null,
    espera_mais_antiga_dias: fora.length
      ? Math.max(
          ...fora.map((p) => {
            const d = dataOu(p.recebido_em)
            return d ? (referencia.getTime() - d.getTime()) / 86_400_000 : 0
          }),
        )
      : null,
  }
}

/** O texto que o painel mostra em vez de "7 parados". */
export function explicarParados(r: ResumoEmail): string {
  const partes: string[] = []
  if (r.por_motivo.venceu) partes.push(`${r.por_motivo.venceu} passaram do prazo de entrada`)
  if (r.por_motivo.falhou) partes.push(`${r.por_motivo.falhou} falharam ao trazer`)
  if (r.por_motivo.aguardando) partes.push(`${r.por_motivo.aguardando} esperando documento`)
  return partes.join(' · ') || 'nenhum e-mail parado'
}

export const ROTULO_MOTIVO: Record<MotivoParado, { nome: string; acao: string }> = {
  venceu: { nome: 'Passou do prazo', acao: 'trazer, marcar como já analisado, ou dizer que não é pedido' },
  falhou: { nome: 'Falhou ao trazer', acao: 'tentar de novo (confira se o Carteiro está de pé)' },
  aguardando: { nome: 'Esperando documento', acao: 'cobrar a corretora' },
}

/** Horas em texto curto: "3 h", "2 d", "agora". */
export function horasTexto(h: number, m: MetasEmail = METAS_PADRAO): string {
  if (!Number.isFinite(h) || h < 0.05) return 'agora'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 10) return `${h.toFixed(1).replace('.', ',')} h`
  const jornada = Math.max(1, m.hora_fim - m.hora_inicio)
  if (h < jornada * 2) return `${Math.round(h)} h`
  return `${(h / jornada).toFixed(1).replace('.', ',')} d`
}
