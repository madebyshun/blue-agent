/**
 * #149 — the PUBLIC CENSUS half of Blue Hub.
 *
 * Run: `npx tsx scripts/hub-census-kv-test.ts` from `apps/web/`.
 * Also runs automatically under `npm test` (opt-out discovery in run-tests.ts).
 *
 * ═══ WHY THIS FILE EXISTS SEPARATELY ═══
 *
 * `hub-registry-kv-test.ts` pins the WRITE path (`putTool`, `addRevenue` — the
 * money counters). `hub-dashboard-kv-test.ts` pins the PER-BUILDER read path,
 * shipped in #352 and finished in #449.
 *
 * Neither covers the GLOBAL read. That asymmetry is the whole of #149: two
 * passes converted `readBuilderTools`/`readBuilderHostedTools` to the honest
 * three-state shape and left `listRegisteredTools`/`listPublicHostedTools` — the
 * queries behind `GET /api/hub/tools`, `GET /api/hub/hosted` and the PAID
 * `blue-registry` x402 tool — on the raw `(await kvGet(K.index)) ?? []`. The
 * per-builder dashboard learned to say "we couldn't read it"; the marketplace
 * census kept answering a throttled Upstash read with `count: 0`.
 *
 * ═══ HOW TO READ A CASE ═══
 *
 * Same TRIPLE discipline as its sibling suites, all three legs load-bearing:
 *   ·A CONTROL — the OLD shape, reimplemented inline, asserted to LIE (report a
 *                confident zero under a fault). If this ever stops lying, the
 *                fix below is no longer protecting anything measurable.
 *   ·B FIX     — the REAL exported function, identical fault, asserted to say
 *                so via `coverage`.
 *   ·C HAPPY   — healthy KV, asserted to actually return the tools AND to report
 *                `complete`. Without it, "always report unavailable" would pass
 *                A and B forever.
 *
 * ═══ THE THIRD CASE IS NOT A KV CASE ═══
 *
 * Group T pins the payload-ordering bug found while fixing #149 and measured
 * before it was believed: the paid handler concatenated
 * `[...firstParty, ...community]` and then `.slice(0, 60)`, while the
 * first-party catalog alone is ~111 priced tools. Every community tool fell off
 * the end of an unfiltered response — deterministically, forever — under a
 * comment claiming community tools surfaced FIRST as a "discovery boost". No
 * KV fault involved: this one was broken on a healthy day.
 */

import { kv, kvSet, kvDel } from "../src/lib/kv";
import {
  readRegisteredTools,
  type RegisteredTool,
} from "../src/lib/hub-registry";
import {
  readPublicHostedTools,
  type HostedTool,
} from "../src/lib/hub-hosted";
import registryHandler from "../src/app/api/x402/_handlers/blue-registry";
// The REAL route, imported as a module: group C asserts a route-level response
// HEADER, which the library function underneath it cannot tell you anything about.
import * as hostedRoute from "../src/app/api/hub/hosted/route";
import { AGENT_TOOLS } from "../src/lib/agent-tools";
import { HOSTED_MODEL_DEFAULT } from "../src/lib/hosted-models";

let failures = 0;
function check(label: string, pass: boolean, detail: string) {
  console.log(`${pass ? "  ✓" : "  ✗"} ${label} — ${detail}`);
  if (!pass) failures++;
}

/** Swap in a `kv.get` that throws for the keys `fails()` selects; always restore.
 *  Writes keep working — that asymmetry is the shape of the Upstash cap outages
 *  (#123, #148), where reads are throttled but the database is fully alive. */
async function withReadFailureOn<T>(fails: (key: string) => boolean, fn: () => Promise<T>): Promise<T> {
  const real = kv.get.bind(kv);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).get = async (key: string) => {
    if (fails(key)) throw new Error("max requests limit exceeded");
    return real(key);
  };
  try { return await fn(); } finally { (kv as any).get = real; }
}

const withReadFailure = <T,>(fn: () => Promise<T>) => withReadFailureOn(() => true, fn);

// ─── Raw keys — SEEDING ONLY ─────────────────────────────────────────────────
// `K` is module-private in both registries, so the strings are duplicated here
// to seed. Every ASSERTION reads back through the exported API, so a key rename
// cannot make this suite quietly pass against the wrong key: the seed would land
// somewhere the control case cannot reach and the ·A leg would stop failing.
const EXT_INDEX  = "hub:tools:index";
const EXT_ITEM   = (id: string) => `hub:tools:item:${id}`;
const EXT_CALLS  = (id: string) => `hub:tools:calls:${id}`;
const HOST_INDEX = "hub:hosted:index";
const HOST_ITEM  = (s: string) => `hub:hosted:item:${s}`;

const TOOL_A = "census-tool-a";
const TOOL_B = "census-tool-b";
const HOST_A = "census-hosted-a";
const HOST_B = "census-hosted-b";

// Fully typed on purpose — NO `as RegisteredTool`. A cast would let this fixture
// keep compiling after a field is renamed in the real interface, and the suite
// would then be asserting against a shape production no longer writes. If this
// stops type-checking, that is the signal working.
function extTool(id: string): RegisteredTool {
  return {
    id, name: `Census ${id}`, description: "seeded by hub-census-kv-test",
    category: "test",
    endpoint: `https://example.invalid/api/x402/${id}`,
    inputs: [{ key: "q", label: "Query", placeholder: "…", required: true }],
    price: "$0.01", priceUSDC: 10_000,
    builderAddress: "0x0000000000000000000000000000000000000001",
    submittedAt: Date.now(), signature: "0xdeadbeef",
    verified: false, aiReady: true, status: "live",
  };
}

// Also fully typed — the `as unknown as HostedTool` this replaced was hiding
// four real mistakes (`template: "prompt"` is not a HostedTemplate, a `createdAt`
// field that does not exist, no `kind` on the config, four required fields
// missing). Group H asserts the secrets get STRIPPED from this object, so a
// fixture that doesn't match the real shape is asserting against nothing.
function hostTool(slug: string): HostedTool {
  return {
    slug, name: `Census ${slug}`, description: "seeded by hub-census-kv-test",
    category: "test", template: "ai_tool",
    price: "$0.01", priceUSDC: 10_000,
    builderAddress: "0x0000000000000000000000000000000000000001",
    inputs: [{ key: "q", label: "Query", placeholder: "…", required: true }],
    submittedAt: Date.now(),
    // ⚠ Both of these must be absent from the PUBLIC projection — that is what
    // group H checks. Keep them non-empty so an "absent" assertion cannot pass
    // by accident on a falsy value.
    signature: "0xdeadbeef",
    config: { kind: "ai_tool", systemPrompt: "SECRET-PROMPT", model: HOSTED_MODEL_DEFAULT },
    verified: false,
  };
}

async function reset() {
  await Promise.all([
    kvDel(EXT_INDEX), kvDel(EXT_ITEM(TOOL_A)), kvDel(EXT_ITEM(TOOL_B)),
    kvDel(EXT_CALLS(TOOL_A)), kvDel(EXT_CALLS(TOOL_B)),
    kvDel(HOST_INDEX), kvDel(HOST_ITEM(HOST_A)), kvDel(HOST_ITEM(HOST_B)),
  ]);
}

async function seedExternal() {
  await kvSet(EXT_INDEX, [TOOL_A, TOOL_B]);
  await kvSet(EXT_ITEM(TOOL_A), extTool(TOOL_A));
  await kvSet(EXT_ITEM(TOOL_B), extTool(TOOL_B));
}

/** The OLD body of `listRegisteredTools`, reimplemented verbatim for ·A legs. */
async function legacyListRegisteredTools(): Promise<RegisteredTool[]> {
  const ids = (await kv.get<string[]>(EXT_INDEX).catch(() => null)) ?? [];
  if (ids.length === 0) return [];
  const items = await Promise.all(
    ids.map((id) => kv.get<RegisteredTool>(EXT_ITEM(id)).catch(() => null)),
  );
  return items.filter((t): t is RegisteredTool => !!t);
}

async function main() {
  console.log("\n#149 — the public census: a KV outage is not an empty marketplace\n");

  // ── 0. SAFETY GATE ────────────────────────────────────────────────────────
  // This suite writes `hub:tools:index` and `hub:hosted:index` — the master
  // lists of every tool in the live marketplace — and its control cases are
  // deliberately destructive. Refuse to run against real credentials. (Memory
  // #155: `.env.local` points at a STALE KV, and "it's only the dev database"
  // is not a defence when the key names are byte-identical.)
  const liveKv = (process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL)
              && (process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN);
  if (liveKv) {
    console.error("  ✗ ABORT — KV credentials are set. This suite writes hub:tools:index /");
    console.error("            hub:hosted:index. Run it with no KV env.");
    process.exit(1);
  }
  console.log("  ✓ safety gate — no KV credentials; running against the in-memory fallback\n");

  // ══ E. EXTERNAL registry — the index itself is unreadable ═════════════════
  //
  // The worst case and the one that shipped: KV throttled, `GET /api/hub/tools`
  // answers `{tools: [], count: 0}` with a 200, and every consumer renders "no
  // community tools yet". We know NOTHING here; a zero is the absence of an
  // answer, not an answer of zero.

  console.log("E-A. CONTROL — old `(await kvGet(index)) ?? []`, index read failing:");
  await reset(); await seedExternal();
  const legacyDark = await withReadFailure(legacyListRegisteredTools);
  check(
    "the old shape reports a CONFIDENT ZERO for a registry it never read",
    legacyDark.length === 0,
    `${legacyDark.length} tools, and no field anywhere distinguishes this from an empty Hub`,
  );

  console.log("\nE-B. FIX — `readRegisteredTools()`, identical fault:");
  await reset(); await seedExternal();
  const darkRead = await withReadFailure(readRegisteredTools);
  check(
    "coverage says `unavailable`",
    darkRead.coverage === "unavailable",
    `coverage=${darkRead.coverage}`,
  );
  check(
    "the empty list is still empty — we do NOT invent the tools we couldn't read",
    darkRead.tools.length === 0,
    `${darkRead.tools.length} tools returned`,
  );

  console.log("\nE-C. HAPPY — healthy KV:");
  await reset(); await seedExternal();
  const okRead = await readRegisteredTools();
  check(
    "both seeded tools come back",
    okRead.tools.length === 2,
    `${okRead.tools.length} tools: ${okRead.tools.map((t) => t.id).join(", ")}`,
  );
  check(
    "coverage says `complete`",
    okRead.coverage === "complete",
    `coverage=${okRead.coverage}`,
  );

  // ══ I. EXTERNAL registry — index readable, ONE ITEM is not ════════════════
  //
  // The middle rung, and the one an "is KV up?" boolean cannot express: we know
  // the marketplace has 2 tools and we can only show 1. `count` is a FLOOR.

  console.log("\nI-A. CONTROL — old shape, one item read failing:");
  await reset(); await seedExternal();
  const legacyShort = await withReadFailureOn((k) => k === EXT_ITEM(TOOL_B), legacyListRegisteredTools);
  check(
    "the old shape silently drops the unreadable tool",
    legacyShort.length === 1,
    `${legacyShort.length} of 2 tools, reported as if it were the whole registry`,
  );

  console.log("\nI-B. FIX — same fault:");
  await reset(); await seedExternal();
  const partialRead = await withReadFailureOn((k) => k === EXT_ITEM(TOOL_B), readRegisteredTools);
  check(
    "coverage says `partial` — the count is a floor, not a sum",
    partialRead.coverage === "partial",
    `coverage=${partialRead.coverage}`,
  );
  check(
    "the readable tool is STILL returned — a partial census beats no census",
    partialRead.tools.length === 1 && partialRead.tools[0].id === TOOL_A,
    `${partialRead.tools.length} tool(s): ${partialRead.tools.map((t) => t.id).join(", ")}`,
  );
  check(
    "the unreadable id is NAMED, not merely counted",
    partialRead.unreadableIds.includes(TOOL_B),
    `unreadableIds=[${partialRead.unreadableIds.join(", ")}]`,
  );

  // ══ N. The middle-middle rung — a NULL COUNTER alone ══════════════════════
  //
  // Salvaged from the stranded branch (commit c663167e, "pin the middle rung").
  // Every tool record read fine; only a stats counter failed. The tool list is
  // complete, so it is tempting to call this `complete` — but `callCount: null`
  // is on the wire and a consumer summing call counts would under-report. The
  // read is `partial` and the deliberate asymmetry in `readRegisteredTool`
  // (item failure → drop; counter failure → keep the tool, null the number)
  // is what makes that survivable.

  console.log("\nN-B. FIX — every item readable, ONE COUNTER failing:");
  await reset(); await seedExternal();
  await kvSet(EXT_CALLS(TOOL_A), 7);
  const counterRead = await withReadFailureOn((k) => k === EXT_CALLS(TOOL_B), readRegisteredTools);
  check(
    "a null counter ALONE is enough to report `partial`",
    counterRead.coverage === "partial",
    `coverage=${counterRead.coverage}`,
  );
  check(
    "no tool is dropped — a stats read must never hide a live listing",
    counterRead.tools.length === 2,
    `${counterRead.tools.length} tools`,
  );
  check(
    "unreadableIds stays EMPTY — nothing about the tool was unreadable",
    counterRead.unreadableIds.length === 0,
    `unreadableIds=[${counterRead.unreadableIds.join(", ")}]`,
  );
  check(
    "the unread counter is `null`, not 0 — `?? 0` at the render site re-creates the bug",
    counterRead.tools.find((t) => t.id === TOOL_B)?.callCount === null,
    `callCount=${JSON.stringify(counterRead.tools.find((t) => t.id === TOOL_B)?.callCount)}`,
  );

  // ══ M. The one case allowed to render as "nobody has built anything" ══════

  console.log("\nM-C. HAPPY — genuinely empty registry (index MISSING, KV healthy):");
  await reset();
  const emptyRead = await readRegisteredTools();
  check(
    "a genuine miss reports `complete` — an empty Hub is a FACT, and sayable",
    emptyRead.coverage === "complete" && emptyRead.tools.length === 0,
    `coverage=${emptyRead.coverage}, ${emptyRead.tools.length} tools`,
  );

  // ══ H. HOSTED registry — the twin ═════════════════════════════════════════
  //
  // The two halves drifting apart is precisely how #150 part 3 happened: the
  // hosted half was swept and the external half was not, and the twins disagreed
  // for months. Fix both or neither — so test both or neither.

  console.log("\nH-B. FIX — hosted index unreadable:");
  await reset();
  await kvSet(HOST_INDEX, [HOST_A]);
  await kvSet(HOST_ITEM(HOST_A), hostTool(HOST_A));
  const hostDark = await withReadFailure(readPublicHostedTools);
  check(
    "coverage says `unavailable`",
    hostDark.coverage === "unavailable",
    `coverage=${hostDark.coverage}`,
  );

  console.log("\nH-C. HAPPY — healthy KV:");
  await reset();
  await kvSet(HOST_INDEX, [HOST_A]);
  await kvSet(HOST_ITEM(HOST_A), hostTool(HOST_A));
  const hostOk = await readPublicHostedTools();
  check(
    "the hosted tool comes back with coverage `complete`",
    hostOk.tools.length === 1 && hostOk.coverage === "complete",
    `${hostOk.tools.length} tool(s), coverage=${hostOk.coverage}`,
  );
  check(
    "secrets are STILL stripped on the honest path (config + signature gone)",
    hostOk.tools.length === 1
      && !("config" in hostOk.tools[0])
      && !("signature" in hostOk.tools[0]),
    `keys: ${hostOk.tools.length ? Object.keys(hostOk.tools[0]).join(",") : "—"}`,
  );

  console.log("\nH-D. DISCRIMINATION — a genuinely empty hosted registry:");
  await reset();
  const hostMiss = await readPublicHostedTools();
  check(
    "an index MISS reports `complete` on the hosted half too",
    hostMiss.coverage === "complete" && hostMiss.tools.length === 0,
    `coverage=${hostMiss.coverage}, ${hostMiss.tools.length} tools`,
  );

  console.log("\nH-E. PARTIAL — one hosted record dark, the other still served:");
  await reset();
  await kvSet(HOST_INDEX, [HOST_A, HOST_B]);
  await kvSet(HOST_ITEM(HOST_A), hostTool(HOST_A));
  await kvSet(HOST_ITEM(HOST_B), hostTool(HOST_B));
  const hostPartial = await withReadFailureOn(
    (k) => k === HOST_ITEM(HOST_B),
    readPublicHostedTools,
  );
  check(
    "coverage says `partial` — the hosted count is a floor",
    hostPartial.coverage === "partial",
    `coverage=${hostPartial.coverage}`,
  );
  check(
    "the readable hosted tool is STILL served, and the dark slug is NAMED",
    hostPartial.tools.length === 1
      && hostPartial.tools[0].slug === HOST_A
      && hostPartial.unreadableSlugs.join() === HOST_B,
    `${hostPartial.tools.length} tool(s), unreadableSlugs=[${hostPartial.unreadableSlugs.join()}]`,
  );

  // ══ C. The EDGE CACHE — the half that outlives the outage ══════════════════
  //
  // `/api/hub/hosted` is the one census route that was cacheable, and an
  // incomplete read is the single thing it must never hand to a CDN: a 60s
  // `s-maxage` on a throttled Upstash read pins "0 hosted tools" in front of
  // every visitor for a minute, and `stale-while-revalidate=300` keeps serving
  // that for five more. The fix outlasts the outage by 6 minutes if it is
  // wrong, so it is asserted here rather than trusted.
  //
  // Asserted through the REAL route handler — the header is route-level, so
  // testing the library function alone would prove nothing about it.

  console.log("\nC-A. CACHE — an incomplete read must NOT reach the CDN:");
  await reset();
  await kvSet(HOST_INDEX, [HOST_A]);
  await kvSet(HOST_ITEM(HOST_A), hostTool(HOST_A));
  const ccDarkRes  = await withReadFailure(hostedRoute.GET);
  const ccDarkCC   = ccDarkRes.headers.get("cache-control") ?? "";
  const ccDarkBody = await ccDarkRes.json();
  check(
    "no-store under an outage — nothing to pin, nothing to revalidate stale",
    ccDarkCC === "no-store",
    `Cache-Control: ${ccDarkCC || "(none)"}`,
  );
  check(
    "the response still SAYS it is unreadable rather than publishing count: 0 bare",
    ccDarkBody.coverage === "unavailable" && ccDarkBody.count === 0,
    `coverage=${ccDarkBody.coverage}, count=${ccDarkBody.count}`,
  );

  console.log("\nC-B. CACHE — and it comes BACK when the read is complete:");
  await reset();
  await kvSet(HOST_INDEX, [HOST_A]);
  await kvSet(HOST_ITEM(HOST_A), hostTool(HOST_A));
  const okRes  = await hostedRoute.GET();
  const okCC   = okRes.headers.get("cache-control") ?? "";
  const okBody = await okRes.json();
  check(
    "a complete read is cacheable again — the fix is conditional, not a blanket no-store",
    okCC.includes("s-maxage=60") && okCC.includes("stale-while-revalidate=300"),
    `Cache-Control: ${okCC || "(none)"}`,
  );
  check(
    "and it carries the real hosted tool",
    okBody.coverage === "complete" && okBody.count === 1,
    `coverage=${okBody.coverage}, count=${okBody.count}`,
  );

  // ══ T. The PAID handler — truncation, with no KV fault at all ═════════════
  //
  // `blue-registry` costs $0.05 and its product IS this census. Community tools
  // were concatenated AFTER ~111 first-party entries and the payload capped at
  // 60, so an unfiltered response could not contain a single community tool
  // while still advertising `totals.community` and inviting builders to register.

  const pricedCount = AGENT_TOOLS.filter((t) => !!t.price).length;
  console.log(`\nT. PAID handler — ${pricedCount} priced first-party tools vs a 60-item cap:`);
  check(
    "the premise holds: first-party alone already overflows the cap",
    pricedCount > 60,
    `${pricedCount} priced tools > 60`,
  );

  await reset(); await seedExternal();
  const res  = await registryHandler(new Request("https://blueagent.dev/api/x402/blue-registry"));
  const body = await res.json() as {
    tools: { id: string; source: string }[];
    totals: { community: number };
    registry_coverage: string;
    tools_truncated: boolean;
  };

  check(
    "a community tool is actually PRESENT in an unfiltered response",
    body.tools.some((t) => t.id === TOOL_A),
    `${body.tools.filter((t) => t.source === "community").length} community entries in the payload`,
  );
  check(
    "totals.community agrees with what the payload can show",
    body.totals.community === 2,
    `totals.community=${body.totals.community}`,
  );
  check(
    "the cap is DECLARED rather than silent",
    body.tools_truncated === true,
    `tools_truncated=${body.tools_truncated}`,
  );
  check(
    "registry_coverage rides along on the paid response",
    body.registry_coverage === "complete",
    `registry_coverage=${body.registry_coverage}`,
  );

  console.log("\nT-B. PAID handler under a KV outage:");
  await reset(); await seedExternal();
  const darkRes  = await withReadFailure(() =>
    registryHandler(new Request("https://blueagent.dev/api/x402/blue-registry")));
  const darkBody = await darkRes.json() as {
    totals: { community: number; first_party: number };
    registry_coverage: string;
    registry_note?: string;
  };
  check(
    "a paying caller is TOLD the community half is unreadable",
    darkBody.registry_coverage === "unavailable" && !!darkBody.registry_note,
    `registry_coverage=${darkBody.registry_coverage}, note=${darkBody.registry_note ? "present" : "MISSING"}`,
  );
  check(
    "the first-party catalog is unaffected — it is compiled in, not read from KV",
    darkBody.totals.first_party === pricedCount,
    `first_party=${darkBody.totals.first_party} of ${pricedCount}`,
  );

  console.log("\nT-C. PAID handler under a PARTIAL read — the dangerous middle:");
  //
  // The outage in T-B is loud: everything is dark, `unavailable`, obvious. THIS
  // is the one that reads as normal — the index and one item come back fine, so
  // the response is well-formed, populated, and WRONG BY ONE. A paying caller
  // whose product IS this census gets `totals.community: 1` when the answer is
  // 2, and nothing in the shape of the payload says so. The number has to be
  // labelled a FLOOR at the point of sale, and the missing id has to be named
  // so the caller can retry exactly it instead of re-buying the whole census.
  await reset(); await seedExternal();
  const partRes  = await withReadFailureOn(
    (key) => key === EXT_ITEM(TOOL_B),
    () => registryHandler(new Request("https://blueagent.dev/api/x402/blue-registry")),
  );
  const partBody = await partRes.json() as {
    tools: { id: string }[];
    totals: { community: number };
    registry_coverage: string;
    registry_note?: string;
    registry_unreadable_ids?: string[];
  };
  check(
    "coverage is `partial`, not the `complete` a well-formed payload would imply",
    partBody.registry_coverage === "partial",
    `registry_coverage=${partBody.registry_coverage}`,
  );
  check(
    "the note says FLOOR in so many words — a caller must not read the total as a count",
    /floor/i.test(partBody.registry_note ?? ""),
    partBody.registry_note ? `"${partBody.registry_note.slice(0, 60)}…"` : "NO NOTE",
  );
  check(
    "the short total is exactly the undercount it claims to be (1 served, 2 exist)",
    partBody.totals.community === 1,
    `totals.community=${partBody.totals.community}, truth=2`,
  );
  check(
    "the readable tool is still SERVED — one dark record does not blank the shelf",
    partBody.tools.some((t) => t.id === TOOL_A),
    `${partBody.tools.filter((t) => t.id.startsWith("census-")).length} seeded tool(s) in the payload`,
  );
  check(
    "and the unreadable id is NAMED, so the retry is one key not the whole census",
    (partBody.registry_unreadable_ids ?? []).includes(TOOL_B),
    `registry_unreadable_ids=${JSON.stringify(partBody.registry_unreadable_ids ?? [])}`,
  );

  await reset();

  console.log(`\n${failures === 0 ? "✓ all census cases passed" : `✗ ${failures} failure(s)`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
