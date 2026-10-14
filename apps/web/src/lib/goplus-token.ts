/**
 * GoPlus `token_security` for Base 8453 — one reader, one classification,
 * shared by the pre-trade check (lib/pre-trade-check.ts) and the brief's
 * held-token screen (lib/brief/held-risk.ts).
 *
 * MEASURED 2026-10-13: free and keyless; one address per call on the free
 * tier; Robinhood Chain 4663 returns an empty result (not supported). A field
 * GoPlus leaves empty is "not read" — never clean and never risky.
 *
 * Levels, decided in code on EVIDENCE of harm (the G2 rule):
 *   BLOCK  is_honeypot · cannot_sell_all · sell_tax ≥ 50%
 *   WARN   sell_tax ≥ 10% · slippage_modifiable (the owner can raise the tax)
 *   powers owner_change_balance · hidden_owner · transfer_pausable ·
 *          is_blacklisted — capabilities, reported as INFO, not as a verdict.
 *          MEASURED 2026-10-13: GoPlus sets owner_change_balance=1 and
 *          hidden_owner=1 on VIRTUAL (0x0b3e…7E1b), an upgradeable token;
 *          USDC itself can pause and blacklist. Blocking on a power would
 *          block the tokens people actually hold.
 */
export type GoPlusRow = Record<string, string | null | undefined>;

export interface GoPlusRead {
  level: "BLOCK" | "WARN" | "OK";
  /** Evidence behind BLOCK/WARN, human-readable. */
  flags: string[];
  /** Owner capabilities — INFO only. */
  powers: string[];
  /** Sell tax as a fraction, when GoPlus measured it. */
  sellTax: number | null;
  buyTax: number | null;
}

const yes = (v: string | null | undefined) => v === "1";
const frac = (v: string | null | undefined) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const pct = (n: number) => `${+(n * 100).toFixed(1)}%`;

/** Pure: GoPlus fields → level, evidence, powers. */
export function classifyGoPlus(r: GoPlusRow): GoPlusRead {
  const block: string[] = [], warn: string[] = [], powers: string[] = [];
  const sellTax = frac(r.sell_tax), buyTax = frac(r.buy_tax);
  if (yes(r.is_honeypot)) block.push("honeypot (cannot be sold)");
  if (yes(r.cannot_sell_all)) block.push("cannot sell the whole balance");
  if (sellTax !== null) {
    if (sellTax >= 0.5) block.push(`sell tax ${pct(sellTax)}`);
    else if (sellTax >= 0.1) warn.push(`sell tax ${pct(sellTax)}`);
  }
  if (yes(r.slippage_modifiable)) warn.push("the owner can change the tax");
  if (yes(r.owner_change_balance)) powers.push("owner can change balances");
  if (yes(r.hidden_owner)) powers.push("hidden owner");
  if (yes(r.transfer_pausable)) powers.push("transfers can be paused");
  if (yes(r.is_blacklisted)) powers.push("has a blacklist");
  const level = block.length ? "BLOCK" : warn.length ? "WARN" : "OK";
  return { level, flags: [...block, ...warn], powers, sellTax, buyTax };
}

let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** Tests inject a stub. */
export function __setGoPlusFetch(f: typeof fetch | null) { fetchImpl = f ?? ((...a) => fetch(...a)); }

/** One token on Base. null ⟹ unread (error, empty result, or timeout). */
export async function goplusTokenSecurity(token: string): Promise<GoPlusRow | null> {
  try {
    const r = await fetchImpl(`https://api.gopluslabs.io/api/v1/token_security/8453?contract_addresses=${token.toLowerCase()}`, { signal: AbortSignal.timeout(6_000) });
    if (!r.ok) return null;
    const j = await r.json() as { code?: number; result?: Record<string, GoPlusRow> };
    if (j.code !== 1 || !j.result) return null;
    return j.result[token.toLowerCase()] ?? Object.values(j.result)[0] ?? null;
  } catch { return null; }
}
