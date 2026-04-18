import { askJSON } from '../lib/llm.js'

interface Input { address: string; chain?: string }
interface Output {
  address: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  complianceScore: number
  flags: string[]
  sanctioned: boolean
  mixerUsed: boolean
  darknetLinked: boolean
  recommendation: string
}

export default async function handler({ address }: Input): Promise<Output> {
  return askJSON<Output>(`
    Run AML (Anti-Money Laundering) compliance check for wallet address: ${address} on Base.
    Return JSON: {
      address,
      riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      complianceScore (0-100, higher = cleaner),
      flags (array of specific compliance concerns found),
      sanctioned (boolean — is address on OFAC or similar sanction list?),
      mixerUsed (boolean — has address interacted with mixers like Tornado Cash?),
      darknetLinked (boolean — any darknet market connections?),
      recommendation (1-2 sentence compliance guidance)
    }
  `, 'You are a blockchain compliance analyst specializing in AML screening. Be accurate and cite specific concerns.')
}
