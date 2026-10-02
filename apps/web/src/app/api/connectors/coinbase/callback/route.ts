/**
 * GET /api/connectors/coinbase/callback — Coinbase sends the person back here
 * with `code` + `state`. The state is single-use and must belong to the wallet
 * whose session arrives with this request (lib/connectors/coinbase.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/session";
import { finishAuth } from "@/lib/connectors/coinbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${u.origin}/app/connectors?coinbase=${q}`, 302);
  if (u.searchParams.get("error")) return back("denied");
  const code = u.searchParams.get("code") ?? "", state = u.searchParams.get("state") ?? "";
  if (!code || !/^[A-Za-z0-9_-]{16,64}$/.test(state)) return back("failed");
  const s = await readSession(req);
  if (s.status !== "active") return back("signin");
  const r = await finishAuth(code, state, s.wallet);
  return back(r.ok ? "connected" : r.reason === "wallet" ? "wallet" : r.reason === "config" ? "unavailable" : "failed");
}
