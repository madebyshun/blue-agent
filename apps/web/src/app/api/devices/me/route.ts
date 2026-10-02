/**
 * GET /api/devices/me — what this linked BlueBot is allowed to do, for whom.
 *   → { wallet, device: { id, name, kind, expiresAt }, scopes, chat: { cap, spent, remaining } | null }
 *
 * The full wallet address is returned (the feed shortens it): a linked Mac
 * needs it to quote a swap and read balances, and a wallet address is public
 * on-chain anyway. `chat.spent` is null when the counter could not be read —
 * never shown as 0.
 */
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { deviceScopes, deviceSpentToday, hasScope } from "@/lib/devices";
import { NO_STORE, requireDevice } from "@/lib/device-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireDevice(req);
  if ("res" in auth) return auth.res;
  const d = auth.device;
  const rl = await rateLimit(`device:${d.id}`, "device");
  if (!rl.success) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: NO_STORE });
  let chat: { cap: number; spent: number | null; remaining: number | null } | null = null;
  if (hasScope(d, "chat")) {
    const cap = d.chatDailyCap ?? 0;
    const spent = await deviceSpentToday(d.id);
    chat = { cap, spent, remaining: spent == null ? null : Math.max(0, cap - spent) };
  }
  return NextResponse.json({
    wallet: d.wallet,
    device: { id: d.id, name: d.name, kind: d.kind, expiresAt: d.expiresAt },
    scopes: deviceScopes(d),
    chat,
  }, { headers: NO_STORE });
}
