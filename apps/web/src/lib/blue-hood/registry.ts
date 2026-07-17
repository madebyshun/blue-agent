/**
 * Blue Hood watchlist — the subset of `RWA_TOKENS` the poller cycles through.
 *
 * We only poll rows that have a live Chainlink feed (M5 needs an oracle to
 * produce a verdict). Utility tokens (WETH, USDG) are intentionally excluded
 * — they're routing plumbing, not RWA positions the copilot is watching.
 */
import { RWA_TOKENS, type RwaToken } from "@/lib/robinhood/rwa-registry";

export type HoodWatchlistEntry = RwaToken & { chainlinkFeed: `0x${string}` };

/**
 * Filtered watchlist. Anything without a Chainlink feed is skipped (BE,
 * CUSO at the moment; WETH/USDG because they're stables/wrapped and never
 * need an equity oracle).
 */
export const HOOD_WATCHLIST: HoodWatchlistEntry[] = RWA_TOKENS.filter(
  (t): t is HoodWatchlistEntry => Boolean(t.chainlinkFeed) && t.kind !== "stable" && t.kind !== "wrapped",
);

/** Count exposed for logs + /hood metric strip. */
export const HOOD_WATCHLIST_COUNT = HOOD_WATCHLIST.length;
