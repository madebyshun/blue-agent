/**
 * POST /api/pretrade-check { chain, kind, token, bridge_cost_percent? } → the
 * G2 pre-trade check (lib/pre-trade-check.ts) for the swap/send/bridge cards.
 *
 * A public read: it reveals nothing about any wallet — only facts about a
 * token or a bridge quote — and it spends no credits. Rate-limited per caller
 * because a token check reads the chain — in its OWN `pretrade` bucket, never
 * the shared `api` one: unrelated traffic from the same IP must not be able to
 * throttle the check the cards gate signing on (and a 429 here holds signing,
 * it does not clear it — see components/wallet/PreTradeBanner.tsx). Its one write is the public meter's
 * set of tokens refused on evidence (lib/action-stats.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { preTradeCheck } from "@/lib/pre-trade-check";
import { recordPreTradeBlock } from "@/lib/action-stats";
import { parseTxChain } from "@/lib/tx-chains";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = await rateLimit(getIdentifier(req), "pretrade");
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const chain = parseTxChain(body.chain);
  const kind = body.kind === "send" || body.kind === "bridge" ? body.kind : body.kind === "swap" ? "swap" : null;
  if (!chain) return NextResponse.json({ error: "chain must be base or robinhood" }, { status: 400 });
  if (!kind) return NextResponse.json({ error: "kind must be swap, send or bridge" }, { status: 400 });
  const token = typeof body.token === "string" ? body.token : "";
  const check = await preTradeCheck({
    chain,
    kind,
    token,
    bridgeCostPercent: typeof body.bridge_cost_percent === "number" ? body.bridge_cost_percent : null,
  });
  // The public meter (G4) counts only what this server measured: a token
  // refused on evidence (lib/action-stats.ts).
  await recordPreTradeBlock(check, { chain, token });
  return NextResponse.json(check, { headers: { "Cache-Control": "no-store" } });
}
