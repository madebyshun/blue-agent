// Shared on-chain data helpers for Base.
//
// Token/native transfers come from Moralis (the Etherscan v2 multichain
// `tokentx` endpoint returned no Base data). Contract source comes from the
// Basescan/Etherscan explorer API. All fetchers fail soft (return [] / null)
// so a handler can degrade instead of throwing.

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";

/** One token row from Moralis `/wallets/{address}/tokens` (verified live shape). */
export interface MoralisWalletToken {
  token_address:     string;   // 0xeeee…eeee for native ETH
  symbol:            string;
  name:              string;
  logo?:             string | null;
  decimals:          number;
  balance:           string;   // raw integer (wei) as string
  balance_formatted: string;   // human-readable decimal string
  possible_spam:     boolean;
  verified_contract: boolean;
  native_token:      boolean;  // true only for the native-ETH row
  usd_value?:        number | null;
  usd_price?:        number | null;
}

/**
 * Full live token list for a Base wallet (Moralis). Returns every token the
 * address actually holds (balance > 0), including the native-ETH row. Returns
 * `null` (not []) when there's no API key or the request fails, so callers can
 * distinguish "Moralis unavailable → fall back to RPC" from "wallet is empty".
 *
 * @param chain  "base" (mainnet) or "base sepolia" (testnet) — Moralis chain id.
 */
export async function getWalletTokenBalances(
  address: string,
  chain: "base" | "base sepolia" = "base",
): Promise<MoralisWalletToken[] | null> {
  const key = process.env.MORALIS_API_KEY ?? "";
  if (!key) return null;
  try {
    const qs = new URLSearchParams({ chain, limit: "100" });
    // 12s: the price-enriched token list can take ~7s for whale wallets with
    // hundreds of positions (normal wallets return in ~1.5s). On timeout the
    // caller falls back to the curated-token RPC read rather than fabricating.
    const res = await fetch(
      `${MORALIS_BASE}/wallets/${address}/tokens?${qs}`,
      { headers: { "X-API-Key": key, Accept: "application/json" }, signal: AbortSignal.timeout(12000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { result?: MoralisWalletToken[] };
    return data.result ?? [];
  } catch {
    return null;
  }
}

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
