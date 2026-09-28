// ============================================================================
//  POST /api/analise/reanalisar  ·  UM pedido só: o motivo, os documentos
//  novos, e a análise anterior indo junto para quem vai reanalisar
//
//  24/09/2026. A queixa que abriu isto, na NC Holding: ele mandou refazer a
//  análise com três documentos novos e um motivo escrito ponto a ponto, e a
//  reanálise saiu sem considerar o relatório anterior. Duas causas, as duas
//  daqui e nenhuma do analista:
//
//    1. o documento novo não tinha por onde entrar. A tela dizia, com todas as
//       letras, "cole na pasta, dentro de _concluidas no notebook". Se a pasta
//       tivesse ido para a rede, nem isso;
//    2. a análise anterior não viajava. O `_instrucoes.txt` levava só o texto
//       da caixa. Tudo o que a análise anterior concluiu (78 colunas, com
//       conclusão, condições, pontos de atenção e os números) ficava no banco,
//       a dois cliques de distância de quem mais precisava dela.
//
//  Aqui o pedido é um só e leva as três coisas: MOTIVO (obrigatório),
//  DOCUMENTOS NOVOS (sobem para o Storage e para a ficha do tomador, e o
//  agente os baixa para dentro da pasta) e o DOSSIÊ da análise anterior,
//  montado pelo CRM. O que sai na ponta é o mesmo `_instrucoes.txt` que o
//  comando `/analise` já lê antes de tudo: nenhum canal novo no notebook.
//
//  A ORDEM DE GRAVAR É DELIBERADA: arquivos, depois a trilha, depois a ordem.
//  Ordem dada é a única coisa que o notebook enxerga; se ela falhar, o que
//  veio antes é desfeito, porque pasta fantasma na Mesa já custou uma manhã
//  (ver a memória card-fantasma-e-pausa-lida-como-queda).
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mimePorNome } from '@/lib/anexos/mime'
import { darOrdem } from '@/lib/analise/dar-ordem'
import { recusarOutraOrigem } from '@/lib/seguranca/mesma-origem'
import {
  acharOuCriarLinha, desfazerLinha, estaRefazendo,
} from '@/lib/analise/linha-da-fila'
import { COLUNAS_COMPARATIVO, type LinhaComparavel } from '@/lib/analise/comparativo'
import {
  montarDossie, COLUNAS_EXERCICIO_DOSSIE, type ExercicioDossie,
} from '@/lib/analise/dossie-anterior'

export const runtime = 'nodejs'

const BUCKET = 'fam-anexos'
const MAX_BYTES = 50 * 1024 * 1024
const MAX_ARQUIVOS = 15
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const nomeSeguro = (n: string) => n.replace(/[^a-zA-Z0-9._\-]/g, '_')

/* O MOTIVO É OBRIGATÓRIO, e um mínimo de letras não é burocracia: é o texto
   que o analista vai ler como ordem. "refazer" sozinho no `_instrucoes.txt`
   não diz o que observar, e a reanálise volta a começar do zero. */
const MOTIVO_MINIMO = 15

export async function POST(req: NextRequest) {
  const recusa = recusarOutraOrigem(req)
  if (recusa) return recusa

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const { data: analista } = await supabase.rpc('fam_e_analista')
  if (!analista) return NextResponse.json({ erro: 'Só o analista manda reanalisar.' }, { status: 403 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ erro: 'Os arquivos não chegaram inteiros. Juntos passam de 50 MB? Mande em duas vezes.' }, { status: 413 })
  }

  const analiseId = String(form.get('analise_id') ?? '')
  if (!UUID.test(analiseId)) return NextResponse.json({ erro: 'Falta dizer qual análise.' }, { status: 422 })

  const motivo = String(form.get('motivo') ?? '').trim().slice(0, 4000)
  if (motivo.length < MOTIVO_MINIMO) {
    return NextResponse.json({
      erro: 'Escreva o motivo da reanálise. É ele que o analista lê como ordem, e é o que fica registrado na trilha desta empresa.',
    }, { status: 422 })
  }
  const escopo = String(form.get('escopo') ?? '') === 'parcial' ? 'parcial' : 'completa'
  const modo = String(form.get('modo') ?? '') === 'rapida' ? 'rapida' : ''

  const { data: quem } = await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
  const nome = (quem as { nome: string | null } | null)?.nome ?? user.email ?? 'alguém'

  // ── A análise que está valendo, inteira ─────────────────────────────────
  const { data: base } = await supabase
    .from('analises')
    .select(`${COLUNAS_COMPARATIVO}, chave_local, tomador_id`)
    .eq('id', analiseId)
    .maybeSingle()
  if (!base) return NextResponse.json({ erro: 'Análise não encontrada.' }, { status: 404 })

  const a = base as unknown as LinhaComparavel & { chave_local: string | null; tomador_id: string | null }
  const cnpj = String(a.cnpj ?? '').replace(/\D/g, '')

  const { data: exercicios } = await supabase
    .from('analise_exercicios')
    .select(COLUNAS_EXERCICIO_DOSSIE)
    .eq('analise_id', analiseId)
    .order('exercicio', { ascending: true })

  // ── O tomador, para o documento entrar na ficha dele ────────────────────
  let tomadorId = a.tomador_id
  if (!tomadorId && cnpj.length === 14) {
    const { data: t } = await supabase.from('tomadores').select('id').eq('cnpj', cnpj).maybeSingle()
    tomadorId = t?.id ?? null
  }

  // ── Os documentos novos ─────────────────────────────────────────────────
  const arquivos = form.getAll('arquivo').filter((x): x is File => x instanceof File && x.size > 0)
  if (arquivos.length > MAX_ARQUIVOS) {
    return NextResponse.json({ erro: `No máximo ${MAX_ARQUIVOS} arquivos por reanálise.` }, { status: 422 })
  }

  const guardados: { nome: string; storage_path: string; bytes: number; anexo_id: string | null }[] = []
  const falhas: string[] = []
  const pastaStorage = tomadorId ? `tomador/${tomadorId}` : `reanalise/${a.id}`

  for (const arquivo of arquivos) {
    if (arquivo.size > MAX_BYTES) {
      falhas.push(`${arquivo.name} tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB (o limite é 50 MB)`)
      continue
    }
    const mime = mimePorNome(arquivo.name)
    const caminho = `${pastaStorage}/${Date.now()}_reanalise_${nomeSeguro(arquivo.name)}`
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

  /* Mandou arquivo e NENHUM entrou: não seguir. Rodar a reanálise sem o
     documento que a justifica repetiria a decisão anterior, que é a queixa. */
  if (arquivos.length && !guardados.length) {
    return NextResponse.json({ erro: `Nenhum arquivo entrou: ${falhas.join(' · ')}` }, { status: 422 })
  }

  const limparArquivos = async () => {
    const orfaos = guardados.filter(g => !g.anexo_id).map(g => g.storage_path)
    if (orfaos.length) await supabase.storage.from(BUCKET).remove(orfaos)
  }

  // ── O dossiê: a análise anterior inteira, como o analista vai lê-la ─────
  const dossie = montarDossie(a, (exercicios ?? []) as unknown as ExercicioDossie[], {
    motivo,
    documentosNovos: guardados.map(g => g.nome),
    escopo,
    quem: nome,
  })

  // ── A linha da esteira ──────────────────────────────────────────────────
  const r = await acharOuCriarLinha(
    supabase,
    { id: a.id, chave_local: a.chave_local, cnpj: a.cnpj, razao_social: a.razao_social, nome_curto: a.nome_curto, tomador_id: tomadorId, corretora: a.corretora, pasta: a.pasta },
    nome,
    `Reanálise pedida por ${nome}.`,
  )
  if (!r.ok) {
    await limparArquivos()
    return NextResponse.json({ erro: r.erro, ...(r.fila_id ? { fila_id: r.fila_id } : {}) }, { status: r.status })
  }
  const { linha, criada } = r

  /* Já na esteira e fora de "concluída": a pasta está andando agora. Os
     documentos já entraram na ficha do tomador (não se perdem), e o card dela
     é o lugar de mandar. */
  if (linha.situacao !== 'concluida' || linha.ordem || estaRefazendo(linha)) {
    return NextResponse.json({
      ok: true, fila_id: linha.id, ja_na_esteira: true,
      aviso: 'Esta pasta já está andando na esteira. Os documentos foram guardados na ficha do tomador; acompanhe pelo card.',
    })
  }

  // ── A trilha do pedido, antes da ordem ──────────────────────────────────
  const { data: pedido } = await supabase.from('analise_reanalises').insert({
    analise_base_id: a.id,
    fila_id: linha.id,
    tomador_id: tomadorId,
    cnpj: cnpj || null,
    pasta: a.pasta,
    estado: 'pedida',
    motivo,
    escopo,
    modo: modo || null,
    documentos: guardados,
    dossie,
    criado_por_nome: nome,
  }).select('id').single()

  // ── A ordem. É a única coisa que o notebook enxerga ─────────────────────
  const ordem = await darOrdem(supabase, {
    id: linha.id,
    ordem: 'refazer',
    dados: {
      escopo,
      modo,
      /* `instrucao` continua sendo o recado curto que a Mesa mostra na linha.
         O texto inteiro vai no dossiê. */
      instrucao: motivo,
      motivo: `Reanálise pedida por ${nome}.`,
      dossie,
      documentos: guardados.map(g => ({ nome: g.nome, storage_path: g.storage_path, bytes: g.bytes })),
      reanalise_id: pedido?.id ?? '',
    },
    nome,
  })

  if (!ordem.ok) {
    if (criada) await desfazerLinha(supabase, linha.id)
    if (pedido?.id) await supabase.from('analise_reanalises').update({ estado: 'cancelada' }).eq('id', pedido.id)
    await limparArquivos()
    return NextResponse.json({ erro: ordem.erro }, { status: ordem.status })
  }

  return NextResponse.json({
    ok: true,
    fila_id: linha.id,
    reanalise_id: pedido?.id ?? null,
    documentos: guardados.length,
    criada,
    aviso: falhas.length ? `Ficaram de fora: ${falhas.join(' · ')}` : null,
  })
}
