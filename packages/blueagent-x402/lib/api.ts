// DexScreener — free, no key required
export async function getDexScreener(token: string) {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`)
  return res.json() as Promise<{ pairs: { priceUsd: string; volume: { h24: number }; liquidity: { usd: number }; priceChange: { h24: number } }[] }>
}

// GoPlus Security — free, no key required
export async function getTokenSecurity(token: string, chainId = '8453') {
  const res = await fetch(`https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${token}`)
  const data = await res.json() as { result: Record<string, Record<string, string>> }
  return data.result[token.toLowerCase()] ?? {}
}

export async function getAddressSecurity(address: string) {
  const res = await fetch(`https://api.gopluslabs.io/api/v1/address_security?address=${address}`)
  const data = await res.json() as { result: Record<string, string> }
  return data.result ?? {}
}

// DeFiLlama — free, no key required
export async function getYieldPools(chain = 'Base') {
  const res = await fetch('https://yields.llama.fi/pools')
  const data = await res.json() as { data: { chain: string; project: string; symbol: string; apy: number; tvlUsd: number }[] }
  return data.data.filter(p => p.chain === chain).sort((a, b) => b.apy - a.apy)
}
