/**
 * POST /api/devices/code { name?, kind: "mac" | "bot" } — step 1 of linking a
 * BlueBot (lib/devices.ts). No auth: the device has nothing to prove yet.
 * Returns the code to SHOW and the secret to POLL with.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getIdentifier, rateLimit } from "@/lib/rate-limit";
import { CODE_TTL_S, DEVICE_KINDS, TOKEN_POLL_S, cleanDeviceName, startDeviceLink, type DeviceKind } from "@/lib/devices";
import { NO_STORE } from "@/lib/device-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LINK_URL = "https://app.blueagent.dev/link";

export async function POST(req: NextRequest) {
  const rl = await rateLimit(getIdentifier(req), "device");
  if (!rl.success) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: NO_STORE });
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* an empty body is fine */ }
  const kind: DeviceKind = DEVICE_KINDS.includes(b.kind as DeviceKind) ? (b.kind as DeviceKind) : "mac";
  const r = await startDeviceLink(cleanDeviceName(b.name, kind), kind);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status, headers: NO_STORE });
  return NextResponse.json({
    user_code: r.userCode,
    device_code: r.deviceCode,
    verification_uri: LINK_URL,
    verification_uri_complete: `${LINK_URL}?code=${r.userCode}`,
    expires_in: CODE_TTL_S,
    interval: TOKEN_POLL_S,
  }, { headers: NO_STORE });
}
