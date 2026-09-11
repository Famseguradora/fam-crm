// ============================================================================
//  POST /api/casos/<id>/documentos  ·  anexar o Serasa e o que faltou, à mão
//
//  Até 08/09/2026 só entrava documento no caso se ele tivesse vindo dentro do
//  e-mail. Na vida real o Serasa e o balanço chegam DEPOIS, num segundo e-mail
//  ou por WhatsApp, e a triagem ficava parada esperando um caminho que não
//  existia — ou a pessoa saía do CRM para resolver, que é o que estamos
//  desfazendo.
//
//  O arquivo entra pelo MESMO lugar de sempre: Storage `fam-anexos`, linha em
//  `anexos`, leitura em `caso_documentos`. Nada de segunda pilha.
//
//  E O CHECKLIST CAI SOZINHO. Subiu o Serasa, o item "Serasa do tomador" vira
//  'ok' na hora, marcado como `humano` (foi uma pessoa que escolheu a classe).
//  Item que a pessoa já tinha decidido à mão nunca é mexido: a regra do
//  `caso_itens` é que decisão humana não se desfaz sozinha.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mimePorNome } from '@/lib/anexos/mime'

export const runtime = 'nodejs'

const BUCKET = 'fam-anexos'
const MAX_BYTES = 50 * 1024 * 1024
const nomeSeguro = (n: string) => n.replace(/[^a-zA-Z0-9._\-]/g, '_')

const CLASSES = [
  'contabil', 'serasa_pj', 'serasa_pf', 'contrato_social',
  'acordo_socios', 'cartao_cnpj', 'outro',
] as const

/* Qual item do checklist cada classe de documento resolve. É o mesmo de-para
   que o nome do anexo já fazia em `lib/casos/checklist.ts`, só que agora vindo
   de uma escolha explícita da pessoa, que vale mais do que o palpite do nome. */
const RESOLVE: Record<string, string[]> = {
  serasa_pj: ['serasa_pj'],
  contabil: ['demonstracoes_2_exercicios', 'demonstracao_ano_corrente'],
  contrato_social: ['contrato_social'],
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const { data: caso } = await supabase
    .from('casos')
    .select('id, numero, etapa, tomador_id')
    .eq('id', id)
    .maybeSingle()
  if (!caso) return NextResponse.json({ erro: 'Caso não encontrado.' }, { status: 404 })

  const form = await req.formData()
  const classe = String(form.get('classe') ?? 'outro')
  if (!CLASSES.includes(classe as (typeof CLASSES)[number])) {
    return NextResponse.json({ erro: `Tipo de documento desconhecido: "${classe}".` }, { status: 422 })
  }
  const arquivos = form.getAll('arquivo').filter((a): a is File => a instanceof File)
  if (!arquivos.length) return NextResponse.json({ erro: 'Nenhum arquivo veio.' }, { status: 400 })

  /* O DOCUMENTO SEGUE O CASO. Enquanto a triagem não concluiu, ele é do caso;
     depois de concluída, o `concluir` já passou tudo para o tomador, e um
     arquivo novo tem que nascer direto na ficha dele — senão ficaria pendurado
     num caso que ninguém abre mais e sumiria da vista. */
  const jaNoTomador = caso.etapa === 'analise' && !!caso.tomador_id
  const entidade = jaNoTomador
    ? { tipo: 'tomador', id: caso.tomador_id as string }
    : { tipo: 'caso', id: caso.id }

  const entraram: { id: string; nome: string }[] = []
  const falhas: string[] = []

  for (const arquivo of arquivos) {
    if (arquivo.size > MAX_BYTES) {
      falhas.push(`${arquivo.name} tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB (o limite é 50 MB)`)
      continue
    }

    const mime = mimePorNome(arquivo.name)
    const caminho = `${entidade.tipo}/${entidade.id}/${Date.now()}_${nomeSeguro(arquivo.name)}`
    const bytes = Buffer.from(await arquivo.arrayBuffer())

    const { error: erroUp } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, bytes, { upsert: false, contentType: mime })
    if (erroUp) { falhas.push(`${arquivo.name} (${erroUp.message})`); continue }

    const { data: anexo, error: erroAnexo } = await supabase
      .from('anexos')
      .insert({
        entidade_tipo: entidade.tipo,
        entidade_id: entidade.id,
        tomador_id: jaNoTomador ? caso.tomador_id : null,
        nome_original: arquivo.name,
        storage_path: caminho,
        tipo_mime: mime,
        tamanho_bytes: bytes.length,
        categoria: 'outro',
      })
      .select('id')
      .single()

    if (erroAnexo || !anexo) {
      // Arquivo sem linha no banco é arquivo órfão: desfaz o upload.
      await supabase.storage.from(BUCKET).remove([caminho])
      falhas.push(`${arquivo.name} (${erroAnexo?.message ?? 'sem permissão de escrita'})`)
      continue
    }

    const { data: leitura, error: erroLeitura } = await supabase
      .from('caso_documentos')
      .insert({
        caso_id: caso.id,
        anexo_id: anexo.id,
        nome: arquivo.name,
        bytes: bytes.length,
        classe,
        certeza: 'alta',
        classificado_por: 'humano',
        detalhe: 'Anexado à mão na Triagem.',
      })
      .select('id')
      .single()

    if (erroLeitura || !leitura) {
      falhas.push(`${arquivo.name} (guardado, mas não entrou na triagem: ${erroLeitura?.message ?? 'sem permissão'})`)
      continue
    }
    entraram.push({ id: leitura.id, nome: arquivo.name })
  }

  /* O checklist só cai se algum arquivo entrou de verdade. Marcar o item com o
     upload falhado diria que o Serasa chegou quando ele não chegou. */
  let itensOk: string[] = []
  const alvos = RESOLVE[classe] ?? []
  if (entraram.length && alvos.length) {
    const { data: mexidos } = await supabase
      .from('caso_itens')
      .update({
        situacao: 'ok',
        por: 'humano',
        detalhe: `Anexado à mão na Triagem (${entraram.map((e) => e.nome).join(', ')}).`,
        decidido_em: new Date().toISOString(),
        decidido_por: user.email ?? null,
      })
      .eq('caso_id', caso.id)
      .in('item', alvos)
      .neq('situacao', 'dispensado')
      .select('item')
    itensOk = (mexidos ?? []).map((m) => m.item as string)
  }

  if (!entraram.length) {
    return NextResponse.json({ erro: `Nenhum arquivo entrou: ${falhas.join(' · ')}` }, { status: 422 })
  }

  /* A PASTA JÁ EXISTE NO NOTEBOOK desde o "Trazer" (10/09/2026). Documento que
     chega depois precisa descer para ela, senão a triagem nunca o vê. A marca
     é esta: o agente baixa o que falta e a triagem refaz sozinha. */
  await supabase.from('analise_fila').update({ anexos_em: new Date().toISOString() }).eq('caso_id', caso.id)

  return NextResponse.json({
    ok: true,
    entraram: entraram.length,
    no_tomador: jaNoTomador,
    itens_marcados: itensOk,
    aviso: falhas.length ? `Ficaram de fora: ${falhas.join(' · ')}` : null,
  })
}
