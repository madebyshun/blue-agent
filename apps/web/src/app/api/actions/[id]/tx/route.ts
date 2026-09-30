/**
 * POST /api/actions/[id]/tx  { tx_hash } — attach the transaction that carried
 * out an action (G1, 2026-09-30).
 *
 * No session required, on purpose: an agent that built the trade through MCP
 * has no browser session, and the proof here is stronger than one — the chain
 * must show the ACTION'S wallet sent that transaction (tx.from, or an
 * EntryPoint UserOperationEvent naming it as sender; see lib/actions.ts). A
 * hash nobody can yet verify is held as `submitted` and settled on the owner's
 * next read; one sent by any other wallet is refused (or dropped on settle).
 */
import { NextResponse, type NextRequest } from "next/server";
import { attachTx } from "@/lib/actions";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  NOT_FOUND: 404, UNAVAILABLE: 503, NOT_SENT_BY_WALLET: 403, NOT_THIS_ACTION: 422, ALREADY_ATTACHED: 409, BAD_HASH: 400, NOT_MINED: 202,
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = await rateLimit(getIdentifier(req), "hub");
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { id } = await params;
  let body: { tx_hash?: unknown } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const res = await attachTx(id, typeof body.tx_hash === "string" ? body.tx_hash : "");
  if (res.ok) return NextResponse.json({ ok: true, action: res.record });
  return NextResponse.json({ ok: false, code: res.code, error: res.message }, { status: STATUS[res.code] ?? 400 });
}
