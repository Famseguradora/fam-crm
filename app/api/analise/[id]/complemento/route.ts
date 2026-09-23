// ============================================================================
//  POST /api/analise/<id>/complemento  ·  subir documento novo e pedir a
//  análise complementar
//
//  Pedido do Marco em 17/09/2026: o tomador já analisado manda o balancete de
//  2026, e ele quer saber se a empresa manteve o rumo. Esta rota guarda os
//  arquivos e abre o pedido; quem lê é o agente do notebook
//  (scripts/complemento.mjs), e a tela acompanha pelo Realtime.
//
//  O ARQUIVO ENTRA PELO MESMO LUGAR DE SEMPRE: Storage `fam-anexos` e linha em
//  `anexos` na ficha do tomador, para ele consultar depois pelo tomador. Sem
//  tomador ligado, o arquivo fica só no complemento.
//
//  Tetos: 50 MB por arquivo e o corpo inteiro até os 50 MB do proxy
//  (ver memória next-corta-corpo-em-10mb). Só o analista pede (RLS).
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mimePorNome } from '@/lib/anexos/mime'

export const runtime = 'nodejs'

const BUCKET = 'fam-anexos'
const MAX_BYTES = 50 * 1024 * 1024
const MAX_ARQUIVOS = 15
const nomeSeguro = (n: string) => n.replace(/[^a-zA-Z0-9._\-]/g, '_')

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const { data: analista } = await supabase.rpc('fam_e_analista')
  if (!analista) return NextResponse.json({ erro: 'Só o analista pede análise complementar.' }, { status: 403 })

  const { data: a } = await supabase
    .from('analises')
    .select('id, tomador_id, cnpj, razao_social')
    .eq('id', id)
    .maybeSingle()
  if (!a) return NextResponse.json({ erro: 'Análise não encontrada.' }, { status: 404 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ erro: 'Os arquivos não chegaram inteiros. Juntos passam de 50 MB? Mande em duas vezes.' }, { status: 413 })
  }
  const instrucoes = String(form.get('instrucoes') ?? '').trim().slice(0, 3000) || null
  const arquivos = form.getAll('arquivo').filter((x): x is File => x instanceof File && x.size > 0)
  if (!arquivos.length) return NextResponse.json({ erro: 'Escolha pelo menos um documento.' }, { status: 400 })
  if (arquivos.length > MAX_ARQUIVOS) return NextResponse.json({ erro: `No máximo ${MAX_ARQUIVOS} arquivos por complemento.` }, { status: 422 })

  // O tomador: o da análise, ou o do mesmo CNPJ.
  let tomadorId = (a.tomador_id as string | null) ?? null
  const cnpj = String(a.cnpj ?? '').replace(/\D/g, '')
  if (!tomadorId && cnpj.length === 14) {
    const { data: t } = await supabase.from('tomadores').select('id').eq('cnpj', cnpj).maybeSingle()
    tomadorId = t?.id ?? null
  }

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()

  const guardados: { nome: string; storage_path: string; bytes: number; anexo_id: string | null }[] = []
  const falhas: string[] = []
  const pasta = tomadorId ? `tomador/${tomadorId}` : `complemento/${a.id}`

  for (const arquivo of arquivos) {
    if (arquivo.size > MAX_BYTES) {
      falhas.push(`${arquivo.name} tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB (o limite é 50 MB)`)
      continue
    }
    const mime = mimePorNome(arquivo.name)
    const caminho = `${pasta}/${Date.now()}_complemento_${nomeSeguro(arquivo.name)}`
    const bytes = Buffer.from(await arquivo.arrayBuffer())
    const { error: erroUp } = await supabase.storage.from(BUCKET).upload(caminho, bytes, { upsert: false, contentType: mime })
    if (erroUp) { falhas.push(`${arquivo.name} (${erroUp.message})`); continue }

    let anexoId: string | null = null
    if (tomadorId) {
      const { data: anexo } = await supabase.from('anexos').insert({
        entidade_tipo: 'tomador',
        entidade_id: tomadorId,
        tomador_id: tomadorId,
        nome_original: arquivo.name,
        storage_path: caminho,
        tipo_mime: mime,
        tamanho_bytes: bytes.length,
        categoria: 'analise_credito',
      }).select('id').single()
      anexoId = anexo?.id ?? null
    }
    guardados.push({ nome: arquivo.name, storage_path: caminho, bytes: bytes.length, anexo_id: anexoId })
  }

  if (!guardados.length) {
    return NextResponse.json({ erro: `Nenhum arquivo entrou: ${falhas.join(' · ')}` }, { status: 422 })
  }

  const { data: pedido, error } = await supabase.from('analise_complementos').insert({
    analise_id: a.id,
    tomador_id: tomadorId,
    cnpj: cnpj || null,
    instrucoes,
    arquivos: guardados,
    criado_por_nome: (quem as { nome: string | null } | null)?.nome ?? user.email ?? null,
    mensagem: 'Na fila do notebook.',
  }).select('id').single()

  if (error || !pedido) {
    // Pedido que não nasceu não pode deixar arquivo solto no Storage sem dono.
    await supabase.storage.from(BUCKET).remove(guardados.filter(g => !g.anexo_id).map(g => g.storage_path))
    return NextResponse.json({ erro: error?.message ?? 'Não consegui abrir o pedido.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    id: pedido.id,
    entraram: guardados.length,
    aviso: falhas.length ? `Ficaram de fora: ${falhas.join(' · ')}` : null,
  })
}
