// api/analyze.ts — Vercel Edge Function
// Works WITH or WITHOUT ANTHROPIC_API_KEY
// No key → smart keyword-based analysis (free, instant, no auth needed)
// Key set → full Claude AI analysis

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

function sanitize(s: string, max = 400) { return String(s || '').replace(/[<>"']/g, '').slice(0, max).trim() }

function keywordAnalysis(title: string, location: string, category: string, severity: string, department: string): string {
  const actions: Record<string, string[]> = {
    roads:   ['File complaint on CPGRAMS portal (cpgrams.gov.in) — free and trackable', 'Contact local PWD / NHAI office with photos and exact location', 'Tag @MORTHIndia on social media with GPS coordinates'],
    water:   ['Call Jal Shakti helpline: 1800-180-1551 (free, 24x7)', 'File complaint at your Municipal Corporation water department counter', 'Contact State PHED (Public Health Engineering Dept) district office'],
    power:   ['Call State DISCOM helpline — number is printed on your electricity bill', 'Register complaint at vidyutsaathi.gov.in (national electricity portal)', 'Visit your local Sub-Division Office of the electricity board in person'],
    health:  ['Call National Health Helpline: 104 (free, available 24x7)', 'Contact Chief Medical Officer (CMO) of your district directly', 'File complaint at National Human Rights Commission: nhrc.nic.in'],
    corrupt: ['File anonymous complaint at CVC portal: cvc.gov.in (Central Vigilance Commission)', 'Contact your State Lokayukta or Anti-Corruption Bureau', 'Call Transparent Whistleblower helpline: 1800-110-180 (free)'],
  }
  const sevNote: Record<string, string> = {
    emergency: 'EMERGENCY: If no response in 24 hours, escalate directly to District Collector office.',
    critical:  'CRITICAL: Escalate to department head if no response in 48 hours.',
    high:      'HIGH PRIORITY: Follow up after 3-5 working days if complaint is not acknowledged.',
    medium:    'Expect resolution in 7-14 working days under standard government SLA.',
    low:       'Routine issue — follow up after 15 working days if unresolved.',
  }
  const what: Record<string, string> = {
    roads:   'A road infrastructure problem is affecting commuters and residents. This may involve potholes, damaged bridges, broken lights, or construction hazards.',
    water:   'A water supply or sanitation failure is affecting residents. This may involve contamination, sewage overflow, broken pipelines, or disrupted supply to households.',
    power:   'An electricity supply disruption is affecting homes and businesses. This may involve power cuts, transformer failure, voltage issues, or load shedding.',
    health:  'A healthcare service failure is affecting patients. This may involve staff shortages, medicine gaps, equipment failure, or administrative issues at a facility.',
    corrupt: 'A corruption or governance failure is blocking citizens from accessing services. This may involve bribery, portal outages, document delays, or illegal official conduct.',
  }
  const bullets = (actions[category] || actions.roads).map(a => `• ${a}`).join('\n')
  return `WHAT IS HAPPENING
${what[category] || 'A civic issue has been reported that requires government attention and action.'}

WHO IS AFFECTED
Residents and citizens of ${location} who depend on ${category === 'roads' ? 'road transport' : category === 'water' ? 'water and sanitation services' : category === 'power' ? 'electricity supply' : category === 'health' ? 'healthcare facilities' : 'public government services'} are directly impacted.

WHAT SHOULD BE DONE
${bullets}

RESPONSIBLE AUTHORITY
${department}. ${sevNote[severity] || sevNote.medium}

EXPECTED RESOLUTION
${severity === 'emergency' ? '24-48 hours after escalation to district authorities.' : severity === 'critical' ? '3-7 days after formal complaint registration.' : severity === 'high' ? '7-14 working days after filing with the department.' : '14-30 working days under government SLA guidelines.'}`
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip, 20, 60 * 60 * 1000)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  let body: Record<string, string>
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  const title      = sanitize(body.title ?? '', 300)
  const state      = sanitize(body.state ?? 'India', 100)
  const district   = sanitize(body.district ?? '', 100)
  const category   = sanitize(body.category ?? 'roads', 50)
  const severity   = sanitize(body.severity ?? 'medium', 50)
  const department = sanitize(body.department ?? 'Relevant Authority', 100)
  const location   = state + (district ? `, ${district}` : '')

  if (!title) return new Response(JSON.stringify({ error: 'Missing title' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

  const apiKey = process.env.ANTHROPIC_API_KEY

  // No API key — return keyword analysis immediately (free, works always)
  if (!apiKey) {
    return new Response(JSON.stringify({ text: keywordAnalysis(title, location, category, severity, department), source: 'keyword' }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  // API key present — use Claude AI
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 600,
        messages: [{ role: 'user', content: `Analyze for Indian citizens (plain text, no markdown):\n\nIssue: ${title}\nLocation: ${location}\nCategory: ${category} | Severity: ${severity} | Dept: ${department}\n\nFormat:\nWHAT IS HAPPENING\n(2 sentences)\n\nWHO IS AFFECTED\n(1 sentence)\n\nWHAT SHOULD BE DONE\n• action 1\n• action 2\n• action 3\n\nRESPONSIBLE AUTHORITY\n(dept + escalation)\n\nEXPECTED RESOLUTION\n(timeline)\n\nUnder 180 words.` }]
      })
    })
    const data = await res.json()
    const text = data.content?.map((b: { text?: string }) => b.text ?? '').join('') ?? ''
    if (!text) throw new Error('empty')
    return new Response(JSON.stringify({ text, source: 'ai' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ text: keywordAnalysis(title, location, category, severity, department), source: 'keyword' }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
}
