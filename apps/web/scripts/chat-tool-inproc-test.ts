/**
 * chat-tool-inproc-test — chat runs a Hub tool IN THIS PROCESS, and still bills
 * it exactly as the x402 route's internal branch does.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until 2026-10-01 chat's `callHubTool` reached every catalog tool with
 * `fetch(`${NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev"}/api/x402/<id>`)`.
 * That URL is PRODUCTION from every preview and from localhost, so a branch's
 * tool changes were never exercised from chat: MEASURED on the rebuild preview
 * 2026-09-30, honeypot / risk-gate answered with prod's "SAFE 70%" while the
 * branch said UNKNOWN, and before the preview was handed prod's exact
 * INTERNAL_SERVICE_KEY every tool answered "payment required". Chat now calls
 * `runInternalTool` (lib/x402-internal-run.ts) — the same function the route's
 * internal branch calls — and this suite pins both halves of that:
 *
 *   1. NO request leaves for /api/x402/* on any chat tool turn. Every outbound
 *      fetch is captured; a single one to that path fails the suite.
 *   2. Billing did not change on the way in-process: a paid tool that succeeds
 *      keeps exactly toolCreditCost and reports it on `tool_done.credits`; one
 *      that fails is debited and then refunded, and reports 0; a guest gets
 *      WALLET_REQUIRED instead of a free paid run.
 *
 * NEGATIVE CONTROLS — revert the line, this suite must go red:
 *   a. restore the fetch of BASE_URL + /api/x402/<id> in callHubTool ...... 1.1, 2.1, 3.1
 *   b. drop `user: userAddress` from the runInternalTool call ............ 1.2–1.4 (guest guard), 2.2
 *   c. pass `service: true` unconditionally ............................... 3.2 (guest runs free)
 *   d. delete returnCredits() from the !resp.ok path in the runner ........ 2.3, 2.4
 *
 * Hermetic: KV env cleared (in-memory ledger), every fetch stubbed — the LLM
 * returns a scripted tool call, NEXT_PUBLIC_APP_URL points at an .invalid host,
 * and the tool used (rh-stock-search) is a pure registry lookup.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}
process.env.INTERNAL_SERVICE_KEY = "test-internal-key-not-a-secret";
process.env.NEXT_PUBLIC_APP_URL = "https://app.invalid";
process.env.VIRTUALS_API_KEY = "test-virtuals-key";

import { NextRequest } from "next/server";
import { getBalance, getLedgerHistory } from "../src/lib/credit-ledger";
import { toolCreditCost } from "../src/lib/credit-pricing";
import { getTierInfo } from "../src/lib/credits";

let passes = 0;
let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (pass) passes++; else failures++;
}

const TOOL_NAME = "hub_rh_search";
const TOOL_ID = "rh-stock-search";

// The tool call Phase 1 "decides" on — set per turn.
let scriptedArgs: Record<string, unknown> = {};
const outbound: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  outbound.push(url);
  if (url.startsWith("https://compute.virtuals.io/")) {
    const body = JSON.parse(String(init?.body ?? "{}")) as { stream?: boolean };
    if (!body.stream) {
      return Response.json({
        choices: [{
          finish_reason: "tool_calls",
          message: { tool_calls: [{ id: "call_1", type: "function", function: { name: TOOL_NAME, arguments: JSON.stringify(scriptedArgs) } }] },
        }],
      });
    }
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\ndata: [DONE]\n\n`;
    return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }
  if (url.startsWith("https://app.invalid/api/x402/")) {
    // The defect this suite exists for. Answer something plausible so the
    // assertion on `outbound` — not a crash — is what fails.
    return Response.json({ error: "reached over HTTP" }, { status: 500 });
  }
  if (url.startsWith("https://app.invalid/api/credits/")) {
    // The chat-MESSAGE debit, a separate rail with its own route; ok it.
    return Response.json({ ok: true });
  }
  throw new Error(`network blocked in test: ${url}`);
}) as typeof fetch;
void realFetch;

function chatReq(headers: Record<string, string>) {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ messages: [{ role: "user", content: "find tesla on robinhood chain" }], tier: "balanced" }),
  });
}
async function sseEvents(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text.split("\n").filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
    .map((l) => { try { return JSON.parse(l.slice(6)) as Record<string, unknown>; } catch { return {}; } });
}
const x402Calls = () => outbound.filter((u) => u.includes("/api/x402/"));
const toolKinds = async (who: string) =>
  ((await getLedgerHistory(who))?.history ?? [])
    .filter((e) => String((e as { reason?: string }).reason ?? "").startsWith(`tool:${TOOL_ID}`) || e.kind === "refund")
    .map((e) => e.kind as string);

(async () => {
  const { POST: CHAT } = await import("../src/app/api/chat/route");
  const cost = toolCreditCost(TOOL_ID, getTierInfo(0));
  check("0.1 the tool under test is paid in credits (else this suite proves nothing)", cost > 0, `${cost}`);

  // As our own server acting for a proven wallet (lib/acting-wallet.ts) — the
  // same proof the user-tasks cron presents.
  const asUser = (w: string) => ({ "x-blue-internal": "test-internal-key-not-a-secret", "x-blue-user": w });

  console.log("\n1. A paid tool that succeeds — run in-process, debited once, reported");
  {
    const USER = "0x1111111111111111111111111111111111111111";
    const before = (await getBalance(USER)).balance;
    outbound.length = 0;
    scriptedArgs = { query: "tesla" };
    const ev = await sseEvents(await CHAT(chatReq(asUser(USER))));
    const done = ev.find((e) => e.type === "tool_done" && e.tool === TOOL_NAME);
    const after = (await getBalance(USER)).balance;
    check("1.1 no request went to /api/x402/*", x402Calls().length === 0, x402Calls().join(", "));
    check("1.2 the tool ran and its real result reached the stream",
      !!done && (done.result as { tool?: string } | null)?.tool === TOOL_ID, JSON.stringify(done ?? ev).slice(0, 200));
    check("1.3 tool_done reports exactly the tool's credit cost", done?.credits === cost, `${String(done?.credits)} vs ${cost}`);
    check("1.4 the ledger moved by exactly that cost", before - after === cost, `${before} → ${after}`);
    const kinds = await toolKinds(USER);
    check("1.5 one spend, no refund", kinds.join(",") === "spend", kinds.join(","));
  }

  console.log("\n2. A paid tool that fails — debited, then refunded, reported as 0");
  {
    const USER = "0x2222222222222222222222222222222222222222";
    const before = (await getBalance(USER)).balance;
    outbound.length = 0;
    scriptedArgs = {}; // no `query` → the handler answers 400 before any lookup
    const ev = await sseEvents(await CHAT(chatReq(asUser(USER))));
    const done = ev.find((e) => e.type === "tool_done" && e.tool === TOOL_NAME);
    const after = (await getBalance(USER)).balance;
    check("2.1 no request went to /api/x402/*", x402Calls().length === 0, x402Calls().join(", "));
    const kinds = await toolKinds(USER);
    check("2.2 a debit was taken first (the rail still meters)", kinds.includes("spend"), kinds.join(","));
    check("2.3 …and returned by a refund", kinds.includes("refund"), kinds.join(","));
    check("2.4 the balance is where it started, and tool_done says 0",
      after === before && done?.credits === 0, `${before} → ${after}, credits ${String(done?.credits)}`);
  }

  console.log("\n3. A guest — no wallet, no free paid run");
  {
    outbound.length = 0;
    scriptedArgs = { query: "tesla" };
    const ev = await sseEvents(await CHAT(chatReq({})));
    check("3.1 no request went to /api/x402/*", x402Calls().length === 0, x402Calls().join(", "));
    check("3.2 the stream short-circuits to wallet_required",
      ev.some((e) => e.type === "wallet_required"), JSON.stringify(ev.map((e) => e.type)));
  }

  console.log(`\nchat-tool-inproc-test: ${passes}/${passes + failures} passed`);
  process.exit(failures > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
