/**
 * Held-token risk for the brief (plan 2026-10-13, E): has a token the wallet
 * ALREADY holds turned into something it cannot sell?
 *
 * Source: GoPlus `token_security` (free, keyless). MEASURED 2026-10-13: Base
 * 8453 answers with per-token fields; one address per call on the free tier
 * (a two-address request returned one row); Robinhood Chain 4663 returns an
 * EMPTY result — not supported. So this runs on Base only, and the brief says
 * that RH tokens are not screened here (their identity is still checked
 * against the RH registry by the unsolicited-token rule).
 *
 * Which tokens: Base holdings worth ≥ $1 that are not already vouched for —
 * not native, not a pinned major ("verified"), not a Coinbase stock token —
 * the most valuable MAX_CHECKED of them. A spam airdrop is worth $0 and is
 * the unsolicited rule's business, not this one's.
 *
 * Level is decided in code by lib/goplus-token.ts (shared with the pre-trade
 * check). Owner POWERS (balance control, hidden owner, pause, blacklist) are
 * not flags here: VIRTUAL carries two of them, and a brief that re-flags a
 * token like that every morning stops being read.
 */
import type { HoldRow } from "./types";
import { classifyGoPlus, goplusTokenSecurity } from "@/lib/goplus-token";

export const MAX_CHECKED = 8;
export const MIN_USD = 1;

export interface RiskRow {
  token: string;
  symbol: string;
  level: "BLOCK" | "WARN" | "OK";
  flags: string[];
}

/** Shared with the pre-trade check: one reading, one classification. */
export { classifyGoPlus } from "@/lib/goplus-token";

/** Pure: which holdings get checked. */
export function pickForCheck(holdings: HoldRow[], isStock: (token: string) => boolean): HoldRow[] {
  return holdings
    .filter((h) => h.chain === "base" && h.token !== "native" && h.trust !== "verified" && h.trust !== "impostor"
      && typeof h.usd === "number" && h.usd >= MIN_USD && !isStock(h.token))
    .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))
    .slice(0, MAX_CHECKED);
}

/** read = how many of the picked tokens GoPlus answered for. */
export async function heldRisk(picked: HoldRow[]): Promise<{ rows: RiskRow[]; picked: number; read: number }> {
  const rows: RiskRow[] = [];
  for (const h of picked) {
    const g = await goplusTokenSecurity(h.token);
    if (g) { const c = classifyGoPlus(g); rows.push({ token: h.token, symbol: h.symbol, level: c.level, flags: c.flags }); }
    await new Promise((res) => setTimeout(res, 300)); // free tier: keep it gentle
  }
  return { rows, picked: picked.length, read: rows.length };
}
