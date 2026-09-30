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
 * What the desk reads (lib/robinhood/rwa-price.ts `dexPriceGecko`): it picks
 * the deepest USD-ANCHORED pool, but takes the PRICE from GT's
 * `*_token_price_usd` — GT's own token-level USD figure. That is not the
 * anchored pool's exchange rate. This script puts the three prices side by
 * side so the gap has a name:
 *
 *   desk      = GT `<our side>_token_price_usd`             (what the desk stores)
 *   pool@GT   = pool rate in quote × GT's USD for the quote  (pool, GT's USDG)
 *   pool@par  = pool rate in quote × $1 (USDG) / ETH oracle  (pool, anchor at par)
 *   oracle    = Chainlink latestRoundData on RH 4663
 *
 * Reading the result:
 *   desk ≠ pool@GT          → GT's token price is NOT this pool's price (it is
 *                             a cross-pool figure — unanchored pools leak in)
 *   pool@GT ≠ pool@par      → GT misprices the anchor itself (the ×1.052 idea)
 *   pool@par ≈ oracle, but desk is not → the desk's drift is manufactured by
 *                             the price source, not by the market
 */
import { RWA_TOKENS } from "../src/lib/robinhood/rwa-registry";
import { chainlinkLatest, RH_PRICE_SOURCE } from "../src/lib/robinhood/rwa-price";
import { RH_CHAINLINK_ETH_USD } from "../src/lib/robinhood/rwa-registry";

const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (a: number | null, b: number | null) => (a && b ? ((a / b - 1) * 100) : null);
const f = (x: number | null, d = 2) => (x == null ? "—" : x.toFixed(d));

type Attr = {
  address?: string; name?: string; reserve_in_usd?: string;
  base_token_price_usd?: string; quote_token_price_usd?: string;
  base_token_price_quote_token?: string; quote_token_price_base_token?: string;
};
type Item = { attributes?: Attr; relationships?: { base_token?: { data?: { id?: string } }; quote_token?: { data?: { id?: string } } } };

(async () => {
  const ethUsd = (await chainlinkLatest(RH_CHAINLINK_ETH_USD, 86400))?.price_usd ?? null;
  console.log(`RH ETH/USD (Chainlink): ${f(ethUsd)}   anchors: ${[...RH_PRICE_SOURCE.anchors].join(", ")}\n`);
  console.log("ticker | pool | desk | pool@GT | pool@par | oracle | desk−pool@par % | poolGT−par % | desk−oracle % | pool@par−oracle %");
  const rows: { t: string; deskVsPar: number | null; gtAnchor: number | null; deskVsOracle: number | null; parVsOracle: number | null }[] = [];

  for (const tok of RWA_TOKENS.filter((t) => (t.kind === "stock" || t.kind === "etf") && t.chainlinkFeed)) {
    const oracle = await chainlinkLatest(tok.chainlinkFeed as `0x${string}`, tok.chainlinkHeartbeat ?? 86400);
    // GT's free tier answers 429 under load; an unread page is NOT "no pool".
    let items: Item[] = [];
    let http = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${tok.contract.toLowerCase()}/pools?page=1`, {
          headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000),
        });
        http = r.status;
        if (r.status === 429) { await sleep(15_000 * (attempt + 1)); continue; }
        items = r.ok ? (((await r.json()) as { data?: Item[] }).data ?? []) : [];
      } catch { http = -1; }
      break;
    }
    const me = tok.contract.toLowerCase();
    const strip = (id?: string) => (id ?? "").replace(/^robinhood_/, "").toLowerCase();
    const anchored = items.flatMap((p) => {
      const a = p.attributes;
      if (!a?.address) return [];
      const base = strip(p.relationships?.base_token?.data?.id);
      const quote = strip(p.relationships?.quote_token?.data?.id);
      const quoteSide = me === quote && me !== base;
      const cp = quoteSide ? base : quote;
      if (!RH_PRICE_SOURCE.anchors.has(cp)) return [];
      const desk = parseFloat((quoteSide ? a.quote_token_price_usd : a.base_token_price_usd) ?? "");
      const inQuote = parseFloat((quoteSide ? a.quote_token_price_base_token : a.base_token_price_quote_token) ?? "");
      const cpUsd = parseFloat((quoteSide ? a.base_token_price_usd : a.quote_token_price_usd) ?? "");
      return [{ a, cp, desk, inQuote, cpUsd, reserve: parseFloat(a.reserve_in_usd ?? "0") }];
    }).sort((x, y) => y.reserve - x.reserve);
    const top = anchored[0];
    const desk = top && Number.isFinite(top.desk) ? top.desk : null;
    const poolGt = top && Number.isFinite(top.inQuote) && Number.isFinite(top.cpUsd) ? top.inQuote * top.cpUsd : null;
    const par = top && Number.isFinite(top.inQuote)
      ? (top.cp === USDG ? top.inQuote : top.cp === WETH && ethUsd ? top.inQuote * ethUsd : null)
      : null;
    const o = oracle && !oracle.is_stale ? oracle.price_usd : null;
    const row = { t: tok.ticker, deskVsPar: pct(desk, par), gtAnchor: pct(poolGt, par), deskVsOracle: pct(desk, o), parVsOracle: pct(par, o) };
    rows.push(row);
    console.log([
      tok.ticker, top ? `${top.a.name} ($${Math.round(top.reserve).toLocaleString()})` : http === 200 ? `no anchored pool in ${items.length}` : `UNREAD (http ${http})`,
      f(desk), f(poolGt), f(par), f(o),
      f(row.deskVsPar), f(row.gtAnchor), f(row.deskVsOracle), f(row.parVsOracle),
    ].join(" | "));
    await sleep(2200);
  }

  const measured = rows.filter((r) => r.deskVsPar != null);
  const over = (k: keyof typeof rows[number], lim: number) => measured.filter((r) => Math.abs((r[k] as number | null) ?? 0) > lim).length;
  console.log(`\n${measured.length} tickers with an anchored pool`);
  console.log(`desk vs pool@par   |Δ| > 0.1%: ${over("deskVsPar", 0.1)}   > 1%: ${over("deskVsPar", 1)}`);
  console.log(`GT's anchor vs par |Δ| > 0.1%: ${over("gtAnchor", 0.1)}   > 1%: ${over("gtAnchor", 1)}`);
  console.log(`desk vs oracle     |Δ| > 2%:   ${measured.filter((r) => Math.abs(r.deskVsOracle ?? 0) > 2).length}`);
  console.log(`pool@par vs oracle |Δ| > 2%:   ${measured.filter((r) => Math.abs(r.parVsOracle ?? 0) > 2).length}`);
})().catch((e) => { console.error(e); process.exit(1); });
