/* A ESTEIRA DA ANÁLISE DE CRÉDITO: o vocabulário, num lugar só.

   Portado de `_sistema/fila.mjs` (a função `avaliar`) e de `_sistema/comum.mjs`
   (a constante `ETAPAS`), que saem do ar junto com o Sistema de Análise.

   POR QUE ISTO É UM MÓDULO E NÃO UMA LISTA EM CADA LADO:
   três lugares precisam concordar sobre o que é "pausada" e sobre qual ordem
   pode ser dada em cada situação: a tela do CRM, a rota que grava a ordem e o
   agente que roda no notebook. Escrito três vezes, diverge no terceiro mês, e
   a divergência aparece como um botão que a tela mostra e o servidor recusa.

   NADA AQUI USA IA. É a régua da esteira, determinística. Quem usa IA é o motor
   no notebook (o `claude.exe`, pela assinatura, sem chave de API e sem fatura de
   token), e ele continua onde está. */

/** As oito situações de uma análise, na ordem em que o `avaliar()` as testa. */
export const SITUACOES = [
  'aguardando_documentos',
  'bloqueada_documentos',
  'pendente',
  'em_andamento',
  'aguardando_resposta',
  'pausada',
  'concluida',
  'erro',
] as const

export type Situacao = (typeof SITUACOES)[number]

export interface RotuloSituacao {
  rotulo: string
  /** A classe de badge do CRM (globals.css). */
  badge: string
  /** O que essa situação quer dizer, em uma frase, para a tela explicar. */
  explica: string
}

export const SITUACAO: Record<Situacao, RotuloSituacao> = {
  aguardando_documentos: {
    rotulo: 'Sem documentos',
    badge: 'badge-gray',
    explica: 'Não há documento para analisar. Só o briefing, ou a pasta está vazia.',
  },
  bloqueada_documentos: {
    rotulo: 'Falta documento',
    badge: 'badge-red',
    explica: 'A política exige um documento que não veio. A análise não começa sem ele.',
  },
  pendente: {
    rotulo: 'Na fila',
    badge: 'badge-orange',
    explica: 'Pronta para começar. Nova, ou os documentos mudaram desde a última vez.',
  },
  em_andamento: {
    rotulo: 'Analisando',
    badge: 'badge-blue',
    explica: 'O motor está rodando neste momento, na máquina que pegou a trava.',
  },
  aguardando_resposta: {
    rotulo: 'Precisa de você',
    badge: 'badge-yellow',
    explica: 'O motor parou para perguntar. Enquanto ninguém responder, ela fica aqui.',
  },
  pausada: {
    rotulo: 'Parada por você',
    badge: 'badge-purple',
    explica: 'Alguém parou de propósito. Decisão de gente vence regra automática.',
  },
  concluida: {
    rotulo: 'Concluída',
    badge: 'badge-green',
    explica: 'Pronta, e os documentos não mudaram desde então. Não se refaz sozinha.',
  },
  erro: {
    rotulo: 'Falhou',
    badge: 'badge-red',
    explica: 'A execução anterior quebrou. O motivo está escrito, e dá para mandar de novo.',
  },
}

/* AS DOZE ETAPAS, cópia literal do `ETAPAS` do `comum.mjs`. Elas são o que a
   tela mostra enquanto o motor trabalha: sem isso, "Analisando" fica dez
   minutos parado na tela e quem olha acha que travou. */
export const ETAPAS: [string, string][] = [
  ['fila', 'Lendo a fila'],
  ['documentos', 'Abrindo e organizando os documentos'],
  ['triagem', 'Conferindo o cadastro e os documentos exigidos'],
  ['leitura', 'Lendo balanços, Serasa e contrato social'],
  ['web', 'Pesquisando a empresa na internet'],
  ['financeiro', 'Montando as demonstrações financeiras'],
  ['score', 'Calculando o Score FAM'],
  ['resseguro', 'Enquadrando no contrato de resseguro'],
  ['conclusao', 'Escrevendo os 3 C e a conclusão'],
  ['validando', 'Conferindo os números'],
  ['template', 'Testando a importação no template'],
  ['pronta', 'Análise pronta'],
]

export const nomeDaEtapa = (etapa: string | null) =>
  ETAPAS.find(([id]) => id === etapa)?.[1] ?? ''

/** Quantos por cento do caminho aquela etapa representa. Só para a barra. */
export const andamentoDaEtapa = (etapa: string | null) => {
  const i = ETAPAS.findIndex(([id]) => id === etapa)
  return i < 0 ? 0 : Math.round(((i + 1) / ETAPAS.length) * 100)
}

/* AS ORDENS QUE UMA PESSOA PODE DAR, e em qual situação cada uma vale.

   A ordem não EXECUTA nada: ela é uma intenção guardada no banco, que o agente
   do notebook vem buscar. É o mesmo desenho do Carteiro, e pela mesma razão: o
   CRM nunca fala com 127.0.0.1 nem com a máquina de ninguém. O preço é levar
   alguns segundos, e a tela diz isso em vez de fingir. */
export const ORDENS = ['iniciar', 'pausar', 'retomar', 'parar'] as const
export type Ordem = (typeof ORDENS)[number]

export const ORDEM: Record<Ordem, { rotulo: string; de: Situacao[]; explica: string }> = {
  iniciar: {
    rotulo: 'Analisar agora',
    de: ['pendente', 'erro', 'concluida'],
    explica: 'Manda o motor começar. Em análise concluída, refaz do zero.',
  },
  pausar: {
    rotulo: 'Parar',
    // Também vale em `em_andamento`: parar no meio é exatamente o caso de uso.
    de: ['pendente', 'em_andamento', 'aguardando_resposta', 'erro'],
    explica: 'Tira da fila e deixa parada até alguém mandar seguir.',
  },
  retomar: {
    rotulo: 'Voltar para a fila',
    de: ['pausada'],
    explica: 'Devolve para a fila. O motor pega quando chegar a vez.',
  },
  parar: {
    rotulo: 'Interromper agora',
    de: ['em_andamento'],
    explica: 'Derruba a execução que está rodando neste momento.',
  },
}

/** A tela pergunta isto para desenhar os botões; a rota pergunta para gravar. */
export const ordemVale = (ordem: string, situacao: string) =>
  (ORDENS as readonly string[]).includes(ordem) &&
  ORDEM[ordem as Ordem].de.includes(situacao as Situacao)

/** As ordens possíveis numa situação, para a tela não inventar botão. */
export const ordensDe = (situacao: string) =>
  ORDENS.filter((o) => ORDEM[o].de.includes(situacao as Situacao))

/* A ORDEM DE EXIBIÇÃO NA TELA, e ela não é alfabética nem a da máquina: é a de
   quem olha. Primeiro o que precisa de gente, depois o que está andando, e por
   último o que já está resolvido. Uma esteira ordenada pelo ciclo da máquina
   esconde justamente o que trava o dia. */
export const ORDEM_NA_TELA: Situacao[] = [
  'aguardando_resposta',
  'bloqueada_documentos',
  'erro',
  'em_andamento',
  'pendente',
  'pausada',
  'aguardando_documentos',
  'concluida',
]

export const pesoNaTela = (situacao: string) => {
  const i = ORDEM_NA_TELA.indexOf(situacao as Situacao)
  return i < 0 ? 99 : i
}

/* A TRAVA. No motor ela é um arquivo com o PID; aqui é a linha do banco, e o
   que decide não é o relógio: é a máquina dizer que continua viva. Execução
   morta segurava a pasta por 45 minutos à toa, e execução viva que passasse de
   45 minutos aparecia como livre e podia ser processada duas vezes. Ver o
   comentário do `avaliar()` no fila.mjs, de 05/08/2026.

   Aqui o batimento vem junto do `progresso`: sem notícia por este tempo, a
   execução é dada como morta e a análise volta para a fila. */
export const TRAVA_MORRE_APOS_MIN = 20

export const travaMorta = (travaEm: string | null) =>
  !travaEm || Date.now() - new Date(travaEm).getTime() > TRAVA_MORRE_APOS_MIN * 60000
