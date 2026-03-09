import type { Feed } from '../types'

// Real Indian RSS feeds for civic issue tracking
// These are scraped via the /api/rss proxy to avoid CORS
export const FEEDS: Feed[] = [
  // Roads & Infrastructure
  { name: 'NHAI News',       url: 'https://nhai.gov.in/rss.xml',                              category: 'roads',   tier: 1 },
  { name: 'The Hindu Roads', url: 'https://www.thehindu.com/news/national/?service=rss',       category: 'roads',   tier: 1 },
  { name: 'TOI Roads',       url: 'https://timesofindia.indiatimes.com/rss.cms',               category: 'roads',   tier: 2 },

  // Water & Sanitation
  { name: 'Jal Shakti',      url: 'https://jalshakti-dowr.gov.in/rss.xml',                    category: 'water',   tier: 1 },
  { name: 'Hindu Water',     url: 'https://www.thehindu.com/sci-tech/energy-and-environment/?service=rss', category: 'water', tier: 1 },

  // Power & Electricity
  { name: 'MoPNG',           url: 'https://mopng.gov.in/rss.xml',                             category: 'power',   tier: 1 },
  { name: 'Power Grid',      url: 'https://www.powergrid.in/rss.xml',                          category: 'power',   tier: 1 },
  { name: 'Energy World',    url: 'https://energy.economictimes.indiatimes.com/rss/top',       category: 'power',   tier: 2 },

  // Health
  { name: 'MoHFW',           url: 'https://mohfw.gov.in/rss.xml',                             category: 'health',  tier: 1 },
  { name: 'NDTV Health',     url: 'https://feeds.feedburner.com/NDTV-Health',                 category: 'health',  tier: 2 },

  // Corruption & Governance
  { name: 'CBI Releases',    url: 'https://cbi.gov.in/rss.xml',                               category: 'corrupt', tier: 1 },
  { name: 'The Wire Govt',   url: 'https://thewire.in/politics/feed',                         category: 'corrupt', tier: 2 },
  { name: 'Print Govt',      url: 'https://theprint.in/politics/feed/',                       category: 'corrupt', tier: 2 },
]

// Keyword classifier — instant, no LLM needed
// Pattern: [regex, severity_score]
export const SEVERITY_KEYWORDS: Record<string, number> = {
  // Emergency level (score 90-100)
  'death|died|killed|fatal|collapse|explosion|blast|flood|cyclone|earthquake|oxygen shortage|hospital fire': 95,
  // Critical level (score 70-89)
  'contaminated|poisonous|outbreak|epidemic|structural failure|bridge crack|road caved|no water|total blackout': 78,
  // High level (score 50-69)
  'pothole|power cut|sewage|bribe|corruption|ration|shortage|delayed|offline|broken|damaged|overflowing': 58,
  // Medium level (score 30-49)
  'complaint|issue|problem|repair|pending|request|maintenance': 38,
}

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  roads:   ['road', 'highway', 'pothole', 'bridge', 'flyover', 'nhai', 'pwd', 'traffic', 'nh-', 'sh-', 'construction', 'pavement'],
  water:   ['water', 'sewage', 'sanitation', 'drainage', 'tap', 'pipeline', 'contaminated', 'jal', 'bmc water', 'groundwater', 'flooding', 'drain'],
  power:   ['electricity', 'power cut', 'outage', 'transformer', 'voltage', 'discom', 'blackout', 'generator', 'load shedding', 'electric'],
  health:  ['hospital', 'doctor', 'medicine', 'icu', 'ambulance', 'health', 'medical', 'aiims', 'clinic', 'oxygen', 'patient', 'mohfw'],
  corrupt: ['bribe', 'corruption', 'scam', 'fraud', 'illegal', 'ration', 'cpgrams', 'complaint portal', 'government officer', 'acb', 'cbi', 'lok ayukta'],
}
