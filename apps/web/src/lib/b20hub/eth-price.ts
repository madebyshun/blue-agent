import { getCoinGeckoPrices } from "@/lib/market-data";

/**
 * ETH/USD spot for the B20HUB USD figures — `/api/b20hub/pool/[address]`
 * (onchain price + mcap from slot0) and `/api/b20hub/tokens` (opening-mcap
 * fallback for tokens DexScreener has not indexed yet).
 *
 * Returns `null` when CoinGecko does not answer. Until 2026-10-03 both routes
 * carried their own copy of this function and returned a hardcoded $3000 on
 * failure — and cached that $3000 for five minutes — so a CoinGecko hiccup
 * published a guessed market cap as fact. An unread price is not a number:
 * every caller already treats `null` as "USD unknown" and renders "—".
 *
 * Only a SUCCESS is cached (5 min, per lambda instance) so a burst of page
 * hits does not hammer CoinGecko. A failure is not cached: the next request
 * retries instead of serving "unknown" for five minutes after a blip.
 */
const TTL_MS = 5 * 60_000;
let cache: { at: number; usd: number } | null = null;

export async function fetchEthPriceUsd(): Promise<number | null> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.usd;
  const usd = (await getCoinGeckoPrices(["ethereum"], { timeoutMs: 4000 }))?.ethereum?.usd ?? null;
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return null;
  cache = { at: now, usd };
  return usd;
}

/** Test-only: drop the memo so each scenario starts cold. */
export function _resetEthPriceCacheForTest(): void {
  cache = null;
}
