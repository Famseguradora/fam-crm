import { NextResponse } from 'next/server'

// Cotações mudam durante o pregão; 2 min é um bom equilíbrio (atual sem
// martelar as fontes). O cache do servidor cobre todos os usuários.
export const revalidate = 120

type Kind = 'moeda' | 'indice' | 'commodity' | 'acao' | 'taxa'

interface Quote {
  label: string
  value: string
  pct: number | null   // variação % do dia (null = indicador sem variação diária, ex. Selic)
  kind: Kind
}

function fmtNum(n: number, decimals: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

async function fetchJson(url: string, timeoutMs = 6000): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 120 },
      headers: { 'User-Agent': 'FAM-CRM/1.0 (market)' },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    return await res.json()
  } catch {
    clearTimeout(timer)
    return null
  }
}

// ── Moedas (AwesomeAPI) — sem chave, traz a variação % pronta ────────────────
async function getMoedas(): Promise<Quote[]> {
  const data = await fetchJson('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL') as
    Record<string, { bid?: string; pctChange?: string }> | null
  if (!data) return []
  const out: Quote[] = []
  const pares: Array<[string, string]> = [['USDBRL', 'Dólar'], ['EURBRL', 'Euro']]
  for (const [key, label] of pares) {
    const d = data[key]
    if (!d?.bid) continue
    const bid = parseFloat(d.bid)
    const pct = d.pctChange != null ? parseFloat(d.pctChange) : null
    if (isNaN(bid)) continue
    out.push({ label, value: `R$ ${fmtNum(bid, 2)}`, pct: pct != null && !isNaN(pct) ? pct : null, kind: 'moeda' })
  }
  return out
}

// ── Cotações via Yahoo Finance (sem chave) — índice, commodity e ações ───────
interface YahooMeta { regularMarketPrice?: number; chartPreviousClose?: number }

async function getYahoo(symbol: string, label: string, kind: Kind, decimals: number, prefix: string): Promise<Quote | null> {
  const data = await fetchJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  ) as { chart?: { result?: Array<{ meta?: YahooMeta }> } } | null
  const meta = data?.chart?.result?.[0]?.meta
  const price = meta?.regularMarketPrice
  if (price == null || isNaN(price)) return null
  const prev = meta?.chartPreviousClose
  const pct = prev != null && prev !== 0 ? ((price - prev) / prev) * 100 : null
  return { label, value: `${prefix}${fmtNum(price, decimals)}`, pct, kind }
}

// ── Indicadores oficiais do Banco Central (SGS) — sem chave ──────────────────
async function getBcb(serie: number, label: string): Promise<Quote | null> {
  const data = await fetchJson(
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`
  ) as Array<{ valor?: string }> | null
  const valor = data?.[0]?.valor
  if (valor == null) return null
  const n = parseFloat(valor)
  if (isNaN(n)) return null
  return { label, value: `${fmtNum(n, 2)}%`, pct: null, kind: 'taxa' }
}

export async function GET() {
  const tasks: Array<Promise<Quote[] | Quote | null>> = [
    getMoedas(),                                                       // Dólar, Euro
    getYahoo('^BVSP', 'Ibovespa', 'indice', 0, ''),                   // Ibovespa (pontos)
    getYahoo('PETR4.SA', 'PETR4', 'acao', 2, 'R$ '),
    getYahoo('VALE3.SA', 'VALE3', 'acao', 2, 'R$ '),
    getYahoo('ITUB4.SA', 'ITUB4', 'acao', 2, 'R$ '),
    getYahoo('BBDC4.SA', 'BBDC4', 'acao', 2, 'R$ '),
    getYahoo('ABEV3.SA', 'ABEV3', 'acao', 2, 'R$ '),
    getYahoo('BZ=F', 'Petróleo', 'commodity', 2, 'US$ '),             // Brent
    getBcb(432, 'Selic'),                                             // taxa de juros
    getBcb(13522, 'IPCA 12m'),                                        // inflação acumulada 12 meses
  ]

  const settled = await Promise.allSettled(tasks)
  const quotes: Quote[] = []
  for (const r of settled) {
    if (r.status !== 'fulfilled' || r.value == null) continue
    if (Array.isArray(r.value)) quotes.push(...r.value)
    else quotes.push(r.value)
  }

  return NextResponse.json({ quotes })
}
