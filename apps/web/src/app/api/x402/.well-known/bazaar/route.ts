// GET /api/x402/.well-known/bazaar
//
// Agentic Market (Bazaar) discovery document — exposes every BlueAgent x402 tool
// as a Bazaar resource so autonomous agents can find + pay for them. Source of
// truth is AGENT_TOOLS (the same catalog /hub renders); prices come from each
// tool's exact priceUSDC (USDC atomic units, 6 decimals) so there's no float drift.
import { NextResponse } from "next/server";
import { AGENT_TOOLS, BLUE_TREASURY } from "@/lib/agent-tools";

export const runtime = "nodejs";

const BASE = "https://blueagent.dev";
const ICON = `${BASE}/icon.png`;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
const CORS = { "Access-Control-Allow-Origin": "*" } as const;

// "$0.05" → 50000 (fallback only — every catalog tool already carries priceUSDC).
function toAtomic(price?: string): number {
  const n = parseFloat((price ?? "$0").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 1_000_000) : 0;
}

export async function GET() {
  const resources = AGENT_TOOLS.map((t) => ({
    resource: `${BASE}/api/x402/${t.id}`,
    type: "http",
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        asset: USDC_BASE,
        payTo: t.builderAddress ?? BLUE_TREASURY,
        amount: String(t.priceUSDC ?? toAtomic(t.price)),
        maxTimeoutSeconds: 60,
      },
    ],
    extensions: {
      bazaar: {
        info: {
          input: { type: "http", method: "POST" },
          output: { type: "json" },
        },
      },
    },
    serviceName: "BlueAgent",
    description: t.description,
    tags: [t.category, "base", "ai", "x402"],
    iconUrl: ICON,
  }));

  return NextResponse.json(
    {
      resources,
      total: resources.length,
      serviceName: "BlueAgent",
      serviceUrl: BASE,
      iconUrl: ICON,
    },
    {
      headers: {
        ...CORS,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}

// Preflight — lets the agentic.market validator fetch cross-origin.
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}
