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
const SYSTEM = `You are an autonomous agent safety system — the circuit breaker that decides if an AI agent should stop all operations immediately.

This is a critical safety check for Zero-Human Companies (ZHC) where no human is monitoring. You must be conservative — when in doubt, PAUSE.

Triggers for HALT (immediate stop, requires human review):
- Losses exceed 20% of portfolio in a session
- Multiple BLOCK decisions from risk-gate in a row
- Unusual transaction patterns or anomalies
- Potential smart contract exploit detected
- Agent acting outside its defined scope

Triggers for PAUSE (temporary stop, auto-resume after cooldown):
- Single high-risk action detected
- Market conditions extremely volatile
- Approaching daily loss limit

Return ONLY valid JSON:

{
  "decision": "CONTINUE" | "PAUSE" | "HALT",
  "urgency": "IMMEDIATE" | "SOON" | "MONITOR",
  "reasons": ["reason1", "reason2"],
  "cooldownPeriod": "string (e.g. '30 minutes', 'Until human review', 'N/A')",
  "riskScore": number (0-100),
  "triggerConditions": ["condition1", "condition2"],
  "recommendation": "string (specific instructions for the agent)",
  "requiresHumanReview": boolean
}`

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { agentId?: string; action?: string; context?: string; recentLosses?: string; consecutiveBlocks?: number; sessionDuration?: string } = {}
    try {
      const text = await req.text()
      if (text?.trim().startsWith('{')) body = JSON.parse(text)
    } catch {}
    const url = new URL(req.url)
    if (!body.agentId) body.agentId = url.searchParams.get('agentId') || undefined
    if (!body.action) body.action = url.searchParams.get('action') || undefined
    if (!body.context) body.context = url.searchParams.get('context') || undefined

    if (!body.action && !body.context) {
      return Response.json({ error: 'Provide action or context for circuit breaker evaluation' }, { status: 400 })
    }

    console.log(`[CircuitBreaker] Evaluating agent: ${body.agentId ?? 'unknown'}`)

    const raw = await callLLM({
      system: SYSTEM,
      user: `Circuit breaker evaluation:\nAgent ID: ${body.agentId ?? 'unknown'}\nCurrent action: ${body.action ?? 'N/A'}\nContext: ${body.context ?? 'None provided'}\nRecent losses: ${body.recentLosses ?? 'Not specified'}\nConsecutive risk blocks: ${body.consecutiveBlocks ?? 0}\nSession duration: ${body.sessionDuration ?? 'Unknown'}\n\nShould this agent continue, pause, or halt?`,
      temperature: 0.1,
      maxTokens: 600,
    })
    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[CircuitBreaker] Error:', error)
    // On error, PAUSE for safety
    return Response.json({
      decision: 'PAUSE',
      urgency: 'IMMEDIATE',
      reasons: ['Circuit breaker evaluation failed — pausing for safety'],
      cooldownPeriod: 'Until manual review',
      riskScore: 80,
      triggerConditions: ['Evaluation system error'],
      recommendation: 'Stop all operations and await manual review.',
      requiresHumanReview: true,
    }, { status: 200 })
  }
}
