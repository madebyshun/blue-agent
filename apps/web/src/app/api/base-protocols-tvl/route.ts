// GET /api/base-protocols-tvl
//
// Daily Base TVL history for the top protocols, merged into a stacked series for
// the dashboard's stacked-area chart. Real data (DefiLlama /protocol/{slug} →
// chainTvls.Base.tvl). Cached 1h. Last ~365 days.

import { NextResponse } from "next/server";

export const revalidate = 3600;

// NOTE: not exported — Next.js route modules may only export the framework's
// allowlisted names (GET, revalidate, …). A stray `export` here makes the
// generated .next/types reject the route. Kept module-local; the frontend
// reads label/color from the `keys` field of the JSON response, not an import.
const PROTOCOLS = [
  { slug: "morpho-blue",          key: "morpho",    label: "Morpho",    color: "#A78BFA" },
  { slug: "aave-v3",              key: "aave",      label: "Aave",      color: "#EC4899" },
  { slug: "uniswap-v3",           key: "uniswap",   label: "Uniswap",   color: "#F59E0B" },
  { slug: "aerodrome-slipstream", key: "aerodrome", label: "Aerodrome", color: "#4FC3F7" },
  { slug: "moonwell",             key: "moonwell",  label: "Moonwell",  color: "#34D399" },
] as const;

type Pt = { date: number; totalLiquidityUSD?: number; tvl?: number };

async function baseSeries(slug: string): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  try {
    const r = await fetch(`https://api.llama.fi/protocol/${slug}`, { cache: "no-store" });
    const j = await r.json();
    const arr: Pt[] = j?.chainTvls?.Base?.tvl ?? [];
    for (const p of arr) {
      const day = Math.floor(p.date / 86400) * 86400; // snap to day
      m.set(day, Math.round((p.totalLiquidityUSD ?? p.tvl ?? 0)));
    }
  } catch { /* leave empty */ }
  return m;
}

// The upstream /protocol/{slug} responses are huge (20–36 MB each) and exceed
// Next's 2 MB fetch-cache limit, so they'd be re-downloaded on every request and
// bog the server. Cache the small computed result in module memory for 1h.
let MEM: { data: unknown; ts: number } | null = null;

export async function GET() {
  if (MEM && Date.now() - MEM.ts < 3600_000) return NextResponse.json(MEM.data);

  const maps = await Promise.all(PROTOCOLS.map(p => baseSeries(p.slug)));

  // Union of days across the largest protocol, last 365 days.
  const cutoff = Math.floor(Date.now() / 1000) - 365 * 86400;
  const days = new Set<number>();
  maps.forEach(m => m.forEach((_, d) => { if (d >= cutoff) days.add(d); }));
  const sorted = [...days].sort((a, b) => a - b);

  const series = sorted.map(d => {
    const row: Record<string, number> = { t: d * 1000 };
    PROTOCOLS.forEach((p, i) => { row[p.key] = maps[i].get(d) ?? 0; });
    return row;
  });

  const keys = PROTOCOLS.map(p => ({ key: p.key, label: p.label, color: p.color }));
  const data = { series, keys, ts: Date.now() };
  MEM = { data, ts: Date.now() };
  return NextResponse.json(data);
}
