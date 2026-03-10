// api/submit.ts — Vercel Edge Function
// Creates GitHub Issue as public ticket. Rate-limited, content-filtered, sanitised.
export const config = { runtime: 'edge' }

// ── RATE LIMITING ──────────────────────────────────────────────────
// Two-tier: per-IP and global
const ipMap  = new Map<string, {count:number; resetAt:number}>()
const glMap  = new Map<string, {count:number; resetAt:number}>()

function checkRate(key: string, map: Map<string,{count:number;resetAt:number}>, limit: number, windowMs: number): boolean {
  const now = Date.now(), e = map.get(key)
  if (!e || now > e.resetAt) { map.set(key, {count:1, resetAt: now + windowMs}); return true }
  if (e.count >= limit) return false
  e.count++; return true
}

// ── CONTENT FILTER ─────────────────────────────────────────────────
const BLOCKED_URL_PATTERNS = [
  /porn|xxx|sex\.com|adult|nsfw|nude|naked|erotic/i,
  /pornhub|xvideos|xnxx|xhamster|redtube|youporn|brazzers|onlyfans|chaturbate/i,
  /bit\.ly|tinyurl|rb\.gy|t\.ly|cutt\.ly|short\.gy|ow\.ly|goo\.gl\/maps\/[a-z0-9]{5,}/i,
  /grabify|iplogger|blasze|canarytokens|trackurl/i,
  /javascript:|vbscript:|data:text|data:application|file:\/\//i,
  /\.php\?.*base64|eval\(|exec\(|system\(|shell_exec/i,
]

const BLOCKED_TEXT_PATTERNS = [
  /\b(porn|xxx|nude|naked|erotic|obscene)\b/i,
  /\b(rape|molest|sexual assault)\b/i,
  /\b(make.*bomb|build.*bomb|bomb.*recipe|explosive.*how)\b/i,
  /\b(hack.*password|steal.*account|phish)\b/i,
  /\b(click here to earn|free.*prize|win.*lottery|casino|betting site|crypto.*scam)\b/i,
  /<script|<iframe|<object|<embed|on\w+\s*=/i,
  /\b(kill all|genocide|ethnic cleansing)\b/i,
]

function isSafeUrl(url: string): {ok: boolean; reason?: string} {
  if (!url) return {ok: true}
  if (!url.startsWith('https://') && !url.startsWith('http://')) return {ok:false, reason:'URL must start with https://'}
  for (const p of BLOCKED_URL_PATTERNS) {
    if (p.test(url)) return {ok:false, reason:'This URL is not permitted.'}
  }
  return {ok: true}
}

function isSafeText(text: string): {ok: boolean; reason?: string} {
  for (const p of BLOCKED_TEXT_PATTERNS) {
    if (p.test(text)) return {ok:false, reason:'Report contains content not permitted on this platform.'}
  }
  return {ok: true}
}

// ── CORS ───────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = ['https://bharatmonitor-app.vercel.app','http://localhost:5173','http://localhost:3000']
function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'}
}

// ── SANITISER ──────────────────────────────────────────────────────
function san(s: unknown, max = 500): string {
  return String(s ?? '').replace(/[<>"'`]/g, '').replace(/\s+/g,' ').slice(0, max).trim()
}

// ── GITHUB LABEL COLOURS ───────────────────────────────────────────
const CAT_COL: Record<string,string>  = {roads:'FF6B00',water:'00b8e6',power:'ffd700',health:'ff2244',corrupt:'00ddb8',education:'a855f7',transport:'38bdf8',safety:'f97316',environment:'22c55e',other:'64748b'}
const SEV_COL: Record<string,string>  = {emergency:'B60205',critical:'E4E669',high:'FF9F1C',medium:'0075CA',low:'CFD3D7'}

async function ensureLabel(repo: string, token: string, name: string, colour: string) {
  await fetch(`https://api.github.com/repos/${repo}/labels`, {
    method: 'POST',
    headers: {'Authorization':`token ${token}`,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'},
    body: JSON.stringify({name, color: colour, description:`BharatMonitor: ${name}`})
  }).catch(() => {})
}

// ── HANDLER ────────────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin')
  const c = cors(origin)

  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers:c})
  if (req.method !== 'POST')    return new Response('Method not allowed', {status:405, headers:c})

  // Reject non-browser origin (basic bot block)
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({error:'Forbidden'}), {status:403, headers:{...c,'Content-Type':'application/json'}})
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  // Rate limit tier 1: 3 reports per IP per 10 minutes
  if (!checkRate(ip, ipMap, 3, 10 * 60 * 1000)) {
    return new Response(JSON.stringify({error:'Too many reports from your device. Please wait 10 minutes.'}), {status:429, headers:{...c,'Content-Type':'application/json'}})
  }

  // Rate limit tier 2: 50 total reports per 10 minutes (global flood protection)
  if (!checkRate('_global_', glMap, 50, 10 * 60 * 1000)) {
    return new Response(JSON.stringify({error:'Server is receiving too many reports. Please try again in a few minutes.'}), {status:429, headers:{...c,'Content-Type':'application/json'}})
  }

  let body: Record<string,string>
  try { body = await req.json() }
  catch { return new Response(JSON.stringify({error:'Invalid request'}), {status:400, headers:{...c,'Content-Type':'application/json'}}) }

  // Sanitise all inputs
  const cat      = san(body.category || 'other', 30).toLowerCase()
  const state    = san(body.state    || 'India', 60)
  const district = san(body.district || '', 80)
  const title    = san(body.title    || '', 200)
  const desc     = san(body.desc     || '', 800)
  const name     = san(body.name     || 'Anonymous', 80)
  const phone    = san(body.phone    || '', 15).replace(/[^0-9+\s\-()]/g, '')
  const severity = san(body.severity || 'medium', 20).toLowerCase()
  const dept     = san(body.dept     || 'Relevant Authority', 100)
  const mediaUrl = san(body.mediaUrl || '', 500)
  const sla      = parseInt(san(body.sla || '48', 5)) || 48

  // Field validation
  if (!title || title.length < 5)  return new Response(JSON.stringify({error:'Title too short (min 5 chars)'}), {status:400, headers:{...c,'Content-Type':'application/json'}})
  if (!desc  || desc.length < 15)  return new Response(JSON.stringify({error:'Description too short (min 15 chars)'}), {status:400, headers:{...c,'Content-Type':'application/json'}})
  if (!state || state.length < 2)  return new Response(JSON.stringify({error:'State is required'}), {status:400, headers:{...c,'Content-Type':'application/json'}})

  // Content safety check
  const textCheck = isSafeText(title + ' ' + desc + ' ' + name)
  if (!textCheck.ok) return new Response(JSON.stringify({error: textCheck.reason}), {status:400, headers:{...c,'Content-Type':'application/json'}})

  const urlCheck = isSafeUrl(mediaUrl)
  if (!urlCheck.ok) return new Response(JSON.stringify({error: urlCheck.reason}), {status:400, headers:{...c,'Content-Type':'application/json'}})

  const ticket = 'BM-' + new Date().getFullYear().toString().slice(-2) + '-' + Math.floor(10000 + Math.random() * 90000)
  const token  = (typeof process !== 'undefined' ? process.env.GITHUB_TOKEN  : undefined) as string | undefined
  const repo   = (typeof process !== 'undefined' ? process.env.GITHUB_REPO   : undefined) as string | undefined

  if (!token || !repo) {
    return new Response(JSON.stringify({ok:true, ticket, source:'local', severity, department:dept, sla_hours:sla, message:'Registered locally. Add GITHUB_TOKEN + GITHUB_REPO in Vercel for cross-user tracking.'}),
      {headers:{...c,'Content-Type':'application/json'}})
  }

  const mediaSection = mediaUrl
    ? `\n### Evidence\n${/\.(jpg|jpeg|png|gif|webp)/i.test(mediaUrl) ? `![Evidence](${mediaUrl})` : `🔗 ${mediaUrl}`}\n`
    : ''

  const ghBody = `## 🇮🇳 BharatMonitor Civic Issue Report

| Field | Value |
|-------|-------|
| **Ticket** | \`${ticket}\` |
| **Category** | ${cat} |
| **Severity** | ${severity} |
| **State** | ${state} |
| **District** | ${district || '—'} |
| **Department** | ${dept} |
| **SLA** | ${sla} hours |
| **Reporter** | ${name}${phone ? ` / ${phone}` : ''} |
| **Submitted** | ${new Date().toISOString()} |

### Description
${desc}
${mediaSection}
---
*Submitted via [BharatMonitor](https://bharatmonitor-app.vercel.app) · Ticket: ${ticket}*`

  try {
    const stateLabel = `state:${state.toLowerCase().replace(/\s+/g, '-')}`
    await Promise.all([
      ensureLabel(repo, token, cat,        CAT_COL[cat]  || '64748b'),
      ensureLabel(repo, token, severity,   SEV_COL[severity] || '0075CA'),
      ensureLabel(repo, token, stateLabel, '1a4060'),
    ])

    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {'Authorization':`token ${token}`,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'},
      body: JSON.stringify({
        title: `[${cat.toUpperCase()}][${state}] ${title}`,
        body: ghBody,
        labels: [cat, severity, stateLabel]
      })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || `GitHub ${res.status}`)

    return new Response(JSON.stringify({
      ok: true, ticket,
      issueNumber: data.number,
      issueUrl: data.html_url,
      source: 'github',
      severity, department: dept, sla_hours: sla,
      message: 'Your issue is publicly tracked on GitHub.'
    }), {headers:{...c,'Content-Type':'application/json'}})

  } catch(e) {
    return new Response(JSON.stringify({
      ok: true, ticket, source: 'local',
      severity, department: dept, sla_hours: sla,
      message: 'Issue registered. GitHub tracking temporarily unavailable.',
      error: String(e)
    }), {headers:{...c,'Content-Type':'application/json'}})
  }
}
