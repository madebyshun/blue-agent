/**
 * rh-f6-diagnose — W0-9 / F6 (plan 2026-09-29; rebuild §4 #1): WHICH leg of the
 * Robinhood Chain desk is off, measured live, per ticker.
 *
 * Run: `npx tsx scripts/rh-f6-diagnose.ts` from apps/web (live network; ~2.2 s
 * per ticker to stay under GeckoTerminal's free limit). NOT part of `npm test`.
 *
 * F6 as recorded: the desk wrote RH AMZN dex_price 259.51 while the GT pool it
 * cited showed 246.65 (ratio 1.052), and AMZN |drift| > 2% went from 13/885
 * hours before 2026-09-18 to 157/275 after. Hypothesis on file: GT priced USDG
 * at ~$1.052.
 *
 * DIAGNOSIS (2026-09-30, the first version of this script): the desk took the
 * PRICE from GT's `*_token_price_usd` — GT's own token-level USD figure — not
 * from the anchored pool's exchange rate. 34 of 35 tickers differed from
 * `pool rate × anchor at par` by > 0.1%, 16 by > 1%.
 *
 * FIX (2026-10-01): `PoolMeta.price_usd` (rwa-market.ts — the reader M5 and so
 * the Blue Hood poller use) and `dexPrice` (rwa-price.ts — rh-stock-quote,
 * rh-stock-token, the portfolio) are now the selected pool's own rate × the
 * anchor (USDG at par, WETH at RH's Chainlink ETH/USD). This script therefore
 * runs THE PRODUCTION READERS and checks each against an INDEPENDENT pool@par
 * computed here from the same raw GT item:
 *
 *   desk      = resolvePrimaryPool(token).pool.price_usd   (what M5 records)
 *   quote     = dexPrice(token).price_usd                   (deepest anchored)
 *   gt        = GT `<our side>_token_price_usd` of the desk's pool (the old figure)
 *   pool@par  = that pool's rate in quote × $1 (USDG) / × Chainlink ETH (WETH)
 *   oracle    = Chainlink latestRoundData on RH 4663
 *
 * Every GeckoTerminal URL is fetched ONCE per run and served to the script and
 * to both readers from that one response, so all columns describe identical
 * data (and the run costs one GT call per ticker, not three).
 *
 * Reading the result:
 *   desk ≠ pool@par or quote ≠ pool@par → the fix regressed (must be 0 / 0)
 *   gt ≠ pool@par                       → the gap F6 found, still visible
 *   pool@par vs oracle                  → the real DEX dislocation
 */
import { RWA_TOKENS, RH_CHAINLINK_ETH_USD } from "../src/lib/robinhood/rwa-registry";
import { chainlinkLatest, dexPrice, RH_PRICE_SOURCE } from "../src/lib/robinhood/rwa-price";
import { resolvePrimaryPool } from "../src/lib/robinhood/rwa-market";

const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (a: number | null, b: number | null) => (a && b ? ((a / b - 1) * 100) : null);
const f = (x: number | null | undefined, d = 2) => (x == null ? "—" : x.toFixed(d));

type Attr = {
  address?: string; name?: string; reserve_in_usd?: string;
  base_token_price_usd?: string; quote_token_price_usd?: string;
  base_token_price_quote_token?: string; quote_token_price_base_token?: string;
};
type Item = { attributes?: Attr; relationships?: { base_token?: { data?: { id?: string } }; quote_token?: { data?: { id?: string } } } };

// ── One GT response per URL, shared by the script and the production readers ─
// GT's free tier answers 429 under load; an unread page is NOT "no pool", so
// retry here (the readers' own retry would see the same wall).
const realFetch = globalThis.fetch;
const gtBodies = new Map<string, { status: number; body: string }>();
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://api.geckoterminal.com/")) return realFetch(input, init);
  let hit = gtBodies.get(url);
  if (!hit) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await realFetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
        if (r.status === 429) { await sleep(15_000 * (attempt + 1)); continue; }
        hit = { status: r.status, body: await r.text() };
      } catch { hit = { status: 599, body: "" }; }
      break;
    }
    hit ??= { status: 429, body: "" };
    gtBodies.set(url, hit);
  }
  return new Response(hit.body, { status: hit.status, headers: { "content-type": "application/json" } });
}) as typeof fetch;

(async () => {
  const eth = await chainlinkLatest(RH_CHAINLINK_ETH_USD, 86400);
  const ethUsd = eth && !eth.is_stale ? eth.price_usd : null;
  console.log(`RH ETH/USD (Chainlink): ${f(ethUsd)}   anchors: ${[...RH_PRICE_SOURCE.anchors].join(", ")}\n`);
  console.log("ticker | desk pool | desk | quote | gt (old) | pool@par | oracle | desk−par % | quote−par % | gt−par % | par−oracle %");
  type Row = { t: string; deskVsPar: number | null; quoteVsPar: number | null; gtVsPar: number | null; parVsOracle: number | null };
  const rows: Row[] = [];

  const me = (c: string) => c.toLowerCase();
  const strip = (id?: string) => (id ?? "").replace(/^robinhood_/, "").toLowerCase();
  /** pool@par for one raw GT item, computed HERE — not by the code under test. */
  function parOf(p: Item, token: string): { par: number | null; gt: number | null; reserve: number; cp: string } | null {
    const a = p.attributes;
    if (!a?.address) return null;
    const base = strip(p.relationships?.base_token?.data?.id);
    const quote = strip(p.relationships?.quote_token?.data?.id);
    const quoteSide = token === quote && token !== base;
    const cp = quoteSide ? base : quote;
    const inQuote = parseFloat((quoteSide ? a.quote_token_price_base_token : a.base_token_price_quote_token) ?? "");
    const gt = parseFloat((quoteSide ? a.quote_token_price_usd : a.base_token_price_usd) ?? "");
    const par = Number.isFinite(inQuote)
      ? (cp === USDG ? inQuote : cp === WETH && ethUsd ? inQuote * ethUsd : null)
      : null;
    return { par, gt: Number.isFinite(gt) ? gt : null, reserve: parseFloat(a.reserve_in_usd ?? "0"), cp };
  }

  for (const tok of RWA_TOKENS.filter((t) => (t.kind === "stock" || t.kind === "etf") && t.chainlinkFeed)) {
    const token = me(tok.contract);
    const oracle = await chainlinkLatest(tok.chainlinkFeed as `0x${string}`, tok.chainlinkHeartbeat ?? 86400);
    const url = `https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${token}/pools?page=1`;
    const res = await fetch(url);
    const items: Item[] = res.ok ? (((await res.json()) as { data?: Item[] }).data ?? []) : [];

    // The production readers, on the same response.
    const primary = await resolvePrimaryPool(tok.contract);
    const quote = await dexPrice(tok.contract as `0x${string}`);

    const deskItem = primary.pool ? items.find((p) => (p.attributes?.address ?? "").toLowerCase() === primary.pool!.pool_ref) : undefined;
    const deskRef = deskItem ? parOf(deskItem, token) : null;
    const quoteItem = quote ? items.find((p) => (p.attributes?.address ?? "").toLowerCase() === quote.pool_address) : undefined;
    const quoteRef = quoteItem ? parOf(quoteItem, token) : null;

    const desk = primary.pool?.price_usd ?? null;
    const o = oracle && !oracle.is_stale ? oracle.price_usd : null;
    const row: Row = {
      t: tok.ticker,
      deskVsPar: pct(desk, deskRef?.par ?? null),
      quoteVsPar: pct(quote?.price_usd ?? null, quoteRef?.par ?? null),
      gtVsPar: pct(deskRef?.gt ?? null, deskRef?.par ?? null),
      parVsOracle: pct(deskRef?.par ?? null, o),
    };
    rows.push(row);
    console.log([
      tok.ticker,
      primary.pool ? `${primary.pool.name} ($${Math.round(primary.pool.reserve_usd).toLocaleString()})` : res.status === 200 ? `${primary.selection} (${items.length} pools)` : `UNREAD (http ${res.status})`,
      f(desk), f(quote?.price_usd), f(deskRef?.gt), f(deskRef?.par), f(o),
      f(row.deskVsPar, 4), f(row.quoteVsPar, 4), f(row.gtVsPar), f(row.parVsOracle),
    ].join(" | "));
    await sleep(2200);
  }

  const measured = rows.filter((r) => r.deskVsPar != null);
  const over = (k: keyof Row, lim: number) => measured.filter((r) => Math.abs((r[k] as number | null) ?? 0) > lim).length;
  console.log(`\n${measured.length} tickers where the desk priced a pool`);
  console.log(`desk  vs pool@par  |Δ| > 0.0001%: ${over("deskVsPar", 0.0001)}   > 0.1%: ${over("deskVsPar", 0.1)}   > 1%: ${over("deskVsPar", 1)}`);
  console.log(`quote vs pool@par  |Δ| > 0.0001%: ${rows.filter((r) => Math.abs(r.quoteVsPar ?? 0) > 0.0001).length}   (of ${rows.filter((r) => r.quoteVsPar != null).length} priced)`);
  console.log(`gt (old figure) vs pool@par |Δ| > 0.1%: ${over("gtVsPar", 0.1)}   > 1%: ${over("gtVsPar", 1)}`);
  console.log(`pool@par vs oracle |Δ| > 2%: ${measured.filter((r) => Math.abs(r.parVsOracle ?? 0) > 2).length}`);
  globalThis.fetch = realFetch;
})().catch((e) => { console.error(e); process.exit(1); });
