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
  const resources = AGENT_TOOLS.map((t) => {
    const amount = t.priceUSDC ?? toAtomic(t.price);
    return {
      resource: `${BASE}/api/x402/${t.id}`,
      type: "http",
      x402Version: 2,
      // A $0.00 tool gets an EMPTY `accepts`, not a $0 entry — the same rule as
      // `pricing: []` in the ERC-8257 manifest: an entry naming a scheme, an
      // asset and a payTo is an instruction to pay, and one saying to pay ZERO
      // to the live treasury is a contradiction an agent resolves by signing
      // anyway. `x402Free` states it positively for a reader that treats `[]` as
      // "pricing unknown" rather than "pricing none". The tool stays listed
      // either way — hiding it was the other half of the same 2026-09-27 bug.
      //
      // MEASURED in prod that day: all six free ids quoted amount "0" to
      // 0x0295… here, three commits AFTER the identical defect was swept out of
      // the three manifests under `/.well-known/`. This is the file nobody
      // re-read, because it lives under `/api/x402/.well-known/` — a second
      // well-known prefix. Grep for the field carrying the price, not the dir.
      accepts: amount === 0 ? [] : [
        {
          scheme: "exact",
          network: "eip155:8453",
          asset: USDC_BASE,
          payTo: t.builderAddress ?? BLUE_TREASURY,
          amount: String(amount),
          maxTimeoutSeconds: 60,
        },
      ],
      ...(amount === 0 ? { x402Free: true } : {}),
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
    };
  });

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
