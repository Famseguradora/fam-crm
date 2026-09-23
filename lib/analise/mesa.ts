// ============================================================================
//  A MESA DA ANÁLISE DE CRÉDITO, dentro do CRM  ·  os tipos e as contas
//
//  Porta para o CRM o que o cockpit do Sistema de Análise lia de `/api/visao`:
//  a ficha de cada tomador na esteira, os cinco números da faixa de comando,
//  o retrato da máquina (quantas rodando, vagas, última varredura).
//
//  A ORIGEM DE CADA COISA, e ela não muda:
//    a linha de `analise_fila` ... o agente do notebook escreve (o disco)
//    `analise_estado` ........... idem, o retrato da esteira (execuções, varredura)
//    `analises` ................. a carga publica o resultado
//  Nada aqui lê 127.0.0.1. O que não está no banco não aparece, e a tela diz
//  de onde vem cada número.
// ============================================================================

import type { Situacao, Ordem } from './esteira'
import { FASES, type Fase } from './esteira'

/** A triagem, item por item, como o cadastro.mjs decidiu. */
export interface ItemCadastro {
  id: string
  nome: string
  chip: string
  exigencia: 'bloqueia' | 'sinaliza'
  situacao: 'ok' | 'duvida' | 'faltando' | 'a_caminho' | 'dispensado' | string
  obs?: string
}

export interface CadastroFila {
  status: 'pendente' | 'bloqueado' | 'em_conferencia' | 'aprovado' | string
  rotulo: string
  motivo: string
  bloqueios: { id: string; nome: string }[]
  pendencias: { id: string; nome: string }[]
  itens: ItemCadastro[]
  produto?: string
  corretora?: string
}

export interface DocsFila { feitos: number; total: number; falta: string[] }

/** Um arquivo da pasta, como o arquivos.mjs lista. */
export interface ArquivoFila {
  rel: string
  nome: string
  subpasta?: string
  ext?: string
  bytes: number
  tamanho: string
  classe: string
  classe_rotulo: string
  classe_cor: string
  certeza?: string
  nao_lido?: boolean
  ignorado?: boolean
  atende: { id: string; chip: string; situacao: string }[]
  usar: boolean
  tirado_por_voce?: boolean
  embrulho?: boolean
  /** A pasta já saiu do disco: esta linha é o retrato guardado. */
  retratado?: boolean
}

export interface ArquivosFila {
  pasta: string
  chave: string
  onde: 'raiz' | 'concluidas' | null
  fonte?: 'disco' | 'retrato'
  retrato_em?: string | null
  arquivos: ArquivoFila[]
  total: number
  escolhidos: number
  bytes_escolhidos?: number
  por_classe: { classe: string; rotulo: string; cor: string; total: number; escolhidos: number }[]
  avisos: { nivel: 'erro' | 'aviso' | string; txt: string }[]
}

/** O que o bibliotecário escreveu sobre a empresa (biblioteca.mjs). */
export interface LeituraBiblioteca {
  em?: string
  empresa?: Record<string, unknown> & { retrato?: string; nome?: string; o_que_faz?: string }
  socios?: { nome?: string; papel?: string; participacao?: string; fonte?: string }[]
  grupo?: { nome?: string; relacao?: string; fonte?: string }[]
  documentos?: { rel: string; e?: string; resumo?: string; data_base?: string; achados?: string[] }[]
  ligacoes?: { de?: string; para?: string; como?: string }[]
}

export interface BibliotecaFila {
  demonstrativos?: {
    ano: number | string
    tabelas?: { titulo?: string; em?: string; texto?: string; tabela?: { colunas: string[]; linhas: string[][] } }[]
    contabeis?: { rel: string; nome: string; tamanho: string; usar: boolean }[]
    contabeis_total?: number
    quando_vazio?: string
  } | null
  leitura?: LeituraBiblioteca | null
  leitura_velha?: boolean
  pode_ler?: boolean
}

/** Uma linha da linha de processos (linha.mjs). */
export interface LinhaItem {
  em: string
  tipo: string
  txt: string
  quem?: string
  abrir?: string
  id?: string
}

/** A linha de `analise_fila`, com as colunas do card. */
export interface FilaRica {
  id: string
  /* ANÁLISE SEM ESTEIRA (09/09/2026).
     O card do tomador nasceu lendo `analise_fila`: uma PASTA no disco, com
     documentos, ordens e histórico. Mas o Acervo tem 139 análises vigentes e só
     2 têm pasta na esteira — as outras 137 terminaram e a pasta foi arquivada.

     Ordem dele: abrir pelo Acervo e abrir pela Mesa têm que cair na MESMA tela,
     a das sete abas. Então o card passa a aceitar também o id de uma ANÁLISE, e
     monta uma ficha a partir dela. Esta bandeira diz que é esse o caso, e as
     abas que dependem da pasta (Arquivos, ordens da Análise) explicam por que
     não têm o que mostrar, em vez de aparecerem quebradas ou vazias. */
  semEsteira?: boolean
  caso_id: string | null
  analise_id: string | null
  tomador_id: string | null
  cnpj: string | null
  cnpj_confiavel: boolean
  razao_social: string | null
  chave_local: string | null
  pasta: string
  situacao: Situacao
  motivo: string | null
  etapa: string | null
  etapa_texto: string | null
  etapa_em: string | null
  documentos: number
  documentos_faltando: string[]
  hash_documentos: string | null
  trava_maquina: string | null
  trava_em: string | null
  ordem: Ordem | null
  ordem_por: string | null
  ordem_em: string | null
  ordem_dados: Record<string, unknown> | null
  erro: string | null
  criado_em: string
  criado_por: string | null
  concluido_em: string | null
  atualizado_em: string
  // o que o card precisa
  chave: string | null
  fase: string | null
  nome: string | null
  corretora: string | null
  produto: string | null
  docs: DocsFila | null
  cadastro: CadastroFila | null
  arquivos: ArquivosFila | null
  biblioteca: BibliotecaFila | null
  linha: LinhaItem[]
  parado_desde: string | null
  analise_chave: string | null
  substatus: string | null
  substatus_por: string | null
  substatus_em: string | null
  /** A coluna da Mesa escolhida por uma pessoa (17/09/2026). Vence a fase. */
  coluna_id?: string | null
  coluna_por?: string | null
  coluna_em?: string | null
  /** A posicao escolhida a mao dentro da coluna (23/09/2026). 1 e o primeiro.
   *  Nula = ninguem mexeu: entra depois dos priorizados, na ordem automatica. */
  prioridade?: number | null
  prioridade_por?: string | null
  prioridade_em?: string | null
  instrucao: string | null
  modo: string | null
  arquivos_fora: string[]
  arquivos_fora_em: string | null
  arquivada: boolean
  sincronizado_em: string | null
  ultima_ordem_resultado: string | null
  ultima_ordem_em: string | null
  /** Nasceu do "Trazer para a esteira" e anda sozinha: triagem, cadastro e análise. */
  automatica?: boolean
  cadastro_agente?: CadastroAgente | null
  cadastro_agente_em?: string | null
  /** Quando o agente viu que a pasta saiu do computador (raiz e _concluidas). Ver `naMesa`. */
  fora_do_disco_em?: string | null
}

/** O que o agente de Cadastro achou, gravado pelo CRM em `analise_fila.cadastro_agente`. */
export interface CadastroAgente {
  status: 'ok' | 'bloqueado' | 'erro'
  hash: string | null
  em: string
  motivos: string[]
  atencao: string[]
  tomador_id: string | null
  tomador_criado: boolean
  razao_social: string | null
  cnpj: string | null
  receita: { ok: boolean; motivo?: string | null; situacao?: string | null }
  fonte: 'receita' | 'serasa' | null
  preenchidos: string[]
  conferencia: { campo: string; contrato_social?: string | null; serasa?: string | null; confere: boolean; gravidade: 'ok' | 'atencao' | 'bloqueia'; nota?: string | null }[]
  fontes: { contrato_social: boolean; serasa: boolean; cartao_cnpj: boolean }
  observacoes: string | null
  analise_mandada: boolean
}

export const COLUNAS_FILA = `
  id, caso_id, analise_id, tomador_id, cnpj, cnpj_confiavel, razao_social, chave_local, pasta,
  situacao, motivo, etapa, etapa_texto, etapa_em, documentos, documentos_faltando, hash_documentos,
  trava_maquina, trava_em, ordem, ordem_por, ordem_em, ordem_dados, erro, criado_em, criado_por,
  concluido_em, atualizado_em, chave, fase, nome, corretora, produto, docs, cadastro, arquivos,
  biblioteca, linha, parado_desde, analise_chave, substatus, substatus_por, substatus_em, coluna_id, coluna_por, coluna_em, prioridade, prioridade_por, prioridade_em,
  instrucao, modo, arquivos_fora, arquivos_fora_em, arquivada, sincronizado_em,
  ultima_ordem_resultado, ultima_ordem_em, automatica, cadastro_agente, cadastro_agente_em, fora_do_disco_em
`

/** As colunas leves, para a Mesa: sem arquivos e biblioteca, que pesam. A
 *  linha de processos vai, porque o cartão mostra o último evento dela. */
export const COLUNAS_MESA = `
  id, caso_id, analise_id, tomador_id, cnpj, cnpj_confiavel, razao_social, chave_local, pasta,
  situacao, motivo, etapa, etapa_texto, etapa_em, documentos, documentos_faltando, hash_documentos,
  trava_maquina, trava_em, ordem, ordem_por, ordem_em, ordem_dados, erro, criado_em, criado_por,
  concluido_em, atualizado_em, chave, fase, nome, corretora, produto, docs, cadastro, linha,
  parado_desde, analise_chave, substatus, substatus_por, substatus_em, coluna_id, coluna_por, coluna_em, prioridade, prioridade_por, prioridade_em, instrucao, modo,
  arquivos_fora, arquivos_fora_em, arquivada, sincronizado_em, ultima_ordem_resultado, ultima_ordem_em,
  automatica, cadastro_agente, fora_do_disco_em
`

/* QUEM FICA NA MESA  ·  10/09/2026
   Pedido dele: "as análises de crédito, quando terminadas e quando eu recortar a
   pasta do tomador do meu computador e colar na rede da FAM, não precisaria ficar
   mais aparecendo dentro da tela Mesa". Rialma, Renova Energia e BOUW ficavam para
   sempre: o agente parava de mandar a pasta, e nada tirava o card do quadro.

   A marca `fora_do_disco_em` é do agente (scripts/esteira.mjs `conferirDisco`).
   A regra de quem aparece mora AQUI, e a Mesa e a contagem da barra usam esta
   mesma função, para o número de cima nunca discordar do quadro.

     pasta no computador (raiz ou _concluidas)   fica
     pasta fora do computador                    sai, qualquer que seja a situação

   14/09/2026, "de uma vez por todas": a Blau Farmacêutica tinha a análise feita
   e a pasta recortada, mas a linha ficou "pausada" com caso, e a regra antiga
   segurava na Mesa a não concluída com caso. Para ele a Mesa é o que ainda
   depende de ajuste NESTE computador: pasta recortada é processo encerrado,
   seja qual for a situação que a linha guardou. O caso continua no funil e a
   análise no Acervo; nada some. Colou a pasta de volta, o agente limpa a marca
   (`de_volta`) e o card volta.

   Só a Mesa esconde. O GET da esteira continua mandando a fila inteira, porque a
   automação do agente lê de lá. */
export function naMesa(f: { fora_do_disco_em?: string | null }) {
  return !f.fora_do_disco_em
}

/** O retrato da esteira que o agente grava em `analise_estado` (id = 'esteira'). */
export interface EstadoEsteira {
  gerado_em?: string
  execucao?: {
    rodando: boolean
    vagas: number
    max: number
    execucoes: {
      pasta: string; razao: string; etapa: string; etapaTxt: string
      idxAtual: number; mensagem: string; segundosDesde: number; travado?: boolean
      /* OS TRÊS QUE O PAINEL DE MISSÃO PEDE (09/09/2026). Vêm do mesmo
         `/api/visao` do notebook que já enchia os campos de cima; a esteira só
         não os estava carregando para o CRM porque a tela antiga era uma
         linha de texto e não tinha onde mostrá-los.
           paradoHa ..... minutos desde a última notícia (o "há 1 min")
           etapas_seg ... quanto custou cada etapa JÁ FECHADA desta corrida
           retomadas .... o vigia derrubou e retomou do zero? */
      paradoHa?: number
      etapas_seg?: { etapa: string; segundos: number }[]
      retomadas?: number
    }[]
  }
  varredura?: { novidades: number; quando: string | null; quando_txt?: string; pastas?: number } | null
  contas?: Record<string, number>
  internet_ok?: boolean
  template?: string
  raiz?: string
}

// ── as contas da tela ───────────────────────────────────────────────────────

/** O nome que a Mesa mostra: o que o motor batizou, senão a razão social, senão a pasta. */
export const nomeDaFicha = (f: Pick<FilaRica, 'nome' | 'razao_social' | 'pasta'>) =>
  f.nome || f.razao_social || f.pasta

/** Há quantos dias este caso não anda. Sai de `parado_desde` (o último evento
 *  da linha de processos, calculado pelo motor), e cai para `atualizado_em`
 *  quando a linha ainda não foi sincronizada com a Mesa. */
export function diasParado(f: Pick<FilaRica, 'parado_desde' | 'atualizado_em' | 'criado_em'>, agora: number = Date.now()): number | null {
  const base = f.parado_desde || f.atualizado_em || f.criado_em
  if (!base) return null
  const d = Math.floor((agora - new Date(base).getTime()) / 86400000)
  return Number.isFinite(d) ? Math.max(0, d) : null
}

/** As iniciais do selo. Mesmo desenho do cockpit: as duas primeiras palavras. */
export function iniciaisDe(nome: string): string {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '—'
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[1][0]).toUpperCase()
}

/* A COR DO SELO SAI DO NOME, então não muda de uma rodada para a outra: o olho
   aprende a achar a empresa antes de ler. As oito cores são as do selo.mjs, a
   mesma paleta das colunas do quadro e das áreas do encaminhamento. */
/* AS CORES DO SELO, dessaturadas em 09/09/2026 junto com a paleta da Análise.
   Eram oito cores cheias, e as duas roxas (#8B4A9C e #7A6BC4) eram o que mais
   puxava a tela para a "cara de IA" que ele mandou tirar. Continuam oito e
   continuam distinguíveis entre si; o que saiu foi o brilho. */
export const CORES_SELO = ['#3A6491', '#3C7A60', '#8A6A2E', '#7A5470', '#96504E', '#41697A', '#5D6390', '#7A5C3C']

export function corDoNome(nome: string): string {
  let h = 0
  for (const c of String(nome || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return CORES_SELO[h % CORES_SELO.length]
}

/** Quantos por cento dos documentos exigidos estão em ordem. */
export const pctDocs = (docs: DocsFila | null, documentos: number) =>
  docs && docs.total ? Math.round((docs.feitos / docs.total) * 100) : (documentos ? 100 : 0)

/** "há 4 min", "há 3 h", "há 2 d". */
export function desde(iso: string | null | undefined): string {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(min)) return ''
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`
}

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** O texto do cartão cortado com reticências, sem quebrar palavra no meio. */
export const corta = (s: string | null | undefined, n: number) => {
  const t = String(s ?? '')
  return t.length > n ? t.slice(0, n - 1).replace(/\s+$/, '') + '…' : t
}

/** Só os dígitos do CNPJ, ou vazio. */
export const soDigitos = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '')

/* QUEM FALA NO MURAL, cópia literal do `AGENTES` do recados.mjs, com a sigla do
   quadro (equipe.mjs) para o avatar. Agente que falar e não estiver aqui
   aparece com o id cru, denunciando que o espelho envelheceu. */
export const AGENTES_DO_MURAL: Record<string, { nome: string; sigla: string; papel: string; cor: string }> = {
  triagem: { nome: 'Triagem', sigla: 'TR', papel: 'abre o e-mail, batiza a pasta e lê os documentos', cor: '#4a90d0' },
  card: { nome: 'Auditor do card', sigla: 'AC', papel: 'lê a pasta de um tomador e diz o que tem lá dentro', cor: '#7c5cd0' },
  auditor: { nome: 'Auditor-chefe', sigla: 'AU', papel: 'acompanha o seu trabalho e a qualidade do que sai daqui', cor: '#e8b84b' },
  supervisor: { nome: 'Supervisor da esteira', sigla: 'SV', papel: 'acompanha as análises rodando e avisa quando uma está fazendo a coisa errada', cor: '#d0743f' },
  carteiro: { nome: 'Carteiro', sigla: 'CT', papel: 'olha a sua caixa de e-mail no Outlook e traz o que é análise', cor: '#4a90d0' },
  gestao: { nome: 'Gestão', sigla: 'GG', papel: 'enxerga o acervo inteiro e executa o que está na alçada dela', cor: '#e8b84b' },
  sistema: { nome: 'Sistema', sigla: 'SI', papel: 'avisos da máquina', cor: '#8a93a8' },
}

export const agenteDoMural = (id: string) =>
  AGENTES_DO_MURAL[id] ?? { nome: id, sigla: id.slice(0, 2).toUpperCase(), papel: 'não está no quadro', cor: '#8a93a8' }

/** Um recado do mural, como está em `analise_recados`. */
export interface Recado {
  id: string
  em: string
  agente: string
  titulo: string
  texto: string | null
  pasta: string | null
  chave: string | null
  cnpj: string | null
  nivel: string
  acoes: { tipo: string; rotulo: string; valor?: string; endereco?: string; pasta?: string; chave?: string }[]
  dados: Record<string, unknown> | null
  lido_em: string | null
  arquivado_em: string | null
  lido_no_crm_em: string | null
  arquivado_no_crm_em: string | null
}

export const recadoLido = (r: Recado) => !!(r.lido_em || r.lido_no_crm_em)
export const recadoArquivado = (r: Recado) => !!(r.arquivado_em || r.arquivado_no_crm_em)

/** Um encaminhamento, como está em `analise_encaminhamentos`. */
export interface Encaminhamento {
  id: string
  fila_id: string | null
  chave: string | null
  tomador_id: string | null
  pasta: string | null
  tomador: string | null
  para_area: string | null
  para_nome: string | null
  para_auth_id: string | null
  pedido: string
  prazo: string | null
  estado: 'aberto' | 'respondido' | 'fechado'
  resposta: string | null
  respondido_em: string | null
  fechado_em: string | null
  de_nome: string | null
  criado_em: string
}

export const ESTADO_ENC: Record<Encaminhamento['estado'], { rotulo: string; cor: string }> = {
  aberto: { rotulo: 'Esperando', cor: '#a07b1e' },
  respondido: { rotulo: 'Respondeu', cor: '#1a7a50' },
  fechado: { rotulo: 'Encerrado', cor: '#6080a0' },
}

/** Há quantos dias o encaminhamento está aberto, e se passou do prazo. */
export function idadeDoEncaminhamento(e: Encaminhamento): { dias: number; atrasado: boolean } {
  const dias = Math.max(0, Math.floor((Date.now() - new Date(e.criado_em).getTime()) / 86400000))
  const atrasado = e.estado === 'aberto' && !!e.prazo && new Date(e.prazo + 'T23:59:59').getTime() < Date.now()
  return { dias, atrasado }
}

/* ══════════════════════════════════════════════════════════════════════════
   UMA EMPRESA, UM CARD  ·  09/09/2026

   O QUE ESTAVA ERRADO. A ficha da Mesa é uma PASTA, e a análise renomeia a
   pasta enquanto trabalha. Então a mesma empresa aparecia três vezes no
   quadro: "Renova" (como chegou), "Renova Energia S a" (depois que a análise
   apurou o nome) e "Renova Energia" (a pasta concluída). Olhando a Mesa, dava
   a impressão de três negócios diferentes com o mesmo cliente.

   É a mesma regra que o funil já ensina, e agora vale aqui: uma empresa, um
   card. Cada pasta continua existindo, e continua clicável: o que muda é que
   elas passam a se apresentar juntas.

   COMO SE DECIDE QUE É A MESMA EMPRESA, e a diferença entre as duas regras
   está na tela, não escondida aqui:

     PROVA     mesmo CNPJ, ou mesmo tomador do CRM, ou nome idêntico depois de
               tirar acento, pontuação e sufixo societário. Une calado.
     PALPITE   o nome de uma é o começo do nome da outra ("Renova" dentro de
               "Renova Energia"). Une, mas o card DIZ que uniu por semelhança,
               porque isto pode errar e quem confere é gente.

   Palavra genérica não vira palpite: "Construtora" é o começo do nome de meia
   dúzia de empresas diferentes, e uni-las seria pior do que deixar separadas.
   ══════════════════════════════════════════════════════════════════════════ */

/** Sufixos societários e ruído de nome de pasta. Tirados antes de comparar:
 *  "Rialma S.a |" e "Rialma" são a mesma empresa escrita de dois jeitos. */
const RUIDO = /\b(s\s*\/?\s*a|sa|ltda|me|epp|eireli|spe|mei|s\s*s|cia|companhia)\b/g

/** Palavra que não identifica empresa nenhuma sozinha: nunca vira palpite. */
const GENERICAS = new Set([
  'construtora', 'construcoes', 'empresa', 'grupo', 'engenharia', 'incorporadora',
  'participacoes', 'holding', 'comercio', 'industria', 'servicos', 'transportes',
  'energia', 'empreendimentos', 'agropecuaria', 'distribuidora', 'logistica',
  'tecnologia', 'consultoria', 'administradora', 'usina', 'fazenda', 'cadastro',
])

/** O nome reduzido ao que ele tem de próprio. */
export function nomeCru(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(RUIDO, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface GrupoEmpresa {
  /** A chave do grupo. CNPJ quando existe; senão o nome cru mais completo. */
  chave: string
  /** A ficha que representa o grupo: a mais adiantada da esteira. */
  principal: FilaRica
  /** Todas as pastas, da mais adiantada para a menos. */
  fichas: FilaRica[]
  /** Uniu por semelhança de nome, e não por prova. O card avisa. */
  palpite: boolean
}

const PESO_FASE: Record<string, number> = {
  entrada: 0, conferencia: 1, liberado: 2, analisando: 3, pronta: 4,
}

/**
 * Junta as pastas da mesma empresa. `fase` é a mesma função que a tela usa,
 * passada de fora para não haver duas réguas de fase no sistema.
 */
export function agruparPorEmpresa(
  fila: FilaRica[],
  fase: (f: FilaRica) => string,
): GrupoEmpresa[] {
  const n = fila.length
  /* Union-find: "Renova" casa com "Renova Energia S a" por palpite, que casa
     com "Renova Energia" por CNPJ. As três têm que cair no mesmo grupo mesmo
     sem a primeira e a última se conhecerem. */
  const pai = Array.from({ length: n }, (_, i) => i)
  const acha = (i: number): number => (pai[i] === i ? i : (pai[i] = acha(pai[i])))
  const une = (a: number, b: number) => { const x = acha(a), y = acha(b); if (x !== y) pai[x] = y }

  const cru = fila.map(f => nomeCru(f.nome || f.razao_social || f.pasta))
  const porPalpite = new Set<number>()

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = fila[i], b = fila[j]

      // ── PROVA ──────────────────────────────────────────────────────────
      if (a.cnpj && b.cnpj && a.cnpj === b.cnpj) { une(i, j); continue }
      if (a.tomador_id && b.tomador_id && a.tomador_id === b.tomador_id) { une(i, j); continue }
      if (cru[i] && cru[i] === cru[j]) { une(i, j); continue }

      // ── PALPITE ────────────────────────────────────────────────────────
      // CNPJ diferente é prova de que NÃO são a mesma: nem tenta o palpite.
      if (a.cnpj && b.cnpj && a.cnpj !== b.cnpj) continue
      const [curto, longo] = cru[i].length <= cru[j].length ? [cru[i], cru[j]] : [cru[j], cru[i]]
      if (curto.length < 5) continue
      if (GENERICAS.has(curto.split(' ')[0])) continue
      // Começo em limite de palavra: "renova" casa com "renova energia",
      // e não com "renovacao".
      if (longo === curto || longo.startsWith(curto + ' ')) {
        une(i, j)
        porPalpite.add(i); porPalpite.add(j)
      }
    }
  }

  const grupos = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const r = acha(i)
    const lista = grupos.get(r) ?? []
    lista.push(i)
    grupos.set(r, lista)
  }

  return [...grupos.values()].map(indices => {
    /* A MAIS ADIANTADA REPRESENTA O GRUPO, e é ela que decide em que coluna o
       card aparece. Empate de fase: a mais recente. É a leitura que ele fez em
       voz alta ("a Renova já fez a análise"): o que interessa é onde a empresa
       chegou, não onde a pasta mais velha parou. */
    const ordenadas = indices
      .map(i => fila[i])
      .sort((a, b) => {
        const d = (PESO_FASE[fase(b)] ?? 0) - (PESO_FASE[fase(a)] ?? 0)
        if (d) return d
        return String(b.atualizado_em || '').localeCompare(String(a.atualizado_em || ''))
      })

    const principal = ordenadas[0]
    const comCnpj = ordenadas.find(f => f.cnpj)
    return {
      chave: comCnpj?.cnpj ?? nomeCru(nomeDaFicha(principal)) ?? principal.id,
      principal,
      fichas: ordenadas,
      // Só avisa quando o palpite foi necessário: grupo de uma pasta só, ou
      // unido por CNPJ, não tem o que avisar.
      palpite: ordenadas.length > 1 && indices.some(i => porPalpite.has(i)),
    }
  })
}

/** O nome do grupo é o da pasta MAIS ADIANTADA, e não o mais comprido.
 *
 *  A tentação é pegar o nome mais completo, e ela erra: o nome mais comprido
 *  costuma ser o do assunto do e-mail, com sobra ("Rialma S.a |", com a barra
 *  do assunto colada). Quem apurou o nome de verdade foi a análise, e a pasta
 *  mais adiantada é justamente a que ela mais trabalhou.
 *
 *  Só cai para a mais comprida quando a principal ficou com um nome curto
 *  demais para identificar alguém ("Renova", antes de a análise apurar). */
export function nomeDoGrupo(g: GrupoEmpresa): string {
  const limpo = (s: string) => String(s ?? '').replace(/[\s|·\-–—,.]+$/, '').trim()

  const daPrincipal = limpo(nomeDaFicha(g.principal))
  if (daPrincipal.length >= 8) return daPrincipal

  const maisLongo = g.fichas
    .map(f => limpo(nomeDaFicha(f)))
    .reduce((melhor, atual) => (atual.length > melhor.length ? atual : melhor), '')

  return maisLongo || daPrincipal || nomeDaFicha(g.principal)
}


/* ══════════════════════════════════════════════════════════════════════════
   AS COLUNAS DA MESA  ·  17/09/2026

   Pedido dele: "igual o Trello, eu posso criar novas colunas e, ao entrar no
   card, dentro do botão 'Mudar o substatus', irá aparecer uma lista com os
   status das colunas da Mesa". Por exemplo, "Interrompido".

   As colunas moram em `analise_colunas`. As cinco com `fase` são as do
   sistema, e o card cai nelas sozinho, pela régua do motor. As sem `fase` são
   dele, e o card só entra quando alguém escolhe no botão do card.

   A ESCOLHA DE GENTE VENCE A RÉGUA: `coluna_id` preenchido manda o card para
   aquela coluna e ele não sai de lá sozinho, nem quando a análise anda. O
   mesmo princípio da `pausada`. Coluna arquivada deixa de valer, e o card
   volta para a coluna automática: arquivar não pode sumir com card nenhum.
   ══════════════════════════════════════════════════════════════════════════ */
export interface ColunaMesa {
  id: string
  titulo: string
  fase: Fase | null
  dica: string | null
  cor: string
  ordem: number
  arquivada: boolean
}

/** As cinco do código, para a Mesa desenhar mesmo sem a tabela (migration
 *  atrasada, ou o banco fora do ar por um instante). O id é a própria fase:
 *  nenhum card aponta para elas por `coluna_id`, então não há o que casar. */
export const colunasDoCodigo = (): ColunaMesa[] =>
  FASES.map((f, i) => ({
    id: `fase:${f.id}`, titulo: f.titulo, fase: f.id, dica: f.dica, cor: f.cor, ordem: (i + 1) * 10, arquivada: false,
  }))

/** As colunas que a Mesa mostra, na ordem dele. Sem nenhuma do sistema no
 *  banco, a tela cai no código: ficar sem coluna para o card automático cair
 *  seria esconder análise. */
export function colunasVisiveis(doBanco: ColunaMesa[] | null | undefined): ColunaMesa[] {
  const ativas = (doBanco ?? []).filter((c) => !c.arquivada)
  if (!ativas.some((c) => c.fase)) return colunasDoCodigo()
  return [...ativas].sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

/** Em qual coluna o card está. Primeiro a escolha de uma pessoa; se ela não
 *  existe mais (coluna arquivada), a fase do motor. */
export function colunaDoCard(
  f: { coluna_id?: string | null },
  fase: Fase,
  colunas: ColunaMesa[],
): ColunaMesa {
  const escolhida = f.coluna_id ? colunas.find((c) => c.id === f.coluna_id) : undefined
  if (escolhida) return escolhida
  return colunas.find((c) => c.fase === fase) ?? colunas[0]
}


/* ══════════════════════════════════════════════════════════════════════════
   A PRIORIDADE DO CARD  ·  23/09/2026

   Pedido dele: "o Ivan subiu um e-mail depois do Abenaias, mas ele quer
   urgência no caso: ele arrasta o card, igual o Trello, onde é possível
   alterar a classificação (1, 2, 3...)".

   O NÚMERO É POSIÇÃO, NÃO GRAVIDADE. 1 é o primeiro da coluna. Não existe
   "prioridade alta" solta: existe quem está na frente de quem, e é por isso
   que arrastar um card mexe no número dos outros.

   QUEM NÃO FOI ARRASTADO NÃO TEM NÚMERO, e fica DEPOIS dos que têm, na ordem
   de sempre (o mais parado primeiro). Card novo não passa na frente do que
   alguém colocou lá à mão — era exatamente a queixa que abriu o pedido.

   A PRIORIDADE É DA EMPRESA, e o quadro desenha uma empresa por card. Ela é
   gravada em todas as pastas do grupo (ver a rota /api/esteira/prioridade),
   então a ordem sobrevive à troca da pasta principal, que muda quando a
   análise anda.

   Esta é a fonte única: a Mesa ordena por aqui e a rota renumera por aqui.
   ══════════════════════════════════════════════════════════════════════════ */

/** O número do card: o menor entre as pastas da empresa, ou nulo se nenhuma
 *  foi arrastada. Menor, e não o da principal, porque priorizar uma pasta é
 *  priorizar a empresa — e a principal de hoje pode não ser a de amanhã. */
export function prioridadeDoGrupo(g: GrupoEmpresa): number | null {
  const nums = g.fichas
    .map((f) => f.prioridade)
    .filter((p): p is number => typeof p === 'number' && p > 0)
  return nums.length ? Math.min(...nums) : null
}

/** A ordem da coluna: primeiro os arrastados, pelo número; depois o resto,
 *  na ordem em que chegou (a automática, que a Mesa já calculou). O `sort` do
 *  JS é estável desde o ES2019, e é dele que vem o "o resto não se mexe". */
export function ordenarNaColuna(grupos: GrupoEmpresa[]): GrupoEmpresa[] {
  return [...grupos].sort((a, b) => {
    const pa = prioridadeDoGrupo(a)
    const pb = prioridadeDoGrupo(b)
    if (pa !== null && pb !== null) return pa - pb
    if (pa !== null) return -1
    if (pb !== null) return 1
    return 0
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   ORDENAR A COLUNA  ·  23/09/2026

   Pedido dele: "a opção de ordenar os cards, por data, ou as últimas análises
   ficam sempre em cima e as mais antigas para baixo. Com opção sutil".

   É UM OLHAR, E NÃO UMA ESCOLHA DO QUADRO. Ordenar não grava nada no banco:
   cada pessoa escolhe como LER a coluna, e a ordem que o Ivan arrastou à mão
   (`prioridade`) continua lá, intacta, para quando a coluna voltar a "Ordem da
   fila". Por isso arrastar e as setas só valem nesse modo: reordenar uma lista
   que está ordenada por data seria mexer numa ordem que a tela não mostra.

   A DATA É A DA ÚLTIMA MOVIMENTAÇÃO da empresa (o evento mais recente da linha
   de processos de qualquer pasta do grupo). Na coluna Pronta é o dia em que a
   análise foi entregue; na Entrada é o dia em que o caso chegou.
   ══════════════════════════════════════════════════════════════════════════ */
export type OrdemColuna = 'fila' | 'recentes' | 'antigos' | 'nome'

export const ORDENS_COLUNA: { id: OrdemColuna; rotulo: string; curto: string; dica: string }[] = [
  { id: 'fila', rotulo: 'Ordem da fila', curto: '', dica: 'A ordem de sempre: os que foram arrastados primeiro, depois o mais parado' },
  { id: 'recentes', rotulo: 'Mais recentes primeiro', curto: 'recentes', dica: 'Quem se mexeu por último fica em cima' },
  { id: 'antigos', rotulo: 'Mais antigos primeiro', curto: 'antigos', dica: 'Quem está há mais tempo sem se mexer fica em cima' },
  { id: 'nome', rotulo: 'Nome, de A a Z', curto: 'A–Z', dica: 'Ordem alfabética pelo nome da empresa' },
]

export const ehOrdemColuna = (v: unknown): v is OrdemColuna =>
  typeof v === 'string' && ORDENS_COLUNA.some((o) => o.id === v)

/** O instante do último movimento da empresa, em milissegundos. Sem data
 *  nenhuma vale 0: vai para o fim em "recentes" e para o começo em "antigos",
 *  que é onde quem não tem data precisa ser visto. */
export function ultimoMovimento(g: GrupoEmpresa): number {
  let max = 0
  for (const f of g.fichas) {
    const t = Date.parse(f.parado_desde || f.atualizado_em || f.criado_em || '')
    if (Number.isFinite(t) && t > max) max = t
  }
  return max
}

/** A coluna na ordem escolhida. `fila` devolve a ordem de sempre. */
export function ordenarPor(grupos: GrupoEmpresa[], modo: OrdemColuna): GrupoEmpresa[] {
  if (modo === 'fila') return ordenarNaColuna(grupos)
  const lista = [...grupos]
  if (modo === 'nome') return lista.sort((a, b) => nomeDoGrupo(a).localeCompare(nomeDoGrupo(b), 'pt-BR', { sensitivity: 'base' }))
  const sinal = modo === 'recentes' ? -1 : 1
  // Data igual (ou nenhuma): desempata pelo nome, para a coluna não pular entre renderizações.
  return lista.sort((a, b) =>
    sinal * (ultimoMovimento(a) - ultimoMovimento(b)) || nomeDoGrupo(a).localeCompare(nomeDoGrupo(b), 'pt-BR', { sensitivity: 'base' }))
}

/** O que gravar depois de arrastar: a coluna inteira renumerada de 1 a N, com
 *  todas as pastas de cada empresa. Renumerar a coluna toda (e não só quem
 *  mexeu) é o que mantém 1, 2, 3 sem buracos e sem empate — dois cards com o
 *  mesmo número seriam duas telas discordando sobre quem vem primeiro. */
export function renumerar(grupos: GrupoEmpresa[]): { ids: string[]; prioridade: number }[] {
  return grupos.map((g, i) => ({ ids: g.fichas.map((f) => f.id), prioridade: i + 1 }))
}

/** Tira um card do lugar e põe em outro, dentro da mesma coluna. Devolve a
 *  coluna na ordem nova, pronta para `renumerar`. */
export function mover(grupos: GrupoEmpresa[], de: number, para: number): GrupoEmpresa[] {
  if (de === para || de < 0 || de >= grupos.length) return grupos
  const destino = Math.max(0, Math.min(grupos.length - 1, para))
  const lista = [...grupos]
  const [card] = lista.splice(de, 1)
  lista.splice(destino, 0, card)
  return lista
}
