/**
 * /.well-known/x402 — the x402 discovery document (Bazaar list shape:
 * `{x402Version, items: [{resource, type, accepts, description, extensions}]}`),
 * the path marketplaces import a seller's services from (TOLLY's "Sell
 * services" reads exactly this, measured 2026-10-28).
 *
 * Built from the SAME pieces the live 402 uses — PRICE_UNITS,
 * buildRequirements, buildBazaarExtension — so what we advertise is what an
 * endpoint will quote. Free ids ($0.00) are left out: there is nothing to pay.
 */
import { NextResponse } from "next/server";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { PRICE_UNITS } from "@/lib/x402-internal-run";
import { buildRequirements } from "@/app/api/_lib/x402-cdp";
import { buildBazaarExtension } from "@/lib/x402-bazaar";
import { resourceDescription } from "@/lib/mcp-paid";

export const runtime = "nodejs";
export const maxDuration = 15;
export const revalidate = 3600;

export function GET() {
  const now = new Date().toISOString();
  const items = AGENT_TOOLS.flatMap((t) => {
    const units = PRICE_UNITS.get(t.id);
    if (!units) return [];
    return [{
      resource: `https://blueagent.dev/api/x402/${t.id}`,
      type: "http",
      x402Version: 2,
      accepts: [buildRequirements(String(units))],
      lastUpdated: now,
      description: resourceDescription(t.description),
      mimeType: "application/json",
      serviceName: "Blue Agent",
      tags: ["base", "agents", t.category ?? "tools"],
      extensions: { bazaar: buildBazaarExtension(t) },
    }];
  });
  return NextResponse.json({ x402Version: 2, items }, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
  });
}
