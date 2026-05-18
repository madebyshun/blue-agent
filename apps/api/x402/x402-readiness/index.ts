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
const SYSTEM = `You are an x402 protocol expert helping developers and API providers understand how to implement HTTP 402 payment-native services.

x402 is an open standard (by Coinbase) that adds payment natively to HTTP. A service is x402-ready when:
1. It responds with HTTP 402 + PaymentRequired header when accessed without payment
2. It accepts PAYMENT-SIGNATURE header from paying clients
3. Pricing is denominated in USDC on Base (or other supported networks)
4. It works with a facilitator (like Bankr) for payment verification

Assess the described service/API for x402 readiness and provide a concrete implementation roadmap.

Return ONLY valid JSON:

{
  "readinessScore": number (0-100),
  "verdict": "READY" | "NEEDS_WORK" | "NOT_READY",
  "currentMonetizationModel": "string",
  "x402Advantages": ["advantage1", "advantage2"],
  "gaps": ["gap1", "gap2"],
  "implementationSteps": [
    {
      "step": number,
      "action": "string",
      "effort": "LOW" | "MEDIUM" | "HIGH",
      "details": "string"
    }
  ],
  "suggestedPricing": "string (e.g. $0.01-0.05 per request)",
  "estimatedImplementationTime": "string",
  "recommendation": "string"
}`

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { url?: string; description?: string; currentModel?: string } = {}
    try {
      const text = await req.text()
      if (text?.trim().startsWith('{')) body = JSON.parse(text)
    } catch {}
    const reqUrl = new URL(req.url)
    if (!body.url) body.url = reqUrl.searchParams.get('url') || undefined
    if (!body.description) body.description = reqUrl.searchParams.get('description') || undefined
    if (!body.currentModel) body.currentModel = reqUrl.searchParams.get('currentModel') || undefined

    const { url, description, currentModel } = body
    if (!url && !description) {
      return Response.json({ error: 'Provide url or description of the API/service' }, { status: 400 })
    }

    console.log(`[x402Readiness] Auditing: ${url ?? description}`)

    const raw = await callLLM({
      system: SYSTEM,
      user: `Assess x402 readiness for this service:\nURL/Endpoint: ${url ?? 'Not provided'}\nDescription: ${description ?? 'Not provided'}\nCurrent monetization: ${currentModel ?? 'Unknown'}\n\nProvide specific, actionable implementation steps for adopting x402. Reference Bankr x402 Cloud as the recommended facilitator.`,
      temperature: 0.4,
      maxTokens: 2500,
    })
    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[x402Readiness] Error:', error)
    return Response.json({ error: 'x402 readiness audit failed', message: (error as Error).message }, { status: 500 })
  }
}
