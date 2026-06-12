// GET /api/base-apy-history
//
// Daily USDC supply-APY history for the main Base lending venues, merged into a
// multi-line series for the dashboard's APY-comparison chart. Real data from
// DefiLlama yield charts (yields.llama.fi/chart/{poolId}). Cached 1h.

import { NextResponse } from "next/server";

export const revalidate = 3600;

// NOTE: not exported — Next.js route modules may only export the framework's
// allowlisted names (GET, revalidate, …). A stray `export` here makes the
// generated .next/types reject the route. Kept module-local; the frontend
// reads label/color from the `keys` field of the JSON response, not an import.
const APY_POOLS = [
  { id: "69cf831d-624a-4f23-b5e3-c0f63ad1fa01", key: "moonwell", label: "Moonwell", color: "#34D399" },
  { id: "e0672197-9f3e-4414-bca5-e6b4c90aa469", key: "morpho",   label: "Morpho",   color: "#A78BFA" },
  { id: "7e0661bf-8cf3-45e6-9424-31916d4c7b84", key: "aave",     label: "Aave v3",  color: "#4FC3F7" },
] as const;

async function apySeries(id: string): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  try {
    const r = await fetch(`https://yields.llama.fi/chart/${id}`, { next: { revalidate: 3600 } });
    const j = await r.json();
    const arr: { timestamp: string; apy: number | null }[] = j?.data ?? [];
    for (const p of arr) {
      const ms = new Date(p.timestamp).getTime();
      const day = Math.floor(ms / 86400000) * 86400000;
      if (p.apy != null) m.set(day, Number(p.apy.toFixed(2)));
    }
  } catch { /* leave empty */ }
  return m;
}

export async function GET() {
  const maps = await Promise.all(APY_POOLS.map(p => apySeries(p.id)));
  const cutoff = Date.now() - 365 * 86400000;
  const days = new Set<number>();
  maps.forEach(m => m.forEach((_, d) => { if (d >= cutoff) days.add(d); }));
  const sorted = [...days].sort((a, b) => a - b);

  const series = sorted.map(d => {
    const row: Record<string, number | null> = { t: d };
    APY_POOLS.forEach((p, i) => { row[p.key] = maps[i].get(d) ?? null; });
    return row;
  });

  const keys = APY_POOLS.map(p => ({ key: p.key, label: p.label, color: p.color }));
  return NextResponse.json({ series, keys, ts: Date.now() });
}
