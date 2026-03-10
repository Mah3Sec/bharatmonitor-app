// api/classify.ts — Vercel Edge Function
// Works WITH or WITHOUT ANTHROPIC_API_KEY
// No key → instant keyword classification (free, always works)
// Key set → Claude AI classification

export const config = { runtime: 'edge' }

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) { rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs }); return true }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

const ALLOWED_ORIGINS = ['https://bharatmonitor.vercel.app', 'http://localhost:5173', 'http://localhost:3000']
function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
}

function sanitize(s: string, max = 500) { return String(s || '').replace(/[<>"']/g, '').slice(0, max).trim() }

const CAT_KEYWORDS: Record<string, string[]> = {
  roads:   ['road','highway','pothole','bridge','flyover','nhai','pwd','traffic','construction','pavement','street'],
  water:   ['water','sewage','sanitation','drainage','tap','pipeline','contaminated','jal','flood','drain','supply'],
  power:   ['electricity','power cut','outage','transformer','voltage','discom','blackout','generator','load shedding','electric','coal'],
  health:  ['hospital','doctor','medicine','icu','ambulance','health','medical','aiims','clinic','oxygen','patient','vaccine'],
  corrupt: ['bribe','corruption','scam','fraud','illegal','ration','complaint portal','government officer','acb','cbi','lokayukta'],
}

const SEV_KEYWORDS: Record<string, string[]> = {
  emergency: ['death','died','killed','fatal','collapse','explosion','blast','flood','cyclone','oxygen shortage','cholera'],
  critical:  ['contaminated','outbreak','epidemic','structural failure','bridge crack','no water','blackout','arsenic'],
  high:      ['pothole','power cut','sewage','bribe','shortage','offline','broken','damaged','overflowing','corruption'],
  medium:    ['complaint','issue','problem','repair','pending','maintenance','delay'],
}

const DEPT_MAP: Record<string, string> = {
  roads: 'PWD / NHAI', water: 'Jal Board / Municipal Corporation', power: 'State DISCOM',
  health: 'State Health Department', corrupt: 'Lokayukta / Anti-Corruption Bureau'
}

const MSG_MAP: Record<string, string> = {
  emergency: 'Your emergency report has been registered — please also call 112 for immediate help.',
  critical:  'Your critical issue has been registered and will be escalated to senior officials.',
  high:      'Your report has been received and forwarded to the relevant department for urgent action.',
  medium:    'Your complaint has been registered and will be reviewed within the standard timeline.',
  low:       'Thank you for reporting. Your issue has been logged for departmental review.',
}

const SLA_MAP: Record<string, number> = { emergency: 6, critical: 24, high: 48, medium: 72, low: 168 }

function keywordClassify(title: string, desc: string, cat: string) {
  const text = (title + ' ' + desc).toLowerCase()
  let bestCat = cat, bestCatScore = 0
  for (const [c, kws] of Object.entries(CAT_KEYWORDS)) {
    const score = kws.filter(k => text.includes(k)).length
    if (score > bestCatScore) { bestCatScore = score; bestCat = c }
  }
  let sev = 'medium'
  for (const [s, kws] of Object.entries(SEV_KEYWORDS)) {
    if (kws.some(k => text.includes(k))) { sev = s; break }
  }
  return { severity: sev, department: DEPT_MAP[bestCat] || 'Relevant Authority', sla_hours: SLA_MAP[sev] || 48, message: MSG_MAP[sev] || MSG_MAP.medium }
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip, 30, 60 * 60 * 1000)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  let body: Record<string, string>
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  const title = sanitize(body.title ?? '', 300)
  const desc  = sanitize(body.desc ?? '', 600)
  const state = sanitize(body.state ?? '', 100)
  const cat   = sanitize(body.category ?? 'roads', 50)

  if (!title) return new Response(JSON.stringify({ error: 'Missing title' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

  const apiKey = process.env.ANTHROPIC_API_KEY

  // No API key — keyword classify immediately
  if (!apiKey) {
    const result = keywordClassify(title, desc, cat)
    return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  // API key present — use Claude
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 200,
        messages: [{ role: 'user', content: `Classify Indian civic issue. JSON only, no markdown:\nTitle: ${title}\nState: ${state}\nDesc: ${desc}\n\nReturn: {"severity":"emergency|critical|high|medium|low","department":"official dept","sla_hours":48,"message":"one short sentence to citizen"}` }]
      })
    })
    const data = await res.json()
    const raw = data.content?.map((b: { text?: string }) => b.text ?? '').join('') ?? '{}'
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim())
    const VALID_SEV = ['emergency','critical','high','medium','low']
    return new Response(JSON.stringify({
      severity: VALID_SEV.includes(result.severity) ? result.severity : 'medium',
      department: sanitize(result.department || DEPT_MAP[cat] || 'Relevant Authority', 100),
      sla_hours: typeof result.sla_hours === 'number' ? Math.min(Math.max(result.sla_hours, 1), 168) : 48,
      message: sanitize(result.message || MSG_MAP.medium, 200),
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch {
    const result = keywordClassify(title, desc, cat)
    return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }
}
