// api/rss.ts — Vercel Edge Function
// Server-side RSS proxy for Indian civic news feeds
// • Domain allowlist — rejects any unlisted source
// • 5-minute cache (Cache-Control)
// • Per-domain circuit breaker (in-memory)
// • XSS-safe output — all strings sanitized before return
// • Rate limited: 60 requests per IP per hour

export const config = { runtime: 'edge' }

// ── Allowed Indian news & govt domains ───────────────────────────
const ALLOWED_DOMAINS = new Set([
  'thehindu.com',
  'timesofindia.indiatimes.com',
  'ndtv.com',
  'indianexpress.com',
  'theprint.in',
  'thewire.in',
  'economictimes.indiatimes.com',
  'energy.economictimes.indiatimes.com',
  'hindustantimes.com',
  'business-standard.com',
  'livemint.com',
  'scroll.in',
  'newslaundry.com',
  'nhai.gov.in',
  'mohfw.gov.in',
  'jalshakti-dowr.gov.in',
  'mopng.gov.in',
  'powergrid.in',
  'cbi.gov.in',
  'pib.gov.in',
  'pmindia.gov.in',
  'feedburner.com',
  'feeds.feedburner.com',
])

// ── Rate limiter ──────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

// ── Circuit breaker (per domain) ─────────────────────────────────
const circuitBreaker = new Map<string, { failures: number; openUntil: number }>()
const CIRCUIT_OPEN_MS = 5 * 60 * 1000 // 5 minute cooldown

function isCircuitOpen(domain: string): boolean {
  const cb = circuitBreaker.get(domain)
  if (!cb) return false
  if (Date.now() < cb.openUntil) return true
  circuitBreaker.delete(domain)
  return false
}

function recordFailure(domain: string): void {
  const cb = circuitBreaker.get(domain) ?? { failures: 0, openUntil: 0 }
  cb.failures++
  if (cb.failures >= 3) cb.openUntil = Date.now() + CIRCUIT_OPEN_MS
  circuitBreaker.set(domain, cb)
}

function recordSuccess(domain: string): void {
  circuitBreaker.delete(domain)
}

// ── XSS-safe string escaping ──────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function safeStr(str: string, maxLen = 500): string {
  return escapeHtml(String(str ?? '').trim().slice(0, maxLen))
}

// ── RSS XML → JSON parser ─────────────────────────────────────────
function parseRSS(xml: string): Array<{
  title: string
  link: string
  pubDate: string
  description: string
  guid: string
}> {
  const items: Array<{ title: string; link: string; pubDate: string; description: string; guid: string }> = []
  const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/g)

  for (const match of itemMatches) {
    const block = match[1]

    const get = (tag: string): string => {
      // Try CDATA first
      const cdata = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))
      if (cdata) return cdata[1].trim()
      // Then plain text
      const plain = block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`))
      return plain ? plain[1].trim() : ''
    }

    // Special handling for link (sometimes in CDATA, sometimes bare)
    const linkCdata = block.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/)
    const linkPlain = block.match(/<link>([^<]*)<\/link>/)
    const link = linkCdata?.[1]?.trim() || linkPlain?.[1]?.trim() || ''

    const item = {
      title: safeStr(get('title'), 200),
      link: safeStr(link, 500),
      pubDate: safeStr(get('pubDate'), 100),
      description: safeStr(get('description').replace(/<[^>]*>/g, ''), 400),
      guid: safeStr(get('guid'), 300),
    }

    if (item.title) items.push(item)
    if (items.length >= 20) break
  }

  return items
}

// ── Domain checker ────────────────────────────────────────────────
function isAllowedUrl(url: string): { ok: boolean; domain: string } {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    const ok = ALLOWED_DOMAINS.has(host) || [...ALLOWED_DOMAINS].some(d => host.endsWith('.' + d))
    return { ok, domain: host }
  } catch {
    return { ok: false, domain: '' }
  }
}

// ── CORS ──────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://bharatmonitor.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return { 'Access-Control-Allow-Origin': allowed }
}

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  const feedUrl = new URL(req.url).searchParams.get('url')
  if (!feedUrl) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing url param' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const { ok, domain } = isAllowedUrl(feedUrl)
  if (!ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Domain not in allowlist' }), {
      status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip, 60, 60 * 60 * 1000)) {
    return new Response(JSON.stringify({ ok: false, error: 'Rate limit exceeded' }), {
      status: 429, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Check circuit breaker
  if (isCircuitOpen(domain)) {
    return new Response(JSON.stringify({ ok: false, error: 'Feed temporarily unavailable', circuitOpen: true }), {
      status: 503, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  try {
    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'BharatMonitor/1.0 (https://bharatmonitor.vercel.app)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      recordFailure(domain)
      return new Response(JSON.stringify({ ok: false, error: `Feed returned ${res.status}` }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const xml = await res.text()
    const items = parseRSS(xml)

    recordSuccess(domain)

    return new Response(JSON.stringify({ ok: true, items, fetchedAt: new Date().toISOString() }), {
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60', // 5 min cache
      },
    })
  } catch (err) {
    recordFailure(domain)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
}
