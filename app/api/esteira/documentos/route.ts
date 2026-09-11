// ============================================================================
//  GET /api/esteira/documentos?id=<analise_fila>  ·  materializar a pasta
//
//  O caso da Triagem tem os documentos no Storage do CRM. O motor da análise lê
//  ARQUIVO, numa pasta do disco. Alguém tem que fazer a ponte, e esse alguém é
//  o agente do notebook: é ele que está na máquina onde o motor roda.
//
//  Esta rota entrega os endereços assinados para ele baixar. Endereço assinado,
//  e não o arquivo pela rota: um pedido de análise tem 14 anexos e passa de 30
//  MB, e trafegar isso por dentro do Next seria segurar tudo na memória do
//  servidor sem necessidade nenhuma. O Storage entrega direto.
//
//  A ASSINATURA VALE 15 MINUTOS. Tempo de baixar, e não mais: um endereço
//  assinado é uma porta aberta para o arquivo, e porta aberta tem que fechar.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const BUCKET = 'fam-anexos'
const VALE_SEGUNDOS = 15 * 60

export async function GET(req: NextRequest) {
  const segredo = process.env.CARTEIRO_TOKEN || process.env.ANALISE_EVENTO_TOKEN || ''
  if (!segredo) return NextResponse.json({ erro: 'Rota não configurada (CARTEIRO_TOKEN).' }, { status: 503 })
  if (req.headers.get('x-carteiro-token') !== segredo) {
    return NextResponse.json({ erro: 'Segredo inválido.' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 503 })
  const sb = createClient(url, chave, { auth: { persistSession: false } })

  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ erro: 'Falta dizer qual análise.' }, { status: 422 })

  const { data: fila } = await sb
    .from('analise_fila')
    .select('id, pasta, caso_id, tomador_id, cnpj, razao_social')
    .eq('id', id)
    .maybeSingle()
  if (!fila) return NextResponse.json({ erro: 'Análise não está na fila.' }, { status: 404 })

  /* OS DOCUMENTOS PODEM ESTAR EM DOIS LUGARES, e é preciso olhar os dois.
     Enquanto a triagem não conclui, eles estão pendurados no CASO. Ao concluir,
     a rota `concluir` os passa para o TOMADOR, para o CRM não ter duas pilhas
     de documento da mesma empresa. Uma análise nascida da triagem já passou por
     essa mudança, então procurar só pelo caso devolveria zero arquivo. */
  const alvos: { tipo: string; id: string }[] = []
  if (fila.tomador_id) alvos.push({ tipo: 'tomador', id: fila.tomador_id })
  if (fila.caso_id) alvos.push({ tipo: 'caso', id: fila.caso_id })

  const vistos = new Set<string>()
  const documentos: { nome: string; url: string; bytes: number | null }[] = []
  const falhas: string[] = []

  for (const alvo of alvos) {
    const { data: anexos } = await sb
      .from('anexos')
      .select('id, nome_original, storage_path, tamanho_bytes')
      .eq('entidade_tipo', alvo.tipo)
      .eq('entidade_id', alvo.id)
    for (const a of anexos ?? []) {
      // O mesmo arquivo pode aparecer pelas duas pontas; baixar duas vezes
      // criaria documento repetido na pasta, e o hash do conjunto mudaria à toa.
      if (!a.storage_path || vistos.has(a.storage_path)) continue
      vistos.add(a.storage_path)
      const { data: assinado, error } = await sb.storage
        .from(BUCKET).createSignedUrl(a.storage_path, VALE_SEGUNDOS)
      if (error || !assinado?.signedUrl) {
        falhas.push(`${a.nome_original} (${error?.message ?? 'sem endereço'})`)
        continue
      }
      documentos.push({
        nome: a.nome_original,
        url: assinado.signedUrl,
        bytes: a.tamanho_bytes ?? null,
      })
    }
  }

  /* O PRÓPRIO E-MAIL VAI PARA A PASTA (10/09/2026). Ordem do Marco: a triagem
     "vai LER O E-MAIL". O .msg ficava só no Storage (`casos.email_storage_path`,
     sem linha em `anexos`), e a pasta recebia os anexos soltos, sem o corpo:
     corretora, produto e as condições que o comercial escreveu nunca chegavam.
     Com o .msg na pasta, o `ler-emails.mjs` do motor escreve o corpo como
     documento e abre os e-mails que vierem embutidos. Anexo repetido não pesa:
     a extração marca a cópia idêntica como duplicata. */
  if (fila.caso_id) {
    const { data: caso } = await sb
      .from('casos').select('numero, email_storage_path').eq('id', fila.caso_id).maybeSingle()
    const caminho = caso?.email_storage_path
    if (caminho && !vistos.has(caminho)) {
      vistos.add(caminho)
      const { data: assinado } = await sb.storage.from(BUCKET).createSignedUrl(caminho, VALE_SEGUNDOS)
      if (assinado?.signedUrl) {
        const ext = caminho.toLowerCase().endsWith('.eml') ? '.eml' : '.msg'
        documentos.push({ nome: `E-mail original do caso ${caso.numero}${ext}`, url: assinado.signedUrl, bytes: null })
      } else {
        falhas.push('o próprio e-mail (sem endereço assinado)')
      }
    }
  }

  return NextResponse.json({
    ok: true,
    pasta: fila.pasta,
    cnpj: fila.cnpj,
    razao_social: fila.razao_social,
    documentos,
    falhas,
    vale_ate: new Date(Date.now() + VALE_SEGUNDOS * 1000).toISOString(),
  })
}
