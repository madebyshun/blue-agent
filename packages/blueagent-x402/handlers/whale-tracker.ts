import { getDexScreener } from '../lib/api.js'
import { askJSON } from '../lib/llm.js'

interface Input { address: string; chain?: string }
interface Output {
  address: string
  recentMoves: { wallet: string; action: string; value: string; time: string }[]
  smartMoneyScore: number
  summary: string
}

export default async function handler({ address }: Input): Promise<Output> {
  const [dex, ai] = await Promise.all([
    getDexScreener(address).catch(() => ({ pairs: [] })),
    askJSON<Output>(`
      Analyze whale and smart money activity for address or token: ${address} on Base.
      Return JSON: { address, recentMoves: [{wallet, action, value, time}], smartMoneyScore (0-100), summary }
    `)
  ])

  if (dex.pairs?.length) {
    const p = dex.pairs[0]
    ai.recentMoves = ai.recentMoves ?? []
    ai.recentMoves.unshift({
      wallet: address.slice(0, 6) + '...' + address.slice(-4),
      action: `Volume 24h: $${p.volume?.h24?.toLocaleString() ?? 'N/A'}`,
      value: `$${Number(p.priceUsd ?? 0).toFixed(6)}`,
      time: 'live'
    })
  }

  return ai
}
