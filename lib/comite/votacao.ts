// ============================================================================
//  Comitê — Lógica de votação ("Julgamento" das operações)
//  Pura (sem React, sem Supabase): recebe votos + membros e calcula o placar
//  e o parecer final. Usada tanto pela tela de Comitê quanto pelo simulador
//  de WhatsApp para manter UMA única fonte de verdade do resultado.
// ============================================================================
import type { ComiteVoto, VotoComite, ParecerFinal, Usuario } from '@/types'

// Metadados de exibição de cada voto (rótulo, cores, emoji). Centralizado para
// que CRM e WhatsApp simulado mostrem exatamente a mesma identidade visual.
export const VOTO_META: Record<VotoComite, { label: string; curto: string; cor: string; bg: string; emoji: string }> = {
  aprovado:          { label: 'Aprovado',              curto: 'Aprovar',  cor: '#1a6a40', bg: '#d4f4e4', emoji: '✅' },
  aprovado_ressalva: { label: 'Aprovado com Ressalva', curto: 'Ressalva', cor: '#9a5a10', bg: '#fdf0d8', emoji: '⚠️' },
  reprovado:         { label: 'Reprovado',             curto: 'Reprovar', cor: '#a02020', bg: '#fbeaea', emoji: '❌' },
}

export const VOTOS_ORDENADOS: VotoComite[] = ['aprovado', 'aprovado_ressalva', 'reprovado']

// Cores do veredito final (banner de resultado).
export const PARECER_META: Record<ParecerFinal, { cor: string; bg: string; emoji: string }> = {
  'Aprovada':              { cor: '#1a6a40', bg: '#d4f4e4', emoji: '🏆' },
  'Aprovada com Ressalva': { cor: '#9a5a10', bg: '#fdf0d8', emoji: '📐' },
  'Reprovada':             { cor: '#a02020', bg: '#fbeaea', emoji: '🚫' },
  'Empate':                { cor: '#4a5a6a', bg: '#eef2f7', emoji: '⚖️' },
}

export interface PlacarComite {
  aprovado: number
  aprovado_ressalva: number
  reprovado: number
  aprovadosTotal: number     // aprovado + aprovado_ressalva (favoráveis)
  total: number              // votos lançados
  totalMembros: number       // diretores habilitados a votar
  pendentes: number          // ainda não votaram
  completo: boolean          // todos os membros votaram
  parecerFinal: ParecerFinal | null  // só quando completo
}

// Membros habilitados a votar: flag `comite` ligada e usuário ativo.
export function membrosComite(usuarios: Usuario[]): Usuario[] {
  return usuarios.filter((u) => u.comite === true && u.status === 'ativo')
}

// "Acompanho o Subscritor": o voto do diretor herda o voto do subscritor.
// Sem voto do subscritor, cai em aprovado (decisão neutra de produto).
export function resolverVotoSeguindo(votoSubscricao: VotoComite | null): VotoComite {
  return votoSubscricao ?? 'aprovado'
}

// Calcula o placar a partir dos votos efetivos dos membros. Considera apenas
// votos de quem ainda é membro (evita "voto fantasma" se a flag foi revogada).
export function calcularPlacar(votos: ComiteVoto[], membros: Usuario[]): PlacarComite {
  const idsMembros = new Set(membros.map((m) => m.id))
  const validos = votos.filter((v) => idsMembros.has(v.usuario_id))

  const c = { aprovado: 0, aprovado_ressalva: 0, reprovado: 0 }
  for (const v of validos) c[v.voto]++

  const total = validos.length
  const totalMembros = membros.length
  const aprovadosTotal = c.aprovado + c.aprovado_ressalva
  const pendentes = Math.max(0, totalMembros - total)
  const completo = totalMembros > 0 && pendentes === 0

  let parecerFinal: ParecerFinal | null = null
  if (completo) {
    if (c.reprovado > aprovadosTotal) parecerFinal = 'Reprovada'
    else if (c.reprovado === aprovadosTotal) parecerFinal = 'Empate'
    else if (c.aprovado_ressalva > 0) parecerFinal = 'Aprovada com Ressalva'
    else parecerFinal = 'Aprovada'
  }

  return { ...c, aprovadosTotal, total, totalMembros, pendentes, completo, parecerFinal }
}

// Quando o parecer final pede ação do subscritor, sugere o destino da operação.
// 'Reprovada'/'Empate' → devolver para análise; aprovações → seguir p/ Aprovado.
export function destinoSugerido(parecer: ParecerFinal | null): { status: string; rotulo: string } | null {
  if (!parecer) return null
  if (parecer === 'Reprovada') return { status: 'Recusado', rotulo: 'Recusar operação' }
  if (parecer === 'Empate') return { status: 'Em Análise', rotulo: 'Devolver para análise' }
  return { status: 'Aprovado', rotulo: 'Aprovar operação' }
}
