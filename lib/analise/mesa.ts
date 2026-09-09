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
  instrucao: string | null
  modo: string | null
  arquivos_fora: string[]
  arquivos_fora_em: string | null
  arquivada: boolean
  sincronizado_em: string | null
  ultima_ordem_resultado: string | null
  ultima_ordem_em: string | null
}

export const COLUNAS_FILA = `
  id, caso_id, analise_id, tomador_id, cnpj, cnpj_confiavel, razao_social, chave_local, pasta,
  situacao, motivo, etapa, etapa_texto, etapa_em, documentos, documentos_faltando, hash_documentos,
  trava_maquina, trava_em, ordem, ordem_por, ordem_em, ordem_dados, erro, criado_em, criado_por,
  concluido_em, atualizado_em, chave, fase, nome, corretora, produto, docs, cadastro, arquivos,
  biblioteca, linha, parado_desde, analise_chave, substatus, substatus_por, substatus_em,
  instrucao, modo, arquivos_fora, arquivos_fora_em, arquivada, sincronizado_em,
  ultima_ordem_resultado, ultima_ordem_em
`

/** As colunas leves, para a Mesa: sem arquivos e biblioteca, que pesam. A
 *  linha de processos vai, porque o cartão mostra o último evento dela. */
export const COLUNAS_MESA = `
  id, caso_id, analise_id, tomador_id, cnpj, cnpj_confiavel, razao_social, chave_local, pasta,
  situacao, motivo, etapa, etapa_texto, etapa_em, documentos, documentos_faltando, hash_documentos,
  trava_maquina, trava_em, ordem, ordem_por, ordem_em, ordem_dados, erro, criado_em, criado_por,
  concluido_em, atualizado_em, chave, fase, nome, corretora, produto, docs, cadastro, linha,
  parado_desde, analise_chave, substatus, substatus_por, substatus_em, instrucao, modo,
  arquivos_fora, arquivos_fora_em, arquivada, sincronizado_em, ultima_ordem_resultado, ultima_ordem_em
`

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
export const CORES_SELO = ['#2E6DB4', '#2F8F6B', '#A8762B', '#8B4A9C', '#B5484A', '#3E7A8C', '#7A6BC4', '#8C6239']

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
