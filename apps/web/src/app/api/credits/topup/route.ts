/**
 * POST /api/credits/topup
 *
 * Internal-only admin endpoint to credit an address's ledger (KV `topup`).
 * Same INTERNAL_SERVICE_KEY gate as /api/credits/spend. Used to:
 *   - pre-seed the CRON_WALLET service identity so scheduled tasks can pay for
 *     their tool calls,
 *   - grant promo / support credits.
 *
 * These are off-chain ledger credits (not USDC) — minting here is free; gate
 * it carefully.
 *
 * Body: { address, credits, reason? }
 */
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { topup } from "@/lib/credit-ledger";

export const runtime = "nodejs";
export const maxDuration = 15;

const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? "";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("x-blue-internal") ?? req.headers.get("X-Blue-Internal");
  if (!INTERNAL_KEY || auth !== INTERNAL_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { address?: string; credits?: number; reason?: string };
  try {
    body = (await req.json()) as { address?: string; credits?: number; reason?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { address, credits, reason } = body;
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (typeof credits !== "number" || credits <= 0 || !Number.isFinite(credits)) {
    return NextResponse.json({ error: "Invalid credits" }, { status: 400 });
  }

  const balance = await topup(address, Math.round(credits), reason ?? "admin-topup");
  return NextResponse.json({ balance });
}
