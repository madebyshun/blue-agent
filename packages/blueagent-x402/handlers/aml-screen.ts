import { getAddressSecurity } from '../lib/api.js'
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
  const [sec, ai] = await Promise.all([
    getAddressSecurity(address).catch(() => ({})),
    askJSON<Output>(`
      Run AML compliance check for wallet address: ${address} on Base.
      Return JSON: { address, riskLevel, complianceScore (0-100), flags, sanctioned, mixerUsed, darknetLinked, recommendation }
    `)
  ])

  if (sec['is_contract'] || sec['malicious_address']) {
    ai.flags = ai.flags ?? []
    if (sec['malicious_address'] === '1') ai.flags.push('Flagged as malicious by GoPlus')
    ai.riskLevel = 'HIGH'
    ai.complianceScore = Math.min(ai.complianceScore, 30)
  }

  return ai
}
