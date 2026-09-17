/**
 * Control test for the #231 anchor + OHLC-denomination fixes.
 *
 * Run: `npx tsx scripts/pool-anchor-ohlc-test.ts` from `apps/web/`.
 * Hermetic: `globalThis.fetch` is stubbed, so no network and no keys.
 *
 * WHY THIS IS A *CONTROL* TEST, not a unit test.
 *
 * A test that only exercises the fix cannot tell you whether the fix was
 * needed. "poolOhlc returns candles" would pass just as happily against the
 * broken code, because it never pins down WHAT is being protected against.
 * So case A reimplements the OLD `invert` arithmetic inline, against the real
 * numbers we measured off the live pool, and asserts it is still reproducibly
 * wrong by ~333×. That assertion failing is itself a signal: it would mean the
 * defect is no longer reproducible and the change needs re-justifying.
 *
 * ── THE MEASUREMENT (live GeckoTerminal, RH Chain, 2026-09-17) ───────────────
 *
 * The old `poolOhlc(pool, tf, n, { invert: true, usd_multiplier })` did
 * `1/candle_close × counterparty_current_usd`. That is only correct if GT's
 * ohlcv endpoint returns the pool's base/quote EXCHANGE RATE. It does not — it
 * returns the BASE TOKEN'S USD PRICE, and its own `token=base|quote` parameter
 * selects which side that price describes.
 *
 * Measured on the `INU / AAPL` pool (AAPL on the QUOTE side, spot $332.96):
 *
 *   GT default (token=base) close  = 0.004962    ← INU's USD price
 *   base/quote ratio would be      = 0.0000149   ← what `invert` assumed
 *   GT with token=quote     close  = 332.63      ← AAPL's USD price, correct
 *
 * So every quote-side series collapsed to ≈$1.00 and then wandered with the
 * COUNTERPARTY's history. AAPL at $333 was served as a dollar-ish flat line —
 * which reads as a stablecoin chart, not as an obvious failure, and is why it
 * survived in two paid tools (M2 rh-stock-ohlc, D5 rh-stock-correlations).
 *
 * ── ON THE FIXTURE ADDRESSES ────────────────────────────────────────────────
 *
 * AAPL, USDG and WETH use their real RH-Chain addresses. The two unanchored
 * counterparties are written as obviously-synthetic strings ("fixture:inu"),
 * NOT as plausible 0x addresses: we measured those pools' prices and TVLs but
 * not the counterparties' contracts, and a made-up 0x that looks real is
 * exactly the thing CLAUDE.md forbids. The anchor rule is a set-membership
 * test on a string, so a non-hex placeholder exercises it identically.
 */
import {
  poolsForToken,
  resolvePrimaryPool,
  anchoredPools,
  poolOhlc,
  isUsdAnchored,
} from "../src/lib/robinhood/rwa-market";

const AAPL = "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const INU = "fixture:inu-unanchored-counterparty";
const ICOIN = "fixture:icoin-unanchored-counterparty";

// The `INU / AAPL` pool, as GT reports it (32-byte V4 pool id).
const INU_AAPL_POOL = "0x7e271c400427ecb727f5fbb27dec69254bce7c4219e95e3535d0ed128f79648a";

/** Measured daily closes from GT's DEFAULT (base-side) ohlcv on INU / AAPL. */
const INU_BASE_CLOSES = [0.00771213940519329, 0.00474906770004805, 0.00496283607472483];
/** INU's spot USD price — the `usd_multiplier` the old call site passed in. */
const INU_SPOT_USD = 0.004961777199;
/** GT's quote-side close for the same latest candle: AAPL's real USD price. */
const AAPL_QUOTE_CLOSE = 332.63;

let failures = 0;
function check(label: string, pass: boolean, detail: string) {
  console.log(`${pass ? "  ✓" : "  ✗"} ${label} — ${detail}`);
  if (!pass) failures++;
}

// ── GT fixture ───────────────────────────────────────────────────────────────
// Real prices and TVLs, in GT's own wire shape. `n` disambiguates the two
// AAPL/USDG 0.3% pools, which genuinely both exist.
type Row = {
  n: string; base: string; quote: string;
  base_usd: string; quote_usd: string; tvl: string; dex: string;
};
const AAPL_POOLS: Row[] = [
  { n: "INU / AAPL",        base: INU,   quote: AAPL, base_usd: "0.004961777199", quote_usd: "332.957009330615",  tvl: "728000.8277",  dex: "uniswap-v4-robinhood" },
  { n: "AAPL / USDG 0.05%", base: AAPL,  quote: USDG, base_usd: "333.3446736286", quote_usd: "1.00163475403239",  tvl: "487536.4491",  dex: "uniswap-v4-robinhood" },
  { n: "AAPL / USDG 0.3%",  base: AAPL,  quote: USDG, base_usd: "334.5451545566", quote_usd: "1.00031988001529",  tvl: "1475594.8029", dex: "uniswap-v4-robinhood" },
  { n: "ICOIN / AAPL",      base: ICOIN, quote: AAPL, base_usd: "0.002402417291", quote_usd: "332.955609153743",  tvl: "769294.0969",  dex: "uniswap-v4-robinhood" },
  { n: "AAPL / WETH 0.05%", base: AAPL,  quote: WETH, base_usd: "332.9282219697", quote_usd: "2389.58",           tvl: "187537.6592",  dex: "uniswap-v4-robinhood" },
  { n: "AAPL / USDG 0.3%b", base: AAPL,  quote: USDG, base_usd: "333.0734786874", quote_usd: "1.00143549885092",  tvl: "226304.4785",  dex: "uniswap-v4-robinhood" },
];

function poolItem(r: Row, i: number) {
  return {
    attributes: {
      address: r.n === "INU / AAPL" ? INU_AAPL_POOL : `0x${String(i).padStart(2, "0")}${"a".repeat(62)}`,
      name: r.n,
      base_token_price_usd: r.base_usd,
      quote_token_price_usd: r.quote_usd,
      reserve_in_usd: r.tvl,
      volume_usd: { h24: "1000" },
      price_change_percentage: { h1: "0.5", h24: "1.25" },
    },
    relationships: {
      dex: { data: { id: r.dex } },
      base_token: { data: { id: `robinhood_${r.base}` } },
      quote_token: { data: { id: `robinhood_${r.quote}` } },
    },
  };
}

/** Rows keyed by contract, so a case can serve a reduced pool set. */
let servedPools: Row[] = AAPL_POOLS;
const requestedUrls: string[] = [];
let networkCalls = 0;

const realFetch = globalThis.fetch;
function installStub() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);
    networkCalls++;
    if (url.includes("/pools?page=1") || url.includes("/pools?")) {
      return new Response(JSON.stringify({ data: servedPools.map(poolItem) }), { status: 200 });
    }
    if (url.includes("/ohlcv/")) {
      const side = new URL(url).searchParams.get("token") ?? "base";
      // GT returns NEWEST-FIRST rows of [t, o, h, l, c, v].
      const closes = side === "quote"
        ? [332.10, 331.40, AAPL_QUOTE_CLOSE]
        : INU_BASE_CLOSES;
      const rows = closes
        .map((c, i) => [1_757_000_000 + i * 86_400, c, c, c, c, 123])
        .reverse();
      return new Response(
        JSON.stringify({ data: { attributes: { ohlcv_list: rows } } }),
        { status: 200 },
      );
    }
    throw new Error(`unstubbed fetch: ${url}`);
  }) as typeof fetch;
}

async function main() {
  console.log("\npool-anchor + OHLC-denomination control test — #231\n");
  installStub();

  // ── A. CONTROL: the old invert math must still be wrong by ~333× ──────────
  // Pure arithmetic on the recorded measurement — no stub involved, so this
  // half of the pair cannot rot with the fixture.
  console.log("A. CONTROL — old `1/close × usd_multiplier` on the real INU / AAPL series:");
  const oldPath = INU_BASE_CLOSES.map((c) => (1 / c) * INU_SPOT_USD);
  const oldLatest = oldPath[oldPath.length - 1];
  check(
    "old math prices AAPL at ~$1, not ~$333",
    oldLatest > 0.9 && oldLatest < 1.1,
    `latest close → $${oldLatest.toFixed(4)} (true price $${AAPL_QUOTE_CLOSE})`,
  );
  const errorFactor = AAPL_QUOTE_CLOSE / oldLatest;
  check(
    "error factor is ~333×",
    errorFactor > 300 && errorFactor < 360,
    `${errorFactor.toFixed(1)}× — worse than #223's measured 39.5×`,
  );
  check(
    "and the series wanders with the COUNTERPARTY, not with AAPL",
    Math.max(...oldPath) / Math.min(...oldPath) > 1.5,
    `range $${Math.min(...oldPath).toFixed(2)}–$${Math.max(...oldPath).toFixed(2)} on a stock that moved <1%`,
  );

  // ── B. FIX: poolOhlc asks GT for the side we want and rescales nothing ────
  console.log("\nB. FIX — `poolOhlc(..., { side })` uses GT's own `token=` param:");
  const quoteCandles = await poolOhlc(INU_AAPL_POOL, "day", 3, { side: "quote" });
  check(
    "requests token=quote",
    requestedUrls.some((u) => u.includes("/ohlcv/day") && u.includes("token=quote")),
    requestedUrls.find((u) => u.includes("/ohlcv/")) ?? "(no ohlcv call)",
  );
  check(
    "returns GT's quote-side close verbatim — no inversion, no multiplier",
    quoteCandles?.[quoteCandles.length - 1]?.c === AAPL_QUOTE_CLOSE,
    `latest close = ${quoteCandles?.[quoteCandles.length - 1]?.c}`,
  );
  check(
    "candles come back chronological (oldest first)",
    !!quoteCandles && quoteCandles.length === 3 && quoteCandles[0].t < quoteCandles[2].t,
    `t: ${quoteCandles?.map((c) => c.t).join(" → ")}`,
  );
  const baseCandles = await poolOhlc(INU_AAPL_POOL, "day", 3, { side: "base" });
  check(
    "the base side is a DIFFERENT series (proves `side` is not inert)",
    baseCandles?.[baseCandles.length - 1]?.c === INU_BASE_CLOSES[INU_BASE_CLOSES.length - 1],
    `base latest = ${baseCandles?.[baseCandles.length - 1]?.c} vs quote ${AAPL_QUOTE_CLOSE}`,
  );

  // ── C. CONTROL: `pools[0]` has no rule that would stop it ─────────────────
  // On today's real depth the deepest AAPL pool happens to be USDG-quoted, so
  // `pools[0]` is right BY LUCK. The control is to show how thin that luck is:
  // drop the single deepest pool — one liquidity move — and the old selector
  // lands on a memecoin pair while the anchored one does not.
  console.log("\nC. CONTROL — `pools[0]` vs the anchor rule, on the real depth ladder:");
  const pools = await poolsForToken(AAPL);
  check("fixture parsed all 6 real pools", pools.length === 6, `${pools.length} pools`);
  const unanchored = pools.filter((p) => !isUsdAnchored(p));
  check(
    "2 of the 6 are unanchored and outrank 3 anchored pools",
    unanchored.length === 2 && pools.indexOf(unanchored[0]) === 1,
    `${unanchored.map((p) => `${p.name} $${p.reserve_usd.toFixed(0)}`).join(", ")}`,
  );
  check(
    "our token is correctly read off the QUOTE side of those pools",
    unanchored.every((p) => !p.token_is_base && Math.abs(p.price_usd - 332.96) < 1),
    `price_usd = ${unanchored.map((p) => p.price_usd.toFixed(2)).join(", ")}`,
  );

  servedPools = AAPL_POOLS.filter((r) => r.n !== "AAPL / USDG 0.3%");
  const thinned = await poolsForToken("0xaf3d76f1834a1d425780943c99ea8a608f8a93f900"); // distinct URL → fresh fetch
  check(
    "drop ONE pool and `pools[0]` is a memecoin pair",
    !isUsdAnchored(thinned[0]) && thinned[0].name === "ICOIN / AAPL",
    `pools[0] = ${thinned[0].name} ($${thinned[0].reserve_usd.toFixed(0)} TVL)`,
  );
  check(
    "…while the anchor rule still returns a USDG pool",
    anchoredPools(thinned)[0].counterparty_token === USDG,
    `anchored[0] = ${anchoredPools(thinned)[0].name}`,
  );

  // ── D. FIX: resolvePrimaryPool prefers USDG, deepest, never unanchored ────
  console.log("\nD. FIX — `resolvePrimaryPool` on the full ladder:");
  servedPools = AAPL_POOLS;
  const primary = await resolvePrimaryPool(AAPL);
  check(
    "selects the deepest USDG pool",
    primary.pool?.name === "AAPL / USDG 0.3%" && primary.selection === "deepest_usdg_pool",
    `${primary.pool?.name} via "${primary.selection}"`,
  );
  check("counts all 6 pools, 4 anchored", primary.pool_count === 6 && primary.anchored_pool_count === 4,
    `pool_count=${primary.pool_count} anchored=${primary.anchored_pool_count}`);
  check(
    "total_tvl_usd excludes the two unanchored pools (#227)",
    Math.abs(primary.total_tvl_usd - (487536.4491 + 1475594.8029 + 187537.6592 + 226304.4785)) < 1,
    `$${primary.total_tvl_usd.toFixed(0)} anchored vs $${primary.unanchored_tvl_usd.toFixed(0)} excluded`,
  );
  check(
    "excluded depth is REPORTED, not discarded",
    Math.abs(primary.unanchored_tvl_usd - (728000.8277 + 769294.0969)) < 1,
    `unanchored_tvl_usd = $${primary.unanchored_tvl_usd.toFixed(0)}`,
  );

  // ── E. The honest "no price" path ────────────────────────────────────────
  // Falling back to an unanchored pool IS the bug. A token with only memecoin
  // pairs must return null, not a plausible-looking number.
  console.log("\nE. NO DOLLAR MARKET — pools exist, none anchored:");
  servedPools = AAPL_POOLS.filter((r) => r.base === INU || r.base === ICOIN);
  const none = await resolvePrimaryPool("0xaf3d76f1834a1d425780943c99ea8a608f8a93f9ff");
  check("returns pool: null", none.pool === null, `pool=${none.pool}`);
  check("says WHY", none.selection === "no_usd_anchored_pool", `selection="${none.selection}"`);
  check(
    "and does not report the unanchored depth as dollar depth",
    none.total_tvl_usd === 0 && none.unanchored_tvl_usd > 1_400_000,
    `total_tvl_usd=$${none.total_tvl_usd} unanchored=$${none.unanchored_tvl_usd.toFixed(0)}`,
  );

  // ── F. The 60s memo really does collapse the double read ─────────────────
  // rh-stock-liquidity calls poolsForToken AND resolvePrimaryPool and claims
  // in a comment that this is one network call. Assert the claim.
  console.log("\nF. MEMO — the liquidity handler's double read is ONE fetch:");
  servedPools = AAPL_POOLS;
  const before = networkCalls;
  await poolsForToken(AAPL);
  await resolvePrimaryPool(AAPL);
  check("0 new fetches (both served from the 60s memo)", networkCalls === before,
    `${networkCalls - before} new network call(s)`);

  globalThis.fetch = realFetch;
  console.log(
    failures === 0
      ? "\n✓ all control assertions passed\n"
      : `\n✗ ${failures} assertion(s) failed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  globalThis.fetch = realFetch;
  console.error("test harness error:", e);
  process.exit(1);
});
