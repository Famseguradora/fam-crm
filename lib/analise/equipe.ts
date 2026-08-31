// ============================================================================
//  O QUADRO DE PESSOAL, do lado do CRM — `lib/analise/equipe.ts`
//
//  ESTE ARQUIVO É UM ESPELHO, e é importante saber disso. O original é o
//  `_sistema/equipe.mjs`, que mora na máquina do Marco. O CRM não alcança um
//  arquivo local, então o quadro é repetido aqui.
//
//  Duas defesas contra o espelho envelhecer calado:
//
//   1. `id`, `nome`, `sigla`, `cargo` e `setor` são COPIADOS LITERALMENTE do
//      equipe.mjs. Mudou lá, muda aqui. Não invente nome novo.
//   2. Agente que aparecer nos eventos e NÃO estiver nesta lista é desenhado
//      assim mesmo, com o id cru no lugar do nome. O quadro nunca esconde um
//      funcionário: ou ele aparece direito, ou aparece denunciando a falta.
//
//  `reporta: true` marca quem já emite sinal de trabalho hoje. Ordem do Marco
//  em 31/08/2026 foi começar por Cadastro (Triagem) e Análise (Analista). Os
//  outros aparecem no organograma como a empresa que são, marcados como ainda
//  em silêncio — mentir que estão trabalhando seria pior que mostrá-los quietos.
// ============================================================================

export interface Setor {
  id: string
  nome: string
  cor: string
  conta: string
}

export interface Funcionario {
  id: string
  sigla: string
  nome: string
  cargo: string
  setor: string
  /** Usa IA de verdade. Metade da casa é Node puro, e isso é garantia, não falta. */
  ia: boolean
  humano?: boolean
  /** Já manda sinal de trabalho para esta tela. */
  reporta: boolean
  faz: string
}

export const SETORES: Setor[] = [
  { id: 'direcao', nome: 'Direção', cor: '#e8b84b', conta: 'Decide, autoriza alçada e responde pela casa.' },
  { id: 'recepcao', nome: 'Recepção', cor: '#4a90d0', conta: 'Recebe o pedido, abre o e-mail e monta a pasta do tomador.' },
  { id: 'esteira', nome: 'Análise de crédito', cor: '#7c5cd0', conta: 'Lê os documentos e escreve a análise.' },
  { id: 'controle', nome: 'Controle de qualidade', cor: '#3fae82', conta: 'Confere o que saiu antes de virar parecer.' },
  { id: 'supervisao', nome: 'Supervisão', cor: '#d0743f', conta: 'Olha o trabalho enquanto ele acontece.' },
  { id: 'memoria', nome: 'Memória da casa', cor: '#8a93a8', conta: 'Guarda o que foi decidido e o que se aprendeu.' },
]

export const QUADRO: Funcionario[] = [
  {
    id: 'marco', sigla: 'MD', nome: 'Marco Dragone', cargo: 'Diretor', setor: 'direcao',
    humano: true, ia: false, reporta: false,
    faz: 'Decide o que entra, o que sai e o que cada funcionário pode fazer sozinho.',
  },
  {
    id: 'auditor', sigla: 'AU', nome: 'Auditor-chefe', cargo: 'Auditoria interna', setor: 'direcao',
    ia: true, reporta: false,
    faz: 'Mede a operação e reporta a performance: o que está parado, o que ele reescreve nas análises, que corretora manda pasta pela metade.',
  },
  {
    id: 'gestao', sigla: 'GG', nome: 'Gestão', cargo: 'Gerente-geral', setor: 'direcao',
    ia: true, reporta: false,
    faz: 'Enxerga o acervo inteiro, responde pergunta de gestão e executa o que está dentro da alçada dela.',
  },
  {
    id: 'carteiro', sigla: 'CT', nome: 'Carteiro', cargo: 'Recepção de e-mails', setor: 'recepcao',
    ia: false, reporta: false,
    faz: 'Olha a caixa de e-mail no Outlook e traz o que é pedido de análise.',
  },
  {
    id: 'triagem', sigla: 'TR', nome: 'Triagem', cargo: 'Chefe de recepção', setor: 'recepcao',
    ia: false, reporta: true,
    faz: 'Abre o e-mail, tira os anexos, batiza a pasta com a razão social e confere se os documentos exigidos estão lá.',
  },
  {
    id: 'previa', sigla: 'AP', nome: 'Análise prévia', cargo: 'Triagem de risco', setor: 'recepcao',
    ia: true, reporta: false,
    faz: 'Dá o retrato barato antes de gastar a esteira inteira, para o Marco decidir se vale seguir.',
  },
  {
    id: 'analista', sigla: 'AN', nome: 'Analista de crédito', cargo: 'Analista sênior', setor: 'esteira',
    ia: true, reporta: true,
    faz: 'Lê balanços, Serasa e contrato social, calcula o Score FAM, enquadra no resseguro e escreve a análise.',
  },
  {
    id: 'card', sigla: 'AC', nome: 'Auditor do card', cargo: 'Atendimento ao tomador', setor: 'esteira',
    ia: true, reporta: false,
    faz: 'Lê a pasta de um tomador e conta o que tem lá dentro, antes mesmo de existir análise.',
  },
  {
    id: 'conferente', sigla: 'CF', nome: 'Conferente', cargo: 'Conferência de números', setor: 'controle',
    ia: false, reporta: false,
    faz: 'Refaz as contas da análise: se o número não fecha, ele acusa.',
  },
  {
    id: 'validador', sigla: 'VL', nome: 'Validador', cargo: 'Conferência de forma', setor: 'controle',
    ia: false, reporta: false,
    faz: 'Confere se a análise tem todos os campos que o contrato de resseguro exige.',
  },
  {
    id: 'supervisor', sigla: 'SV', nome: 'Supervisor da esteira', cargo: 'Supervisor', setor: 'supervisao',
    ia: false, reporta: false,
    faz: 'Acompanha as análises rodando e avisa quando uma está fazendo a coisa errada.',
  },
  {
    id: 'vigia', sigla: 'VG', nome: 'Vigia', cargo: 'Plantão', setor: 'supervisao',
    ia: false, reporta: false,
    faz: 'Confere de 45 em 45 segundos se a análise que está rodando ainda está viva, e derruba a que travou.',
  },
  {
    id: 'aprendizado', sigla: 'AZ', nome: 'Aprendizado', cargo: 'Memória técnica', setor: 'memoria',
    ia: false, reporta: false,
    faz: 'Guarda o que o Marco corrigiu nas análises, para o mesmo erro não voltar.',
  },
  {
    id: 'mural', sigla: 'MR', nome: 'Mural de recados', cargo: 'Comunicação interna', setor: 'memoria',
    ia: false, reporta: false,
    faz: 'É onde todos os funcionários falam com o Marco. Recado não some sozinho e não se repete.',
  },
]

/**
 * O funcionário pelo id. Nunca devolve nulo: id que não está no quadro vira um
 * card com o id cru, que é como o espelho desatualizado se denuncia sozinho.
 */
export function funcionarioPor(id: string): Funcionario {
  const achado = QUADRO.find(f => f.id === id)
  if (achado) return achado
  return {
    id,
    sigla: id.slice(0, 2).toUpperCase(),
    nome: id,
    cargo: 'Não está no organograma',
    setor: 'memoria',
    ia: false,
    reporta: true,
    faz: 'Este funcionário mandou sinal de trabalho mas não tem cadeira no quadro. Alguém entrou no motor e esqueceu de desenhá-lo aqui.',
  }
}

export function setorPor(id: string): Setor {
  return SETORES.find(s => s.id === id)
    ?? { id, nome: id, cor: '#8a93a8', conta: '' }
}

/**
 * Depois de quanto tempo sem dar sinal o avatar apaga sozinho.
 *
 * Precisa existir: se o processo do agente morrer no meio, ninguém volta para
 * escrever "terminei", e sem este teto o avatar ficaria aceso para sempre
 * mentindo que há trabalho acontecendo. Dez minutos é mais que a etapa mais
 * longa medida numa análise real.
 */
export const MS_ATE_APAGAR = 10 * 60 * 1000

export interface EventoAgente {
  id: string
  agente: string
  acao: string
  tarefa: string
  alvo: string | null
  detalhe: string | null
  criado_em: string
}

export interface EstadoAgente {
  trabalhando: boolean
  tarefa: string | null
  alvo: string | null
  detalhe: string | null
  desde: string | null
}

/**
 * Deriva "quem está trabalhando agora" a partir do log de eventos.
 *
 * O estado NÃO é guardado em coluna, de propósito: coluna de estado mente
 * quando o processo morre no meio e ninguém volta para corrigi-la. Aqui o
 * último evento de cada um manda, e o relógio desempata.
 */
export function estadoDosAgentes(
  eventos: EventoAgente[],
  agora: number = Date.now(),
): Record<string, EstadoAgente> {
  const porAgente: Record<string, EventoAgente> = {}
  for (const e of eventos) {
    const atual = porAgente[e.agente]
    if (!atual || e.criado_em > atual.criado_em) porAgente[e.agente] = e
  }

  const saida: Record<string, EstadoAgente> = {}
  for (const [agente, e] of Object.entries(porAgente)) {
    const idade = agora - new Date(e.criado_em).getTime()
    const aberto = e.acao === 'comecou' || e.acao === 'passo'
    saida[agente] = {
      trabalhando: aberto && idade < MS_ATE_APAGAR,
      tarefa: e.tarefa,
      alvo: e.alvo,
      detalhe: e.detalhe,
      desde: e.criado_em,
    }
  }
  return saida
}
