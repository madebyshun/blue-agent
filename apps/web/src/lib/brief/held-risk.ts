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
 * Level is decided in code from named fields; a field GoPlus left empty is
 * not a flag (absence is "not read", never "clean" and never "risky"):
 *   BLOCK  is_honeypot, cannot_sell_all, owner_change_balance, sell_tax ≥ 50%
 *   WARN   transfer_pausable, is_blacklisted, slippage_modifiable,
 *          hidden_owner, sell_tax ≥ 10%
 */
import type { HoldRow } from "./types";

export const MAX_CHECKED = 8;
export const MIN_USD = 1;

export interface RiskRow {
  token: string;
  symbol: string;
  level: "BLOCK" | "WARN" | "OK";
  flags: string[];
}

type GoPlusRow = Record<string, string | undefined>;

const yes = (v: string | undefined) => v === "1";
const tax = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));

/** Pure: GoPlus fields → level + human flags. */
export function classifyGoPlus(r: GoPlusRow): { level: RiskRow["level"]; flags: string[] } {
  const block: string[] = [], warn: string[] = [];
  if (yes(r.is_honeypot)) block.push("honeypot (cannot be sold)");
  if (yes(r.cannot_sell_all)) block.push("cannot sell the whole balance");
  if (yes(r.owner_change_balance)) block.push("owner can change balances");
  const st = tax(r.sell_tax);
  if (st !== null && Number.isFinite(st)) {
    if (st >= 0.5) block.push(`sell tax ${(st * 100).toFixed(0)}%`);
    else if (st >= 0.1) warn.push(`sell tax ${(st * 100).toFixed(0)}%`);
  }
  if (yes(r.transfer_pausable)) warn.push("transfers can be paused");
  if (yes(r.is_blacklisted)) warn.push("has a blacklist");
  if (yes(r.slippage_modifiable)) warn.push("tax can be changed by the owner");
  if (yes(r.hidden_owner)) warn.push("hidden owner");
  return block.length ? { level: "BLOCK", flags: [...block, ...warn] } : warn.length ? { level: "WARN", flags: warn } : { level: "OK", flags: [] };
}

/** Pure: which holdings get checked. */
export function pickForCheck(holdings: HoldRow[], isStock: (token: string) => boolean): HoldRow[] {
  return holdings
    .filter((h) => h.chain === "base" && h.token !== "native" && h.trust !== "verified" && h.trust !== "impostor"
      && typeof h.usd === "number" && h.usd >= MIN_USD && !isStock(h.token))
    .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))
    .slice(0, MAX_CHECKED);
}

let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** Tests inject a stub. */
export function __setRiskFetch(f: typeof fetch | null) { fetchImpl = f ?? ((...a) => fetch(...a)); }

async function goplus(token: string): Promise<GoPlusRow | null> {
  try {
    const r = await fetchImpl(`https://api.gopluslabs.io/api/v1/token_security/8453?contract_addresses=${token}`, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    const j = await r.json() as { code?: number; result?: Record<string, GoPlusRow> };
    if (j.code !== 1 || !j.result) return null;
    return j.result[token.toLowerCase()] ?? Object.values(j.result)[0] ?? null;
  } catch { return null; }
}

/** read = how many of the picked tokens GoPlus answered for. */
export async function heldRisk(picked: HoldRow[]): Promise<{ rows: RiskRow[]; picked: number; read: number }> {
  const rows: RiskRow[] = [];
  for (const h of picked) {
    const g = await goplus(h.token);
    if (g) rows.push({ token: h.token, symbol: h.symbol, ...classifyGoPlus(g) });
    await new Promise((res) => setTimeout(res, 300)); // free tier: keep it gentle
  }
  return { rows, picked: picked.length, read: rows.length };
}
