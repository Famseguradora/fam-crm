// ============================================================================
//  A IA DE GESTÃO  ·  fonte única
//
//  Porta o `gestao.mjs` do Sistema de Análise: a IA que olha o ACERVO INTEIRO,
//  compara e responde sobre o conjunto. É irmã, e não extensão, do auditor de
//  UMA análise — lá o mundo é a pasta de uma empresa, aqui é o acervo todo.
//
//  DOIS MOTORES (decisão dele em 08/09/2026):
//
//    notebook   o CRM guarda a pergunta em `ia_pedidos`; o agente da máquina
//               dele (scripts/esteira.mjs) pega, responde com o claude.exe da
//               assinatura e grava a resposta. Gasto de IA: zero.
//    servidor   a mesma pergunta respondida pela API Anthropic, para funcionar
//               no celular e para a equipe. PROGRAMADO E DESLIGADO: só liga
//               quando existir chave no ambiente e ele mandar.
//
//  A tela não sabe qual motor respondeu. É por isso que trocar de motor amanhã
//  não mexe em componente nenhum.
//
//  A IA DO CARD (09/09/2026) passa pela MESMA tabela, com `escopo = 'analise'`:
//  com análise no banco responde o auditor do relatório (ia.mjs, a mesma
//  conversa que aparece dentro do relatório); sem análise, o auditor ancorado
//  na pasta (ia-card.mjs). Quem decide qual dos dois é o agente, olhando se a
//  pergunta trouxe `analise_chave`.
// ============================================================================

export type MotorIA = 'notebook' | 'servidor'
export type EstadoPedido = 'pendente' | 'respondendo' | 'pronta' | 'erro' | 'cancelada'

export interface PedidoIA {
  id: string
  pergunta: string
  resposta: string | null
  erro: string | null
  estado: EstadoPedido
  motor: MotorIA
  maquina: string | null
  criado_por_nome: string | null
  criado_em: string
  respondido_em: string | null
  /** Em que assunto esta pergunta caiu. Nulo nos pedidos anteriores às
   *  conversas (09/09/2026) e nos do card, que têm `fila_id` no lugar. */
  conversa_id?: string | null
}

/* AS SUGESTÕES SÃO AS DELE, copiadas do `SUGESTOES` do gestao.mjs. São
   perguntas que só a IA de Gestão responde: nenhuma cabe dentro de uma análise
   só, e é essa a diferença dela para o auditor. */
export const SUGESTOES = [
  'Onde a minha decisão final mais discordou do Score FAM? Liste os casos e o motivo.',
  'Qual a concentração por corretora no acervo, e o que isso significa de risco?',
  'Quais tomadores do acervo são do mesmo grupo econômico e podem somar exposição?',
  'O que se repete nas análises que eu aprovei com ressalva?',
  'Compare os três maiores limites recomendados e diga o que sustenta cada um.',
]

/* OS ATALHOS DA IA DO CARD, cópia literal do `ATALHOS` do ia-card.mjs. São as
   quatro perguntas que ele faz olhando uma pasta que acabou de chegar. */
export const ATALHOS_CARD = [
  { id: 'oque', txt: 'O que tem nesta pasta?', pergunta: 'Liste o que existe nesta pasta e diga, para cada documento, que documento e, de que empresa e de que periodo. Aponte o que estiver fora do lugar: documento de coligada, periodo velho, arquivo que nao e do tomador.' },
  { id: 'numeros', txt: 'Os números principais', pergunta: 'Puxe dos documentos contabeis: receita liquida, EBITDA, lucro liquido, patrimonio liquido, divida bruta, caixa e estoque, dos periodos disponiveis. Monte uma tabela com o ano em cada coluna e cite arquivo e pagina de cada linha.' },
  { id: 'risco', txt: 'O que me preocuparia aqui', pergunta: 'Lendo so o material desta pasta, aponte o que voce sinalizaria num comite de credito: alavancagem, queda de margem, concentracao, passivo relevante, ressalva de auditoria, qualquer coisa que mereca pergunta. Cite a origem de cada ponto.' },
  { id: 'falta', txt: 'O que está faltando', pergunta: 'Compare o que existe nesta pasta com o que uma analise de credito da FAM precisa (dois exercicios fechados, demonstrativo do ano corrente, Serasa, contrato social). Diga o que falta e o que esta incompleto, com nome de arquivo.' },
]

/** O motor de hoje. Enquanto não houver chave de IA no ambiente do CRM, quem
 *  responde é o notebook — e isso é uma leitura do ambiente, não uma opinião
 *  da tela. */
export const motorAtual = (): MotorIA =>
  process.env.ANTHROPIC_API_KEY ? 'servidor' : 'notebook'

/** Quanto tempo uma pergunta pode ficar esperando antes de a tela dizer que o
 *  notebook provavelmente está desligado. Três minutos: uma resposta do
 *  claude.exe sobre o acervo leva de 20 a 90 segundos. */
export const ESPERA_LONGA_MS = 3 * 60 * 1000

export const esperandoDemais = (p: PedidoIA): boolean =>
  (p.estado === 'pendente' || p.estado === 'respondendo')
  && Date.now() - new Date(p.criado_em).getTime() > ESPERA_LONGA_MS

/* ══════════════════════════════════════════════════════════════════════════
   AS CONVERSAS, uma por assunto (09/09/2026)

   Pedido dele em 12/08/2026, com a razão junto: "criar histórico de conversas
   tratadas com ela, igual tenho com você, eu quero isso para separar a memória
   e não confundir o conteúdo". A separação é de verdade, e não só visual: cada
   conversa carrega a PRÓPRIA sessão do lado do motor, então trocar de conversa
   troca a memória junto.

   As 37 que ele já tinha vêm do disco pelo agente. As novas nascem aqui.
   ══════════════════════════════════════════════════════════════════════════ */

export interface Conversa {
  id: string
  titulo: string
  titulo_dele: boolean
  origem: 'crm' | 'motor'
  criada: string
  ultima: string
  trocas: number
  criado_por_nome: string | null
  arquivada: boolean
}

export interface MensagemIA {
  id: string
  conversa_id: string
  quem: 'marco' | 'ia' | 'pessoa'
  texto: string
  em: string
  segundos: number | null
  autor_nome: string | null
  origem: 'crm' | 'motor'
}

/* O ID DA CONVERSA NASCE NO FORMATO DO MOTOR (`c` + base36), mesmo quando ela
   é criada no CRM. Não é capricho: o `conversas.mjs` valida o id com
   /^c[0-9a-z]{6,24}$/ antes de aceitar a pergunta, e um uuid seria recusado —
   a conversa criada aqui nunca receberia resposta. Com este formato, o motor
   cria a pasta dela na primeira fala e os dois lados falam do mesmo assunto. */
export const novoIdConversa = (): string =>
  'c' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')

/** O título curto que ainda diz do que se trata. Cópia do `tituloDe` do
 *  conversas.mjs: corta na palavra, e tira o "?" do fim, que numa lista
 *  estreita só ocupa espaço. */
export function tituloDe(texto: string): string {
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim().replace(/[?!.]+$/, '')
  if (limpo.length <= 42) return limpo
  const corte = limpo.slice(0, 42)
  const espaco = corte.lastIndexOf(' ')
  return (espaco > 20 ? corte.slice(0, espaco) : corte) + '…'
}
