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
const SYSTEM = `You are a smart contract security auditor specializing in Base chain deployments. Review contracts or project descriptions before deployment.

Common vulnerabilities to check:
- Reentrancy attacks
- Integer overflow/underflow
- Access control issues (missing onlyOwner, improper roles)
- Unchecked external calls
- Centralization risks (admin can rug)
- Proxy upgrade vulnerabilities
- Oracle manipulation risks
- Flash loan attack vectors
- Missing event emissions for critical state changes

Return ONLY valid JSON:

{
  "securityScore": number (0-100, higher = more secure),
  "verdict": "SAFE_TO_DEPLOY" | "DEPLOY_WITH_CAUTION" | "DO_NOT_DEPLOY",
  "vulnerabilities": [
    {
      "type": "string",
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "description": "string",
      "recommendation": "string"
    }
  ],
  "centralizationRisks": ["risk1", "risk2"],
  "positives": ["positive1", "positive2"],
  "requiredFixes": ["fix1", "fix2"],
  "auditRecommendations": ["rec1", "rec2"],
  "recommendation": "string (clear go/no-go)"
}`

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { contractCode?: string; description?: string; projectName?: string } = {}
    try {
      const text = await req.text()
      if (text?.trim().startsWith('{')) body = JSON.parse(text)
    } catch {}
    const url = new URL(req.url)
    if (!body.description) body.description = url.searchParams.get('description') || undefined
    if (!body.projectName) body.projectName = url.searchParams.get('projectName') || undefined

    const { contractCode, description, projectName } = body
    if (!contractCode && !description) {
      return Response.json({ error: 'Provide contractCode or description' }, { status: 400 })
    }

    console.log(`[BaseDeployCheck] Checking: ${projectName ?? 'unnamed project'}`)

    const raw = await callLLM({
      system: SYSTEM,
      user: `Pre-deployment security check for Base:\nProject: ${projectName ?? 'Not specified'}\nDescription: ${description ?? 'Not provided'}\nContract code:\n${contractCode ? contractCode.slice(0, 2000) : 'Not provided — use description only'}\n\nProvide max 4 vulnerabilities, max 3 required fixes.`,
      temperature: 0.2,
      maxTokens: 1000,
    })
    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[BaseDeployCheck] Error:', error)
    return Response.json({ error: 'Deploy check failed', message: (error as Error).message }, { status: 500 })
  }
}
