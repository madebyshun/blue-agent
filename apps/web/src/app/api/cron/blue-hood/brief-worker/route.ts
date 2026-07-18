/**
 * Blue Hood — async brief-attach worker (T-D refactor).
 *
 * The reviewer's pre-prod TODO: A4 brief fetch was blocking `fireArrow`
 * for 5-15s per arrow. This cron drains the `bh:brief:queue` written by
 * the (now-fast) fire path.
 *
 * Per invocation:
 *   1. Pop up to `BH_BRIEF_BATCH` (default 8) ids off the queue FIFO.
 *   2. For each id: load the arrow → fetch A4 brief → merge → persist.
 *   3. After brief attach (success OR failure), write the chat card and
 *      run the push fan-out — both wait so the notification body includes
 *      the final headline.
 *   4. Log a one-line `[brief-worker]` summary. Never throws — a bad row
 *      goes back into `errored[]` but the cron always returns 200 so
 *      Vercel doesn't flag the schedule.
 *
 * Cadence: every 1 min. The poller runs every 2 min and can fire 0-3
 * arrows/cycle in practice; 8-batch × 1-min gives 4-8× headroom.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` — same pattern as the
 * other Blue Hood crons.
 */
import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet } from "@/lib/kv";
import { KV_BRIEF_QUEUE, kvArrow } from "@/lib/blue-hood/kv-keys";
import { fetchArrowBrief } from "@/lib/blue-hood/brief";
import { pushArrowToAll } from "@/lib/blue-hood/push";
import { writeChatCard } from "@/lib/blue-hood/chat-card";
import type { Arrow } from "@/lib/blue-hood/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const BATCH = Math.max(1, Math.min(20, Number(process.env.BH_BRIEF_BATCH ?? "8")));

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return process.env.NODE_ENV !== "production";
  const authHeader = req.headers.get("authorization") ?? "";
  const secretParam = new URL(req.url).searchParams.get("secret") ?? "";
  return authHeader === `Bearer ${CRON_SECRET}` || secretParam === CRON_SECRET;
}

interface WorkerRowResult {
  arrow_id: string;
  serial?: string;
  ticker?: string;
  status: "attached" | "failed" | "skipped_missing" | "skipped_already_done";
  llm_chain?: string;
  push_delivered?: number;
  push_gone?: number;
}

async function processOne(id: string): Promise<WorkerRowResult> {
  const arrow = await kvGet<Arrow>(kvArrow(id));
  if (!arrow) {
    console.warn(`[brief-worker] arrow ${id} vanished from KV — dropping`);
    return { arrow_id: id, status: "skipped_missing" };
  }
  // Idempotency: if a previous invocation already attached, skip.
  if (arrow.brief_status === "attached" || arrow.brief_status === "skipped") {
    return {
      arrow_id: id,
      serial: arrow.serial,
      ticker: arrow.ticker,
      status: "skipped_already_done",
    };
  }
  const workerAt = new Date().toISOString();

  // Attempt brief. `fetchArrowBrief` never throws by contract — it
  // returns null on failure — but wrap in try just in case.
  let brief: Awaited<ReturnType<typeof fetchArrowBrief>> = null;
  try {
    brief = await fetchArrowBrief(arrow.ticker);
  } catch (e) {
    console.warn(`[brief-worker] fetch crashed for ${arrow.serial} ${arrow.ticker}: ${(e as Error).message}`);
  }

  const finalStatus: Arrow["brief_status"] = brief ? "attached" : "failed";
  const enriched: Arrow = {
    ...arrow,
    brief: brief ?? null,
    brief_status: finalStatus,
    brief_worker_at: workerAt,
  };
  await kvSet(kvArrow(id), enriched);

  const chainStr = brief
    ? (brief.llm_attempts.map((a) => `${a.provider}:${a.status}`).join("→") || "n/a")
    : "n/a";
  console.log(
    `[brief-worker] arrow=${enriched.serial} ticker=${enriched.ticker}` +
      ` status=${finalStatus} llm=${brief?.llm_provider ?? "null"}` +
      ` chain=${chainStr} note_len=${brief?.verdict_note.length ?? 0}`,
  );

  // Chat card ALWAYS written (even on brief failure) — the card carries
  // an empty headline and the chat renderer will fall through to the
  // ticker/signal tag. Best-effort; swallow errors internally.
  await writeChatCard(enriched);

  // Push fan-out — only engine origin. Guarded twice: skipAsync arrows
  // never get here, and engine-vs-seeded is re-checked inside
  // `pushArrowToAll` for defense-in-depth.
  let deliveryStats: { delivered: number; gone: number } = { delivered: 0, gone: 0 };
  if (enriched.origin === "engine") {
    try {
      const stats = await pushArrowToAll(enriched);
      deliveryStats = { delivered: stats.delivered, gone: stats.gone };
    } catch (e) {
      console.warn(`[brief-worker] push fan-out crashed for ${enriched.serial}: ${(e as Error).message}`);
    }
  }

  return {
    arrow_id: id,
    serial: enriched.serial,
    ticker: enriched.ticker,
    status: finalStatus,
    llm_chain: chainStr,
    push_delivered: deliveryStats.delivered,
    push_gone: deliveryStats.gone,
  };
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();

  // Atomically pop the head of the queue: read → slice → write remainder.
  // Under Vercel serverless we don't have true CAS, but with 1-min
  // cadence + 1 cron instance this races only under manual concurrent
  // POSTs; a re-processed id short-circuits at the idempotency check.
  const queue = (await kvGet<string[]>(KV_BRIEF_QUEUE)) ?? [];
  if (queue.length === 0) {
    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - started,
      queue_len_before: 0,
      queue_len_after: 0,
      processed: 0,
      per_arrow: [],
    });
  }
  const batchIds = queue.slice(0, BATCH);
  const remainder = queue.slice(BATCH);
  await kvSet(KV_BRIEF_QUEUE, remainder);

  console.log(`[brief-worker] pop batch=${batchIds.length} queue_after=${remainder.length}`);

  // Sequential — A4 upstreams (Virtuals/Venice/Bankr) are rate-limited
  // per-key; parallel would just serialize on their side and cost more
  // in retries. 8 × ~4s ≈ 32s wall time, well under maxDuration=120.
  const per_arrow: WorkerRowResult[] = [];
  for (const id of batchIds) {
    try {
      per_arrow.push(await processOne(id));
    } catch (e) {
      console.warn(`[brief-worker] processOne crashed for ${id}: ${(e as Error).message}`);
      per_arrow.push({ arrow_id: id, status: "failed" });
    }
  }

  const attached = per_arrow.filter((r) => r.status === "attached").length;
  const failed = per_arrow.filter((r) => r.status === "failed").length;
  const skipped = per_arrow.filter((r) => r.status.startsWith("skipped")).length;
  console.log(
    `[brief-worker] done duration_ms=${Date.now() - started}` +
      ` attached=${attached} failed=${failed} skipped=${skipped}` +
      ` queue_after=${remainder.length}`,
  );

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - started,
    queue_len_before: queue.length,
    queue_len_after: remainder.length,
    processed: per_arrow.length,
    attached,
    failed,
    skipped,
    per_arrow,
  });
}

export const POST = handle;
export const GET = handle;
