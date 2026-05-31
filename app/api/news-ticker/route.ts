import { NextResponse } from 'next/server'

export const revalidate = 600

interface NewsItem {
  title: string
  source: string
}

const FEEDS = [
  { url: 'https://www.infomoney.com.br/feed/', source: 'InfoMoney' },
  { url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', source: 'Ag. Brasil' },
  { url: 'https://www.segs.com.br/rss.xml', source: 'Segs' },
]

function parseTitles(xml: string, source: string, max = 7): NewsItem[] {
  const items: NewsItem[] = []
  const re = /<title[^>]*>(?:<!\[CDATA\[)?\s*([\s\S]*?)\s*(?:\]\]>)?<\/title>/g
  let match
  let skip = true
  while ((match = re.exec(xml)) !== null) {
    if (skip) { skip = false; continue }
    const title = match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#[0-9]+;/g, '')
      .trim()
    if (title && title.length > 5) items.push({ title, source })
    if (items.length >= max) break
  }
  return items
}

export async function GET() {
  const results = await Promise.allSettled(
    FEEDS.map(async ({ url, source }) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          next: { revalidate: 600 },
          headers: { 'User-Agent': 'FAM-CRM/1.0 (news-ticker)' },
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

  const items: NewsItem[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }

  return NextResponse.json({ items })
}
