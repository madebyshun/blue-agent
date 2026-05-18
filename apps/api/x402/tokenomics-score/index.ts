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
const SYSTEM = `You are a tokenomics analyst specializing in token supply dynamics, inflation, and long-term sustainability for Base ecosystem projects.

Analyze: total supply, circulating supply, emission schedule, unlock cliffs, inflation rate, token utility, and value accrual mechanisms.

Red flags: excessive team allocation, short vesting, hyperinflationary emission, no buyback/burn, zero utility.

Return ONLY valid JSON:

{
  "token": "string",
  "sustainabilityScore": number (0-100, higher = more sustainable),
  "supplyHealth": "HEALTHY" | "MODERATE" | "CONCERNING" | "CRITICAL",
  "totalSupply": "string",
  "circulatingSupply": "string (estimated %)",
  "inflationRate": "string (annual %)",
  "distribution": {
    "team": "string (%)",
    "investors": "string (%)",
    "community": "string (%)",
    "treasury": "string (%)",
    "liquidity": "string (%)"
  },
  "unlockSchedule": "string (key upcoming unlocks)",
  "vestingRisk": "LOW" | "MEDIUM" | "HIGH",
  "utilityScore": number (0-100),
  "keyRisks": ["risk1", "risk2"],
  "strengths": ["strength1", "strength2"],
  "sellPressureOutlook": "LOW" | "MEDIUM" | "HIGH" | "EXTREME",
  "recommendation": "string"
}`

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string } = {}
    try {
      const text = await req.text()
      if (text?.trim().startsWith('{')) body = JSON.parse(text)
    } catch {}
    const url = new URL(req.url)
    if (!body.token) body.token = url.searchParams.get('token') || url.searchParams.get('projectName') || undefined

    const { token } = body
    if (!token) return Response.json({ error: 'Provide token name, ticker, or contract address' }, { status: 400 })

    console.log(`[TokenomicsScore] Analyzing: ${token}`)

    const raw = await callLLM({
      system: SYSTEM,
      user: `Deep tokenomics analysis for: ${token}\n\nAnalyze supply structure, emission schedule, vesting, inflation, and long-term sustainability. Be specific about distribution percentages and sell pressure timeline.`,
      temperature: 0.4,
      maxTokens: 1000,
    })
    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[TokenomicsScore] Error:', error)
    return Response.json({ error: 'Tokenomics analysis failed', message: (error as Error).message }, { status: 500 })
  }
}
