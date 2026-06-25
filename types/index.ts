export type Perfil = 'admin' | 'usuario'
export type StatusUsuario = 'ativo' | 'inativo'
export type Temperatura = 'Quente' | 'Morno' | 'Frio'
export type Porte = 'Small' | 'Middle' | 'Corporate' | 'Large'
export type Prioridade = 'Fluxo Normal' | 'Prioridade' | 'Urgente'

export interface StatusFluxo {
  id: string
  nome: string
  cor: string
  base: boolean
  ordem: number
  ativo: boolean
  created_at: string
}

export interface Usuario {
  id: string
  auth_id: string | null
  nome: string
  email: string
  telefone: string | null
  cargo: string | null
  perfil: Perfil
  status: StatusUsuario
  primeiro_acesso: boolean
  pode_publicar_avisos: boolean
  // Comitê: membro votante do "Julgamento" das operações. Quando true e há
  // telefone cadastrado, o diretor recebe o convite de votação no WhatsApp.
  comite: boolean
  created_at: string
  updated_at: string
}

export type TipoAviso = 'parabens' | 'info' | 'alerta'

export interface Aviso {
  id: string
  mensagem: string
  tipo: TipoAviso
  ativo: boolean
  expira_em: string
  criado_por_auth_id: string | null
  criado_por_nome: string | null
  criado_em: string
  atualizado_em: string | null
}

export interface Produto {
  id: string
  nome: string
  codigo: string | null
  descricao: string | null
  status: 'ativo' | 'inativo'
  created_at: string
  updated_at: string
}

export interface Modalidade {
  id: string
  nome: string
  codigo_cobertura: string | null
  produto_id: string | null
  produto?: Produto
  grupo: string | null
  observacao: string | null
  status: 'ativo' | 'inativo'
  created_at: string
  updated_at: string
}

export interface Corretora {
  id: string
  razao_social: string
  nome_fantasia: string | null
  cnpj: string
  codigo_susep: string | null
  email: string | null
  telefone: string | null
  celular: string | null
  cep: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  responsavel: string | null
  observacao: string | null
  status: 'ativo' | 'inativo'
  created_at: string
  updated_at: string
}

export interface Tomador {
  id: string
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  corretora_id: string | null
  corretora?: Corretora
  email: string | null
  telefone: string | null
  celular: string | null
  cep: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  responsavel: string | null
  porte: Porte | null
  prioridade: string | null
  limite_aprovado: number | null
  observacao: string | null
  status: string
  ativo: boolean
  data_entrada: string | null
  created_at: string
  updated_at: string
}

export interface Operacao {
  id: string
  tomador_id: string | null
  tomador?: Tomador
  corretora_id: string | null
  corretora?: Corretora
  corretor: string | null
  produto_id: string | null
  produto?: Produto
  modalidade: string | null
  codigo_cobertura: string | null
  estado: string | null
  temperatura: Temperatura | null
  prioridade: Prioridade | null
  lmg: number | null
  taxa: number | null
  vigencia_anos: number | null
  vigencia_dias: number | null
  periodicidade_vigencia: string | null
  premio_previsto: number | null
  observacao: string | null
  status: string
  ativo: boolean
  data_entrada: string | null
  data_emissao: string | null
  comite_notas: string | null
  comite_data: string | null
  comite_decisao: string | null
  comite_variacao_taxa: number | null
  comite_variacao_taxa_just: string | null
  comite_variacao_lmg: number | null
  comite_variacao_lmg_just: string | null
  // ── Julgamento do Comitê (parecer da subscrição + veredito final) ──
  parecer_subscricao: string | null
  voto_subscricao: VotoComite | null
  subscritor_nome: string | null
  comite_enviado_whatsapp: boolean
  comite_parecer_final: ParecerFinal | null
  comite_encerrado: boolean
  // Pedido de vista: pausa a deliberação até ser retomada (estilo STF).
  comite_vista_por: string | null
  comite_vista_cargo: string | null
  comite_vista_justificativa: string | null
  created_at: string
  updated_at: string
}

// Sócio do organograma societário de um tomador (árvore de profundidade livre).
// tomador_id aponta sempre para a raiz; parent_socio_id NULL = sócio direto do tomador.
export interface Socio {
  id: string
  tomador_id: string
  parent_socio_id: string | null
  nome_razao_social: string
  documento: string | null
  tipo_pessoa: 'PF' | 'PJ' | null
  percentual: number | null
  categoria: 'socio' | 'diretor'
  cargo: string | null
  ordem: number
  ativo: boolean
  created_at: string
  updated_at: string
}

// Nó da árvore montada em memória (Socio + filhos recursivos)
export interface SocioNode extends Socio {
  filhos: SocioNode[]
}

export interface MetaNegocio {
  id: string
  periodo: string
  tipo: 'mensal' | 'anual'
  premio_meta: number | null
  lmg_meta: number | null
  taxa_media_ponderada_meta: number | null
  qtd_operacoes_meta: number | null
  risco_judicial: number | null
  sinistralidade_aceitavel: number | null
  observacao: string | null
  criado_por: string | null
  created_at: string
  updated_at: string
}

export interface ComiteComentario {
  id: string
  operacao_id: string
  autor: string
  comentario: string
  tipo: 'geral' | 'restricao' | 'condicao' | 'aprovacao' | 'negacao'
  created_at: string
}

export interface Anexo {
  id: string
  entidade_tipo: 'tomador' | 'operacao' | 'corretora'
  entidade_id: string
  tomador_id?: string | null
  nome_original: string
  storage_path: string
  tipo_mime: string | null
  tamanho_bytes: number | null
  created_at: string
}

export interface DashboardConfig {
  id: string
  usuario_id: string
  grafico_key: string
  habilitado: boolean
  posicao: number
}

// ── Comitê — "Julgamento" das operações ──────────────────────────────────────
// Voto possível de subscritor e diretores. Espelha os status de qualificação.
export type VotoComite = 'aprovado' | 'aprovado_ressalva' | 'reprovado'

// Veredito agregado da bancada após todos votarem.
export type ParecerFinal = 'Aprovada' | 'Aprovada com Ressalva' | 'Reprovada' | 'Empate'

// Voto de um diretor numa operação em Comitê. Um voto por (operacao, usuario);
// re-voto é UPDATE. `canal` distingue voto pelo CRM x pelo WhatsApp (simulado).
export interface ComiteVoto {
  id: string
  operacao_id: string
  usuario_id: string
  autor: string                 // nome do diretor (desnormalizado p/ exibição)
  cargo: string | null
  voto: VotoComite
  segue_subscritor: boolean      // "Acompanho o Subscritor"
  argumentacao: string | null
  canal: 'crm' | 'whatsapp'
  created_at: string
  updated_at: string
}

// Voto ANTERIOR arquivado quando um diretor retrata/altera o seu voto.
// O voto vigente continua em `comite_votos`; cada retratação empilha aqui.
export interface ComiteVotoHistorico {
  id: string
  operacao_id: string
  usuario_id: string
  autor: string
  cargo: string | null
  voto: VotoComite
  segue_subscritor: boolean
  argumentacao: string | null
  canal: 'crm' | 'whatsapp'
  votado_em: string | null       // created_at original do voto retratado
  retratado_em: string           // quando o diretor retratou
}
