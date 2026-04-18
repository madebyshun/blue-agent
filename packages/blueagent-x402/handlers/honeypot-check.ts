import { getTokenSecurity } from '../lib/api.js'

interface Input { token: string; chain?: string }
interface Output {
  token: string
  isHoneypot: boolean
  canSell: boolean
  buyTax: string
  sellTax: string
  isVerified: boolean
  hasBlacklist: boolean
  hasMint: boolean
  verdict: 'SAFE' | 'WARNING' | 'DANGER'
  reasons: string[]
}

export default async function handler({ token }: Input): Promise<Output> {
  const sec = await getTokenSecurity(token)
  const reasons: string[] = []

  const isHoneypot = sec['is_honeypot'] === '1'
  const canSell = sec['cannot_sell_all'] !== '1'
  const buyTax = sec['buy_tax'] ? `${(Number(sec['buy_tax']) * 100).toFixed(1)}%` : '0%'
  const sellTax = sec['sell_tax'] ? `${(Number(sec['sell_tax']) * 100).toFixed(1)}%` : '0%'
  const isVerified = sec['is_open_source'] === '1'
  const hasBlacklist = sec['is_blacklisted'] === '1'
  const hasMint = sec['is_mintable'] === '1'

  if (isHoneypot) reasons.push('Honeypot detected — cannot sell')
  if (!canSell) reasons.push('Sell blocked for all holders')
  if (Number(sec['sell_tax']) > 0.1) reasons.push(`High sell tax: ${sellTax}`)
  if (!isVerified) reasons.push('Contract not open source')
  if (hasBlacklist) reasons.push('Blacklist function exists')
  if (hasMint) reasons.push('Owner can mint new tokens')

  const verdict = isHoneypot || !canSell ? 'DANGER'
    : reasons.length >= 2 ? 'WARNING'
    : 'SAFE'

  return { token, isHoneypot, canSell, buyTax, sellTax, isVerified, hasBlacklist, hasMint, verdict, reasons }
}
