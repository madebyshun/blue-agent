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
const SYSTEM = `You are a blockchain alert engine analyzing on-chain data for alert triggers.

Check the provided data and determine which alerts should fire.

Return ONLY valid JSON:
{
  "alerts": [
    {
      "topic": "whale_movement" | "circuit_breaker" | "quantum_exposure" | "honeypot_detected" | "rug_risk",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "message": "string (human-readable alert message)",
      "actionRequired": "string (what to do)",
      "data": {}
    }
  ],
  "summary": "string",
  "nextCheckIn": "string (e.g. '5 minutes')"
}`

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string; agentId?: string; topics?: string[] } = {}
    try {
      const text = await req.text()
      if (text?.trim().startsWith('{')) body = JSON.parse(text)
    } catch {}
    const url = new URL(req.url)
    if (!body.address) body.address = url.searchParams.get('address') || undefined

    const { address, agentId, topics = ['whale_movement', 'rug_risk'] } = body
    if (!address) return Response.json({ error: 'address is required' }, { status: 400 })

    console.log(`[AlertCheck] Checking alerts for: ${address}`)

    // Fetch recent transactions for context
    let txData: any[] = []
    let tokenTxData: any[] = []
    try {
      txData = await basescan.getTxList(address, 20)
      tokenTxData = await basescan.getTokenTx(address, 20)
    } catch {
      console.warn('[AlertCheck] Basescan fetch failed')
    }

    const raw = await callLLM({
      system: SYSTEM,
      user: `Check alerts for address: ${address}
Agent ID: ${agentId ?? 'unknown'}
Topics to check: ${topics.join(', ')}

Recent transactions (last 20):
${JSON.stringify(txData.slice(0, 10), null, 2)}

Recent token transfers:
${JSON.stringify(tokenTxData.slice(0, 10), null, 2)}

Analyze for alert conditions and fire any that are triggered.`,
      temperature: 0.2,
      maxTokens: 800,
    })

    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[AlertCheck] Error:', error)
    return Response.json({ error: 'Alert check failed', message: (error as Error).message }, { status: 500 })
  }
}
