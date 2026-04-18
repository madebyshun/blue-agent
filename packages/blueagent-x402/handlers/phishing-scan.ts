import { getAddressSecurity } from '../lib/api.js'
import { askJSON } from '../lib/llm.js'

interface Input { target: string }
interface Output {
  target: string
  verdict: 'SAFE' | 'SUSPICIOUS' | 'PHISHING' | 'SCAM'
  riskScore: number
  flags: string[]
  recommendation: string
}

export default async function handler({ target }: Input): Promise<Output> {
  const isAddress = /^0x[0-9a-fA-F]{40}$/.test(target)
  const isURL = target.startsWith('http')

  const [goplusSec, ai] = await Promise.all([
    isAddress ? getAddressSecurity(target).catch(() => ({})) : Promise.resolve({}),
    askJSON<Output>(`
      Scan this for phishing, scam, or malicious indicators: "${target}"
      Type: ${isAddress ? 'contract/wallet address' : isURL ? 'URL' : 'social handle / domain'}
      Return JSON: { target, verdict: "SAFE"|"SUSPICIOUS"|"PHISHING"|"SCAM", riskScore (0-100), flags, recommendation }
    `)
  ])

  if ((goplusSec as Record<string, string>)['malicious_address'] === '1') {
    ai.verdict = 'PHISHING'
    ai.riskScore = Math.max(ai.riskScore, 90)
    ai.flags = [...(ai.flags ?? []), 'Flagged malicious by GoPlus Security']
  }

  return ai
}
