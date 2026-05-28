/**
 * Blue Agent Tool Gateway — /api/tool/[toolId]
 *
 * x402 payment flow:
 *   1. POST without payment → 402 requirements (payTo = our wallet)
 *   2. Client signs EIP-3009 + retries with payment in body
 *   3. Route verifies via Coinbase x402 facilitator
 *   4. If valid → run tool → settle USDC → return result
 */
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getX402Server, PAY_TO, NETWORK } from "@/lib/x402";

export const runtime = "nodejs";
export const maxDuration = 120;

const SELF_BASE = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://blueagent.dev";

// ─── Tool catalog (price in USDC micro-units, 6 decimals) ────────────────────

const TOOLS: Record<string, { price: string; usd: string; description: string }> = {
  "honeypot-check":           { price: "100000",  usd: "$0.10", description: "Token honeypot detection" },
  "contract-trust":           { price: "150000",  usd: "$0.15", description: "Smart contract trust score" },
  "aml-screen":               { price: "200000",  usd: "$0.20", description: "AML screening" },
  "allowance-audit":          { price: "100000",  usd: "$0.10", description: "Token allowance audit" },
  "phishing-scan":            { price: "100000",  usd: "$0.10", description: "Phishing detection" },
  "key-exposure":             { price: "150000",  usd: "$0.15", description: "Key exposure check" },
  "risk-gate":                { price: "200000",  usd: "$0.20", description: "Transaction risk gate" },
  "deep-analysis":            { price: "500000",  usd: "$0.50", description: "Deep project analysis" },
  "whale-copy-signal":        { price: "350000",  usd: "$0.35", description: "Smart money copy signal" },
  "token-pick-signal":        { price: "200000",  usd: "$0.20", description: "Actionable token pick" },
  "narrative-position":       { price: "250000",  usd: "$0.25", description: "Narrative position calls" },
  "token-momentum-scanner":   { price: "250000",  usd: "$0.25", description: "Momentum scanner" },
  "whale-tracker":            { price: "200000",  usd: "$0.20", description: "Whale tracker" },
  "community-sentiment":      { price: "250000",  usd: "$0.25", description: "Community sentiment" },
  "ecosystem-digest":         { price: "200000",  usd: "$0.20", description: "Weekly Base ecosystem digest" },
  "market-fit":               { price: "350000",  usd: "$0.35", description: "Market fit validator" },
  "repo-health":              { price: "350000",  usd: "$0.35", description: "Repo health check" },
  "competitor-scan":          { price: "750000",  usd: "$0.75", description: "Competitive landscape scan" },
  "token-launch-readiness":   { price: "500000",  usd: "$0.50", description: "Token launch readiness" },
  "builder-deep-dd":          { price: "1000000", usd: "$1.00", description: "Builder due diligence" },
  "builder-brand-score":      { price: "350000",  usd: "$0.35", description: "Builder brand score" },
  "roadmap-validator":        { price: "500000",  usd: "$0.50", description: "Roadmap validator" },
  "gtm-brief":                { price: "500000",  usd: "$0.50", description: "Go-to-market brief" },
  "investor-memo":            { price: "750000",  usd: "$0.75", description: "Investor memo" },
  "pitch-intelligence":       { price: "350000",  usd: "$0.35", description: "Pitch intelligence" },
  "fundraise-timing":         { price: "500000",  usd: "$0.50", description: "Fundraise timing signal" },
  "base-grant-finder":        { price: "350000",  usd: "$0.35", description: "Base grant matching" },
  "launch-simulator":         { price: "500000",  usd: "$0.50", description: "Launch simulator" },
  "wallet-pnl":               { price: "200000",  usd: "$0.20", description: "Wallet PnL" },
  "wallet-strategy-analyzer": { price: "500000",  usd: "$0.50", description: "Wallet strategy decoder" },
  "portfolio-rebalancer":     { price: "500000",  usd: "$0.50", description: "Portfolio rebalancer" },
  "defi-opportunity":         { price: "350000",  usd: "$0.35", description: "DeFi opportunity scan" },
  "protocol-risk-monitor":    { price: "350000",  usd: "$0.35", description: "Protocol risk monitor" },
  "multi-agent-workflow":     { price: "500000",  usd: "$0.50", description: "Multi-agent workflow" },
  "agent-collab-match":       { price: "350000",  usd: "$0.35", description: "Agent collab match" },
  "agent-performance":        { price: "350000",  usd: "$0.35", description: "Agent performance audit" },
  "agent-revenue-optimizer":  { price: "500000",  usd: "$0.50", description: "Agent revenue optimizer" },
  "agent-token-strategy":     { price: "500000",  usd: "$0.50", description: "Agent token strategy" },
  "community-growth-playbook":{ price: "500000",  usd: "$0.50", description: "Community growth playbook" },
  "thread-intelligence":      { price: "350000",  usd: "$0.35", description: "CT thread strategy" },
  "narrative-pulse":          { price: "250000",  usd: "$0.25", description: "Narrative pulse" },
};

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ toolId: string }> }
) {
  const { toolId } = await params;
  const meta = TOOLS[toolId];

  if (!meta) {
    return NextResponse.json(
      { error: "Unknown tool", available: Object.keys(TOOLS) },
      { status: 404 }
    );
  }

  let body: { toolParams?: Record<string, unknown>; payment?: Record<string, unknown> } = {};
  try { body = await req.json(); } catch {}

  const toolParams = body.toolParams ?? {};
  const payment = body.payment;

  // ── No payment → return 402 requirements ─────────────────────────────────
  if (!payment) {
    return NextResponse.json({
      requiresPayment: true,
      paymentDetails: {
        x402Version: 2,
        error: "Payment Required",
        accepts: [{
          scheme:            "exact",
          network:           NETWORK,
          maxAmountRequired: meta.price,
          amount:            meta.price,
          resource:          `${SELF_BASE}/api/tool/${toolId}`,
          description:       meta.description,
          mimeType:          "application/json",
          payTo:             PAY_TO,
          maxTimeoutSeconds: 300,
          asset:             USDC_BASE,
          extra: { name: "USD Coin", version: "2" },
        }],
      },
    });
  }

  // ── Has payment → verify via x402 facilitator ─────────────────────────────
  // verifyPayment takes the raw payment object (not base64) and a single requirement
  const requirement = {
    scheme:            "exact" as const,
    network:           NETWORK,
    maxAmountRequired: BigInt(meta.price),
    payTo:             PAY_TO,
    asset:             USDC_BASE as `0x${string}`,
    maxTimeoutSeconds: 300,
    resource:          `${SELF_BASE}/api/tool/${toolId}`,
    description:       meta.description,
    mimeType:          "application/json",
    extra:             { name: "USD Coin", version: "2" },
  };

  const server = getX402Server();

  // Initialize on first call (fetches supported kinds from facilitator)
  try {
    await server.initialize();
  } catch {
    // fallback: skip verification if facilitator unreachable (dev mode)
    console.warn("[x402] facilitator unreachable — running tool without payment verification");
    return runTool(toolId, toolParams);
  }

  let verified = false;
  try {
    const result = await server.verifyPayment(payment, requirement);
    verified = result.isValid;
    if (!verified) {
      console.warn("[x402] payment invalid:", JSON.stringify(result));
      return NextResponse.json(
        { error: "Payment verification failed", reason: result.invalidReason, message: result.invalidMessage },
        { status: 402 }
      );
    }
  } catch (e) {
    console.error("[x402] verify error:", e);
    return NextResponse.json(
      { error: "Payment verification error", message: (e as Error).message },
      { status: 402 }
    );
  }

  // ── Run tool ─────────────────────────────────────────────────────────────
  const toolResult = await runTool(toolId, toolParams);

  // ── Settle USDC after response is sent (after() survives Vercel function teardown) ───
  if (verified) {
    after(async () => {
      try {
        await server.settlePayment(payment, requirement);
        console.log("[x402] settle ok");
      } catch (err) {
        console.error("[x402] settle failed:", err);
      }
    });
  }

  return toolResult;
}

async function runTool(toolId: string, toolParams: Record<string, unknown>): Promise<NextResponse> {
  try {
    const res = await fetch(`${SELF_BASE}/api/${toolId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toolParams),
      signal: AbortSignal.timeout(110_000),
    });
    const data = await res.json().catch(() => ({ error: "Invalid response" }));
    return NextResponse.json({ result: data });
  } catch (e) {
    return NextResponse.json(
      { error: "Tool failed", message: (e as Error).message },
      { status: 502 }
    );
  }
}
