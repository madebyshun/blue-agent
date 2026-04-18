import { askJSON } from '../lib/llm.js'

interface Input { address: string; pool?: string; chain?: string }
interface Output {
  address: string
  positions: { pool: string; value: string; feesEarned: string; impermanentLoss: string; daysActive: number; health: 'GOOD' | 'OK' | 'REBALANCE' }[]
  totalValue: string
  totalIL: string
  totalFees: string
  recommendation: string
}

export default async function handler({ address, pool = '' }: Input): Promise<Output> {
  return askJSON<Output>(`
    Analyze LP (liquidity provider) positions for wallet: ${address} on Base.
    ${pool ? `Focus on pool: ${pool}` : 'Check all LP positions.'}
    Return JSON: {
      address,
      positions: [{ pool, value, feesEarned, impermanentLoss, daysActive, health: "GOOD"|"OK"|"REBALANCE" }],
      totalValue,
      totalIL (total impermanent loss),
      totalFees (total fees earned),
      recommendation (should they rebalance, withdraw, or hold?)
    }
  `, 'You are a DeFi LP strategy expert on Base. Be specific about Aerodrome, Uniswap v3, and other Base DEXes.')
}
