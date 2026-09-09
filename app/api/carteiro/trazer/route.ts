// ============================================================================
//  POST /api/carteiro/trazer  ·  a máquina entrega o e-mail que a tela pediu
//
//  O CAMINHO INTEIRO DE UM CLIQUE EM "TRAZER":
//
//     tela do CRM   marca o e-mail como 'a_trazer'        (é só uma intenção)
//     Carteiro      vê no GET /api/carteiro, salva o .msg  (na máquina dele)
//     Carteiro      sobe o .msg aqui                       (esta rota)
//     CRM           abre o caso com a MESMA regra do upload
//
//  Por que o clique não traz na hora: o CRM nunca busca dado em 127.0.0.1 para
//  preencher tela dele. Essa regra não muda. O preço é que o Trazer leva alguns
//  segundos em vez de ser instantâneo, e a tela diz isso em vez de fingir.
//
//  Se a máquina estiver parada, o e-mail fica pendente e visível na tela: a
//  pessoa vê que está parado e usa a estrada redundante (arrastar o arquivo).
//  Ficar pendente à vista é melhor do que falhar calado.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { abrirCasoPorEmail, MAX_BYTES_EMAIL } from '@/lib/casos/abrir-por-email'
import { ehArquivoDeEmail } from '@/lib/email/ler-email'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const segredo = process.env.CARTEIRO_TOKEN || process.env.ANALISE_EVENTO_TOKEN || ''
  if (!segredo) return NextResponse.json({ erro: 'Rota não configurada (CARTEIRO_TOKEN).' }, { status: 503 })
  if (req.headers.get('x-carteiro-token') !== segredo) {
    return NextResponse.json({ erro: 'Segredo inválido.' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 503 })
  const sb = createClient(url, chave, { auth: { persistSession: false } })

  const form = await req.formData()
  const arquivo = form.get('email')
  const caixaId = String(form.get('id') ?? '')
  const quem = String(form.get('por') ?? '') || 'Carteiro'

  if (!caixaId) return NextResponse.json({ erro: 'Falta dizer de qual e-mail da caixa.' }, { status: 422 })
  if (!(arquivo instanceof File)) return NextResponse.json({ erro: 'Nenhum arquivo veio.' }, { status: 400 })
  if (!ehArquivoDeEmail(arquivo.name)) {
    return NextResponse.json({ erro: `"${arquivo.name}" não é .msg nem .eml.` }, { status: 400 })
  }
  if (arquivo.size > MAX_BYTES_EMAIL) {
    return NextResponse.json(
      { erro: `E-mail de ${(arquivo.size / 1024 / 1024).toFixed(1)} MB. O limite é 50 MB.` },
      { status: 413 },
    )
  }

  /* A LINHA TEM QUE ESTAR PEDINDO. Sem esta conferência, quem tivesse o segredo
     poderia abrir caso para qualquer e-mail sem ninguém ter clicado em nada, e
     a esteira encheria por fora da decisão de uma pessoa. */
  const { data: linha } = await sb
    .from('emails_caixa')
    .select('id, estado, caso_id, assunto')
    .eq('id', caixaId)
    .maybeSingle()
  if (!linha) return NextResponse.json({ erro: 'E-mail não está na caixa.' }, { status: 404 })
  if (linha.caso_id) {
    return NextResponse.json({ ok: true, ja_existia: true, caso_id: linha.caso_id })
  }
  if (linha.estado !== 'a_trazer') {
    return NextResponse.json({ erro: `Ninguém pediu para trazer este e-mail (está "${linha.estado}").` }, { status: 409 })
  }

  const recibo = await abrirCasoPorEmail(sb, {
    bruto: Buffer.from(await arquivo.arrayBuffer()),
    nomeArquivo: arquivo.name,
    autor: { auth_id: null, nome: quem },
    emailCaixaId: caixaId,
  })

  /* FALHOU DEPOIS DE A PESSOA TER CLICADO: o e-mail volta a aparecer, com o
     motivo escrito. Deixá-lo em 'a_trazer' faria a máquina tentar de novo para
     sempre; deixá-lo 'novo' calado esconderia que alguma coisa deu errado. */
  if (!recibo.ok) {
    await sb
      .from('emails_caixa')
      .update({
        estado: 'erro',
        estado_em: new Date().toISOString(),
        estado_erro: (recibo.erro ?? 'Não consegui abrir o caso.').slice(0, 500),
      })
      .eq('id', caixaId)
    return NextResponse.json({ erro: recibo.erro }, { status: 422 })
  }

  return NextResponse.json({
    ok: true,
    caso: recibo.caso,
    documentos: recibo.documentos,
    ignorados: recibo.ignorados,
    falhas: recibo.falhas,
    checklist: recibo.checklist,
  })
}
