import { askJSON } from '../lib/llm.js'

interface Input { token: string }
interface Output {
  token: string
  score: number
  supplyStructure: { total: string; circulating: string; locked: string }
  inflationRate: string
  vestingCliff: string
  distributionHealth: 'HEALTHY' | 'MODERATE' | 'RISKY'
  strengths: string[]
  risks: string[]
  verdict: string
}

export default async function handler({ token }: Input): Promise<Output> {
  return askJSON<Output>(`
    Analyze the tokenomics of: ${token}
    Return JSON: {
      token,
      score (0-100),
      supplyStructure: { total, circulating, locked },
      inflationRate (e.g. "3.2% annual"),
      vestingCliff (next major unlock event),
      distributionHealth: "HEALTHY"|"MODERATE"|"RISKY",
      strengths (array),
      risks (array),
      verdict (1-2 sentence summary)
    }
  `, 'You are a tokenomics expert. Be specific with numbers. If data is uncertain, give best estimate with caveat.')
}
