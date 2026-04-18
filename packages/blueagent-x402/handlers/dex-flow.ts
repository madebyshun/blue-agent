import { getDexScreener } from '../lib/api.js'

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
  const dex = await getDexScreener(token)
  const pair = dex.pairs?.[0]

  if (!pair) {
    return { token, priceUSD: 'N/A', volume24h: 'N/A', liquidity: 'N/A', priceChange24h: 'N/A', buyPressure: 'UNKNOWN', verdict: 'No DEX data found for this token' }
  }

  const change = pair.priceChange?.h24 ?? 0
  const buyPressure = change > 5 ? 'STRONG BUY' : change > 0 ? 'MILD BUY' : change > -5 ? 'MILD SELL' : 'STRONG SELL'

  return {
    token,
    priceUSD: `$${Number(pair.priceUsd ?? 0).toFixed(6)}`,
    volume24h: `$${pair.volume?.h24?.toLocaleString() ?? 'N/A'}`,
    liquidity: `$${pair.liquidity?.usd?.toLocaleString() ?? 'N/A'}`,
    priceChange24h: `${change > 0 ? '+' : ''}${change.toFixed(2)}%`,
    buyPressure,
    verdict: change > 0
      ? `Positive momentum. Liquidity at $${pair.liquidity?.usd?.toLocaleString()}.`
      : `Selling pressure. Monitor liquidity closely.`
  }
}
