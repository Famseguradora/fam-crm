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
  created_at: string
  updated_at: string
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
  periodicidade_vigencia: string | null
  premio_previsto: number | null
  observacao: string | null
  status: string
  ativo: boolean
  data_entrada: string | null
  comite_notas: string | null
  comite_analista: string | null
  comite_data: string | null
  comite_decisao: string | null
  created_at: string
  updated_at: string
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
