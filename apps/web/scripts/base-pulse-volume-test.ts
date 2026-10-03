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
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (url.includes("historicalChainTvl")) return json([{ date: 1, tvl: 6e9 }, { date: 2, tvl: 6.1e9 }]);
  if (url.includes("overview/dexs/base")) return llamaUp ? json({ total24h: 1.368e9, change_1d: 10.31 }) : json({}, 502);
  if (url.includes("trending_pools")) return json({ data: [pool("AAA / WETH", 3e6), pool("BBB / WETH", 2e6)] });
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

  console.log("§3 DefiLlama down");
  llamaUp = false;
  const down = await call();
  ok("dex_volume_24h null, not the trending sum", down.dex_volume_24h === null, String(down.dex_volume_24h));
  ok("trending sum still reported under its own name", down.trending_pools_volume_24h === 5e6);

  globalThis.fetch = realFetch;
  if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
  console.log("\nbase-pulse-volume-test: all passed");
}

run().catch((e) => { console.error(e); process.exit(1); });
