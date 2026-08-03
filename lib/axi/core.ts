// ============================================================================
//  AxiMobius — núcleo compartilhado das rotas /api/axi/*
//
//  Regra que este módulo existe para tornar mecânica: o AxiMobius LÊ e nunca
//  escreve. Nenhuma rota exporta POST/PUT/PATCH/DELETE, e o cliente Supabase
//  daqui é usado exclusivamente em `.select()`.
//
//  A segunda regra é a de paridade: número que também aparece numa tela do CRM
//  não é recalculado aqui. `/api/axi/kpis` importa lib/corretoras/agregacoes.ts,
//  o mesmo módulo que o cockpit de Corretoras usa. Se a fórmula mudar lá, muda
//  aqui junto — que é exatamente o que se quer.
// ============================================================================
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

// ── Autenticação ────────────────────────────────────────────────────────────

/**
 * Compara o token em tempo constante. Um `===` vaza, pelo tempo de resposta,
 * quantos caracteres iniciais o atacante acertou, o que torna a descoberta
 * byte a byte viável. `timingSafeEqual` exige buffers do mesmo tamanho, então
 * o comprimento é conferido antes (esse vazamento é inofensivo).
 */
function tokenConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido, 'utf8')
  const b = Buffer.from(esperado, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export type Autorizacao =
  | { ok: true }
  | { ok: false; status: number; erro: string }

export function autorizar(request: Request): Autorizacao {
  const esperado = process.env.AXI_API_TOKEN

  // Sem token configurado a API fica FECHADA, não aberta. O modo inseguro
  // nunca deve ser o padrão de quem esqueceu de setar a variável.
  if (!esperado || esperado.length < 32) {
    return {
      ok: false,
      status: 503,
      erro: 'Integração não configurada: AXI_API_TOKEN ausente ou curto demais (mínimo 32 caracteres).',
    }
  }

  const header = request.headers.get('authorization') ?? ''
  const recebido = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!recebido) {
    return { ok: false, status: 401, erro: 'Envie o header Authorization: Bearer <token>.' }
  }
  if (!tokenConfere(recebido, esperado)) {
    return { ok: false, status: 403, erro: 'Token inválido.' }
  }
  return { ok: true }
}

// ── Cliente de leitura ──────────────────────────────────────────────────────

/**
 * Cliente com service_role: precisa contornar o RLS (todas as policies do CRM
 * são `TO authenticated`, e aqui não há sessão de usuário). A chave nunca sai
 * do servidor; quem chama a rota se autentica pelo AXI_API_TOKEN, não por ela.
 *
 * `persistSession: false` porque a rota é stateless — sem isso o SDK tenta
 * escrever storage num contexto que não tem.
 */
export function clienteLeitura(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

// ── Catálogo do que o AxiMobius pode ler ────────────────────────────────────

export interface TabelaExposta {
  /** Nome real no Postgres. */
  nome: string
  /** Coluna usada para sincronização incremental (`?desde=`). */
  colunaDelta: 'updated_at' | 'created_at' | 'mudou_em' | null
  /** Coluna de ordenação estável para paginação. */
  ordenarPor: string
  /** O que é, em uma linha, para o Claude Code do outro lado entender sem perguntar. */
  descricao: string
  /** Campos com dado pessoal. Documentados para tratamento consciente do outro lado. */
  sensiveis?: string[]
}

/**
 * Whitelist explícita. Tabela que não está aqui não é servida, mesmo que exista
 * no banco: é o que impede uma tabela nova (com dado que ninguém revisou) de
 * vazar para fora só por ter sido criada.
 */
export const TABELAS: TabelaExposta[] = [
  { nome: 'operacoes', colunaDelta: 'updated_at', ordenarPor: 'created_at',
    descricao: 'Operações de seguro garantia: LMG, taxa, vigência, status, subscrição e decisão do Comitê.' },
  { nome: 'tomadores', colunaDelta: 'updated_at', ordenarPor: 'created_at',
    descricao: 'Empresas tomadoras do seguro, com limite aprovado e status na esteira.',
    sensiveis: ['cnpj', 'email', 'telefone', 'celular', 'endereco'] },
  { nome: 'corretoras', colunaDelta: 'updated_at', ordenarPor: 'created_at',
    descricao: 'Corretoras parceiras que originam as operações.',
    sensiveis: ['cnpj', 'email', 'telefone', 'celular', 'endereco'] },
  { nome: 'socios', colunaDelta: 'updated_at', ordenarPor: 'created_at',
    descricao: 'Quadro societário e diretoria dos tomadores, incluindo participação e hierarquia.',
    sensiveis: ['documento'] },
  { nome: 'produtos', colunaDelta: 'updated_at', ordenarPor: 'created_at',
    descricao: 'Produtos comercializados.' },
  { nome: 'modalidades', colunaDelta: 'updated_at', ordenarPor: 'created_at',
    descricao: 'Modalidades por produto, com código de cobertura SUSEP.' },
  { nome: 'metas_negocio', colunaDelta: 'updated_at', ordenarPor: 'created_at',
    descricao: 'Metas mensais e anuais de prêmio, LMG, taxa e sinistralidade.' },
  { nome: 'comite_votos', colunaDelta: 'updated_at', ordenarPor: 'created_at',
    descricao: 'Votos vigentes do Comitê de subscrição, por diretor e operação.' },
  { nome: 'comite_votos_historico', colunaDelta: null, ordenarPor: 'retratado_em',
    descricao: 'Votos retratados: o que o diretor havia votado antes de mudar.' },
  { nome: 'comite_comentarios', colunaDelta: null, ordenarPor: 'created_at',
    descricao: 'Debate da bancada do Comitê, por operação.' },
  { nome: 'status_fluxo_operacao', colunaDelta: null, ordenarPor: 'ordem',
    descricao: 'Etapas configuráveis do funil de operações, com cor e ordem.' },
  { nome: 'status_fluxo_tomador', colunaDelta: null, ordenarPor: 'ordem',
    descricao: 'Etapas configuráveis do funil de tomadores.' },
  { nome: 'anexos', colunaDelta: null, ordenarPor: 'created_at',
    descricao: 'Metadados de documentos anexados. O conteúdo dos arquivos NÃO é exposto, só o registro.' },
  { nome: 'usuarios', colunaDelta: 'updated_at', ordenarPor: 'created_at',
    descricao: 'Usuários do CRM. Útil para atribuir autoria de mudanças e votos.',
    sensiveis: ['email', 'telefone'] },
  { nome: 'audit_log', colunaDelta: null, ordenarPor: 'created_at',
    descricao: 'Trilha antiga, gravada pelas telas desde 02/06/2026. Preferir fam_historico, que é completa.' },
  { nome: 'fam_historico', colunaDelta: 'mudou_em', ordenarPor: 'id',
    descricao: 'TRILHA TEMPORAL COMPLETA, gravada por trigger no banco. Uma linha por campo alterado. É a base de toda análise de variação, funil e tempo em etapa.' },
]

/**
 * As views vivem no schema `axi`, e NÃO são alcançáveis por esta API: `/dados` só
 * serve a whitelist acima (tabelas de `public`), e o `service_role` não tem USAGE em
 * `axi`. Só a role `aximobius_ro` as enxerga, por SQL direto, e ela ainda está NOLOGIN.
 *
 * Isto aqui é documentação honesta do que existe no banco, não um cardápio de pedidos.
 * O que a view resolveria de mais útil (o NOME por trás de cada FK) o `/dados` agora
 * entrega sozinho, via ENRIQUECIMENTO abaixo.
 */
export const VIEWS = [
  { nome: 'axi.vw_operacoes', descricao: 'Operações com tomador, corretora e produto já resolvidos.' },
  { nome: 'axi.vw_status_transicoes', descricao: 'Cada mudança de status com de/para e dias de permanência. dias_no_status NULL = ainda em curso.' },
  { nome: 'axi.vw_tomadores', descricao: 'Tomadores com corretora e contagem de operações/sócios.' },
  { nome: 'axi.vw_corretoras', descricao: 'Corretoras com contagem de tomadores e operações.' },
  { nome: 'axi.vw_linha_do_tempo', descricao: 'Todo evento do CRM em ordem cronológica, com flags afeta_valor e e_mudanca_de_status.' },
]

export function acharTabela(nome: string | null): TabelaExposta | null {
  if (!nome) return null
  return TABELAS.find((t) => t.nome === nome) ?? null
}

// ── Enriquecimento: o nome por trás de cada chave estrangeira ────────────────

/**
 * `select('*')` numa tabela crua devolve `corretora_id` como um UUID solto e mais
 * nada. As telas do CRM não sofrem disso porque pedem `corretora:corretoras(...)`
 * no próprio select, e recebem o nome junto.
 *
 * Essa assimetria já custou caro: o AxiMobius leu `tomadores`, procurou a corretora,
 * achou só UUID e reportou "um monte de tomadores sem corretora". Eram 448 de 448,
 * e todos TINHAM corretora no banco. Um UUID que ninguém resolve é indistinguível
 * de um campo vazio, e o falso positivo vira decisão errada do outro lado.
 *
 * Por isso o `/dados` resolve as FKs antes de responder. Os nomes dos campos são
 * IDÊNTICOS aos das views em `axi` (corretora_razao_social, tomador_cnpj, ...): no
 * dia em que as views forem expostas, os dois caminhos devolvem a mesma coisa e
 * nada do outro lado precisa mudar.
 */
interface RegraEnriquecimento {
  /** Coluna FK na tabela servida. */
  fk: string
  /** Tabela de onde o nome vem. */
  origem: string
  /** coluna da origem → nome do campo acrescentado na resposta. */
  campos: Record<string, string>
}

export const ENRIQUECIMENTO: Record<string, RegraEnriquecimento[]> = {
  tomadores: [
    { fk: 'corretora_id', origem: 'corretoras', campos: {
      razao_social: 'corretora_razao_social',
      nome_fantasia: 'corretora_nome_fantasia',
      status: 'corretora_status',
    } },
  ],
  operacoes: [
    { fk: 'tomador_id', origem: 'tomadores', campos: {
      razao_social: 'tomador_razao_social',
      nome_fantasia: 'tomador_nome_fantasia',
      cnpj: 'tomador_cnpj',
      porte: 'tomador_porte',
      status: 'tomador_status',
      limite_aprovado: 'tomador_limite_aprovado',
    } },
    { fk: 'corretora_id', origem: 'corretoras', campos: {
      razao_social: 'corretora_razao_social',
      nome_fantasia: 'corretora_nome_fantasia',
      cnpj: 'corretora_cnpj',
      status: 'corretora_status',
    } },
    { fk: 'produto_id', origem: 'produtos', campos: {
      nome: 'produto_nome',
      codigo: 'produto_codigo',
    } },
  ],
  socios: [
    { fk: 'tomador_id', origem: 'tomadores', campos: {
      razao_social: 'tomador_razao_social',
      cnpj: 'tomador_cnpj',
    } },
  ],
}

/** `.in()` vai na querystring; lote grande demais estoura o limite de URL do PostgREST. */
const LOTE_IN = 200

/**
 * Acrescenta os campos de nome às linhas, no lugar. Devolve a lista de campos
 * acrescentados, para a resposta poder declarar o que fez.
 *
 * Os campos são sempre escritos, inclusive como `null` quando a FK é nula ou não
 * casa com ninguém. Chave ausente e chave nula significam coisas diferentes para
 * quem consome, e "ausente" é exatamente a ambiguidade que causou o problema.
 */
export async function enriquecerLinhas(
  supabase: SupabaseClient,
  tabela: string,
  linhas: Record<string, unknown>[],
): Promise<string[]> {
  const regras = ENRIQUECIMENTO[tabela]
  if (!regras || linhas.length === 0) return []

  const acrescentados: string[] = []

  for (const regra of regras) {
    const alvos = Object.values(regra.campos)
    acrescentados.push(...alvos)

    const ids = [...new Set(
      linhas.map((l) => l[regra.fk]).filter((v): v is string => typeof v === 'string' && v.length > 0),
    )]

    const mapa = new Map<string, Record<string, unknown>>()
    for (let i = 0; i < ids.length; i += LOTE_IN) {
      const fatia = ids.slice(i, i + LOTE_IN)
      const colunas = ['id', ...Object.keys(regra.campos)].join(',')
      const { data, error } = await supabase.from(regra.origem).select(colunas).in('id', fatia)
      if (error) {
        // Falhar a requisição inteira seria pior que entregar o dado cru: o consumidor
        // perderia também as linhas. Mas o campo fica `null` e o log registra o motivo,
        // para o silêncio não passar por sucesso.
        console.error(`[axi] enriquecimento ${tabela}.${regra.fk} → ${regra.origem} falhou:`, error.message)
        break
      }
      for (const linha of (data ?? []) as unknown as Record<string, unknown>[]) {
        mapa.set(String(linha.id), linha)
      }
    }

    for (const linha of linhas) {
      const chave = linha[regra.fk]
      const origem = typeof chave === 'string' ? mapa.get(chave) : undefined
      for (const [de, para] of Object.entries(regra.campos)) {
        linha[para] = origem ? (origem[de] ?? null) : null
      }
    }
  }

  return acrescentados
}

// ── Utilidades de resposta ──────────────────────────────────────────────────

export const LIMITE_PADRAO = 1000
export const LIMITE_MAXIMO = 5000

export function lerLimite(searchParams: URLSearchParams): number {
  const bruto = Number(searchParams.get('limite') ?? LIMITE_PADRAO)
  if (!Number.isFinite(bruto) || bruto <= 0) return LIMITE_PADRAO
  return Math.min(Math.floor(bruto), LIMITE_MAXIMO)
}

/**
 * Valida `?desde=`. Rejeita data inválida em vez de silenciosamente devolver
 * a base inteira — um delta que vira full sem avisar quebra a sincronização
 * do outro lado sem deixar pista.
 */
export function lerDesde(searchParams: URLSearchParams): { ok: true; valor: string | null } | { ok: false; erro: string } {
  const bruto = searchParams.get('desde')
  if (!bruto) return { ok: true, valor: null }
  const d = new Date(bruto)
  if (Number.isNaN(d.getTime())) {
    return { ok: false, erro: `Parâmetro "desde" inválido: ${bruto}. Use ISO 8601, ex.: 2026-08-01T10:00:00Z` }
  }
  return { ok: true, valor: d.toISOString() }
}

export function erroJson(erro: string, status: number) {
  return Response.json({ ok: false, erro }, { status })
}

/** Cabeçalhos comuns: nunca cachear, e deixar claro que a rota é só leitura. */
export const CABECALHOS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Axi-Modo': 'somente-leitura',
} as const
