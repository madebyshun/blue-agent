/**
 * base-pulse-volume-test — `dex_volume_24h` is Base's chain-wide DEX volume.
 *
 * Until 2026-10-03 the field held the sum of 24h volume over the <= 15
 * GeckoTerminal trending pools, published under a name that says "Base DEX
 * volume". This pins the corrected meaning:
 *
 *   §1  dex_volume_24h = DefiLlama's Base total, not the trending sum
 *   §2  the trending sum survives, under its own honest name
 *   §3  DefiLlama down → dex_volume_24h null, never the trending sum as stand-in
 *   §4  pulse_score / market_sentiment only from real inputs: DefiLlama TVL
 *       down or GeckoTerminal trending empty → null / "unknown", never 50 / "neutral"
 *
 * Hermetic: global fetch is stubbed by URL.
 */
let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const pool = (name: string, vol: number) => ({
  attributes: { name, address: `0x${name}`, volume_usd: { h24: vol }, price_change_percentage: { h24: 1 }, reserve_in_usd: 1e6 },
  relationships: {},
});

let llamaUp = true;
let tvlUp = true;
let trendingUp = true;
// 8 daily points so change7dPct is computable (hist[len-8]).
const tvlHist = Array.from({ length: 8 }, (_, i) => ({ date: i + 1, tvl: i === 7 ? 6.6e9 : 6e9 }));
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (url.includes("historicalChainTvl")) return tvlUp ? json(tvlHist) : json({}, 502);
  if (url.includes("overview/dexs/base")) return llamaUp ? json({ total24h: 1.368e9, change_1d: 10.31 }) : json({}, 502);
  if (url.includes("trending_pools")) return json({ data: trendingUp ? [pool("AAA / WETH", 3e6), pool("BBB / WETH", 2e6)] : [] });
  if (url.includes("new_pools")) return json({ data: [] });
  return json({}, 404);
}) as typeof fetch;

async function run() {
  const { default: handler } = await import("../src/app/api/x402/_handlers/base-pulse");
  const call = async () => (await (await handler(new Request("http://localhost/api/x402/base-pulse", { method: "POST", body: "{}" }))).json()) as Record<string, unknown>;

  console.log("§1/§2 corrected meaning");
  const d = await call();
  ok("dex_volume_24h is DefiLlama's Base total", d.dex_volume_24h === 1.368e9, String(d.dex_volume_24h));
  ok("dex_volume_change_24h from DefiLlama", d.dex_volume_change_24h === 10.31);
  ok("trending sum kept as trending_pools_volume_24h", d.trending_pools_volume_24h === 5e6, String(d.trending_pools_volume_24h));
  ok("says which chain", d.chain === "base" && d.chainId === 8453);
  // tvl7 = +10%, avg 24h = +1% → 50 + 15 + 1.2 = 66; avg not > 3 → neutral
  ok("pulse_score computed from real inputs", d.pulse_score === 66, String(d.pulse_score));
  ok("market_sentiment computed from real inputs", d.market_sentiment === "neutral", String(d.market_sentiment));
  ok("no unavailable reason when both inputs present", d.pulse_unavailable_reason === null);

  console.log("§3 DefiLlama down");
  llamaUp = false;
  const down = await call();
  ok("dex_volume_24h null, not the trending sum", down.dex_volume_24h === null, String(down.dex_volume_24h));
  ok("trending sum still reported under its own name", down.trending_pools_volume_24h === 5e6);
  llamaUp = true;

  console.log("§4 pulse from absent data");
  tvlUp = false;
  const noTvl = await call();
  ok("DefiLlama TVL down → pulse_score null", noTvl.pulse_score === null, String(noTvl.pulse_score));
  ok("DefiLlama TVL down → market_sentiment unknown", noTvl.market_sentiment === "unknown", String(noTvl.market_sentiment));
  ok("reason names DefiLlama", String(noTvl.pulse_unavailable_reason).includes("DefiLlama"));
  tvlUp = true;

  trendingUp = false;
  const noTrend = await call();
  ok("GeckoTerminal empty → pulse_score null", noTrend.pulse_score === null, String(noTrend.pulse_score));
  ok("GeckoTerminal empty → market_sentiment unknown", noTrend.market_sentiment === "unknown", String(noTrend.market_sentiment));
  ok("reason names GeckoTerminal", String(noTrend.pulse_unavailable_reason).includes("GeckoTerminal"));
  ok("summary doesn't print a 0.0% average", !String(noTrend.summary).includes("0.0%"), String(noTrend.summary));

  tvlUp = false;
  const allDown = await call();
  ok("full outage → never 50 / neutral", allDown.pulse_score === null && allDown.market_sentiment === "unknown");
  tvlUp = true;
  trendingUp = true;

  globalThis.fetch = realFetch;
  if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
  console.log("\nbase-pulse-volume-test: all passed");
}

run().catch((e) => { console.error(e); process.exit(1); });
