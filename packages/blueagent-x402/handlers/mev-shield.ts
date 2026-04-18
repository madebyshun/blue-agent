import { askJSON } from '../lib/llm.js'

interface Input { action: string; chain?: string }
interface Output {
  action: string
  mevRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  sandwichProbability: string
  estimatedLoss: string
  recommendations: string[]
  safeSlippage: string
  preferredRouter: string
}

export default async function handler({ action }: Input): Promise<Output> {
  return askJSON<Output>(`
    Analyze MEV risk for this transaction on Base: "${action}"
    Return JSON: {
      action,
      mevRisk: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
      sandwichProbability (e.g. "34%"),
      estimatedLoss (e.g. "$45–$120"),
      recommendations (array of actionable tips),
      safeSlippage (e.g. "0.5%"),
      preferredRouter (e.g. "Uniswap X" or "1inch Fusion")
    }
  `, 'You are an MEV protection expert on Base. Be specific and practical.')
}
