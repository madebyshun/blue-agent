import { askJSON } from '../lib/llm.js'

interface Input { token: string; chain?: string }
interface Output {
  token: string
  isHoneypot: boolean
  canSell: boolean
  buyTax: string
  sellTax: string
  isVerified: boolean
  hasBlacklist: boolean
  hasMint: boolean
  verdict: 'SAFE' | 'WARNING' | 'DANGER'
  reasons: string[]
}

export default async function handler({ token }: Input): Promise<Output> {
  return askJSON<Output>(`
    Perform a honeypot and smart contract security check for token: ${token} on Base.
    Return JSON: {
      token,
      isHoneypot (boolean),
      canSell (boolean — can holders sell?),
      buyTax (e.g. "2.0%"),
      sellTax (e.g. "5.0%"),
      isVerified (boolean — is contract open source/verified?),
      hasBlacklist (boolean — does contract have blacklist function?),
      hasMint (boolean — can owner mint new tokens?),
      verdict: "SAFE" | "WARNING" | "DANGER",
      reasons (array of specific risk flags found)
    }
  `, 'You are a smart contract security auditor specializing in honeypot detection on Base. Be thorough and specific.')
}
