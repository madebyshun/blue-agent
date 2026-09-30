/**
 * /api/actions — the signed-in wallet's own action records (G1, 2026-09-30).
 *
 * GET  → { ok, actions } newest first; pending ones are settled against the
 *        chain on the way out (lib/actions.ts refreshSubmitted).
 * POST { kind, chain, source?, params, quote?, check?, tx_hash? } → create one.
 *
 * Both need the SIWE session and act only for its wallet (lib/acting-wallet):
 * a record is private to the wallet it describes (plan §7 #15), and only
 * aggregates are ever published. The one mutation that does NOT need a
 * session — attaching a transaction — lives at /api/actions/[id]/tx, because
 * there the chain itself proves who sent it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveActingWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { attachTx, createAction, listActions, type ActionKind, type ActionSource } from "@/lib/actions";
import { parseTxChain } from "@/lib/tx-chains";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const KINDS = new Set<ActionKind>(["swap", "send", "bridge"]);
// "mcp" is not accepted from a client: only the MCP builders (server side)
// create agent records, and a browser claiming the label would inflate the
// agent count the public meter reports.
const SOURCES = new Set<ActionSource>(["chat", "wallet", "hood"]);

/** Keep only flat, short scalars — a record is a receipt, not a data dump. */
function flatParams(v: unknown): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 12)) {
    if (!/^[a-zA-Z_]{1,32}$/.test(k)) continue;
    if (typeof x === "number" && Number.isFinite(x)) out[k] = x;
    else if (typeof x === "string") out[k] = x.slice(0, 120);
    else if (x === null) out[k] = null;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const acting = await resolveActingWallet(req, new URL(req.url).searchParams.get("address"));
  if (acting.status !== "ok") return actingWalletRefusal(acting);
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  const list = await listActions(acting.wallet, Number.isFinite(limit) ? limit : 50);
  if (list.status === "unavailable") {
    return NextResponse.json(
      { ok: false, error: "storage unavailable — could not read your actions. This is NOT the same as having none." },
      { status: 503, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, actions: list.actions }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const acting = await resolveActingWallet(req, typeof body.address === "string" ? body.address : undefined);
  if (acting.status !== "ok") return actingWalletRefusal(acting);

  const rl = await rateLimit(`actions:${acting.wallet}`, "hub"); // 20/min
  if (!rl.success) return NextResponse.json({ error: "too many actions — slow down" }, { status: 429 });

  const kind = body.kind as ActionKind;
  const chain = parseTxChain(body.chain);
  if (!KINDS.has(kind)) return NextResponse.json({ error: "kind must be swap, send or bridge" }, { status: 400 });
  if (!chain) return NextResponse.json({ error: "chain must be base or robinhood" }, { status: 400 });
  const source = SOURCES.has(body.source as ActionSource) ? (body.source as ActionSource) : "wallet";

  const quoteIn = (body.quote ?? null) as Record<string, unknown> | null;
  const checkIn = (body.check ?? null) as { verdict?: unknown; reasons?: unknown } | null;
  try {
    const rec = await createAction({
      wallet: acting.wallet,
      kind, chain, source,
      params: flatParams(body.params),
      quote: quoteIn ? {
        expected_out: typeof quoteIn.expected_out === "string" ? quoteIn.expected_out.slice(0, 64) : null,
        min_out: typeof quoteIn.min_out === "string" ? quoteIn.min_out.slice(0, 64) : null,
        venue: typeof quoteIn.venue === "string" ? quoteIn.venue.slice(0, 40) : null,
      } : undefined,
      check: checkIn && typeof checkIn.verdict === "string"
        ? { verdict: checkIn.verdict.slice(0, 16), reasons: Array.isArray(checkIn.reasons) ? checkIn.reasons.filter((r): r is string => typeof r === "string").slice(0, 8).map((r) => r.slice(0, 200)) : [] }
        : null,
    });
    if (typeof body.tx_hash === "string") {
      const att = await attachTx(rec.id, body.tx_hash);
      if (att.ok) return NextResponse.json({ ok: true, action: att.record }, { headers: NO_STORE });
      return NextResponse.json({ ok: true, action: rec, tx_attach: { code: att.code, message: att.message } }, { headers: NO_STORE });
    }
    return NextResponse.json({ ok: true, action: rec }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: "could not save the action — nothing was recorded", detail: (e as Error).message }, { status: 503 });
  }
}
