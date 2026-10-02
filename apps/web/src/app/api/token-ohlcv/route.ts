// GET /api/token-ohlcv — a price series for one Base token, for a chart.
//
//   ?token=0x…&tf=1d|7d|30d  → the token's own USD price on its deepest pool
//                               (any side: GeckoTerminal is asked for THIS
//                               token's price with `token=<address>`, so a
//                               quote-side pool never charts the other token)
//   ?pool=0x…                 → the original form: daily closes of the pool's
//                               base token, last ~30d (kept for compatibility)
//
// → { series: [[unixSeconds, closeUsd], …] oldest first, points: [close…],
//     pool: { address, name, dex }, tf, source, ts }
// Real data only (DexScreener picks the pool, GeckoTerminal gives the OHLCV).
// Anything unreadable comes back as an empty series with `error` — never a
// drawn line. Public and keyless, like /api/base-tokens; cached per URL.

import { NextResponse } from "next/server";

const ADDR = /^0x[a-fA-F0-9]{40}$/;
const WETH = "0x4200000000000000000000000000000000000006";
const TF = {
  "1d":  { path: "minute", aggregate: 15, limit: 96,  revalidate: 300 },
  "7d":  { path: "hour",   aggregate: 1,  limit: 168, revalidate: 900 },
  "30d": { path: "day",    aggregate: 1,  limit: 30,  revalidate: 3600 },
} as const;
type Tf = keyof typeof TF;

type DsPair = { pairAddress?: string; dexId?: string; baseToken?: { address?: string; symbol?: string }; quoteToken?: { address?: string; symbol?: string }; liquidity?: { usd?: number } };

const empty = (error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ series: [], points: [], error, ...extra }, { status: 200 });

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

async function ohlcv(pool: string, tf: Tf, token?: string): Promise<[number, number][] | null> {
  const c = TF[tf];
  const q = new URLSearchParams({ aggregate: String(c.aggregate), limit: String(c.limit), currency: "usd", ...(token ? { token } : {}) });
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/base/pools/${pool}/ohlcv/${c.path}?${q}`, { signal: AbortSignal.timeout(8_000), next: { revalidate: c.revalidate } });
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

  const poolParam = u.get("pool");
  if (poolParam) {
    if (!ADDR.test(poolParam)) return empty("invalid pool");
    const series = await ohlcv(poolParam, tf);
    if (!series) return empty("price history unavailable right now");
    return NextResponse.json({ series, points: series.map(([, v]) => v), tf, source: "GeckoTerminal", ts: Date.now() });
  }

  const raw = (u.get("token") ?? "").trim();
  const token = raw.toUpperCase() === "ETH" ? WETH : raw;
  if (!ADDR.test(token)) return empty("token must be a 0x address on Base (or ETH)");
  const pool = await deepestPool(token);
  if (!pool) return empty("no Base pool found for this token");
  const series = await ohlcv(pool.address, tf, token);
  if (!series) return empty("price history unavailable right now", { pool });
  return NextResponse.json({ series, points: series.map(([, v]) => v), pool, tf, source: "GeckoTerminal", ts: Date.now() });
}
