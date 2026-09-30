/**
 * The measured honeypot verdict (W0-19, 2026-09-30) — pure, shared.
 *
 * Lives in lib so that honeypot-check, safe-trending, risk-gate,
 * contract-trust, quick-safety and the pre-trade check (G2) all read ONE
 * definition; honeypot-check re-exports it for its existing importers.
 */
import type { TaxRead } from "@/lib/token-tax";

/** A sell tax at or above this is a sell restriction, i.e. the honeypot itself.
 *  Only ever applied to a MEASURED value — an unread tax stays unread. */
export const HONEYPOT_SELL_TAX_BPS = 5_000; // 50%

/** A MEASURED sell tax at/above this is a real exit cost short of a trap. */
export const SUSPICIOUS_SELL_TAX_BPS = 1_000; // 10%

export type HoneypotVerdict = "SAFE" | "SUSPICIOUS" | "HONEYPOT" | "UNKNOWN";

/**
 * THE verdict — arithmetic on measured signals only (W0-19, 2026-09-30), and
 * shared with `safe-trending` so the two tools can never disagree on a token.
 *
 * Until then `is_honeypot` from the model — and `known_rug` from a second model
 * pass — ORed straight into HONEYPOT, and SAFE came from a model-chosen
 * `confidence`. A verdict a model picks flips between runs on the same input
 * (CLAUDE.md), and a model's "is_honeypot: true" on a token nobody measured is
 * exactly the negative-from-absent-data this repo forbids. Now:
 *   HONEYPOT   — a measured sell tax ≥ 50%: the holder cannot get out
 *   UNKNOWN    — the tax could not be read: no measured basis either way
 *   SUSPICIOUS — read, and a measured lever is there (blacklists(address), or
 *                a sell tax ≥ 10%)
 *   SAFE       — read, and neither
 * `confidence` is set here too, so no model number reaches the caller.
 */
export function measuredHoneypotVerdict(
  tax: Pick<TaxRead, "tax_read" | "sell_tax" | "has_blacklist">,
): { verdict: HoneypotVerdict; confidence: number; isHoneypot: boolean } {
  const isHoneypot = tax.sell_tax != null && tax.sell_tax >= HONEYPOT_SELL_TAX_BPS;
  if (isHoneypot) return { verdict: "HONEYPOT", confidence: 95, isHoneypot };
  if (tax.tax_read !== "template") return { verdict: "UNKNOWN", confidence: 50, isHoneypot };
  const risky = tax.has_blacklist === true || (tax.sell_tax != null && tax.sell_tax >= SUSPICIOUS_SELL_TAX_BPS);
  return risky
    ? { verdict: "SUSPICIOUS", confidence: 70, isHoneypot }
    : { verdict: "SAFE", confidence: 85, isHoneypot };
}

