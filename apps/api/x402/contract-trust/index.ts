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

async function fetchDexScreener(address: string): Promise<any> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    const pair = (data?.pairs ?? []).filter((p: any) => p.chainId === 'base').sort((a: any, b: any) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
    if (!pair) return null
    return {
      name: pair.baseToken?.name,
      symbol: pair.baseToken?.symbol,
      liquidity: pair.liquidity?.usd,
      volume24h: pair.volume?.h24,
      buys24h: pair.txns?.h24?.buys,
      sells24h: pair.txns?.h24?.sells,
      priceUsd: pair.priceUsd,
      pairAge: pair.pairCreatedAt ? Math.floor((Date.now() - pair.pairCreatedAt) / 86400000) + ' days' : 'unknown',
      dex: pair.dexId,
    }
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM = `You are a smart contract trust analyst for AI agents on Base chain. Your job is to determine if a contract is safe for an autonomous agent to interact with.

Assess trust based on:
- Source code verification on Etherscan/Basescan
- ABI structure (presence of dangerous functions)
- DexScreener market activity (liquidity, volume, trading history)
- Known protocol associations
- Proxy patterns and upgrade mechanisms
- Admin key risks and centralization

IMPORTANT: If Etherscan API is unavailable (no API key), do NOT penalize heavily. Instead rely on DexScreener market data.
A contract with active trading, decent liquidity, and real volume is more trustworthy than an unknown contract, even if source code is unverified.

Return ONLY valid JSON:

{
  "trustScore": number (0-100, higher = more trusted),
  "verdict": "TRUSTED" | "CAUTION" | "AVOID",
  "verified": boolean,
  "flags": ["flag1", "flag2"],
  "strengths": ["strength1", "strength2"],
  "riskFactors": ["risk1", "risk2"],
  "agentSafe": boolean,
  "recommendation": "string (specific guidance for autonomous agent)"
}`

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string; chain?: string } = {}
    try {
      const text = await req.text()
      if (text?.trim().startsWith('{')) body = JSON.parse(text)
    } catch {}
    const url = new URL(req.url)
    if (!body.address) body.address = url.searchParams.get('address') || undefined

    const { address } = body
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json({ error: 'Provide a valid contract address (0x...)' }, { status: 400 })
    }

    console.log(`[ContractTrust] Evaluating: ${address}`)

    const hasApiKey = !!(process.env.BASESCAN_API_KEY ?? '').trim()

    const [contractData, dexData, txs] = await Promise.all([
      basescan.getABI(address).catch(() => ({ verified: false, abi: null })),
      fetchDexScreener(address),
      hasApiKey ? basescan.getTxList(address, 10).catch(() => []) : Promise.resolve([]),
    ])

    const dexContext = dexData
      ? `=== DexScreener (live market data) ===\nToken: ${dexData.name} (${dexData.symbol})\nLiquidity: $${dexData.liquidity?.toLocaleString() ?? 'N/A'}\nVolume 24h: $${dexData.volume24h?.toLocaleString() ?? 'N/A'}\nBuys/Sells 24h: ${dexData.buys24h ?? 0}/${dexData.sells24h ?? 0}\nPair age: ${dexData.pairAge}\nDEX: ${dexData.dex}`
      : 'DexScreener: No trading pairs found on Base'

    const raw = await callLLM({
      system: SYSTEM,
      user: `Evaluate trust for contract on Base:\nAddress: ${address}\n\n=== Etherscan Verification ===\nVerified: ${contractData.verified}\nAPI key available: ${hasApiKey}\nABI snippet: ${contractData.abi && contractData.abi !== 'Contract source code not verified' ? String(contractData.abi).slice(0, 400) : 'Not available'}\nRecent txs from Etherscan: ${txs.length}\n\n${dexContext}`,
      temperature: 0.2,
      maxTokens: 700,
    })
    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[ContractTrust] Error:', error)
    return Response.json({ error: 'Contract trust evaluation failed', message: (error as Error).message }, { status: 500 })
  }
}
