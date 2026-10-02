/**
 * /api/devices/approve — step 2, the person on app.blueagent.dev/link (SIWE).
 *   GET  ?code=XXXX-XXXX → which device is asking (name, kind, age)
 *   POST { code, scopes? } → approve it for THIS session's wallet, with the
 *        scopes the person ticked (lib/devices.ts cleanGrant: `read` always,
 *        `chat`/`alerts` only if asked)
 */
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { approveCode, cleanGrant, lookupCode, normalizeUserCode } from "@/lib/devices";
import { NO_STORE, requireSessionWallet } from "@/lib/device-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BAD_CODE = NextResponse.json({ error: "Enter the 8-character code shown on your device." }, { status: 400, headers: NO_STORE });

export async function GET(req: NextRequest) {
  const auth = await requireSessionWallet(req);
  if ("res" in auth) return auth.res;
  const rl = await rateLimit(auth.wallet, "device");
  if (!rl.success) return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429, headers: NO_STORE });
  const code = normalizeUserCode(new URL(req.url).searchParams.get("code"));
  if (!code) return BAD_CODE;
  const r = await lookupCode(code);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status, headers: NO_STORE });
  return NextResponse.json({ code, ...r }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const auth = await requireSessionWallet(req);
  if ("res" in auth) return auth.res;
  const rl = await rateLimit(auth.wallet, "device");
  if (!rl.success) return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429, headers: NO_STORE });
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return BAD_CODE; }
  const code = normalizeUserCode(b.code);
  if (!code) return BAD_CODE;
  const r = await approveCode(code, auth.wallet, cleanGrant(b.scopes));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status, headers: NO_STORE });
  return NextResponse.json({ ok: true, name: r.name }, { headers: NO_STORE });
}
