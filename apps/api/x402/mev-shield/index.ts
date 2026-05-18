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
const SYSTEM = `You are an MEV (Maximal Extractable Value) protection expert for DeFi transactions on Base chain.

Analyze the described swap/transaction for MEV attack risk, specifically sandwich attacks and frontrunning.

Context:
- Sandwich attacks: bot frontruns your tx, buys token, lets your tx execute at worse price, then sells
- Risk is higher with: large swaps, low liquidity pools, high slippage tolerance, popular tokens
- Protection: use private mempools (Flashbots Protect), reduce slippage, split orders, use MEV-resistant DEXes

Return ONLY valid JSON:

{
  "mevRisk": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "sandwichProbability": number (0-100),
  "estimatedSlippageLoss": "string (e.g. '0.5-2% of trade value')",
  "protectionStrategies": ["strategy1", "strategy2", "strategy3"],
  "recommendedSlippage": "string (e.g. '0.5%')",
  "preferredRoutes": ["route1", "route2"],
  "riskFactors": ["factor1", "factor2"],
  "recommendation": "string (clear action to take)"
}`

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { action?: string; chain?: string } = {}
    try {
      const text = await req.text()
      if (text?.trim().startsWith('{')) body = JSON.parse(text)
    } catch {}
    const url = new URL(req.url)
    if (!body.action) body.action = url.searchParams.get('action') || undefined

    const { action } = body
    if (!action) return Response.json({ error: 'Provide action (e.g. "swap 10 ETH to USDC on Uniswap v3")' }, { status: 400 })

    console.log(`[MevShield] Analyzing: ${action}`)

    const raw = await callLLM({
      system: SYSTEM,
      user: `Assess MEV risk for this transaction on Base:\n${action}\n\nProvide specific protection strategies and recommended settings.`,
      temperature: 0.3,
      maxTokens: 700,
    })
    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[MevShield] Error:', error)
    return Response.json({ error: 'MEV analysis failed', message: (error as Error).message }, { status: 500 })
  }
}
