// ============================================================================
//  A PONTE DO SERASA  ·  /api/esteira/serasa  (14/09/2026)
//
//  Os pedidos de Serasa moram em `serasa_pedidos`. Quem executa é a esteira do
//  notebook, onde está o Chrome logado no Serasa:
//
//     GET               os pedidos prontos para consultar (e a faxina)
//     POST aceito       a máquina pega UM pedido; só uma pega o mesmo
//     POST falhou       o robô parou, com o motivo escrito para a tela
//     POST entregar     o PDF sobe; vira anexo do tomador quando há tomador
//     POST socios       a esteira consultou a empresa de uma PASTA e conta
//                       os sócios que achou
//
//  OS SÓCIOS (regra do Marco): "sempre traz a primeira camada, quando tiver
//  sócios, aí tem que pedir aprovação". O robô lê o quadro societário, e cada
//  sócio vira um pedido PARADO em 'aguardando_aprovacao'. Só a função
//  `serasa_decidir_socios` (analista de crédito) solta para 'pendente'.
//
//  Arquivo à parte de /api/esteira de propósito: aquela rota é de análise, e
//  este pedido é de cadastro. A trava é a mesma (o segredo do Carteiro).
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const BUCKET = 'fam-anexos'
const MAX_PDF = 8 * 1024 * 1024
/* Pedido aceito que não termina em 15 minutos morreu com a máquina: volta a
   aparecer na tela como falha, e não fica "consultando" para sempre. */
const MORTO_MIN = 15
/* Sócio consultado nos últimos 30 dias não vira pedido de novo: o robô
   reaproveitaria a cópia de qualquer jeito, e a tela só ganharia ruído. */
const DIAS_SOCIO = 30

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return null
  return createClient(url, chave, { auth: { persistSession: false } })
}

function porteiro(req: NextRequest) {
  const segredo = process.env.CARTEIRO_TOKEN || process.env.ANALISE_EVENTO_TOKEN || ''
  if (!segredo) return NextResponse.json({ erro: 'Rota não configurada (CARTEIRO_TOKEN).' }, { status: 503 })
  if (req.headers.get('x-carteiro-token') !== segredo) return NextResponse.json({ erro: 'Segredo inválido.' }, { status: 401 })
  return null
}

const texto = (v: unknown, max = 300) => {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}
const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

interface Destino { id: string; tomador_id: string | null; pasta: string | null; cnpj: string; documento: string }

/* Cada sócio do quadro societário vira um pedido parado, esperando o analista.
   Nunca o próprio tomador, nunca documento ilegível, nunca repetido. */
async function criarSocios(sb: SupabaseClient, origem: Destino, brutos: unknown): Promise<number> {
  const lista = (Array.isArray(brutos) ? brutos : []).slice(0, 20)
  const desde = new Date(Date.now() - DIAS_SOCIO * 86400000).toISOString()
  let criados = 0
  for (const b of lista) {
    const s = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>
    const doc = digitos(s.documento)
    if (doc.length !== 11 && doc.length !== 14) continue
    if (doc === origem.documento || doc === origem.cnpj) continue

    /* O mesmo sócio pode ter nascido pela PASTA (antes de existir tomador) e
       voltar pelo TOMADOR (o botão do cadastro): a conferência olha os dois. */
    const onde = [
      origem.tomador_id ? `tomador_id.eq.${origem.tomador_id}` : null,
      origem.pasta ? `pasta.eq.${JSON.stringify(origem.pasta)}` : null,
    ].filter(Boolean).join(',')
    const { data: ja } = await sb.from('serasa_pedidos').select('id, estado, feito_em')
      .eq('documento', doc).eq('camada', 'socio').or(onde).limit(20)
    const repetido = (ja ?? []).some((j) =>
      ['aguardando_aprovacao', 'pendente', 'consultando'].includes(j.estado)
      || (['pronto', 'reaproveitado'].includes(j.estado) && j.feito_em && j.feito_em >= desde))
    if (repetido) continue

    const { error } = await sb.from('serasa_pedidos').insert({
      camada: 'socio',
      estado: 'aguardando_aprovacao',
      origem_id: origem.id,
      tomador_id: origem.tomador_id,
      pasta: origem.pasta,
      cnpj: origem.cnpj,
      documento: doc,
      tipo_pessoa: doc.length === 11 ? 'PF' : 'PJ',
      nome: texto(s.nome, 200),
      participacao: texto(s.participacao, 20),
      anotacoes: texto(s.anotacoes, 20),
      pedido_por: 'Robô do Serasa',
      pedido_por_auth_id: null,
    })
    if (!error) criados++
  }
  return criados
}

export async function GET(req: NextRequest) {
  const barrado = porteiro(req)
  if (barrado) return barrado
  const sb = admin()
  if (!sb) return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 503 })
  const agora = new Date()

  await sb.from('serasa_pedidos')
    .update({ estado: 'falhou', feito_em: agora.toISOString(), resultado: `A máquina aceitou e não terminou em ${MORTO_MIN} minutos. Peça de novo.` })
    .eq('estado', 'consultando')
    .lt('aceito_em', new Date(agora.getTime() - MORTO_MIN * 60000).toISOString())

  /* O PEDIDO QUE NASCEU SÓ DE PASTA GANHA O TOMADOR quando o cadastro existir.
     A análise renomeia a pasta (a GlobalX virou "I.I Altera-Se o Nome
     Empresarial...", 15/09/2026), e o sócio preso ao nome velho sumiria do
     card. O CNPJ gravado é o do tomador, então é por ele que se liga. */
  const { data: soltos } = await sb.from('serasa_pedidos').select('cnpj').is('tomador_id', null).limit(100)
  for (const cnpj of new Set((soltos ?? []).map((s) => s.cnpj))) {
    const { data: t } = await sb.from('tomadores').select('id').eq('cnpj', cnpj).limit(1).maybeSingle()
    if (t) await sb.from('serasa_pedidos').update({ tomador_id: t.id }).is('tomador_id', null).eq('cnpj', cnpj)
  }

  const { data: pedidos, error } = await sb.from('serasa_pedidos')
    .select('id, tomador_id, pasta, cnpj, documento, tipo_pessoa, camada, nome, pedido_por, pedido_por_auth_id, criado_em, tomador:tomadores(cnpj)')
    .eq('estado', 'pendente')
    .order('criado_em', { ascending: true })
    .limit(5)
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })

  const recusar = (id: string, resultado: string) => sb.from('serasa_pedidos')
    .update({ estado: 'falhou', feito_em: agora.toISOString(), resultado })
    .eq('id', id).eq('estado', 'pendente')

  /* O CNPJ QUE VALE É O DO CADASTRO. Pedido com CNPJ diferente do tomador (o
     cadastro mudou depois do clique, ou alguém gravou por fora) não vira
     consulta cobrada de outra empresa. */
  const validos = []
  for (const p of pedidos ?? []) {
    if (p.tomador_id) {
      const rel = p.tomador as unknown as { cnpj: string | null } | { cnpj: string | null }[] | null
      const cnpjTomador = digitos(Array.isArray(rel) ? rel[0]?.cnpj : rel?.cnpj)
      if (cnpjTomador !== p.cnpj) {
        await recusar(p.id, 'O CNPJ do pedido não é o do cadastro do tomador. Nada foi consultado.')
        continue
      }
    } else if (p.pedido_por_auth_id && p.camada === 'empresa') {
      /* PEDIDO DE PESSOA PELO CARD DA ANÁLISE, ainda sem tomador (15/09/2026):
         o CNPJ tem que ser o da própria análise. O pedido só de pasta que a
         esteira grava nasce sem pessoa e já veio conferido pela triagem. */
      const { data: fila } = await sb.from('analise_fila').select('cnpj').eq('pasta', p.pasta ?? '').limit(5)
      if (!(fila ?? []).some((x) => digitos(x.cnpj) === p.cnpj)) {
        await recusar(p.id, 'O CNPJ do pedido não é o da análise desta pasta. Nada foi consultado.')
        continue
      }
    }

    /* A PASTA DE HOJE. A análise renomeia a pasta (a GlobalX, 15/09/2026), e o
       pedido guardou o nome de quando nasceu. Só se troca quando o nome velho
       não é mais de análise nenhuma E o tomador tem UMA análise aberta: com
       duas operações do mesmo tomador na esteira, "a mais recente" poria o PDF
       na análise errada (achado da revisão de 15/09/2026). */
    let pasta = p.pasta
    if (p.tomador_id && (p.pasta || p.camada === 'socio')) {
      const { data: filas } = await sb.from('analise_fila').select('pasta, arquivada').eq('tomador_id', p.tomador_id).limit(20)
      const aindaExiste = !!p.pasta && (filas ?? []).some((x) => x.pasta === p.pasta)
      const abertas = (filas ?? []).filter((x) => !x.arquivada)
      if (!aindaExiste && abertas.length === 1) pasta = abertas[0].pasta
    }
    validos.push({
      id: p.id, tomador_id: p.tomador_id, pasta, cnpj: p.cnpj, documento: p.documento,
      tipo_pessoa: p.tipo_pessoa, camada: p.camada, nome: p.nome, pedido_por: p.pedido_por, criado_em: p.criado_em,
    })
  }
  return NextResponse.json({ ok: true, pedidos: validos })
}

export async function POST(req: NextRequest) {
  const barrado = porteiro(req)
  if (barrado) return barrado
  const sb = admin()
  if (!sb) return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 503 })
  const agora = new Date().toISOString()

  // ── o PDF (multipart) ─────────────────────────────────────────────────────
  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const form = await req.formData()
    const id = String(form.get('id') ?? '')
    const arquivo = form.get('arquivo')
    if (!id) return NextResponse.json({ erro: 'Falta o pedido.' }, { status: 422 })
    if (!(arquivo instanceof File)) return NextResponse.json({ erro: 'Nenhum arquivo veio.' }, { status: 400 })
    if (arquivo.size > MAX_PDF) return NextResponse.json({ erro: 'PDF acima de 8 MB.' }, { status: 413 })

    const { data: pedido } = await sb.from('serasa_pedidos')
      .select('id, tomador_id, pasta, cnpj, documento, camada, estado').eq('id', id).maybeSingle()
    if (!pedido) return NextResponse.json({ erro: 'Pedido não existe.' }, { status: 404 })
    if (pedido.estado !== 'consultando') return NextResponse.json({ erro: `O pedido não está esperando PDF (está "${pedido.estado}").` }, { status: 409 })

    const bytes = Buffer.from(await arquivo.arrayBuffer())
    if (bytes.length < 20000 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return NextResponse.json({ erro: 'O arquivo não é um PDF de relatório.' }, { status: 400 })
    }

    // Pedido só de pasta (a análise ainda não tem tomador): o PDF já ficou na pasta, no notebook.
    let anexoId: string | null = null
    const nome = (texto(arquivo.name, 160) ?? `Serasa Experian - ${pedido.documento}.pdf`).replace(/[\\/]/g, ' ')
    if (pedido.tomador_id) {
      const caminho = `tomador/${pedido.tomador_id}/${Date.now()}_${nome.replace(/[^a-zA-Z0-9._\-]/g, '_')}`
      const { error: erroUp } = await sb.storage.from(BUCKET).upload(caminho, bytes, { upsert: false, contentType: 'application/pdf' })
      if (erroUp) return NextResponse.json({ erro: `Storage: ${erroUp.message}` }, { status: 500 })
      const { data: anexo, error: erroAnexo } = await sb.from('anexos').insert({
        entidade_tipo: 'tomador',
        entidade_id: pedido.tomador_id,
        tomador_id: pedido.tomador_id,
        nome_original: nome,
        storage_path: caminho,
        tipo_mime: 'application/pdf',
        tamanho_bytes: bytes.length,
        categoria: 'outro',
      }).select('id').single()
      if (erroAnexo || !anexo) {
        await sb.storage.from(BUCKET).remove([caminho])
        return NextResponse.json({ erro: `Anexo: ${erroAnexo?.message ?? 'não gravou'}` }, { status: 500 })
      }
      anexoId = anexo.id
    }

    /* O CASO DA TRIAGEM VÊ O SERASA (15/09/2026). O botão também mora na
       Triagem, ao lado da Receita: o PDF entra na lista do passo 2 e o item
       "Serasa" do checklist cai, como no anexar à mão. Só caso ainda em
       triagem, do mesmo tomador e do mesmo CNPJ; o que a pessoa dispensou fica. */
    if (anexoId && pedido.camada === 'empresa') {
      const { data: casos } = await sb.from('casos').select('id')
        .eq('tomador_id', pedido.tomador_id).eq('cnpj', pedido.cnpj).in('etapa', ['comercial', 'triagem'])
      for (const caso of casos ?? []) {
        await sb.from('caso_documentos').insert({
          caso_id: caso.id, anexo_id: anexoId, nome, bytes: bytes.length,
          classe: 'serasa_pj', certeza: 'alta', classificado_por: 'robo', detalhe: 'Consultado pelo robô do Serasa.',
        })
        await sb.from('caso_itens').update({ situacao: 'ok', por: 'robo', detalhe: `Consultado pelo robô do Serasa (${nome}).` })
          .eq('caso_id', caso.id).eq('item', 'serasa_pj').neq('situacao', 'dispensado')
      }
    }

    const reaproveitado = String(form.get('reaproveitado') ?? '') === '1'
    const consultadoEm = texto(form.get('consultado_em'), 40)
    const { data: fechado } = await sb.from('serasa_pedidos').update({
      estado: reaproveitado ? 'reaproveitado' : 'pronto',
      feito_em: agora,
      anexo_id: anexoId,
      resultado: reaproveitado
        ? `Reaproveitado da consulta de ${consultadoEm ? new Date(consultadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'outro dia'}: sem cobrança nova.`
        : 'Consultado no Serasa (uma consulta cobrada, sem extras).',
    }).eq('id', id).eq('estado', 'consultando').select('id')

    let socios = 0
    if (pedido.camada === 'empresa') {
      let brutos: unknown = []
      try { brutos = JSON.parse(String(form.get('socios') ?? '[]')) } catch { brutos = [] }
      socios = await criarSocios(sb, pedido as Destino, brutos)
    }
    if (!fechado?.length) {
      return NextResponse.json({ ok: true, anexo_id: anexoId, socios, aviso: 'O PDF entrou, mas o pedido já estava fechado.' })
    }
    return NextResponse.json({ ok: true, anexo_id: anexoId, socios })
  }

  // ── JSON ──────────────────────────────────────────────────────────────────
  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }) }

  /* A ESTEIRA CONSULTOU A EMPRESA DE UMA PASTA (o Serasa faltava). Fica o
     recibo da consulta, e os sócios nascem esperando aprovação. */
  if (corpo.acao === 'socios') {
    const pasta = texto(corpo.pasta, 400)
    const cnpj = digitos(corpo.cnpj)
    if (!pasta || cnpj.length !== 14) return NextResponse.json({ erro: 'Falta a pasta ou o CNPJ.' }, { status: 422 })
    let tomadorId = texto(corpo.tomador_id, 60)
    if (tomadorId) {
      const { data: t } = await sb.from('tomadores').select('id, cnpj').eq('id', tomadorId).maybeSingle()
      if (!t || digitos(t.cnpj) !== cnpj) tomadorId = null
    }
    const reaproveitado = !!corpo.reaproveitado
    const { data: origem, error } = await sb.from('serasa_pedidos').insert({
      camada: 'empresa',
      estado: reaproveitado ? 'reaproveitado' : 'pronto',
      tomador_id: tomadorId,
      pasta,
      cnpj,
      documento: cnpj,
      tipo_pessoa: 'PJ',
      nome: texto(corpo.razao, 200),
      pedido_por: 'Esteira (Serasa faltando na pasta)',
      pedido_por_auth_id: null,
      aceito_em: agora,
      feito_em: agora,
      maquina: texto(corpo.maquina, 120),
      resultado: reaproveitado ? 'Reaproveitado de consulta recente: sem cobrança nova.' : 'Consultado pela esteira (uma consulta cobrada, sem extras).',
    }).select('id, tomador_id, pasta, cnpj, documento').single()
    if (error || !origem) return NextResponse.json({ erro: error?.message ?? 'não gravou' }, { status: 500 })
    const socios = await criarSocios(sb, origem as Destino, corpo.socios)
    return NextResponse.json({ ok: true, id: origem.id, socios })
  }

  /* QUANTOS SÓCIOS AINDA ESTÃO NA FILA desta pasta ou deste tomador. A esteira
     só põe o Serasa dos sócios à vista da análise quando o lote acabou: cada
     arquivo novo reabre a triagem, e um de cada vez seria uma triagem por sócio.
     Quem espera aprovação não conta: pode nunca ser decidido. */
  if (corpo.acao === 'restantes') {
    const pasta = texto(corpo.pasta, 400)
    const tomadorId = texto(corpo.tomador_id, 60)
    const onde = [tomadorId ? `tomador_id.eq.${tomadorId}` : null, pasta ? `pasta.eq.${JSON.stringify(pasta)}` : null].filter(Boolean).join(',')
    if (!onde) return NextResponse.json({ erro: 'Falta a pasta ou o tomador.' }, { status: 422 })
    const { count, error } = await sb.from('serasa_pedidos').select('id', { count: 'exact', head: true })
      .eq('camada', 'socio').in('estado', ['pendente', 'consultando']).or(onde)
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, restantes: count ?? 0 })
  }

  const id = String(corpo.id ?? '')
  if (!id) return NextResponse.json({ erro: 'Falta o pedido.' }, { status: 422 })

  /* O ROBÔ PERGUNTA NO ÚLTIMO SEGUNDO, antes de clicar em Gerar: o pedido ainda
     está com ele? Apagado ou fechado não é cobrado (15/09/2026). */
  if (corpo.acao === 'conferir') {
    const { data } = await sb.from('serasa_pedidos').select('estado').eq('id', id).maybeSingle()
    return NextResponse.json({ ok: true, estado: data?.estado ?? null })
  }

  if (corpo.acao === 'aceito') {
    const { data } = await sb.from('serasa_pedidos')
      .update({ estado: 'consultando', aceito_em: agora, maquina: texto(corpo.maquina, 120) })
      .eq('id', id).eq('estado', 'pendente').select('id')
    if (!data?.length) return NextResponse.json({ erro: 'Pedido já foi pego ou não está pendente.' }, { status: 409 })
    return NextResponse.json({ ok: true })
  }

  /* O SERASA PEDIU LOGIN: não é falha do pedido, é a máquina sem sessão. O
     pedido volta para a fila com o aviso, e anda sozinho depois do login. */
  if (corpo.acao === 'devolver') {
    await sb.from('serasa_pedidos')
      .update({ estado: 'pendente', aceito_em: null, maquina: null, resultado: texto(corpo.motivo, 500) })
      .eq('id', id).eq('estado', 'consultando')
    return NextResponse.json({ ok: true })
  }

  if (corpo.acao === 'falhou') {
    await sb.from('serasa_pedidos')
      .update({ estado: 'falhou', feito_em: agora, resultado: texto(corpo.motivo, 1000) ?? 'O robô do Serasa parou sem dizer o motivo.' })
      .eq('id', id).eq('estado', 'consultando')
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ erro: 'Ação desconhecida.' }, { status: 422 })
}
