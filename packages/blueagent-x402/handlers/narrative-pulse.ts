import { askJSON } from '../lib/llm.js'

interface Input { query: string }
interface Output {
  query: string
  heatScore: number
  trending: string[]
  momentum: 'RISING' | 'PEAK' | 'FADING' | 'EMERGING'
  keyPlayers: string[]
  catalysts: string[]
  timeframe: string
  summary: string
}

export default async function handler({ query }: Input): Promise<Output> {
  return askJSON<Output>(`
    Analyze the crypto narrative and trend momentum for: "${query}"
    Focus on Base ecosystem and onchain activity in 2025-2026.
    Return JSON: {
      query,
      heatScore (0-100),
      trending (top 3 related tokens/projects),
      momentum: "RISING"|"PEAK"|"FADING"|"EMERGING",
      keyPlayers (top builders/projects in this narrative),
      catalysts (what's driving this narrative),
      timeframe (how long this narrative has been active),
      summary
    }
  `, 'You are a crypto narrative analyst specializing in Base ecosystem trends.')
}
