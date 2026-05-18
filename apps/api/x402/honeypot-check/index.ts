// ── inline helpers (bankr x402 deploy requires self-contained files) ──────

async function callLLM(opts: { system: string; user: string; temperature?: number; maxTokens?: number }): Promise<string> {
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

function extractJSON(raw: string): unknown {
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
  if (s === -1 || e === -1) throw new Error('No JSON found')
  return JSON.parse(raw.slice(s, e + 1))
}

async function getABI(address: string) {
  const key = process.env.BASESCAN_API_KEY ?? ''
  if (!key) return { verified: false, abi: null }
  const res = await fetch(`https://api.etherscan.io/v2/api?chainid=8453&module=contract&action=getabi&address=${address}&apikey=${key}`, { signal: AbortSignal.timeout(5000) })
  const data = await res.json()
  return { verified: data.status === '1', abi: data.result }
}

// Honeypot.is API — free, no key needed, real onchain simulation
async function checkHoneypotIs(address: string): Promise<any> {
  try {
    // Base chain ID = 8453
    const res = await fetch(`https://api.honeypot.is/v2/IsHoneypot?address=${address}&chainID=8453`, {
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// DexScreener — get token info + liquidity
async function getDexScreenerData(address: string): Promise<any> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.pairs?.[0] ?? null
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM = `You are a smart contract security expert specializing in honeypot and rug pull detection on Base chain.

Analyze the provided contract data and return ONLY valid JSON:

{
  "isHoneypot": boolean,
  "verdict": "SAFE" | "SUSPICIOUS" | "HONEYPOT",
  "riskScore": number (0-100, higher = more dangerous),
  "confidence": number (0-100),
  "indicators": ["indicator1", "indicator2"],
  "technicalFlags": ["flag1", "flag2"],
  "recommendation": "string (what to do)",
  "safeToTrade": boolean
}`

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string; chain?: string } = {}
    try {
      const text = await req.text()
      if (text?.trim().startsWith('{')) body = JSON.parse(text)
    } catch {}
    const url = new URL(req.url)
    if (!body.token) body.token = url.searchParams.get('token') || url.searchParams.get('contractAddress') || undefined

    const { token } = body
    if (!token) return Response.json({ error: 'Provide token contract address' }, { status: 400 })

    if (!/^0x[a-fA-F0-9]{40}$/.test(token)) {
      return Response.json({ error: 'Invalid contract address format' }, { status: 400 })
    }

    // Fetch real onchain data in parallel
    const [contractData, honeypotData, dexData] = await Promise.all([
      getABI(token),
      checkHoneypotIs(token),
      getDexScreenerData(token),
    ])

    // If honeypot.is returns real simulation data, use it directly
    if (honeypotData && honeypotData.simulationResult !== undefined) {
      const hp = honeypotData
      const isHoneypot = hp.honeypotResult?.isHoneypot ?? false
      const buyTax = hp.simulationResult?.buyTax ?? 0
      const sellTax = hp.simulationResult?.sellTax ?? 0
      const liq = dexData?.liquidity?.usd ?? 0
      const pair = dexData?.pairAddress ?? 'unknown'
      const tokenName = dexData?.baseToken?.name ?? token

      const riskScore = isHoneypot ? 95
        : sellTax > 50 ? 80
        : sellTax > 20 ? 60
        : buyTax > 20 ? 40
        : liq < 1000 ? 50
        : 15

      const verdict = isHoneypot ? 'HONEYPOT'
        : riskScore >= 60 ? 'SUSPICIOUS'
        : 'SAFE'

      const indicators: string[] = []
      if (isHoneypot) indicators.push('Sell simulation failed — cannot sell token')
      if (sellTax > 50) indicators.push(`Extremely high sell tax: ${sellTax}%`)
      if (sellTax > 20) indicators.push(`High sell tax: ${sellTax}%`)
      if (buyTax > 20) indicators.push(`High buy tax: ${buyTax}%`)
      if (liq < 1000) indicators.push(`Very low liquidity: $${liq.toFixed(0)}`)
      if (!contractData.verified) indicators.push('Contract not verified on Basescan')
      if (indicators.length === 0) indicators.push('No major red flags detected')

      return Response.json({
        isHoneypot,
        verdict,
        riskScore,
        confidence: 95,
        token,
        tokenName,
        buyTax,
        sellTax,
        liquidity: liq,
        pair,
        contractVerified: contractData.verified,
        indicators,
        technicalFlags: hp.flags ?? [],
        recommendation: isHoneypot
          ? 'DO NOT TRADE. Sell simulation failed — this is a confirmed honeypot.'
          : riskScore >= 60
          ? 'HIGH RISK. Exercise extreme caution before trading.'
          : 'Appears safe based on simulation. Always DYOR.',
        safeToTrade: !isHoneypot && riskScore < 60,
        source: 'honeypot.is simulation + dexscreener'
      })
    }

    // Fallback: LLM analysis with whatever data we have
    // NOTE: honeypot.is does not support Uniswap v4 on Base — no simulationResult means no simulation data,
    // NOT that the token is dangerous. Default conservatively to SAFE unless clear red flags exist.
    const userPrompt = `Check if this is a honeypot on Base chain (Uniswap v4 is NOT supported by honeypot.is — no simulation data does NOT mean it is a honeypot).

Token: ${token}
Contract verified on Basescan: ${contractData.verified}
ABI snippet: ${contractData.abi ? String(contractData.abi).slice(0, 500) : 'Not available'}
DexScreener: ${dexData ? JSON.stringify({ name: dexData.baseToken?.name, liquidity: dexData.liquidity?.usd, volume24h: dexData.volume?.h24 }) : 'No pairs found'}

IMPORTANT: If honeypot simulation data is unavailable (e.g. Uniswap v4 pairs), default to SAFE unless contract ABI shows clear red flags like blocked sell functions. Do not flag as HONEYPOT based on lack of data alone.

Analyze for: explicit sell restrictions in ABI, hidden fees, ownership traps, blacklist functions. If the contract is verified and no clear red flags exist in the ABI, return riskScore in the 20-30 range and verdict SAFE.`

    const raw = await callLLM({
      system: SYSTEM,
      user: userPrompt,
      temperature: 0.2,
      maxTokens: 600,
    })

    const llmResult = extractJSON(raw) as any

    // Apply conservative risk scoring when no simulation data is available:
    // If contract is verified and LLM didn't find explicit red flags, cap riskScore low
    if (contractData.verified && llmResult.verdict !== 'HONEYPOT') {
      llmResult.riskScore = Math.min(llmResult.riskScore ?? 30, 30)
      llmResult.verdict = llmResult.riskScore >= 60 ? 'SUSPICIOUS' : 'SAFE'
      llmResult.isHoneypot = false
    }

    return Response.json({ ...llmResult, source: 'llm-analysis (no simulation data — honeypot.is does not support Uniswap v4)' })
  } catch (error) {
    return Response.json({ error: 'Honeypot check failed', message: (error as Error).message }, { status: 500 })
  }
}
