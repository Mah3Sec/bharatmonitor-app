// api/rss.ts — Vercel Edge Function
// Proxies Indian RSS feeds to avoid browser CORS restrictions
// Parses XML and returns structured JSON issues

export const config = { runtime: 'edge' }

// Allowed feed domains (security allowlist)
const ALLOWED_DOMAINS = [
  'thehindu.com',
  'timesofindia.indiatimes.com',
  'ndtv.com',
  'indianexpress.com',
  'theprint.in',
  'thewire.in',
  'economictimes.indiatimes.com',
  'energy.economictimes.indiatimes.com',
  'nhai.gov.in',
  'mohfw.gov.in',
  'jalshakti-dowr.gov.in',
  'mopng.gov.in',
  'powergrid.in',
  'cbi.gov.in',
]

function isAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    return ALLOWED_DOMAINS.some(d => host === d || host.endsWith('.' + d))
  } catch {
    return false
  }
}

// Simple RSS XML → JSON parser
function parseRSS(xml: string): Array<{ title: string; link: string; pubDate: string; description: string }> {
  const items: Array<{ title: string; link: string; pubDate: string; description: string }> = []
  const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/g)

  for (const match of itemMatches) {
    const block = match[1]
    const get = (tag: string): string => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`))
      return (m?.[1] || m?.[2] || '').trim()
    }
    items.push({
      title: get('title'),
      link: get('link'),
      pubDate: get('pubDate'),
      description: get('description'),
    })
    if (items.length >= 20) break
  }

  return items
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url).searchParams.get('url')
  if (!url) return new Response('Missing url param', { status: 400 })
  if (!isAllowed(url)) return new Response('Domain not allowed', { status: 403 })

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BharatMonitor/1.0 (+https://bharatmonitor.app)' },
      signal: AbortSignal.timeout(5000),
    })
    const xml = await res.text()
    const items = parseRSS(xml)

    return new Response(JSON.stringify({ ok: true, items }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',  // Cache 5 minutes
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
