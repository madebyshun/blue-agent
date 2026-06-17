// Shared on-chain data helpers for Base.
//
// Token/native transfers come from Moralis (the Etherscan v2 multichain
// `tokentx` endpoint returned no Base data). Contract source comes from the
// Basescan/Etherscan explorer API. All fetchers fail soft (return [] / null)
// so a handler can degrade instead of throwing.

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";

/** Live ERC-20 transfers for a Base address (Moralis). Returns [] on failure. */
export async function getMoralisERC20Transfers(address: string, limit = 100): Promise<Record<string, unknown>[]> {
  const key = process.env.MORALIS_API_KEY ?? "";
  if (!key) return [];
  try {
    const res = await fetch(
      `${MORALIS_BASE}/${address}/erc20/transfers?chain=base&limit=${limit}`,
      { headers: { "X-API-Key": key, Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as { result?: Record<string, unknown>[] };
    return data.result ?? [];
  } catch {
    return [];
  }
}

/** Live native (ETH) transactions for a Base address (Moralis, decoded). Returns [] on failure. */
export async function getMoralisNativeTx(address: string, limit = 100): Promise<Record<string, unknown>[]> {
  const key = process.env.MORALIS_API_KEY ?? "";
  if (!key) return [];
  try {
    const res = await fetch(
      `${MORALIS_BASE}/${address}/verbose?chain=base&limit=${limit}`,
      { headers: { "X-API-Key": key, Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as { result?: Record<string, unknown>[] };
    return data.result ?? [];
  } catch {
    return [];
  }
}

/** Verified contract source/ABI for a Base address (Etherscan v2 multichain). null on failure. */
export async function getBasescanSource(address: string): Promise<Record<string, unknown> | null> {
  const key = process.env.BASESCAN_API_KEY ?? "";
  try {
    // Etherscan v2 unified endpoint (chainid 8453 = Base). The legacy
    // api.basescan.org host is deprecated; v2 is what Etherscan now serves.
    const res = await fetch(
      `https://api.etherscan.io/v2/api?chainid=8453&module=contract&action=getsourcecode&address=${address}&apikey=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { result?: Record<string, unknown>[] };
    return data.result?.[0] ?? null;
  } catch {
    return null;
  }
}
