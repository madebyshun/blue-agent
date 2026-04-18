import { askJSON } from '../lib/llm.js'

interface Input { token: string }
interface Output {
  token: string
  nextUnlock: { date: string; amount: string; recipient: string; percentSupply: string }
  totalLocked: string
  unlockSchedule: { date: string; amount: string; category: string }[]
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  summary: string
}

export default async function handler({ token }: Input): Promise<Output> {
  return askJSON<Output>(`
    Research the token unlock schedule and vesting cliffs for: ${token}
    Return JSON: {
      token,
      nextUnlock: { date, amount, recipient, percentSupply },
      totalLocked,
      unlockSchedule: [{ date, amount, category }] (up to 5 entries),
      riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      summary
    }
    Be specific with dates and amounts. If data is unavailable, say so clearly.
  `)
}
