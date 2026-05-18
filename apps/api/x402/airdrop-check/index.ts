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
const SYSTEM = `You are a Base ecosystem airdrop analyst helping users identify their eligibility for upcoming and ongoing airdrops.

Analyze wallet activity to assess airdrop eligibility likelihood. Common airdrop criteria on Base:
- Protocol interaction history (Uniswap, Aerodrome, Morpho, Coinbase CDP, etc.)
- Transaction frequency and consistency
- Wallet age and activity patterns
- NFT holdings
- Liquidity provision history
- Bridge activity (Ethereum ↔ Base)
- Use of Coinbase products (Smart Wallet, OnchainKit)

Return ONLY valid JSON:

{
  "eligibilityScore": number (0-100, higher = more likely eligible for airdrops),
  "activityLevel": "INACTIVE" | "LOW" | "MODERATE" | "HIGH" | "POWER_USER",
  "likelyEligible": ["Protocol1 (reason)", "Protocol2 (reason)"],
  "activitySignals": ["signal1", "signal2", "signal3"],
  "weaknesses": ["missing activity1", "missing activity2"],
  "recommendations": ["action1 to improve eligibility", "action2"],
  "estimatedValue": "string (rough range, e.g. '$50-500 if eligible')",
  "topOpportunities": ["opportunity1", "opportunity2"],
  "summary": "2-3 sentence summary"
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
      return Response.json({ error: 'Provide a valid wallet address (0x...)' }, { status: 400 })
    }

    console.log(`[AirdropCheck] Checking: ${address}`)

    const [txs, tokenTxs] = await Promise.all([
      basescan.getTxList(address, 100).catch(() => []),
      basescan.getTokenTx(address, 50).catch(() => []),
    ])

    const uniqueContracts = [...new Set(txs.map((tx: any) => tx.to).filter(Boolean))].slice(0, 20)
    const uniqueTokens = [...new Set(tokenTxs.map((tx: any) => tx.tokenSymbol))].slice(0, 15)

    const raw = await callLLM({
      system: SYSTEM,
      user: `Analyze airdrop eligibility for Base wallet: ${address}\n\nOnchain activity:\n- Total transactions: ${txs.length}\n- Unique contracts interacted: ${uniqueContracts.length}\n- Tokens traded: ${uniqueTokens.join(', ')}\n- Contract addresses: ${uniqueContracts.slice(0, 10).join(', ')}\n\nAssess eligibility for Base ecosystem airdrops.`,
      temperature: 0.5,
      maxTokens: 800,
    })
    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[AirdropCheck] Error:', error)
    return Response.json({ error: 'Airdrop check failed', message: (error as Error).message }, { status: 500 })
  }
}
