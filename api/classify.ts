// api/classify.ts — Vercel Edge Function
// Classifies civic issue text using Claude AI
// Called async after keyword classifier shows instant result

export const config = { runtime: 'edge' }

interface ClassifyRequest {
  text: string
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const { text } = (await req.json()) as ClassifyRequest

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',  // fast + cheap for classification
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Classify this Indian civic issue. Reply ONLY with valid JSON:

"${text}"

Return: {"severity":"emergency|critical|high|medium|low","category":"roads|water|power|health|corrupt","department":"string","confidence":0-100}`,
      }],
    }),
  })

  const data = await response.json()
  const raw: string = data.content?.[0]?.text || '{}'

  try {
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Parse error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
