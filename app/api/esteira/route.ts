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
//                                     têm, o hash, quem está rodando agora, a
//                                     lista de arquivos, a triagem, a linha de
//                                     processos, os recados, as alçadas
//     o CRM é dono da DECISÃO         o que uma pessoa mandou fazer, de qual
//                                     caso a análise nasceu, o resultado, a
//                                     nota, o encaminhamento, o "lido", a
//                                     autorização
//
//  Por isso `sincronizar` NUNCA encosta em `ordem`, `caso_id`, `analise_id`,
//  `tomador_id`, `instrucao`, `substatus` nem `arquivos_fora`: são campos do
//  lado do CRM. E a tela NUNCA escreve situação nem hash: são do lado do disco.
//  Cada lado escreve só o que ele sabe, e assim não existe o caso de um
//  sobrescrever a verdade do outro.
//
//  O APERTO DE MÃO (09/09/2026): o que o CRM decide sobre coisa que mora no
//  disco (recado lido, alçada autorizada, arquivo tirado da análise) fica
//  marcado com `*_no_crm_em`; o agente lê no GET, aplica no disco, e confirma
//  com `recados-ok` / `alcadas-ok`. Até confirmar, a tela já mostra a decisão
//  (é dela), e o disco alcança em segundos.
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

const texto = (v: unknown, max = 300) => {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}
const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const objeto = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
const lista = (v: unknown) => (Array.isArray(v) ? v : [])

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
    .select('id, pasta, chave, ordem, ordem_por, ordem_em, ordem_dados, situacao, caso_id, cnpj, razao_social, instrucao, modo, arquivos_fora')
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
    .select('id, pasta, chave, situacao, hash_documentos, trava_maquina, trava_em, arquivos_fora, arquivos_fora_em, sincronizado_em')
    .order('atualizado_em', { ascending: false })
    .limit(300)

  /* A SELEÇÃO DE ARQUIVOS QUE MUDOU NO CRM desde a última sincronização. O
     agente aplica no arquivos.mjs e a próxima sincronização traz a lista de
     volta já com a marca. */
  const arquivosFora = (fila ?? []).filter((f) =>
    f.arquivos_fora_em && (!f.sincronizado_em || f.arquivos_fora_em > f.sincronizado_em))

  /* AS PERGUNTAS DA IA. Quem responde é o `claude.exe` desta máquina, pela
     assinatura que já se paga: a pergunta nasce no CRM (de qualquer lugar,
     inclusive do celular) e a resposta volta para o banco, onde a equipe lê.
     Só as do motor "notebook" saem por aqui — quando o motor virar "servidor",
     quem responde é a rota da API e estas nem aparecem para o agente.

     A do CARD (escopo `analise`) leva junto a chave da análise no motor, para
     o agente saber se responde o auditor do relatório ou o auditor da pasta. */
  const { data: iaPedidos } = await sb
    .from('ia_pedidos')
    .select('id, pergunta, escopo, analise_id, fila_id, pasta, chave, conversa_id, criado_por_nome, criado_em, analise:analises(chave_local)')
    .eq('estado', 'pendente')
    .eq('motor', 'notebook')
    .order('criado_em', { ascending: true })
    .limit(3)
  const ia = (iaPedidos ?? []).map((p) => {
    const rel = p.analise as unknown as { chave_local: string } | { chave_local: string }[] | null
    const analiseChave = Array.isArray(rel) ? rel[0]?.chave_local : rel?.chave_local
    return { ...p, analise: undefined, analise_chave: analiseChave ?? null }
  })

  /* OS RECADOS QUE ALGUÉM LEU OU ARQUIVOU NO CRM, esperando o disco alcançar. */
  const { data: recadosMarcados } = await sb
    .from('analise_recados')
    .select('id, lido_no_crm_em, arquivado_no_crm_em')
    .is('confirmado_em', null)
    .or('lido_no_crm_em.not.is.null,arquivado_no_crm_em.not.is.null')
    .limit(100)

  /* AS ALÇADAS DECIDIDAS NO CRM (autorizar / negar), e as alçadas redefinidas. */
  const { data: alcadasDecisoes } = await sb
    .from('agente_pedidos')
    .select('id, decisao_crm, decisao_crm_por, decisao_crm_motivo')
    .not('decisao_crm', 'is', null)
    .is('aplicado_em', null)
    .limit(50)
  const { data: alcadasTodas } = await sb
    .from('agente_alcadas')
    .select('acao, alcada, alterado_por, definido_no_crm_em, aplicado_em')
    .not('definido_no_crm_em', 'is', null)
  const alcadasDefinidas = (alcadasTodas ?? []).filter((a) => !a.aplicado_em || a.definido_no_crm_em > a.aplicado_em)

  /* OS COMANDOS DA MESA que não são de uma análise só. */
  const { data: comandos } = await sb
    .from('analise_comandos')
    .select('id, comando, por, criado_em')
    .is('aceito_em', null)
    .order('criado_em', { ascending: true })
    .limit(10)

  return NextResponse.json({
    ok: true,
    maquina,
    ordens: ordens ?? [],
    a_materializar: aMaterializar ?? [],
    fila: fila ?? [],
    arquivos_fora: arquivosFora.map((f) => ({ id: f.id, pasta: f.pasta, chave: f.chave, arquivos_fora: f.arquivos_fora ?? [] })),
    ia,
    recados_marcados: recadosMarcados ?? [],
    alcadas_decisoes: alcadasDecisoes ?? [],
    alcadas_definidas: alcadasDefinidas,
    comandos: comandos ?? [],
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
  cnpj_confiavel?: boolean
  chave_local?: string
  trava_maquina?: string
  trava_pid?: number
  /** O nome antigo, quando a análise renomeou a pasta. Ver o cabeçalho da migration. */
  pasta_anterior?: string
  // o que o card precisa (09/09/2026)
  chave?: string
  fase?: string
  nome?: string
  corretora?: string
  produto?: string
  docs?: unknown
  cadastro?: unknown
  arquivos?: unknown
  biblioteca?: unknown
  linha?: unknown
  parado_desde?: string
  analise_chave?: string
  substatus_motor?: { texto?: string; por?: string; em?: string } | null
  arquivada?: boolean
  concluido_em?: string
  notas?: { id: string; titulo?: string; html?: string; fixada?: boolean; em?: string; nome?: string }[]
}

export async function POST(req: NextRequest) {
  const barrado = porteiro(req)
  if (barrado) return barrado
  const sb = admin()
  if (!sb) return NextResponse.json({ erro: 'Supabase não configurado.' }, { status: 503 })

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* cai na validação */ }
  const acao = String(corpo.acao ?? '')
  const agora = new Date().toISOString()

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
        trava_em: situacao === 'em_andamento' ? agora : null,
        sincronizado_em: agora,
        arquivada: !!p.arquivada,
      }

      // O que o card precisa. Cada um só entra quando veio: linha antiga do
      // agente antigo não apaga o que a nova já tinha gravado.
      if (p.fase !== undefined) doDisco.fase = texto(p.fase, 30)
      if (p.nome !== undefined) doDisco.nome = texto(p.nome, 200)
      if (p.corretora !== undefined) doDisco.corretora = texto(p.corretora, 200)
      if (p.produto !== undefined) doDisco.produto = texto(p.produto, 200)
      if (p.docs !== undefined) doDisco.docs = objeto(p.docs)
      if (p.cadastro !== undefined) doDisco.cadastro = objeto(p.cadastro)
      if (p.arquivos !== undefined) doDisco.arquivos = objeto(p.arquivos)
      if (p.biblioteca !== undefined) doDisco.biblioteca = objeto(p.biblioteca)
      if (p.linha !== undefined) doDisco.linha = lista(p.linha).slice(0, 200)
      if (p.parado_desde !== undefined) doDisco.parado_desde = texto(p.parado_desde, 40)
      if (p.analise_chave !== undefined) doDisco.analise_chave = texto(p.analise_chave, 120)
      if (p.cnpj_confiavel !== undefined) doDisco.cnpj_confiavel = !!p.cnpj_confiavel
      if (p.concluido_em && situacao === 'concluida') doDisco.concluido_em = texto(p.concluido_em, 40)

      /* IDENTIFICAÇÃO SÓ ENTRA QUANDO VEM PREENCHIDA, e nunca em branco.
         O `avaliar()` do motor não conhece CNPJ nem chave: quem identifica a
         empresa é a análise, mais tarde. Mandar o campo vazio APAGARIA o CNPJ
         que a Triagem já tinha apurado, e o CNPJ é o que liga caso, cadastro e
         análise. Perder isso é perder a costura inteira. */
      const razao = texto(p.razao_social)
      const cnpjDoDisco = digitos(p.cnpj)
      const chave = texto(p.chave_local)
      const chaveTomador = texto(p.chave, 120)
      if (razao) doDisco.razao_social = razao
      if (cnpjDoDisco.length === 14) doDisco.cnpj = cnpjDoDisco
      if (chave) doDisco.chave_local = chave
      if (chaveTomador) doDisco.chave = chaveTomador

      const { data: existe } = await sb
        .from('analise_fila')
        .select('id, situacao, analise_id, tomador_id, cnpj, substatus, substatus_em')
        .eq('pasta', pasta).maybeSingle()

      /* O SUBSTATUS tem dois donos e uma regra: vale o mais novo. O do motor
         (escrito no cockpit) só sobe quando o CRM não tem um mais recente. */
      const sm = p.substatus_motor
      if (sm && sm.texto && (!existe?.substatus_em || (sm.em && sm.em > existe.substatus_em))) {
        doDisco.substatus = texto(sm.texto, 120)
        doDisco.substatus_por = texto(sm.por, 80) ?? 'Marco'
        doDisco.substatus_em = texto(sm.em, 40) ?? agora
      }

      /* AS DUAS COSTURAS DO LADO DO CRM, feitas aqui porque é aqui que o dado
         chega: o resultado (`analises` por `chave_local`, que é o id da análise
         no motor) e o tomador (por CNPJ). Nunca sobrescrevem o que já estava. */
      const analiseChave = texto(p.analise_chave, 120) ?? chave
      if (analiseChave && !existe?.analise_id) {
        const { data: a } = await sb.from('analises').select('id').eq('chave_local', analiseChave).maybeSingle()
        if (a?.id) doDisco.analise_id = a.id
      }
      const cnpjFinal = cnpjDoDisco.length === 14 ? cnpjDoDisco : digitos(existe?.cnpj)
      if (cnpjFinal.length === 14 && !existe?.tomador_id) {
        const { data: t } = await sb.from('tomadores').select('id').eq('cnpj', cnpjFinal).limit(2)
        if (t?.length === 1) doDisco.tomador_id = t[0].id
      }

      let filaId: string | null = existe?.id ?? null
      if (existe) {
        const { data, error } = await sb
          .from('analise_fila').update(doDisco).eq('id', existe.id).select('id')
        if (error || !data?.length) recusadas.push(`${pasta} (${error?.message ?? 'não gravou'})`)
        else atualizadas++
      } else {
        const { data, error } = await sb
          .from('analise_fila').insert({ pasta, ...doDisco, criado_por: 'motor' }).select('id')
        if (error || !data?.length) recusadas.push(`${pasta} (${error?.message ?? 'não gravou'})`)
        else { criadas++; filaId = data[0].id }
      }

      /* AS NOTAS DO MOTOR. Entram com origem=motor e o id de lá: a nota que ele
         escreveu no cockpit aparece no card do CRM, e a que ele escrever no CRM
         fica no CRM. Nunca uma apaga a outra. */
      if (filaId && chaveTomador && Array.isArray(p.notas) && p.notas.length) {
        const linhas = p.notas.slice(0, 200).map((n) => ({
          id: `motor:${chaveTomador}:${String(n.id)}`.slice(0, 200),
          chave: chaveTomador,
          fila_id: filaId,
          cnpj: cnpjFinal.length === 14 ? cnpjFinal : null,
          titulo: texto(n.titulo, 120),
          html: String(n.html ?? '').slice(0, 4 * 1024 * 1024),
          fixada: !!n.fixada,
          origem: 'motor',
          autor_nome: texto(n.nome, 80) ?? 'Marco',
          em: texto(n.em, 40) ?? agora,
          atualizado_em: agora,
        }))
        await sb.from('analise_notas').upsert(linhas, { onConflict: 'id' })
      }
    }

    /* O RETRATO DA ESTEIRA: quantas rodando, vagas, última varredura. É o que
       enche os cinco números da Mesa, e é UMA linha, sempre reescrita. */
    const estado = objeto(corpo.estado)
    if (estado) {
      await sb.from('analise_estado').upsert({
        id: 'esteira', dados: estado, maquina: texto(corpo.maquina, 120), atualizado_em: agora,
      }, { onConflict: 'id' })
    }

    return NextResponse.json({ ok: true, criadas, atualizadas, total: entrada.length, recusadas })
  }

  // ── recados: o mural inteiro, como está no disco ──────────────────────────
  if (acao === 'recados') {
    const entrada = lista(corpo.recados) as Record<string, unknown>[]
    const linhas = entrada.slice(0, 400).map((r) => ({
      id: String(r.id ?? '').slice(0, 80),
      em: texto(r.em, 40) ?? agora,
      agente: texto(r.agente, 40) ?? 'sistema',
      titulo: texto(r.titulo, 300) ?? '(sem título)',
      texto: String(r.texto ?? '').slice(0, 20000) || null,
      pasta: texto(r.pasta, 400),
      chave: texto(r.chave, 120),
      cnpj: digitos(r.chave).length === 14 ? digitos(r.chave) : null,
      assinatura: texto(r.assinatura, 300),
      nivel: texto(r.nivel, 20) ?? 'normal',
      acoes: lista(r.acoes).slice(0, 10),
      dados: objeto(r.dados),
      lido_em: texto(r.lido_em, 40),
      arquivado_em: texto(r.arquivado_em, 40),
      sincronizado_em: agora,
    })).filter((r) => r.id)

    /* O RELATÓRIO DO AUDITOR-CHEFE entra como o primeiro recado do mural, com
       id fixo: é assim que a tela dele mostra (o relatório é o 1º item da lista). */
    const rel = objeto(corpo.relatorio)
    if (rel && rel.texto) {
      linhas.unshift({
        id: 'relatorio',
        em: texto(rel.em, 40) ?? agora,
        agente: 'auditor',
        titulo: `Relatório da operação, últimos ${Number(rel.janela_dias ?? 30) || 30} dias`,
        texto: String(rel.texto).slice(0, 60000),
        pasta: null, chave: null, cnpj: null,
        assinatura: 'auditor:relatorio',
        nivel: 'normal',
        acoes: [],
        dados: { licao: rel.licao ?? null, janela_dias: rel.janela_dias ?? 30, escrevendo: !!corpo.escrevendo },
        lido_em: null, arquivado_em: null,
        sincronizado_em: agora,
      })
    }
    if (!linhas.length) return NextResponse.json({ ok: true, gravados: 0 })
    const { error } = await sb.from('analise_recados').upsert(linhas, { onConflict: 'id' })
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, gravados: linhas.length })
  }

  if (acao === 'recados-ok') {
    const ids = lista(corpo.ids).map(String).slice(0, 200)
    if (!ids.length) return NextResponse.json({ ok: true, confirmados: 0 })
    const { data: marcados } = await sb.from('analise_recados')
      .select('id, lido_no_crm_em, arquivado_no_crm_em').in('id', ids)
    for (const m of marcados ?? []) {
      await sb.from('analise_recados').update({
        confirmado_em: agora,
        ...(m.lido_no_crm_em ? { lido_em: m.lido_no_crm_em } : {}),
        ...(m.arquivado_no_crm_em ? { arquivado_em: m.arquivado_no_crm_em } : {}),
      }).eq('id', m.id)
    }
    return NextResponse.json({ ok: true, confirmados: (marcados ?? []).length })
  }

  /* ── conversas: o fio inteiro da IA de Gestão, do disco para o CRM ────────
     São 37 assuntos e ~160 falas que ele acumulou desde 12/08/2026. O disco é
     a fonte e o CRM espelha: a conversa que ele abre aqui vira pedido, o
     `gestao.mjs` grava no jsonl, e a sincronização seguinte traz as duas
     falas. Uma verdade só, e por isso o upsert é por id estável. */
  if (acao === 'conversas') {
    const conversas = lista(corpo.conversas) as Record<string, unknown>[]
    const mensagens = lista(corpo.mensagens) as Record<string, unknown>[]
    if (!conversas.length) return NextResponse.json({ ok: true, conversas: 0, mensagens: 0 })

    /* O TÍTULO QUE ELE ESCREVEU NO CRM NÃO É SOBRESCRITO pelo automático do
       disco. `titulo_dele` é a mesma marca dos dois lados. */
    const { data: renomeadas } = await sb.from('ia_conversas').select('id, titulo, titulo_dele').eq('titulo_dele', true)
    const meuTitulo = new Map((renomeadas ?? []).map((c) => [c.id, c.titulo]))

    const linhas = conversas.slice(0, 400).map((c) => {
      const id = texto(c.id, 60)!
      return {
        id,
        titulo: meuTitulo.get(id) ?? (texto(c.titulo, 200) ?? ''),
        titulo_dele: meuTitulo.has(id) || !!c.titulo_dele,
        escopo: 'gestao', origem: 'motor',
        criada: texto(c.criada, 40) ?? agora,
        ultima: texto(c.ultima, 40) ?? agora,
        trocas: Number(c.trocas ?? 0) || 0,
        sincronizado_em: agora,
      }
    }).filter((c) => c.id)

    const { error: e1 } = await sb.from('ia_conversas').upsert(linhas, { onConflict: 'id' })
    if (e1) return NextResponse.json({ erro: e1.message }, { status: 500 })

    const conhecidas = new Set(linhas.map((c) => c.id))
    const falas = mensagens.slice(0, 4000)
      .filter((m) => conhecidas.has(String(m.conversa_id ?? '')))
      .map((m) => ({
        id: texto(m.id, 200)!,
        conversa_id: String(m.conversa_id),
        quem: m.quem === 'ia' ? 'ia' : 'marco',
        texto: String(m.texto ?? '').slice(0, 200000),
        em: texto(m.em, 40) ?? agora,
        segundos: Number(m.segundos ?? 0) || null,
        origem: 'motor',
      }))
      .filter((m) => m.id && m.texto)

    // Em lotes: 4 mil falas num upsert só é um corpo grande demais para a rota.
    for (let i = 0; i < falas.length; i += 500) {
      const { error } = await sb.from('ia_mensagens').upsert(falas.slice(i, i + 500), { onConflict: 'id' })
      if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, conversas: linhas.length, mensagens: falas.length })
  }

  // ── alçadas: o catálogo, os pedidos e o diário do alcadas.mjs ─────────────
  if (acao === 'alcadas') {
    const catalogo = lista(corpo.catalogo) as Record<string, unknown>[]
    const pedidos = lista(corpo.pedidos) as Record<string, unknown>[]
    const diario = lista(corpo.diario) as Record<string, unknown>[]

    // A alçada que o CRM redefiniu e o disco ainda não aplicou não pode ser
    // sobrescrita pela leitura do disco: valeria a versão velha por um minuto.
    const { data: pendentes } = await sb.from('agente_alcadas')
      .select('acao, definido_no_crm_em, aplicado_em').not('definido_no_crm_em', 'is', null)
    const travadas = new Set((pendentes ?? [])
      .filter((a) => !a.aplicado_em || a.definido_no_crm_em > a.aplicado_em).map((a) => a.acao))

    for (const a of catalogo.slice(0, 50)) {
      const acaoId = texto(a.id, 60)
      if (!acaoId || travadas.has(acaoId)) continue
      await sb.from('agente_alcadas').upsert({
        acao: acaoId,
        alcada: ['livre', 'pedir', 'proibido'].includes(String(a.alcada)) ? String(a.alcada) : 'pedir',
        rotulo: texto(a.rotulo, 200), o_que_faz: texto(a.o_que_faz, 500), desfaz: texto(a.desfaz, 500),
        padrao: texto(a.padrao, 20), alterado_em: agora,
      }, { onConflict: 'acao' })
    }

    const statusOk = new Set(['aberto', 'autorizado', 'negado', 'vencido', 'executado'])
    for (const p of pedidos.slice(0, 200)) {
      const id = texto(p.id, 80)
      if (!id) continue
      const args = objeto(p.args) ?? {}
      const status = statusOk.has(String(p.estado ?? p.status)) ? String(p.estado ?? p.status) : 'aberto'
      const { error } = await sb.from('agente_pedidos').upsert({
        id, acao: texto(p.acao, 60) ?? '?', assinatura: texto(p.assinatura, 300) ?? id,
        args, quem: texto(p.quem, 60) ?? 'auditor', motivo: String(p.motivo ?? '').slice(0, 4000) || null,
        status, pedido_em: texto(p.pedido_em ?? p.em, 40) ?? agora,
        decidido_em: texto(p.decidido_em, 40), decidido_por: texto(p.decidido_por, 80),
        resultado: String(p.resultado ?? '').slice(0, 2000) || null,
        acao_rotulo: texto(p.acao_rotulo, 200),
        pasta: texto(args.pasta, 400), chave: texto(args.chave, 120),
      }, { onConflict: 'id' })
      if (error) return NextResponse.json({ erro: `pedido ${id}: ${error.message}` }, { status: 500 })
    }

    const linhasDiario = diario.slice(0, 300).map((l) => ({
      chave_motor: `${l.em}|${l.tipo}|${l.acao ?? ''}|${l.pedido_id ?? ''}`.slice(0, 300),
      em: texto(l.em, 40) ?? agora, tipo: texto(l.tipo, 40) ?? 'execucao', acao: texto(l.acao, 60),
      quem: texto(l.quem, 60), por: texto(l.por, 80), de: texto(l.de, 40), para: texto(l.para, 40),
      args: objeto(l.args), motivo: String(l.motivo ?? '').slice(0, 2000) || null,
      pedido_id: texto(l.pedido_id, 80), ok: typeof l.ok === 'boolean' ? l.ok : null,
    }))
    if (linhasDiario.length) {
      await sb.from('agente_diario').upsert(linhasDiario, { onConflict: 'chave_motor', ignoreDuplicates: true })
    }
    return NextResponse.json({ ok: true, catalogo: catalogo.length, pedidos: pedidos.length, diario: linhasDiario.length })
  }

  if (acao === 'alcadas-ok') {
    const ids = lista(corpo.pedidos).map(String)
    const acoes = lista(corpo.acoes).map(String)
    if (ids.length) await sb.from('agente_pedidos').update({ aplicado_em: agora }).in('id', ids)
    if (acoes.length) await sb.from('agente_alcadas').update({ aplicado_em: agora }).in('acao', acoes)
    return NextResponse.json({ ok: true })
  }

  // ── comandos da Mesa: aceito e feito ──────────────────────────────────────
  if (acao === 'comando-aceito' || acao === 'comando-feito') {
    const id = String(corpo.id ?? '')
    if (!id) return NextResponse.json({ erro: 'Falta o comando.' }, { status: 422 })
    const mudanca = acao === 'comando-aceito'
      ? { aceito_em: agora }
      : { feito_em: agora, resultado: String(corpo.resultado ?? '').slice(0, 2000) || null }
    await sb.from('analise_comandos').update(mudanca).eq('id', id)
    return NextResponse.json({ ok: true })
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
      etapa_em: agora,
      trava_maquina: texto(corpo.maquina, 120),
      trava_pid: Number(corpo.pid ?? 0) || null,
      trava_em: agora,
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
      etapa_em: agora,
      hash_documentos: texto(corpo.hash_documentos, 100),
      analise_id: analiseId,
      chave_local: chave,
      analise_chave: chave,
      trava_maquina: null, trava_pid: null, trava_em: null,
      ordem: null, ordem_em: null, ordem_por: null, ordem_dados: null,
      erro: null,
      concluido_em: agora,
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
      ordem: null, ordem_em: null, ordem_por: null, ordem_dados: null,
    }
    const q = sb.from('analise_fila').update(mudanca)
    const { data, error } = id ? await q.eq('id', id).select('id') : await q.eq('pasta', pasta!).select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ erro: 'Análise não está na fila.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  // ── ordem-aceita: o agente confirma que pegou o pedido ────────────────────
  if (acao === 'ordem-aceita' || acao === 'ordem-falhou') {
    const id = String(corpo.id ?? '')
    if (!id) return NextResponse.json({ erro: 'Falta dizer qual análise.' }, { status: 422 })
    /* Limpar a ordem só DEPOIS de o agente confirmar, e nunca ao entregá-la, é
       o que faz o pedido sobreviver a uma máquina que morre no meio: se ela
       cair antes de executar, a ordem continua lá e a próxima rodada pega.

       O RESULTADO fica escrito na linha ("comecei", "o motor recusou: ..."),
       porque quem clicou está olhando a tela esperando saber o que aconteceu. */
    const resultado = texto(corpo.resultado ?? corpo.erro, 600)
    const { data, error } = await sb
      .from('analise_fila')
      .update({
        ordem: null, ordem_em: null, ordem_por: null, ordem_dados: null,
        ...(resultado ? { ultima_ordem_resultado: (acao === 'ordem-falhou' ? 'Não deu: ' : '') + resultado, ultima_ordem_em: agora } : {}),
      })
      .eq('id', id)
      .select('id')
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ erro: 'Análise não está na fila.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  /* ── A IA: o agente pegou a pergunta, e depois traz a resposta ────────────
     Duas ações e não uma: entre pegar e responder passam de 20 a 90 segundos, e
     nesse meio tempo a tela precisa dizer "está respondendo" em vez de deixar a
     pessoa achando que nada aconteceu. */
  if (acao === 'ia-pegar') {
    const id = String(corpo.id ?? '')
    const { data, error } = await sb.from('ia_pedidos')
      .update({ estado: 'respondendo', pegue_em: agora, maquina: texto(corpo.maquina, 120) })
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
        respondido_em: agora,
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
    { erro: 'Ação desconhecida (sincronizar, recados, recados-ok, conversas, alcadas, alcadas-ok, comando-aceito, comando-feito, progresso, concluir, erro, ordem-aceita, ordem-falhou, ia-pegar, ia-resposta, faxina).' },
    { status: 422 },
  )
}
