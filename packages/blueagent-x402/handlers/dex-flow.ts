import { askJSON } from '../lib/llm.js'

interface Input { token: string; chain?: string }
interface Output {
  token: string
  priceUSD: string
  volume24h: string
  liquidity: string
  priceChange24h: string
  buyPressure: string
  verdict: string
}

export default async function handler({ token }: Input): Promise<Output> {
  return askJSON<Output>(`
    Analyze DEX trading flow and market data for token: ${token} on Base.
    Return JSON: {
      token,
      priceUSD (e.g. "$0.001234"),
      volume24h (e.g. "$1.2M"),
      liquidity (e.g. "$800K"),
      priceChange24h (e.g. "+5.2%" or "-3.1%"),
      buyPressure: "STRONG BUY" | "MILD BUY" | "MILD SELL" | "STRONG SELL",
      verdict (1 sentence on current market dynamics)
    }
  `, 'You are a DEX market analyst on Base. Be specific about Aerodrome, Uniswap v3, and BaseSwap activity.')
}
