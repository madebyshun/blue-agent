/**
 * GET /api/dca/logs?scheduleId=…&userAddress=…
 *
 * Returns the DcaExecutionLog ring buffer (last 50 runs) for one schedule.
 * Includes txHash, boughtAmount, sellAmount, effectivePrice, error.
 *
 * Auth: caller must pass the same userAddress that owns the schedule —
 * same weak-auth model as /api/dca/cancel. Logs are otherwise public (all
 * data derivable from on-chain txs anyway), but gating avoids random
 * schedule-id enumeration returning info about other users' activity.
 */

import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { kvGet, kvGetProbe } from "@/lib/kv";
import { dcaKeys } from "@/lib/dca/kv-keys";
import type { DcaSchedule, DcaExecutionLog } from "@/lib/dca/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const scheduleId  = (u.searchParams.get("scheduleId")  ?? "").trim();
  const userAddress = (u.searchParams.get("userAddress") ?? "").trim();
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

  // #150 read side. `?? []` here produced a self-contradicting receipt page:
  // `runsCompleted: 5` from the blob next to `logs: []` from the failed read,
  // which reads as "your run history was deleted" rather than "we could not
  // reach storage". Two different facts, so they get two different answers.
  const buffer = await kvGetProbe<DcaExecutionLog[]>(dcaKeys.logs(scheduleId));
  if (buffer.status === "error") {
    return NextResponse.json({
      ok: false,
      scheduleId,
      status: schedule.status,
      runsCompleted: schedule.runsCompleted,
      runsFailed:    schedule.runsFailed,
      error: "storage unavailable — could not read the run log. Your runs are NOT lost; this read failed.",
    }, { status: 503 });
  }
  const logs = buffer.status === "hit" ? buffer.value : [];

  return NextResponse.json({
    ok: true,
    scheduleId,
    status: schedule.status,
    runsCompleted: schedule.runsCompleted,
    runsFailed:    schedule.runsFailed,
    totalSpent:    schedule.totalSpent,
    totalBought:   schedule.totalBought,
    lastRunAt:     schedule.lastRunAt,
    nextRunAt:     schedule.nextRunAt,
    lastError:     schedule.lastError,
    logs,
  });
}
