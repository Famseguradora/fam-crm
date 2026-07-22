// ============================================================
//  SANDBOX — Store de dados fictícios (NÃO toca no banco real)
//  Lê public/sandbox-dados.xlsx em runtime, mescla com edições
//  salvas no navegador (localStorage) e oferece reset.
//  Só é usado quando NEXT_PUBLIC_SANDBOX === 'true'.
// ============================================================
// 'xlsx' é importado DINAMICAMENTE (dentro de loadFromXlsx) para não
// entrar no bundle de produção via a cadeia client.ts → mock-client → store.

export type Row = Record<string, unknown>
export type DB = Record<string, Row[]>

// Versão do schema de dados do sandbox. Ao mudar a planilha (ex.: status
// canônicos 'Comitê'/'Aprovado'/'Emitido' + abas do Julgamento), bumpamos a
// versão: o localStorage antigo é descartado e a planilha nova recarrega
// sozinha no próximo F5 — sem depender do botão "Resetar".
const DB_VERSION = 'v4'
const LS_KEY = `fam_sandbox_db_${DB_VERSION}`
// Cache-bust: garante que o navegador busque a planilha nova, não a cacheada.
const XLSX_URL = `/sandbox-dados.xlsx?v=${DB_VERSION}`

let dbPromise: Promise<DB> | null = null

// Converte célula do Excel para o tipo esperado pelo app.
function coerce(v: unknown): unknown {
  if (v === '' || v === undefined) return null
  if (v === 'TRUE' || v === 'true') return true
  if (v === 'FALSE' || v === 'false') return false
  return v
}

async function loadFromXlsx(): Promise<DB> {
  const XLSX = await import('xlsx')
  const res = await fetch(XLSX_URL)
  if (!res.ok) throw new Error(`Sandbox: não consegui carregar ${XLSX_URL} (${res.status})`)
  const buf = await res.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const db: DB = {}
  for (const sheet of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheet], { defval: null })
    db[sheet] = rows.map((r) => {
      const o: Row = {}
      for (const k of Object.keys(r)) o[k] = coerce(r[k])
      return o
    })
  }
  return db
}

function persist(db: DB) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(db))
  } catch {
    /* localStorage cheio/indisponível — segue em memória */
  }
}

// Carrega o banco fake uma única vez por sessão. Prioriza o que já foi
// editado no navegador; senão, lê a planilha e guarda.
export function getDB(): Promise<DB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      if (typeof window !== 'undefined') {
        const saved = window.localStorage.getItem(LS_KEY)
        if (saved) {
          try {
            return JSON.parse(saved) as DB
          } catch {
            /* corrompido — recarrega da planilha */
          }
        }
      }
      const db = await loadFromXlsx()
      persist(db)
      return db
    })()
  }
  return dbPromise
}

// Persiste o estado atual (chamado após insert/update/delete do mock).
export function saveDB(db: DB) {
  persist(db)
}

// Volta tudo ao estado original da planilha.
export async function resetDB(): Promise<void> {
  if (typeof window !== 'undefined') window.localStorage.removeItem(LS_KEY)
  dbPromise = null
  await getDB()
}
