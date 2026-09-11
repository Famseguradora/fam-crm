/* A ESTEIRA DA ANÁLISE DE CRÉDITO: o vocabulário, num lugar só.

   Portado de `_sistema/fila.mjs` (a função `avaliar`), de `_sistema/comum.mjs`
   (a constante `ETAPAS`) e de `_sistema/visao.mjs` (as FASES da Mesa e a
   régua `faseDe`), que saem do ar junto com o Sistema de Análise.

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

/* ══════════════════════════════════════════════════════════════════════════
   AS CINCO FASES DA MESA, cópia literal do `FASES` do visao.mjs (26/08/2026).

   As situações acima são o que o MOTOR sabe de uma pasta. A fase é o que a
   MESA mostra: onde o caso está no caminho da casa (chegou, está sendo
   conferido, está liberado, está rodando, ficou pronto). Duas réguas sobre o
   mesmo dado, nunca duas leituras: quem calcula a fase é o motor, com a
   função `faseDe` de lá, e ela chega ao CRM pela sincronização. A cópia aqui
   existe para a tela desenhar a coluna quando a linha ainda não tem fase
   (linha antiga, anterior à Mesa) e para a régua ser uma só nos dois lados.
   ══════════════════════════════════════════════════════════════════════════ */
export const FASES = [
  { id: 'entrada', titulo: 'Entrada', dica: 'Chegou, ainda não passou pela análise documental', cor: '#8a95a3' },
  { id: 'conferencia', titulo: 'Conferência', dica: 'Documentos lidos, falta documento ou uma decisão sua', cor: '#a8760f' },
  { id: 'liberado', titulo: 'Liberado', dica: 'Cadastro em ordem, pode analisar', cor: '#2c5aa0' },
  { id: 'analisando', titulo: 'Analisando', dica: 'Rodando agora', cor: '#1e4080' },
  { id: 'pronta', titulo: 'Pronta', dica: 'Entregue, abrir e editar', cor: '#2f7d55' },
] as const

export type Fase = (typeof FASES)[number]['id']

export const nomeDaFase = (id: string | null | undefined) =>
  FASES.find(f => f.id === id)?.titulo ?? 'Entrada'

export const corDaFase = (id: string | null | undefined) =>
  FASES.find(f => f.id === id)?.cor ?? '#8a95a3'

/** A régua do visao.mjs, linha por linha. `cadastro` é o status da triagem
 *  (`pendente` = nunca triado, `bloqueado`, `em_conferencia`, `aprovado`). */
export function faseDe(situacao: string, cadastro: string | null | undefined): Fase {
  if (situacao === 'concluida') return 'pronta'
  if (situacao === 'em_andamento') return 'analisando'
  if (cadastro === 'pendente') return 'entrada'
  if (['aguardando_resposta', 'bloqueada_documentos', 'aguardando_documentos', 'erro', 'pausada'].includes(situacao)
    || cadastro === 'bloqueado' || cadastro === 'em_conferencia') return 'conferencia'
  return 'liberado'
}

/* O PRAZO DE CADA FASE, EM DIAS DE PACIÊNCIA. Cópia do `SLA_PADRAO` do
   quadro.mjs: passou do prazo, o cartão se acende (o SLA de fase do Pipefy).
   `pronta` não expira: já acabou. */
export const SLA_PADRAO: Record<Fase, number> = { entrada: 1, conferencia: 3, liberado: 2, analisando: 1, pronta: 0 }

/* AS ORDENS QUE UMA PESSOA PODE DAR, e em qual situação cada uma vale.

   A ordem não EXECUTA nada: ela é uma intenção guardada no banco, que o agente
   do notebook vem buscar. É o mesmo desenho do Carteiro, e pela mesma razão: o
   CRM nunca fala com 127.0.0.1 nem com a máquina de ninguém. O preço é levar
   alguns segundos, e a tela diz isso em vez de fingir.

   As quatro últimas entraram com o card (09/09/2026): são os botões da aba
   Análise do cockpit, um a um, e o agente as executa pelo mesmo caminho que o
   botão do cockpit executa (o /api/destravar e o /api/analisar do motor). */
export const ORDENS = ['iniciar', 'pausar', 'retomar', 'parar', 'reconferir', 'forcar', 'ler_pasta', 'refazer', 'publicar', 'liberar_triagem', 'excluir'] as const
export type Ordem = (typeof ORDENS)[number]

export const ORDEM: Record<Ordem, { rotulo: string; de: Situacao[]; explica: string }> = {
  iniciar: {
    rotulo: 'Analisar agora',
    /* `aguardando_resposta` entrou em 10/09/2026: o motor parava para perguntar
       e a pergunta ficava só no _status.json, sem botão nenhum no card. Iniciar
       ali é LIBERAR: a rota marca `liberar` nos dados e o agente responde a
       pergunta com a decisão da pessoa antes de subir a análise. */
    de: ['pendente', 'erro', 'concluida', 'aguardando_documentos', 'aguardando_resposta'],
    explica: 'Manda o motor começar. Em análise concluída, refaz do zero. Parada numa pergunta, libera com a sua decisão.',
  },
  pausar: {
    rotulo: 'Parar',
    // Também vale em `em_andamento`: parar no meio é exatamente o caso de uso.
    de: ['pendente', 'em_andamento', 'aguardando_resposta', 'erro', 'bloqueada_documentos'],
    explica: 'Tira da fila e deixa parada até alguém mandar seguir.',
  },
  retomar: {
    rotulo: 'Voltar para a fila',
    de: ['pausada'],
    explica: 'Devolve para a fila. O motor pega quando chegar a vez.',
  },
  /* PUBLICAR (09/09/2026). A análise terminava na esteira e parava ali: o
     resultado só chegava ao CRM quando alguém lembrasse de rodar a carga na
     mão (`npm run publicar`). Enquanto isso o card do tomador não tinha aba
     Relatório, porque `analises` não tinha linha nenhuma daquela empresa — foi
     exatamente o que aconteceu com a Rialma, analisada e invisível.

     Continua NÃO rodando sozinho: é um botão que uma pessoa aperta. O que
     mudou é que agora existe o botão, dentro do CRM, em vez de o caminho ser
     abrir o outro sistema. */
  publicar: {
    rotulo: 'Publicar no CRM',
    de: ['concluida'],
    explica: 'Leva o resultado desta análise para o banco do CRM. É a carga, rodada só para esta empresa.',
  },
  parar: {
    rotulo: 'Interromper agora',
    de: ['em_andamento'],
    explica: 'Derruba a execução que está rodando neste momento.',
  },
  reconferir: {
    rotulo: 'Reler a pasta agora',
    de: ['bloqueada_documentos', 'aguardando_documentos', 'pendente', 'erro', 'pausada', 'aguardando_resposta'],
    explica: 'Abre o e-mail que estiver na pasta, refaz a triagem e refaz a lista do que falta.',
  },
  /* LIBERAR A TRIAGEM (10/09/2026). Na esteira automática faltar documento não
     pula direto para a análise, como o `forcar` faz: a liberação dele leva o
     caso para a fase seguinte, o Cadastro, e é o agente de Cadastro que manda
     para o Crédito. Pular o Cadastro seria gastar a análise sem tomador. */
  liberar_triagem: {
    rotulo: 'Autorizar e seguir para o Cadastro',
    de: ['bloqueada_documentos', 'aguardando_documentos', 'pendente'],
    explica: 'Libera a triagem com o que está na pasta. O agente de Cadastro assume em seguida, e fica registrado que a liberação foi sua.',
  },
  /* EXCLUIR (10/09/2026): "às vezes vem tomadores repetidos". Quem dá esta ordem
     é o botão Excluir do caso em triagem (`/api/casos/[id]/excluir`). O agente
     move a pasta para `_excluidas` (nada é apagado) e o CRM tira o card da fila. */
  excluir: {
    rotulo: 'Excluir',
    de: ['aguardando_documentos', 'bloqueada_documentos', 'pendente', 'aguardando_resposta', 'pausada', 'erro'],
    explica: 'Tira a pasta da esteira: ela vai para _excluidas no notebook, sem apagar nada.',
  },
  forcar: {
    rotulo: 'Analisar mesmo assim',
    de: ['bloqueada_documentos', 'aguardando_documentos'],
    explica: 'Relê a pasta e, se continuar faltando documento, começa a análise do mesmo jeito. Fica registrado que a liberação foi sua.',
  },
  ler_pasta: {
    rotulo: 'Ler a pasta',
    de: ['pendente', 'erro', 'concluida', 'bloqueada_documentos', 'aguardando_documentos', 'pausada', 'aguardando_resposta'],
    explica: 'O bibliotecário abre todos os documentos da pasta e escreve o retrato da empresa. Leva alguns minutos.',
  },
  refazer: {
    rotulo: 'Refazer',
    de: ['concluida'],
    explica: 'Devolve a pasta para a fila com a sua ordem escrita, e roda de novo.',
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
