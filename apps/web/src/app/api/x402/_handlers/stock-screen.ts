// x402/stock-screen — a screen, not a quote. Every Coinbase Tokenized Stock on
// Base that Blue Hood holds a Chainlink feed for, run through the caller's own
// thresholds (drift vs oracle, pool liquidity, oracle staleness) and returned
// ranked, with the number that decided each row on it.
//
// WHY THIS EXISTS, measured not guessed (nohumans.directory `/api/demand`,
// 2026-10-14 → 2026-11-13, 52,395 searches): "daily stock screen" 29 searches
// from 15 distinct clients over 16 days; "daily stock picks w/ thesis" 24,
// "s&p 500 thesis" 23, "stock research" 20, "stock picks" 18, "ai stock
// research" 18. Every one of those terms already returns a verified rival at
// $0.01–$0.02, so the demand is not for a cheaper quote — `base-stock-quote` at
// $0.02 is already one of our most-called tools. What is missing is the step
// AFTER a quote: given a book of nine tokenized stocks, which ones clear MY
// thresholds. Done with the quote tool that is nine calls; this is one, at the
// price of one.
//
// THE SCORING LIVES IN lib/base-stocks/screen.ts, not here, so it can be tested
// without a chain: this file only does I/O.
//
// FACTS ONLY. Nothing ranks on opinion, momentum forecast or "best pick". A row
// clears the filter or it does not, and `failed_on` says which number moved it.
import { BASE_STOCKS } from "@/lib/base-stocks/registry";
import type { BaseStockQuote } from "@/lib/base-stocks/b20-quote";
import { readBaseStockQuote } from "@/lib/base-stocks/b20-quote";
import { readBody, BASE_CHAIN } from "@/lib/base-stocks/handler-common";
import { splitQuotes, type ScreenFilters } from "@/lib/base-stocks/screen";

const num = (v: unknown, fallback: number | null): number | null => {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export default async function handler(req: Request): Promise<Response> {
  const body = await readBody(req);
  // Each field is named here rather than looped over, so the catalog's own
  // check (`skill-catalog-check.ts` §3) can see a handler that reads what the
  // tool advertises. A dynamic `body[k]` would have been shorter and invisible.
  const params = new URL(req.url).searchParams;
  const pick = (v: unknown, key: string) =>
    v !== undefined && v !== null && v !== "" ? v : params.get(key);

  const limit = Math.max(1, Math.min(50, Number(pick(body.limit, "limit") ?? 10) || 10));
  const filters: ScreenFilters = {
    max_abs_drift_pct: num(pick(body.max_abs_drift_pct, "max_abs_drift_pct"), null),
    min_liquidity_usd: num(pick(body.min_liquidity_usd, "min_liquidity_usd"), 0) ?? 0,
    max_oracle_age_seconds: num(pick(body.max_oracle_age_seconds, "max_oracle_age_seconds"), null),
    // `can_fire` is Blue Hood's arrow gate (identity, band, sequencer,
    // staleness all green). It is the one field here that is our judgement
    // rather than a measurement, so it is opt-in and never a default.
    require_can_fire: String(pick(body.require_can_fire, "require_can_fire") ?? "") === "true",
  };

  // One read per stock, no stagger: `readBaseStockQuote` batches its on-chain
  // calls through multicall and the registry holds nine tickers. The hood poller
  // does exactly this every five minutes.
  const quotes: BaseStockQuote[] = [];
  const failed: { ticker: string; error: string }[] = [];
  for (const stock of BASE_STOCKS) {
    try {
      quotes.push(await readBaseStockQuote(stock));
    } catch (e) {
      failed.push({ ticker: stock.ticker, error: (e as Error).message });
    }
  }

  // Reported, never dropped. A screen that quietly shrinks its universe reads as
  // "nothing else qualified" — a far more confident claim than "we could not
  // read it", and false.
  if (quotes.length === 0) {
    throw new Error(
      `All ${BASE_STOCKS.length} tokenized stocks failed to read; nothing was charged.`,
    );
  }

  const { rows, rejected } = splitQuotes(quotes, filters, limit);

  const row = (q: BaseStockQuote) => ({
    ticker: q.ticker,
    token: q.token,
    share_price_usd: q.share_price_usd,
    dex_price_usd: q.dex_price_usd,
    // Signed on purpose: the sign IS the finding. Positive means the pool asks
    // more than the share is worth, negative means less.
    drift_pct: q.drift_pct,
    abs_drift_pct: q.drift_pct === null ? null : Math.abs(q.drift_pct),
    liquidity_usd: q.dex_liquidity_usd,
    volume_24h_usd: q.dex_volume_24h_usd,
    oracle_age_seconds: q.feed_age_seconds,
    oracle_is_stale: q.feed_is_stale,
    price_in_band: q.price_in_band,
    can_fire: q.can_fire,
    suppressed_reason: q.suppressed_reason,
    pool: q.dex_pool_url,
  });

  return Response.json({
    tool: "stock-screen",
    ...BASE_CHAIN,
    filters,
    universe: {
      listed: BASE_STOCKS.length,
      read: quotes.length,
      passed: rows.length,
      failed_read: failed,
    },
    rows: rows.map(row),
    // `failed_on` is what makes the reject list falsifiable: "rejected because
    // liquidity_unreadable" can be argued with, a bare "rejected" cannot.
    rejected,
    ranked_by: "abs_drift_pct, widest first — a ranking, not a recommendation",
    note:
      "Facts about nine tokenized stocks, filtered by your own thresholds. A wide drift is as often a broken oracle read as a mispriced pool; read can_fire and suppressed_reason before acting. Not financial advice.",
  });
}
