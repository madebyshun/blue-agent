/**
 * cube-feed-test — the BlueCube display feed (lib/cube/modes.ts).
 *
 *   §1  formatting fits the 128px / 21-column budget for every magnitude
 *   §2  missing data renders "--" and a null change, never a number
 *   §3  a dead source keeps every label (no silently shorter list)
 *   §4  hood: Base rows only, ERROR rows dropped, ≤ 5 rows, no arrow fields
 *   §5  $BLUEAGENT never appears (the repo address is the pre-relaunch token)
 *
 * Hermetic: every source is a stub.
 */
import {
  buildFeed, fmtPrice, fmtCompact, fmtChange, CUBE_MODES, CUBE_MAX_ROWS,
  CRYPTO_CATALOG, HOOD_CATALOG, cubeOptions, toSpark, SPARK_POINTS,
  type CubeSources, type CubeFeed,
} from "../src/lib/cube/modes";
import type { TickerSnapshot } from "../src/lib/blue-hood/types";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const fits = (f: CubeFeed) =>
  f.title.length <= 21 &&
  f.rows.length <= CUBE_MAX_ROWS &&
  f.rows.every((r) => r.label.length <= 5 && r.text.length <= 9 && r.changeText.length <= 7);

const stockRow = (ticker: string, chain: "base" | "robinhood", vol: number, extra: Partial<TickerSnapshot> = {}) =>
  ({ ticker, chain, name: ticker, contract: "0x0", verdict: "OK", oracle_usd: 100, dex_usd: 101,
     tvl_usd: 1, total_tvl_usd: 1, volume_24h_usd: vol, drift_pct: 1, ...extra }) as unknown as TickerSnapshot;

const healthy: CubeSources = {
  coins: async (ids) => Object.fromEntries(ids.map((id, i) => [id, { usd: 84864.2 / (i + 1), change24h: -2.07 }])),
  baseTvl: async () => ({ tvlUsd: 4.12e9, change7dPct: 3.4 }),
  baseDexVol: async () => ({ total24h: 1.368e9, change1dPct: 10.31 }),
  hoodBaseRows: async () => [
    stockRow("NVDA", "base", 900), stockRow("META", "base", 500), stockRow("GOOGL", "base", 700),
    stockRow("AAPL", "base", 100), stockRow("SPCX", "base", 50), stockRow("TSLA", "base", 10),
    stockRow("MSTR", "robinhood", 99999), stockRow("BAD", "base", 99999, { verdict: "ERROR" as TickerSnapshot["verdict"] }),
  ],
  coinHistory: async () => Array.from({ length: 289 }, (_, i) => 2600 + 80 * Math.sin(i / 30)),
};
const dead: CubeSources = {
  coins: async () => { throw new Error("429"); },
  baseTvl: async () => null,
  baseDexVol: async () => { throw new Error("timeout"); },
  hoodBaseRows: async () => null,
  coinHistory: async () => { throw new Error("429"); },
};

async function main() {
  console.log("§1 formatting");
  for (const v of [0.000123, 0.5234, 1, 2.6, 999.99, 2681.74, 84864.2, 999999, 1.2e6, 4.12e9, 2.3e12]) {
    ok(`fmtPrice(${v}) ≤ 9`, fmtPrice(v).length <= 9, fmtPrice(v));
    ok(`fmtCompact(${v}) ≤ 9`, fmtCompact(v).length <= 9, fmtCompact(v));
  }
  for (const v of [0, 1.23, -1.23, 12.7, -99.9, 5000, -5000]) {
    ok(`fmtChange(${v}) ≤ 7`, fmtChange(v).length <= 7, fmtChange(v));
  }
  ok("fmtCompact(4.12e9) = $4.1B", fmtCompact(4.12e9) === "$4.1B", fmtCompact(4.12e9));
  ok("fmtPrice(84864.2) = $84864", fmtPrice(84864.2) === "$84864");
  ok("fmtChange(-2.07) = -2.1%", fmtChange(-2.07) === "-2.1%");

  console.log("§2/§3 missing data");
  ok("null price → --", fmtPrice(null) === "--" && fmtCompact(NaN) === "--");
  ok("null change → empty", fmtChange(null) === "");
  for (const mode of ["crypto", "base"] as const) {
    const good = await buildFeed(mode, healthy, null, 1);
    const bad = await buildFeed(mode, dead, null, 1);
    ok(`${mode}: dead source keeps every label`,
      JSON.stringify(bad.rows.map((r) => r.label)) === JSON.stringify(good.rows.map((r) => r.label)));
    ok(`${mode}: dead source → all "--", change null`,
      bad.rows.every((r) => r.value === null && r.text === "--" && r.change === null && r.changeText === ""));
    ok(`${mode}: fits 128px`, fits(good) && fits(bad));
  }

  console.log("§4 hood");
  const hood = await buildFeed("hood", healthy, null, 1);
  ok("hood: ≤ 5 rows", hood.rows.length === CUBE_MAX_ROWS);
  ok("hood: no Robinhood rows", !hood.rows.some((r) => r.label === "MSTR"));
  ok("hood: ERROR rows dropped", !hood.rows.some((r) => r.label === "BAD"));
  ok("hood: sorted by 24h volume", hood.rows.map((r) => r.label).join() === "NVDA,GOOGL,META,AAPL,SPCX");
  ok("hood: change is drift vs oracle", hood.changeKind === "vs oracle" && hood.rows[0].change === 1);
  ok("hood: no arrow/verdict fields leak", !JSON.stringify(hood).match(/arrow|verdict/i));
  const hoodDead = await buildFeed("hood", dead, null, 1);
  ok("hood: no data → 0 rows + says so", hoodDead.rows.length === 0 && /NO DATA/.test(hoodDead.title));
  ok("hood: fits 128px", fits(hood) && fits(hoodDead));

  console.log("§6 picks");
  const cp = await buildFeed("crypto", healthy, " aerodrome-finance,BITCOIN,nope,bitcoin ", 1);
  ok("crypto picks: owner order, case-insensitive, unknown + dupes dropped",
    cp.rows.map((r) => r.label).join() === "AERO,BTC", cp.rows.map((r) => r.label).join());
  ok("crypto picks: capped at 5",
    (await buildFeed("crypto", healthy, CRYPTO_CATALOG.map((c) => c.id).join(","), 1)).rows.length === CUBE_MAX_ROWS);
  ok("crypto picks: all unknown → defaults",
    (await buildFeed("crypto", healthy, "nope,zzz", 1)).rows.map((r) => r.label).join() === "BTC,ETH,SOL,BNB,XRP");
  ok("crypto picks: catalog labels all fit 5 chars", CRYPTO_CATALOG.every((c) => c.label.length <= 5));
  const hp = await buildFeed("hood", healthy, "tsla,nvda", 1);
  ok("hood picks: owner order", hp.rows.map((r) => r.label).join() === "TSLA,NVDA", hp.rows.map((r) => r.label).join());
  const hpMissing = await buildFeed("hood", healthy, "MSFT,NVDA", 1);
  ok("hood picks: picked ticker with no fresh row keeps its label, shows --",
    hpMissing.rows[0].label === "MSFT" && hpMissing.rows[0].text === "--" && hpMissing.rows[0].change === null);
  ok("hood picks: Robinhood-only ticker not pickable",
    (await buildFeed("hood", healthy, "MSTR_RH,FAKE", 1)).rows.map((r) => r.label).join() === "NVDA,GOOGL,META,AAPL,SPCX");
  ok("hood picks: only registry tickers are pickable", HOOD_CATALOG.length > 0 && HOOD_CATALOG.every((h) => /^[A-Z]{1,5}$/.test(h.ticker)));
  const opts = cubeOptions();
  ok("options: every default is in the catalog",
    opts.crypto.defaults.every((d) => opts.crypto.catalog.some((c) => c.id === d)));

  console.log("§7 sparkline");
  const one = await buildFeed("crypto", healthy, "ethereum", 1);
  const s = one.rows[0].spark;
  ok("1 pick → spark present", Array.isArray(s));
  ok("spark: SPARK_POINTS long, ints in 0..100, hits both ends",
    !!s && s.length === SPARK_POINTS && s.every((v) => Number.isInteger(v) && v >= 0 && v <= 100)
      && Math.min(...s) === 0 && Math.max(...s) === 100);
  ok("2 picks → both rows carry spark",
    (await buildFeed("crypto", healthy, "ethereum,bitcoin", 1)).rows.every((r) => Array.isArray(r.spark)));
  ok("3+ picks → no spark (list layout has no room)",
    (await buildFeed("crypto", healthy, "ethereum,bitcoin,solana", 1)).rows.every((r) => r.spark === undefined));
  ok("defaults (5 rows) → no spark", (await buildFeed("crypto", healthy, null, 1)).rows.every((r) => r.spark === undefined));
  const oneDead = await buildFeed("crypto", dead, "ethereum", 1);
  ok("history source down → no spark key, row still there",
    oneDead.rows.length === 1 && oneDead.rows[0].spark === undefined && oneDead.rows[0].text === "--");
  ok("toSpark: < 2 points → null, never a made-up line", toSpark([]) === null && toSpark([5]) === null && toSpark([NaN, 3]) === null);
  ok("toSpark: flat window → level line at 50", (toSpark([7, 7, 7]) ?? []).every((v) => v === 50));
  ok("toSpark: short series not padded", toSpark([1, 2, 3])?.length === 3);

  console.log("§5 token");
  for (const mode of CUBE_MODES) {
    const f = JSON.stringify(await buildFeed(mode, healthy, null, 1));
    ok(`${mode}: no $BLUEAGENT`, !/blueagent|0xf895783b/i.test(f));
  }

  if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
  console.log("\ncube-feed-test: all passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
