// Issue categories
export type Category = 'roads' | 'water' | 'power' | 'health' | 'corrupt'

// Severity levels
export type Severity = 'emergency' | 'critical' | 'high' | 'medium' | 'low'

// A single civic issue
export interface Issue {
  id: string
  title: string
  state: string
  district?: string
  category: Category
  severity: Severity
  reports: number
  department: string
  status: string
  timestamp: Date
  lat?: number
  lng?: number
  source: 'rss' | 'citizen' | 'scrape' | 'demo'
  url?: string
}

// State / UT data
export interface StateData {
  name: string
  code: string
  issues: number
  roads: number
  water: number
  power: number
  health: number
  corrupt: number
  trend: string   // e.g. "+4.2%"
  resolved30d: number
}

// RSS feed definition
export interface Feed {
  name: string
  url: string
  category: Category
  tier: 1 | 2 | 3
}

// AI classification result
export interface ClassificationResult {
  severity: Severity
  category: Category
  department: string
  confidence: number
  summary: string
}
