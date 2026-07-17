/**
 * Blue Hood — semantic smoke.
 *
 * Separate from `scripts/semantic-smoke.ts` (which gates the FROZEN 30 x402
 * skills). This one covers Blue Hood-layer invariants — market clock
 * transitions, rule-engine sanity, arrow-feed test-filter — so a change
 * to Hood can't accidentally regress its own contract.
 *
 * Run: `npx tsx scripts/blue-hood-smoke.ts`
 * Exit code: 0 all pass, 1 any assertion fails (CI-friendly).
 */

import { nyseMarketStatus } from "../src/lib/robinhood/rwa-market";
import { detectCandidate, runRuleEngine } from "../src/lib/blue-hood/rule-engine";
import { HOOD_REGISTRY_STATS } from "../src/lib/blue-hood/registry";
import type { HoodSnapshot, TickerSnapshot } from "../src/lib/blue-hood/types";

let failed = 0;
function must(ok: boolean, label: string, detail?: string) {
  if (ok) console.log(`  ✅ ${label}`);
  else { failed++; console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
// ── Section 1: Market clock transitions (BLOCKER CHECK — weekend) ─────────
{
  console.log("\n── market clock ──");

  // Saturday any hour → weekend
  const sat = new Date("2026-07-18T12:00:00Z"); // Sat noon UTC
  const satS = nyseMarketStatus(sat);
  must(satS.session === "weekend" && !satS.is_open, "Sat → weekend + closed",
       `session=${satS.session} is_open=${satS.is_open}`);

  // Sunday any hour → weekend
  const sun = new Date("2026-07-19T15:00:00Z");
  const sunS = nyseMarketStatus(sun);
  must(sunS.session === "weekend" && !sunS.is_open, "Sun → weekend + closed",
       `session=${sunS.session} is_open=${sunS.is_open}`);

  // Monday 06:00 ET = 10:00 UTC (during DST -4) → premarket
  const monPre = new Date("2026-07-20T10:00:00Z");
  const monPreS = nyseMarketStatus(monPre);
  must(monPreS.session === "premarket" && !monPreS.is_open, "Mon 06:00 ET → premarket",
       `session=${monPreS.session} is_open=${monPreS.is_open}`);

  // Monday 13:30 UTC = 09:30 ET → regular open
  const monOpen = new Date("2026-07-20T13:30:00Z");
  const monOpenS = nyseMarketStatus(monOpen);
  must(monOpenS.session === "regular" && monOpenS.is_open, "Mon 09:30 ET → regular + open",
       `session=${monOpenS.session} is_open=${monOpenS.is_open}`);

  // Monday 20:00 UTC = 16:00 ET → afterhours (16:00 is close)
  const monClose = new Date("2026-07-20T20:00:00Z");
  const monCloseS = nyseMarketStatus(monClose);
  must(monCloseS.session === "afterhours" && !monCloseS.is_open, "Mon 16:00 ET → afterhours",
       `session=${monCloseS.session} is_open=${monCloseS.is_open}`);

  // Monday 22:00 UTC = 18:00 ET → afterhours
  const monPost = new Date("2026-07-20T22:00:00Z");
  const monPostS = nyseMarketStatus(monPost);
  must(monPostS.session === "afterhours" && !monPostS.is_open, "Mon 18:00 ET → afterhours",
       `session=${monPostS.session} is_open=${monPostS.is_open}`);
}

// ── Section 2: Registry honest denominator (BLOCKER 2) ─────────────────────
{
  console.log("\n── registry denominator ──");
  must(HOOD_REGISTRY_STATS.rwa_candidates > 0, "rwa_candidates > 0");
  must(HOOD_REGISTRY_STATS.watched > 0, "watched > 0");
  must(
    HOOD_REGISTRY_STATS.watched + HOOD_REGISTRY_STATS.no_chainlink_feed === HOOD_REGISTRY_STATS.rwa_candidates,
    "watched + no_feed = rwa_candidates",
    `${HOOD_REGISTRY_STATS.watched} + ${HOOD_REGISTRY_STATS.no_chainlink_feed} vs ${HOOD_REGISTRY_STATS.rwa_candidates}`,
  );
  must(HOOD_REGISTRY_STATS.no_chainlink_feed >= 1, "at least one row is drop-with-reason (surface honesty)");
}

// ── Section 3: Rule engine sanity (BLOCKER 3 — log breakdown sums) ────────
{
  console.log("\n── rule engine sanity ──");

  // Synthesize a snapshot with 4 rows exercising every branch:
  //   TSLA — market open, LONG_DEX 1.5%, TVL $10k → fires arb
  //   NVDA — market open, LONG_DEX 1.5%, TVL $2k → skipped_dust
  //   AAPL — market closed, drift +3%, TVL $10k → fires drift
  //   MSFT — market open, ALIGNED, drift 0.1% → below_threshold
  const mk = (
    ticker: string,
    verdict: TickerSnapshot["verdict"],
    isOpen: boolean,
    driftPct: number,
    tvl: number,
    warnings: string[] = [],
  ): TickerSnapshot => ({
    ticker,
    name: ticker,
    contract: `0x${ticker}`,
    verdict,
    oracle_usd: 100,
    dex_usd: 100 * (1 + driftPct / 100),
    tvl_usd: tvl,
    volume_24h_usd: 1_000,
    drift_pct: driftPct,
    pool_ref: "0xpool",
    is_v4_pool_id: false,
    market: {
      is_open: isOpen,
      session: isOpen ? "regular" : "afterhours",
      ny_time_iso: new Date().toISOString(),
    },
    warnings,
  });

  const snap: HoodSnapshot = {
    cycle_id: Date.now(),
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: 0,
    tickers: [
      mk("TSLA", "LONG_DEX",       true,  1.5, 10_000),
      mk("NVDA", "LONG_DEX",       true,  1.5,  2_000),
      mk("AAPL", "AFTERHOURS_DRIFT", false, 3,  10_000),
      mk("MSFT", "ALIGNED",        true,  0.1, 10_000),
    ],
    metrics: {
      registry_total: 26,
      tokens_watched: 4,
      tokens_no_feed: 0,
      tokens_errored: 0,
      tvl_scanned_usd: 32_000,
      market_is_open: true,
      market_session: "regular",
    },
  };

  // Rule-engine writes to KV — the local in-memory map is fine for this
  // smoke; still, clear the module state between runs.
  const { kvSet } = await import("../src/lib/kv");
  await kvSet("bh:arrow:feed", []);
  await kvSet("bh:arrow:serial", 0);

  const rep = await runRuleEngine(snap);

  // detectCandidate spot-checks
  must(detectCandidate(snap.tickers[0])?.type === "arb", "TSLA row → arb candidate");
  must(detectCandidate(snap.tickers[2])?.type === "drift", "AAPL row → drift candidate");
  must(detectCandidate(snap.tickers[3]) === null, "MSFT row → no candidate (below threshold)");

  // Engine report shape
  must(rep.candidates_over_threshold === 3, "candidates_over_threshold = 3",
       `got ${rep.candidates_over_threshold}`);
  must(rep.skipped_dust === 1, "skipped_dust = 1 (NVDA)", `got ${rep.skipped_dust}`);
  must(rep.below_threshold === 1, "below_threshold = 1 (MSFT)", `got ${rep.below_threshold}`);
  must(rep.fired === 2, "fired = 2 (TSLA arb + AAPL drift)", `got ${rep.fired}`);
  must(rep.deduped === 0, "deduped = 0 on cold run", `got ${rep.deduped}`);

  // Sanity conservation
  const sum = rep.skipped_dust + rep.skipped_feed_stale + rep.deduped + rep.fired;
  must(sum === rep.candidates_over_threshold,
       "candidates_over_threshold = dust + stale + deduped + fired",
       `${rep.candidates_over_threshold} vs ${sum}`);
  must(rep.candidates_over_threshold + rep.below_threshold === snap.tickers.length,
       "candidates + below = tokens_watched (excl. errored)");

  // Second run — dedup should trigger
  const rep2 = await runRuleEngine(snap);
  must(rep2.deduped === 2, "second run deduped = 2 (both open)", `got ${rep2.deduped}`);
  must(rep2.fired === 0, "second run fired = 0");
}

}

main().then(() => {
  console.log(failed === 0
    ? `\n── SUMMARY ── all passed ✓`
    : `\n── SUMMARY ── ${failed} assertion(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}).catch((e) => {
  console.error("smoke crashed:", e);
  process.exit(2);
});
