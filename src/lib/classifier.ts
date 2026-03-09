import type { Category, Severity, ClassificationResult } from '../types'
import { CATEGORY_KEYWORDS, SEVERITY_KEYWORDS } from '../data/feeds'

// Instant keyword-based classifier (runs synchronously, no API call)
// Same hybrid approach as WorldMonitor: keyword result shown immediately,
// LLM result overrides asynchronously
export function classifyKeyword(text: string): ClassificationResult {
  const lower = text.toLowerCase()

  // Detect category
  let category: Category = 'roads'
  let catScore = 0
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter(k => lower.includes(k)).length
    if (score > catScore) {
      catScore = score
      category = cat as Category
    }
  }

  // Detect severity
  let severityScore = 35
  for (const [pattern, score] of Object.entries(SEVERITY_KEYWORDS)) {
    if (new RegExp(pattern, 'i').test(lower)) {
      if (score > severityScore) severityScore = score
    }
  }

  const severity: Severity =
    severityScore >= 90 ? 'emergency' :
    severityScore >= 70 ? 'critical' :
    severityScore >= 50 ? 'high' :
    severityScore >= 35 ? 'medium' : 'low'

  // Map category to default department
  const deptMap: Record<Category, string> = {
    roads:   'PWD / NHAI',
    water:   'Jal Board / BMC',
    power:   'State DISCOM',
    health:  'State Health Dept.',
    corrupt: 'Lokayukta / ACB',
  }

  return {
    severity,
    category,
    department: deptMap[category],
    confidence: Math.min(catScore * 20 + 40, 85),
    summary: `Classified as ${category} / ${severity} by keyword analysis.`,
  }
}

// Async LLM classifier — overrides keyword result when confidence is higher
// Calls Anthropic API via the /api/classify edge function
export async function classifyWithLLM(
  text: string,
  keywordResult: ClassificationResult
): Promise<ClassificationResult> {
  try {
    const response = await fetch('/api/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!response.ok) return keywordResult
    const result = await response.json() as ClassificationResult
    // Only override if LLM is more confident
    return result.confidence > keywordResult.confidence ? result : keywordResult
  } catch {
    return keywordResult
  }
}
