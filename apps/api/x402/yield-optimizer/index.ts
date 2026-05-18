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
const DEFILLAMA_URL = 'https://yields.llama.fi/pools'

async function getBasePools(token: string): Promise<any[]> {
  const res = await fetch(DEFILLAMA_URL, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`DeFiLlama error: ${res.status}`)
  const { data } = await res.json()
  const ticker = token.replace(/^\$/, '').toUpperCase()
  return (data as any[])
    .filter((p: any) =>
      p.chain === 'Base' &&
      (p.symbol?.toUpperCase().includes(ticker) || p.project?.toLowerCase().includes(token.toLowerCase()))
    )
    .sort((a: any, b: any) => (b.apy ?? 0) - (a.apy ?? 0))
    .slice(0, 10)
}

const SYSTEM = `You are a DeFi yield optimization expert for Base chain. Analyze yield opportunities and recommend the best risk-adjusted options.

Consider: APY sustainability, protocol risk, TVL stability, impermanent loss risk, smart contract risk.

Return ONLY valid JSON:

{
  "token": "string",
  "chain": "base",
  "bestOpportunities": [
    {
      "protocol": "string",
      "pool": "string",
      "apy": "string",
      "tvl": "string",
      "risk": "LOW" | "MEDIUM" | "HIGH",
      "type": "Lending" | "LP" | "Staking" | "Vault",
      "pros": ["pro1"],
      "cons": ["con1"]
    }
  ],
  "recommendedStrategy": "string",
  "riskWarnings": ["warning1"],
  "marketContext": "string (current yield environment on Base)",
  "recommendation": "string"
}`

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string; chain?: string } = {}
    try {
      const text = await req.text()
      if (text?.trim().startsWith('{')) body = JSON.parse(text)
    } catch {}
    const url = new URL(req.url)
    if (!body.token) body.token = url.searchParams.get('token') || undefined

    const { token } = body
    if (!token) return Response.json({ error: 'Provide token to optimize yield for (e.g. USDC, ETH)' }, { status: 400 })

    console.log(`[YieldOptimizer] Finding yield for: ${token}`)

    let pools: any[] = []
    try {
      pools = await getBasePools(token)
    } catch (e) {
      console.warn('[YieldOptimizer] DeFiLlama fetch failed, using LLM only')
    }

    const poolContext = pools.length > 0
      ? `Live DeFiLlama data (Base chain pools):\n${pools.map(p =>
          `- ${p.project} | ${p.symbol} | APY: ${p.apy?.toFixed(2)}% | TVL: $${(p.tvlUsd / 1e6).toFixed(2)}M`
        ).join('\n')}`
      : `No live pool data available — use general knowledge of Base DeFi protocols (Aerodrome, Morpho, Aave, Moonwell, Extra Finance).`

    const raw = await callLLM({
      system: SYSTEM,
      user: `Find best yield opportunities for ${token} on Base chain.\n\n${poolContext}\n\nRecommend top 3-4 options with risk assessment.`,
      temperature: 0.4,
      maxTokens: 1500,
    })
    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[YieldOptimizer] Error:', error)
    return Response.json({ error: 'Yield optimization failed', message: (error as Error).message }, { status: 500 })
  }
}
