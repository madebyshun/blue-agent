// GET /api/token-ohlcv — a price series for one token, for a chart.
//
//   ?token=0x…&tf=1d|7d|30d[&chain=base|robinhood]
//                             → the token's own USD price on its deepest pool
//                               (any side: GeckoTerminal is asked for THIS
//                               token's price with `token=<address>`, so a
//                               quote-side pool never charts the other token)
//   ?pool=0x…                 → the original form: daily closes of the pool's
//                               base token, last ~30d (kept for compatibility)
//   ?pool=0x…&token=0x…       → THIS token's price on THAT pool. For stock
//                               tokens, pass Blue Hood's own `pool_ref` (a v4
//                               pool id is 32 bytes): the deepest-reserve pool
//                               can be a launchpad memecoin paired with the
//                               stock (AAPL's was INU/AAPL on 2026-10-02), and
//                               the chart should be the pool the desk measures.
//
// → { series: [[unixSeconds, closeUsd], …] oldest first, points: [close…],
//     pool: { address, name, dex }, tf, source, ts }
// Real data only. Base: DexScreener picks the pool. Robinhood Chain (4663):
// GeckoTerminal's token→pools, as lib/market-data.ts reads it. GeckoTerminal
// gives the OHLCV on both. For a stock token this is the POOL price, not the
// Chainlink oracle — the two can drift, which is what Blue Hood measures.
// Anything unreadable comes back as an empty series with `error` — never a
// drawn line. Public and keyless, like /api/base-tokens; cached per URL.

import { NextResponse } from "next/server";

const ADDR = /^0x[a-fA-F0-9]{40}$/;
/** A pool: a 20-byte pair address, or a 32-byte Uniswap v4 pool id. */
const POOL = /^0x(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/;
const WETH = "0x4200000000000000000000000000000000000006";
const TF = {
  "1d":  { path: "minute", aggregate: 15, limit: 96,  revalidate: 300 },
  "7d":  { path: "hour",   aggregate: 1,  limit: 168, revalidate: 900 },
  "30d": { path: "day",    aggregate: 1,  limit: 30,  revalidate: 3600 },
} as const;
type Tf = keyof typeof TF;

type Chain = "base" | "robinhood";
type GtPool = { attributes?: { address?: string; name?: string; reserve_in_usd?: string }; relationships?: { dex?: { data?: { id?: string } } } };

type DsPair = { pairAddress?: string; dexId?: string; baseToken?: { address?: string; symbol?: string }; quoteToken?: { address?: string; symbol?: string }; liquidity?: { usd?: number } };

const empty = (error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ series: [], points: [], error, ...extra }, { status: 200 });

async function deepestPoolRh(token: string): Promise<{ address: string; name: string; dex: string } | null> {
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${token}/pools?page=1`, { signal: AbortSignal.timeout(8_000), next: { revalidate: 900 } });
    if (!r.ok) return null;
    const pools = ((await r.json())?.data ?? []) as GtPool[];
    // Only a pool anchored to dollars (USDG) or ETH prices a stock token; the
    // deepest pool overall can be a launchpad memecoin paired WITH the stock
    // (AAPL's was INU/AAPL on 2026-10-02), whose price we will not chart.
    const anchor = (p: GtPool) => {
      const n = (p.attributes?.name ?? "").toUpperCase();
      return /\bUSDG\b/.test(n) ? 0 : /\b(WETH|ETH)\b/.test(n) ? 1 : 9;
    };
    const best = pools
      .filter((p) => p.attributes?.address && anchor(p) < 9)
      .sort((a, b) => anchor(a) - anchor(b) || Number(b.attributes?.reserve_in_usd ?? 0) - Number(a.attributes?.reserve_in_usd ?? 0))[0];
    if (!best?.attributes?.address) return null;
    return { address: best.attributes.address, name: best.attributes.name ?? "pool", dex: best.relationships?.dex?.data?.id ?? "dex" };
  } catch { return null; }
}

async function deepestPool(token: string): Promise<{ address: string; name: string; dex: string } | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/base/${token}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6_000), next: { revalidate: 900 } });
    if (!r.ok) return null;
    const pairs = (await r.json()) as DsPair[];
    if (!Array.isArray(pairs)) return null;
    const t = token.toLowerCase();
    const best = pairs
      .filter((p) => p.pairAddress && ((p.baseToken?.address ?? "").toLowerCase() === t || (p.quoteToken?.address ?? "").toLowerCase() === t))
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    if (!best?.pairAddress) return null;
    return { address: best.pairAddress, name: `${best.baseToken?.symbol ?? "?"}/${best.quoteToken?.symbol ?? "?"}`, dex: best.dexId ?? "dex" };
  } catch { return null; }
}

async function ohlcv(pool: string, tf: Tf, token?: string, chain: Chain = "base"): Promise<[number, number][] | null> {
  const c = TF[tf];
  const q = new URLSearchParams({ aggregate: String(c.aggregate), limit: String(c.limit), currency: "usd", ...(token ? { token } : {}) });
  try {
    const url = `https://api.geckoterminal.com/api/v2/networks/${chain}/pools/${pool}/ohlcv/${c.path}?${q}`;
    let r = await fetch(url, { signal: AbortSignal.timeout(8_000), next: { revalidate: c.revalidate } });
    // GeckoTerminal is ~30 req/min keyless and serverless IPs are shared:
    // MEASURED 2026-10-02, the AAPL and NVDAc pools answered empty under a
    // burst and 5 candles each a minute later. One short retry on a 429.
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 1_500));
      r = await fetch(url, { signal: AbortSignal.timeout(8_000), next: { revalidate: c.revalidate } });
    }
    if (!r.ok) return null;
    const j = await r.json();
    const list: number[][] = j?.data?.attributes?.ohlcv_list ?? [];
    // rows: [timestamp, open, high, low, close, volume], newest first.
    return list.slice().reverse()
      .map((row) => [Number(row[0]), Number(row[4])] as [number, number])
      .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v) && v > 0);
  } catch { return null; }
}

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const tf = (u.get("tf") ?? "30d") as Tf;
  if (!(tf in TF)) return empty("tf must be 1d, 7d or 30d");
  const chainRaw = u.get("chain") ?? "base";
  if (chainRaw !== "base" && chainRaw !== "robinhood") return empty("chain must be base or robinhood");
  const chain: Chain = chainRaw;

  const poolParam = u.get("pool");
  if (poolParam) {
    if (!POOL.test(poolParam)) return empty("invalid pool");
    const tokenParam = u.get("token");
    if (tokenParam && !ADDR.test(tokenParam)) return empty("invalid token");
    const series = await ohlcv(poolParam, tf, tokenParam ?? undefined, chain);
    // The named pool has no candles (GeckoTerminal does not index every v4
    // pool): with a token, fall through to that token's anchored pool below
    // and SAY which pool was read. Without one, there is nothing to fall to.
    if ((!series || series.length === 0) && tokenParam) return byToken(tokenParam);
    if (!series) return empty("price history unavailable right now");
    return NextResponse.json({ series, points: series.map(([, v]) => v), tf, source: "GeckoTerminal", ts: Date.now() });
  }

  return byToken((u.get("token") ?? "").trim());

  async function byToken(raw: string) {
    // ETH → WETH is a Base mapping only; Robinhood Chain's wrapped ETH is not
    // assumed here (CLAUDE.md rule 4: no address we have not verified).
    const token = chain === "base" && raw.toUpperCase() === "ETH" ? WETH : raw;
    if (!ADDR.test(token)) return empty(`token must be a 0x address on ${chain === "base" ? "Base (or ETH)" : "Robinhood Chain"}`);
    const pool = chain === "base" ? await deepestPool(token) : await deepestPoolRh(token);
    if (!pool) return empty(`no ${chain === "base" ? "Base" : "Robinhood Chain"} pool found for this token`);
    const series = await ohlcv(pool.address, tf, token, chain);
    if (!series) return empty("price history unavailable right now", { pool, chain });
    return NextResponse.json({ series, points: series.map(([, v]) => v), pool, chain, tf, source: "GeckoTerminal", ts: Date.now() });
  }
}
