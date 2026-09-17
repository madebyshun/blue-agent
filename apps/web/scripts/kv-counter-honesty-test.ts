/**
 * Control test for the #150 **READ** side — counters that feed a SUM.
 *
 * Run: `npx tsx scripts/kv-counter-honesty-test.ts` from `apps/web/`.
 * Hermetic: no KV env vars, no network. Runs against the in-memory fallback.
 *
 * WHY THIS IS SEPARATE FROM THE TWO kv-mutate SUITES
 *
 * Those cover the destructive half of #150: a failed read feeding a write that
 * replaces the collection it could not read. This is the other half, and the
 * failure mode is genuinely different in kind.
 *
 * `kvGet(k) ?? 0` inside `totalRuns += runs` does not lose data and does not
 * throw. It produces a NUMBER — a smaller, entirely plausible one. There is no
 * error, no empty state, no gap in a list to notice. On /stats it reads as a
 * quiet week; on the claim banner it reads as "300 slots still available".
 * Nothing on the page distinguishes "we measured 0" from "we could not look",
 * which is exactly why this shipped for months while the wipes got caught.
 *
 * Same control/fix structure as kv-mutate-control-test.ts, for the same reason:
 * case A reimplements the OLD shape inline and asserts it still lies. If A ever
 * fails, the bug is no longer reproducible and this whole change needs
 * re-justifying rather than trusting.
 *
 * The simulated fault is `kv.get` throwing while `kv.set` works — the shape of
 * the Upstash cap outages (#123, #148) that motivated the task.
 */
import { kv, kvGet, kvSet, kvGetCounter } from "../src/lib/kv";
import { AGENT_TOOLS } from "../src/lib/agent-tools";

let failures = 0;
function check(label: string, pass: boolean, detail: string) {
  console.log(`${pass ? "  ✓" : "  ✗"} ${label} — ${detail}`);
  if (!pass) failures++;
}

/** Swap in a throwing `kv.get`, run `fn`, always restore. Writes keep working. */
async function withReadFailure<T>(fn: () => Promise<T>): Promise<T> {
  const realGet = kv.get.bind(kv);
  kv.get = async () => {
    throw new Error("simulated Upstash throttle (max requests limit exceeded)");
  };
  try {
    return await fn();
  } finally {
    kv.get = realGet;
  }
}

const K_A = "usage:test-counter-a";
const K_B = "usage:test-counter-b";

async function main() {
  console.log("\nkvGetCounter honesty test — #150 read side\n");

  // ── A. CONTROL: the old shape must still produce a confident wrong number ──
  console.log("A. CONTROL — old `(await kvGet<number>(k)) ?? 0` inside a sum:");
  await kvSet(K_A, 120);
  await kvSet(K_B, 80);

  const truth = ((await kvGet<number>(K_A)) ?? 0) + ((await kvGet<number>(K_B)) ?? 0);
  check("baseline sums correctly when KV is healthy", truth === 200, `${truth} (expected 200)`);

  const oldTotal = await withReadFailure(async () => {
    // Verbatim the shape this change removes. Do NOT "fix" this — it is the
    // control, and it is supposed to publish a number nobody measured.
    let total = 0;
    for (const k of [K_A, K_B]) total += (await kvGet<number>(k)) ?? 0;
    return total;
  });
  check(
    "old shape reports a total of 0 as if measured",
    oldTotal === 0,
    `200 real runs → published ${oldTotal}, with no error and no way to tell`,
  );

  // ── B. FIX: kvGetCounter must answer null, not 0 ──────────────────────────
  console.log("\nB. FIX — `kvGetCounter`, same simulated read failure:");
  const probed = await withReadFailure(() => Promise.all([kvGetCounter(K_A), kvGetCounter(K_B)]));
  check(
    "both reads answer null (unknown), never 0",
    probed.every((v) => v === null),
    JSON.stringify(probed),
  );

  // A miss and an error must stay distinguishable — this is the whole point.
  console.log("\nB2. MISS vs ERROR — a key that genuinely does not exist:");
  const missing = await kvGetCounter("usage:test-counter-never-written");
  check("an absent key is 0, not null", missing === 0, `got ${JSON.stringify(missing)}`);

  // ── C. /api/usage — an unreadable id is OMITTED, not emitted as 0 ─────────
  console.log("\nC. REAL ROUTE — GET /api/usage:");
  const { GET: usageGET } = await import("../src/app/api/usage/route");

  const healthyRes = await usageGET();
  const healthyBody = (await healthyRes.json()) as Record<string, number>;
  check(
    "healthy: header reports 0 unreadable",
    healthyRes.headers.get("X-Counters-Unreadable") === "0",
    `X-Counters-Unreadable=${healthyRes.headers.get("X-Counters-Unreadable")}`,
  );
  check(
    "healthy: every catalog id is present",
    Object.keys(healthyBody).length >= AGENT_TOOLS.length,
    `${Object.keys(healthyBody).length} ids for ${AGENT_TOOLS.length} tools (+ console cmds)`,
  );

  const outageRes = await withReadFailure(() => usageGET());
  const outageBody = (await outageRes.json()) as Record<string, number>;
  check(
    "outage: body is empty — no id is given a fabricated 0",
    Object.keys(outageBody).length === 0,
    `${Object.keys(outageBody).length} ids emitted`,
  );
  check(
    "outage: header states how many could not be read",
    Number(outageRes.headers.get("X-Counters-Unreadable")) > 0,
    `X-Counters-Unreadable=${outageRes.headers.get("X-Counters-Unreadable")}`,
  );

  // ── D. buildPublicStats — the PUBLIC traction claim ───────────────────────
  console.log("\nD. REAL FUNCTION — buildPublicStats():");
  const { buildPublicStats } = await import("../src/lib/public-stats");

  const healthyStats = await buildPublicStats();
  check("healthy: usage.ok is true", healthyStats.usage.ok === true, `ok=${healthyStats.usage.ok}`);
  check(
    "healthy: usage.unreadable is 0",
    healthyStats.usage.unreadable === 0,
    `unreadable=${healthyStats.usage.unreadable}`,
  );
  check("healthy: users.claimsOk is true", healthyStats.users.claimsOk === true, `claimsOk=${healthyStats.users.claimsOk}`);
  check("healthy: launches.ok is true", healthyStats.launches.ok === true, `ok=${healthyStats.launches.ok}`);

  const outageStats = await withReadFailure(() => buildPublicStats());
  check(
    "outage: usage.ok is false — totals are declared a lower bound",
    outageStats.usage.ok === false,
    `ok=${outageStats.usage.ok}, unreadable=${outageStats.usage.unreadable}`,
  );
  check(
    "outage: every counter is counted as unreadable",
    outageStats.usage.unreadable === AGENT_TOOLS.length,
    `${outageStats.usage.unreadable} of ${AGENT_TOOLS.length}`,
  );
  check(
    "outage: users.claimsOk is false — renders \"—\", not \"nobody signed up\"",
    outageStats.users.claimsOk === false,
    `claimsOk=${outageStats.users.claimsOk}, claims=${outageStats.users.claims}`,
  );
  check(
    "outage: launches.ok is false — renders \"—\", not \"0 tokens ever launched\"",
    outageStats.launches.ok === false,
    `ok=${outageStats.launches.ok}, total=${outageStats.launches.total}`,
  );

  // ── D2. The launch registry behind `launches.ok` above ────────────────────
  //
  // `launches.total` is the headline "Tokens Launched" figure. Unlike a counter
  // sum, an unreadable registry does not shrink the number a little — it denies
  // the product's entire history in one go. And unlike /api/b20hub/tokens (a
  // grid, where empty and failed look identical anyway), /stats PUBLISHES this
  // as traction, so the two states have to stay apart all the way to the view.
  console.log("\nD2. REAL FUNCTION — getLaunchesProbe() vs getLaunches():");
  const { getLaunchesProbe, getLaunches, recordLaunch } = await import("../src/lib/launches");

  await recordLaunch({
    tokenAddress: "0xb2000000000000000000000000000000000000ff",
    tokenName: "Honesty Test Token",
    tokenSymbol: "HONEST",
    feeRecipient: { type: "wallet", value: "0x0295ad38ada1d599375bd447e080cd404809205a" },
    launchedAt: Date.now(),
    chain: "base",
  });

  const liveProbe = await getLaunchesProbe();
  check(
    "healthy: ok is true and the row is there",
    liveProbe.ok === true && liveProbe.launches.length > 0,
    `ok=${liveProbe.ok} rows=${liveProbe.launches.length}`,
  );

  // CONTROL for F — the old shape, inline. `kvGet` swallows the throw into null,
  // `?? []` turns that into "the registry is empty", and `.length` publishes 0.
  const oldLaunchTotal = await withReadFailure(async () => {
    const all = (await kvGet<unknown[]>("bluechat:launches")) ?? [];
    return all.length;
  });
  check(
    "old shape publishes 0 tokens launched during an outage",
    oldLaunchTotal === 0,
    `a real row exists → published ${oldLaunchTotal} as "nobody has ever launched a token"`,
  );

  const outageProbe = await withReadFailure(() => getLaunchesProbe());
  check("outage: ok is false", outageProbe.ok === false, `ok=${outageProbe.ok}`);
  check(
    "outage: launches is empty — no row is invented to fill the gap",
    outageProbe.launches.length === 0,
    `${outageProbe.launches.length} rows`,
  );

  // The `[]`-on-failure wrapper is a DELIBERATE keep for /api/b20hub/tokens.
  // Assert it still behaves that way so nobody "fixes" it into a throw and
  // takes the token grid down with it.
  const outageList = await withReadFailure(() => getLaunches());
  check(
    "getLaunches() still degrades to [] (grid callers) rather than throwing",
    Array.isArray(outageList) && outageList.length === 0,
    `${JSON.stringify(outageList)}`,
  );

  // ── E. /api/credits/claim GET — the scarcity number ───────────────────────
  //
  // The sharpest case: this response EXISTS to state how many slots are left.
  // Under the old shape a total outage answered "300 of 300 remaining" — the
  // most confident possible claim, made from the least information possible.
  console.log("\nE. REAL ROUTE — GET /api/credits/claim:");
  const { GET: claimGET } = await import("../src/app/api/credits/claim/route");
  const claimReq = () => new Request("https://blueagent.dev/api/credits/claim");

  await kvSet("claim:count", 42);
  const claimHealthy = await claimGET(claimReq());
  const claimBody = (await claimHealthy.json()) as { ok?: boolean; remaining?: number; claimedCount?: number };
  check("healthy: 200 with the real count", claimHealthy.status === 200 && claimBody.claimedCount === 42,
    `status=${claimHealthy.status} claimedCount=${claimBody.claimedCount} remaining=${claimBody.remaining}`);

  // CONTROL for E — the old shape, inline, must still advertise a full campaign.
  const oldClaim = await withReadFailure(async () => {
    const n = (await kvGet<number>("claim:count")) ?? 0;
    return { remaining: Math.max(0, 300 - n), soldOut: n >= 300 };
  });
  check(
    "old shape advertises a full campaign during a total outage",
    oldClaim.remaining === 300 && oldClaim.soldOut === false,
    `remaining=${oldClaim.remaining} — 42 slots were actually taken`,
  );

  const claimOutage = await withReadFailure(() => claimGET(claimReq()));
  const outageClaimBody = (await claimOutage.json()) as { ok?: boolean; remaining?: number };
  check("outage: answers 503", claimOutage.status === 503, `status=${claimOutage.status}`);
  check("outage: ok is false", outageClaimBody.ok === false, `ok=${outageClaimBody.ok}`);
  check(
    "outage: no `remaining` is quoted at all",
    outageClaimBody.remaining === undefined,
    `remaining=${JSON.stringify(outageClaimBody.remaining)}`,
  );

  console.log(
    failures === 0
      ? "\nAll checks passed.\n"
      : `\n${failures} check(s) FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
