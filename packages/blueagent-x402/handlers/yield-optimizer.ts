import { askJSON } from '../lib/llm.js'

interface Input { token: string; chain?: string }
interface Output {
  token: string
  topOpportunities: { protocol: string; pair: string; apy: string; tvl: string; risk: string }[]
  bestAPY: string
  recommendation: string
}

export default async function handler({ token }: Input): Promise<Output> {
  return askJSON<Output>(`
    Find the best yield farming and staking opportunities for token: ${token} on Base.
    Return JSON: {
      token,
      topOpportunities: [{ protocol, pair, apy, tvl, risk: "LOW"|"MEDIUM"|"HIGH" }] (up to 5 best options),
      bestAPY (highest APY found, e.g. "24.5%"),
      recommendation (which opportunity to choose and why)
    }
    Focus on Base DeFi protocols: Aerodrome, Moonwell, Compound, ExtraFi, Beefy, Convex.
  `, 'You are a DeFi yield optimization expert on Base. Be specific with current APY ranges and TVL estimates.')
}
