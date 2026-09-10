// ============================================================================
//  O MOTOR "SERVIDOR" DA IA GESTOR  ·  a API da Anthropic, dentro do CRM
//
//  O irmão do motor 'notebook'. Lá quem responde é o claude.exe da assinatura
//  do Marco, de graça, com a máquina dele ligada. Aqui quem responde é a API:
//  funciona no celular, funciona para a equipe, funciona com o notebook
//  desligado, e custa por token. A TELA NÃO SABE QUAL DOS DOIS RESPONDEU.
//
//  ─── O CUSTO, QUE FOI A PERGUNTA DELE ──────────────────────────────────────
//
//  O mecanismo barato chama PROMPT CACHING, e é isto: o pedaço estável do
//  pedido (o sistema, o catálogo de tabelas, a definição das ferramentas) é
//  gravado no cache da Anthropic na PRIMEIRA chamada, e nas seguintes ele é
//  lido de lá em vez de reprocessado.
//
//      escrever no cache   1,25x o preço do token de entrada
//      ler do cache        0,10x o preço do token de entrada
//
//  A conta exata sai medida em `ia_pedidos.custo_usd`, e não de estimativa. A
//  primeira pergunta real em produção (10/09/2026, um gráfico) custou US$ 0,09.
//
//  O CACHE SÓ FUNCIONA SE O PREFIXO NÃO MUDAR NEM UM BYTE. Por isso o sistema
//  mora inteiro em `lib/ia/esquema.ts`, sem data, sem nome de usuário, sem
//  contagem de linha. O que muda por pergunta entra depois, na fala do usuário.
//  Se `cache_leitura` vier zero em perguntas seguidas, alguma coisa está
//  entrando no prefixo que não devia: é o primeiro lugar para olhar.
//
//  ─── A SOMA NÃO É MAIS DA IA (10/09/2026) ──────────────────────────────────
//
//  A primeira pergunta real saiu com número errado: `consultar` devolve no
//  máximo 200 linhas, o CRM tem 298 operações, e o prompt mandava a IA somar o
//  que viesse. Agora existe `agregar`, que lê a tabela INTEIRA em páginas e faz
//  a conta em Node (lib/ia/agregar.ts), e `painel_do_robo`, que devolve os
//  mesmos números do Painel. A IA não soma linha nenhuma: pede a conta pronta.
//
//  ─── GOVERNANÇA ────────────────────────────────────────────────────────────
//
//  Toda ferramenta que lê o banco recebe o cliente Supabase DA SESSÃO DE QUEM
//  PERGUNTOU. Não existe caminho aqui para a service role. Toda a RLS do CRM
//  vale igual para a IA, e o catálogo de `esquema.ts` é uma segunda trava por
//  cima dela. A IA não é um usuário com poderes: é o próprio usuário.
// ============================================================================
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PODE_LER, SISTEMA } from './esquema'
import { agregarLinhas, colunasNecessarias, validar, type Metrica } from './agregar'
import { lerAcervo, montarCartoes } from './robo'

/* Preço por milhão de tokens, em dólar. Entrada e saída da tabela oficial; o
   cache é derivado dela (1,25x escrever, 0,10x ler) porque é assim que a
   Anthropic cobra, e não um número nosso. */
const PRECO: Record<string, { entrada: number; saida: number }> = {
  // Sonnet 5 e o padrao da IA Gestor. Opus 5 fica na tabela porque os motores
  // de analise de credito e de subscricao vao usa-lo, e a conta e a mesma.
  'claude-sonnet-5': { entrada: 2, saida: 10 },
  'claude-opus-5': { entrada: 5, saida: 25 },
  'claude-opus-4-8': { entrada: 5, saida: 25 },
  'claude-haiku-4-5': { entrada: 1, saida: 5 },
}

export interface BlocoIA {
  tipo: 'tabela' | 'grafico'
  titulo: string
  formato?: string | null
  dados: Record<string, unknown>
  origem?: string | null
}

export interface RespostaIA {
  ok: true
  texto: string
  blocos: BlocoIA[]
  uso: {
    modelo: string
    entrada: number
    saida: number
    cache_escrita: number
    cache_leitura: number
    ferramentas: number
    custo_usd: number
  }
}

export type ResultadoIA = RespostaIA | { ok: false; erro: string; status: number }

/* ══════════════════════════════════════════════════════════════════════════
   AS FERRAMENTAS

   A ordem e o texto delas fazem parte do prefixo cacheado (a API renderiza
   tools -> system -> messages). Então esta constante é montada uma vez e nunca
   é reordenada nem montada dinamicamente: tool list que varia é cache perdido.
   ══════════════════════════════════════════════════════════════════════════ */

/** O formato de filtro, igual nas duas ferramentas que leem o banco. */
const SCHEMA_FILTROS = {
  type: 'array',
  description: 'Condições combinadas com E.',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      coluna: { type: 'string' },
      op: {
        type: 'string',
        enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in'],
      },
      valor: {
        description: 'O valor. Em "in", uma lista. Em "is", use null.',
      },
    },
    required: ['coluna', 'op', 'valor'],
  },
} as const

const FERRAMENTAS: Anthropic.Tool[] = [
  {
    name: 'consultar',
    description:
      'Lê LINHAS de uma tabela do CRM da FAM, para ver lista, detalhe ou nome. Roda com as '
      + 'permissões da pessoa que perguntou. Devolve no máximo 200 linhas e diz quando o resultado '
      + 'foi truncado. NUNCA some, conte ou tire média destas linhas: para isso use agregar.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        tabela: { type: 'string', description: 'Nome exato da tabela, do catálogo do sistema.' },
        colunas: {
          type: 'string',
          description: 'Colunas separadas por vírgula, ou "*". Peça só o que precisa.',
        },
        filtros: SCHEMA_FILTROS,
        ordenar: { type: 'string', description: 'Coluna para ordenar.' },
        descendente: { type: 'boolean' },
        limite: { type: 'number', description: 'Padrão 100, teto 200.' },
      },
      required: ['tabela'],
    },
  },
  {
    name: 'agregar',
    description:
      'Faz a CONTA sobre TODAS as linhas de uma tabela do CRM (sem teto de 200): soma, contagem, '
      + 'média, mínimo e máximo, com agrupamento opcional. Use para qualquer total, ranking, '
      + 'participação ou concentração. Em operacoes, aplica sozinha o cap de R$ 80 milhões no lmg '
      + 'e aceita agrupar_por "mundo" (emitida, funil, encerrada). Devolve os grupos do maior para '
      + 'o menor, com a participação percentual da primeira métrica.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        tabela: { type: 'string', description: 'Nome exato da tabela, do catálogo do sistema.' },
        agrupar_por: {
          type: 'string',
          description: 'Coluna do agrupamento (ex.: status, modalidade, corretora_id). Em operacoes, também "mundo". Omita para um total só.',
        },
        metricas: {
          type: 'array',
          description: 'As contas. A primeira define a ordem e a participação.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              funcao: { type: 'string', enum: ['soma', 'contagem', 'media', 'minimo', 'maximo'] },
              coluna: { type: 'string', description: 'Obrigatória, exceto em contagem de linhas.' },
            },
            required: ['funcao'],
          },
        },
        filtros: SCHEMA_FILTROS,
      },
      required: ['tabela', 'metricas'],
    },
  },
  {
    name: 'painel_do_robo',
    description:
      'Devolve os números de diretoria já calculados pelo Painel do CRM, com as regras de negócio '
      + 'aplicadas: concentração por corretora e por modalidade, tomadores no limite, prêmio '
      + 'emitido, prêmio no funil, operações aprovadas e em Comitê, LMG em risco, ticket médio, '
      + 'taxa média ponderada, urgentes na fila, voto de subscrição e entradas em 30 dias. '
      + 'Sua resposta não pode discordar destes números.',
    input_schema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'montar_tabela',
    description:
      'Desenha uma tabela de verdade na tela do CRM. Use quando os valores precisam ser '
      + 'lidos exatos ou quando há muitas colunas de detalhe. Não escreva tabela em markdown.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        titulo: { type: 'string' },
        colunas: { type: 'array', items: { type: 'string' } },
        linhas: {
          type: 'array',
          description: 'Uma lista por linha, na ordem das colunas.',
          items: { type: 'array', items: {} },
        },
        origem: { type: 'string', description: 'De que consulta saíram estes números.' },
      },
      required: ['titulo', 'colunas', 'linhas', 'origem'],
    },
  },
  {
    name: 'montar_grafico',
    description:
      'Desenha um gráfico de verdade na tela do CRM. barra para comparar itens, '
      + 'linha para evolução no tempo, area para volume no tempo, pizza para composição '
      + '(no máximo seis fatias). Não descreva um gráfico em palavras: monte o bloco.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        titulo: { type: 'string' },
        formato: { type: 'string', enum: ['barra', 'linha', 'area', 'pizza'] },
        eixo: { type: 'string', description: 'Nome do campo que rotula cada ponto.' },
        series: {
          type: 'array',
          description: 'Os campos numéricos desenhados. Na pizza, exatamente um.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              campo: { type: 'string' },
              rotulo: { type: 'string' },
            },
            required: ['campo', 'rotulo'],
          },
        },
        dados: {
          type: 'array',
          description: 'Um objeto por ponto, com o campo do eixo e o de cada série.',
          items: { type: 'object' },
        },
        origem: { type: 'string', description: 'De que consulta saíram estes números.' },
      },
      required: ['titulo', 'formato', 'eixo', 'series', 'dados', 'origem'],
    },
  },
]

/* ══════════════════════════════════════════════════════════════════════════
   OS FILTROS

   Um só aplicador para `consultar` e `agregar`. Duas cópias da tradução de
   filtro seriam duas chances de a lista e a soma responderem a perguntas
   diferentes com o mesmo pedido.
   ══════════════════════════════════════════════════════════════════════════ */
interface Filtro { coluna: string; op: string; valor: unknown }

type Consulta = ReturnType<ReturnType<SupabaseClient['from']>['select']>

function aplicarFiltros(q: Consulta, filtros: Filtro[] | undefined): Consulta | string {
  for (const f of filtros ?? []) {
    const { coluna, op, valor } = f
    if (!coluna || !op) continue
    switch (op) {
      case 'eq': q = q.eq(coluna, valor as never); break
      case 'neq': q = q.neq(coluna, valor as never); break
      case 'gt': q = q.gt(coluna, valor as never); break
      case 'gte': q = q.gte(coluna, valor as never); break
      case 'lt': q = q.lt(coluna, valor as never); break
      case 'lte': q = q.lte(coluna, valor as never); break
      case 'like': q = q.like(coluna, String(valor)); break
      case 'ilike': q = q.ilike(coluna, `%${String(valor).replace(/^%|%$/g, '')}%`); break
      case 'is': q = q.is(coluna, valor as never); break
      case 'in': q = q.in(coluna, (Array.isArray(valor) ? valor : [valor]) as never[]); break
      default: return `ERRO: operador "${op}" não existe.`
    }
  }
  return q
}

/* ══════════════════════════════════════════════════════════════════════════
   CONSULTAR  ·  linhas, com teto

   Três travas, nesta ordem:
   1. a tabela tem que estar no catálogo (`PODE_LER`);
   2. a consulta roda no cliente da SESSÃO da pessoa, então a RLS decide;
   3. o teto de 200 linhas, para uma pergunta larga não virar uma varredura.

   E agora ela CONTA o total e diz quando cortou. O teto não era o defeito: o
   defeito era cortar em silêncio.

   Erro de consulta VOLTA PARA A IA como resultado, e não como exceção: ela
   corrige a coluna e tenta de novo, que é exatamente o que uma pessoa faria.
   ══════════════════════════════════════════════════════════════════════════ */
async function consultar(
  sb: SupabaseClient,
  entrada: Record<string, unknown>,
): Promise<string> {
  const tabela = String(entrada.tabela ?? '')
  if (!PODE_LER(tabela)) {
    return `ERRO: a tabela "${tabela}" não está no catálogo que você pode consultar. Use uma das listadas no sistema.`
  }

  const colunas = String(entrada.colunas ?? '*').trim() || '*'
  const limite = Math.min(Math.max(Number(entrada.limite ?? 100) || 100, 1), 200)

  const filtrada = aplicarFiltros(
    sb.from(tabela).select(colunas, { count: 'exact' }),
    entrada.filtros as Filtro[] | undefined,
  )
  if (typeof filtrada === 'string') return filtrada

  let q = filtrada
  if (entrada.ordenar) {
    q = q.order(String(entrada.ordenar), { ascending: !entrada.descendente })
  }

  const { data, error, count } = await q.limit(limite)
  if (error) return `ERRO na consulta: ${error.message}`

  const linhas = data ?? []
  if (!linhas.length) {
    return 'Nenhuma linha. Pode ser que o dado não exista, ou que quem perguntou não tenha permissão de ver esta tabela.'
  }

  const total = count ?? linhas.length
  const truncado = total > linhas.length
  return JSON.stringify({
    linhas: linhas.length,
    total_na_tabela: total,
    truncado,
    ...(truncado && {
      aviso: `Estas ${linhas.length} linhas são uma AMOSTRA de ${total}. Não some, não conte e não tire média delas: use agregar.`,
    }),
    dados: linhas,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   AGREGAR  ·  a conta, sobre a tabela inteira

   Lê em páginas de 1.000 (o teto do PostgREST por pedido) até acabar, e a
   matemática fica em lib/ia/agregar.ts.

   A ORDEM DAS PÁGINAS é por TODAS as colunas pedidas, e isso é o que torna a
   soma certa em qualquer tabela, com ou sem id: sem ORDER BY, o Postgres pode
   devolver a mesma linha em duas páginas e pular outra. Ordenando por todas as
   colunas lidas, duas linhas só empatam se forem idênticas em tudo que entra
   na conta, e aí trocar uma pela outra não muda o resultado.

   TETO de 50.000 linhas, para uma pergunta sobre a trilha de histórico não
   virar um minuto de varredura. Se bater nele, o resultado diz que bateu.
   ══════════════════════════════════════════════════════════════════════════ */
const PAGINA = 1000
const TETO_LINHAS = 50_000

async function agregar(
  sb: SupabaseClient,
  entrada: Record<string, unknown>,
): Promise<string> {
  const tabela = String(entrada.tabela ?? '')
  if (!PODE_LER(tabela)) {
    return `ERRO: a tabela "${tabela}" não está no catálogo que você pode consultar. Use uma das listadas no sistema.`
  }

  const metricas = (entrada.metricas ?? []) as Metrica[]
  const invalido = validar(metricas)
  if (invalido) return invalido

  const agruparPor = entrada.agrupar_por ? String(entrada.agrupar_por) : undefined
  const filtros = entrada.filtros as Filtro[] | undefined
  const colunas = colunasNecessarias(tabela, agruparPor, metricas)

  /* Só contagem de linhas, sem agrupar: o banco conta sozinho, sem trazer
     linha nenhuma. */
  if (!colunas.length) {
    const filtrada = aplicarFiltros(sb.from(tabela).select('*', { count: 'exact', head: true }), filtros)
    if (typeof filtrada === 'string') return filtrada
    const { error, count } = await filtrada
    if (error) return `ERRO na consulta: ${error.message}`
    return JSON.stringify({ tabela, linhas_lidas: count ?? 0, grupos: [{ grupo: 'total', contagem_linhas: count ?? 0 }] })
  }

  const linhas: Record<string, unknown>[] = []
  let bateuTeto = false
  for (let de = 0; ; de += PAGINA) {
    const filtrada = aplicarFiltros(sb.from(tabela).select(colunas.join(',')), filtros)
    if (typeof filtrada === 'string') return filtrada
    let q = filtrada
    for (const c of colunas) q = q.order(c, { ascending: true, nullsFirst: true })

    const { data, error } = await q.range(de, de + PAGINA - 1)
    if (error) return `ERRO na consulta: ${error.message}`

    const pagina = (data ?? []) as unknown as Record<string, unknown>[]
    linhas.push(...pagina)
    if (pagina.length < PAGINA) break
    if (linhas.length >= TETO_LINHAS) { bateuTeto = true; break }
  }

  if (!linhas.length) {
    return 'Nenhuma linha para agregar. Pode ser que o dado não exista, que o filtro não case com nada, ou que quem perguntou não tenha permissão de ver esta tabela.'
  }

  const r = agregarLinhas(tabela, linhas, agruparPor, metricas, filtros ?? [])
  if (bateuTeto) {
    r.avisos.push(`A leitura parou no teto de ${TETO_LINHAS} linhas: o resultado é PARCIAL. Diga isso na resposta, ou filtre mais.`)
  }

  return JSON.stringify({
    tabela,
    linhas_lidas: linhas.length,
    ...(r.regras.length && { regras_aplicadas: r.regras }),
    ...(r.avisos.length && { avisos: r.avisos }),
    grupos: r.grupos,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   PAINEL DO ROBÔ  ·  os mesmos números da aba Painel

   A IA discutindo um número diferente do que o Painel mostra, na mesma
   janela, seria o pior resultado possível: o diretor não saberia em qual
   acreditar. Então ela lê exatamente o que o robô calculou, com a sessão de
   quem perguntou. Vão só a manchete e a frase: o detalhe, se ela precisar,
   sai da agregar.
   ══════════════════════════════════════════════════════════════════════════ */
async function painelDoRobo(sb: SupabaseClient): Promise<string> {
  try {
    const cartoes = montarCartoes(await lerAcervo(sb))
    return JSON.stringify({
      cartoes: cartoes.map((c) => ({
        area: c.area, titulo: c.titulo, numero: c.numero, contexto: c.sub, alerta: !!c.alerta,
      })),
    })
  } catch (e) {
    return `ERRO: o robô não conseguiu ler o banco (${e instanceof Error ? e.message : String(e)}).`
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   A CHAMADA

   Laço manual em vez do tool_runner do SDK: aqui cada volta precisa injetar o
   cliente Supabase DA PESSOA na execução da ferramenta, e precisa somar o custo
   volta a volta. O laço próprio é curto e deixa as duas coisas explícitas.
   ══════════════════════════════════════════════════════════════════════════ */
export interface PerguntaIA {
  pergunta: string
  /** O fio da conversa, para a IA lembrar do que já foi dito. */
  historico?: { quem: 'pessoa' | 'ia'; texto: string }[]
  /** Quem perguntou e de onde. NUNCA entra no prefixo cacheado. */
  contexto: {
    nome: string
    perfil: string
    tela: string
    /** Se a pergunta foi feita dentro da ficha de um tomador. */
    tomador?: { id: string; razao_social: string } | null
  }
  modelo: string
  esforco: string
  sb: SupabaseClient
}

const MAX_VOLTAS = 8

/** O código de erro que a API manda dentro do corpo, quando manda. */
function codigoDoErro(e: InstanceType<typeof Anthropic.APIError>): string {
  const corpo = e.error as { error?: { details?: { error_code?: string } } } | undefined
  return corpo?.error?.details?.error_code ?? ''
}

export async function perguntarAoServidor(p: PerguntaIA): Promise<ResultadoIA> {
  const chave = process.env.ANTHROPIC_API_KEY
  if (!chave) {
    return { ok: false, erro: 'A chave da API não está no ambiente do CRM (ANTHROPIC_API_KEY).', status: 503 }
  }

  const client = new Anthropic({ apiKey: chave })

  /* O QUE MUDA A CADA PERGUNTA fica AQUI, depois do prefixo cacheado: quem
     perguntou, de que tela, e a data. Se qualquer uma destas linhas subisse
     para o `system`, o cache quebraria em toda pergunta e a economia sumiria. */
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const onde = p.contexto.tomador
    ? `Ela está na ficha do tomador ${p.contexto.tomador.razao_social} (id ${p.contexto.tomador.id}). Quando a pergunta não disser de quem é, é dele.`
    : `Ela está na tela ${p.contexto.tela}.`
  const cabecalho =
    `Quem pergunta: ${p.contexto.nome} (perfil ${p.contexto.perfil}). ${onde}\nHoje é ${hoje}.\n\n`

  const messages: Anthropic.MessageParam[] = []
  for (const m of p.historico ?? []) {
    messages.push({ role: m.quem === 'pessoa' ? 'user' : 'assistant', content: m.texto })
  }
  messages.push({ role: 'user', content: cabecalho + p.pergunta })

  const blocos: BlocoIA[] = []
  let entrada = 0, saida = 0, cacheEscrita = 0, cacheLeitura = 0, ferramentas = 0
  let texto = ''

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    let resposta: Anthropic.Message
    try {
      resposta = await client.messages.create({
        model: p.modelo,
        max_tokens: 16000,
        // O esforço controla profundidade e gasto. `medium` é o padrão da FAM:
        // pergunta de gestão não precisa de `high`, e `high` custa mais.
        output_config: { effort: p.esforco as 'low' | 'medium' | 'high' | 'xhigh' | 'max' },
        // LGPD: inferência nos Estados Unidos, e não em qualquer região.
        inference_geo: 'us',
        // O PREFIXO CACHEADO. `system` vem depois de `tools` na renderização,
        // então marcar aqui cacheia os dois. 1 hora de validade: uma sessão de
        // trabalho inteira cabe dentro dela.
        system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral', ttl: '1h' } }],
        tools: FERRAMENTAS,
        messages,
      })
    } catch (e: unknown) {
      if (e instanceof Anthropic.AuthenticationError) {
        return { ok: false, erro: 'A chave da API da Anthropic foi recusada. Confira a ANTHROPIC_API_KEY.', status: 502 }
      }
      /* O teto mensal da conta volta como 429, igual ao limite por minuto, mas
         não passa com "tente em um minuto": só volta no mês seguinte ou com
         limite maior. Mensagem errada aqui faria alguém ficar tentando à toa. */
      if (e instanceof Anthropic.RateLimitError) {
        if (codigoDoErro(e) === 'enforced_spend_limit_reached') {
          return { ok: false, erro: 'A conta da API atingiu o teto de gasto do mês. Aumente o limite no Console da Anthropic (Settings > Billing).', status: 402 }
        }
        return { ok: false, erro: 'A API está com limite estourado agora. Tente de novo em um minuto.', status: 429 }
      }
      /* Crédito acabado e limite de gasto definido pela própria conta voltam
         como 400. Sem esta checagem, a tela diria "a API respondeu 400" e
         ninguém saberia que a solução é pôr crédito. */
      if (e instanceof Anthropic.BadRequestError) {
        const msg = e.message.toLowerCase()
        if (msg.includes('credit balance')) {
          return { ok: false, erro: 'Acabou o crédito da conta da API. Adicione crédito no Console da Anthropic (Settings > Billing).', status: 402 }
        }
        if (msg.includes('specified api usage limits') || msg.includes('specified workspace api usage limits')) {
          return { ok: false, erro: 'A conta da API atingiu o limite de gasto que foi definido nela. Aumente o limite no Console da Anthropic (Settings > Billing).', status: 402 }
        }
      }
      if (e instanceof Anthropic.APIError) {
        return { ok: false, erro: `A API respondeu ${e.status}: ${e.message}`, status: 502 }
      }
      return { ok: false, erro: 'Não consegui falar com a API da Anthropic.', status: 502 }
    }

    entrada += resposta.usage.input_tokens ?? 0
    saida += resposta.usage.output_tokens ?? 0
    cacheEscrita += resposta.usage.cache_creation_input_tokens ?? 0
    cacheLeitura += resposta.usage.cache_read_input_tokens ?? 0

    /* Recusa por política vem com HTTP 200: sem esta checagem, o `content`
       viria vazio e a tela mostraria uma resposta em branco sem motivo. */
    if (resposta.stop_reason === 'refusal') {
      return { ok: false, erro: 'A IA recusou responder a esta pergunta.', status: 422 }
    }

    for (const bloco of resposta.content) {
      if (bloco.type === 'text') texto += (texto ? '\n\n' : '') + bloco.text
    }

    const pedidos = resposta.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    if (!pedidos.length) break

    /* Toda a história volta, inclusive os blocos de pensamento: a API precisa
       deles inalterados para continuar o mesmo raciocínio. */
    messages.push({ role: 'assistant', content: resposta.content })

    /* TODOS os resultados numa ÚNICA mensagem de usuário. Dividir em várias
       ensina o modelo a parar de pedir ferramentas em paralelo. */
    const resultados: Anthropic.ToolResultBlockParam[] = []
    for (const pedido of pedidos) {
      ferramentas++
      const args = (pedido.input ?? {}) as Record<string, unknown>
      let conteudo = ''

      if (pedido.name === 'consultar') {
        conteudo = await consultar(p.sb, args)
      } else if (pedido.name === 'agregar') {
        conteudo = await agregar(p.sb, args)
      } else if (pedido.name === 'painel_do_robo') {
        conteudo = await painelDoRobo(p.sb)
      } else if (pedido.name === 'montar_tabela') {
        blocos.push({
          tipo: 'tabela',
          titulo: String(args.titulo ?? 'Tabela'),
          dados: { colunas: args.colunas ?? [], linhas: args.linhas ?? [] },
          origem: args.origem ? String(args.origem) : null,
        })
        conteudo = 'Tabela desenhada na tela. Não repita o conteúdo dela no texto.'
      } else if (pedido.name === 'montar_grafico') {
        blocos.push({
          tipo: 'grafico',
          titulo: String(args.titulo ?? 'Gráfico'),
          formato: String(args.formato ?? 'barra'),
          dados: { eixo: args.eixo ?? '', series: args.series ?? [], dados: args.dados ?? [] },
          origem: args.origem ? String(args.origem) : null,
        })
        conteudo = 'Gráfico desenhado na tela. Não descreva os valores dele no texto.'
      } else {
        conteudo = `ERRO: ferramenta "${pedido.name}" não existe.`
      }

      resultados.push({
        type: 'tool_result',
        tool_use_id: pedido.id,
        content: conteudo,
        is_error: conteudo.startsWith('ERRO'),
      })
    }

    messages.push({ role: 'user', content: resultados })
  }

  /* Modelo desconhecido cai no PADRAO DA CASA (Sonnet 5), e nao no mais caro:
     se um dia entrar um id novo aqui sem preco, e melhor a conta sair baixa e
     alguem estranhar do que sair alta e ninguem conferir. */
  const preco = PRECO[p.modelo] ?? PRECO['claude-sonnet-5']
  const custo =
    (entrada * preco.entrada
      + cacheEscrita * preco.entrada * 1.25
      + cacheLeitura * preco.entrada * 0.1
      + saida * preco.saida) / 1_000_000

  return {
    ok: true,
    texto: texto.trim() || 'Não consegui montar uma resposta para isso.',
    blocos,
    uso: {
      modelo: p.modelo,
      entrada,
      saida,
      cache_escrita: cacheEscrita,
      cache_leitura: cacheLeitura,
      ferramentas,
      custo_usd: Number(custo.toFixed(6)),
    },
  }
}
