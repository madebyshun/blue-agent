/**
 * siwe-gate-test — a wallet is charged, or has its private state written, only
 * when it is PROVEN (plan §2, W0-6, 2026-09-30).
 *
 * Until that day chat, cron/run, credits/claim and the Hood watchlist /
 * Telegram-link / alerts routes all took the wallet from a body field or query
 * param. Anyone could chat on a stranger's credits (and run paid Hub tools as
 * them, via X-Blue-User), claim the launch airdrop for 300 addresses they did
 * not own, or rewrite which Telegram DMs another wallet receives.
 *
 * Proof is lib/acting-wallet.ts: the SIWE session, or — server to server — the
 * internal key plus x-blue-user. Groups 1-5 exercise the real handlers against
 * the in-memory KV (env cleared first). Group 6 is DISCOVERY, not a fixed list:
 * every route under src/app/api that calls a ledger or watchlist mutator must
 * show its proof, and the few that prove it another way must show THAT proof —
 * a named exemption with no check behind it is how this repo hid a second x402
 * door once already.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}
process.env.INTERNAL_SERVICE_KEY = "test-internal-key-not-a-secret";
process.env.NEXT_PUBLIC_APP_URL = "https://app.invalid";

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";
import { createSession, SESSION_COOKIE } from "../src/lib/session";
import { resolveActingWallet } from "../src/lib/acting-wallet";
import { getBalance } from "../src/lib/credit-ledger";

let passes = 0;
let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (pass) passes++; else failures++;
}

const ALICE = "0xa11ce00000000000000000000000000000000001";
const MALLORY = "0x3a110700000000000000000000000000000000ff";

// Everything the handlers try to reach over the network lands here instead.
const outbound: { url: string; headers: Record<string, string>; body: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://app.invalid/")) {
    const h = new Headers(init?.headers);
    outbound.push({ url, headers: Object.fromEntries(h.entries()), body: String(init?.body ?? "") });
    const sse = `data: ${JSON.stringify({ delta: { text: "ok" } })}\n\ndata: [DONE]\n\n`;
    return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }
  return realFetch(input, init);
}) as typeof fetch;

function req(url: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers ?? {}) };
  if (init.cookie) headers.cookie = `${SESSION_COOKIE}=${init.cookie}`;
  return new NextRequest(`http://localhost${url}`, {
    method: init.method ?? "POST",
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}
async function sseEvents(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text.split("\n").filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
    .map((l) => { try { return JSON.parse(l.slice(6)) as Record<string, unknown>; } catch { return {}; } });
}

(async () => {
  const aliceSession = await createSession(ALICE);

  console.log("\n1. resolveActingWallet");
  let a = await resolveActingWallet(req("/x"), ALICE);
  check("1.1 no cookie, no internal key → anonymous", a.status === "anonymous");
  a = await resolveActingWallet(req("/x", { cookie: aliceSession }), ALICE);
  check("1.2 Alice's session, claiming Alice → ok via session", a.status === "ok" && a.wallet === ALICE && a.via === "session");
  a = await resolveActingWallet(req("/x", { cookie: aliceSession }), MALLORY);
  check("1.3 Alice's session, claiming Mallory → mismatch (never billed as either)", a.status === "mismatch");
  a = await resolveActingWallet(req("/x", { headers: { "x-blue-internal": "test-internal-key-not-a-secret", "x-blue-user": ALICE } }));
  check("1.4 internal key + x-blue-user → ok via internal", a.status === "ok" && a.wallet === ALICE && a.via === "internal");
  a = await resolveActingWallet(req("/x", { headers: { "x-blue-internal": "wrong", "x-blue-user": ALICE } }));
  check("1.5 a wrong internal key proves nothing", a.status === "anonymous");

  console.log("\n2. /api/chat bills only a proven wallet");
  const { POST: CHAT } = await import("../src/app/api/chat/route");
  const msg = { messages: [{ role: "user", content: "hi" }], tier: "balanced" };
  let ev = await sseEvents(await CHAT(req("/api/chat", { body: { ...msg, address: ALICE } })));
  check("2.1 claiming a wallet with no session → auth_required, nothing else",
    ev.length === 1 && ev[0].type === "auth_required" && ev[0].reason === "sign_in_required", JSON.stringify(ev));
  ev = await sseEvents(await CHAT(req("/api/chat", { body: { ...msg, address: MALLORY }, cookie: aliceSession })));
  check("2.2 Alice's session claiming Mallory → wallet_mismatch", ev[0]?.type === "auth_required" && ev[0]?.reason === "wallet_mismatch", JSON.stringify(ev));
  check("2.3 neither refusal reached the chat pipeline", outbound.length === 0);

  console.log("\n3. /api/cron/run runs only for a proven wallet, and forwards the proof");
  const { POST: RUN } = await import("../src/app/api/cron/run/route");
  let res = await RUN(req("/api/cron/run", { body: { prompt: "gm", tier: "balanced", address: ALICE } }));
  let j = (await res.json()) as { code?: string; ok?: boolean; claimed?: boolean };
  check("3.1 no session → 401 AUTH_REQUIRED (no more guest runs of a paid model)", res.status === 401 && j.code === "AUTH_REQUIRED", JSON.stringify(j));
  check("3.2 …and nothing was forwarded", outbound.length === 0);
  res = await RUN(req("/api/cron/run", { body: { prompt: "gm", tier: "balanced", address: ALICE }, cookie: aliceSession }));
  check("3.3 Alice's session → runs", res.status === 200 && outbound.length === 1, `${res.status}`);
  const fwd = outbound[0];
  check("3.4 chat is called AS Alice: internal key + x-blue-user, never the key alone",
    fwd?.headers["x-blue-internal"] === "test-internal-key-not-a-secret" && fwd?.headers["x-blue-user"] === ALICE,
    JSON.stringify(fwd?.headers ?? {}));
  res = await RUN(req("/api/cron/run", { body: { prompt: "gm", address: MALLORY }, cookie: aliceSession }));
  check("3.5 Alice's session asking to run as Mallory → refused", res.status === 401);

  console.log("\n4. /api/credits/claim credits only the session's wallet");
  const { POST: CLAIM } = await import("../src/app/api/credits/claim/route");
  res = await CLAIM(req("/api/credits/claim", { body: { address: MALLORY } }));
  check("4.1 no session → 401", res.status === 401);
  const before = (await getBalance(ALICE)).balance;
  res = await CLAIM(req("/api/credits/claim", { body: { address: ALICE }, cookie: aliceSession }));
  j = (await res.json()) as typeof j;
  const after = (await getBalance(ALICE)).balance;
  check("4.2 Alice signed in → Alice is credited", j.ok === true && after - before === 1000, `${before} → ${after}`);
  res = await CLAIM(req("/api/credits/claim", { body: { address: MALLORY }, cookie: aliceSession }));
  check("4.3 Alice's session cannot claim for Mallory", res.status === 401);

  console.log("\n5. Hood watchlist / Telegram link / alerts are the session wallet's own");
  const WL = await import("../src/app/api/hood/watchlist/route");
  res = await WL.POST(req("/api/hood/watchlist", { body: { address: ALICE, ticker: "NVDA", chain: "base" } }));
  check("5.1 add without a session → 401", res.status === 401);
  res = await WL.POST(req("/api/hood/watchlist", { body: { address: ALICE, ticker: "NVDA", chain: "base" }, cookie: aliceSession }));
  j = (await res.json()) as typeof j;
  check("5.2 add with Alice's session → ok", res.status === 200 && j.ok === true, JSON.stringify(j));
  res = await WL.GET(req(`/api/hood/watchlist?address=${MALLORY}`, { method: "GET", cookie: aliceSession }));
  check("5.3 Alice cannot read Mallory's list", res.status === 401);
  res = await WL.GET(req(`/api/hood/watchlist?address=${ALICE}`, { method: "GET" }));
  check("5.4 nobody reads Alice's list without her session", res.status === 401);
  res = await WL.DELETE(req("/api/hood/watchlist", { method: "DELETE", body: { address: MALLORY, ticker: "NVDA", chain: "base" }, cookie: aliceSession }));
  check("5.5 Alice cannot un-watch for Mallory", res.status === 401);
  const TG = await import("../src/app/api/hood/tglink/route");
  res = await TG.POST(req("/api/hood/tglink", { body: { address: ALICE } }));
  check("5.6 Telegram link code without a session → 401", res.status === 401);
  const AL = await import("../src/app/api/hood/alerts/route");
  res = await AL.GET(req(`/api/hood/alerts?address=${ALICE}`, { method: "GET" }));
  check("5.7 alerts without a session → 401", res.status === 401);

  console.log("\n5b. Spend history is the wallet's own; the balance aggregate stays public");
  const SP = await import("../src/app/api/wallet/spend/route");
  res = await SP.GET(req(`/api/wallet/spend?address=${ALICE}`, { method: "GET" }));
  check("5b.1 receipts without a session → 401", res.status === 401);
  res = await SP.GET(req(`/api/wallet/spend?address=${ALICE}`, { method: "GET", cookie: aliceSession }));
  check("5b.2 receipts with the owner's session → 200", res.status === 200);
  res = await SP.GET(req(`/api/wallet/spend?address=${MALLORY}`, { method: "GET", cookie: aliceSession }));
  check("5b.3 Alice cannot read Mallory's receipts", res.status === 401);
  const SS = await import("../src/app/api/wallet/spend-summary/route");
  res = await SS.GET(req(`/api/wallet/spend-summary?address=${ALICE}`, { method: "GET" }));
  check("5b.4 spend summary without a session → 401", res.status === 401);
  const BAL = await import("../src/app/api/credits/balance/[address]/route");
  const balParams = { params: Promise.resolve({ address: ALICE }) };
  res = await BAL.GET(req(`/api/credits/balance/${ALICE}`, { method: "GET" }), balParams);
  const agg = (await res.json()) as Record<string, unknown>;
  check("5b.5 the public balance carries the aggregate but no per-event list",
    res.status === 200 && typeof agg.balance === "number" && !("recent" in agg), Object.keys(agg).join(","));
  res = await BAL.GET(req(`/api/credits/balance/${ALICE}?detail=1`, { method: "GET" }), { params: Promise.resolve({ address: ALICE }) });
  check("5b.6 ?detail=1 without a session → 401", res.status === 401);
  res = await BAL.GET(req(`/api/credits/balance/${ALICE}?detail=1`, { method: "GET", cookie: aliceSession }), { params: Promise.resolve({ address: ALICE }) });
  const det = (await res.json()) as Record<string, unknown>;
  check("5b.7 ?detail=1 for the owner → the events, never cached",
    res.status === 200 && Array.isArray(det.recent) && res.headers.get("Cache-Control") === "private, no-store");

  console.log("\n6. Discovery: every mutator route shows its proof");
  const ROOT = process.cwd();
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // `runInternalTool` is a mutator by proxy: it debits whatever `user` it is
  // handed (lib/x402-internal-run.ts — the x402 route's internal branch, called
  // in-process by chat and MCP since 2026-10-01). Its `spend(` lives in a lib,
  // which this walk does not read, so the CALL is what has to show its proof.
  const MUTATOR = /\b(spend|topup|refund|addTicker|removeTicker|issueTgLinkCode|debitChatCredits|runInternalTool)\s*\(/;
  // Routes that prove the wallet some OTHER way — each with the proof it must show.
  const OTHER_PROOF: Record<string, [RegExp, string]> = {
    "src/app/api/x402/[tool]/route.ts": [/xInternal === INTERNAL_KEY\)[\s\S]*runInternalTool\(\{[^)]*user:\s*xBlueUser/, "X-Blue-User only under the internal key"],
    // Runs its free HUB_MAP set as a service job and bills nobody: no `user` in
    // the call at all, so there is no wallet for it to have to prove.
    "src/app/api/mcp/route.ts": [/runInternalTool\(\{(?![^)]*\buser\b)[^)]*service:\s*true/, "a service run that names no wallet"],
    "src/app/api/credits/spend/route.ts": [/if \(!INTERNAL_KEY \|\| auth !== INTERNAL_KEY\)/, "internal key, fail-closed"],
    "src/app/api/credits/topup/route.ts": [/if \(!INTERNAL_KEY \|\| auth !== INTERNAL_KEY\)/, "internal key, fail-closed"],
    "src/app/api/credits/refund/route.ts": [/if \(!INTERNAL_KEY \|\| auth !== INTERNAL_KEY\)/, "internal key, fail-closed"],
    "src/app/api/credits/purchase/route.ts": [/getAddress\(from\)\s*===\s*caller(?=[\s\S]*)(?:[\s\S]*)/, "an on-chain transfer FROM the caller, not an x402 authorization"],
  };
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n === "route.ts") files.push(p); } };
  walk(join(ROOT, "src/app/api"));
  let seen = 0;
  for (const f of files) {
    const rel = relative(ROOT, f);
    const code = strip(readFileSync(f, "utf8"));
    if (!MUTATOR.test(code)) continue;
    seen++;
    const other = OTHER_PROOF[rel];
    if (other) check(`6.x ${rel} — ${other[1]}`, other[0].test(code));
    else check(`6.x ${rel} takes its wallet from resolveActingWallet`, /resolveActingWallet\s*\(/.test(code));
  }
  check("6.0 the discovery found the mutator routes (the detector is alive)", seen >= 8, `${seen} routes`);
  const purchase = strip(readFileSync(join(ROOT, "src/app/api/credits/purchase/route.ts"), "utf8"));
  check("6.p purchase proves BOTH halves: the transfer is FROM the caller, and the caller authorized no EIP-3009 payment in it",
    /getAddress\(from\)\s*===\s*caller/.test(purchase) && /if \(authorizedByCaller\)/.test(purchase));

  for (const rel of Object.keys(OTHER_PROOF)) {
    check(`6.e the "${rel}" exemption still names a real mutator route`, files.some((f) => relative(ROOT, f) === rel && MUTATOR.test(strip(readFileSync(f, "utf8")))));
  }

  console.log(`\nsiwe-gate-test: ${passes}/${passes + failures} passed`);
  if (failures > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
