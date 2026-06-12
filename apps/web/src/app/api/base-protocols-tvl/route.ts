// GET /api/base-protocols-tvl
//
// Daily Base TVL history for the top protocols, merged into a stacked series for
// the dashboard's stacked-area chart. Real data (DefiLlama /protocol/{slug} →
// chainTvls.Base.tvl). Cached 1h. Last ~365 days.

import { NextResponse } from "next/server";

export const revalidate = 3600;

export const PROTOCOLS = [
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
    const r = await fetch(`https://api.llama.fi/protocol/${slug}`, { next: { revalidate: 3600 } });
    const j = await r.json();
    const arr: Pt[] = j?.chainTvls?.Base?.tvl ?? [];
    for (const p of arr) {
      const day = Math.floor(p.date / 86400) * 86400; // snap to day
      m.set(day, Math.round((p.totalLiquidityUSD ?? p.tvl ?? 0)));
    }
  } catch { /* leave empty */ }
  return m;
}

export async function GET() {
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
  return NextResponse.json({ series, keys, ts: Date.now() });
}
