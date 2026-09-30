/**
 * /api/dca/list under a throttled KV — the read behind the ONLY exit left for a
 * live recurring-buy allowance.
 *
 * Run: `npx tsx scripts/dca-list-kv-test.ts` from `apps/web/`.
 * Hermetic: the in-memory KV fallback, a swapped `kv.get`, the real route GET.
 *
 * Recurring buys were retired on 2026-09-30, but a user who approved a keeper
 * earlier still holds `approve(keeper, total)` on Base, spendable by a key the
 * server holds until the manual sweep. DcaCard revokes it, and it builds its
 * list from this route alone. The card's header promises "an unread allowance
 * is never shown as zero"; this suite pins the half of that promise the route
 * owns — WE COULD NOT READ YOUR SCHEDULES and YOU HAVE NONE must not share an
 * answer.
 *
 * The index read was already a probe (503 on error). The record reads were
 * `kvGet`, which converts a throw into null, and the nulls were filtered out as
 * missing records. So "index read OK, record reads throttled" — the ordinary
 * Upstash cap shape, where early commands pass and later ones fail — answered
 * `ok: true, schedules: []`, and the card said "No recurring-buy approval
 * found for this wallet."
 *
 * Every case is a triple, as in hub-dashboard-kv-test.ts:
 *   ·A CONTROL — the OLD read, reimplemented inline, asserted to LIE under the
 *                fault. If it stops lying, the fix below protects nothing.
 *   ·B FIX     — the REAL route GET, same fault, asserted to refuse (503).
 *   ·C HAPPY   — healthy KV, asserted to return the real schedules, and a
 *                genuinely deleted record still dropped. "Always 503" would
 *                pass A and B and be a worse product than the bug.
 */

import { kv, kvGet, kvSet } from "../src/lib/kv";
import { dcaKeys } from "../src/lib/dca/kv-keys";
import type { DcaSchedule } from "../src/lib/dca/types";
import { GET } from "../src/app/api/dca/list/route";

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`${pass ? "  ✓" : "  ✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

/** Fail `kv.get` for SELECTED keys only — the index answers, the records don't. */
async function withReadFailureOn<T>(fails: (key: string) => boolean, fn: () => Promise<T>): Promise<T> {
  const realGet = kv.get.bind(kv);
  kv.get = (async <V,>(key: string): Promise<V | null> => {
    if (fails(key)) throw new Error("simulated Upstash throttle (max requests limit exceeded)");
    return realGet<V>(key);
  }) as typeof kv.get;
  try { return await fn(); } finally { kv.get = realGet; }
}

const USER = "0x1111111111111111111111111111111111111111";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const KEEPER = "0x2222222222222222222222222222222222222222";

const schedule = (id: string): DcaSchedule => ({
  id, userAddress: USER, keeperAddress: KEEPER, chainId: 8453,
  sellToken: USDC, sellTokenSymbol: "USDC", sellTokenDecimals: 6, sellAmountPerRun: "20000000",
  buyToken: "0x4200000000000000000000000000000000000006", buyTokenSymbol: "WETH", buyTokenDecimals: 18,
  frequency: "daily", frequencySec: 86_400, slippageBps: 100,
  totalAllowance: "7300000000", totalRuns: 365, expiresAt: 2_000_000_000, feeBps: 50,
  status: "active", createdAt: 1_756_000_000, lastRunAt: null, nextRunAt: 1_756_086_400,
  runsCompleted: 0, runsFailed: 0, totalSpent: "0", totalBought: "0", lastError: null,
});

const call = async (address = USER) => {
  const res = await GET(new Request(`http://localhost/api/dca/list?address=${address}`));
  return { status: res.status, body: (await res.json()) as { ok?: boolean; schedules?: DcaSchedule[]; error?: string } };
};

const isRecord = (k: string) => k.startsWith("dca:schedule:");

async function main() {
  await kvSet(dcaKeys.userIndex(USER), ["s1", "s2"]);
  await kvSet(dcaKeys.schedule("s1"), schedule("s1"));
  await kvSet(dcaKeys.schedule("s2"), schedule("s2"));

  console.log("\nA · CONTROL — the old record read, under a record-only throttle");
  {
    const lied = await withReadFailureOn(isRecord, async () => {
      const ids = (await kvGet<string[]>(dcaKeys.userIndex(USER))) ?? [];
      const recs = await Promise.all(ids.map((id) => kvGet<DcaSchedule>(dcaKeys.schedule(id))));
      return recs.filter((s): s is DcaSchedule => s !== null);
    });
    check("the old shape answers an EMPTY list for a user with two schedules", lied.length === 0, `got ${lied.length}`);
  }

  console.log("\nB · FIX — the real route, same fault");
  {
    const r = await withReadFailureOn(isRecord, () => call());
    check("record reads that throw → 503, not ok:true", r.status === 503 && r.body.ok === false, `status ${r.status}, ok ${r.body.ok}`);
    check("…and no schedules list is sent", r.body.schedules === undefined);
    check("…and the error says unread is not none", /NOT the same as having none/.test(r.body.error ?? ""));

    // One bad record out of two: a short list would render as complete.
    const one = await withReadFailureOn((k) => k === dcaKeys.schedule("s2"), () => call());
    check("ONE unreadable record fails the answer (no silently short list)", one.status === 503, `status ${one.status}`);

    const idx = await withReadFailureOn((k) => k === dcaKeys.userIndex(USER), () => call());
    check("an unreadable index is still 503", idx.status === 503 && idx.body.ok === false, `status ${idx.status}`);
  }

  console.log("\nC · HAPPY — healthy KV");
  {
    const r = await call();
    check("both schedules come back", r.status === 200 && r.body.ok === true && r.body.schedules?.length === 2,
      `status ${r.status}, n=${r.body.schedules?.length}`);
    check("…with the keeper the revoke needs", r.body.schedules?.every((s) => s.keeperAddress === KEEPER) === true);

    // A record that is genuinely gone (deleted, expired) is a MISS, not an
    // error — dropping it is correct and must stay correct.
    await kvSet(dcaKeys.userIndex(USER), ["s1", "s2", "gone"]);
    const withMiss = await call();
    check("an index id whose record is absent is dropped, not a 503",
      withMiss.status === 200 && withMiss.body.schedules?.length === 2, `status ${withMiss.status}, n=${withMiss.body.schedules?.length}`);

    const fresh = await call("0x3333333333333333333333333333333333333333");
    check("a wallet with no index at all → ok, [] (a real none)",
      fresh.status === 200 && fresh.body.ok === true && fresh.body.schedules?.length === 0);

    const bad = await call("not-an-address");
    check("an invalid address is still 400", bad.status === 400);
  }

  console.log(failures === 0 ? "\ndca-list-kv-test: PASS\n" : `\ndca-list-kv-test: FAIL — ${failures}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
