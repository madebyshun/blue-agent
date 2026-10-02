/**
 * GET /api/devices/me — what this linked BlueBot is allowed to do, for whom.
 *   → { wallet, device: { id, name, kind, expiresAt }, scopes }
 *
 * The full wallet address is returned (the feed shortens it): a linked Mac
 * needs it to read the wallet's credit balance, and a wallet address is
 * public on-chain anyway. Chat has no per-device cap: the wallet's own credit
 * balance (public at /api/credits/balance/<wallet>) is the limit.
 */
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { deviceScopes } from "@/lib/devices";
import { NO_STORE, requireDevice } from "@/lib/device-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireDevice(req);
  if ("res" in auth) return auth.res;
  const d = auth.device;
  const rl = await rateLimit(`device:${d.id}`, "device");
  if (!rl.success) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: NO_STORE });
  return NextResponse.json({
    wallet: d.wallet,
    device: { id: d.id, name: d.name, kind: d.kind, expiresAt: d.expiresAt },
    scopes: deviceScopes(d),
  }, { headers: NO_STORE });
}
