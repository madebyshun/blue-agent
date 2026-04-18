import { askJSON } from '../lib/llm.js'

interface Input { query: string }
interface Output {
  query: string
  recentDeals: { project: string; vc: string; amount: string; date: string; stage: string }[]
  hotThemes: string[]
  activeVCs: string[]
  marketSignal: 'BULLISH' | 'NEUTRAL' | 'BEARISH'
  summary: string
}

export default async function handler({ query }: Input): Promise<Output> {
  return askJSON<Output>(`
    Research VC investment activity for: "${query}"
    Focus on crypto/Web3 investments, Base ecosystem, 2024-2026.
    Return JSON: {
      query,
      recentDeals: [{ project, vc, amount, date, stage }] (up to 5),
      hotThemes (what themes VCs are funding now),
      activeVCs (most active VCs in this space),
      marketSignal: "BULLISH"|"NEUTRAL"|"BEARISH",
      summary
    }
  `, 'You are a crypto VC research analyst with deep knowledge of Web3 fundraising.')
}
