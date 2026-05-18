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
const SYSTEM = `You are a quantum cryptography expert assessing whether an Ethereum wallet's public key has been exposed on-chain.

Critical facts:
- When a wallet SENDS a transaction, the ECDSA signature reveals the public key
- If public key is exposed, a sufficiently powerful quantum computer could derive the private key
- Wallets that have ONLY received funds (never sent) have unexposed public keys = safer
- Even 1 outgoing transaction = public key exposed forever on-chain

Return ONLY valid JSON:

{
  "address": "string",
  "exposed": boolean,
  "txCount": number,
  "outgoingTxCount": number,
  "firstExposureDate": "string or null",
  "riskLevel": "SAFE" | "EXPOSED" | "CRITICAL",
  "riskScore": number (0-100),
  "explanation": "string (clear explanation for non-technical users)",
  "migrationUrgency": "URGENT" | "RECOMMENDED" | "OPTIONAL" | "NOT_NEEDED",
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
    if (!body.chain) body.chain = url.searchParams.get('chain') || 'base'

    const { address } = body
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json({ error: 'Provide a valid wallet address (0x...)' }, { status: 400 })
    }

    console.log(`[KeyExposure] Checking: ${address}`)

    const txs = await basescan.getTxList(address, 100)
    const outgoing = txs.filter((tx: any) => tx.from?.toLowerCase() === address.toLowerCase())
    const firstOutgoing = outgoing.length > 0 ? outgoing[outgoing.length - 1] : null

    const raw = await callLLM({
      system: SYSTEM,
      user: `Check public key exposure for wallet: ${address}\n\nOnchain data:\n- Total transactions: ${txs.length}\n- Outgoing transactions (sent by wallet): ${outgoing.length}\n- First outgoing tx date: ${firstOutgoing ? new Date(parseInt(firstOutgoing.timeStamp) * 1000).toISOString() : 'None found'}\n\nBased on this data, assess quantum exposure risk.`,
      temperature: 0.2,
      maxTokens: 600,
    })
    return Response.json(extractJSON(raw))
  } catch (error) {
    console.error('[KeyExposure] Error:', error)
    return Response.json({ error: 'Key exposure check failed', message: (error as Error).message }, { status: 500 })
  }
}
