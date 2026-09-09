// ============================================================================
//  O QUADRO DE PESSOAL, do lado do CRM — `lib/analise/equipe.ts`
//
//  ESTE ARQUIVO É UM ESPELHO, e é importante saber disso. O original é o
//  `_sistema/equipe.mjs`, que mora na máquina do Marco. O CRM não alcança um
//  arquivo local, então o quadro é repetido aqui.
//
//  Duas defesas contra o espelho envelhecer calado:
//
//   1. `id`, `nome`, `sigla`, `cargo`, `setor`, `chefe`, `faz`, `alcada` e
//      `nota` são COPIADOS LITERALMENTE do equipe.mjs. Mudou lá, muda aqui.
//      Não invente nome novo.
//   2. Agente que aparecer nos eventos ou no mural e NÃO estiver nesta lista é
//      desenhado assim mesmo, com o id cru no lugar do nome. O quadro nunca
//      esconde um funcionário: ou ele aparece direito, ou aparece denunciando
//      a falta.
//
//  `reporta: true` marca quem já emite sinal de trabalho hoje. Ordem do Marco
//  em 31/08/2026 foi começar por Cadastro (Triagem) e Análise (Analista). Os
//  outros aparecem no organograma como a empresa que são, marcados como ainda
//  em silêncio — mentir que estão trabalhando seria pior que mostrá-los quietos.
//
//  A HIERARQUIA É POR SETOR, NUNCA PIRÂMIDE (equipe.mjs, decisão 1): o
//  Conferente não recebe ordem do Supervisor; eles olham coisas diferentes da
//  mesma análise. `chefe` é a quem a pessoa responde; `null` é quem responde
//  direto ao Marco.
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
  /** A quem responde. `null` responde direto ao Marco. */
  chefe: string | null
  /** Usa IA de verdade. Metade da casa é Node puro, e isso é garantia, não falta. */
  ia: boolean
  humano?: boolean
  /** Já manda sinal de trabalho para esta tela. */
  reporta: boolean
  faz: string
  alcada: string
  nota?: string
  /** Os arquivos do motor que executam este funcionário (para a ficha). */
  arquivos: string[]
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
    id: 'marco', sigla: 'MD', nome: 'Marco Dragone', cargo: 'Diretor', setor: 'direcao', chefe: null,
    humano: true, ia: false, reporta: false, arquivos: [],
    faz: 'Decide o que entra, o que sai e o que cada funcionário pode fazer sozinho.',
    alcada: 'Autoriza tudo. É dele a última palavra.',
  },
  {
    id: 'auditor', sigla: 'AU', nome: 'Auditor-chefe', cargo: 'Auditoria interna', setor: 'direcao', chefe: 'marco',
    ia: true, reporta: false, arquivos: ['auditoria.mjs'],
    faz: 'Mede a operação e reporta a performance para o Marco: o que está parado, o que ele reescreve nas análises, que corretora manda pasta pela metade.',
    alcada: 'Fala quando o Marco abre o mural. Não age sozinho.',
    nota: 'Os números são contados em Node. A IA só interpreta o que já foi medido.',
  },
  {
    id: 'gestao', sigla: 'GG', nome: 'Gestão', cargo: 'Gerente-geral', setor: 'direcao', chefe: 'marco',
    ia: true, reporta: false, arquivos: ['gestao.mjs', 'alcadas.mjs'],
    faz: 'Enxerga o acervo inteiro, responde pergunta de gestão e executa o que está dentro da alçada dela.',
    alcada: 'Age no que é livre; o resto vira pedido e espera o Marco.',
    nota: 'Nunca ganha caneta: a lista de ferramentas não tem Write, Edit nem Bash. Ela pede, o Node faz.',
  },
  {
    id: 'carteiro', sigla: 'CT', nome: 'Carteiro', cargo: 'Recepção de e-mails', setor: 'recepcao', chefe: 'triagem',
    ia: false, reporta: false, arquivos: ['outlook.mjs', 'outlook.ps1'],
    faz: 'Olha a caixa de e-mail no Outlook e traz o que é pedido de análise.',
    alcada: 'De fábrica só avisa no mural. Trazer sozinho é o Marco quem liga.',
    nota: 'Só lê o Outlook: não marca como lido, não move e não apaga nada.',
  },
  {
    id: 'triagem', sigla: 'TR', nome: 'Triagem', cargo: 'Chefe de recepção', setor: 'recepcao', chefe: null,
    ia: false, reporta: true, arquivos: ['cadastro.mjs', 'varredura.mjs', 'ler-emails.mjs', 'destravar.mjs'],
    faz: 'Abre o e-mail, tira os anexos, batiza a pasta com a razão social e confere se os documentos exigidos estão lá.',
    alcada: 'Faz sozinha e conta depois.',
    nota: 'É ela que segura a análise quando falta documento, e quem destrava quando ele chega.',
  },
  {
    id: 'previa', sigla: 'AP', nome: 'Análise prévia', cargo: 'Triagem de risco', setor: 'recepcao', chefe: 'triagem',
    ia: true, reporta: false, arquivos: ['previas.mjs'],
    faz: 'Dá o retrato barato antes de gastar a esteira inteira, para o Marco decidir se vale seguir.',
    alcada: 'Roda quando pedida.',
  },
  {
    id: 'analista', sigla: 'AN', nome: 'Analista de crédito', cargo: 'Analista sênior', setor: 'esteira', chefe: null,
    ia: true, reporta: true, arquivos: ['ia.mjs', 'executar.ps1', 'fila.mjs'],
    faz: 'Lê balanços, Serasa e contrato social, calcula o Score FAM, enquadra no resseguro e escreve a análise.',
    alcada: 'Só começa quando a Triagem libera, ou quando o Marco manda começar mesmo assim.',
  },
  {
    id: 'card', sigla: 'AC', nome: 'Auditor do card', cargo: 'Atendimento ao tomador', setor: 'esteira', chefe: 'analista',
    ia: true, reporta: false, arquivos: ['ia-card.mjs', 'briefing.mjs'],
    faz: 'Lê a pasta de um tomador e conta o que tem lá dentro, antes mesmo de existir análise.',
    alcada: 'Fala sozinho quando os documentos da pasta mudam.',
  },
  {
    id: 'conferente', sigla: 'CF', nome: 'Conferente', cargo: 'Conferência de números', setor: 'controle', chefe: null,
    ia: false, reporta: false, arquivos: ['template/auditor.js'],
    faz: 'Refaz as contas da análise: se o número não fecha, ele acusa.',
    alcada: 'Confere sempre, em toda análise.',
    nota: 'Não usa IA, e é de propósito. Conferir aritmética é onde IA é o pior instrumento que existe.',
  },
  {
    id: 'validador', sigla: 'VL', nome: 'Validador', cargo: 'Conferência de forma', setor: 'controle', chefe: 'conferente',
    ia: false, reporta: false, arquivos: ['validar.mjs', 'campos.mjs'],
    faz: 'Confere se a análise tem todos os campos que o contrato de resseguro exige.',
    alcada: 'Confere sempre.',
  },
  {
    id: 'supervisor', sigla: 'SV', nome: 'Supervisor da esteira', cargo: 'Supervisor', setor: 'supervisao', chefe: null,
    ia: false, reporta: false, arquivos: ['supervisor.mjs'],
    faz: 'Acompanha as análises rodando e avisa quando uma está fazendo a coisa errada.',
    alcada: 'Avisa. Não mata processo e não escreve em análise.',
    nota: 'Pergunta "está fazendo certo?". Os vigias só perguntam "está vivo?".',
  },
  {
    id: 'vigia', sigla: 'VG', nome: 'Vigia', cargo: 'Plantão', setor: 'supervisao', chefe: 'supervisor',
    ia: false, reporta: false, arquivos: ['servidor.mjs', 'executar.ps1'],
    faz: 'Confere de 45 em 45 segundos se a análise que está rodando ainda está viva, e derruba a que travou.',
    alcada: 'Age sozinho: é o único que pode matar um processo.',
  },
  {
    id: 'aprendizado', sigla: 'AZ', nome: 'Aprendizado', cargo: 'Memória técnica', setor: 'memoria', chefe: 'auditor',
    ia: false, reporta: false, arquivos: ['aprendizado.mjs', 'diferenca.mjs'],
    faz: 'Guarda o que o Marco corrigiu nas análises, para o mesmo erro não voltar.',
    alcada: 'Grava sozinho.',
  },
  {
    id: 'mural', sigla: 'MR', nome: 'Mural de recados', cargo: 'Comunicação interna', setor: 'memoria', chefe: null,
    ia: false, reporta: false, arquivos: ['recados.mjs'],
    faz: 'É onde todos os funcionários falam com o Marco. Recado não some sozinho e não se repete.',
    alcada: 'Só registra.',
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
    chefe: null,
    ia: false,
    reporta: true,
    arquivos: [],
    faz: 'Este funcionário mandou sinal de trabalho mas não tem cadeira no quadro. Alguém entrou no motor e esqueceu de desenhá-lo aqui.',
    alcada: 'não definida',
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
