import { createClient } from '@/lib/supabase/client'

interface SystemPromptOptions {
  tomadorId?: string
  tomadorNome?: string
  operacaoValor?: string
  incluirContextoCRM?: boolean
}

export async function buildSystemPrompt(options: SystemPromptOptions = {}): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: globais }, { data: pessoais }] = await Promise.all([
    supabase.from('fam_skills_global').select('titulo, conteudo').eq('ativo', true).order('criado_em'),
    user
      ? supabase.from('fam_skills_usuario').select('titulo, conteudo').eq('user_id', user.id).eq('ativo', true).order('ordem')
      : Promise.resolve({ data: [] }),
  ])

  const partes: string[] = []

  partes.push('=== CONTEXTO FAM SEGURADORA ===')
  partes.push('Voce e o assistente de credito da FAM Seguradora. Responda sempre em portugues brasileiro.')

  if (globais && globais.length > 0) {
    partes.push('\n=== BASE GLOBAL FAM ===')
    globais.forEach((g: { titulo: string; conteudo: string }) => {
      partes.push(`--- ${g.titulo} ---\n${g.conteudo}`)
    })
  }

  if (pessoais && pessoais.length > 0) {
    partes.push('\n=== SKILLS DO ANALISTA ===')
    pessoais.forEach((p: { titulo: string; conteudo: string }) => {
      partes.push(`--- ${p.titulo} ---\n${p.conteudo}`)
    })
  }

  if (user) {
    const { data: perfil } = await supabase
      .from('user_profiles')
      .select('contexto_ia')
      .eq('user_id', user.id)
      .single()
    if (perfil?.contexto_ia) {
      partes.push('\n=== PERFIL DO ANALISTA ===')
      partes.push(perfil.contexto_ia)
    }
  }

  if (options.tomadorNome || options.tomadorId) {
    partes.push('\n=== SESSAO ATUAL ===')
    if (options.tomadorNome) partes.push(`Tomador: ${options.tomadorNome}`)
    if (options.tomadorId) partes.push(`ID: ${options.tomadorId}`)
    if (options.operacaoValor) partes.push(`Valor da operacao: ${options.operacaoValor}`)
  }

  if (options.incluirContextoCRM && options.tomadorId) {
    const contexto = await buscarContextoCRM(supabase, options.tomadorId)
    if (contexto) {
      partes.push('\n=== HISTORICO DO TOMADOR NO CRM ===')
      partes.push(contexto)
    }
  }

  partes.push('\n=== FORMATO DE RESPOSTA ===')
  partes.push('Retorne EXCLUSIVAMENTE JSON valido. Sem texto antes ou apos. Sem markdown. Sem comentarios.')

  return partes.join('\n')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buscarContextoCRM(supabase: any, tomadorId: string): Promise<string | null> {
  const { data } = await supabase
    .from('analise_sessoes')
    .select('tipo, conteudo, criado_em')
    .eq('tomador_id', tomadorId)
    .order('criado_em', { ascending: false })
    .limit(5)

  if (!data || data.length === 0) return null

  return data.map((s: { tipo: string; criado_em: string; conteudo: string }) => {
    const dt = new Date(s.criado_em).toLocaleDateString('pt-BR')
    const preview = typeof s.conteudo === 'string' ? s.conteudo.slice(0, 300) : JSON.stringify(s.conteudo).slice(0, 300)
    return `[${s.tipo.toUpperCase()} - ${dt}]: ${preview}...`
  }).join('\n\n')
}
