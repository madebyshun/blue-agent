/**
 * Guard: the 5 console commands must reach the wire with `reasoning_effort:"none"`,
 * and every other caller must NOT.
 *
 * Run: `npx tsx scripts/console-reasoning-check.ts` (from apps/web). Exit 0 = pass.
 * Hermetic — `globalThis.fetch` is stubbed, no network, no API key needed.
 *
 * WHY IT EXISTS
 * -------------
 * `blue build` returned 502 in production. MEASURED 2026-09-27: the model's
 * hidden reasoning phase bills from the SAME `max_tokens` pocket as the answer
 * and is unbounded — 5697 / 9109 / 5492 reasoning tokens across three runs of
 * the same prompt. The 9109 draw consumed the entire 9000-token wire budget:
 * `finish_reason="length"`, `content_len=0`, i.e. the caller paid $0.50 for
 * nothing. `reasoning_effort:"none"` removes the phase (0 tokens, 4/4) and
 * drops build from 40-54s to 10-15s.
 *
 * 🔴 Two directions, and BOTH are the point:
 *
 * 1. PRESENT for the console commands. This is the fix. It is one optional
 *    field threaded through three files (console-systems → callLLM →
 *    callVirtualsLLM); dropping it anywhere in that chain is silent — the
 *    request still succeeds, it just costs 5x and truncates on a bad draw.
 *    Nothing else would go red.
 *
 * 2. ABSENT for everyone else. PR #211 sent extra payload keys and Virtuals
 *    answered `400 Unrecognized key(s)`; PR #212 stripped them back to the
 *    OpenAI-compat minimum. That 400 is gone as of 2026-09-26 — but "the
 *    gateway tolerates it today" is not a reason to broadcast it to all ~46
 *    callers. The narrow opt-in is the whole design, so the negative case is
 *    tested as hard as the positive one.
 *
 * Case 3 pins the two DISPATCHERS rather than the transport: the browser/MCP
 * route and the $0.50 paid x402 handler are separate files that must not
 * diverge. Wiring one and forgetting the other is exactly how a paid surface
 * ends up slower and more fragile than the free one.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (cond) pass++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

// ── fetch stub ───────────────────────────────────────────────────────────────
// Serves the model catalog so the pre-flight validation passes, then captures
// the chat body verbatim. Returns a well-formed completion so callVirtualsLLM
// takes its success path and never triggers the reasoning-starvation retry
// (which would itself send `reasoning_effort` and mask a missing opt-in).
type Sent = { reasoning_effort?: string; max_tokens?: number };
const sent: Sent[] = [];

function installStub(modelId: string) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/v1/models")) {
      return new Response(JSON.stringify({ data: [{ id: modelId }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    sent.push(JSON.parse(String(init?.body ?? "{}")) as Sent);
    return new Response(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "ok" } }],
        usage: { completion_tokens: 2, completion_tokens_details: { reasoning_tokens: 0 } },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
}

async function main() {
  process.env.VIRTUALS_API_KEY ||= "stub-key-not-a-secret";
  const { VIRTUALS_DEFAULT_MODEL, callLLM } = await import("../src/app/api/_lib/llm");
  const { CONSOLE_REASONING_EFFORT, CONSOLE_SYSTEMS } = await import("../src/lib/console-systems");

  installStub(process.env.VIRTUALS_MODEL ?? VIRTUALS_DEFAULT_MODEL);

  // ── 1. opted in → the field is on the wire, first attempt ──────────────────
  await callLLM({ system: "s", user: "u", maxTokens: 100, reasoningEffort: "none" });
  check("1.1 an opted-in call sends reasoning_effort on the FIRST request",
        sent.length === 1 && sent[0].reasoning_effort === "none",
        `requests=${sent.length} value=${JSON.stringify(sent[0]?.reasoning_effort)}`);

  // ── 2. not opted in → the field is absent (the #211/#212 payload policy) ───
  sent.length = 0;
  await callLLM({ system: "s", user: "u", maxTokens: 100 });
  check("2.1 a default call sends NO reasoning_effort",
        sent.length === 1 && !("reasoning_effort" in sent[0]),
        `body_keys=${JSON.stringify(Object.keys(sent[0] ?? {}))}`);

  // ── 3. both dispatchers opt in, and every command is covered ──────────────
  const commands = Object.keys(CONSOLE_SYSTEMS);
  check("3.1 every console command has an entry in CONSOLE_REASONING_EFFORT",
        commands.every((c) => CONSOLE_REASONING_EFFORT[c as keyof typeof CONSOLE_REASONING_EFFORT] === "none"),
        `commands=${commands.join(",")}`);

  // Source-text assertions: a route.ts may not export its internals, and the
  // x402 handler needs a paid request to run, so the call sites are read
  // rather than invoked. Both must pass the map through, not a literal.
  for (const [label, rel] of [
    ["browser + MCP dispatcher", "src/app/api/console/route.ts"],
    ["paid x402 dispatcher",     "src/app/api/x402/_handlers/_console.ts"],
  ] as const) {
    const src = readFileSync(resolve(__dirname, "..", rel), "utf8");
    check(`3.2 ${label} passes reasoningEffort from CONSOLE_REASONING_EFFORT`,
          /reasoningEffort:\s*CONSOLE_REASONING_EFFORT\[/.test(src), rel);
  }

  console.log(`\nconsole reasoning-effort guard: ${pass} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main();
