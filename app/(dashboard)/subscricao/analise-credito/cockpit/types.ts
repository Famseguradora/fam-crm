export type PainelId = 'analise' | 'perfil' | 'juridico' | 'destaques' | 'dashboard' | 'simulador'

export interface Destaque {
  id: string
  cockpit_id: string
  secao: string | null
  texto: string
  created_at: string
}

export interface Simulacao {
  id: string
  cockpit_id: string
  nome: string
  is_valor: number | null
  taxa: number | null
  comissao: number | null
  vigencia_meses: number | null
  data_inicio: string | null
  ativo: boolean
  created_at: string
}

export interface BookManual {
  id: string
  cockpit_id: string
  tomador_nome: string
  modalidade: string | null
  lmg: number | null
  taxa: number | null
  comissao: number | null
  vigencia_meses: number | null
  data_inicio: string | null
  status: string
  created_at: string
}

export interface CockpitMeta {
  score_fam?: number
  rating?: string
  limite?: number
  recomendacao?: string
  razao_social?: string
  cnpj?: string
  fundacao?: string
  cidade?: string
  setor?: string
  serasa_score?: number
  acoes_judiciais?: number
  protestos?: number
  pefin?: number
  rec_judicial?: boolean
}

export interface AnaliseCockpit {
  id: string
  tomador_id: string
  criado_por: string | null
  html_conteudo: string | null
  meta: CockpitMeta | null
  notas: string | null
  links: Array<{ titulo: string; url: string }> | null
  created_at: string
  updated_at: string
}

export interface Filtros {
  modalidade: string | null
  status: string | null
  periodo: '12m' | '24m' | 'all'
}

export interface OperacaoReal {
  id: string
  tomador_id: string | null
  tomadores: { razao_social: string } | null
  modalidade: string
  lmg: number
  taxa: number
  vigencia_anos: number
  premio_previsto: number
  status: string
  data_entrada: string | null
}

export const C = {
  bg: '#060b18',
  card: '#0d1428',
  card2: '#111d35',
  border: 'rgba(255,255,255,0.08)',
  text: 'rgba(255,255,255,0.85)',
  muted: 'rgba(255,255,255,0.35)',
  accent: '#38bdf8',
  accentBg: 'rgba(56,189,248,0.08)',
  accentBorder: 'rgba(56,189,248,0.2)',
  gold: '#e8b84b',
  goldBg: 'rgba(232,184,75,0.08)',
  goldBorder: 'rgba(232,184,75,0.2)',
  success: '#4ade80',
  successBg: 'rgba(74,222,128,0.08)',
  warning: '#fb923c',
  warningBg: 'rgba(251,146,60,0.08)',
  danger: '#f87171',
  dangerBg: 'rgba(248,113,113,0.08)',
  purple: '#a78bfa',
} as const

export function fmtBRL(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

export function fmtPct(v: number | null | undefined, decimals = 4): string {
  if (v == null) return '—'
  return (v * 100).toFixed(decimals) + '%'
}
