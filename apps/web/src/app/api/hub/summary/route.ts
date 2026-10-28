/**
 * /api/hub/summary — the small numbers the Agents rail shows on every Agents
 * page: x402 volume on Base per day, the top sellers of the last 7 days, and the
 * newest open jobs. Same measured index as /exchange (lib/hub/exchange).
 */
import { NextResponse } from "next/server";
import { readExchange } from "@/lib/hub/exchange";
import { listJobs } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 15;
export const revalidate = 300;

export async function GET() {
  const [ex, jobs] = await Promise.all([readExchange(30), listJobs(20).catch(() => null)]);
  const days = ex.daily;
  const last7 = Math.max(0, days.length - 7);
  const trending = ex.rows
    .map((r) => ({ payTo: r.payTo, host: r.hosts[0] ?? null, usd7: r.series.slice(-7).reduce((a, b) => a + b, 0) }))
    .filter((r) => r.usd7 > 0)
    .sort((a, b) => b.usd7 - a.usd7)
    .slice(0, 5);
  return NextResponse.json({
    readable: ex.readable,
    window_days: ex.daysCovered,
    daily: days.map((d) => ({ day: d.day, usd: Math.round(d.usd * 100) / 100, calls: d.calls })),
    usd7: Math.round(days.slice(last7).reduce((a, d) => a + d.usd, 0) * 100) / 100,
    usdAll: Math.round(days.reduce((a, d) => a + d.usd, 0) * 100) / 100,
    calls7: days.slice(last7).reduce((a, d) => a + d.calls, 0),
    trending,
    jobs: (jobs ?? []).filter((j) => j.status === "open").slice(0, 3).map((j) => ({ id: j.id, title: j.title, budget: j.budgetUnits / 1e6 })),
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
