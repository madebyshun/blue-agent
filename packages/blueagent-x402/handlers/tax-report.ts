import { askJSON } from '../lib/llm.js'

interface Input { address: string; year?: string; chain?: string }
interface Output {
  address: string
  year: string
  totalTrades: number
  realizedGains: string
  realizedLosses: string
  netPnL: string
  incomeEvents: { type: string; amount: string; date: string }[]
  taxableEvents: number
  estimatedTaxLiability: string
  recommendation: string
}

export default async function handler({ address, year }: Input): Promise<Output> {
  const taxYear = year ?? String(new Date().getFullYear() - 1)

  return askJSON<Output>(`
    Generate a tax summary for wallet: ${address} for tax year ${taxYear} on Base.
    Return JSON: {
      address,
      year: "${taxYear}",
      totalTrades,
      realizedGains,
      realizedLosses,
      netPnL,
      incomeEvents: [{ type, amount, date }] (staking rewards, airdrops, etc.),
      taxableEvents,
      estimatedTaxLiability (rough estimate),
      recommendation (tax optimization tip)
    }
    Note: This is an estimate. Recommend professional tax advice for accuracy.
  `, 'You are a crypto tax expert. Be clear that this is an estimate and professional advice is recommended.')
}
