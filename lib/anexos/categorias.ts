// ============================================================================
//  Anexos — Categorias de documento
//  Antes, "a análise de crédito" era o anexo mais recente do tomador e torcia-se
//  para estar certo. Agora a categoria é declarada no upload, o que permite
//  buscar o documento certo com precisão (cédula do Comitê, WhatsApp, CRM).
//  Puro: sem React e sem Supabase — usável no client e no server.
// ============================================================================
import type { Anexo, CategoriaAnexo } from '@/types'

export const CATEGORIA_META: Record<CategoriaAnexo, { label: string; curto: string; emoji: string; cor: string; bg: string }> = {
  analise_credito:    { label: 'Análise de Crédito',    curto: 'Crédito',    emoji: '📊', cor: '#1e4080', bg: '#e8f0fc' },
  analise_subscricao: { label: 'Análise de Subscrição', curto: 'Subscrição', emoji: '🖋️', cor: '#7a3fa0', bg: '#f4ebfb' },
  outro:              { label: 'Outro documento',       curto: 'Outro',      emoji: '📄', cor: '#4a6a8a', bg: '#f0f4f8' },
}

export const CATEGORIAS_ORDENADAS: CategoriaAnexo[] = ['analise_credito', 'analise_subscricao', 'outro']

// Mesma regra do backfill da migração `comite_voto_por_link`: sugere a categoria
// pelo nome do arquivo, sem acento e sem case. O usuário sempre pode trocar.
export function sugerirCategoria(nomeArquivo: string): CategoriaAnexo {
  // NFD + remoção das marcas de combinação (\p{M}) tira o acento sem tabela.
  const n = nomeArquivo
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  if (n.includes('subscricao')) return 'analise_subscricao'
  if (n.includes('analise') && n.includes('credito')) return 'analise_credito'
  return 'outro'
}

// Documento vigente de uma categoria: o mais recente vence. Reupload ("v2",
// "corrigida") é um caso real, então não travamos em um por operação.
export function anexoVigente(anexos: Anexo[], categoria: CategoriaAnexo): Anexo | null {
  return (
    anexos
      .filter((a) => a.categoria === categoria)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  )
}
