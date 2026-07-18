/**
 * Blue Hood — per-ticker detail (T-B2).
 *
 * Returns M3 (liquidity) + D1 (holders) for one ticker on demand, cached
 * in KV under `bh:detail:{TICKER}` with a 5-minute TTL. The main 72s poll
 * cycle NEVER preloads details — the reviewer's rule is "fetch on-demand
 * first click". A cache hit costs 1 KV read; a miss costs 2 x402 tool
 * calls sequentially (via the internal-bypass path — no user pays).
 *
 * Public read-only. The internal-bypass path is inside `callTool` so no
 * secret leaks: browser callers can hit this URL freely.
 */
import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet } from "@/lib/kv";
import { callTool } from "@/lib/blue-hood/tool-caller";
import { findByTicker } from "@/lib/robinhood/rwa-registry";

export const runtime = "nodejs";

const TTL_S = 300; // 5 min — reviewer's spec
const kvKey = (t: string) => `bh:detail:${t.toUpperCase()}`;

interface M3Response {
  pool_count?: number;
  total_tvl_usd?: number;
  total_volume_24h_usd?: number;
  deepest_pool?: {
    name?: string;
    dex?: string;
    price_usd?: number;
    reserve_usd?: number;
    one_side_usd?: number;
    pool_ref?: string;
    url?: string;
  };
  pools?: Array<{
    name?: string;
    dex?: string;
    reserve_usd?: number;
    volume_24h_usd?: number;
    pool_ref?: string;
    url?: string;
  }>;
  slippage_upper_bound?: {
    method?: string;
    note?: string;
    estimates?: Array<{
      trade_size_usd?: number;
      slippage_pct_upper?: number | null;
      exceeds_pool_one_side?: boolean;
    }>;
  };
  warnings?: string[];
  explorer_url?: string;
}

interface D1Response {
  holders?: Array<{
    address?: string;
    balance?: string;
    balance_share?: number;
    share_pct?: number;
  }>;
  concentration?: {
    top1_pct?: number | null;
    top10_pct?: number | null;
    hhi?: number | null;
    hhi_note?: string;
  };
  warnings?: string[];
}

interface CachedDetail {
  ticker: string;
  fetched_at: string;
  liquidity: M3Response | { error: string } | null;
  holders: D1Response | { error: string } | null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rawTicker = url.searchParams.get("ticker") ?? "";
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "Missing ?ticker=" }, { status: 400 });
  }
  const token = findByTicker(ticker);
  if (!token) {
    return NextResponse.json({ error: `Ticker ${ticker} not in registry.` }, { status: 404 });
  }

  const cached = await kvGet<CachedDetail>(kvKey(ticker));
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_S * 1000) {
    return NextResponse.json(
      { ok: true, cache: true, detail: cached },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  // Fetch M3 + D1 sequentially (avoid two parallel GT calls competing on
  // the rate-limit window we already stagger for). Never throws — errored
  // fetches surface as `{ error: "..." }` blocks that the UI can render.
  const m3 = await callTool<M3Response>("rh-stock-liquidity", { ticker }, { timeoutMs: 15_000 });
  const d1 = await callTool<D1Response>("rh-stock-holders", { ticker, limit: 10 }, { timeoutMs: 15_000 });

  const detail: CachedDetail = {
    ticker,
    fetched_at: new Date().toISOString(),
    liquidity: m3.ok ? m3.data : { error: `${m3.status}: ${m3.error}` },
    holders: d1.ok ? d1.data : { error: `${d1.status}: ${d1.error}` },
  };
  await kvSet(kvKey(ticker), detail, TTL_S);
  return NextResponse.json(
    { ok: true, cache: false, detail },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
