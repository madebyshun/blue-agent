import { getYieldPools } from '../lib/api.js'

interface Input { token: string; chain?: string }
interface Output {
  token: string
  topOpportunities: { protocol: string; pair: string; apy: string; tvl: string; risk: string }[]
  bestAPY: string
  recommendation: string
}

export default async function handler({ token }: Input): Promise<Output> {
  const pools = await getYieldPools('Base')

  const symbol = token.toUpperCase().replace('$', '')
  const relevant = pools
    .filter(p => p.symbol?.toUpperCase().includes(symbol) && p.apy > 0)
    .slice(0, 5)

  if (!relevant.length) {
    const top = pools.slice(0, 5)
    return {
      token,
      topOpportunities: top.map(p => ({
        protocol: p.project,
        pair: p.symbol,
        apy: `${p.apy.toFixed(2)}%`,
        tvl: `$${(p.tvlUsd / 1e6).toFixed(1)}M`,
        risk: p.apy > 50 ? 'HIGH' : p.apy > 20 ? 'MEDIUM' : 'LOW'
      })),
      bestAPY: `${top[0]?.apy.toFixed(2) ?? '0'}%`,
      recommendation: `No direct ${token} pools found. Top Base yield opportunities shown instead.`
    }
  }

  return {
    token,
    topOpportunities: relevant.map(p => ({
      protocol: p.project,
      pair: p.symbol,
      apy: `${p.apy.toFixed(2)}%`,
      tvl: `$${(p.tvlUsd / 1e6).toFixed(1)}M`,
      risk: p.apy > 50 ? 'HIGH' : p.apy > 20 ? 'MEDIUM' : 'LOW'
    })),
    bestAPY: `${relevant[0].apy.toFixed(2)}%`,
    recommendation: `Best yield for ${token}: ${relevant[0].project} at ${relevant[0].apy.toFixed(2)}% APY`
  }
}
