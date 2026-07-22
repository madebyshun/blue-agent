/**
 * Blue Hood — record a user's trade action against an arrow (T-E).
 *
 * POST body:
 *   {
 *     wallet: 0x… (required),
 *     tx_hash: 0x… (required, the SWAP tx — not the approve),
 *     side: "buy" | "sell",
 *     amount: number,
 *     denom: "USDG" | "WETH",
 *     min_out: number | null,
 *     status?: "pending" | "success" | "reverted"  (default "pending")
 *   }
 *
 * The panel calls this TWICE per swap:
 *   1. Right after the swap tx submits (status: "pending") — so the
 *      receipt shows up immediately, even if the tab closes.
 *   2. After `waitForTransactionReceipt` returns (status: "success"
 *      or "reverted") — upgrades the same entry (keyed on tx_hash).
 *
 * NO ownership verification: the wallet is a self-report. This is a
 * DISPLAY receipt, not an audit. A bad actor could spam other users'
 * addresses onto arrows, but:
 *   - they still can't hijack anyone else's UI (each user renders
 *     their OWN wallet's actions via a client-side filter),
 *   - they can't taint hit-rate (user_actions is NOT in hit-rate math).
 *
 * Rate-limited. Cap 20 actions per arrow so a malicious loop can't
 * explode the record.
 */
import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet } from "@/lib/kv";
import { kvArrow } from "@/lib/blue-hood/kv-keys";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import type { Arrow, UserAction } from "@/lib/blue-hood/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const MAX_ACTIONS_PER_ARROW = 20;

type Body = {
  wallet?: string;
  tx_hash?: string;
  side?: "buy" | "sell";
  amount?: number;
  denom?: "USDG" | "WETH";
  min_out?: number | null;
  status?: "pending" | "success" | "reverted";
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { success } = await rateLimit(getIdentifier(req), "chat");
  if (!success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await ctx.params;
  if (!id || id.length > 128) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  let body: Body = {};
  try { body = (await req.json()) as Body; } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const wallet = (body.wallet ?? "").trim().toLowerCase();
  const tx_hash = (body.tx_hash ?? "").trim().toLowerCase();
  const side: "buy" | "sell" = body.side === "sell" ? "sell" : "buy";
  const amount = Number(body.amount);
  const denom: "USDG" | "WETH" = body.denom === "WETH" ? "WETH" : "USDG";
  const min_out = body.min_out !== undefined && body.min_out !== null ? Number(body.min_out) : null;
  const status: UserAction["status"] =
    body.status === "success" || body.status === "reverted" ? body.status : "pending";

  if (!ADDR_RE.test(wallet)) return NextResponse.json({ error: "bad_wallet" }, { status: 400 });
  if (!TX_HASH_RE.test(tx_hash)) return NextResponse.json({ error: "bad_tx_hash" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "bad_amount" }, { status: 400 });

  const arrow = await kvGet<Arrow>(kvArrow(id));
  if (!arrow) return NextResponse.json({ error: "arrow_not_found" }, { status: 404 });

  const existing = arrow.user_actions ?? [];
  // Upsert on tx_hash — the "pending → success" upgrade path.
  const match = existing.findIndex((a) => a.tx_hash === tx_hash);
  const next: UserAction = {
    ts: new Date().toISOString(),
    wallet, tx_hash, side, amount, denom, min_out, status,
  };
  let updated: UserAction[];
  if (match >= 0) {
    updated = existing.map((a, i) => i === match ? { ...a, status: next.status, ts: next.ts } : a);
  } else {
    if (existing.length >= MAX_ACTIONS_PER_ARROW) {
      return NextResponse.json({ error: "arrow_at_action_cap", cap: MAX_ACTIONS_PER_ARROW }, { status: 429 });
    }
    updated = [...existing, next];
  }

  await kvSet(kvArrow(id), { ...arrow, user_actions: updated });
  console.log(`[user-action] arrow=${arrow.serial} ticker=${arrow.ticker} wallet=${wallet.slice(0, 6)}… tx=${tx_hash.slice(0, 10)}… status=${status} count=${updated.length}`);
  return NextResponse.json({ ok: true, action: next, action_count: updated.length }, { headers: { "Cache-Control": "no-store" } });
}
