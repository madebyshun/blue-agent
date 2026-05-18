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
const SYSTEM = `You are a crypto VC intelligence analyst tracking venture capital activity in the Base ecosystem and broader crypto market (as of April 2026).

You have knowledge of: a16z crypto, Paradigm, Coinbase Ventures, Multicoin, Sequoia, Pantera, Framework Ventures, Dragonfly, Electric Capital, and other major crypto funds.

Provide actionable investment intelligence: what themes are being funded, which sectors are hot, and what signals smart money is sending.

Return ONLY valid JSON:

{
  "query": "string",
  "investmentThesis": "string (2-3 sentences on current VC thinking)",
  "hotSectors": [
    {
      "sector": "string",
      "momentum": "EXPLODING" | "HOT" | "RISING" | "COOLING",
      "recentDeals": ["deal1", "deal2"],
      "leadingFirms": ["firm1", "firm2"]
    }
  ],
  "notableFirms": [
    {
      "firm": "string",
      "currentFocus": "string",
      "recentActivity": "string"
    }
  ],
  "baseEcosystemActivity": "string (VC activity specific to Base/Coinbase ecosystem)",
  "signalForBuilders": "string (what builders should know)",
  "signalForTraders": "string (what traders should know)",
  "recommendation": "string"
}`

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { query?: string } = {}
    try {
      const text = await req.text()
      if (text?.trim().startsWith('{')) body = JSON.parse(text)
    } catch {}
    const url = new URL(req.url)
    if (!body.query) body.query = url.searchParams.get('query') || undefined

    const { query } = body
    if (!query) return Response.json({ error: 'Provide query (VC firm name, sector, or theme)' }, { status: 400 })

    console.log(`[VCTracker] Tracking: ${query}`)

    const raw = await callLLM({
      system: SYSTEM,
      user: `VC investment intelligence for: "${query}"\n\nProvide current investment activity, thesis, and signals as of April 2026. Focus on Base ecosystem where relevant.`,
      temperature: 0.5,
      maxTokens: 2500,
    })
    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[VCTracker] Error:', error)
    return Response.json({ error: 'VC tracking failed', message: (error as Error).message }, { status: 500 })
  }
}
