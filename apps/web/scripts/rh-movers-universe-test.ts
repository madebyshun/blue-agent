/**
 * rh-movers-universe-test — rh-stock-movers asks for the registered stock
 * tokens directly (rwa-market poolsForTokens), not for whatever fills
 * GeckoTerminal's top-pools page. Hermetic: GeckoTerminal and KV stubbed.
 *
 * MEASURED 2026-10-13: page 1 of RH top pools (20 by 24h volume) was all
 * launchpad memecoins, so movers said "no RWA token reports a 24h change"
 * while AAPL's own pools read +1.5%.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];

import { RWA_TOKENS } from "../src/lib/robinhood/rwa-registry";
import { HANDLERS } from "../src/app/api/x402/_handlers/index";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const stocks = RWA_TOKENS.filter((t) => t.kind === "stock" || t.kind === "etf");
const UP = stocks[0].contract.toLowerCase(), DOWN = stocks[1].contract.toLowerCase();
let multiCalls = 0, topCalls = 0;

const pool = (id: string, base: string, change: string) => ({
  id: `robinhood_${id}`, type: "pool",
  attributes: {
    address: id, name: "X / USDG", base_token_price_quote_token: "250", base_token_price_usd: "250",
    reserve_in_usd: "50000", volume_usd: { h24: "9000" }, price_change_percentage: { h1: "0", h24: change },
  },
  relationships: { base_token: { data: { id: `robinhood_${base}` } }, quote_token: { data: { id: `robinhood_${USDG}` } }, dex: { data: { id: "uniswap" } } },
});

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("geckoterminal.com") && url.includes("/pools?page=1")) {
    topCalls++;
    return Response.json({ data: [pool("0x" + "9".repeat(40), "0x" + "8".repeat(40), "500")] }); // memecoins only
  }
  if (url.includes("geckoterminal.com") && url.includes("/tokens/multi/")) {
    multiCalls++;
    const addrs = url.split("/tokens/multi/")[1].split("?")[0].split(",");
    const data = addrs.map((a) => ({
      id: `robinhood_${a}`, type: "token",
      relationships: { top_pools: { data: a === UP ? [{ id: "robinhood_0x" + "1".repeat(40) }] : a === DOWN ? [{ id: "robinhood_0x" + "2".repeat(40) }] : [] } },
    }));
    const included = [
      ...(addrs.includes(UP) ? [pool("0x" + "1".repeat(40), UP, "4.2")] : []),
      ...(addrs.includes(DOWN) ? [pool("0x" + "2".repeat(40), DOWN, "-6.5")] : []),
    ];
    return Response.json({ data, included });
  }
  return new Response("not stubbed", { status: 502 });
}) as typeof fetch;

(async () => {
  const r = await HANDLERS["rh-stock-movers"](new Request("https://x", { method: "POST", body: "{}" }));
  const j = (await r.json()) as { gainers?: { ticker: string }[]; losers?: { ticker: string }[]; universe?: { tokens_with_pool_change?: number } };
  ok("movers found while the top-pools page holds only memecoins", (j.universe?.tokens_with_pool_change ?? 0) === 2, JSON.stringify(j.universe));
  ok("the gainer and the loser are the stock tokens", j.gainers?.[0]?.ticker === stocks[0].ticker && j.losers?.[0]?.ticker === stocks[1].ticker, JSON.stringify({ g: j.gainers?.map((x) => x.ticker), l: j.losers?.map((x) => x.ticker) }));
  ok(`asked in batches of 30 (${Math.ceil(stocks.length / 30)} calls), never via the top-pools page`, multiCalls === Math.ceil(stocks.length / 30) && topCalls === 0, `${multiCalls} multi, ${topCalls} top`);
  const before = multiCalls;
  const r2 = await HANDLERS["rh-stock-movers"](new Request("https://x", { method: "POST", body: "{}" }));
  const j2 = (await r2.json()) as { cached?: boolean };
  ok("a second call within 10 minutes is served from the cache", j2.cached === true && multiCalls === before);
  console.log(failures === 0 ? "\nrh-movers-universe-test: PASS" : `\nrh-movers-universe-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
