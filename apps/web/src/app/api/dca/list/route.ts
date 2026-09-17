/**
 * GET /api/dca/list?address=0x…
 *
 * List all DCA schedules for a user. Returns a lightweight view (no keeper key).
 * Public read — no auth required because schedules leak nothing sensitive
 * (keeperAddress is trivially recoverable given the user's address by
 * anyone who has KEEPER_MASTER_KEY, which only the server does).
 */

import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { kvGet, kvGetProbe } from "@/lib/kv";
import { dcaKeys } from "@/lib/dca/kv-keys";
import type { DcaSchedule, DcaScheduleView } from "@/lib/dca/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const address = u.searchParams.get("address") ?? "";
  if (!isAddress(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  // #150 read side. `?? []` rendered a KV outage as `schedules: []`, which reads
  // as the fact "you have no recurring buys" — on a surface whose whole job is
  // to tell the user what is currently spending their money. "We could not
  // check" is a different answer and has to be sayable.
  const index = await kvGetProbe<string[]>(dcaKeys.userIndex(address));
  if (index.status === "error") {
    return NextResponse.json({
      ok: false,
      error: "storage unavailable — could not read your schedules. This is NOT the same as having none.",
    }, { status: 503 });
  }
  const ids = index.status === "hit" ? index.value : [];

  const schedules = await Promise.all(
    ids.map((id) => kvGet<DcaSchedule>(dcaKeys.schedule(id))),
  );
  const views: DcaScheduleView[] = schedules
    .filter((s): s is DcaSchedule => s !== null)
    .map(({ keeperAddress: _hidden, ...rest }) => rest);

  return NextResponse.json({ ok: true, schedules: views });
}
