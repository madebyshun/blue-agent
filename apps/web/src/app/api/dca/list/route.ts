/**
 * GET /api/dca/list?address=0x…
 *
 * List all DCA schedules for a user. Public read — no auth required because
 * schedules leak nothing sensitive.
 *
 * `keeperAddress` IS returned since 2026-09-30, when recurring buys were
 * retired. It used to be stripped as if it were secret; it is not — it is the
 * spender of the user's own approve(), visible to anyone in that transaction.
 * It is also the one thing the user needs to REVOKE that approval, and the
 * retired DcaCard's exit (approve(keeper, 0)) reads it from here, so the exit
 * keeps working after KEEPER_MASTER_KEY is unset. The key itself never leaves
 * the server and is not derived here.
 */

import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { kvGet, kvGetProbe } from "@/lib/kv";
import { dcaKeys } from "@/lib/dca/kv-keys";
import type { DcaSchedule } from "@/lib/dca/types";

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
  const views: DcaSchedule[] = schedules.filter((s): s is DcaSchedule => s !== null);

  return NextResponse.json({ ok: true, schedules: views });
}
