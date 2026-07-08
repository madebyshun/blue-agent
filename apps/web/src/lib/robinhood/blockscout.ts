// Thin server-side client for Robinhood Chain's Blockscout instance (REST API
// v2 — confirmed live at robinhoodchain.blockscout.com/api/v2 and
// explorer.testnet.chain.robinhood.com/api/v2, same shape on both networks).
// Read-only — no wallet/signing involved. Used to power the "Explore" panel
// on /app/launches so users can see real holders/transfers for a Robinhood
// direct-deploy token without leaving the app.

const EXPLORER_BASE = {
  mainnet: "https://robinhoodchain.blockscout.com",
  testnet: "https://explorer.testnet.chain.robinhood.com",
} as const;

export type RobinhoodNetwork = keyof typeof EXPLORER_BASE;

export type BlockscoutAddressRef = {
  hash: string;
  is_contract: boolean;
  is_verified: boolean;
  name: string | null;
};

export type BlockscoutTokenInfo = {
  address_hash: string;
  name: string | null;
  symbol: string | null;
  decimals: string | null;
  total_supply: string | null;
  holders_count: string | null;
  exchange_rate: string | null;
  circulating_market_cap: string | null;
  volume_24h: string | null;
  icon_url: string | null;
};

export type BlockscoutHolder = {
  address: BlockscoutAddressRef;
  value: string;
};

export type BlockscoutTransfer = {
  block_number: number;
  timestamp: string;
  from: BlockscoutAddressRef;
  to: BlockscoutAddressRef;
  total?: { value?: string; decimals?: string };
  tx_hash?: string;
  transaction_hash?: string;
};

async function bsFetch<T>(network: RobinhoodNetwork, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${EXPLORER_BASE[network]}${path}`, {
      // Blockscout data changes fast (transfers/holders) — don't cache.
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getTokenInfo(network: RobinhoodNetwork, address: string) {
  return bsFetch<BlockscoutTokenInfo>(network, `/api/v2/tokens/${address}`);
}

export async function getTokenHolders(network: RobinhoodNetwork, address: string) {
  const data = await bsFetch<{ items: BlockscoutHolder[] }>(network, `/api/v2/tokens/${address}/holders`);
  return data?.items ?? [];
}

export async function getTokenTransfers(network: RobinhoodNetwork, address: string) {
  const data = await bsFetch<{ items: BlockscoutTransfer[] }>(network, `/api/v2/tokens/${address}/transfers`);
  return data?.items ?? [];
}

export function explorerBase(network: RobinhoodNetwork): string {
  return EXPLORER_BASE[network];
}
