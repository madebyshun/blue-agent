/**
 * Base token spot prices, by contract address — keyless, quota-free.
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * `usdValue` on a wallet row had exactly ONE writer: Moralis' `usd_value`
 * (holdings.ts). So the day Moralis answered 401 ("Your Moralis Free usage is
 * paused", measured in production 2026-09-12), the wallet fell to its
 * curated-majors RPC fallback — and that path attaches no price to anything.
 * A wallet holding 1.28 USDC rendered every row as "—" and its chain total as
 * "≥ $0.00", while Robinhood, which prices off an independent source, carried
 * on reporting $4.60 in the same screenshot.
 *
 * The fallback is the DESIGNATED degraded path. Degrading from "full priced
 * list" to "no prices at all" — for ETH and USDC, whose prices this app fetches
 * elsewhere all day — is not a graceful degradation, it is a second outage
 * layered on the first. This module is the second price source, so that losing
 * the indexer costs us the token LIST and not also the VALUATION.
 *
 * ── ⚠️ Why not DexScreener / `getTokenMarket` ────────────────────────────────
 * Because it silently answers a different question. `getTokenMarket` returns the
 * deepest-liquidity Base pair for an address and reads `priceUsd` off it — but
 * `priceUsd` belongs to the pair's BASE token, and our address may be the QUOTE
 * side. MEASURED 2026-09-12: the deepest Base pair containing USDC was
 * LAPTOP/USDC at priceUsd 0.3864, so `getTokenMarket(USDC)` prices a dollar at
 * 38 cents, and the wallet's 1.283983 USDC would have read ≈ $0.50.
 *
 * That is the #223 family exactly (TSLA read 39.5× wrong off a deepest-pool
 * fallback with no quote-asset constraint), and it is WORSE than the dash it
 * replaces: "—" tells the user we don't know, a wrong number tells them we do.
 * If you are about to swap this endpoint for a pool-derived one, re-read #223
 * first and constrain the quote asset.
 *
 * GeckoTerminal's `simple/token_price` has no such ambiguity: it is keyed by
 * token address and returns the price OF THAT ADDRESS. Measured the same
 * minute, same three tokens: USDC 1.00148920467821 · WETH 2511.11 ·
 * cbBTC 77168.5395912755.
 *
 * ── The honesty contract ─────────────────────────────────────────────────────
 * A token this cannot price is simply ABSENT from the returned map. It never
 * appears as 0, and callers must keep rendering "—" and keep their "this total
 * is a floor" flag set. In particular there is no "stablecoins are $1.00"
 * shortcut: a symbol is a claim anyone can mint, and assuming par is how an
 * impostor USDC gets valued like the real one (CLAUDE.md: "Missing data →
 * 'unknown'. NEVER infer a fake number.").
 */

import { NATIVE_SENTINEL } from "@/lib/wallet/token-trust";

const GT_BASE = "https://api.geckoterminal.com/api/v2/simple/networks/base/token_price";

/**
 * Native ETH has no contract, so it is priced through WETH.
 *
 * This is not a proxy or an approximation: WETH is a deposit contract that mints
 * 1:1 against ETH and burns 1:1 back, enforced by its own bytecode, so the two
 * cannot diverge without the contract being broken. Any *other* "close enough"
 * substitution (a liquid staking token, a bridged ETH) would be an assumption
 * and does not belong here.
 */
const WETH_BASE = "0x4200000000000000000000000000000000000006";

/** GeckoTerminal accepts up to 30 addresses per call. */
const CHUNK = 30;

/** 6s: this runs inside a wallet read the user is waiting on, and an unpriced
 *  row is a dash — a recoverable outcome. Blocking the whole holdings response
 *  to chase a price is the worse trade. */
const TIMEOUT_MS = 6000;

type GtResponse = {
  data?: { attributes?: { token_prices?: Record<string, string> } };
};

async function fetchChunk(addresses: string[]): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${GT_BASE}/${addresses.join(",")}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as GtResponse;
    return json.data?.attributes?.token_prices ?? {};
  } catch {
    return {};
  }
}

/**
 * Spot USD price for each Base token address given.
 *
 * @param addresses Contract addresses. `NATIVE_SENTINEL` (0xEeee…EEeE) may be
 *        passed for native ETH and is resolved through WETH; every other entry
 *        is looked up as itself.
 * @returns lowercased address → price. Addresses the source could not price are
 *          OMITTED — never present with a 0. Callers must treat a miss as
 *          "unknown" and keep showing a dash.
 */
export async function getBaseTokenPricesUsd(
  addresses: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();

  // Map every requested address to the address actually quoted, so native ETH
  // can ride on WETH's quote without the caller knowing or the WETH row
  // colliding with it. Duplicates collapse — a wallet holding both ETH and WETH
  // asks GeckoTerminal once.
  const quoteFor = new Map<string, string>();
  for (const a of addresses) {
    if (!a) continue;
    const lower = a.toLowerCase();
    quoteFor.set(lower, lower === NATIVE_SENTINEL.toLowerCase() ? WETH_BASE.toLowerCase() : lower);
  }
  if (quoteFor.size === 0) return out;

  const unique = [...new Set(quoteFor.values())];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));

  const results = await Promise.all(chunks.map(fetchChunk));

  // One lookup table keyed by the address we actually asked about.
  const quoted = new Map<string, number>();
  for (const table of results) {
    for (const [addr, raw] of Object.entries(table)) {
      const n = Number(raw);
      // A non-finite or non-positive quote is not a price. Dropping it here is
      // what keeps "unpriced" and "priced at zero" distinguishable downstream.
      if (Number.isFinite(n) && n > 0) quoted.set(addr.toLowerCase(), n);
    }
  }

  for (const [requested, quote] of quoteFor) {
    const price = quoted.get(quote);
    if (price != null) out.set(requested, price);
  }
  return out;
}
