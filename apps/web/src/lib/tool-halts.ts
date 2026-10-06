/**
 * Catalog ids that are HALTED: still listed in AGENT_TOOLS, handler still
 * present, but `/api/x402/[tool]` refuses them BEFORE any payment requirement
 * is issued and BEFORE the chat credit-debit path runs — so neither an x402
 * payer nor a chat user can be charged for them.
 *
 * Halting is a pause, not a retirement: the id, its handler and its price stay
 * so the tool can come back by deleting one line here. A tool that will never
 * come back must be RETIRED instead (CLAUDE.md "Retiring a surface": route,
 * catalog entry, price, links and cron in one commit), not parked here forever.
 *
 * Decided 2026-09-30, docs/rebuild-5-tang-2026-09-30.md (week 1). Locked by
 * scripts/tool-halts-check.ts: every id here must exist in AGENT_TOOLS, so a
 * halt cannot silently outlive the tool it pauses.
 */

const MORALIS =
  "Upstream paused: the Moralis plan answers 401 on every endpoint (measured " +
  "2026-09-26 to 2026-09-29). Seven of these ids used to answer 200 on absent " +
  "data, so a caller paid for a result built from nothing. Halted until the " +
  "Blockscout replacement (rebuild Phase 2) lands.";

const UNDELIVERED =
  "Sold a delivery that no code performs: the paid call stored an alert/schedule " +
  "record that nothing ever reads (inventory 2026-09-29). Halted rather than " +
  "left charging for it.";

// F6 (lib/blue-hood/quarantine.ts). `rh-stock-arb` and `rh-stock-agent-brief`
// were halted here from 2026-09-30: they sell a direction hard-mapped from the
// RH "DEX price" minus Chainlink, that price was GeckoTerminal's token-level
// figure rather than the pool's own rate, and with it withheld the route would
// have settled on a 200 whose verdict was INSUFFICIENT_DATA by construction.
// UN-HALTED 2026-10-01 with the price-source fix: both read live through
// `resolvePrimaryPool`, whose `price_usd` is now the pool's own rate × its
// anchor, and every reading carries `price_basis: "pool_rate"`, which the
// quarantine publishes as measured. Should a reading ever lose that stamp, its
// HANDLERS entry withholds the leg again (publishArbResult / publishRhFacts) —
// re-halt here if that happens, for the same reason as before.

export const HALTED_TOOLS: Readonly<Record<string, string>> = {
  "token-distribution": MORALIS,
  "base-activity-score": MORALIS,
  "rh-rwa-dca": UNDELIVERED,
};

/** The halt reason for `tool`, or null when it is not halted. */
export function haltReason(tool: string): string | null {
  return Object.prototype.hasOwnProperty.call(HALTED_TOOLS, tool) ? HALTED_TOOLS[tool] : null;
}
