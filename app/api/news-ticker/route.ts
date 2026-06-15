import { NextResponse } from 'next/server'

export const revalidate = 600

interface NewsItem {
  title: string
  source: string
  link: string
}

// Fontes verificadas (todas respondendo 200). Mantemos um mix de economia
// geral + setor de seguros, que é o que interessa para a FAM Seguradora.
const FEEDS = [
  { url: 'https://g1.globo.com/rss/g1/economia/', source: 'G1 Economia' },
  { url: 'https://g1.globo.com/rss/g1/politica/', source: 'G1 Política' },
  { url: 'https://www.infomoney.com.br/feed/', source: 'InfoMoney' },
  { url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', source: 'Ag. Brasil' },
  // URL canônica sem "www": www.cqcs.com.br responde 301 e o fetch com cache
  // perde o corpo do feed (a fonte sumia da faixa). Apontamos direto.
  { url: 'https://cqcs.com.br/feed/', source: 'CQCS Seguros' },
]

// Entidades nomeadas que aparecem com frequência em feeds brasileiros.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  agrave: 'à', acirc: 'â', ecirc: 'ê', ocirc: 'ô',
  atilde: 'ã', otilde: 'õ', ccedil: 'ç',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  Agrave: 'À', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô',
  Atilde: 'Ã', Otilde: 'Õ', Ccedil: 'Ç',
  ordf: 'ª', ordm: 'º', deg: '°', euro: '€', pound: '£', cent: '¢',
}

// Decodifica entidades numéricas (decimais e hexadecimais) e nomeadas.
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)) } catch { return '' }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)) } catch { return '' }
    })
    .replace(/&([a-zA-Z]+);/g, (whole, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : whole
    )
}

// Limpa um título cru de feed: remove CDATA, tags HTML, decodifica entidades
// e normaliza espaços. É aqui que evitamos "códigos aparecendo" na faixa.
function cleanTitle(raw: string): string {
  let t = raw
  // Remove invólucros CDATA, se sobraram.
  t = t.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
  // Remove quaisquer tags HTML.
  t = t.replace(/<[^>]*>/g, '')
  // Decodifica entidades (pode ser preciso 2 passes: ex. &amp;#243;).
  t = decodeEntities(decodeEntities(t))
  // Normaliza espaços em branco.
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

// Extrai o link da matéria DENTRO do bloco do próprio item — por isso o link
// sempre corresponde ao título certo. Só aceita URL http(s) absoluta; qualquer
// coisa diferente vira string vazia (a notícia fica sem link, nunca com link errado).
function extractLink(itemXml: string): string {
  const rss = /<link\b[^>]*>([\s\S]*?)<\/link>/i.exec(itemXml)
  const candidate = rss && rss[1].trim()
    ? cleanTitle(rss[1])
    : (/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i.exec(itemXml)?.[1]?.trim() ?? '')
  try {
    const u = new URL(candidate)
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.toString() : ''
  } catch {
    return ''
  }
}

// Extrai os títulos de cada <item> do RSS, ignorando o <title> do canal.
function parseTitles(xml: string, source: string, max = 6): NewsItem[] {
  const items: NewsItem[] = []
  const itemRe = /<item\b[\s\S]*?<\/item>/gi
  const titleRe = /<title[^>]*>([\s\S]*?)<\/title>/i

  let itemMatch: RegExpExecArray | null
  while ((itemMatch = itemRe.exec(xml)) !== null) {
    const titleMatch = titleRe.exec(itemMatch[0])
    if (!titleMatch) continue
    const title = cleanTitle(titleMatch[1])
    const link = extractLink(itemMatch[0])
    if (title.length > 8) items.push({ title, source, link })
    if (items.length >= max) break
  }
  return items
}

// Intercala as fontes em rodízio para a faixa não ficar com 6 notícias
// seguidas da mesma fonte.
function interleave(groups: NewsItem[][]): NewsItem[] {
  const out: NewsItem[] = []
  const maxLen = Math.max(0, ...groups.map(g => g.length))
  for (let i = 0; i < maxLen; i++) {
    for (const g of groups) {
      if (g[i]) out.push(g[i])
    }
  }
  return out
}

export async function GET() {
  const results = await Promise.allSettled(
    FEEDS.map(async ({ url, source }) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          next: { revalidate: 600 },
          // UA de navegador: feeds atrás de Cloudflare (ex.: CQCS) desafiam/
          // bloqueiam UA de robô vindo de IP de datacenter (Vercel). Localmente
          // sai do IP do escritório e passa; em produção, não. Com UA de browser
          // + Accept de RSS o Cloudflare libera o feed no servidor também.
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
          },
        })
        clearTimeout(timer)
        if (!res.ok) return [] as NewsItem[]
        const xml = await res.text()
        return parseTitles(xml, source)
      } catch {
        clearTimeout(timer)
        return [] as NewsItem[]
      }
    })
  )

  const groups: NewsItem[][] = results.map(r =>
    r.status === 'fulfilled' ? r.value : []
  )

  return NextResponse.json({ items: interleave(groups) })
}
