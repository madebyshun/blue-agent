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
const SYSTEM = `You are a crypto security expert specializing in phishing detection, scam identification, and social engineering attacks targeting Web3 users on Base.

Analyze the provided target (URL, wallet address, or social handle) for phishing and scam indicators.

Common patterns to detect:
- Lookalike domains (uniswap-airdrop.com, base-claim.xyz)
- Fake airdrop/claim sites
- Impersonation accounts (@0xVita1ik, @colinarmstrng)
- Contract addresses used in known scams
- Suspicious URL patterns (too many subdomains, recent registration)
- Urgency tactics ("claim expires in 24h")

Return ONLY valid JSON:

{
  "isPhishing": boolean,
  "verdict": "SAFE" | "SUSPICIOUS" | "PHISHING" | "SCAM",
  "confidence": number (0-100),
  "riskScore": number (0-100),
  "indicators": ["indicator1", "indicator2"],
  "targetType": "url" | "address" | "handle" | "unknown",
  "recommendation": "string",
  "safeToInteract": boolean
}`

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { target?: string } = {}
    try {
      const text = await req.text()
      if (text?.trim().startsWith('{')) body = JSON.parse(text)
    } catch {}
    const url = new URL(req.url)
    if (!body.target) body.target = url.searchParams.get('target') || url.searchParams.get('url') || undefined

    const { target } = body
    if (!target) return Response.json({ error: 'Provide target (URL, address, or @handle)' }, { status: 400 })

    console.log(`[PhishingScan] Scanning: ${target}`)

    const raw = await callLLM({
      system: SYSTEM,
      user: `Scan for phishing/scam indicators:\nTarget: ${target}\n\nAnalyze this target carefully. Consider domain age, URL structure, impersonation patterns, known scam databases, and crypto-specific attack vectors.`,
      temperature: 0.2,
      maxTokens: 600,
    })
    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[PhishingScan] Error:', error)
    return Response.json({ error: 'Phishing scan failed', message: (error as Error).message }, { status: 500 })
  }
}
