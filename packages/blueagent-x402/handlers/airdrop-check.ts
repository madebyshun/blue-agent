import { askJSON } from '../lib/llm.js'

interface Input { address: string; chain?: string }
interface Output {
  address: string
  eligible: { project: string; amount: string; valueUSD: string; deadline: string; claimUrl: string }[]
  totalEstimatedValue: string
  missedAirdrops: string[]
  tip: string
}

export default async function handler({ address }: Input): Promise<Output> {
  return askJSON<Output>(`
    Check airdrop eligibility for wallet: ${address} on Base and Ethereum.
    Consider active and upcoming airdrops in 2025-2026 for Base ecosystem projects.
    Return JSON: {
      address,
      eligible: [{ project, amount, valueUSD, deadline, claimUrl }] (confirmed or likely eligible),
      totalEstimatedValue (sum range, e.g. "$200–$600"),
      missedAirdrops (recent ones this wallet likely missed),
      tip (one actionable tip to qualify for more airdrops)
    }
    Base your estimates on typical airdrop criteria: transaction history, TVL, protocol usage.
  `, 'You are an airdrop research expert specializing in Base ecosystem.')
}
