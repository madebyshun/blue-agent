import { NextRequest, NextResponse } from "next/server";
import { runSimulation } from "@/lib/simulator/run";

const PAY_TO  = "0xf31f59e7b8b58555f7871f71973a394c8f1bffe5"; // Blue Agent treasury
const USDC    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
const FACILITATOR = "https://x402.org/facilitator";

const TIER_PRICES: Record<number, string> = {
  1: "100000",  // $0.10
  2: "350000",  // $0.35
  3: "500000",  // $0.50
};

const TIER_DESC: Record<number, string> = {
  1: "Launch Simulator Tier 1 — Quick Signal",
  2: "Launch Simulator Tier 2 — Deep Signal",
  3: "Launch Simulator Tier 3 — Full Simulation",
};

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { project, description = "", ticker = "", contract = "" } = body as Record<string, string>;
  const tier = Math.min(Math.max(Number(body.tier ?? 1), 1), 3);

  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }

  const xPayment = req.headers.get("x-payment") ?? req.headers.get("X-Payment");
  const price = TIER_PRICES[tier];
  const resource = `${req.nextUrl.origin}/api/simulator`;

  // ── Step 1: no payment → 402 ──────────────────────────────────────────────────
  if (!xPayment) {
    return NextResponse.json({
      x402Version: 2,
      error: "Payment Required",
      accepts: [{
        scheme: "exact",
        network: "eip155:8453",
        maxAmountRequired: price,
        resource,
        description: TIER_DESC[tier],
        mimeType: "application/json",
        payTo: PAY_TO,
        maxTimeoutSeconds: 300,
        asset: USDC,
        extra: { name: "USD Coin", version: "2" },
      }],
      facilitator: FACILITATOR,
    }, { status: 402 });
  }

  // ── Step 2: payment present → verify with facilitator ───────────────────────
  let payment: unknown;
  try {
    payment = JSON.parse(Buffer.from(xPayment, "base64").toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid X-Payment header" }, { status: 400 });
  }

  try {
    const settlRes = await fetch(`${FACILITATOR}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment, x402Version: 2 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!settlRes.ok) {
      const err = await settlRes.json().catch(() => ({}));
      console.error("[simulator] facilitator settle failed:", err);
      return NextResponse.json(
        { error: "Payment verification failed", detail: err },
        { status: 402 }
      );
    }
  } catch (e) {
    console.error("[simulator] facilitator error:", e);
    return NextResponse.json({ error: "Could not reach payment facilitator" }, { status: 502 });
  }

  // ── Step 3: run simulation ────────────────────────────────────────────────────
  try {
    const result = await runSimulation({ project, description, ticker, contract, tier });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[simulator] simulation error:", e);
    return NextResponse.json(
      { error: "Simulation failed", message: (e as Error).message },
      { status: 500 }
    );
  }
}
