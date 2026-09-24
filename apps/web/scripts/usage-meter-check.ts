/**
 * The daily usage meter records what it claims to, and every surface feeds it.
 *
 * WHY THIS EXISTS
 * ---------------
 * The meter's whole value is the SURFACE dimension: `usage:<id>` already counts
 * runs, but the paid x402 route, the free MCP bypass, the Hub runner and the
 * console all increment the same integer, so it cannot say whether a tool's runs
 * were paid. lib/usage-daily.ts splits them apart.
 *
 * That split is only as good as its coverage. A surface that forgets to call
 * `recordCall` does not fail loudly — it reports ZERO, which reads exactly like
 * "nobody uses this surface". That is the failure mode this repo has been bitten
 * by repeatedly (#148 cap outages reading as "poller never ran", #150 counters
 * reading as "$0 earned"), and it is worse here than usual: the measurement
 * exists specifically to decide what to build and what to retire, so a silent
 * zero does not just mislead, it gets acted on.
 *
 * So the coverage assertion is a grep over the route files rather than a runtime
 * check — it has to hold for surfaces this test cannot execute.
 *
 * WHAT IT CHECKS
 * --------------
 * 1. Round-trip: record calls through the real module against the in-memory KV
 *    fallback, read them back, and assert the counts, the ok/err split and the
 *    surface split all survive.
 * 2. Field-format robustness: junk fields never surface as a tool named
 *    "undefined", and an unknown surface is dropped rather than invented.
 * 3. Coverage: every surface in the union type actually calls `recordCall`
 *    somewhere, and both outcomes are recorded on at least one path.
 * 4. Cost: exactly one KV write command per recorded call (plus the lazy TTL),
 *    because an Upstash budget overrun is what unscheduled the research cron.
 *
 * Runs offline against the in-memory KV fallback — no network, no Upstash.
 *
 * Run:  npx tsx scripts/usage-meter-check.ts
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const WEB  = path.resolve(path.dirname(path.resolve(process.argv[1])), "..");
const SRC  = path.join(WEB, "src");

let failures = 0;
let checks   = 0;
function check(name: string, cond: boolean, detail = "") {
  checks++;
  if (cond) console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  // Guard: the fallback KV only engages with no Upstash creds. If a stray
  // .env gave this process real credentials it would write junk into PRODUCTION
  // counters, so refuse rather than risk it.
  if (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) {
    console.log("\n  REFUSING TO RUN: Upstash credentials are present in the environment.");
    console.log("  This check writes probe rows (token-price, gas-tracker, cost-probe) and must");
    console.log("  only ever hit the in-memory fallback — with creds it would land them in the");
    console.log("  PRODUCTION meter and quietly corrupt the numbers it exists to protect.");
    console.log("");
    console.log("  CI runs with an empty environment, so this only trips locally. Re-run in a");
    console.log("  shell without KV_REST_API_URL / UPSTASH_REDIS_REST_URL exported:");
    console.log("      env -u KV_REST_API_URL -u UPSTASH_REDIS_REST_URL npx tsx scripts/usage-meter-check.ts\n");
    process.exit(1);
  }

  const { recordCall, readDays, utcDay, RETENTION_DAYS } = await import("../src/lib/usage-daily");
  const { kv } = await import("../src/lib/kv");

  // ── 1. Round-trip ──────────────────────────────────────────────────────────
  console.log("\n1. a recorded call reads back with its surface, day and outcome");

  await recordCall("token-price", "x402", "ok");
  await recordCall("token-price", "x402", "ok");
  await recordCall("token-price", "mcp",  "ok");
  await recordCall("token-price", "mcp",  "err");
  await recordCall("gas-tracker", "hub",  "err");
  await recordCall("blue_idea",   "console", "ok");

  const days = await readDays(1);
  check("readDays returns today's bucket", days.length === 1 && days[0].day === utcDay(), days[0]?.day);

  const rows = days[0].rows;
  check("today's bucket is readable (not null)", rows !== null);

  if (rows) {
    check(
      "x402 and mcp are kept APART for the same tool",
      rows["x402|token-price"]?.ok === 2 && rows["mcp|token-price"]?.ok === 1,
      `x402.ok=${rows["x402|token-price"]?.ok} mcp.ok=${rows["mcp|token-price"]?.ok}`,
    );
    check(
      "ok and err are kept apart",
      rows["mcp|token-price"]?.err === 1 && rows["mcp|token-price"]?.ok === 1,
      `mcp ok=${rows["mcp|token-price"]?.ok} err=${rows["mcp|token-price"]?.err}`,
    );
    check(
      "a failure-only tool is recorded, not invisible",
      rows["hub|gas-tracker"]?.err === 1 && rows["hub|gas-tracker"]?.ok === 0,
      "this is the shape that would otherwise read as 'nobody calls it'",
    );
    check("console commands land in the meter", rows["console|blue_idea"]?.ok === 1);
  }

  // ── 2. Junk fields never become fake tools ─────────────────────────────────
  console.log("\n2. malformed fields are dropped, not rendered as tools");

  const key = `usage:day:${utcDay()}`;
  await kv.hincrby(key, "garbage", 1);                    // no delimiters
  await kv.hincrby(key, "x402|only-two-parts", 1);        // missing outcome
  await kv.hincrby(key, "telepathy|some-tool|ok", 1);     // unknown surface
  await kv.hincrby(key, "x402|some-tool|maybe", 1);       // unknown outcome
  await kv.hincrby(key, "x402||ok", 1);                   // empty tool id

  const after = (await readDays(1))[0].rows!;
  const names = Object.keys(after);
  check("no field without 3 parts survives", !names.some((n) => n.includes("garbage") || n.includes("only-two-parts")));
  check("an unknown surface is dropped", !names.some((n) => n.startsWith("telepathy")));
  check("an unknown outcome is dropped", !names.includes("x402|some-tool"));
  check("an empty tool id is dropped", !names.some((n) => n.endsWith("|")));
  check(
    "the real rows are untouched by the junk",
    after["x402|token-price"]?.ok === 2,
    `${Object.keys(after).length} row(s) after junk`,
  );

  // ── 3. Every surface actually feeds the meter ──────────────────────────────
  console.log("\n3. every surface in the union type calls recordCall");

  // surface → the route file that is supposed to record it.
  const WIRED: Record<string, string> = {
    x402:    "app/api/x402/[tool]/route.ts",
    mcp:     "app/api/mcp/route.ts",
    hub:     "app/api/hub/tools/[id]/call/route.ts",
    console: "app/api/console/route.ts",
  };

  // Read the surface union straight from the module so adding a surface to the
  // type without wiring a route fails HERE instead of reporting a silent zero.
  const meterSrc = readFileSync(path.join(SRC, "lib/usage-daily.ts"), "utf8");
  const unionBlock = meterSrc.slice(
    meterSrc.indexOf("export type UsageSurface"),
    meterSrc.indexOf(";", meterSrc.indexOf("export type UsageSurface")),
  );
  const declared = [...unionBlock.matchAll(/\|\s*"([a-z0-9]+)"/g)].map((m) => m[1]);
  check("the surface union parsed", declared.length >= 4, `declared: ${declared.join(", ")}`);
  check(
    "every declared surface has a route mapped in this check",
    declared.every((s) => WIRED[s]),
    declared.filter((s) => !WIRED[s]).join(", ") || "all mapped",
  );

  for (const [surface, rel] of Object.entries(WIRED)) {
    const file = path.join(SRC, rel);
    if (!existsSync(file)) { check(`${surface}: route file exists`, false, rel); continue; }
    const src = readFileSync(file, "utf8");
    check(
      `${surface}: ${rel} records it`,
      new RegExp(`recordCall\\([^)]*"${surface}"`).test(src),
      `recordCall(..., "${surface}", ...)`,
    );
  }

  // Both outcomes must be recorded SOMEWHERE, or the err dimension is decorative.
  const allRouteSrc = Object.values(WIRED)
    .map((rel) => (existsSync(path.join(SRC, rel)) ? readFileSync(path.join(SRC, rel), "utf8") : ""))
    .join("\n");
  check('some surface records the "err" outcome', /recordCall\([^)]*"err"/.test(allRouteSrc));
  check('some surface records the "ok" outcome',  /recordCall\([^)]*"ok"/.test(allRouteSrc));

  // ── 4. One write per call ──────────────────────────────────────────────────
  console.log("\n4. cost: one KV write command per recorded call");

  let hincrby = 0, expire = 0;
  const realH = kv.hincrby.bind(kv);
  const realE = kv.expire.bind(kv);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hincrby = (k: string, f: string, b: number) => { hincrby++; return realH(k, f, b); };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).expire  = (k: string, s: number) => { expire++; return realE(k, s); };

  for (let i = 0; i < 10; i++) await recordCall("cost-probe", "mcp", "ok");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hincrby = realH;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).expire  = realE;

  check("10 calls cost exactly 10 HINCRBY", hincrby === 10, `${hincrby} write(s)`);
  check(
    "TTL is set lazily, not per call",
    expire === 0,
    `${expire} EXPIRE — today's TTL was already set by the calls in section 1`,
  );
  check("retention is bounded", RETENTION_DAYS > 0 && RETENTION_DAYS <= 365, `${RETENTION_DAYS} days`);

  // ── 5. readDays is clamped ─────────────────────────────────────────────────
  console.log("\n5. readDays cannot be pushed past retention");
  check("days is clamped to RETENTION_DAYS", (await readDays(9999)).length === RETENTION_DAYS);
  check("days below 1 is clamped up", (await readDays(0)).length === 1);

  console.log(
    failures === 0
      ? `\nALL ${checks} CHECKS PASSED\n`
      : `\n${failures} of ${checks} CHECK(S) FAILED\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
