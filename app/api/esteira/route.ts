// ============================================================================
//  A PONTE DA ESTEIRA  ·  /api/esteira
//
//  Quem chama é o agente que roda no notebook do Marco, ao lado do motor da
//  análise de crédito. Ele não tem cookie de login, então a trava é o mesmo
//  segredo do Carteiro e a escrita usa service role.
//
//  A DIVISÃO DE QUEM SABE O QUÊ, e ela é a coisa mais importante deste arquivo:
//
//     o NOTEBOOK é dono do DISCO      quais pastas existem, quantos documentos
//                                     têm, o hash, quem está rodando agora
//     o CRM é dono da DECISÃO         o que uma pessoa mandou fazer, de qual
//                                     caso a análise nasceu, e o resultado
//
//  Por isso `sincronizar` NUNCA encosta em `ordem`, `caso_id`, `analise_id` nem
//  `tomador_id`: são campos do lado do CRM. E a tela NUNCA escreve situação nem
//  hash: são do lado do disco. Cada lado escreve só o que ele sabe, e assim não
//  existe o caso de um sobrescrever a verdade do outro.
//
//  NENHUMA IA AQUI, e nem no CRM inteiro por causa disto. Quem chama o Claude é
//  o motor no notebook, pelo `claude.exe` da assinatura: sem chave de API, sem
//  serviço contratado e sem fatura de token. Ver `_sistema/ponte.mjs`.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SITUACOES, nomeDaEtapa, travaMorta } from '@/lib/analise/esteira'

export const runtime = 'nodejs'

const segredoEsperado = () => process.env.CARTEIRO_TOKEN || process.env.ANALISE_EVENTO_TOKEN || ''

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return null
  return createClient(url, chave, { auth: { persistSession: false } })
}

/* Sem segredo configurado a rota fica FECHADA, e não aberta: o default de uma
   trava ausente tem que ser "não passa". */
function porteiro(req: NextRequest) {
  const segredo = segredoEsperado()
  if (!segredo) return NextResponse.json({ erro: 'Rota não configurada (CARTEIRO_TOKEN).' }, { status: 503 })
  if (req.headers.get('x-carteiro-token') !== segredo) {
    return NextResponse.json({ erro: 'Segredo inválido.' }, { status: 401 })
  }
  return null
}

// ── GET: a ordem de serviço do agente ───────────────────────────────────────
export async function GET(req: NextRequest) {
  const barrado = porteiro(req)
  if (barrado) return barrado
  const sb = admin()
  if (!sb) return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 503 })

  const maquina = new URL(req.url).searchParams.get('maquina') ?? ''

  /* O QUE UMA PESSOA MANDOU FAZER. Vem primeiro na resposta porque é o que tem
     alguém olhando a tela esperando acontecer. */
  const { data: ordens } = await sb
    .from('analise_fila')
    .select('id, pasta, ordem, ordem_por, ordem_em, situacao, caso_id, cnpj, razao_social')
    .not('ordem', 'is', null)
    .order('ordem_em', { ascending: true })
    .limit(20)

  /* AS PASTAS QUE AINDA NÃO EXISTEM NO DISCO. Uma análise nascida de um caso da
     Triagem tem os documentos no Storage do CRM, e não numa pasta do OneDrive.
     Alguém precisa materializar isso, e esse alguém é o agente: é ele que está
     na máquina onde o motor lê arquivo. `hash_documentos` nulo é a marca de
     "esta pasta nunca foi vista por máquina nenhuma". */
  const { data: aMaterializar } = await sb
    .from('analise_fila')
    .select('id, pasta, caso_id, cnpj, razao_social, chave_local')
    .is('hash_documentos', null)
    .not('caso_id', 'is', null)
    .order('criado_em', { ascending: true })
    .limit(10)

  /* A FILA INTEIRA, para o agente conciliar o que o disco diz com o que o banco
     tem. Sem isto ele não teria como perceber que uma pasta sumiu. */
  const { data: fila } = await sb
    .from('analise_fila')
    .select('id, pasta, situacao, hash_documentos, trava_maquina, trava_em')
    .order('atualizado_em', { ascending: false })
    .limit(300)

  /* AS PERGUNTAS DA IA DE GESTÃO. Quem responde é o `claude.exe` desta máquina,
     pela assinatura que já se paga: a pergunta nasce no CRM (de qualquer lugar,
     inclusive do celular) e a resposta volta para o banco, onde a equipe lê.
     Só as do motor "notebook" saem por aqui — quando o motor virar "servidor",
     quem responde é a rota da API e estas nem aparecem para o agente. */
  const { data: iaPedidos } = await sb
    .from('ia_pedidos')
    .select('id, pergunta, escopo, analise_id, criado_por_nome, criado_em')
    .eq('estado', 'pendente')
    .eq('motor', 'notebook')
    .order('criado_em', { ascending: true })
    .limit(3)

  return NextResponse.json({
    ok: true,
    maquina,
    ordens: ordens ?? [],
    a_materializar: aMaterializar ?? [],
    fila: fila ?? [],
    ia: iaPedidos ?? [],
  })
}

// ── POST: o que o agente traz de volta ──────────────────────────────────────
interface PastaDoAgente {
  pasta?: string
  situacao?: string
  motivo?: string
  hash_documentos?: string
  documentos?: number
  documentos_faltando?: string[]
  razao_social?: string
  cnpj?: string
  chave_local?: string
  trava_maquina?: string
  trava_pid?: number
  /** O nome antigo, quando a análise renomeou a pasta. Ver o cabeçalho da migration. */
  pasta_anterior?: string
}

const texto = (v: unknown, max = 300) => {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}

export async function POST(req: NextRequest) {
  const barrado = porteiro(req)
  if (barrado) return barrado
  const sb = admin()
  if (!sb) return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 503 })

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }
  const acao = String(corpo.acao ?? '')

  // ── sincronizar: o retrato do disco ───────────────────────────────────────
  if (acao === 'sincronizar') {
    const entrada = Array.isArray(corpo.pastas) ? (corpo.pastas as PastaDoAgente[]) : []
    if (entrada.length > 300) {
      return NextResponse.json({ erro: 'Mais de 300 pastas numa rodada.' }, { status: 413 })
    }

    let criadas = 0
    let atualizadas = 0
    const recusadas: string[] = []

    for (const p of entrada) {
      const pasta = texto(p.pasta, 400)
      if (!pasta) continue
      const situacao = SITUACOES.includes(p.situacao as never) ? p.situacao! : 'pendente'

      /* A RENOMEAÇÃO DA PASTA. Quem batiza a pasta é a análise, não a triagem:
         a razão social só aparece depois que a empresa é identificada. Sem
         tratar isso aqui, a análise vira DUAS linhas, a velha parada para
         sempre e a nova sem histórico. Já aconteceu no motor, e é o defeito
         que o `_outlook-vistos.json` também tinha. */
      const anterior = texto(p.pasta_anterior, 400)
      if (anterior && anterior !== pasta) {
        await sb.from('analise_fila').update({ pasta }).eq('pasta', anterior)
      }

      /* O QUE O DISCO SABE, e só isso. `ordem`, `caso_id`, `analise_id` e
         `tomador_id` não entram: são do lado do CRM. Ver o cabeçalho. */
      const doDisco: Record<string, unknown> = {
        situacao,
        motivo: texto(p.motivo, 500),
        hash_documentos: texto(p.hash_documentos, 100),
        documentos: Number(p.documentos ?? 0) || 0,
        documentos_faltando: (p.documentos_faltando ?? []).slice(0, 30).map((x) => String(x).slice(0, 200)),
        trava_maquina: situacao === 'em_andamento' ? texto(p.trava_maquina, 120) : null,
        trava_pid: situacao === 'em_andamento' ? Number(p.trava_pid ?? 0) || null : null,
        trava_em: situacao === 'em_andamento' ? new Date().toISOString() : null,
      }

      /* IDENTIFICAÇÃO SÓ ENTRA QUANDO VEM PREENCHIDA, e nunca em branco.
         O `avaliar()` do motor não conhece CNPJ nem chave: quem identifica a
         empresa é a análise, mais tarde. Mandar o campo vazio APAGARIA o CNPJ
         que a Triagem já tinha apurado, e o CNPJ é o que liga caso, cadastro e
         análise. Perder isso é perder a costura inteira. */
      const razao = texto(p.razao_social)
      const cnpjDoDisco = texto(p.cnpj, 20)
      const chave = texto(p.chave_local)
      if (razao) doDisco.razao_social = razao
      if (cnpjDoDisco) doDisco.cnpj = cnpjDoDisco
      if (chave) doDisco.chave_local = chave

      const { data: existe } = await sb
        .from('analise_fila').select('id, situacao').eq('pasta', pasta).maybeSingle()

      if (existe) {
        const { data, error } = await sb
          .from('analise_fila').update(doDisco).eq('id', existe.id).select('id')
        if (error || !data?.length) recusadas.push(`${pasta} (${error?.message ?? 'não gravou'})`)
        else atualizadas++
      } else {
        const { data, error } = await sb
          .from('analise_fila').insert({ pasta, ...doDisco, criado_por: 'motor' }).select('id')
        if (error || !data?.length) recusadas.push(`${pasta} (${error?.message ?? 'não gravou'})`)
        else criadas++
      }
    }

    return NextResponse.json({ ok: true, criadas, atualizadas, total: entrada.length, recusadas })
  }

  // ── progresso: a etapa, e o batimento da trava junto ──────────────────────
  if (acao === 'progresso') {
    const id = String(corpo.id ?? '')
    const pasta = texto(corpo.pasta, 400)
    if (!id && !pasta) return NextResponse.json({ erro: 'Falta dizer qual análise.' }, { status: 422 })

    const etapa = texto(corpo.etapa, 40)
    /* O `trava_em` é renovado JUNTO com a etapa, e não por um batimento
       separado. Assim não existe o caso de a máquina dizer "estou viva" sem
       estar avançando: trava viva e trabalho parado é o pior dos dois mundos,
       porque segura a análise e não entrega nada. */
    const mudanca = {
      situacao: 'em_andamento',
      etapa,
      etapa_texto: texto(corpo.mensagem, 300) ?? nomeDaEtapa(etapa),
      etapa_em: new Date().toISOString(),
      trava_maquina: texto(corpo.maquina, 120),
      trava_pid: Number(corpo.pid ?? 0) || null,
      trava_em: new Date().toISOString(),
      erro: null,
    }

    const q = sb.from('analise_fila').update(mudanca)
    const { data, error } = id ? await q.eq('id', id).select('id') : await q.eq('pasta', pasta!).select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ erro: 'Análise não está na fila.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  // ── concluir: liga o resultado ao andamento ───────────────────────────────
  if (acao === 'concluir') {
    const id = String(corpo.id ?? '')
    const pasta = texto(corpo.pasta, 400)
    if (!id && !pasta) return NextResponse.json({ erro: 'Falta dizer qual análise.' }, { status: 422 })

    /* A análise só é dada por concluída com o RESULTADO no banco. Sem isso, a
       tela mostraria "Concluída" e o card do tomador continuaria vazio, que é
       exatamente a queixa que originou a carga das análises. A `chave_local` é
       como o resultado é encontrado, porque é ela que o motor grava. */
    const chave = texto(corpo.chave_local)
    let analiseId: string | null = null
    if (chave) {
      const { data: a } = await sb
        .from('analises').select('id').eq('chave_local', chave).eq('vigente', true).maybeSingle()
      analiseId = a?.id ?? null
    }

    const mudanca = {
      situacao: 'concluida',
      motivo: texto(corpo.motivo, 500) ?? 'Concluída. Documentos inalterados, não refazer.',
      etapa: 'pronta',
      etapa_texto: nomeDaEtapa('pronta'),
      etapa_em: new Date().toISOString(),
      hash_documentos: texto(corpo.hash_documentos, 100),
      analise_id: analiseId,
      chave_local: chave,
      trava_maquina: null, trava_pid: null, trava_em: null,
      ordem: null, ordem_em: null, ordem_por: null,
      erro: null,
      concluido_em: new Date().toISOString(),
    }

    const q = sb.from('analise_fila').update(mudanca)
    const { data, error } = id ? await q.eq('id', id).select('id, caso_id') : await q.eq('pasta', pasta!).select('id, caso_id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ erro: 'Análise não está na fila.' }, { status: 404 })

    // O caso que originou a análise anda junto: ele sai da esteira do Comercial.
    if (data[0].caso_id) {
      await sb.from('casos').update({ etapa: 'encerrado' }).eq('id', data[0].caso_id)
    }

    return NextResponse.json({ ok: true, analise_id: analiseId, ligou_resultado: !!analiseId })
  }

  // ── erro: falhou, e o motivo fica à vista ─────────────────────────────────
  if (acao === 'erro') {
    const id = String(corpo.id ?? '')
    const pasta = texto(corpo.pasta, 400)
    if (!id && !pasta) return NextResponse.json({ erro: 'Falta dizer qual análise.' }, { status: 422 })

    const mudanca = {
      situacao: 'erro',
      erro: texto(corpo.erro, 1000) ?? 'Falhou sem dizer o motivo.',
      motivo: texto(corpo.erro, 500) ?? 'Falhou sem dizer o motivo.',
      trava_maquina: null, trava_pid: null, trava_em: null,
      ordem: null, ordem_em: null, ordem_por: null,
    }
    const q = sb.from('analise_fila').update(mudanca)
    const { data, error } = id ? await q.eq('id', id).select('id') : await q.eq('pasta', pasta!).select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ erro: 'Análise não está na fila.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  // ── ordem-aceita: o agente confirma que pegou o pedido ────────────────────
  if (acao === 'ordem-aceita') {
    const id = String(corpo.id ?? '')
    if (!id) return NextResponse.json({ erro: 'Falta dizer qual análise.' }, { status: 422 })
    /* Limpar a ordem só DEPOIS de o agente confirmar, e nunca ao entregá-la, é
       o que faz o pedido sobreviver a uma máquina que morre no meio: se ela
       cair antes de executar, a ordem continua lá e a próxima rodada pega. */
    const { data, error } = await sb
      .from('analise_fila')
      .update({ ordem: null, ordem_em: null, ordem_por: null })
      .eq('id', id)
      .select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ erro: 'Análise não está na fila.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  /* ── IA DE GESTÃO: o agente pegou a pergunta, e depois traz a resposta ────
     Duas ações e não uma: entre pegar e responder passam de 20 a 90 segundos, e
     nesse meio tempo a tela precisa dizer "está respondendo" em vez de deixar a
     pessoa achando que nada aconteceu. */
  if (acao === 'ia-pegar') {
    const id = String(corpo.id ?? '')
    const { data, error } = await sb.from('ia_pedidos')
      .update({ estado: 'respondendo', pegue_em: new Date().toISOString(), maquina: texto(corpo.maquina, 120) })
      .eq('id', id).eq('estado', 'pendente')
      .select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    // Sem linha significa que outra máquina pegou primeiro: não é erro, é corrida.
    return NextResponse.json({ ok: true, pegou: !!data?.length })
  }

  if (acao === 'ia-resposta') {
    const id = String(corpo.id ?? '')
    const erroIA = texto(corpo.erro, 600)
    const { error } = await sb.from('ia_pedidos')
      .update({
        estado: erroIA ? 'erro' : 'pronta',
        resposta: erroIA ? null : String(corpo.resposta ?? '').slice(0, 60000),
        erro: erroIA,
        maquina: texto(corpo.maquina, 120),
        respondido_em: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── faxina: execução que morreu sem avisar volta para a fila ──────────────
  if (acao === 'faxina') {
    /* Quem faz esta conta é o SERVIDOR, e não a tela: a tela de duas pessoas
       abertas ao mesmo tempo faria a conta duas vezes e devolveria a análise
       para a fila no meio de uma execução viva. */
    const { data: travadas } = await sb
      .from('analise_fila')
      .select('id, pasta, trava_em, trava_maquina')
      .eq('situacao', 'em_andamento')

    const mortas = (travadas ?? []).filter((t) => travaMorta(t.trava_em))
    for (const m of mortas) {
      await sb
        .from('analise_fila')
        .update({
          situacao: 'pendente',
          motivo: `A execução em ${m.trava_maquina ?? 'uma máquina'} parou de dar notícia. Voltou para a fila.`,
          trava_maquina: null, trava_pid: null, trava_em: null,
        })
        .eq('id', m.id)
    }
    return NextResponse.json({ ok: true, devolvidas: mortas.length })
  }

  return NextResponse.json(
    { erro: 'Ação desconhecida (sincronizar, progresso, concluir, erro, ordem-aceita, faxina).' },
    { status: 422 },
  )
}
