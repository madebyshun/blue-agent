/**
 * GET /api/hub/builders/[address]/dashboard — creator dashboard data for one wallet.
 *
 * Aggregates BOTH registries the wallet can own tools in:
 *   • external (hub-registry)  — builder self-hosts the endpoint; 95/5 split.
 *                                Per-tool revenue is tracked (hub:tools:revenue:<id>).
 *   • hosted   (hub-hosted)    — Blue Hub runs the tool; 90/10 split.
 *                                Earnings are POOLED per wallet (builder:earned:<wallet>),
 *                                not per-tool, so hosted items carry no per-tool figure —
 *                                the aggregate is returned once under earnings.hostedUnits.
 *
 * Secrets never leave the server: external tools omit no secret (endpoint is public),
 * hosted tools go through toPublicHostedTool() inside getBuilderHostedTools() so
 * systemPrompt / authValue are stripped. All USDC figures are micro-units (6 decimals).
 */
import { NextRequest, NextResponse } from "next/server";
import { getBuilderTools } from "@/lib/hub-registry";
import { getBuilderHostedTools, getBuilderEarnings } from "@/lib/hub-hosted";

export const runtime = "nodejs";

// Normalized row the dashboard renders — a superset that fits both registries.
interface DashboardItem {
  source:      "external" | "hosted";
  id:          string;             // external id | hosted slug
  name:        string;
  description: string;
  agentName?:  string;             // creator brand/handle (default = short owner addr)
  category:    string;
  price:       string;
  priceUSDC:   number;
  verified:    boolean;
  aiReady:     boolean;
  template?:   string;             // hosted only: ai_tool | api_wrapper
  submittedAt: number;
  callCount:   number;             // lifetime paid runs (usage:<id>)
  earnedUnits: number | null;      // external: per-tool 95% revenue · hosted: null (pooled)
  splitPct:    number;             // builder share: 95 (external) | 90 (hosted)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const [external, hosted, hostedEarnedUnits] = await Promise.all([
    getBuilderTools(address),
    getBuilderHostedTools(address),
    getBuilderEarnings(address),
  ]);

  const externalItems: DashboardItem[] = external.map(t => ({
    source:      "external",
    id:          t.id,
    name:        t.name,
    description: t.description,
    agentName:   t.agentName,
    category:    t.category,
    price:       t.price,
    priceUSDC:   t.priceUSDC,
    verified:    t.verified,
    aiReady:     t.aiReady,
    submittedAt: t.submittedAt,
    callCount:   t.callCount ?? 0,
    earnedUnits: t.revenueTotal ?? 0,   // per-tool 95% accrual is tracked
    splitPct:    95,
  }));

  const hostedItems: DashboardItem[] = hosted.map(h => ({
    source:      "hosted",
    id:          h.slug,
    name:        h.name,
    description: h.description,
    agentName:   h.agentName,
    category:    h.category,
    price:       h.price,
    priceUSDC:   h.priceUSDC,
    verified:    h.verified,
    aiReady:     h.template === "ai_tool",
    template:    h.template,
    submittedAt: h.submittedAt,
    callCount:   h.callCount ?? 0,
    earnedUnits: null,                  // hosted earnings are pooled, not per-tool
    splitPct:    90,
  }));

  const externalUnits = externalItems.reduce((s, t) => s + (t.earnedUnits ?? 0), 0);
  const items = [...externalItems, ...hostedItems].sort((a, b) => b.submittedAt - a.submittedAt);

  return NextResponse.json(
    {
      address: address.toLowerCase(),
      items,
      counts: { external: externalItems.length, hosted: hostedItems.length, total: items.length },
      earnings: {
        externalUnits,                          // sum of per-tool 95% accruals
        hostedUnits: hostedEarnedUnits,         // pooled 90% accrual across hosted tools
        totalUnits:  externalUnits + hostedEarnedUnits,
      },
    },
    { headers: { "Cache-Control": "private, no-cache" } },
  );
}
