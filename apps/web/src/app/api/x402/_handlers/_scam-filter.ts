/**
 * Scam / impersonation filter for live Base token feeds.
 *
 * Feed tools (base-pulse, narrative-pulse, base-alpha, ecosystem-digest,
 * new-pools, blue-stream) run this BEFORE any LLM step so scam tokens
 * never reach the model and never appear in AI-generated narratives.
 *
 * Signals:
 *  1. Impersonated brand / person names — spoofs of household names with
 *     no Base legitimacy.
 *  2. Extreme price change (>1000% any timeframe) — classic rug / pump-and-dump.
 *
 * NOT a full rug-pull detector — use hub_honeypot / hub_quick_safety for that.
 * This is a lightweight credibility guard for the feed surface.
 */

import type { Pool } from "@/lib/market-data";

/** Known impersonated brand / person names to exclude from feed output. */
const IMPERSONATED = [
  "SPACEX", "SPCX",
  "TESLA", "TSLA",
  "ANTHROPIC", "CLAUDE",
  "OPENAI", "CHATGPT", "GPT",
  "NVIDIA", "NVDA",
  "APPLE", "AAPL",
  "GOOGLE", "GOOG", "GOOGL",
  "AMAZON", "AMZN",
  "MICROSOFT", "MSFT",
  "META", "ZUCK",
  "ELON", "MUSK",
  "TRUMP", "BIDEN",
  "COINBASE", "CBSE",
  "BINANCE",
  "DOGE2", "SHIB2", "PEPE2",  // numbered clones of major meme coins
] as const;

/**
 * Returns true if the token looks like a likely scam or impersonation.
 * Works on any object with optional symbol, name, and price change fields.
 */
export function isLikelyScam(t: {
  symbol?: string | null;
  name?:   string | null;
  /** 24h, 6h, or 1h price change %. Any timeframe works. */
  change?: number | null;
}): boolean {
  const sym  = (t.symbol ?? "").toUpperCase().trim();
  const name = (t.name   ?? "").toUpperCase().trim();
  const chg  = t.change;

  // Extreme pump (>1000%) — almost always a rug / honeypot launch signal.
  if (chg != null && Math.abs(chg) > 1000) return true;

  // Impersonated brand or person — spoofed household names.
  if (IMPERSONATED.some(b => sym === b || sym.startsWith(b) || name.includes(b))) return true;

  return false;
}

/**
 * Filter an array of GeckoTerminal Pool objects, dropping likely scam tokens.
 * Uses h24 price change first, falls back to h1.
 */
export function filterScamPools(pools: Pool[]): Pool[] {
  return pools.filter(
    p => !isLikelyScam({
      symbol: p.baseSymbol,
      name:   p.baseSymbol,
      change: p.change.h24 ?? p.change.h1,
    })
  );
}
