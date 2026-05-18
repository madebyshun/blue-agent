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
const SYSTEM = `You are a quantum computing threat analyst specializing in cryptographic risks to blockchain networks.

Today is April 2026. Key recent developments:
- Google Willow chip (2024): 105 qubits, error-correction breakthrough
- Google/Caltech announcement (March 2026): significant milestone in logical qubit scaling
- Current estimate for CRQC (Cryptographically Relevant Quantum Computer): 5-15 years away
- Harvest-now-decrypt-later: adversaries storing encrypted data to decrypt when CRQC arrives
- Ethereum post-quantum roadmap: EIP-7212, quantum-resistant signature schemes in development

Provide an honest, evidence-based timeline. Do not over-alarm or under-alarm.

Return ONLY valid JSON:

{
  "currentThreatLevel": "THEORETICAL" | "EMERGING" | "NEAR" | "CRITICAL",
  "currentYear": "2026",
  "yearsUntilPracticalRisk": "string (e.g. '5-15 years for CRQC')",
  "milestones": [
    {
      "year": "string",
      "event": "string",
      "impactOnWallets": "string",
      "probability": "LOW | MEDIUM | HIGH"
    }
  ],
  "harvestNowRisk": "string (current risk from data harvesting)",
  "ethereumResponse": "string (what Ethereum/Base is doing)",
  "forYourWallet": "string (personalized advice based on query)",
  "actionableNow": ["action1", "action2"],
  "recommendation": "string"
}`

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string; concern?: string } = {}
    try {
      const text = await req.text()
      if (text?.trim().startsWith('{')) body = JSON.parse(text)
    } catch {}
    const url = new URL(req.url)
    if (!body.address) body.address = url.searchParams.get('address') || undefined
    if (!body.concern) body.concern = url.searchParams.get('concern') || undefined

    console.log(`[QuantumTimeline] Generating timeline`)

    const raw = await callLLM({
      system: SYSTEM,
      user: `Generate quantum threat timeline.\nWallet context: ${body.address ?? 'General inquiry'}\nSpecific concern: ${body.concern ?? 'General quantum timeline for crypto'}\n\nProvide 4-5 milestone events from 2026 to 2035. Be evidence-based.`,
      temperature: 0.4,
      maxTokens: 1500,
    })
    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[QuantumTimeline] Error:', error)
    return Response.json({ error: 'Timeline generation failed', message: (error as Error).message }, { status: 500 })
  }
}
