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
 * 5. `readDays` is clamped to retention in both directions.
 * 6. The MCP handshake counter: its bucket list is CLOSED (the field is
 *    caller-supplied on a public unauthenticated route, so an open one is an
 *    unbounded KV write anyone can spray), the substring order that keeps
 *    `cursor-vscode` out of the `vscode` bucket holds, and the `initialize`
 *    branch still calls it — that one line is the only thing counting agents
 *    that connect but never call a tool, and deleting it fails silently.
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

  const {
    recordCall, readDays, utcDay, RETENTION_DAYS,
    recordMcpHandshake, readHandshakeDays, normalizeMcpClient, MCP_CLIENT_FAMILIES,
    readUnmatchedClientNames, foldClientName, RAW_NAME_CAP, RAW_NAME_MAXLEN,
  } = await import("../src/lib/usage-daily");
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

  // ── 6. MCP handshakes ──────────────────────────────────────────────────────
  console.log("\n6. the MCP handshake counter buckets clients and cannot be sprayed");

  // Real clients send decorated names. Bucketing has to survive that, and the
  // `cursor-vscode` case is the one that silently files every Cursor session as
  // VS Code if the family list is ever reordered.
  check("the wire name claude-code buckets to claude_code",
    normalizeMcpClient("claude-code") === "claude_code",
    `got ${normalizeMcpClient("claude-code")}`);
  check('"Claude Code" normalizes before matching',
    normalizeMcpClient("Claude Code") === "claude_code");
  check("cursor-vscode buckets to cursor, NOT vscode",
    normalizeMcpClient("cursor-vscode") === "cursor",
    `got ${normalizeMcpClient("cursor-vscode")} — family order is load-bearing`);
  check('"Visual Studio Code" still reaches its own bucket',
    normalizeMcpClient("Visual Studio Code") === "visual_studio_code",
    `got ${normalizeMcpClient("Visual Studio Code")}`);

  // THE ordering check, stated as a property instead of a list of cases. A family
  // that cannot bucket its own name is unreachable — some earlier entry is a
  // substring of it — so it is a dead bucket that still reads as coverage. This
  // caught `cline` sitting above `roo_cline`, which the per-case checks above did
  // not, because nobody thinks to write the case for the pair they got wrong.
  const unreachable = MCP_CLIENT_FAMILIES.filter((f) => normalizeMcpClient(f) !== f);
  check(
    `every one of the ${MCP_CLIENT_FAMILIES.length} families can bucket its own name`,
    unreachable.length === 0,
    unreachable.map((f) => `${f} → ${normalizeMcpClient(f)}`).join(", ") ||
      "reordering a family above a string it contains makes the longer one dead",
  );
  check("Roo Cline is NOT filed as Cline", normalizeMcpClient("Roo Cline") === "roo_cline",
    `got ${normalizeMcpClient("Roo Cline")}`);
  // The bare `claude` catch-all must sit below the specific ones or it eats them.
  check("bare Claude reaches the brand bucket", normalizeMcpClient("Claude") === "claude");
  check("the bare catch-all does NOT swallow Claude Code",
    normalizeMcpClient("Claude Code") === "claude_code");
  check("the Agent SDK is its own bucket, not other",
    normalizeMcpClient("@anthropic-ai/claude-agent-sdk") === "claude_agent_sdk",
    `got ${normalizeMcpClient("@anthropic-ai/claude-agent-sdk")} — the programmatic caller is the cohort worth naming`);
  // Every bucket must stay out of the model-id namespace, or model-id-check.ts
  // has to grow a value allowlist — the artifact it exists to avoid.
  check("no bucket is hyphenated, so none can read as a model id",
    !["claude-code", "cursor-vscode", "Claude Desktop", "claude.ai", "roo cline", undefined, "x"]
      .some((n) => normalizeMcpClient(n).includes("-")),
    "model ids are lowercase-hyphenated; buckets use _ so the namespaces cannot collide");

  // The negative controls. An open field on a public route is the bug.
  check("an unknown client is bucketed to other", normalizeMcpClient("totally-new-agent-2031") === "other");
  check("a missing name is unnamed, not other", normalizeMcpClient(undefined) === "unnamed");
  check("an empty name is unnamed", normalizeMcpClient("   ") === "unnamed");
  check("a non-string name is unnamed", normalizeMcpClient({ evil: true }) === "unnamed");
  check(
    "unnamed and other stay APART",
    normalizeMcpClient(undefined) !== normalizeMcpClient("totally-new-agent-2031"),
    "collapsing them would hide the signal that says 'add a family'",
  );

  await recordMcpHandshake("claude-code");
  await recordMcpHandshake("claude-code");
  await recordMcpHandshake("cursor-vscode");
  await recordMcpHandshake(undefined);

  const initToday = (await readHandshakeDays(1))[0];
  check("readHandshakeDays returns today's bucket", initToday?.day === utcDay(), initToday?.day);
  check("today's handshakes are readable (not null)", initToday?.clients !== null);
  check("repeat handshakes from one client accumulate", initToday?.clients?.["claude_code"] === 2,
    `claude_code=${initToday?.clients?.["claude_code"]}`);
  check("a decorated name lands in its family bucket", initToday?.clients?.["cursor"] === 1);
  check("a nameless caller is counted, not dropped", initToday?.clients?.["unnamed"] === 1);

  // The key the module writes is the key a reader constructs. Asserted through
  // behaviour, not a grep, so a rename fails here rather than going unnoticed.
  const initKey = `usage:mcpinit:${utcDay()}`;
  check("handshakes live under usage:mcpinit:<day>",
    Object.keys((await kv.hgetall(initKey)) ?? {}).length > 0, initKey);

  // Spray. This is the attack the closed list exists to stop: the route is
  // public, unauthenticated and CORS-open, so `clientInfo.name` is hostile input.
  for (let i = 0; i < 50; i++) await recordMcpHandshake(`spray-${i}-${Math.random()}`);
  const sprayed = Object.keys((await kv.hgetall(initKey)) ?? {});
  check(
    "50 distinct hostile names create ONE field, not 50",
    sprayed.filter((f) => f.startsWith("spray")).length === 0 && sprayed.length <= 20,
    `${sprayed.length} field(s): ${sprayed.join(", ")}`,
  );

  // ── 6b. The unmatched-name SAMPLE ───────────────────────────────────────────
  // `other` was 10 of 19 handshakes on the meter's first full day — the biggest
  // bucket — and the counter could not say what it was, because it stores the
  // bucket and not the name. So unmatched names are now sampled. That makes a KV
  // FIELD out of hostile input, which is the exact thing the closed bucket list
  // above exists to prevent. It is safe only while the cap holds, so the cap —
  // not the feature — is what the checks below are about.
  const rawKey     = `usage:mcpraw:${utcDay()}`;
  const rawFields  = Object.keys((await kv.hgetall(rawKey)) ?? {});
  const rawSamples = rawFields.filter((f) => f !== "_overflow");
  check(
    `the 50 sprayed names fill the sample to its cap of ${RAW_NAME_CAP}, not past it`,
    rawSamples.length <= RAW_NAME_CAP,
    `${rawSamples.length} sampled — an uncapped raw hash is the #148 Upstash cost bug with an attacker holding the pen`,
  );
  check(
    "the spray is VISIBLE as truncated, so a full sample cannot read as a complete one",
    Number((await kv.hgetall(rawKey))?.["_overflow"] ?? 0) > 0,
    `50 names minus a cap of ${RAW_NAME_CAP} must leave a countable remainder, or the operator over-trusts the list`,
  );
  // Structural, not a convention: the fold strips leading underscores, so the
  // sentinel lives in a namespace no caller can reach. Negative control included,
  // because "we named it something unlikely" is not the same claim.
  check(
    "no caller can forge the _overflow sentinel by naming itself that",
    foldClientName("_overflow") !== "_overflow" && foldClientName("__overflow__") !== "_overflow",
    `a client calling itself "_overflow" folds to "${foldClientName("_overflow")}"`,
  );

  // Truncation, on a cleared key so the cap above does not mask it. A 500-char
  // name is a KV field an attacker chose the size of.
  await kv.del(rawKey);
  await recordMcpHandshake(`zzz${"q".repeat(500)}`);
  const truncated = Object.keys((await kv.hgetall(rawKey)) ?? {});
  check(
    `a 503-char client name is stored truncated to ${RAW_NAME_MAXLEN}`,
    truncated.length === 1 && truncated[0].length === RAW_NAME_MAXLEN,
    `got ${truncated.map((f) => `${f.length} chars`).join(", ") || "nothing"}`,
  );

  // An already-seen name always increments; only NEW names are capped. That
  // ordering is what makes the sample useful under spray — a genuinely repeated
  // client out-counts noise instead of being crowded out by whoever sprayed first.
  await kv.del(rawKey);
  for (let i = 0; i < RAW_NAME_CAP; i++) await recordMcpHandshake(`filler-${i}`);
  for (let i = 0; i < 4; i++) await recordMcpHandshake("filler-0");
  await recordMcpHandshake("arrives-after-the-cap-is-full");
  const afterCap = (await kv.hgetall(rawKey)) ?? {};
  check(
    "a name already in the sample keeps counting after the cap is full",
    Number(afterCap["filler_0"] ?? 0) === 5,
    `filler_0 = ${afterCap["filler_0"]} (expected 5: one admission + four repeats)`,
  );
  check(
    "a NEW name after the cap is dropped to _overflow, not admitted",
    afterCap["arrives_after_the_cap_is_full"] === undefined && Number(afterCap["_overflow"] ?? 0) === 1,
    `overflow = ${afterCap["_overflow"]}`,
  );

  // `dropped` must not live inside `names`: `by_client.other` already counts those
  // handshakes, so a caller summing `names` would double-count them.
  const unmatchedToday = (await readUnmatchedClientNames(1))[0];
  check(
    "readUnmatchedClientNames splits `dropped` out of `names`",
    unmatchedToday.dropped === 1 && unmatchedToday.names?.["_overflow"] === undefined,
    `dropped=${unmatchedToday.dropped}, _overflow leaked into names: ${unmatchedToday.names?.["_overflow"] !== undefined}`,
  );

  // A RECOGNISED client must cost nothing extra — the sample is for unknowns only.
  await kv.del(rawKey);
  for (let i = 0; i < 6; i++) await recordMcpHandshake("Cursor");
  check(
    "a recognised client writes NOTHING to the sample key",
    Object.keys((await kv.hgetall(rawKey)) ?? {}).length === 0,
    "sampling a known name would pay two extra Upstash commands per handshake for a name we already have",
  );

  // #150 null-vs-empty, for the new reader too. `{}` here would mean "read fine,
  // no unknown clients" — the most reassuring possible reading of a KV outage.
  const realHgRaw = kv.hgetall.bind(kv);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hgetall = async () => { throw new Error("KV down"); };
  const blindRaw = (await readUnmatchedClientNames(1))[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hgetall = realHgRaw;
  check(
    "an unreadable sample day is null, never an empty object",
    blindRaw.names === null,
    "{} would report 'no unknown clients' during an outage — the one answer that stops you looking",
  );

  // And the write side must survive the same outage: the sampler runs AFTER the
  // bucket write, so a throw in it would lose the count too, not just the name.
  let sampleThrew = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hgetall = async () => { throw new Error("KV down"); };
  try { await recordMcpHandshake("some-brand-new-client"); } catch { sampleThrew = true; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hgetall = realHgRaw;
  check("a KV failure inside the sampler never breaks the handshake", !sampleThrew);

  // Read-side filter, same discipline as section 2.
  await kv.hincrby(initKey, "telepathy-client", 1);
  const filtered = (await readHandshakeDays(1))[0].clients!;
  check("a field outside the closed set is dropped on read", filtered["telepathy-client"] === undefined);
  check("the real buckets survive the junk field", filtered["claude_code"] === 2);

  // Cost, and the #150 null-vs-empty distinction.
  let initWrites = 0;
  const realHi = kv.hincrby.bind(kv);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hincrby = (k: string, f: string, b: number) => { initWrites++; return realHi(k, f, b); };
  for (let i = 0; i < 5; i++) await recordMcpHandshake("claude-code");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hincrby = realHi;
  check("5 handshakes cost exactly 5 HINCRBY", initWrites === 5, `${initWrites} write(s)`);

  const realHg = kv.hgetall.bind(kv);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hgetall = async () => { throw new Error("KV down"); };
  const blind = (await readHandshakeDays(1))[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hgetall = realHg;
  check(
    "an unreadable day is null, never an empty object",
    blind.clients === null,
    "{} would be read as 'nobody connected' — a conclusion, not a missing datapoint",
  );

  let threw = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hincrby = async () => { throw new Error("KV down"); };
  try { await recordMcpHandshake("claude-code"); } catch { threw = true; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hincrby = realHi;
  check("a KV failure never breaks the handshake", !threw, "initialize must answer even with no meter");

  // Coverage: the one line that counts connecting agents, in the one branch that
  // sees them. A grep, because this check cannot execute the route.
  const mcpRoute = path.join(SRC, "app/api/mcp/route.ts");
  const mcpSrc   = existsSync(mcpRoute) ? readFileSync(mcpRoute, "utf8") : "";
  check("app/api/mcp/route.ts exists", mcpSrc.length > 0);
  const initAt  = mcpSrc.indexOf('if (method === "initialize")');
  const callAt  = mcpSrc.indexOf("recordMcpHandshake(");
  const nextAt  = mcpSrc.indexOf('if (method === ', initAt + 10);
  check("the initialize branch records the handshake", initAt > 0 && callAt > initAt && callAt < nextAt,
    initAt < 0 ? "no initialize branch found"
      : callAt < 0 ? "recordMcpHandshake is never called — connecting agents are invisible again"
      : `initialize@${initAt} call@${callAt} nextBranch@${nextAt}`);

  console.log(
    failures === 0
      ? `\nALL ${checks} CHECKS PASSED\n`
      : `\n${failures} of ${checks} CHECK(S) FAILED\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
