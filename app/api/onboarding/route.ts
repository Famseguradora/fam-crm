import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  try {
    const { respostas } = await req.json() as { respostas: Record<string, string> }

    const linhas = Object.entries(respostas)
      .map(([campo, resposta]) => `${campo}: ${resposta}`)
      .join('\n')

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Com base nas respostas do analista abaixo, escreva UM parágrafo conciso (máximo 5 linhas) em terceira pessoa descrevendo o perfil desse analista de crédito para uso em system prompts de IA. Inclua: nome, cargo, empresa, perfil (conservador/moderado/arrojado), setores de expertise e cautela, indicador crítico, regras pessoais e preferência de detalhe. Seja direto e informativo. Responda APENAS o parágrafo, sem introdução nem formatação.\n\nRespostas:\n${linhas}`,
      }],
    })

    const contexto_ia = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    return NextResponse.json({ contexto_ia })
  } catch (err) {
    console.error('[onboarding/route]', err)
    return NextResponse.json({ erro: 'Erro ao gerar contexto.' }, { status: 500 })
  }
}
