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
import { kvGetProbe } from "@/lib/kv";
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
  if (index.status === "error") return unreadable();
  const ids = index.status === "hit" ? index.value : [];

  // The same rule, one level down. Each record used to be read with `kvGet`,
  // which turns a throw into null — and nulls were then filtered out as if the
  // record did not exist. So an index read that succeeded followed by record
  // reads that were throttled (the usual Upstash cap shape: some commands pass,
  // later ones fail) answered `ok: true, schedules: []`, and DcaCard — the only
  // exit left for a live `approve(keeper, total)` — told the user "No
  // recurring-buy approval found" while the allowance stayed spendable.
  //
  // Only a genuine MISS is dropped (an id whose record was deleted). One
  // unreadable record fails the whole answer rather than returning the rest:
  // the card renders an ok list as complete, and a revoke screen that is
  // silently short is the same lie as an empty one.
  const reads = await Promise.all(
    ids.map((id) => kvGetProbe<DcaSchedule>(dcaKeys.schedule(id))),
  );
  if (reads.some((r) => r.status === "error")) return unreadable();
  const views: DcaSchedule[] = reads.flatMap((r) => (r.status === "hit" ? [r.value] : []));

  return NextResponse.json({ ok: true, schedules: views });
}

function unreadable() {
  return NextResponse.json({
    ok: false,
    error: "storage unavailable — could not read your schedules. This is NOT the same as having none.",
  }, { status: 503 });
}
