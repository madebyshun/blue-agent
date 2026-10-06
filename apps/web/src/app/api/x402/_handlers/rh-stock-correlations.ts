// x402/rh-stock-correlations (D5) — on-chain price correlation matrix.
// Price: $0.10
//
// Reads GeckoTerminal OHLC (daily) for each ticker's dollar-anchored primary
// pool (resolvePrimaryPool — USDG preferred), computes pairwise Pearson (on daily log returns)
// correlations. Real math — no LLM.
//
// Caveat: OHLC availability on RH Chain is nascent (some pools have < 7
// candles). If a ticker has < 3 overlapping candles with another, correlation
// is returned as null with an honest "insufficient overlap" note.

import { RH_CHAIN, findByTicker, parseTickerList } from "@/lib/robinhood/rwa-registry";
import { resolvePrimaryPool, poolOhlc, type Candle } from "@/lib/robinhood/rwa-market";

export default async function handler(req: Request): Promise<Response> {
  try {
    // `tickers` arrives as a STRING from the Hub form and as an array from API
    // callers. Both are valid; see parseTickerList for what the old
    // `body.tickers ?? query.split(",")` idiom did to the string case.
    let body: { tickers?: string[] | string; days?: number } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const tickersRaw = parseTickerList(body.tickers, url.searchParams.get("tickers"));
    const days = Math.max(3, Math.min(90, Number(body.days ?? url.searchParams.get("days") ?? 30)));

    // Arity is now counted in TICKERS, not characters. The message said "2 to 10"
    // while the guard accepted 1, so a single ticker got past here and failed
    // later with a less obvious error; it is a real 2-minimum.
    if (tickersRaw.length < 2 || tickersRaw.length > 10) {
      return Response.json({ error: "Provide `tickers` — 2 to 10 tickers." }, { status: 400 });
    }
    const tokens = tickersRaw.map((t) => findByTicker(t)).filter((t): t is NonNullable<typeof t> => !!t);
    if (tokens.length < 2) {
      return Response.json({ error: "Fewer than 2 valid tickers resolved." }, { status: 400 });
    }

    const timestamp = new Date().toISOString();

    // Fetch daily candles for each token's dollar-anchored primary pool.
    //
    // #231. This used to pick by SIDE (`pools.find(p => p.token_is_base)`),
    // never by counterparty, so a token whose deepest pool was stock-vs-stock
    // yielded a close series denominated in that other stock. The old header
    // defended it with "Pearson is scale-invariant" — true for a CONSTANT
    // scale, but a counterparty equity's own price is a second time series, so
    // two tokens sharing a counterparty would correlate through it. Anchoring
    // makes the denominator a dollar, which is the constant the argument needs.
    const series = await Promise.all(
      tokens.map(async (t) => {
        const primary = await resolvePrimaryPool(t.contract);
        const empty = { token: t, closes: [] as { t: number; c: number }[], selection: primary.selection };
        if (!primary.pool) return empty;
        const candles = await poolOhlc(primary.pool.address, "day", days, {
          side: primary.pool.token_is_base ? "base" : "quote",
        });
        return {
          token: t,
          selection: primary.selection,
          closes: (candles ?? []).map((c: Candle) => ({ t: c.t, c: c.c })).filter((x) => Number.isFinite(x.c)),
        };
      }),
    );

    // Build a keyed timeline: map ticker → { ts → close }
    const byTicker: Record<string, Record<number, number>> = {};
    for (const s of series) byTicker[s.token.ticker] = Object.fromEntries(s.closes.map((x) => [x.t, x.c]));

    // Pairwise correlation of daily LOG RETURNS over overlapping days.
    //
    // 2026-10-06: this used to correlate the closes themselves. Two series
    // that both trend over the window correlate near ±1 on levels whatever
    // they do day to day (spurious correlation), so the matrix mostly
    // reported "both went up". Returns are the standard basis. A return needs
    // two consecutive common days, so the floor is 4 days → 3 returns.
    type Corr = { a: string; b: string; overlap: number; returns_n: number; corr: number | null };
    const rows: Corr[] = [];
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const A = tokens[i].ticker, B = tokens[j].ticker;
        const aMap = byTicker[A], bMap = byTicker[B];
        const common = Object.keys(aMap).filter((k) => bMap[+k] !== undefined).map(Number).sort((x, y) => x - y);
        const xs: number[] = [], ys: number[] = [];
        for (let k = 1; k < common.length; k++) {
          const a0 = aMap[common[k - 1]], a1 = aMap[common[k]], b0 = bMap[common[k - 1]], b1 = bMap[common[k]];
          if (a0 > 0 && a1 > 0 && b0 > 0 && b1 > 0) { xs.push(Math.log(a1 / a0)); ys.push(Math.log(b1 / b0)); }
        }
        rows.push({ a: A, b: B, overlap: common.length, returns_n: xs.length, corr: xs.length >= 3 ? pearson(xs, ys) : null });
      }
    }

    return Response.json({
      tool: "rh-stock-correlations",
      window_days: days,
      tickers: tokens.map((t) => t.ticker),
      series_lengths: Object.fromEntries(tokens.map((t) => [t.ticker, (byTicker[t.ticker] && Object.keys(byTicker[t.ticker]).length) || 0])),
      // Why a ticker's series is empty. `no_usd_anchored_pool` is NOT an
      // outage — it means the token trades only against non-dollar assets, so
      // there is no USD series to correlate (#231).
      pool_selection: Object.fromEntries(series.map((s) => [s.token.ticker, s.selection])),
      correlations: rows,
      basis: "daily log returns",
      note: "Pearson r of daily log returns over overlapping days, from GeckoTerminal pool OHLC on each token's dollar-anchored primary pool. Null when fewer than 3 returns overlap (4 common days) — RH RWA OHLC history is still shallow.",
      data_sources: ["api.geckoterminal.com (RH Chain)"],
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-correlations failed", message: (e as Error).message }, { status: 500 });
  }
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2 || n !== ys.length) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  return +(num / Math.sqrt(dx2 * dy2)).toFixed(6);
}
