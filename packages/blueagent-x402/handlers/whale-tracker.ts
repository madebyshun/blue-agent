import { askJSON } from '../lib/llm.js'

interface Input { address: string; chain?: string }
interface Output {
  address: string
  recentMoves: { wallet: string; action: string; value: string; time: string }[]
  smartMoneyScore: number
  summary: string
}

export default async function handler({ address }: Input): Promise<Output> {
  return askJSON<Output>(`
    Analyze whale and smart money activity for address/token: ${address} on Base.
    Return JSON: {
      address,
      recentMoves: [{ wallet, action, value, time }] (up to 5 moves),
      smartMoneyScore (0-100),
      summary
    }
  `, 'You are an onchain analyst tracking whale wallets and smart money flows on Base.')
}
