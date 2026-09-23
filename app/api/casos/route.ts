// ============================================================================
//  POST /api/casos  — a ESTRADA REDUNDANTE: alguém sobe o e-mail à mão
//  GET  /api/casos  — a fila de casos
//
//  A estrada principal é a Caixa de entrada (o Carteiro lê o Outlook na máquina
//  do Comercial e a pessoa escolhe o e-mail na tela do CRM). Esta rota é a
//  saída de emergência que mantém a empresa andando quando aquela máquina
//  estiver parada: de qualquer lugar, com o navegador, arrastando o .msg/.eml.
//
//  A REGRA DE ABRIR O CASO NÃO MORA AQUI. Ela está em
//  `lib/casos/abrir-por-email.ts`, e é a MESMA que o Carteiro usa. Duas
//  estradas, uma regra: senão, no terceiro mês, o caso nascido por um caminho
//  teria um checklist e o nascido pelo outro teria outro.
//
//  Sessão, não segredo: diferente das rotas do motor (`/api/analise/*`), esta é
//  chamada pelo navegador de uma pessoa logada, então a trava é a RLS.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { abrirCasoPorEmail, MAX_BYTES_EMAIL } from '@/lib/casos/abrir-por-email'
import { ehEmail } from '@/lib/email/ler-email'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 })

  const { data, error } = await supabase
    .from('casos')
    .select('id, numero, assunto, remetente_nome, remetente_email, recebido_em, cnpj, razao_social, etapa, criado_em, criado_por_nome, tomador_id')
    .order('criado_em', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json({ casos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const form = await req.formData()
  const arquivo = form.get('email')
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ erro: 'Nenhum e-mail foi enviado.' }, { status: 400 })
  }
  /* O TAMANHO SE CONFERE ANTES DE LER O CORPO. O conteúdo é quem diz se é
     e-mail (23/09/2026), e para olhar o conteúdo é preciso carregá-lo na
     memória — não vale carregar 400 MB para então recusar. */
  if (arquivo.size > MAX_BYTES_EMAIL) {
    return NextResponse.json(
      { erro: `E-mail de ${(arquivo.size / 1024 / 1024).toFixed(1)} MB. O limite é 50 MB.` },
      { status: 400 },
    )
  }

  const bruto = Buffer.from(await arquivo.arrayBuffer())

  /* O NOME É PISTA, O CONTEÚDO É PROVA. O e-mail arrastado direto do Outlook
     chega com o nome que o Windows inventou na hora, às vezes sem extensão
     nenhuma; recusar por causa disso era recusar um e-mail inteiro. */
  if (!ehEmail(arquivo.name, bruto)) {
    return NextResponse.json(
      { erro: `"${arquivo.name}" não é um e-mail. Arraste o e-mail do Outlook (.msg) ou o arquivo .eml.` },
      { status: 400 },
    )
  }

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()

  const recibo = await abrirCasoPorEmail(supabase, {
    bruto,
    nomeArquivo: arquivo.name,
    autor: { auth_id: user.id, nome: quem?.nome ?? user.email ?? null },
  })

  if (!recibo.ok) {
    return NextResponse.json({ erro: recibo.erro }, { status: recibo.erro?.includes('permissão') ? 403 : 422 })
  }

  // E-mail repetido não é erro: é informação. A tela leva quem subiu direto ao
  // caso que já existe, em vez de deixar a pessoa achando que não funcionou.
  if (recibo.ja_existia) {
    return NextResponse.json({ ok: true, ja_existia: true, caso: recibo.caso, documentos: 0, ignorados: 0, falhas: [] })
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
