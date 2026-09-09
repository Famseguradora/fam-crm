// ============================================================================
//  O QUE AS ABAS DO CARD COMPARTILHAM
// ============================================================================

import type { FilaRica } from '@/lib/analise/mesa'
import type { FichaAnalise } from '@/lib/analise/ficha'

/** O endereço do Sistema de Análise na máquina dele. Só vira link quando ele
 *  responde (ver `useSistemaLocal`): botão que abre o que não existe é pior
 *  que botão nenhum. */
export const SISTEMA_LOCAL = 'http://127.0.0.1:7311'

export interface Quem {
  nome: string | null
  authId: string | null
  /** escreve no CRM (perfil que não é só leitura) */
  podeEscrever: boolean
  /** é o analista de crédito: autoriza e decide */
  analista: boolean
}

export interface PropsAba {
  f: FilaRica
  ficha: FichaAnalise | null
  quem: Quem
  /** o 127.0.0.1:7311 respondeu nesta máquina */
  local: boolean
  recarregar: () => Promise<void> | void
}

/** A decisão da análise, lida do mesmo jeito que o acervo pinta a etiqueta. */
export function decisaoLimpa(d: string | null | undefined): { txt: string; cor: 'ok' | 'res' | 'nao' | '' } {
  const t = (d ?? '').toLowerCase()
  if (!t.trim()) return { txt: '—', cor: '' }
  if (/condicion|ressalva|restri/.test(t)) return { txt: 'Aprovar com ressalvas', cor: 'res' }
  if (/reprov|recus|negar|indefer|bloqueio/.test(t)) return { txt: /bloqueio/.test(t) ? 'Bloqueio' : 'Reprovar', cor: 'nao' }
  if (/aprovar|aprovad|defer/.test(t)) return { txt: 'Aprovar', cor: 'ok' }
  return { txt: d ?? '—', cor: '' }
}
