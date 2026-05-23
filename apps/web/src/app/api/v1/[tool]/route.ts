/**
 * Blue Agent — Public API Gateway
 * All tools available at: POST /api/v1/[tool]
 *
 * Auth: x402 — USDC payment via X-Payment header
 * Rate limit: 100 req/min per IP
 * Docs: https://blueagent.dev/api-docs
 *
 * All traffic is proxied to Bankr/x402 upstream.
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";

// ─── Tool → upstream endpoint map ────────────────────────────────────────────
// Maps public tool slugs to Bankr x402 upstream paths.

const TOOL_MAP: Record<string, string> = {
  // Security
  "honeypot-check":       "honeypot-check",
  "contract-trust":       "contract-trust",
  "aml-screen":           "aml-screen",
  "allowance-audit":      "allowance-audit",
  "phishing-scan":        "phishing-scan",
  "key-exposure":         "key-exposure",
  // Research
  "deep-analysis":        "deep-analysis",
  "whale-copy-signal":    "whale-copy-signal",
  "token-pick-signal":    "token-pick-signal",
  "narrative-position":   "narrative-position",
  "token-momentum-scanner": "token-momentum-scanner",
  "whale-tracker":        "whale-tracker",
  "community-sentiment":  "community-sentiment",
  // Builder
  "builder-score":        "builder-score",
  "agent-score":          "agent-score",
  "base-grant-finder":    "base-grant-finder",
  "market-fit":           "market-fit",
  "repo-health":          "repo-health",
  "ecosystem-digest":     "ecosystem-digest",
  "competitor-scan":      "competitor-scan",
  "launch-simulator":     "launch-simulator",
  "token-launch-readiness": "token-launch-readiness",
  "builder-deep-dd":      "builder-deep-dd",
  "builder-brand-score":  "builder-brand-score",
  "roadmap-validator":    "roadmap-validator",
  "gtm-brief":            "gtm-brief",
  "investor-memo":        "investor-memo",
  "pitch-intelligence":   "pitch-intelligence",
  "fundraise-timing":     "fundraise-timing",
  // Premium
  "risk-gate":            "risk-gate",
  "wallet-pnl":           "wallet-pnl",
  "wallet-strategy-analyzer": "wallet-strategy-analyzer",
  "portfolio-rebalancer": "portfolio-rebalancer",
  "defi-opportunity":     "defi-opportunity",
  "protocol-risk-monitor": "protocol-risk-monitor",
  // Multi-agent
  "multi-agent-workflow": "multi-agent-workflow",
  "agent-collab-match":   "agent-collab-match",
  "agent-performance":    "agent-performance",
  "agent-revenue-optimizer": "agent-revenue-optimizer",
  "agent-token-strategy": "agent-token-strategy",
  // Community
  "community-growth-playbook": "community-growth-playbook",
  "thread-intelligence":  "thread-intelligence",
  "narrative-pulse":      "narrative-pulse",
};

const BANKR_BASE = process.env.BANKR_TOOL_BASE_URL ?? "https://llm.bankr.bot/x402";

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool } = await params;

  // Rate limit
  const { success } = await rateLimit(getIdentifier(req), "api");
  if (!success) {
    return NextResponse.json({ error: "Rate limit exceeded — 100 req/min" }, { status: 429 });
  }

  // Validate tool
  const upstream = TOOL_MAP[tool];
  if (!upstream) {
    return NextResponse.json({
      error: "Unknown tool",
      available: Object.keys(TOOL_MAP),
      docs: "https://blueagent.dev/api-docs",
    }, { status: 404 });
  }

  // Read body
  let body = "{}";
  try { body = await req.text(); } catch {}

  // Forward payment header
  const xPayment = req.headers.get("x-payment") ?? req.headers.get("X-Payment");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(process.env.BANKR_API_KEY ? { "Authorization": `Bearer ${process.env.BANKR_API_KEY}` } : {}),
  };
  if (xPayment) headers["X-Payment"] = xPayment;

  // Call upstream
  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${BANKR_BASE}/${upstream}`, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Upstream unreachable", message: (e as Error).message },
      { status: 502 }
    );
  }

  // Read response
  let text = "";
  try { text = await upstreamRes.text(); } catch {}

  let data: unknown = text;
  if (text) {
    try { data = JSON.parse(text); } catch {}
  } else {
    data = upstreamRes.status === 402
      ? { error: "Payment required", docs: "https://blueagent.dev/api-docs#auth" }
      : { error: "Empty response from upstream" };
  }

  // Add CORS headers so external agents can call directly
  return NextResponse.json(data, {
    status: upstreamRes.status,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Payment, Authorization",
    },
  });
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Payment, Authorization",
    },
  });
}

// GET — tool discovery
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool } = await params;

  if (tool === "_catalog") {
    return NextResponse.json({
      total: Object.keys(TOOL_MAP).length,
      tools: Object.keys(TOOL_MAP),
      docs: "https://blueagent.dev/api-docs",
      base_url: "https://blueagent.dev/api/v1",
    });
  }

  const upstream = TOOL_MAP[tool];
  if (!upstream) {
    return NextResponse.json({
      error: "Unknown tool",
      available: Object.keys(TOOL_MAP),
      docs: "https://blueagent.dev/api-docs",
    }, { status: 404 });
  }

  return NextResponse.json({
    tool,
    method: "POST",
    url: `https://blueagent.dev/api/v1/${tool}`,
    auth: "x402 — X-Payment header (USDC on Base)",
    docs: `https://blueagent.dev/api-docs`,
  });
}
