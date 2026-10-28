/**
 * /api/hub/providers — the Base Agent Exchange as JSON, for routers and agents.
 * Every x402 seller on the CDP Bazaar on Base 8453, with its measured x402
 * inflow (lib/hub/exchange.ts). `?min_payers=2&limit=100&q=<host or text>`.
 * Gross inflow, not revenue net of the seller's own tests: we cannot know
 * those wallets, so we do not guess.
 */
import { NextResponse } from "next/server";
import { readExchange } from "@/lib/hub/exchange";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const minPayers = Number(q.get("min_payers") ?? 0) || 0;
  const limit = Math.min(500, Number(q.get("limit") ?? 100) || 100);
  const text = (q.get("q") ?? "").toLowerCase();
  const ex = await readExchange(30);
  const rows = ex.rows
    .filter((r) => r.payers >= minPayers)
    .filter((r) => !text || r.hosts.some((h) => h.includes(text)) || r.title.toLowerCase().includes(text) || r.payTo === text)
    .slice(0, limit)
    .map(({ series, ...r }) => ({ ...r, usd: Math.round(r.usd * 100) / 100, profile: `https://blueagent.dev/exchange/${r.payTo}` }));
  return NextResponse.json({
    chain: "base", chain_id: 8453,
    readable: ex.readable,
    window_days: ex.daysCovered,
    measured: "USDC paid to the provider's payTo in a tx that also emitted USDC AuthorizationUsed for the payer (EIP-3009 settlement); gross inflow",
    providers_listed: ex.providersListed,
    providers_paid: ex.rows.length,
    rows,
  }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } });
}
