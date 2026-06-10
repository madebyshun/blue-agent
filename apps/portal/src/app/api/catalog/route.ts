/**
 * GET /api/catalog
 *
 * Public, machine-readable catalog of all live APIs on Blue Hub.
 * Used by MCP catalogs (Smithery, MCP.SO), AI scrapers, and third-party
 * agents that want to discover Blue Hub's offering without scraping HTML.
 *
 * Cached at the edge for 60s.
 */

import { NextResponse } from "next/server";
import { APIS } from "../../marketplace/_data";
import { listRegisteredAPIs } from "@/lib/registry";

export const runtime = "nodejs";

export async function GET() {
  const firstParty = APIS.filter(a => a.status === "live");
  const registered = await listRegisteredAPIs();

  // Normalize KV-registered shape into the same projection as first-party.
  const registeredFlat = registered.map(r => ({
    id:           r.id,
    name:         r.name,
    provider:     r.provider,
    category:     r.category,
    desc:         r.description,
    icon:         "⚡",
    endpoint:     r.endpoint.replace(/^https?:\/\//, ""),
    priceNum:     r.priceUSDC / 1_000_000,
    price:        r.price,
    verified:     r.verified,
    aiReady:      r.aiReady,
    featured:     false,
    releasedAt:   new Date(r.submittedAt).toISOString().slice(0, 10),
    calls:        r.callCount ?? 0,
  }));

  const live = [...firstParty, ...registeredFlat];

  const body = {
    version:     "1.0",
    generated:   new Date().toISOString(),
    marketplace: "Blue Hub",
    parent:      "Blue Agent",
    homepage:    "https://api.blueagent.dev",
    mcp_endpoint:"https://blueagent.dev/api/mcp",
    chain:       "base:8453",
    payment:     "x402 / EIP-3009 USDC",
    facilitator: "Coinbase CDP",
    revenue_split: {
      provider:  0.80,
      treasury:  0.20,
    },
    counts: {
      live_apis: live.length,
      reserved:  APIS.filter(a => a.status === "reserved").length,
      total:     APIS.length,
    },
    apis: live.map(a => ({
      id:              a.id,
      name:            a.name,
      provider:        a.provider,
      category:        a.category,
      description:     a.desc,
      icon:            a.icon ?? null,
      endpoint:        `https://${a.endpoint}`,
      mcp_name:        a.id.replace(/-/g, "_"),       // MCP tool naming convention
      price_usd:       a.priceNum,
      price_display:   a.price,
      price_usdc_units:Math.round(a.priceNum * 1_000_000),
      verified:        a.verified,
      ai_ready:        a.aiReady,
      featured:        a.featured,
      released_at:     a.releasedAt,
      lifetime_calls:  a.calls,
      detail_url:      `https://api.blueagent.dev/marketplace/${a.id}`,
    })),
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control":              "public, s-maxage=60, stale-while-revalidate=300",
      "Access-Control-Allow-Origin":"*",
    },
  });
}
