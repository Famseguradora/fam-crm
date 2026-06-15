import { NextResponse } from 'next/server'

export const revalidate = 600

interface NewsItem {
  title: string
  source: string
  link: string
}

interface Feed {
  url: string
  source: string
  // Feed alternativo (Google News RSS) usado quando o direto falha ou é
  // bloqueado. O Cloudflare de alguns portais (ex.: CQCS) desafia o IP de
  // datacenter da Vercel — passa local, falha publicado. O Google News é
  // servido pelo Google e nunca bloqueia datacenter, então é a rede de
  // segurança que garante a fonte na produção.
  fallback?: string
}

// RSS do Google News para um portal/assunto — robusto em produção.
function googleNews(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-150`
}

// Fontes da faixa: mix de economia geral + setor de seguros (o que interessa
// para a FAM Seguradora). Portais de seguros sem RSS próprio (CNseg, Notícias
// do Seguro) entram via Google News.
const FEEDS: Feed[] = [
  { url: 'https://g1.globo.com/rss/g1/economia/', source: 'G1 Economia' },
  { url: 'https://g1.globo.com/rss/g1/politica/', source: 'G1 Política' },
  { url: 'https://www.infomoney.com.br/feed/', source: 'InfoMoney' },
  { url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', source: 'Ag. Brasil' },
  // CQCS: feed direto (links canônicos quando responde, ex.: local) com
  // fallback via Google News para quando o Cloudflare bloqueia a Vercel.
  {
    url: 'https://cqcs.com.br/feed/',
    source: 'CQCS Seguros',
    fallback: googleNews('site:cqcs.com.br when:7d'),
  },
  // Notícias do Seguro (portal de notícias do CNseg) — site Next.js estático,
  // sem RSS. Só via Google News.
  { url: googleNews('site:noticiasdoseguro.org.br when:14d'), source: 'Notícias do Seguro' },
  // CNseg — sem RSS próprio; agregamos as matérias institucionais.
  { url: googleNews('CNseg seguros when:14d'), source: 'CNseg' },
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

// O Google News acrescenta " - Veículo" ao fim de cada título. Removemos esse
// sufixo já que a própria badge da faixa indica a fonte.
function stripPublisherSuffix(title: string): string {
  return title.replace(/\s[-–—]\s[^-–—]+$/, '').trim()
}

// Confere se o corpo é mesmo um feed (e não uma página de desafio do
// Cloudflare, que volta 200 com HTML). Sem isso, o parser acharia 0 itens e a
// fonte sumiria silenciosamente.
function looksLikeFeed(xml: string): boolean {
  return /<rss[\s>]|<feed[\s>]|<item[\s>]|<entry[\s>]/i.test(xml)
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
// `stripSuffix` limpa o " - Veículo" dos feeds do Google News.
function parseTitles(xml: string, source: string, stripSuffix: boolean, max = 6): NewsItem[] {
  const items: NewsItem[] = []
  const itemRe = /<item\b[\s\S]*?<\/item>/gi
  const titleRe = /<title[^>]*>([\s\S]*?)<\/title>/i

  let itemMatch: RegExpExecArray | null
  while ((itemMatch = itemRe.exec(xml)) !== null) {
    const titleMatch = titleRe.exec(itemMatch[0])
    if (!titleMatch) continue
    let title = cleanTitle(titleMatch[1])
    if (stripSuffix) title = stripPublisherSuffix(title)
    const link = extractLink(itemMatch[0])
    if (title.length > 8) items.push({ title, source, link })
    if (items.length >= max) break
  }
  return items
}

// Busca um feed e devolve o XML só se for um feed de verdade. Retorna null em
// erro, timeout, status != 200 ou corpo que não parece feed (desafio Cloudflare).
async function fetchFeed(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 600 },
      // UA de navegador + Accept de RSS: reduz o bloqueio de feeds atrás de
      // Cloudflare quando a requisição sai do IP de datacenter da Vercel.
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
      },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const xml = await res.text()
    return looksLikeFeed(xml) ? xml : null
  } catch {
    clearTimeout(timer)
    return null
  }
}

const isGoogleNews = (url: string) => url.includes('news.google.com')

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
    FEEDS.map(async (feed): Promise<NewsItem[]> => {
      // Tenta o feed direto; se falhar/for bloqueado, cai no Google News.
      let chosenUrl = feed.url
      let xml = await fetchFeed(feed.url)
      if (!xml && feed.fallback) {
        chosenUrl = feed.fallback
        xml = await fetchFeed(feed.fallback)
      }
      if (!xml) return []
      return parseTitles(xml, feed.source, isGoogleNews(chosenUrl))
    })
  )

  const groups: NewsItem[][] = results.map(r =>
    r.status === 'fulfilled' ? r.value : []
  )

  return NextResponse.json({ items: interleave(groups) })
}
