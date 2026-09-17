/**
 * POST /api/dca/cancel
 *
 * Body: { scheduleId, userAddress }
 * Marks the schedule as cancelled + removes it from the active set (cron queue).
 * The user's on-chain approve() is untouched — user can revoke via a plain
 * `approve(keeper, 0)` tx if they want to zero the allowance.
 *
 * v1 auth: caller must pass the same userAddress that owns the schedule.
 * This is the same weak-auth model as the DCA card itself (we trust the wallet
 * signature happens client-side; a full SIWE guard is TODO for v2).
 */

import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { kvGet, kvSetOrThrow, kvMutate } from "@/lib/kv";
import { dcaKeys } from "@/lib/dca/kv-keys";
import type { DcaSchedule } from "@/lib/dca/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { scheduleId?: string; userAddress?: string } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const scheduleId  = String(body.scheduleId ?? "").trim();
  const userAddress = String(body.userAddress ?? "").trim();
  if (!scheduleId) {
    return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
  }
  if (!isAddress(userAddress)) {
    return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
  }

  const schedule = await kvGet<DcaSchedule>(dcaKeys.schedule(scheduleId));
  if (!schedule) {
    return NextResponse.json({ error: "schedule not found" }, { status: 404 });
  }
  if (schedule.userAddress.toLowerCase() !== userAddress.toLowerCase()) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }
  if (schedule.status === "cancelled") {
    return NextResponse.json({ ok: true, alreadyCancelled: true });
  }

  // The blob is what actually stops the spend: the executor re-reads it and
  // bails on `status !== "active"` before it touches the keeper. So this write
  // must NOT be best-effort — `kvSet` swallows its own failure, which would let
  // us answer "cancelled" while the cron keeps spending the user's USDC on the
  // schedule they just stopped. Let it throw and say so instead.
  const updated: DcaSchedule = { ...schedule, status: "cancelled" };
  try {
    await kvSetOrThrow(dcaKeys.schedule(scheduleId), updated);
  } catch (e) {
    console.error(`[dca:cancel] ${scheduleId} NOT cancelled — blob write failed: ${(e as Error).message}`);
    return NextResponse.json({
      error: "storage unavailable — the schedule is still ACTIVE and will keep running. Please retry.",
    }, { status: 503 });
  }

  // De-queue from the cron work list. ⚠ #150: the old shape read the active set
  // with `(await kvGet(...)) ?? []` and wrote the filtered result straight back
  // to the SAME key — so a single throttled read turned one user's cancel into
  // `kvSet(activeSet, [])`, silently de-queueing EVERY user's recurring buy.
  //
  // Unlike the create path this one is genuinely allowed to skip: the queue is
  // only a work hint, and `processSchedule` re-reads the blob and returns
  // `removed` for a non-active status, so a stale id costs one KV read per tick
  // and never spends anything. Cancel is therefore still `ok` on a skip — the
  // cancellation itself landed above — but the skip is logged, not silent.
  const dequeued = await kvMutate<string[]>(
    dcaKeys.activeSet(), [],
    (cur) => (cur.includes(scheduleId) ? cur.filter((id) => id !== scheduleId) : null),
  );
  if (dequeued === "skipped" || dequeued === "failed") {
    console.error(`[dca:cancel] ${scheduleId} cancelled but NOT de-queued (${dequeued}) — the executor will drop it on status instead`);
  }

  return NextResponse.json({ ok: true, scheduleId });
}
