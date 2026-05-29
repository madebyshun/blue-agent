/**
 * Self-hosted x402 endpoint (Base mainnet, Coinbase CDP facilitator).
 *
 *   no X-Payment  → 402 with our requirements (payTo = Club wallet 0xb058)
 *   X-Payment     → settle USDC via CDP (charges user → 0xb058) → run handler
 *
 * No Bankr dependency. Tool compute runs locally via the self-contained
 * handlers copied into _handlers/ (registry). Only tools in HANDLERS are live.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildRequirements, cdpSettle } from "@/app/api/_lib/x402-cdp";
import { HANDLERS } from "@/app/api/x402/_handlers";
import { AGENT_TOOLS } from "@/lib/agent-tools";

export const runtime = "nodejs";
export const maxDuration = 120;

// tool id → price in USDC micro-units (6 decimals), parsed from "$0.20"
function priceToUnits(price?: string): number | null {
  if (!price) return null;
  const n = parseFloat(price.replace("$", "").trim());
  return Number.isNaN(n) ? null : Math.round(n * 1_000_000);
}
const PRICE_UNITS = new Map<string, number>(
  AGENT_TOOLS
    .map(t => [t.id, priceToUnits(t.price)] as const)
    .filter((e): e is readonly [string, number] => e[1] !== null)
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  try {
    return await handle(req, params);
  } catch (e) {
    return NextResponse.json(
      { error: "Route crashed", message: (e as Error).message, stack: (e as Error).stack?.slice(0, 400) },
      { status: 500 }
    );
  }
}

async function handle(
  req: NextRequest,
  params: Promise<{ tool: string }>
): Promise<NextResponse> {
  const { tool } = await params;
  const handler = HANDLERS[tool];
  const priceUnits = PRICE_UNITS.get(tool);

  if (!handler || !priceUnits) {
    return NextResponse.json(
      { error: "Tool not available", tool },
      { status: 503 }
    );
  }

  const requirements = buildRequirements(String(priceUnits));
  const xPayment = req.headers.get("x-payment") ?? req.headers.get("X-Payment");

  // No payment → 402 requirements
  if (!xPayment) {
    return NextResponse.json(
      { x402Version: 2, error: "Payment Required", accepts: [requirements] },
      { status: 402 }
    );
  }

  // Decode payment
  let paymentPayload: unknown;
  try {
    paymentPayload = JSON.parse(Buffer.from(xPayment, "base64").toString("utf-8"));
  } catch {
    return NextResponse.json({ error: "Invalid X-Payment header" }, { status: 400 });
  }

  // Read tool params
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  // Settle USDC on-chain via CDP (charges user → our wallet)
  const settle = await cdpSettle(paymentPayload, requirements);
  if (!settle.ok) {
    return NextResponse.json(
      { error: "Payment settlement failed", status: settle.status, detail: settle.detail },
      { status: 402 }
    );
  }

  // Run the tool handler (self-contained Request → Response)
  try {
    const innerReq = new Request(`https://blueagent.dev/api/x402/${tool}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const resp = await handler(innerReq);
    const data = await resp.json().catch(() => ({}));
    return NextResponse.json({ ...data, _settle: { ok: true, status: settle.status } });
  } catch (e) {
    return NextResponse.json(
      { error: "Tool error after payment", message: (e as Error).message, _settle: { ok: true } },
      { status: 500 }
    );
  }
}
