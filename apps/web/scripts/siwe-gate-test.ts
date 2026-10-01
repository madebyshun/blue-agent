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
 *
 * Group 7 (2026-10-01) is the embedded mini-app: the Lax cookie never reaches
 * a cross-site iframe, so the same token may ride `x-blue-session` instead.
 * It pins that the header proves exactly what the cookie proves and nothing
 * more — a malformed one is ignored, the token is never handed to a caller that
 * did not ask, no session route answers a CORS preflight, the client attaches
 * it only to our own relative /api/ paths, and every client call to a session
 * route goes through `sessionFetch` (discovered, not listed).
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}
process.env.INTERNAL_SERVICE_KEY = "test-internal-key-not-a-secret";
process.env.NEXT_PUBLIC_APP_URL = "https://app.invalid";

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";
import { createSession, issueNonce, requestDomain, sessionSiweMessage, SESSION_COOKIE, SESSION_HEADER } from "../src/lib/session";
import { sessionFetch, setHeaderSessionToken, settleSessionTransport, usingHeaderSession, SESSION_NOT_KEPT } from "../src/lib/session-client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
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

  console.log("\n7. Embedded mini-app: the session may ride x-blue-session, and only that");
  const H = (t: string) => ({ [SESSION_HEADER]: t });
  a = await resolveActingWallet(req("/x", { headers: H(aliceSession) }), ALICE);
  check("7.1 header session, no cookie → ok via session", a.status === "ok" && a.wallet === ALICE && a.via === "session", JSON.stringify(a));
  a = await resolveActingWallet(req("/x", { headers: H(aliceSession) }), MALLORY);
  check("7.2 header session claiming another wallet → mismatch, same as the cookie", a.status === "mismatch");
  a = await resolveActingWallet(req("/x", { headers: H(aliceSession.toUpperCase()) }), ALICE);
  check("7.3 a malformed header proves nothing (no cookie → anonymous)", a.status === "anonymous");
  a = await resolveActingWallet(req("/x", { headers: H("not-a-token"), cookie: aliceSession }), ALICE);
  check("7.4 a malformed header is ignored, not an error — the cookie still answers", a.status === "ok" && a.wallet === ALICE);
  a = await resolveActingWallet(req("/x", { headers: H("ab".repeat(32)) }), ALICE);
  check("7.5 a well-formed but unknown token → anonymous", a.status === "anonymous");
  res = await WL.GET(req(`/api/hood/watchlist?address=${ALICE}`, { method: "GET", headers: H(aliceSession) }));
  check("7.6 a gated route accepts the header session (Alice reads her watchlist)", res.status === 200, `${res.status}`);

  const SESSION = await import("../src/app/api/auth/session/route");
  res = await SESSION.GET(req("/api/auth/session", { method: "GET", headers: H(aliceSession) }));
  let who = (await res.json()) as { status?: string; wallet?: string };
  check("7.7 whoami answers for the header session", who.status === "active" && who.wallet === ALICE, JSON.stringify(who));

  const acct = privateKeyToAccount(generatePrivateKey());
  const signInBody = async (extra: Record<string, unknown>) => {
    const nonce = (await issueNonce())!;
    // Signed for whatever host the route will bind the message to.
    const domain = requestDomain(req("/api/auth/session"));
    const signature = await acct.signMessage({ message: sessionSiweMessage(domain, acct.address, nonce) });
    return { address: acct.address, signature, nonce, ...extra };
  };
  res = await SESSION.POST(req("/api/auth/session", { body: await signInBody({}) }));
  let signed = (await res.json()) as { wallet?: string; token?: string };
  check("7.8 a default sign-in never returns the token (cookie only)",
    res.status === 200 && signed.wallet === acct.address.toLowerCase() && !("token" in signed) && /blue_session=/.test(res.headers.get("set-cookie") ?? ""),
    JSON.stringify(signed));
  res = await SESSION.POST(req("/api/auth/session", { body: await signInBody({ embedded: "true" }) }));
  signed = (await res.json()) as typeof signed;
  check("7.9 only the boolean `embedded: true` unlocks it — a truthy string does not", res.status === 200 && !("token" in signed));
  res = await SESSION.POST(req("/api/auth/session", { body: await signInBody({ embedded: true }) }));
  signed = (await res.json()) as typeof signed;
  check("7.10 embedded sign-in returns the token, uncacheable, and the cookie is still set",
    res.status === 200 && typeof signed.token === "string" && /^[0-9a-f]{64}$/.test(signed.token)
      && res.headers.get("Cache-Control") === "no-store" && /blue_session=/.test(res.headers.get("set-cookie") ?? ""),
    JSON.stringify({ status: res.status, cc: res.headers.get("Cache-Control") }));
  check("7.11 the token-bearing response is not CORS-readable", res.headers.get("access-control-allow-origin") === null);
  const tok = signed.token ?? "";
  res = await SESSION.GET(req("/api/auth/session", { method: "GET", headers: H(tok) }));
  who = (await res.json()) as typeof who;
  check("7.12 the returned token is a working session for the signer", who.status === "active" && who.wallet === acct.address.toLowerCase());
  await SESSION.DELETE(req("/api/auth/session", { method: "DELETE", headers: H(tok) }));
  res = await SESSION.GET(req("/api/auth/session", { method: "GET", headers: H(tok) }));
  who = (await res.json()) as typeof who;
  check("7.13 sign-out by header destroys that session", who.status === "anonymous", JSON.stringify(who));

  // CORS: a cross-site page can only set x-blue-session after a preflight. No
  // session route may answer one, and nothing global may add the headers that
  // would let it through.
  const sessionRoutes = files.filter((f) => /\b(readSession|resolveActingWallet|destroySession)\s*\(/.test(strip(readFileSync(f, "utf8"))));
  check("7.14 the session-route discovery is alive", sessionRoutes.length >= 10, `${sessionRoutes.length} routes`);
  for (const f of sessionRoutes) {
    const code = strip(readFileSync(f, "utf8"));
    check(`7.c ${relative(ROOT, f)} answers no preflight and grants no CORS`,
      !/export\s+(async\s+)?function\s+OPTIONS\b|export\s+const\s+OPTIONS\b/.test(code) && !/Access-Control-Allow/i.test(code));
  }
  for (const g of ["next.config.ts", "src/middleware.ts", "vercel.json"]) {
    let text = "";
    try { text = readFileSync(join(ROOT, g), "utf8"); } catch { /* absent is fine */ }
    check(`7.g ${g} adds no global CORS headers`, !/Access-Control-Allow/i.test(text));
  }

  // The client half, against a stubbed fetch: what gets the header, and how
  // the transport is chosen after a sign-in.
  const sent: { url: string; header: string | null }[] = [];
  let whoCookie: Response = new Response("{}");
  let whoHeader: Response = new Response("{}");
  const stubbed = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const header = new Headers(init?.headers).get(SESSION_HEADER);
    sent.push({ url, header });
    if (url === "/api/auth/session") return (header ? whoHeader : whoCookie).clone();
    return new Response("{}");
  }) as typeof fetch;
  const active = (w: string) => new Response(JSON.stringify({ status: "active", wallet: w }));
  const anon = () => new Response(JSON.stringify({ status: "anonymous" }));
  try {
    setHeaderSessionToken(null);
    await sessionFetch("/api/chat", { method: "POST" });
    check("7.15 cookie mode: sessionFetch adds nothing", sent.at(-1)?.header === null);
    setHeaderSessionToken("NOT-HEX");
    check("7.16 a malformed token is never held", !usingHeaderSession());
    setHeaderSessionToken(aliceSession);
    await sessionFetch("/api/chat", { method: "POST", headers: { "x-lang": "en" } });
    check("7.17 header mode: our /api/ path gets the token", sent.at(-1)?.header === aliceSession);
    await sessionFetch("https://evil.example/api/chat");
    await sessionFetch("//evil.example/api/chat");
    check("7.18 …an absolute or protocol-relative URL never does", sent.at(-1)?.header === null && sent.at(-2)?.header === null);
    await sessionFetch("/share/abc");
    check("7.19 …nor a same-origin non-API path", sent.at(-1)?.header === null);

    const T = "cd".repeat(32);
    setHeaderSessionToken(null);
    whoCookie = active(ALICE); whoHeader = active(ALICE);
    await settleSessionTransport(ALICE, T);
    check("7.20 the cookie stuck → cookie mode, the token is discarded unused", !usingHeaderSession());
    whoCookie = anon(); whoHeader = active(ALICE);
    await settleSessionTransport(ALICE, T);
    check("7.21 the cookie was dropped (cross-site frame) → header mode", usingHeaderSession());
    setHeaderSessionToken(null);
    whoCookie = anon(); whoHeader = anon();
    let threw = "";
    try { await settleSessionTransport(ALICE, T); } catch (e) { threw = (e as Error).message; }
    check("7.22 neither transport keeps it → a plain reason, not 'signed in' (the old loop)", threw === SESSION_NOT_KEPT && !usingHeaderSession(), threw);
    threw = "";
    try { await settleSessionTransport(ALICE, null); } catch (e) { threw = (e as Error).message; }
    check("7.23 a non-embedded sign-in whose cookie did not stick also says so", threw === SESSION_NOT_KEPT);
    whoCookie = new Response("{}", { status: 503 });
    threw = "";
    try { await settleSessionTransport(ALICE, null); } catch (e) { threw = (e as Error).message; }
    check("7.24 whoami 503 is no verdict — a store blip does not fail the sign-in", threw === "");
  } finally {
    globalThis.fetch = stubbed;
    setHeaderSessionToken(null);
  }

  // Discovery: every client call that names a session route goes through
  // sessionFetch. Route paths come from the files found above (`[param]`
  // matches any segment); a `${…}` in a template literal is treated as "could
  // continue here", so `/api/credits/claim${q}` still counts.
  const DYN = "\u0000";
  const routePatterns = sessionRoutes.map((f) => {
    const path = relative(join(ROOT, "src/app"), f).replace(/\/route\.ts$/, "");
    const body = path.split("/").map((seg) => (/^\[.+\]$/.test(seg) ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/");
    return new RegExp(`^/${body}(?:${DYN}.*)?$`);
  });
  const clientFiles: string[] = [];
  const walkClient = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (p !== join(ROOT, "src/app/api")) walkClient(p); }
      else if (/\.tsx?$/.test(n)) clientFiles.push(p);
    }
  };
  walkClient(join(ROOT, "src"));
  // Two bare fetches are correct, each shown by a property rather than listed:
  //   • the sign-in POST — it CREATES a session, it presents none;
  //   • session-client.ts's own whoami probes, which must ask over exactly one
  //     transport to learn which one works (cookie alone, or an explicit token).
  const SESSION_CLIENT = "src/lib/session-client.ts";
  let calls = 0;
  for (const f of clientFiles) {
    const rel = relative(ROOT, f);
    const code = strip(readFileSync(f, "utf8"));
    const re = /\b(fetch|sessionFetch)\(\s*["'`](\/api\/[^"'`]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      const target = m[2].replace(/\$\{[^}]*\}/g, DYN).split("?")[0];
      if (!routePatterns.some((r) => r.test(target))) continue;
      calls++;
      const after = code.slice(m.index, m.index + 160);
      if (m[1] === "fetch" && target === "/api/auth/session" && /method:\s*"POST"/.test(after)) {
        check(`7.d ${rel} → the sign-in POST creates the session, so a bare fetch is right`, true);
        continue;
      }
      if (m[1] === "fetch" && rel === SESSION_CLIENT) {
        check(`7.d ${rel} → its whoami probe names its one transport explicitly`, /\[SESSION_HEADER\]:\s*token/.test(after));
        continue;
      }
      check(`7.d ${rel} → ${m[2].slice(0, 48)} goes through sessionFetch`, m[1] === "sessionFetch");
    }
  }
  check("7.25 the client-call discovery is alive", calls >= 15, `${calls} calls`);

  console.log(`\nsiwe-gate-test: ${passes}/${passes + failures} passed`);
  if (failures > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
