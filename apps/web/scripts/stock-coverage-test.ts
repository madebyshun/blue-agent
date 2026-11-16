import assert from "node:assert/strict";
import { advanceStockCoverage, finishCoverageAssessment, isStockCoverageInventory, selectCoveragePool, summarizeStockCoverage, runCoverageBatch, type CoverageRunDependencies, type CoverageAssessment, type CoverageInventory } from "../../../packages/core/src/stock-coverage";
import { BASE_STOCKS } from "../src/lib/base-stocks/registry";
import { BASE_PRICE_SOURCE } from "../src/lib/robinhood/rwa-price";
import { __setCatalogFetch, fetchCoinbaseCatalog } from "../src/lib/base-stocks/coinbase-catalog";

const first = BASE_STOCKS[0], second = BASE_STOCKS[1];
const at = "2026-11-16T07:00:00Z";
const row: CoverageAssessment = {
  contract: first.token, ticker: first.ticker, symbol: first.symbol, name: first.name, chain_id: 8453,
  assessed_at: at, block_number: "1", identity: "pass", explorer: "pass", issued: true, supply_raw: "100000000", multiplier: 2,
  transfer_paused: false, reference_usd: 200, reference_at: "2026-11-16T06:00:00Z", reference_source: "coinbase_api_nav", feed_mapping: "verified_registry",
  pool_status: "readable", pool: { address: first.token, price_usd: 202, liquidity_usd: 10000, volume_24h_usd: 1000 },
  price_unit: "usd_per_token", gap_pct: null, observed: false, activity: "active", grading_admitted: false, reasons: [],
};
const observed = finishCoverageAssessment(row);
assert(observed.observed);
assert(Math.abs(observed.gap_pct! - 1) < 1e-9); // No second multiplier division: both prices are per token.
assert.equal(observed.grading_admitted, false);
for (const patch of [{ identity: "unknown" as const }, { explorer: "unknown" as const }, { issued: null }, { transfer_paused: null }, { transfer_paused: true }, { reference_usd: null }, { reference_at: "2026-11-01T00:00:00Z" }, { reference_at: "2026-11-17T00:00:00Z" }, { pool: null }, { reasons: ["reference_multiplier_mismatch"] }]) {
  const result = finishCoverageAssessment({ ...row, ...patch });
  assert.equal(result.observed, false);
  assert.equal(result.gap_pct, null);
}
const catalog = [first, second].map((s) => ({ contract: s.token, ticker: s.ticker, symbol: s.symbol, name: s.name, multiplier: null, nav: null, navAt: null, totalSupply: null }));
const empty: CoverageInventory = { version: 1, chain_id: 8453, catalog_at: at, updated_at: at, completed_at: null, catalog, rows: [], cursor: 0 };
assert(isStockCoverageInventory(empty));
const progress = advanceStockCoverage(empty, [observed], at);
assert.equal(progress.cursor, 1);
assert.equal(summarizeStockCoverage(progress).pending, 1);
assert.throws(() => advanceStockCoverage(empty, [{ ...observed, contract: second.token }], at));
assert.equal(isStockCoverageInventory({ ...progress, cursor: 2 }), false);
assert.equal(isStockCoverageInventory({ ...empty, catalog: [catalog[0], catalog[0]] }), false);
const unknown = { ...row, contract: second.token, identity: "unknown" as const, issued: null, reference_usd: null, pool_status: "unknown" as const, pool: null, observed: false };
const completed = advanceStockCoverage(progress, [unknown], at);
const summary = summarizeStockCoverage(completed);
assert(isStockCoverageInventory(completed));
assert.equal(summary.issued, 1);
assert.equal(summary.unissued, 0);
assert.equal(summary.issuance_unknown, 1);
assert.equal(summary.pool_unknown, 1);
assert.equal(summary.grading_admitted, 0);
const anchor = [...BASE_PRICE_SOURCE.anchors][0];
const pair = { chainId: "base", baseToken: { address: first.token }, quoteToken: { address: anchor }, pairAddress: first.token, priceUsd: "202", liquidity: { usd: 10000 }, volume: { h24: 1 } };
assert.equal(selectCoveragePool([pair], first.token, BASE_PRICE_SOURCE.anchors).pool_status, "readable");
assert.equal(selectCoveragePool([{ ...pair, chainId: "robinhood" }], first.token, BASE_PRICE_SOURCE.anchors).pool_status, "not_indexed");
assert.equal(selectCoveragePool([{ ...pair, quoteToken: { address: second.token } }], first.token, BASE_PRICE_SOURCE.anchors).pool_status, "no_anchored_quote");
assert.equal(selectCoveragePool([{ ...pair, baseToken: { address: second.token } }], first.token, BASE_PRICE_SOURCE.anchors).pool, null);

async function pagination() {
  const raw = (s: typeof first) => ({ contract_address: s.token, symbol: s.symbol });
  const urls: string[] = [];
  try {
    __setCatalogFetch(async (u) => {
      urls.push(String(u));
      return Response.json(urls.length === 1 ? { tokens: [raw(first)], next_page_token: "second page" } : { tokens: [raw(second)] });
    });
    assert.equal((await fetchCoinbaseCatalog())?.length, 2);
    assert(urls[1].includes("page_token=second%20page") && urls.every((u) => u.includes("page_size=500")));
    __setCatalogFetch(async () => Response.json({ tokens: [raw(first)], next_page_token: "loop" }));
    assert.equal(await fetchCoinbaseCatalog(), null); // A repeated page must never look like a complete catalog.
    let calls = 0;
    __setCatalogFetch(async () => ++calls === 1 ? Response.json({ tokens: [raw(first)], next_page_token: "next" }) : new Response("outage", { status: 503 }));
    assert.equal(await fetchCoinbaseCatalog(), null);
    __setCatalogFetch(async () => Response.json({ tokens: [{ contract_address: "invalid", symbol: first.symbol }] }));
    assert.equal(await fetchCoinbaseCatalog(), null);
  } finally { __setCatalogFetch(null); }
  console.log("coverage address joins, unknown states, units, cohort isolation, cursor validation and complete pagination checks passed");
}

async function runner() {
  let stored: CoverageInventory = progress, writes = 0, released = 0;
  const deps: CoverageRunDependencies = {
    acquire: async () => "acquired", release: async () => { released++; },
    read: async () => ({ status: "hit", value: stored }),
    write: async (v) => { writes++; stored = v; },
    catalog: async () => catalog, issuer: async () => catalog,
    chainId: async () => 8453, block: async () => 1n,
    assess: async (s) => ({ ...observed, contract: s.contract, symbol: s.symbol, ticker: s.ticker }),
    now: () => Date.parse(at),
  };
  await assert.rejects(runCoverageBatch({ ...deps, read: async () => ({ status: "error" }) }, Date.parse(at) + 50_000), /storage unreadable/);
  assert.equal(writes, 0);
  await assert.rejects(runCoverageBatch({ ...deps, issuer: async () => null }, Date.parse(at) + 50_000), /issuer references unreadable/);
  assert.equal(writes, 0);
  await assert.rejects(runCoverageBatch({ ...deps, chainId: async () => 4663 }, Date.parse(at) + 50_000), /not Base/);
  assert.equal(writes, 0);
  await assert.rejects(runCoverageBatch({ ...deps, write: async () => { throw new Error("write outage"); } }, Date.parse(at) + 50_000), /write outage/);
  assert.equal(stored.cursor, 1);
  const short = await runCoverageBatch(deps, Date.parse(at) + 10_000);
  assert.equal(short.checked, 0);
  assert.equal(writes, 0);
  assert.equal((await runCoverageBatch({ ...deps, acquire: async () => "held" }, Date.parse(at) + 50_000)).status, "busy");
  const result = await runCoverageBatch(deps, Date.parse(at) + 50_000);
  assert.equal(result.status, "complete");
  assert.equal(stored.cursor, 2);
  assert.equal(writes, 1);
  assert.equal(released, 6);
  console.log("coverage runner resumes safely, retains state on outages, rejects wrong-chain RPC, respects its budget and releases locks");
}
pagination().then(runner).catch((e) => { console.error(e); process.exitCode = 1; });
