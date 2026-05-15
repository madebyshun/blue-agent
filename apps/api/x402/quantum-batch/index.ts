// x402/quantum-batch/index.ts
// Quantum Batch Scanner - Upto pricing: $0.25/wallet, max $2.50 (10 wallets)
// Powered by Blue Agent

async function callLLM(options: {
  model: string;
  system: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const { model, system, messages, temperature = 0.5, maxTokens = 600 } = options;

  const response = await fetch('https://llm.bankr.bot/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.BANKR_API_KEY!,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, system, messages, temperature, max_tokens: maxTokens }),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.content && Array.isArray(data.content)) return data.content[0].text;
  if (data.text) return data.text;
  throw new Error('Invalid LLM response format');
}

const COST_PER_WALLET = 250000 // $0.25 in atomic USDC (6 decimals)
const MAX_WALLETS = 10

const SYSTEM_PROMPT = `You are a quantum security expert. Analyze multiple Ethereum wallet addresses for quantum computing risk.

For each wallet, assess:
- Public key exposure risk (has it sent transactions?)
- Quantum vulnerability level
- Quick recommendation

Return ONLY valid JSON array. Keep descriptions under 60 chars each.`

export default async function handler(req: Request): Promise<Response> {
  try {
    // Parse addresses from body or query params
    let addresses: string[] = []

    if (req.method === 'POST') {
      try {
        const text = await req.text()
        if (text.trim().startsWith('{')) {
          const body = JSON.parse(text)
          // Support: {"addresses": ["0x...", "0x..."]} or {"address": "0x1,0x2"}
          if (Array.isArray(body.addresses)) {
            addresses = body.addresses
          } else if (typeof body.address === 'string') {
            addresses = body.address.split(',').map((a: string) => a.trim())
          }
        } else if (text.trim().startsWith('[')) {
          addresses = JSON.parse(text)
        }
      } catch { /* ignore */ }
    }

    // Fallback to query params
    if (!addresses.length) {
      const url = new URL(req.url)
      const addrParam = url.searchParams.get('addresses') || url.searchParams.get('address') || ''
      addresses = addrParam.split(',').map(a => a.trim()).filter(Boolean)
    }

    // Validate
    if (!addresses.length) {
      return Response.json({ error: 'Provide addresses as JSON array or comma-separated' }, { status: 400 })
    }

    // Validate format
    const validAddresses = addresses
      .filter(a => /^0x[a-fA-F0-9]{40}$/.test(a))
      .slice(0, MAX_WALLETS)

    if (!validAddresses.length) {
      return Response.json({ error: 'No valid 0x addresses found' }, { status: 400 })
    }

    const count = validAddresses.length
    const actualCost = count * COST_PER_WALLET // in atomic USDC

    console.log(`[Quantum Batch] Scanning ${count} wallets, cost: $${(actualCost / 1_000_000).toFixed(2)}`)

    // Build prompt
    const walletList = validAddresses.map((addr, i) => `${i + 1}. ${addr}`).join('\n')
    const userMessage = `Scan these ${count} wallets for quantum risk:\n${walletList}\n\nReturn JSON array with one object per wallet:\n[{"address":"0x...","riskLevel":"CRITICAL|HIGH|MEDIUM|LOW|MINIMAL","riskScore":0-100,"publicKeyExposed":bool,"recommendation":"string","action":"MIGRATE_NOW|MONITOR|SAFE"}]`

    const llmResponse = await callLLM({
      model: 'claude-haiku-4-5',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: count * 150 + 100,
    })

    // Extract JSON array robustly — handle markdown fences and trailing text
    const raw = llmResponse.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()
    const arrStart = raw.indexOf('[')
    const arrEnd   = raw.lastIndexOf(']')
    if (arrStart < 0 || arrEnd < 0) throw new Error('No JSON array in LLM response')
    const results = JSON.parse(raw.slice(arrStart, arrEnd + 1))

    const response = {
      scanned: count,
      results,
      billing: {
        wallets: count,
        costPerWallet: '$0.25',
        totalCost: `$${(actualCost / 1_000_000).toFixed(2)}`,
      },
      summary: {
        critical: results.filter((r: any) => r.riskLevel === 'CRITICAL').length,
        high: results.filter((r: any) => r.riskLevel === 'HIGH').length,
        medium: results.filter((r: any) => r.riskLevel === 'MEDIUM').length,
        low: results.filter((r: any) => ['LOW', 'MINIMAL'].includes(r.riskLevel)).length,
      }
    }

    // Upto: report actual cost via header
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-402-Settle-Amount': String(actualCost),
      },
    })

  } catch (error) {
    console.error('[Quantum Batch] Error:', error)
    return Response.json(
      { error: 'Batch scan failed', message: (error as Error).message },
      { status: 500 }
    )
  }
}
