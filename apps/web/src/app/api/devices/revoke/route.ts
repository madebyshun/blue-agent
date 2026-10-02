/**
 * POST /api/devices/revoke — a linked BlueBot unlinks ITSELF ("Sign out" in
 * the app). Bearer token; afterwards that token reads nothing.
 */
import { NextResponse, type NextRequest } from "next/server";
import { revokePresentedToken } from "@/lib/devices";
import { NO_STORE } from "@/lib/device-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const r = await revokePresentedToken(req.headers.get("authorization"));
  if (r === "unavailable") return NextResponse.json({ error: "Could not unlink right now." }, { status: 503, headers: NO_STORE });
  if (r === "invalid") return NextResponse.json({ error: "This device is not linked.", code: "DEVICE_UNLINKED" }, { status: 401, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
