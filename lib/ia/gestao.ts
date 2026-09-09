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
