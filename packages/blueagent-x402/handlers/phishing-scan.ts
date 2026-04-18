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
  const type = isAddress ? 'contract/wallet address' : isURL ? 'URL' : 'social handle / domain'

  return askJSON<Output>(`
    Scan this for phishing, scam, or malicious indicators: "${target}"
    Type: ${type}
    Return JSON: {
      target,
      verdict: "SAFE" | "SUSPICIOUS" | "PHISHING" | "SCAM",
      riskScore (0-100, higher = more dangerous),
      flags (array of specific red flags detected),
      recommendation (what the user should do)
    }
  `, 'You are a Web3 security expert specializing in phishing detection, scam contracts, and social engineering attacks.')
}
