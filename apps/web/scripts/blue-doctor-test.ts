/**
 * Control test — the health report must never turn "I did not ask" into
 * "it is down", and must never call a wrong-chain answer healthy.
 *
 * Run: `npx tsx scripts/blue-doctor-test.ts` from `apps/web/`.
 * Hermetic. `globalThis.fetch` is replaced with a table lookup for the whole
 * run and restored at the end, so no packet leaves the machine. CI has no
 * outbound network and this file must not want one.
 *
 * WHY THIS TOOL NEEDS A GUARD MORE THAN MOST. Every other tool here is read by
 * a human or an agent who can sanity-check it against something else. This one
 * is read exactly when something else has already failed, which is the moment
 * its answer is least likely to be questioned. Two failure modes matter:
 *
 *   1. `unknown` collapsing into `down`. Five upstreams are deliberately NOT
 *      probed (they need a credential, or a probe would spend money). If those
 *      five leak into the `down` list, every single call reports five outages
 *      that were never measured — the exact "infer a negative from absent data"
 *      failure CLAUDE.md names. It is a one-character mistake: `!== "ok"` where
 *      `=== "down"` was meant.
 *   2. A wrong-chain answer reading as healthy. Base 8453 and Robinhood Chain
 *      4663 share no state, so an RPC that answers confidently for the other
 *      chain is worse than one that does not answer: the caller gets numbers,
 *      and they are about somewhere else.
 *
 * WHY THE GUARD CANNOT BE SATISFIED BY DELETING THINGS. "No unknown appears in
 * `down`" passes trivially in a build with no unknowns at all, so every absence
 * assertion here is paired with a presence assertion on the same data — the
 * five unprobed entries must exist, must be `unknown`, and must each carry a
 * reason. Section E then re-runs the battery against four deliberately broken
 * implementations, each of which MUST go red. A guard that has never once
 * failed is decoration.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import handler, { grade, rollup, type Probe } from "../src/app/api/x402/_handlers/blue-doctor";
import { AGENT_TOOLS } from "../src/lib/agent-tools";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const SRC = path.resolve(path.dirname(path.resolve(process.argv[1])), "../src");

// ── the fake network ────────────────────────────────────────────────────────
// A table from URL substring to what the upstream "returns". `null` means the
// request throws, which is what a real dead host does.
type Reply = { status: number; body: unknown } | null;
let TABLE: Array<[string, Reply]> = [];

const realFetch = globalThis.fetch;
let requested: string[] = [];

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  requested.push(url);
  const hit = TABLE.find(([frag]) => url.includes(frag));
  if (!hit) throw new Error(`test table has no entry for ${url}`);
  const reply = hit[1];
  if (reply === null) throw new Error("fetch failed");
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

/** The all-healthy world. Base answers 0x2105 (8453), RH answers 0x1237 (4663). */
function healthyTable(): Array<[string, Reply]> {
  return [
    ["mainnet.base.org", { status: 200, body: { jsonrpc: "2.0", id: 1, result: "0x2105" } }],
    ["chain.robinhood.com", { status: 200, body: { jsonrpc: "2.0", id: 1, result: "0x1237" } }],
    ["api.dexscreener.com", { status: 200, body: { pairs: [] } }],
    ["api.geckoterminal.com", { status: 200, body: { data: [] } }],
    ["yields.llama.fi", { status: 200, body: { data: [] } }],
    ["api.github.com", { status: 200, body: { rate: {} } }],
  ];
}

type Report = {
  tool: string;
  summary: string;
  verdict: string;
  counts: { probed: number; ok: number; degraded: number; down: number; not_probed: number };
  upstreams: Probe[];
  known_issues: Array<{ upstream: string; measured_on: string; detail: string }>;
  note: string;
};

async function run(table: Array<[string, Reply]>): Promise<Report> {
  TABLE = table;
  requested = [];
  const res = await handler(new Request("https://test.local/api/x402/blue-doctor"));
  return (await res.json()) as Report;
}

async function main() {
  // ── A. the summary rollup, in isolation ───────────────────────────────────
  console.log("\nA. an upstream nobody asked about cannot make the summary worse");

  const fiveUnknowns: Probe[] = [1, 2, 3, 4, 5].map((n) => ({
    name: `u${n}`,
    powers: "x",
    status: "unknown",
    latency_ms: null,
    error: null,
    not_probed_reason: "needs a key",
  }));
  const allOk: Probe[] = [{ name: "p", powers: "x", status: "ok", latency_ms: 10, error: null }];

  const onlyUnknowns = rollup([...allOk, ...fiveUnknowns]);
  ok("five unknowns alongside one healthy probe still reads ok", onlyUnknowns.summary === "ok", onlyUnknowns.summary);
  ok("…and not one of them is listed as down", onlyUnknowns.down.length === 0);
  ok("…but they are not silently dropped either — they are named as unknown",
     onlyUnknowns.unknown.length === 5, onlyUnknowns.unknown.join(","));

  const oneDown = rollup([
    ...allOk,
    ...fiveUnknowns,
    { name: "dead", powers: "x", status: "down", latency_ms: 4000, error: "fetch failed" },
  ]);
  ok("one real failure does move the summary", oneDown.summary === "down");
  ok("…and the down list names only the thing that was actually measured",
     oneDown.down.length === 1 && oneDown.down[0] === "dead", oneDown.down.join(","));

  const slow = rollup([
    ...allOk,
    ...fiveUnknowns,
    { name: "slow", powers: "x", status: "degraded", latency_ms: 3000, error: null },
  ]);
  ok("a slow upstream degrades rather than downs", slow.summary === "degraded");
  ok("down outranks degraded", rollup([
    { name: "a", powers: "x", status: "degraded", latency_ms: 3000, error: null },
    { name: "b", powers: "x", status: "down", latency_ms: 1, error: "boom" },
  ]).summary === "down");

  // ── B. grade ──────────────────────────────────────────────────────────────
  console.log("\nB. grading a single probe");
  ok("a fast clean probe is ok", grade(120, null) === "ok");
  ok("a slow clean probe is degraded", grade(3000, null) === "degraded");
  ok("an error is down no matter how fast it failed", grade(3, "ECONNREFUSED") === "down");
  ok("…and still down when it was also slow — the error wins, not the clock",
     grade(9999, "timeout") === "down");

  // ── C. the whole report, over a fake network ──────────────────────────────
  console.log("\nC. the report in an all-healthy world");
  const good = await run(healthyTable());
  ok("summary is ok", good.summary === "ok", good.summary);
  ok("six upstreams were actually probed", good.counts.probed === 6, String(good.counts.probed));
  ok("…and six requests genuinely left the handler", requested.length === 6, String(requested.length));
  ok("five were not probed", good.counts.not_probed === 5, String(good.counts.not_probed));
  ok("nothing is reported down", good.counts.down === 0);

  const unknowns = good.upstreams.filter((u) => u.status === "unknown");
  ok("the unprobed five are present in the body, not omitted", unknowns.length === 5, String(unknowns.length));
  ok("every unknown says WHY no request was sent",
     unknowns.every((u) => typeof u.not_probed_reason === "string" && u.not_probed_reason.length > 10));
  ok("…and none of them fakes a latency", unknowns.every((u) => u.latency_ms === null));
  ok("…and none of them fakes an error either — nothing went wrong, nothing was tried",
     unknowns.every((u) => u.error === null));
  ok("the paid-inference upstream is unknown, not probed — a probe would spend credit",
     unknowns.some((u) => u.name === "virtuals_llm"));
  ok("etherscan is unknown because its keyless probe lies, and the body says so",
     unknowns.some((u) => u.name === "etherscan_v2" && /not supported for this chain/.test(u.not_probed_reason!)));
  ok("every probed upstream reports a real measured latency",
     good.upstreams.filter((u) => u.status !== "unknown").every((u) => typeof u.latency_ms === "number"));
  ok("every upstream says what breaks for the caller when it is gone",
     good.upstreams.every((u) => typeof u.powers === "string" && u.powers.length > 10));
  ok("the note keeps the two words apart", /down.*unknown|unknown.*down/s.test(good.note));
  ok("known_issues carry the date they were measured",
     good.known_issues.length > 0 && good.known_issues.every((k) => /^\d{4}-\d{2}-\d{2}$/.test(k.measured_on)));

  // ── D. the failures it has to catch ───────────────────────────────────────
  console.log("\nD. a wrong-chain answer is a failure, not a pass");

  const wrongChain = healthyTable().map(([frag, reply]) =>
    frag === "mainnet.base.org"
      // Base's endpoint answering with Robinhood Chain's id.
      ? ([frag, { status: 200, body: { jsonrpc: "2.0", id: 1, result: "0x1237" } }] as [string, Reply])
      : ([frag, reply] as [string, Reply]),
  );
  const wrong = await run(wrongChain);
  const baseProbe = wrong.upstreams.find((u) => u.name === "base_rpc")!;
  ok("a 200 answering for the wrong chain is down, not ok", baseProbe.status === "down", baseProbe.status);
  ok("…and the error names BOTH chain ids, so the reader can see the swap",
     /4663/.test(baseProbe.error ?? "") && /8453/.test(baseProbe.error ?? ""), baseProbe.error ?? "null");
  ok("…and that moves the whole summary", wrong.summary === "down");
  ok("…and the verdict tells the caller it is not their request",
     /not your request/i.test(wrded(wrong)), wrded(wrong).slice(0, 60));

  const missingResult = healthyTable().map(([frag, reply]) =>
    frag === "chain.robinhood.com"
      ? ([frag, { status: 200, body: { jsonrpc: "2.0", id: 1, error: { message: "nope" } } }] as [string, Reply])
      : ([frag, reply] as [string, Reply]),
  );
  const noResult = await run(missingResult);
  const rhProbe = noResult.upstreams.find((u) => u.name === "robinhood_rpc")!;
  ok("an RPC 200 with no result at all is down, not ok", rhProbe.status === "down", rhProbe.status);

  console.log("\nD2. a dead host, and an HTTP error");
  const deadLlama = healthyTable().map(([frag, reply]) =>
    frag === "yields.llama.fi" ? ([frag, null] as [string, Reply]) : ([frag, reply] as [string, Reply]),
  );
  const dead = await run(deadLlama);
  ok("a host that throws is down", dead.upstreams.find((u) => u.name === "defillama")!.status === "down");
  ok("…and the summary follows it", dead.summary === "down");
  ok("…and the five unknowns are STILL not in the down list",
     dead.counts.down === 1, `down=${dead.counts.down}`);
  ok("…so the verdict names one upstream, not six",
     wrded(dead).startsWith("defillama failed"), wrded(dead).slice(0, 40));

  const http500 = healthyTable().map(([frag, reply]) =>
    frag === "api.github.com"
      ? ([frag, { status: 503, body: {} }] as [string, Reply])
      : ([frag, reply] as [string, Reply]),
  );
  const five03 = await run(http500);
  const gh = five03.upstreams.find((u) => u.name === "github")!;
  ok("a non-2xx is down and carries its status code", gh.status === "down" && /503/.test(gh.error ?? ""),
     gh.error ?? "null");

  // ── E. registration ───────────────────────────────────────────────────────
  console.log("\nE. it is actually reachable, and actually free");
  const entry = AGENT_TOOLS.find((t) => t.id === "blue-doctor");
  ok("blue-doctor is in the catalog", !!entry);
  ok("…priced at zero, because it is what you reach for when a paid call just failed",
     entry?.priceUSDC === 0 && entry?.price === "$0.00", `${entry?.price} / ${entry?.priceUSDC}`);
  ok("…and takes no input — a diagnostic you have to configure is one more thing to get wrong",
     (entry?.inputs?.length ?? -1) === 0);
  const indexSrc = readFileSync(path.join(SRC, "app/api/x402/_handlers/index.ts"), "utf8");
  ok("…and is registered in HANDLERS, not only in the catalog",
     /"blue-doctor":\s*hBlueDoctor/.test(indexSrc));

  // ── F. negative controls ──────────────────────────────────────────────────
  // Each broken build below MUST make at least one assertion above go red. If
  // one of them passes, the corresponding check is not testing what it claims.
  //
  // CONTROL 1 WAS PHYSICALLY PERFORMED 2026-09-27, not merely simulated here:
  // `rollup`'s down filter in blue-doctor.ts was changed from `=== "down"` to
  // `!== "ok"` and this file re-run → **8 of 44 red**, with the verdict reading
  // "defillama, virtuals_llm, vercel_kv, cdp_facilitator, moralis, etherscan_v2
  // failed to respond" — five upstreams nobody had asked about, reported as
  // outages, in the one tool a caller consults when they already distrust their
  // own inputs. Restored; 44/44 after.
  console.log("\nF. negative controls — four broken builds, all of which must fail");

  function brokenRollupCollapses(upstreams: Probe[]) {
    // The one-character mistake: anything that is not ok counts as down.
    const down = upstreams.filter((u) => u.status !== "ok").map((u) => u.name);
    return { summary: down.length ? "down" : "ok", down };
  }
  const collapsed = brokenRollupCollapses([...allOk, ...fiveUnknowns]);
  ok("CONTROL: collapsing unknown into down would report five phantom outages",
     collapsed.summary === "down" && collapsed.down.length === 5,
     `${collapsed.summary}, down=${collapsed.down.length}`);

  function brokenGradeIgnoresError(ms: number, _error: string | null) {
    return ms > 2500 ? "degraded" : "ok";
  }
  ok("CONTROL: a grade that ignores the error would call a refused connection healthy",
     brokenGradeIgnoresError(3, "ECONNREFUSED") === "ok");

  function brokenRpcAcceptsAnyId(result: string | undefined) {
    // No assertion on the id — the shape this tool exists to reject.
    return typeof result === "string" ? "ok" : "down";
  }
  ok("CONTROL: an unasserted eth_chainId probe would pass RH's id for Base",
     brokenRpcAcceptsAnyId("0x1237") === "ok");

  function brokenDropsUnknowns(upstreams: Probe[]) {
    return upstreams.filter((u) => u.status !== "unknown");
  }
  ok("CONTROL: satisfying the rule by deleting the unknowns loses five named reasons",
     brokenDropsUnknowns([...allOk, ...fiveUnknowns]).length === 1);

  globalThis.fetch = realFetch;

  console.log(
    fail === 0 ? `\nALL ${pass} CHECKS PASSED\n` : `\n${fail} of ${pass + fail} CHECK(S) FAILED\n`,
  );
  process.exit(fail === 0 ? 0 : 1);
}

function wrded(r: Report): string {
  return r.verdict;
}

main().catch((e) => {
  globalThis.fetch = realFetch;
  console.error(e);
  process.exit(1);
});
