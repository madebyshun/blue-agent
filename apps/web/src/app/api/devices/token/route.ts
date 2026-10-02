/**
 * POST /api/devices/token { device_code } — step 3: the device polls until the
 * person approves, then receives its read-only token ONCE (lib/devices.ts).
 * Error shape follows RFC 8628: authorization_pending / expired_token.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getIdentifier, rateLimit } from "@/lib/rate-limit";
import { FEED_POLL_S, TOKEN_TTL_S, pollForToken } from "@/lib/devices";
import { NO_STORE } from "@/lib/device-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = await rateLimit(getIdentifier(req), "api");
  if (!rl.success) return NextResponse.json({ error: "slow_down" }, { status: 429, headers: NO_STORE });
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE }); }
  const r = await pollForToken(typeof b.device_code === "string" ? b.device_code : "");
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status, headers: NO_STORE });
  if (r.status === "pending") return NextResponse.json({ error: "authorization_pending" }, { status: 400, headers: NO_STORE });
  if (r.status === "expired") return NextResponse.json({ error: "expired_token" }, { status: 400, headers: NO_STORE });
  return NextResponse.json({
    access_token: r.token,
    token_type: "Bearer",
    expires_in: TOKEN_TTL_S,
    scope: "read:timeline",
    device: { id: r.device.id, name: r.device.name, kind: r.device.kind },
    feed_poll_s: FEED_POLL_S,
  }, { headers: NO_STORE });
}
