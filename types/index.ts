export type Perfil = 'admin' | 'usuario'
export type StatusUsuario = 'ativo' | 'inativo'

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
  descricao: string | null
  status: 'ativo' | 'inativo'
  created_at: string
  updated_at: string
}

export interface Corretora {
  id: string
  razao_social: string
  cnpj: string
  telefone: string | null
  email: string | null
  cidade: string | null
  estado: string | null
  status: 'ativo' | 'inativo'
  created_at: string
  updated_at: string
}

export type StatusTomador =
  | 'Aguardando Análise'
  | 'Análise Criada'
  | 'Análise Recusada'
  | 'Não Cadastrada'
  | 'Ativo - Cadastrado'
  | 'Documento Crédito - Criado'
  | 'Contrato de Contragarantia - Gerado'
  | 'Contrato de Contragarantia - Formalizada'
  | 'Contrato de Contragarantia - Formalizada Eletronicamente'
  | 'Contrato de Contragarantia - Não Formalizada'
  | 'Envelope de Assinatura - Assinado Manualmente'

export interface Tomador {
  id: string
  razao_social: string
  cnpj: string
  corretora_id: string | null
  corretora?: Corretora
  cidade: string | null
  estado: string | null
  limite_aprovado: number | null
  status: StatusTomador
  ativo: boolean
  created_at: string
  updated_at: string
}

export type StatusOperacao =
  | 'Em Análise'
  | 'Para Analisar'
  | 'Aprovada Com Comitê'
  | 'Aprovada Aguardando Comitê'
  | 'Aguardando Subscrição'
  | 'Em Subscrição'
  | 'Aprovado'
  | 'Aprovado Com Ressalvas'
  | 'Reprovado'
  | 'Negado'
  | 'Standby'
  | 'Fechado'
  | 'Perdido'

export type Temperatura = 'Quente' | 'Frio'

export interface Operacao {
  id: string
  tomador_id: string | null
  tomador?: Tomador
  corretora_id: string | null
  corretora?: Corretora
  corretor: string | null
  produto_id: string | null
  produto?: Produto
  modalidade: string
  estado: string | null
  temperatura: Temperatura | null
  lmg: number
  taxa: number
  vigencia_anos: number
  premio_previsto: number
  status: StatusOperacao
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface DashboardConfig {
  id: string
  usuario_id: string
  grafico_key: string
  habilitado: boolean
  posicao: number
}
