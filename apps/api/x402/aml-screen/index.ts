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
const SYSTEM = `You are an AML (Anti-Money Laundering) compliance specialist analyzing blockchain wallets for financial crime risk.

Analyze transaction patterns for AML red flags:
- Structuring (many small transactions to avoid thresholds)
- Layering (rapid fund movement through multiple wallets)
- Mixer/tumbler interactions (Tornado Cash or similar)
- High-frequency transfers with round numbers
- Connections to known high-risk addresses
- Unusual transaction velocity
- Cross-chain bridge abuse

Note: This is an AI-based screening tool, not a regulatory compliance product. Results are indicative only.

Return ONLY valid JSON:

{
  "amlRisk": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "riskScore": number (0-100),
  "verdict": "CLEAN" | "MONITOR" | "SUSPICIOUS" | "HIGH_RISK",
  "flags": ["flag1", "flag2"],
  "patterns": ["pattern1", "pattern2"],
  "transactionProfile": "string (brief description of wallet behavior)",
  "recommendedAction": "APPROVE" | "MANUAL_REVIEW" | "REJECT",
  "disclaimer": "AI screening only — not regulatory compliance",
  "recommendation": "string"
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

    console.log(`[AMLScreen] Screening: ${address}`)

    const [txs, tokenTxs] = await Promise.all([
      basescan.getTxList(address, 100).catch(() => []),
      basescan.getTokenTx(address, 50).catch(() => []),
    ])

    const profile = {
      totalTx: txs.length,
      uniqueCounterparties: new Set([...txs.map((t: any) => t.from), ...txs.map((t: any) => t.to)]).size,
      avgTimeBetweenTx: txs.length > 1 ? 'calculated' : 'N/A',
      tokenTypes: [...new Set(tokenTxs.map((t: any) => t.tokenSymbol))].slice(0, 10),
      recentActivity: txs.slice(0, 5).map((tx: any) => ({
        direction: tx.from?.toLowerCase() === address.toLowerCase() ? 'OUT' : 'IN',
        to: tx.to?.slice(0, 10),
        value: tx.value,
        timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
      })),
    }

    const raw = await callLLM({
      system: SYSTEM,
      user: `AML screening for wallet: ${address}\n\nTransaction profile:\n${JSON.stringify(profile, null, 2)}\n\nAssess for money laundering risk patterns.`,
      temperature: 0.2,
      maxTokens: 700,
    })
    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[AMLScreen] Error:', error)
    return Response.json({ error: 'AML screening failed', message: (error as Error).message }, { status: 500 })
  }
}
