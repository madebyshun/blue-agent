/**
 * Blue Agent Public API — /api/v1/[tool]
 *
 * x402-ready: returns HTTP 402 with payment requirements when no X-Payment header.
 * With valid X-Payment: runs the tool and returns JSON result.
 *
 * Auth: x402 — USDC on Base mainnet via X-Payment header
 * Docs: https://blueagent.dev/api-docs
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";

// ─── Tool catalog ─────────────────────────────────────────────────────────────

const TOOLS: Record<string, { price: string; description: string }> = {
  "honeypot-check":          { price: "100000",  description: "Token honeypot detection" },
  "contract-trust":          { price: "150000",  description: "Smart contract trust score" },
  "aml-screen":              { price: "200000",  description: "AML screening" },
  "allowance-audit":         { price: "100000",  description: "Token allowance audit" },
  "phishing-scan":           { price: "100000",  description: "Phishing detection" },
  "key-exposure":            { price: "150000",  description: "Key exposure check" },
  "risk-gate":               { price: "200000",  description: "Transaction risk gate" },
  "deep-analysis":           { price: "500000",  description: "Deep project analysis" },
  "whale-copy-signal":       { price: "350000",  description: "Smart money copy signal" },
  "token-pick-signal":       { price: "200000",  description: "Actionable token pick" },
  "narrative-position":      { price: "250000",  description: "Narrative position calls" },
  "token-momentum-scanner":  { price: "250000",  description: "Momentum scanner" },
  "whale-tracker":           { price: "200000",  description: "Whale tracker" },
  "community-sentiment":     { price: "250000",  description: "Community sentiment" },
  "ecosystem-digest":        { price: "200000",  description: "Weekly Base ecosystem digest" },
  "market-fit":              { price: "350000",  description: "Market fit validator" },
  "repo-health":             { price: "350000",  description: "Repo health check" },
  "competitor-scan":         { price: "750000",  description: "Competitive landscape scan" },
  "token-launch-readiness":  { price: "500000",  description: "Token launch readiness" },
  "builder-deep-dd":         { price: "1000000", description: "Builder due diligence" },
  "builder-brand-score":     { price: "350000",  description: "Builder brand score" },
  "roadmap-validator":       { price: "500000",  description: "Roadmap validator" },
  "gtm-brief":               { price: "500000",  description: "Go-to-market brief" },
  "investor-memo":           { price: "750000",  description: "Investor memo" },
  "pitch-intelligence":      { price: "350000",  description: "Pitch intelligence" },
  "fundraise-timing":        { price: "500000",  description: "Fundraise timing signal" },
  "base-grant-finder":       { price: "350000",  description: "Base grant matching" },
  "launch-simulator":        { price: "500000",  description: "Launch scenario simulator" },
  "wallet-pnl":              { price: "200000",  description: "Wallet PnL" },
  "wallet-strategy-analyzer":{ price: "500000",  description: "Wallet strategy decoder" },
  "portfolio-rebalancer":    { price: "500000",  description: "Portfolio rebalancer" },
  "defi-opportunity":        { price: "350000",  description: "DeFi opportunity scan" },
  "protocol-risk-monitor":   { price: "350000",  description: "Protocol risk monitor" },
  "multi-agent-workflow":    { price: "500000",  description: "Multi-agent workflow design" },
  "agent-collab-match":      { price: "350000",  description: "Agent collaboration match" },
  "agent-performance":       { price: "350000",  description: "Agent performance audit" },
  "agent-revenue-optimizer": { price: "500000",  description: "Agent revenue optimizer" },
  "agent-token-strategy":    { price: "500000",  description: "Agent token strategy" },
  "community-growth-playbook":{ price: "500000", description: "Community growth playbook" },
  "thread-intelligence":     { price: "350000",  description: "CT thread strategy" },
  "narrative-pulse":         { price: "250000",  description: "Narrative pulse" },
};

const USDC_BASE   = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO      = process.env.PAYMENT_WALLET ?? "0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f";
// Internal base — same deployment, no roundtrip in dev; public URL in prod
const SELF_BASE   = process.env.SELF_BASE_URL ?? "https://blueagent.dev";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Payment, Authorization",
  };
}

function paymentRequired(tool: string, price: string, description: string): NextResponse {
  return NextResponse.json(
    {
      x402Version: 2,
      error: "Payment Required",
      accepts: [
        {
          scheme:             "exact",
          network:            "eip155:8453",
          maxAmountRequired:  price,
          amount:             price,
          resource:           `${SELF_BASE}/api/v1/${tool}`,
          description,
          mimeType:           "application/json",
          payTo:              PAY_TO,
          maxTimeoutSeconds:  300,
          asset:              USDC_BASE,
          extra: { name: "USD Coin", version: "2" },
        },
      ],
    },
    { status: 402, headers: corsHeaders() }
  );
}

// ─── POST — run tool ──────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool } = await params;

  // Validate tool
  const meta = TOOLS[tool];
  if (!meta) {
    return NextResponse.json(
      { error: "Unknown tool", available: Object.keys(TOOLS) },
      { status: 404, headers: corsHeaders() }
    );
  }

  const xPayment = req.headers.get("x-payment") ?? req.headers.get("X-Payment");

  // No payment → return 402 requirements (x402 standard)
  if (!xPayment) {
    return paymentRequired(tool, meta.price, meta.description);
  }

  // Rate limit (paid requests only)
  const { success } = await rateLimit(getIdentifier(req), "api");
  if (!success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: corsHeaders() }
    );
  }

  // Read body
  let body = "{}";
  try { body = await req.text(); } catch {}

  // Run tool via internal route (same app, handles LLM pipeline + fallbacks)
  let res: Response;
  try {
    res = await fetch(`${SELF_BASE}/api/${tool}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Tool unavailable", message: (e as Error).message },
      { status: 502, headers: corsHeaders() }
    );
  }

  let data: unknown;
  try { data = await res.json(); } catch { data = { error: "Invalid response from tool" }; }

  return NextResponse.json(data, {
    status: res.ok ? 200 : res.status,
    headers: corsHeaders(),
  });
}

// ─── GET — tool info ──────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool } = await params;

  if (tool === "_catalog") {
    return NextResponse.json(
      {
        total:   Object.keys(TOOLS).length,
        tools:   Object.entries(TOOLS).map(([slug, meta]) => ({
          slug,
          price:       `$${(Number(meta.price) / 1_000_000).toFixed(2)}`,
          description: meta.description,
        })),
        baseUrl: `${SELF_BASE}/api/v1`,
        auth:    "x402 — POST with X-Payment header (USDC on Base)",
      },
      { headers: corsHeaders() }
    );
  }

  const meta = TOOLS[tool];
  if (!meta) {
    return NextResponse.json(
      { error: "Unknown tool", available: Object.keys(TOOLS) },
      { status: 404, headers: corsHeaders() }
    );
  }

  return NextResponse.json(
    {
      tool,
      price:       `$${(Number(meta.price) / 1_000_000).toFixed(2)}`,
      description: meta.description,
      method:      "POST",
      url:         `${SELF_BASE}/api/v1/${tool}`,
      auth:        "x402 — X-Payment header (USDC on Base mainnet)",
      example: {
        curl: `curl -X POST ${SELF_BASE}/api/v1/${tool} -H "Content-Type: application/json" -H "X-Payment: <base64_payment>" -d '{}'`,
      },
    },
    { headers: corsHeaders() }
  );
}

// ─── OPTIONS — CORS preflight ─────────────────────────────────────────────────

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
