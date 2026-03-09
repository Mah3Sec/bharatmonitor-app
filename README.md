# 🇮🇳 BharatMonitor

**Real-time India civic issue intelligence dashboard** — Track roads, water, power, health, and corruption issues across all 36 states and union territories.

Inspired by [WorldMonitor](https://worldmonitor.app). Built for India.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-bharatmonitor.vercel.app-orange?style=flat)](https://bharatmonitor.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

![BharatMonitor Screenshot](./public/screenshot.png)

---

## What It Does

| Feature | Details |
|---|---|
| 🗺️ **India Choropleth Map** | All 28 states + 8 UTs color-coded by issue severity using real GeoJSON |
| ⚠️ **Live Issue Feed** | Filterable feed across 5 categories with citizen reports |
| 🤖 **AI Analysis** | Claude AI analyzes any issue — root cause, action steps, responsible authority |
| 📝 **Citizen Reporting** | Submit civic issues → AI classifies severity and routes to correct department |
| 📡 **RSS Ingestion** | Pulls from 12 real Indian news feeds via proxied edge functions |
| 🔄 **Hybrid Classification** | Keyword classifier (instant) + LLM override (async), same pattern as WorldMonitor |

---

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/bharatmonitor.git
cd bharatmonitor
npm install
npm run dev
```

Open http://localhost:5173

> **Note:** The map and issue feed work without any API keys. AI features require `ANTHROPIC_API_KEY`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | TypeScript + Vite |
| Map | MapLibre GL (WebGL, open-source) |
| AI | Claude claude-sonnet-4-20250514 (analysis) + claude-haiku-4-5-20251001 (classification) |
| API | Vercel Edge Functions |
| Data | 12 Indian RSS feeds + citizen reports |
| Hosting | Vercel (free tier) |

---

## Project Structure

```
bharatmonitor/
├── index.html              # Entry point
├── src/
│   ├── main.ts             # App logic, UI, event handlers
│   ├── map.ts              # MapLibre GL map + choropleth
│   ├── style.css           # All styles
│   ├── types.ts            # TypeScript types
│   ├── lib/
│   │   └── classifier.ts   # Keyword + LLM hybrid classifier
│   └── data/
│       ├── states.ts       # All 36 states + UTs data
│       ├── feeds.ts        # RSS feed definitions + keywords
│       └── issues.ts       # Demo issues (pre-RSS load)
├── api/
│   ├── classify.ts         # Edge function: AI issue classification
│   └── rss.ts              # Edge function: RSS proxy (CORS safe)
├── data/                   # Static data files
├── docs/                   # Documentation
├── public/                 # Static assets
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Deploy to Vercel (Free)

```bash
npm install -g vercel
vercel
```

Set environment variable:
```
ANTHROPIC_API_KEY=sk-ant-...
```

That's it. Your BharatMonitor instance is live.

---

## Deploy to GitHub Pages (Static only, no AI API)

```bash
npm run build
# Push dist/ folder contents to gh-pages branch
```

> Map and issue feed work without API key. AI analysis requires Vercel deployment.

---

## Data Sources

### Government (Official)
- NHAI — Road infrastructure updates
- Jal Shakti / DOWR — Water ministry releases
- MoPNG — Power & gas updates
- MoHFW — Health ministry alerts
- CBI — Anti-corruption case updates

### News (Tier 1/2)
- The Hindu, Times of India — General civic news
- The Wire, The Print — Governance & policy
- Economic Times Energy — Power sector

### Citizens
- In-app report form → AI classified + routed

---

## How Issue Classification Works

Same hybrid approach as WorldMonitor:

1. **Keyword classifier** (instant, no API) — pattern-matches ~80 civic keywords, returns severity + category immediately
2. **LLM classifier** (async, Claude Haiku) — fires in background, overrides keyword result only if more confident
3. UI shows keyword result instantly. LLM result updates within ~1 second.

---

## Roadmap

- [ ] Hindi + 10 regional language support
- [ ] WhatsApp bot for citizen reporting  
- [ ] Real-time CPGRAMS API integration
- [ ] Twitter/X scraping for issue detection
- [ ] Historical trend charts per state
- [ ] Mobile-optimized PWA
- [ ] Government department notification system
- [ ] Docker self-hosted image

---

## Contributing

PRs welcome! Especially for:
- Adding more Indian RSS feeds
- Improving state GeoJSON accuracy
- Hindi UI translation
- New issue categories

---

## License

MIT License — free to use, modify, and deploy.

---

## Author

Built with ❤️ for India. If this helps even one civic problem get solved faster, it's worth it.

---

*"Jan Bhagidari — Citizen Participation"*
