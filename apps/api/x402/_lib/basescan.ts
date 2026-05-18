const BASE_URL = 'https://api.etherscan.io/v2/api'
const key = () => process.env.BASESCAN_API_KEY || ''

async function query(params: Record<string, string>): Promise<any> {
  const url = new URL(BASE_URL)
  // Etherscan V2 requires chainid param for Base
  Object.entries({ chainid: '8453', ...params, apikey: key() }).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString())
  return res.json()
}

export const basescan = {
  getABI: async (address: string) => {
    const data = await query({ module: 'contract', action: 'getabi', address })
    return { verified: data.status === '1', abi: data.result }
  },

  getTokenTx: async (address: string, limit = 50) => {
    const data = await query({ module: 'account', action: 'tokentx', address, sort: 'desc' })
    return ((data.result as any[]) ?? []).slice(0, limit)
  },

  getTxList: async (address: string, limit = 100) => {
    const data = await query({ module: 'account', action: 'txlist', address, sort: 'desc' })
    return ((data.result as any[]) ?? []).slice(0, limit)
  },

  getTokenInfo: async (address: string) => {
    const data = await query({ module: 'token', action: 'tokeninfo', contractaddress: address })
    return (data.result as any[])?.[0] ?? null
  },
}
