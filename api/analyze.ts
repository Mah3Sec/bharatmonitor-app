// api/analyze.ts — Vercel Edge Function
// Server-side AI analysis proxy — API key NEVER reaches the browser
// Rate limited: 10 analysis requests per IP per hour

export const config = { runtime: 'edge' }

// ── Simple in-memory rate limiter ─────────────────────────────────
// Resets per cold start, but still provides meaningful protection
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

// ── CORS origins ──────────────────────────────────────────────────
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

// ── Input sanitizer ───────────────────────────────────────────────
function sanitize(str: string, maxLen = 500): string {
  return String(str).replace(/[<>"']/g, '').slice(0, maxLen).trim()
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors })
  }

  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip, 10, 60 * 60 * 1000)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in an hour.' }), {
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
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Validate and sanitize inputs
  const title = sanitize(body.title ?? '', 300)
  const state = sanitize(body.state ?? '', 100)
  const district = sanitize(body.district ?? '', 100)
  const category = sanitize(body.category ?? '', 50)
  const severity = sanitize(body.severity ?? '', 50)
  const department = sanitize(body.department ?? '', 100)
  const reports = parseInt(body.reports ?? '0', 10) || 0

  if (!title || !category) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const prompt = `You are BharatMonitor — India's civic issue intelligence platform. Analyze this issue clearly for Indian citizens:

Issue: ${title}
State: ${state}${district ? `, ${district}` : ''}
Category: ${category} | Severity: ${severity} | Department: ${department}
Reports filed: ${reports.toLocaleString()}

Respond in this EXACT format — plain language, no jargon, no markdown:

WHAT IS HAPPENING
(2 sentences. Simple English.)

WHO IS AFFECTED
(1 sentence)

WHAT SHOULD BE DONE
• (specific action 1)
• (specific action 2)
• (specific action 3)

RESPONSIBLE AUTHORITY
(Department name + who citizen can escalate to)

EXPECTED RESOLUTION
(Realistic timeline in Indian context)

Keep total under 180 words. Write for a regular Indian citizen.`

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
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await res.json()
    const text: string = data.content?.map((b: { text?: string }) => b.text ?? '').join('') ?? ''

    if (!text) {
      return new Response(JSON.stringify({ error: 'Empty response from AI' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ text }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'AI service error' }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
}
