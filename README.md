# 🇮🇳 BharatMonitor

> A real-time civic issue tracker for India — built so citizens can report, track and escalate public service failures across all 36 states and UTs.

**Live site:** https://bharatmonitor-app.vercel.app
**Public issue board:** https://github.com/Mah3Sec/bharatmonitor-issues
**WhatsApp Community:** https://chat.whatsapp.com/BvuaVkb3ZY1KuSr7V8wi74

Built by [Mahendra Purbia](https://github.com/Mah3Sec) · MIT License

---

## Overview

BharatMonitor aggregates real-time civic news from Indian RSS feeds and lets citizens submit their own issue reports. Every submission creates a public GitHub Issue as a trackable ticket — visible to all visitors on the live feed, not just the person who reported it. The site includes a clickable India map, category filters, AI-powered issue analysis, a news/video panel, and a WhatsApp community for discussion.

---

## Features

- **Live Feed** — real-time civic news from 11 RSS sources (Google News civic queries, PIB India, Reddit r/india), filtered by category and state
- **Citizen Reports** — anyone can submit an issue; it gets a ticket number (e.g. `BM-26-52602`) and appears publicly for all users
- **India Map** — clickable choropleth map showing issue density by state, with dot markers for individual reports
- **Issue Analysis** — AI analysis using Claude Haiku (falls back to keyword analysis if no API key)
- **📺 News Tab** — Government TV channels (Lok Sabha TV, DD News, Rajya Sabha TV), civic YouTube search links, trusted news portals
- **WhatsApp** — share ticket to community or escalate directly
- **Admin Panel** — hidden password-protected panel to remove spam (click footer 5× to open)
- **Responsive** — works on mobile, tablet, and desktop

---

## Limitations

- No user accounts or login of any kind
- No real Twitter/X or Instagram integration (their APIs require paid access)
- WhatsApp messages must be sent manually — no automated govt routing
- Map markers use state centroid + random offset, not real GPS coordinates
- News filter is keyword-based and not perfect

---

## Project Structure

```
bharatmonitor-app/
├── index.html            # Full frontend — single file, no framework
├── package.json
├── tsconfig.json
├── vercel.json
└── api/
    ├── rss.ts            # RSS proxy with domain allowlist
    ├── submit.ts         # Creates GitHub Issue on every report
    ├── issues.ts         # Reads open GitHub Issues for public feed
    ├── analyze.ts        # AI or keyword issue analysis
    ├── classify.ts       # Severity + department classifier
    └── admin.ts          # Close/remove issues (password protected)
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | ✅ Yes | Fine-grained PAT — Issues: Read & Write |
| `GITHUB_REPO` | ✅ Yes | e.g. `Mah3Sec/bharatmonitor-issues` |
| `ADMIN_PASSWORD` | ✅ Yes | Password for hidden admin panel |
| `ANTHROPIC_API_KEY` | ⬜ Optional | Claude Haiku for AI analysis |

Without `GITHUB_TOKEN` + `GITHUB_REPO` citizen reports only save locally in the reporter's browser and are not visible to other users.

---

## Deploy

```bash
# 1. Fork this repo
# 2. Create a public GitHub repo for tickets e.g. yourname/bharatmonitor-issues
# 3. Generate a GitHub fine-grained PAT with Issues: Read & Write on that repo
# 4. Deploy
vercel --prod

# 5. Add env vars in Vercel Dashboard → Settings → Environment Variables
# 6. Redeploy after adding env vars
```

---

## Tech Stack

| | |
|---|---|
| Frontend | Vanilla JS + HTML + CSS, single file |
| Map | MapLibre GL v4.7 + CartoDB dark tiles |
| Backend | Vercel Edge Functions (TypeScript) |
| Ticket database | GitHub Issues (free, public) |
| News sources | Google News RSS + Reddit RSS |
| AI | Anthropic Claude Haiku (optional) |
| Hosting | Vercel free tier |

---

## Moderation

Close any spam report in two ways:

1. Go to `github.com/Mah3Sec/bharatmonitor-issues` → open the issue → click **Close issue**. It disappears from the website within 60 seconds.
2. On the website — click the footer **5 times quickly** → enter admin password → **🚫 Spam** or **🗑️ Remove** buttons appear on each citizen report card.
