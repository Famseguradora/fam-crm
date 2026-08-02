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

export const VIEWS = [
  { nome: 'vw_operacoes', descricao: 'Operações com tomador, corretora e produto já resolvidos. Evita 4 joins.' },
  { nome: 'vw_status_transicoes', descricao: 'Cada mudança de status com de/para e dias de permanência. dias_no_status NULL = ainda em curso.' },
  { nome: 'vw_tomadores', descricao: 'Tomadores com corretora e contagem de operações/sócios.' },
  { nome: 'vw_corretoras', descricao: 'Corretoras com contagem de tomadores e operações.' },
  { nome: 'vw_linha_do_tempo', descricao: 'Todo evento do CRM em ordem cronológica, com flags afeta_valor e e_mudanca_de_status.' },
]

export function acharTabela(nome: string | null): TabelaExposta | null {
  if (!nome) return null
  return TABELAS.find((t) => t.nome === nome) ?? null
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
