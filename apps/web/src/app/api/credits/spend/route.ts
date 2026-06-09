/**
 * POST /api/credits/spend
 *
 * Server-to-server endpoint that debits credits from a user's balance.
 * Authorised by the same INTERNAL_SERVICE_KEY the chat backend already uses
 * for the x402 bypass — this is the cheapest way to add a debit hook
 * without dragging user-side wallet signatures into the chat flow.
 *
 * Body:
 *   { address, amount, reason, ref? }
 *
 * Returns:
 *   200 → { balance: BalanceSummary }
 *   401 → invalid internal key
 *   402 → insufficient credits (with current balance + amount needed)
 *   400 → malformed request
 *
 * Intended caller chain (Week 2 wires this in):
 *   /api/chat        → debits chatCreditCost(model, tier)  before LLM call
 *   /api/x402/[tool] → debits toolCreditCost(toolId, tier) when internal flag
 *                       is "credits" instead of "free-bypass"
 */
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { spend } from "@/lib/credit-ledger";

export const runtime = "nodejs";
export const maxDuration = 15;

const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? "";

interface Body {
  address: string;
  amount:  number;
  reason:  string;
  ref?:    string;
}

export async function POST(req: NextRequest) {
  // Internal-only — never callable from the browser. Reuses the same key the
  // x402 bypass uses so there's one auth knob to rotate.
  const auth = req.headers.get("x-blue-internal") ?? req.headers.get("X-Blue-Internal");
  if (!INTERNAL_KEY || auth !== INTERNAL_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { address, amount, reason, ref } = body;
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (typeof amount !== "number" || amount <= 0 || !Number.isFinite(amount)) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  if (!reason || typeof reason !== "string" || reason.length > 80) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }

  try {
    const balance = await spend(address, Math.round(amount), reason, ref);
    return NextResponse.json({ balance }, { status: 200 });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === "INSUFFICIENT_CREDITS") {
      return NextResponse.json(
        { error: err.message, code: "INSUFFICIENT_CREDITS" },
        { status: 402 },
      );
    }
    return NextResponse.json({ error: err.message ?? "Spend failed" }, { status: 500 });
  }
}
