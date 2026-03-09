import './style.css'
import { initMap, addIssueMarkers } from './map'
import { STATES } from './data/states'
import { DEMO_ISSUES } from './data/issues'
import type { Issue, StateData, Category, Severity } from './types'

// ── App state ──────────────────────────────────────────────────────
let issues: Issue[] = [...DEMO_ISSUES]
let filteredIssues: Issue[] = [...DEMO_ISSUES]
let activeFilter: Category | 'all' = 'all'
let activeTab: 'feed' | 'report' | 'ai' = 'feed'
let selectedIssue: Issue | null = null
let liveCount = 124832
let tickerIdx = 0

const CAT_COLOR: Record<string, string> = {
  roads: '#FF7518', water: '#00B4D8', power: '#FFD700', health: '#FF4455', corrupt: '#00E5CC'
}
const CAT_ICON: Record<string, string> = {
  roads: '🛣️', water: '💧', power: '⚡', health: '🏥', corrupt: '🔍'
}
const CAT_LABEL: Record<string, string> = {
  roads: 'Roads', water: 'Water', power: 'Power', health: 'Health', corrupt: 'Corruption'
}

// ── Build HTML shell ───────────────────────────────────────────────
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <!-- HEADER -->
  <header id="header">
    <div class="logo">🇮🇳 Bharat<span class="logo-accent">Watch</span></div>
    <div class="header-center">
      <div class="live-dot"></div>
      <span id="liveCount">${liveCount.toLocaleString('en-IN')}</span> active issues across India
    </div>
    <div class="header-right">
      <button class="btn-report" id="btnReport">+ Report Issue</button>
    </div>
  </header>

  <!-- BODY -->
  <div id="body">

    <!-- MAP -->
    <div id="map">
      <!-- Stats overlay -->
      <div id="mapStats">
        <div class="stat-chip">
          <div class="stat-val">36</div>
          <div class="stat-lbl">States & UTs</div>
        </div>
        <div class="stat-chip green">
          <div class="stat-val">89.2K</div>
          <div class="stat-lbl">Resolved 30d</div>
        </div>
        <div class="stat-chip sky">
          <div class="stat-val">47.2L</div>
          <div class="stat-lbl">Citizens Active</div>
        </div>
      </div>

      <!-- Legend -->
      <div id="mapLegend">
        <div class="legend-item"><div class="legend-dot" style="background:#7a1520"></div><span>12K+</span></div>
        <div class="legend-item"><div class="legend-dot" style="background:#a33020"></div><span>8K+</span></div>
        <div class="legend-item"><div class="legend-dot" style="background:#8a5010"></div><span>5K+</span></div>
        <div class="legend-item"><div class="legend-dot" style="background:#2a6040"></div><span>2K+</span></div>
        <div class="legend-item"><div class="legend-dot" style="background:#1a4060"></div><span>&lt;2K</span></div>
      </div>

      <!-- Ticker -->
      <div id="ticker">
        <span class="ticker-badge">LIVE</span>
        <span id="tickerText"></span>
      </div>
    </div>

    <!-- SIDEBAR -->
    <div id="sidebar">
      <!-- State info (appears on map click) -->
      <div id="stateInfo">
        <div class="state-name" id="stateName"></div>
        <div class="state-count" id="stateCount"></div>
        <div class="state-sub" id="stateSub"></div>
        <div class="cat-bars" id="catBars"></div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab-btn active" data-tab="feed">Live Feed</button>
        <button class="tab-btn" data-tab="report">Report</button>
        <button class="tab-btn" data-tab="ai">AI Analysis</button>
      </div>

      <!-- Feed panel -->
      <div class="tab-panel active" id="panel-feed">
        <div class="filters" id="filters">
          <button class="filter-pill active" data-cat="all">All</button>
          <button class="filter-pill" data-cat="roads" style="color:#FF7518">🛣️ Roads</button>
          <button class="filter-pill" data-cat="water" style="color:#00B4D8">💧 Water</button>
          <button class="filter-pill" data-cat="power" style="color:#FFD700">⚡ Power</button>
          <button class="filter-pill" data-cat="health" style="color:#FF4455">🏥 Health</button>
          <button class="filter-pill" data-cat="corrupt" style="color:#00E5CC">🔍 Corruption</button>
        </div>
        <div id="issueList"></div>
      </div>

      <!-- Report panel -->
      <div class="tab-panel" id="panel-report">
        <div id="reportPanel">
          <div id="reportForm">
            <div class="form-group">
              <label class="form-label">Category</label>
              <select class="form-select" id="rCat">
                <option value="roads">🛣️ Roads & Infrastructure</option>
                <option value="water">💧 Water & Sanitation</option>
                <option value="power">⚡ Electricity & Power</option>
                <option value="health">🏥 Healthcare</option>
                <option value="corrupt">🔍 Corruption / Govt Services</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Issue Title *</label>
              <input class="form-input" id="rTitle" placeholder="e.g. Broken road near village school..." />
            </div>
            <div class="form-group">
              <label class="form-label">State / District *</label>
              <input class="form-input" id="rState" placeholder="e.g. Rajasthan, Jaipur" />
            </div>
            <div class="form-group">
              <label class="form-label">Description *</label>
              <textarea class="form-textarea" id="rDesc" placeholder="Describe the problem — since when, who is affected..."></textarea>
            </div>
            <button class="btn-submit" id="btnSubmit">Submit Issue →</button>
          </div>
          <div id="reportSuccess" style="display:none"></div>
        </div>
      </div>

      <!-- AI panel -->
      <div class="tab-panel" id="panel-ai">
        <div id="aiPanel">
          <div class="ai-empty">
            <div style="font-size:36px">🤖</div>
            <div style="font-family:'Baloo 2',cursive;font-size:13px;letter-spacing:0.5px">AI Issue Analyst</div>
            <div style="font-size:12px;color:#4a6080;line-height:1.6;max-width:240px">
              Select any issue from the Live Feed and click "Analyze with AI" to get an instant deep-dive.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
`

// ── Init MapLibre map ──────────────────────────────────────────────
const map = initMap('map', (name, data) => {
  showStateInfo(name, data)
})

// Add issue markers (those with lat/lng)
const mappable = DEMO_ISSUES.filter(i => i.lat && i.lng).map(i => ({
  id: i.id, title: i.title,
  lat: i.lat!, lng: i.lng!,
  severity: i.severity, category: i.category,
}))
// Wait for map load before adding markers
map.once('load', () => {
  setTimeout(() => addIssueMarkers(map, mappable), 500)
})

// ── Render issue list ──────────────────────────────────────────────
function renderIssues(): void {
  filteredIssues = activeFilter === 'all'
    ? issues
    : issues.filter(i => i.category === activeFilter)

  const list = document.getElementById('issueList')!
  list.innerHTML = filteredIssues.map((issue, idx) => `
    <div class="issue-card${selectedIssue?.id === issue.id ? ' active' : ''}"
         data-idx="${idx}" id="ic-${issue.id}">
      <div class="issue-row1">
        <div class="issue-title">${CAT_ICON[issue.category]} ${issue.title}</div>
        <span class="sev-badge sev-${issue.severity}">${issue.severity}</span>
      </div>
      <div class="issue-meta">
        <span>📍 ${issue.state}${issue.district ? `, ${issue.district}` : ''}</span>
        <span>🏛️ ${issue.department}</span>
        <span>${timeAgo(issue.timestamp)}</span>
      </div>
      ${selectedIssue?.id === issue.id ? `
        <button class="issue-analyze-btn" data-id="${issue.id}">🤖 Analyze with AI →</button>
      ` : ''}
    </div>
  `).join('')

  // Attach click handlers
  list.querySelectorAll('.issue-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const analyzeBtn = (e.target as HTMLElement).closest('.issue-analyze-btn')
      if (analyzeBtn) {
        const id = analyzeBtn.getAttribute('data-id')!
        const issue = issues.find(i => i.id === id)
        if (issue) analyzeIssue(issue)
        return
      }
      const idx = parseInt(card.getAttribute('data-idx')!)
      const issue = filteredIssues[idx]
      if (!issue) return
      selectedIssue = selectedIssue?.id === issue.id ? null : issue
      renderIssues()
    })
  })
}

// ── State info panel ───────────────────────────────────────────────
function showStateInfo(name: string, data: StateData | null): void {
  const panel = document.getElementById('stateInfo')!
  if (!data) { panel.classList.remove('show'); return }

  panel.classList.add('show')
  document.getElementById('stateName')!.textContent = name
  document.getElementById('stateCount')!.textContent = data.issues.toLocaleString('en-IN')
  document.getElementById('stateSub')!.textContent =
    `Active Issues  ·  ${data.trend.startsWith('+') ? '↑' : '↓'} ${data.trend} this week`

  const cats: (keyof StateData)[] = ['roads', 'water', 'power', 'health', 'corrupt']
  const max = Math.max(...cats.map(c => data[c] as number))

  document.getElementById('catBars')!.innerHTML = cats.map(cat => {
    const val = data[cat] as number
    const pct = max > 0 ? (val / max) * 100 : 0
    const color = CAT_COLOR[cat]
    return `
      <div class="cat-bar-row">
        <div class="cat-bar-label" style="color:${color}">${CAT_ICON[cat]} ${CAT_LABEL[cat]}</div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${pct.toFixed(0)}%;background:${color}"></div>
        </div>
        <div class="cat-bar-val">${val.toLocaleString('en-IN')}</div>
      </div>
    `
  }).join('')
}

// ── AI Analysis ────────────────────────────────────────────────────
async function analyzeIssue(issue: Issue): Promise<void> {
  // Switch to AI tab
  switchTab('ai')
  const panel = document.getElementById('aiPanel')!
  panel.innerHTML = `<div class="ai-loading">⏳ Analyzing with AI...</div>`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 700,
        messages: [{
          role: 'user',
          content: `You are BharatMonitor — India's public civic issue intelligence platform. Analyze this issue simply and clearly for Indian citizens:

Issue: ${issue.title}
State: ${issue.state}${issue.district ? `, ${issue.district}` : ''}
Category: ${issue.category}
Severity: ${issue.severity}
Department: ${issue.department}
Reports filed: ${issue.reports.toLocaleString('en-IN')}

Respond in this exact format — simple plain language, no jargon:

WHAT IS HAPPENING
(2 sentences. Simple language.)

WHO IS AFFECTED
(1 sentence)

WHAT SHOULD BE DONE
• (specific action 1)
• (specific action 2)
• (specific action 3)

RESPONSIBLE AUTHORITY
(Department + who to escalate to)

EXPECTED RESOLUTION
(realistic timeline)

Keep total response under 180 words. Write like you're explaining to a regular Indian citizen.`
        }],
      }),
    })

    const data = await res.json()
    const text: string = data.content?.map((b: { text?: string }) => b.text || '').join('') || 'Analysis unavailable.'

    // Format: highlight section headers
    const formatted = text
      .split('\n')
      .map(line => {
        if (/^(WHAT IS HAPPENING|WHO IS AFFECTED|WHAT SHOULD BE DONE|RESPONSIBLE AUTHORITY|EXPECTED RESOLUTION)$/.test(line.trim())) {
          return `<div style="color:#FF7518;font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin:12px 0 4px">${line.trim()}</div>`
        }
        if (line.trim().startsWith('•')) {
          return `<div style="padding-left:12px;margin:2px 0">${line}</div>`
        }
        return `<div style="margin:2px 0">${line}</div>`
      })
      .join('')

    panel.innerHTML = `
      <div style="background:#0c1526;border:1px solid #1e3a5f;border-radius:8px;padding:12px;margin-bottom:12px">
        <div style="font-size:10px;color:#4a6080;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Analyzing</div>
        <div style="font-size:13px;font-weight:500;color:#c8d8e8;line-height:1.4">${issue.title}</div>
        <div style="font-size:11px;color:#4a6080;margin-top:4px">📍 ${issue.state} · ${issue.department}</div>
      </div>
      <div style="font-size:12.5px;line-height:1.9">${formatted}</div>
    `
  } catch {
    panel.innerHTML = `<div style="color:#4a6080;padding:20px;font-size:13px">⚠️ AI analysis unavailable. Check your connection or API key.</div>`
  }
}

// ── Report Issue ───────────────────────────────────────────────────
async function submitReport(): Promise<void> {
  const title = (document.getElementById('rTitle') as HTMLInputElement).value.trim()
  const desc  = (document.getElementById('rDesc') as HTMLTextAreaElement).value.trim()
  const state = (document.getElementById('rState') as HTMLInputElement).value.trim()
  const cat   = (document.getElementById('rCat') as HTMLSelectElement).value

  if (!title || !desc || !state) {
    alert('Please fill in all required fields.')
    return
  }

  const btn = document.getElementById('btnSubmit') as HTMLButtonElement
  btn.disabled = true
  btn.textContent = '⏳ AI Processing...'

  const ticket = 'BW-' + Math.floor(10000 + Math.random() * 90000)

  let severity: Severity = 'high'
  let department = 'Relevant Authority'
  let sla_hours = 48
  let message = 'Your report has been registered and will be reviewed by the relevant authority.'

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Classify this citizen civic issue report for BharatMonitor India. Reply ONLY with valid JSON, no markdown fences:

Title: ${title}
Category: ${cat}
State: ${state}
Description: ${desc}

Return exactly: {"severity":"emergency|critical|high|medium|low","department":"dept name","sla_hours":24,"escalate":false,"message":"one short encouraging sentence in simple English to the citizen"}`
        }],
      }),
    })
    const d = await res.json()
    const raw: string = d.content?.map((b: { text?: string }) => b.text || '').join('') || '{}'
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim())
    severity = result.severity || severity
    department = result.department || department
    sla_hours = result.sla_hours || sla_hours
    message = result.message || message

    // Add to live feed
    const newIssue: Issue = {
      id: ticket,
      title,
      state,
      category: cat as Category,
      severity,
      reports: 1,
      department,
      status: 'Submitted',
      timestamp: new Date(),
      source: 'citizen',
    }
    issues.unshift(newIssue)
    renderIssues()
    liveCount++
    updateLiveCount()

  } catch { /* fallback values already set */ }

  // Show success
  const form = document.getElementById('reportForm')!
  const success = document.getElementById('reportSuccess')!
  form.style.display = 'none'
  success.style.display = 'block'
  success.innerHTML = `
    <div class="success-box">
      <div class="success-icon">✅</div>
      <div class="success-title">Issue Registered!</div>
      <div class="success-ticket">${ticket}</div>
      <div class="success-grid">
        <div class="success-cell">
          <div class="success-cell-label">Severity</div>
          <div class="success-cell-val sev-badge sev-${severity}" style="display:inline-block">${severity.toUpperCase()}</div>
        </div>
        <div class="success-cell">
          <div class="success-cell-label">Dept. Routed</div>
          <div class="success-cell-val" style="color:#00B4D8;font-size:11px">${department}</div>
        </div>
        <div class="success-cell">
          <div class="success-cell-label">SLA</div>
          <div class="success-cell-val" style="color:#FFD700">${sla_hours}h</div>
        </div>
        <div class="success-cell">
          <div class="success-cell-label">Status</div>
          <div class="success-cell-val" style="color:#00c853">Active</div>
        </div>
      </div>
      <div style="font-size:12px;color:#4a6080;line-height:1.6;margin-bottom:14px">${message}</div>
      <button class="btn-secondary" id="btnReportAgain">Report Another Issue</button>
    </div>
  `
  document.getElementById('btnReportAgain')!.addEventListener('click', () => {
    form.style.display = 'block'
    success.style.display = 'none';
    (document.getElementById('rTitle') as HTMLInputElement).value = '';
    (document.getElementById('rDesc') as HTMLTextAreaElement).value = '';
    (document.getElementById('rState') as HTMLInputElement).value = ''
    btn.disabled = false
    btn.textContent = 'Submit Issue →'
  })
}

// ── Tab switching ──────────────────────────────────────────────────
function switchTab(tab: 'feed' | 'report' | 'ai'): void {
  activeTab = tab
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab)
  })
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel-${tab}`)
  })
}

// ── Filter pills ───────────────────────────────────────────────────
document.getElementById('filters')!.addEventListener('click', (e) => {
  const pill = (e.target as HTMLElement).closest('.filter-pill')
  if (!pill) return
  activeFilter = pill.getAttribute('data-cat') as Category | 'all'
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'))
  pill.classList.add('active')
  renderIssues()
})

// ── Tab button clicks ──────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.getAttribute('data-tab') as 'feed' | 'report' | 'ai')
  })
})

// ── Report button ──────────────────────────────────────────────────
document.getElementById('btnReport')!.addEventListener('click', () => switchTab('report'))
document.getElementById('btnSubmit')!.addEventListener('click', submitReport)

// ── Live counter ───────────────────────────────────────────────────
function updateLiveCount(): void {
  document.getElementById('liveCount')!.textContent = liveCount.toLocaleString('en-IN')
}
setInterval(() => {
  liveCount += Math.floor(Math.random() * 4 + 1)
  updateLiveCount()
}, 2800)

// ── Ticker ─────────────────────────────────────────────────────────
function updateTicker(): void {
  const issue = issues[tickerIdx % issues.length]
  const el = document.getElementById('tickerText')!
  el.style.opacity = '0'
  setTimeout(() => {
    el.textContent = `${CAT_ICON[issue.category]} ${issue.state} — ${issue.title}`
    el.style.opacity = '1'
    el.style.transition = 'opacity 0.4s'
  }, 200)
  tickerIdx++
}
updateTicker()
setInterval(updateTicker, 4000)

// ── Initial render ─────────────────────────────────────────────────
renderIssues()

// ── Helpers ────────────────────────────────────────────────────────
function timeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000
  if (diff < 60)   return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
