/**
 * /api/devices — the wallet's linked BlueBots (SIWE).
 *   GET               → [{ id, name, kind, createdAt, expiresAt, scopes? }]
 *   DELETE ?id=…      → unlink one (its token stops working immediately)
 */
import { NextResponse, type NextRequest } from "next/server";
import { listDevices, revokeDevice } from "@/lib/devices";
import { NO_STORE, requireSessionWallet } from "@/lib/device-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSessionWallet(req);
  if ("res" in auth) return auth.res;
  const list = await listDevices(auth.wallet);
  if (list == null) return NextResponse.json({ error: "Could not read your devices right now." }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ devices: list.map(({ hash: _hash, ...d }) => d) }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSessionWallet(req);
  if ("res" in auth) return auth.res;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f]{16}$/.test(id)) return NextResponse.json({ error: "Unknown device." }, { status: 400, headers: NO_STORE });
  const r = await revokeDevice(auth.wallet, id);
  if (r === "unavailable") return NextResponse.json({ error: "Could not unlink right now." }, { status: 503, headers: NO_STORE });
  if (r === "not_found") return NextResponse.json({ error: "Unknown device." }, { status: 404, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
