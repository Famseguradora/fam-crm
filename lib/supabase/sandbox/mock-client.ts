// ============================================================
//  SANDBOX — Cliente Supabase FALSO (mock)
//  Imita o query builder do supabase-js (.from().select().eq()...)
//  lendo/escrevendo no store local (Excel + localStorage).
//  NUNCA faz rede: não existe caminho daqui até o banco real.
//  Só é usado quando NEXT_PUBLIC_SANDBOX === 'true'.
// ============================================================
import { getDB, saveDB, type DB, type Row } from './store'

// Usuário fixo do sandbox (entra direto como "Marco", sem login).
export const SANDBOX_USER = {
  id: 'sandbox-user',
  email: 'sandbox@fam.local',
  user_metadata: { nome: 'Marco Dragone' },
}

type Filter =
  | { kind: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'ilike' | 'like'; col: string; val: unknown }
  | { kind: 'in'; col: string; val: unknown[] }
  | { kind: 'is'; col: string; val: unknown }
  | { kind: 'not'; col: string; op: string; val: unknown }
  | { kind: 'or'; expr: string }

type OrderSpec = { col: string; ascending: boolean }

function genId(): string {
  return 'sb-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function nowIso(): string {
  return new Date().toISOString()
}

// premio_previsto é coluna gerada no Postgres; replicamos a fórmula aqui
// para operações criadas/editadas no sandbox ficarem coerentes.
function calcPremio(r: Row): number {
  const lmg = Number(r.lmg) || 0
  const taxa = Number(r.taxa) || 0
  const vigDias = r.vigencia_dias != null ? Number(r.vigencia_dias) : Math.round((Number(r.vigencia_anos) || 1) * 365)
  const base = Math.min(lmg, 80_000_000)
  return Math.round(((base * taxa) / 100) * (vigDias / 365) * 100) / 100
}

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

function matchOp(rowVal: unknown, op: string, val: unknown): boolean {
  switch (op) {
    case 'eq': return rowVal === val
    case 'neq': return rowVal !== val
    case 'gt': return cmp(rowVal, val) > 0
    case 'gte': return cmp(rowVal, val) >= 0
    case 'lt': return cmp(rowVal, val) < 0
    case 'lte': return cmp(rowVal, val) <= 0
    case 'is': return rowVal === val
    default: return false
  }
}

// Parser mínimo da sintaxe OR do Supabase: "and(a.eq.x,b.eq.y),c.eq.z"
function parseLiteral(raw: string): unknown {
  if (raw === 'null') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw !== '' && !isNaN(Number(raw))) return Number(raw)
  return raw
}

function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur) out.push(cur)
  return out
}

function matchCondition(row: Row, cond: string): boolean {
  cond = cond.trim()
  if (cond.startsWith('and(')) {
    const inner = cond.slice(4, -1)
    return splitTop(inner).every((c) => matchCondition(row, c))
  }
  if (cond.startsWith('or(')) {
    const inner = cond.slice(3, -1)
    return splitTop(inner).some((c) => matchCondition(row, c))
  }
  const [col, op, ...rest] = cond.split('.')
  return matchOp(row[col], op, parseLiteral(rest.join('.')))
}

function matchOr(row: Row, expr: string): boolean {
  return splitTop(expr).some((term) => matchCondition(row, term))
}

// ── Parser do select() com embeds relacionais ───────────────────────────────
// Ex.: "*, tomador:tomadores(id,razao_social), corretora:corretoras(id,nome)"
interface Embed { prop: string; table: string; cols: string[] }
interface ParsedSelect { hasStar: boolean; baseCols: string[]; embeds: Embed[] }

function parseSelect(sel: string | undefined): ParsedSelect | null {
  if (!sel || sel.trim() === '*') return null // null = retorna linha inteira
  const tokens = splitTop(sel)
  const res: ParsedSelect = { hasStar: false, baseCols: [], embeds: [] }
  for (let tk of tokens) {
    tk = tk.trim()
    if (!tk) continue
    if (tk === '*') { res.hasStar = true; continue }
    const m = tk.match(/^(?:([\w]+):)?([\w]+)\((.*)\)$/)
    if (m) {
      const prop = m[1] || m[2]
      const table = m[2]
      const cols = m[3].split(',').map((c) => c.trim()).filter(Boolean)
      res.embeds.push({ prop, table, cols })
    } else {
      res.baseCols.push(tk)
    }
  }
  return res
}

function projectEmbed(target: Row | undefined, cols: string[]): Row | null {
  if (!target) return null
  if (cols.includes('*')) return { ...target }
  const o: Row = {}
  for (const c of cols) o[c] = target[c] ?? null
  return o
}

export interface QueryResult<T = unknown> {
  data: T
  error: null | { message: string }
  count?: number | null
}

class QueryBuilder implements PromiseLike<QueryResult> {
  private table: string
  private filters: Filter[] = []
  private orders: OrderSpec[] = []
  private selectStr: string | undefined
  private isSingle = false
  private wantCount = false
  private headOnly = false
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private payload: Row | Row[] | null = null

  constructor(table: string) {
    this.table = table
  }

  select(str?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode === 'select') this.selectStr = str
    else this.selectStr = str // insert/update .select() devolve linhas afetadas
    if (opts?.count) this.wantCount = true
    if (opts?.head) this.headOnly = true
    return this
  }

  eq(col: string, val: unknown) { this.filters.push({ kind: 'eq', col, val }); return this }
  neq(col: string, val: unknown) { this.filters.push({ kind: 'neq', col, val }); return this }
  gt(col: string, val: unknown) { this.filters.push({ kind: 'gt', col, val }); return this }
  gte(col: string, val: unknown) { this.filters.push({ kind: 'gte', col, val }); return this }
  lt(col: string, val: unknown) { this.filters.push({ kind: 'lt', col, val }); return this }
  lte(col: string, val: unknown) { this.filters.push({ kind: 'lte', col, val }); return this }
  ilike(col: string, val: unknown) { this.filters.push({ kind: 'ilike', col, val }); return this }
  like(col: string, val: unknown) { this.filters.push({ kind: 'like', col, val }); return this }
  in(col: string, val: unknown[]) { this.filters.push({ kind: 'in', col, val }); return this }
  is(col: string, val: unknown) { this.filters.push({ kind: 'is', col, val }); return this }
  not(col: string, op: string, val: unknown) { this.filters.push({ kind: 'not', col, op, val }); return this }
  or(expr: string) { this.filters.push({ kind: 'or', expr }); return this }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, ascending: opts?.ascending !== false })
    return this
  }
  limit() { return this }
  range() { return this }

  insert(payload: Row | Row[]) { this.mode = 'insert'; this.payload = payload; return this }
  update(payload: Row) { this.mode = 'update'; this.payload = payload; return this }
  upsert(payload: Row | Row[]) { this.mode = 'upsert'; this.payload = payload; return this }
  delete() { this.mode = 'delete'; return this }

  single() { this.isSingle = true; return this }
  maybeSingle() { this.isSingle = true; return this }

  // ── Filtragem ──
  private applyFilters(rows: Row[]): Row[] {
    return rows.filter((row) =>
      this.filters.every((f) => {
        switch (f.kind) {
          case 'in': return f.val.includes(row[f.col])
          case 'is': return row[f.col] === f.val
          case 'not':
            if (f.op === 'is' && f.val === null) return row[f.col] != null
            return !matchOp(row[f.col], f.op, f.val)
          case 'or': return matchOr(row, f.expr)
          case 'ilike':
          case 'like': {
            // Curingas do SQL LIKE: % = qualquer trecho, _ = um caractere.
            const esc = String(f.val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const pat = '^' + esc.replace(/%/g, '.*').replace(/_/g, '.') + '$'
            const flags = f.kind === 'ilike' ? 'i' : ''
            return new RegExp(pat, flags).test(String(row[f.col] ?? ''))
          }
          default: return matchOp(row[f.col], f.kind, f.val)
        }
      })
    )
  }

  private applyOrder(rows: Row[]): Row[] {
    if (!this.orders.length) return rows
    const sorted = [...rows]
    sorted.sort((a, b) => {
      for (const o of this.orders) {
        const r = cmp(a[o.col], b[o.col])
        if (r !== 0) return o.ascending ? r : -r
      }
      return 0
    })
    return sorted
  }

  private projectRows(db: DB, rows: Row[]): Row[] {
    const parsed = parseSelect(this.selectStr)
    if (!parsed) return rows.map((r) => ({ ...r }))
    return rows.map((row) => {
      const out: Row = { ...row } // base: devolve linha inteira (inofensivo p/ o app)
      for (const emb of parsed.embeds) {
        const fk = row[`${emb.prop}_id`]
        const target = (db[emb.table] ?? []).find((t) => t.id === fk)
        out[emb.prop] = projectEmbed(target, emb.cols)
      }
      return out
    })
  }

  private async run(): Promise<QueryResult> {
    const db = await getDB()
    if (!db[this.table]) db[this.table] = []
    const table = db[this.table]

    // ── Escritas ──
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
      const inserted: Row[] = []
      for (const item of items) {
        if (this.mode === 'upsert' && item.id != null) {
          const idx = table.findIndex((r) => r.id === item.id)
          if (idx >= 0) {
            table[idx] = { ...table[idx], ...item, updated_at: nowIso() }
            if (this.table === 'operacoes') table[idx].premio_previsto = calcPremio(table[idx])
            inserted.push(table[idx])
            continue
          }
        }
        const row: Row = {
          id: item.id ?? genId(),
          created_at: item.created_at ?? nowIso(),
          updated_at: nowIso(),
          ...item,
        }
        if (this.table === 'operacoes') row.premio_previsto = calcPremio(row)
        table.push(row)
        inserted.push(row)
      }
      saveDB(db)
      return this.finalize(db, inserted)
    }

    if (this.mode === 'update') {
      const matched = this.applyFilters(table)
      for (const row of matched) {
        Object.assign(row, this.payload, { updated_at: nowIso() })
        if (this.table === 'operacoes') row.premio_previsto = calcPremio(row)
      }
      saveDB(db)
      return this.finalize(db, matched)
    }

    if (this.mode === 'delete') {
      const matched = this.applyFilters(table)
      const ids = new Set(matched)
      db[this.table] = table.filter((r) => !ids.has(r))
      saveDB(db)
      return this.finalize(db, matched)
    }

    // ── Leitura ──
    let rows = this.applyFilters(table)
    rows = this.applyOrder(rows)
    if (this.headOnly) return { data: null, error: null, count: rows.length }
    return this.finalize(db, rows, rows.length)
  }

  private finalize(db: DB, rows: Row[], count?: number): QueryResult {
    const projected = this.selectStr ? this.projectRows(db, rows) : rows.map((r) => ({ ...r }))
    if (this.isSingle) {
      return { data: projected[0] ?? null, error: null, count: this.wantCount ? (count ?? null) : undefined }
    }
    return { data: projected, error: null, count: this.wantCount ? (count ?? null) : undefined }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected)
  }
}

// ── Auth falso (sempre "logado" como Marco) ──
const mockAuth = {
  async getUser() { return { data: { user: SANDBOX_USER }, error: null } },
  async getSession() { return { data: { session: { user: SANDBOX_USER } }, error: null } },
  onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } } },
  async signInWithPassword() { return { data: { user: SANDBOX_USER }, error: null } },
  async signOut() { return { error: null } },
  async updateUser() { return { data: { user: SANDBOX_USER }, error: null } },
  async resetPasswordForEmail() { return { data: {}, error: null } },
}

// ── Storage falso (sem arquivos reais — anexos ficam em memória) ──
function mockStorage() {
  return {
    from() {
      return {
        async upload() { return { data: { path: '' }, error: null } },
        async remove() { return { data: [], error: null } },
        async createSignedUrl() { return { data: null, error: { message: 'Storage indisponível no sandbox' } } },
        getPublicUrl() { return { data: { publicUrl: '' } } },
      }
    },
  }
}

export function createSandboxClient() {
  return {
    from: (table: string) => new QueryBuilder(table),
    auth: mockAuth,
    storage: mockStorage(),
    async rpc() { return { data: null, error: null } },
    channel() { return { on() { return this }, subscribe() { return this }, unsubscribe() {} } },
    removeChannel() {},
  }
}
