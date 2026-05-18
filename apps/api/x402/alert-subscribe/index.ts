// ── inline helpers (bankr x402 deploy requires self-contained files) ──────

async function callLLM(opts) {
  const res = await fetch('https://llm.bankr.bot/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.LLM_KEY ?? process.env.BANKR_API_KEY ?? process.env.BANKR_LLM_KEY ?? '',
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 800,
    }),
  })
  if (!res.ok) throw new Error(`LLM error: ${res.status}`)
  const data = await res.json()
  if (data.content?.[0]?.text) return data.content[0].text
  throw new Error('Invalid LLM response')
}

function extractJSON(raw) {
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
  if (s === -1 || e === -1) throw new Error('No JSON found in LLM response')
  return JSON.parse(raw.slice(s, e + 1))
}

function extractArray(raw) {
  const s = raw.indexOf('['), e = raw.lastIndexOf(']')
  if (s === -1 || e === -1) return []
  return JSON.parse(raw.slice(s, e + 1))
}

const basescan = {
  async getABI(address) {
    const key = process.env.BASESCAN_API_KEY ?? ''
    const res = await fetch(`https://api.etherscan.io/v2/api?chainid=8453&module=contract&action=getabi&address=${address}&apikey=${key}`, { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    return { verified: data.status === '1', abi: data.result }
  },
  async getTokenTx(address, limit = 50) {
    const key = process.env.BASESCAN_API_KEY ?? ''
    const res = await fetch(`https://api.etherscan.io/v2/api?chainid=8453&module=account&action=tokentx&address=${address}&sort=desc&offset=${limit}&apikey=${key}`, { signal: AbortSignal.timeout(8000) })
    const data = await res.json()
    return data.status === '1' ? data.result : []
  },
  async getTxList(address, limit = 100) {
    const key = process.env.BASESCAN_API_KEY ?? ''
    const res = await fetch(`https://api.etherscan.io/v2/api?chainid=8453&module=account&action=txlist&address=${address}&sort=desc&offset=${limit}&apikey=${key}`, { signal: AbortSignal.timeout(8000) })
    const data = await res.json()
    return data.status === '1' ? data.result : []
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory store (replace with DB in production)
const subscriptions = new Map<string, Subscription>()

interface Subscription {
  id: string
  webhookUrl: string
  topics: AlertTopic[]
  addresses: string[]
  createdAt: string
}

type AlertTopic =
  | 'whale_movement'      // large token transfers
  | 'circuit_breaker'     // agent loss/halt triggers
  | 'quantum_exposure'    // new wallet exposure events
  | 'honeypot_detected'   // new honeypot tokens flagged
  | 'rug_risk'            // rug pull risk spikes

const VALID_TOPICS: AlertTopic[] = [
  'whale_movement', 'circuit_breaker', 'quantum_exposure', 'honeypot_detected', 'rug_risk',
]

const SYSTEM = `You are a blockchain alert advisor. Given subscription details, generate a confirmation summary and setup tips.

Return ONLY valid JSON:
{
  "message": "string (confirmation message)",
  "activeTopics": ["topic1", "topic2"],
  "estimatedAlertsPerDay": "string (e.g. '3-5 alerts/day')",
  "tips": ["tip1", "tip2"],
  "webhookFormat": {
    "topic": "whale_movement",
    "severity": "HIGH",
    "message": "example alert message",
    "data": {},
    "timestamp": "ISO string"
  }
}`

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    return Response.json({
      service: 'alert-subscribe',
      description: 'Subscribe to real-time BlueAgent alerts via webhook',
      availableTopics: VALID_TOPICS,
      pricing: '$0.50/month per topic',
    })
  }

  try {
    let body: {
      webhookUrl?: string
      topics?: AlertTopic[]
      addresses?: string[]
    } = {}
    try {
      const text = await req.text()
      if (text?.trim().startsWith('{')) body = JSON.parse(text)
    } catch {}

    const { webhookUrl, topics = [], addresses = [] } = body

    if (!webhookUrl) return Response.json({ error: 'webhookUrl is required' }, { status: 400 })
    if (topics.length === 0) return Response.json({ error: 'At least one topic required' }, { status: 400 })

    const invalidTopics = topics.filter(t => !VALID_TOPICS.includes(t))
    if (invalidTopics.length > 0) {
      return Response.json({ error: `Invalid topics: ${invalidTopics.join(', ')}`, validTopics: VALID_TOPICS }, { status: 400 })
    }

    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const sub: Subscription = {
      id,
      webhookUrl,
      topics,
      addresses,
      createdAt: new Date().toISOString(),
    }
    subscriptions.set(id, sub)

    console.log(`[AlertSubscribe] New subscription ${id}: topics=${topics.join(',')} webhook=${webhookUrl}`)

    const raw = await callLLM({
      system: SYSTEM,
      user: `Subscription created:
- ID: ${id}
- Topics: ${topics.join(', ')}
- Watched addresses: ${addresses.length > 0 ? addresses.join(', ') : 'none (global alerts)'}
- Webhook: ${webhookUrl}

Generate confirmation summary and setup tips.`,
      temperature: 0.3,
      maxTokens: 600,
    })

    const result = extractJSON(raw) as any
    return Response.json({
      subscriptionId: id,
      status: 'active',
      topics,
      addresses,
      webhookUrl,
      createdAt: sub.createdAt,
      ...result,
    })
  } catch (error) {
    console.error('[AlertSubscribe] Error:', error)
    return Response.json({ error: 'Subscription failed', message: (error as Error).message }, { status: 500 })
  }
}
