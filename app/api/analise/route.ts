import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  try {
    const { mensagem, tomador_id, tomadorNome, documentos = [], historico = [] } = await req.json()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const systemPrompt = await buildServerSystemPrompt(supabase, { tomadorId: tomador_id, tomadorNome })

    const messages: Anthropic.MessageParam[] = [
      ...historico.map((h: { role: string; content: string }) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
    ]

    if (documentos.length > 0) {
      const contentParts: Anthropic.ContentBlockParam[] = documentos.map(
        (doc: { base64: string; mediaType: string; nome: string }) => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: doc.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: doc.base64 },
        })
      )
      contentParts.push({ type: 'text', text: mensagem })
      messages.push({ role: 'user', content: contentParts })
    } else {
      messages.push({ role: 'user', content: mensagem })
    }

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: systemPrompt,
      messages,
    })

    const conteudo = response.content[0].type === 'text' ? response.content[0].text : ''

    if (tomador_id && user) {
      await supabase.from('analise_sessoes').insert({
        tomador_id,
        tipo: 'conversa',
        conteudo,
        criado_por: user.id,
      })
    }

    return NextResponse.json({ resposta: conteudo })
  } catch (err) {
    console.error('[analise/route]', err)
    return NextResponse.json({ erro: 'Erro interno ao processar análise.' }, { status: 500 })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildServerSystemPrompt(supabase: any, { tomadorId, tomadorNome }: { tomadorId?: string; tomadorNome?: string }) {
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: globais }, { data: pessoais }] = await Promise.all([
    supabase.from('fam_skills_global').select('titulo, conteudo').eq('ativo', true).order('criado_em'),
    user
      ? supabase.from('fam_skills_usuario').select('titulo, conteudo').eq('user_id', user.id).eq('ativo', true).order('ordem')
      : Promise.resolve({ data: [] }),
  ])

  const partes: string[] = [
    '=== CONTEXTO FAM SEGURADORA ===',
    'Voce e o assistente de credito da FAM Seguradora. Responda sempre em portugues brasileiro.',
  ]

  if (globais?.length) {
    partes.push('\n=== BASE GLOBAL FAM ===')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globais.forEach((g: any) => partes.push(`--- ${g.titulo} ---\n${g.conteudo}`))
  }

  if (pessoais?.length) {
    partes.push('\n=== SKILLS DO ANALISTA ===')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pessoais.forEach((p: any) => partes.push(`--- ${p.titulo} ---\n${p.conteudo}`))
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

  if (tomadorNome || tomadorId) {
    partes.push('\n=== SESSAO ATUAL ===')
    if (tomadorNome) partes.push(`Tomador: ${tomadorNome}`)
    if (tomadorId) partes.push(`ID: ${tomadorId}`)
  }

  if (tomadorId) {
    const { data: sessoes } = await supabase
      .from('analise_sessoes')
      .select('tipo, conteudo, criado_em')
      .eq('tomador_id', tomadorId)
      .order('criado_em', { ascending: false })
      .limit(5)

    if (sessoes?.length) {
      partes.push('\n=== HISTORICO DO TOMADOR NO CRM ===')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      partes.push(sessoes.map((s: any) => {
        const dt = new Date(s.criado_em).toLocaleDateString('pt-BR')
        const preview = String(s.conteudo).slice(0, 300)
        return `[${s.tipo.toUpperCase()} - ${dt}]: ${preview}...`
      }).join('\n\n'))
    }
  }

  partes.push('\n=== FORMATO DE RESPOSTA ===')
  partes.push('Retorne EXCLUSIVAMENTE JSON valido. Sem texto antes ou apos. Sem markdown. Sem comentarios.')

  return partes.join('\n')
}
