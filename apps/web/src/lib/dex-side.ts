/**
 * Which side of a DexScreener pair is the token the caller asked about?
 *
 * ── The trap ─────────────────────────────────────────────────────────────────
 * `/latest/dex/tokens/{address}` returns every pair where that address sits on
 * EITHER side. Sorting those by liquidity and reading `pairs[0].baseToken`
 * therefore describes a DIFFERENT TOKEN whenever the queried address is the
 * QUOTE of its own deepest pair — which is not an edge case, it is every
 * stablecoin, i.e. the tokens most often asked about.
 *
 * MEASURED 2026-09-26: USDC (0x8335…2913) has 30 Base pairs and the 6 deepest
 * are ALL quote-side. `pairs[0]` is AERO/USDC at $39.3M liquidity, so a handler
 * reading baseToken off it answered a USDC question with symbol "AERO" and
 * price 0.8919 — a 10% USDC depeg that never happened. USDC's 24 base-side
 * pairs start at USDC/USDbC, $0.9999, liquidity $143,840. Measured the same
 * minute, WETH is 17-for-17 base-side, so on a normal token these helpers are
 * a no-op — which is exactly why the bug survived this long.
 *
 * Prior sightings of the same root cause: issue #223 (TSLA read 39.5× wrong
 * off a deepest-pool fallback with no quote-asset constraint) and the header of
 * `lib/wallet/token-prices.ts` (2026-09-12: deepest USDC pair was LAPTOP/USDC
 * at 0.3864, pricing a dollar at 38 cents).
 *
 * ── Which pair fields are side-specific ──────────────────────────────────────
 * BASE-TOKEN-ONLY, meaningless for a quote-side query:
 *   priceUsd · priceChange.* · marketCap · fdv · baseToken.{symbol,name}
 * WHOLE-POOL, side-agnostic and safe to keep either way:
 *   liquidity.usd · volume.h24
 * BASE-TOKEN-RELATIVE, direction flips with the side:
 *   txns.h24.{buys,sells} — a "buy" is a buy OF THE BASE TOKEN, so on
 *   AERO/USDC those counts describe AERO flow, not USDC flow. Do not read them
 *   as the queried token's pressure without checking `side` first.
 *
 * ── So there are two fixes, and they are not interchangeable ─────────────────
 * A handler reporting a PRICE for the queried token needs `pickBaseSidePair`:
 * no base-side pair means no direct USD price exists, and inverting a
 * quote-side price would be derived math on an unvalidated pair. Report it
 * unavailable instead (CLAUDE.md: "Missing data → 'unknown'. NEVER infer").
 * A handler only LABELLING a pool figure needs `sideOf`: the figure is already
 * correct, so keep the pair and fix the name.
 *
 * Both are address-only tests. On the ticker path (`/search?q=`) there is no
 * address to match, so `sideOf` falls through to baseToken — correct, because
 * /search returns pairs selected BY that ticker — and `pickBaseSidePair` is not
 * applicable. Callers gate on `isAddress` before reaching for it.
 */

/** Structural minimum. Each handler's own richer pair type satisfies this. */
export type SidedPair = {
  baseToken?: { symbol?: string; name?: string; address?: string };
  quoteToken?: { symbol?: string; name?: string; address?: string };
};

export type TokenSide = {
  /** Which side the queried token sits on. "base" is also the ticker-path default. */
  side: "base" | "quote";
  symbol: string | null;
  name: string | null;
  address: string | null;
};

export const isAddress = (token: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(token.trim());

/**
 * Identify the queried token within a pair. Checks `quoteToken` FIRST so a
 * quote-side match is never masked by the base-side fallback.
 */
export function sideOf(pair: SidedPair, token: string): TokenSide {
  const want = token.trim().toLowerCase();
  const q = pair.quoteToken;
  if (q?.address?.toLowerCase() === want) {
    return { side: "quote", symbol: q.symbol ?? null, name: q.name ?? null, address: q.address ?? null };
  }
  const b = pair.baseToken;
  return { side: "base", symbol: b?.symbol ?? null, name: b?.name ?? null, address: b?.address ?? null };
}

/**
 * The deepest pair that actually PRICES `token` — i.e. one where it is the base.
 * `pairs` is expected pre-sorted by liquidity desc. null means this token only
 * ever appears as a quote asset, so no direct USD price is available for it.
 */
export function pickBaseSidePair<P extends SidedPair>(pairs: P[], token: string): P | null {
  const want = token.trim().toLowerCase();
  return pairs.find((p) => p.baseToken?.address?.toLowerCase() === want) ?? null;
}

/** Shared wording for the quote-side-only outcome, so every tool says the same thing. */
export const QUOTE_SIDE_ONLY_NOTE =
  "This token appears on Base only as the QUOTE side of its pairs, so DexScreener carries no direct USD price for it. Report it as unavailable — do not infer a price by inverting the other side.";
