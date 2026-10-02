/**
 * Route helpers for /api/devices/* — the SIWE side (the person managing their
 * linked devices on the web) and the token side (a linked device reading).
 * They never cross: a device token is not a session, and a session is not a
 * device token (see the header of lib/devices.ts). A route that honours a
 * device token names the SCOPE it needs (`requireDevice(req, "chat")`).
 */
import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/session";
import { hasScope, readDeviceToken, type DeviceRecord, type DeviceScope } from "@/lib/devices";

export const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

export async function requireSessionWallet(req: NextRequest): Promise<{ wallet: string } | { res: NextResponse }> {
  const s = await readSession(req);
  if (s.status === "unavailable") return { res: NextResponse.json({ error: "Could not verify your session right now." }, { status: 503, headers: NO_STORE }) };
  if (s.status === "anonymous") return { res: NextResponse.json({ error: "Sign in with your wallet first.", code: "AUTH_REQUIRED" }, { status: 401, headers: NO_STORE }) };
  return { wallet: s.wallet.toLowerCase() };
}

export async function requireDevice(req: NextRequest | Request, scope: DeviceScope = "read"): Promise<{ device: DeviceRecord } | { res: NextResponse }> {
  const t = await readDeviceToken(req.headers.get("authorization"));
  if (t.status === "unavailable") return { res: NextResponse.json({ error: "Try again shortly." }, { status: 503, headers: NO_STORE }) };
  if (t.status === "invalid") return { res: NextResponse.json({ error: "This device is not linked, or its link was removed. Link it again.", code: "DEVICE_UNLINKED" }, { status: 401, headers: NO_STORE }) };
  if (!hasScope(t.device, scope)) {
    const what = scope === "chat" ? "chat" : scope === "alerts" ? "change alerts" : scope;
    return { res: NextResponse.json({ error: `This link can't ${what}. Link BlueBot again and allow it on app.blueagent.dev/link.`, code: "DEVICE_SCOPE", scope }, { status: 403, headers: NO_STORE }) };
  }
  return { device: t.device };
}

/** True when the request carries a device token at all (Bearer bbt_…), so a
 *  route that accepts both can pick the device path without guessing. */
export const presentsDeviceToken = (req: NextRequest | Request) => /^Bearer\s+bbt_/i.test(req.headers.get("authorization") ?? "");
