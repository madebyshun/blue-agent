/**
 * B20HUB ETH/USD — an unread price is `null`, never a guessed $3000, and a
 * failure is never cached.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until 2026-10-03, `/api/b20hub/pool/[address]` and `/api/b20hub/tokens` each
 * carried a copy of `fetchEthPriceUsd()` that returned a hardcoded 3000 when
 * CoinGecko failed, AND cached it for five minutes. Every USD market cap on the
 * B20HUB pages scales linearly with that number, so a CoinGecko hiccup
 * published a guessed market cap as fact, for five minutes past the hiccup.
 * Both copies now live in `lib/b20hub/eth-price.ts`; this pins its contract.
 */
import { fetchEthPriceUsd, _resetEthPriceCacheForTest } from "../src/lib/b20hub/eth-price";

let mode: "up" | "down" | "garbage" = "up";
let calls = 0;

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("coingecko.com")) {
    return new Response("not stubbed in test", { status: 502 });
  }
  calls++;
  if (mode === "down") return new Response("upstream down", { status: 503 });
  const body = mode === "garbage" ? { ethereum: { usd: 0 } } : { ethereum: { usd: 2_512.34 } };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

(async () => {
  // 1. Upstream down → null, not 3000.
  _resetEthPriceCacheForTest(); mode = "down"; calls = 0;
  const a = await fetchEthPriceUsd();
  check("CoinGecko 503 → null", a === null, `got ${a}`);

  // 2. The failure is not cached: the very next call asks again, and a
  //    recovered upstream is served immediately rather than 5 min later.
  mode = "up";
  const b = await fetchEthPriceUsd();
  check("failure not cached — next call refetches", calls === 2, `calls=${calls}`);
  check("recovered upstream served immediately", b === 2_512.34, `got ${b}`);

  // 3. A success IS cached — the burst-protection the memo exists for.
  mode = "down";
  const c = await fetchEthPriceUsd();
  check("success cached for subsequent calls", c === 2_512.34 && calls === 2, `got ${c}, calls=${calls}`);

  // 4. A non-positive price is not a price.
  _resetEthPriceCacheForTest(); mode = "garbage";
  const d = await fetchEthPriceUsd();
  check("usd: 0 → null", d === null, `got ${d}`);

  console.log(failures === 0 ? "\nPASS — unread ETH price is null and never cached" : `\nFAIL — ${failures} assertion(s)`);
  process.exit(failures === 0 ? 0 : 1);
})();
