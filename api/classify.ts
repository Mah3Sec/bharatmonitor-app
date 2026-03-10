// api/classify.ts — Vercel Edge Function
// AI issue classification — server-side only, never exposes API key
// Rate limited: 20 classifications per IP per hour

export const config = { runtime: 'edge' }

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

const ALLOWED_ORIGINS = [
  'https://bharatmonitor.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function sanitize(str: string, maxLen = 500): string {
  return String(str).replace(/[<>"']/g, '').slice(0, maxLen).trim()
}

const VALID_CATEGORIES = ['roads', 'water', 'power', 'health', 'corrupt']
const VALID_SEVERITIES = ['emergency', 'critical', 'high', 'medium', 'low']

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip, 20, 60 * 60 * 1000)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const title = sanitize(body.title ?? '', 300)
  const desc  = sanitize(body.desc ?? '', 800)
  const state = sanitize(body.state ?? '', 100)
  const cat   = sanitize(body.category ?? 'roads', 50)

  if (!title || !state) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        messages: [{
          role: 'user',
          content: `Classify this Indian civic issue report. Reply ONLY with valid JSON, no markdown:

Title: ${title}
Category hint: ${cat}
State: ${state}
Description: ${desc}

Return exactly: {"severity":"emergency|critical|high|medium|low","department":"official govt dept name","sla_hours":24,"message":"one short sentence encouraging the citizen in simple English"}`,
        }],
      }),
    })

    const data = await res.json()
    const raw: string = data.content?.map((b: { text?: string }) => b.text ?? '').join('') ?? '{}'
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const result = JSON.parse(cleaned)

    // Validate output — never trust LLM output blindly
    const severity = VALID_SEVERITIES.includes(result.severity) ? result.severity : 'medium'
    const department = sanitize(result.department ?? 'Relevant Authority', 100)
    const sla_hours = typeof result.sla_hours === 'number' ? Math.min(Math.max(result.sla_hours, 1), 168) : 48
    const message = sanitize(result.message ?? 'Your report has been registered.', 200)

    return new Response(JSON.stringify({ severity, department, sla_hours, message }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch {
    // Fallback classification — never show an error to citizen
    return new Response(JSON.stringify({
      severity: 'medium',
      department: 'Relevant State Authority',
      sla_hours: 48,
      message: 'Your report has been received. We will review and forward it to the appropriate department.',
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
}
