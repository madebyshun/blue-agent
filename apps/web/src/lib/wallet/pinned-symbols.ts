/**
 * A bare symbol → the address THIS APP PINS for it on one chain. Never a
 * search, never a name match against a pool or a list someone else controls.
 *
 * WHY (2026-10-01, a shared chat on the rebuild preview): "bridge 1 USDC from
 * base to robinhood" got "Token must be a 0x… contract" because the model
 * passed the word USDC. Refusing is right for an arbitrary symbol (a ticker
 * does not identify a token — CLAUDE.md rule 1), but USDC on Base, USDG and
 * WETH on Robinhood Chain are addresses this repo already pins and verifies
 * (lib/wallet/token-trust.ts BASE_MAJORS; the RH registry's utility rows), so
 * asking the user to paste them protects nothing.
 *
 * Only these resolve. Anything else returns null and the caller keeps refusing.
 */
import { BASE_MAJORS } from "./token-trust";
import { findByTicker } from "@/lib/robinhood/rwa-registry";

export function pinnedTokenFor(chain: "base" | "robinhood", symbol: string): `0x${string}` | null {
  const s = symbol.trim().replace(/^\$/, "").toUpperCase();
  if (!s || s === "ETH" || s === "NATIVE") return null; // native has its own spelling
  if (chain === "base") {
    const m = BASE_MAJORS.find((t) => !t.native && t.sym.toUpperCase() === s);
    return m ? m.addr : null;
  }
  // Robinhood Chain: the two utility rows only — never a stock token by ticker.
  const r = findByTicker(s);
  return r && (r.kind === "stable" || r.kind === "wrapped") ? (r.contract as `0x${string}`) : null;
}
