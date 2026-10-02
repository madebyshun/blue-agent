/**
 * token-ohlcv-test — the chart series BlueBot draws (/api/token-ohlcv).
 * Hermetic: DexScreener and GeckoTerminal are stubbed.
 *   1. ?token= picks the DEEPEST pool holding the token, on EITHER side, and
 *      asks GeckoTerminal for THIS token's price (`token=<address>`).
 *   2. ETH charts as WETH.
 *   3. Nothing readable → an empty series with an error, never a line.
 *   4. ?pool= still answers as before (compatibility).
 */
import { GET } from "../src/app/api/token-ohlcv/route";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const TOKEN = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";
const WETH = "0x4200000000000000000000000000000000000006";
const DEEP_QUOTE_SIDE = "0x00000000000000000000000000000000000000d1";
const SHALLOW = "0x00000000000000000000000000000000000000d2";
let gtUrls: string[] = [];
let dsMode: "ok" | "none" | "down" = "ok";

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("api.dexscreener.com")) {
    if (dsMode === "down") return new Response("", { status: 503 });
    if (dsMode === "none") return Response.json([]);
    const who = url.split("/").pop()!.toLowerCase();
    return Response.json([
      { pairAddress: SHALLOW, dexId: "uniswap", baseToken: { address: who, symbol: "X" }, quoteToken: { address: WETH, symbol: "WETH" }, liquidity: { usd: 1_000 } },
      // The token on the QUOTE side of the deepest pool.
      { pairAddress: DEEP_QUOTE_SIDE, dexId: "aerodrome", baseToken: { address: "0xabc0000000000000000000000000000000000000", symbol: "OTHER" }, quoteToken: { address: who, symbol: "X" }, liquidity: { usd: 9_000_000 } },
    ]);
  }
  if (url.includes("api.geckoterminal.com")) {
    gtUrls.push(url);
    return Response.json({ data: { attributes: { ohlcv_list: [[300, 1, 1, 1, 0.9, 5], [200, 1, 1, 1, 0.8, 5], [100, 1, 1, 1, 0, 5]] } } });
  }
  return new Response("not stubbed", { status: 502 });
}) as typeof fetch;

const call = async (q: string) => (await GET(new Request(`https://app.blueagent.dev/api/token-ohlcv?${q}`))).json();

(async () => {
  console.log("1. token → deepest pool, this token's own price");
  let j = await call(`token=${TOKEN}&tf=7d`);
  ok("the deepest pool wins even with the token on the quote side", j.pool?.address === DEEP_QUOTE_SIDE, JSON.stringify(j.pool));
  ok("GeckoTerminal is asked for THIS token's price", gtUrls.at(-1)!.includes(`token=${TOKEN}`) && gtUrls.at(-1)!.includes("/ohlcv/hour"), gtUrls.at(-1));
  ok("oldest first, as [seconds, close]; a zero close is dropped", JSON.stringify(j.series) === "[[200,0.8],[300,0.9]]", JSON.stringify(j.series));
  ok("points mirrors the closes", JSON.stringify(j.points) === "[0.8,0.9]");

  console.log("2. ETH charts as WETH");
  j = await call("token=ETH&tf=1d");
  ok("ETH → WETH, minute candles", gtUrls.at(-1)!.includes(`token=${WETH}`) && gtUrls.at(-1)!.includes("/ohlcv/minute"), gtUrls.at(-1));

  console.log("3. unreadable → empty, with a reason");
  ok("a ticker is refused", (await call("token=AERO")).series.length === 0);
  ok("a bad timeframe is refused", /tf must be/.test((await call(`token=${TOKEN}&tf=5y`)).error));
  dsMode = "none";
  j = await call(`token=${TOKEN}`);
  ok("no pool → empty series + error", j.series.length === 0 && /no Base pool/.test(j.error), JSON.stringify(j));
  dsMode = "down";
  ok("DexScreener down → empty series, not a guess", (await call(`token=${TOKEN}`)).series.length === 0);
  dsMode = "ok";

  console.log("4. ?pool= still works");
  j = await call(`pool=${SHALLOW}`);
  ok("pool form → daily series, no token= sent", j.series.length === 2 && gtUrls.at(-1)!.includes("/ohlcv/day") && !gtUrls.at(-1)!.includes("token="), gtUrls.at(-1));

  console.log(failures === 0 ? "\ntoken-ohlcv-test: PASS" : `\ntoken-ohlcv-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})();
