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
const SYSTEM = `You are a crypto market narrative analyst tracking trending themes in the Base ecosystem and broader crypto market (as of April 2026).

You track: AI agents, DeFi innovations, RWA (Real World Assets), memecoins, quantum security, ZHC (Zero-Human Companies), x402 payments, restaking, and Base-specific developments.

Assess narrative momentum based on: developer activity, social discourse, VC interest, protocol launches, and media coverage.

Return ONLY valid JSON:

{
  "asOf": "April 2026",
  "topNarratives": [
    {
      "name": "string",
      "momentum": "EXPLODING" | "HOT" | "RISING" | "STABLE" | "COOLING",
      "baseRelevance": "HIGH" | "MEDIUM" | "LOW",
      "description": "string (under 80 chars)",
      "timeHorizon": "string (e.g. '1-3 months', 'long-term')"
    }
  ],
  "baseEcosystemFocus": ["theme1", "theme2", "theme3"],
  "emergingThemes": ["theme1", "theme2"],
  "fadingThemes": ["theme1"],
  "bestPositioned": ["sector/project1", "sector/project2"],
  "agentOpportunity": "string (what's the best opportunity for AI agents right now)",
  "recommendation": "string"
}`

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { query?: string; sector?: string } = {}
    try {
      const text = await req.text()
      if (text?.trim().startsWith('{')) body = JSON.parse(text)
    } catch {}
    const url = new URL(req.url)
    if (!body.query) body.query = url.searchParams.get('query') || url.searchParams.get('sector') || undefined

    console.log(`[NarrativePulse] Analyzing narratives: ${body.query ?? 'general'}`)

    const raw = await callLLM({
      system: SYSTEM,
      user: `Analyze current crypto narratives (April 2026).\nFocus area: ${body.query ?? 'Base ecosystem + general crypto'}\n\nProvide top 5 narratives with momentum scores. Be specific to current market conditions.`,
      temperature: 0.6,
      maxTokens: 1500,
    })
    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[NarrativePulse] Error:', error)
    return Response.json({ error: 'Narrative analysis failed', message: (error as Error).message }, { status: 500 })
  }
}
