/**
 * paymaster-gate-test — /api/paymaster only sponsors the signed-in wallet's own
 * operations (plan §1 fix 3; ShunTr chose "gate", 2026-09-30).
 *
 * Until that day the route had no auth at all. The shape of the fix is forced
 * by who calls it: the WALLET fetches the paymaster URL cross-origin, so the
 * SIWE cookie never reaches it. Hence a token minted same-origin
 * (/api/paymaster/token, which does see the cookie) and carried in the URL,
 * bound to the wallet, the network and an expiry — and a route that checks the
 * user operation's `sender` against it.
 *
 * Hermetic: KV env is cleared first (lib/kv falls back to a Map), the CDP
 * upstream is a dummy URL, and `fetch` is stubbed, so nothing leaves the box.
 * The one smart-wallet branch of verifySiwe needs an RPC and is checked by
 * source only (group 5); its EOA branch is exercised for real.
 *
 * Groups 7–8 (added 2026-10-01) cover the two ways the gate still failed:
 *   7 — the per-wallet budget was read-then-INCR (parallel calls all passed)
 *       and fell back to a per-instance Map on a KV error. Exercised on the KV
 *       code path by flipping the KV env ON after lib/kv has already bound its
 *       Map fallback as `kv` — so the real strict-tier code runs against an
 *       async store and no request leaves the box.
 *   8 — a refused wallet could not send at all: no user-paid fallback on the
 *       cards, and a badge promising sponsorship the server would refuse.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}
process.env.INTERNAL_SERVICE_KEY = "test-internal-service-key-not-a-real-secret";
process.env.CDP_PAYMASTER_URL_BASE = "https://paymaster.invalid/base";
delete process.env.CDP_PAYMASTER_URL_BASE_SEPOLIA;

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import {
  mintPaymasterToken,
  verifyPaymasterToken,
  PAYMASTER_TOKEN_TTL_MS,
} from "../src/lib/paymaster-token";
import { createSession, SESSION_COOKIE, verifySiwe } from "../src/lib/session";
import { kv } from "../src/lib/kv";
import { peekRateLimit, rateLimit, RATE_LIMITS } from "../src/lib/rate-limit";
import { isSponsorshipRefusal, sendWithSponsorFallback, type SendCapabilities } from "../src/hooks/useSponsoredGas";

let passes = 0;
let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (pass) passes++; else failures++;
}

const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const FRESH = "0x3333333333333333333333333333333333333333";
const ONE_LEFT = "0x4444444444444444444444444444444444444444";

// ── fetch stub: records what the route forwards upstream ────────────────────
const forwarded: unknown[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://paymaster.invalid/")) {
    forwarded.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { paymasterAndData: "0xstub" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return realFetch(input, init);
}) as typeof fetch;

function userOp(sender: string) {
  return { sender, nonce: "0x0", callData: "0x", callGasLimit: "0x0" };
}
async function callPaymaster(query: string, body: unknown) {
  const { POST } = await import("../src/app/api/paymaster/route");
  const res = await POST(new Request(`http://localhost/api/paymaster?${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: res.status, json: (await res.json()) as { error?: { code: number; message: string }; result?: unknown; needsPaymaster?: boolean } };
}

(async () => {
  console.log("\n1. Tokens bind a wallet, a network and an expiry — and nothing else passes");
  const t0 = Date.now();
  const tok = mintPaymasterToken(WALLET, "base", t0);
  check("1.1 a token is minted when the service key is set", typeof tok === "string");
  const ok = verifyPaymasterToken(tok, "base", t0 + 1000);
  check("1.2 it verifies for its own wallet and network", ok.ok && ok.wallet === WALLET, JSON.stringify(ok));
  check("1.3 wrong network is refused", !verifyPaymasterToken(tok, "baseSepolia", t0).ok);
  const late = verifyPaymasterToken(tok, "base", t0 + PAYMASTER_TOKEN_TTL_MS + 1);
  check("1.4 an expired token is refused", !late.ok && late.reason === "expired", JSON.stringify(late));
  const [body, sig] = (tok ?? ".").split(".");
  const forgedBody = Buffer.from(JSON.stringify({ w: OTHER, n: "base", e: t0 + 60_000 })).toString("base64url");
  const forged = verifyPaymasterToken(`${forgedBody}.${sig}`, "base", t0);
  check("1.5 swapping in another wallet breaks the signature", !forged.ok && forged.reason === "bad_signature", JSON.stringify(forged));
  check("1.6 a truncated signature is refused", !verifyPaymasterToken(`${body}.${sig.slice(0, 10)}`, "base", t0).ok);
  check("1.7 missing / malformed tokens are refused",
    !verifyPaymasterToken(null, "base").ok && !verifyPaymasterToken("abc", "base").ok && !verifyPaymasterToken("a.b.c", "base").ok);
  const saved = process.env.INTERNAL_SERVICE_KEY;
  delete process.env.INTERNAL_SERVICE_KEY;
  check("1.8 no service key → no token, and nothing verifies (fails closed)",
    mintPaymasterToken(WALLET, "base") === null && !verifyPaymasterToken(tok, "base", t0).ok);
  process.env.INTERNAL_SERVICE_KEY = saved;

  console.log("\n2. The paymaster refuses before forwarding anything");
  const stub = (sender: string, chainId = "0x2105") => ({
    jsonrpc: "2.0", id: 7, method: "pm_getPaymasterStubData",
    params: [userOp(sender), "0x0000000071727De22E5E9d8BAf0edAc6f37da032", chainId, {}],
  });
  let r = await callPaymaster("network=base", stub(WALLET));
  check("2.1 no token → refused (-32001)", r.json.error?.code === -32001 && forwarded.length === 0, JSON.stringify(r.json));
  r = await callPaymaster(`network=base&t=${encodeURIComponent(tok!)}`, stub(OTHER));
  check("2.2 someone else's operation → refused (-32002)", r.json.error?.code === -32002 && forwarded.length === 0, JSON.stringify(r.json));
  r = await callPaymaster(`network=base&t=${encodeURIComponent(tok!)}`, stub(WALLET, "0x14a34"));
  check("2.3 wrong chainId → refused (-32003)", r.json.error?.code === -32003 && forwarded.length === 0, JSON.stringify(r.json));
  r = await callPaymaster(`network=base&t=${encodeURIComponent(tok!)}`, { jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [] });
  check("2.4 a non-paymaster method is refused even with a token (-32601)", r.json.error?.code === -32601 && forwarded.length === 0);
  const sepTok = mintPaymasterToken(WALLET, "baseSepolia");
  r = await callPaymaster(`network=baseSepolia&t=${encodeURIComponent(sepTok!)}`, stub(WALLET, "0x14a34"));
  check("2.5 an unconfigured network degrades to needsPaymaster, as before", r.json.needsPaymaster === true && forwarded.length === 0);

  console.log("\n3. The signed-in wallet's own operation goes through");
  r = await callPaymaster(`network=base&t=${encodeURIComponent(tok!)}`, stub(WALLET.toUpperCase().replace("0X", "0x")));
  check("3.1 own sender (any case) → forwarded to CDP", !r.json.error && forwarded.length === 1, JSON.stringify(r.json));
  check("3.2 the forwarded body is the caller's JSON-RPC, untouched",
    (forwarded[0] as { method?: string }).method === "pm_getPaymasterStubData");
  r = await callPaymaster(`network=base&t=${encodeURIComponent(tok!)}`, { jsonrpc: "2.0", id: 2, method: "pm_supportedEntryPoints", params: [] });
  check("3.3 pm_supportedEntryPoints needs only the token", !r.json.error && forwarded.length === 2);

  console.log("\n4. Per-wallet budget");
  // 2 calls above already counted against this wallet's hourly bucket.
  let refusedAt = -1;
  for (let i = 0; i < 60; i++) {
    const x = await callPaymaster(`network=base&t=${encodeURIComponent(tok!)}`, stub(WALLET));
    if (x.json.error?.code === -32005) { refusedAt = i; break; }
  }
  check("4.1 the wallet is cut off after its hourly allowance (-32005)", refusedAt >= 0, `refused on extra call #${refusedAt + 1}`);
  const other = mintPaymasterToken(OTHER, "base");
  r = await callPaymaster(`network=base&t=${encodeURIComponent(other!)}`, stub(OTHER));
  check("4.2 another wallet still has its own allowance", !r.json.error, JSON.stringify(r.json));
  const peeked = await peekRateLimit(WALLET, "paymaster");
  check("4.3 the budget can be READ without being spent (exhausted wallet reads 0 left)",
    peeked.status === "ok" && peeked.remaining === 0, JSON.stringify(peeked));

  console.log("\n5. Tokens come only from a SIWE session — with budget left");
  const { POST: TOKEN } = await import("../src/app/api/paymaster/token/route");
  const askToken = async (wallet?: string) => {
    const headers: Record<string, string> = {};
    if (wallet) headers.cookie = `${SESSION_COOKIE}=${await createSession(wallet)}`;
    const res = await TOKEN(new NextRequest("http://localhost/api/paymaster/token", {
      method: "POST", body: JSON.stringify({ network: "base" }), headers,
    }));
    return { status: res.status, json: (await res.json()) as { token?: string | null; wallet?: string; reason?: string } };
  };
  const anon = await askToken();
  check("5.1 no session → 401, no token", anon.status === 401 && anon.json.token === null, `${anon.status} ${JSON.stringify(anon.json)}`);
  // FRESH, not WALLET: group 4 spent WALLET's whole hourly budget.
  const signed = await askToken(FRESH);
  const bound = verifyPaymasterToken(signed.json.token, "base");
  check("5.2 a session gets a token bound to ITS wallet", signed.status === 200 && bound.ok && bound.wallet === FRESH,
    `${signed.status} wallet=${signed.json.wallet}`);
  const spent = await askToken(WALLET);
  check("5.3 a wallet whose budget is spent gets NO token (the card then sends user-paid, no badge)",
    spent.status === 429 && spent.json.token === null && spent.json.reason === "sponsorship_limit_reached",
    `${spent.status} ${JSON.stringify(spent.json)}`);
  // One call left is not one send left: the stub call would pass and the data
  // call would be refused, failing the send the token was minted for.
  const oneLeftTok = mintPaymasterToken(ONE_LEFT, "base");
  for (let i = 0; i < RATE_LIMITS.paymaster.limit - 1; i++) {
    await callPaymaster(`network=base&t=${encodeURIComponent(oneLeftTok!)}`, stub(ONE_LEFT));
  }
  const oneLeft = await askToken(ONE_LEFT);
  check("5.4 a wallet with room for less than one send (stub + data) gets no token",
    oneLeft.status === 429 && oneLeft.json.token === null, `${oneLeft.status} ${JSON.stringify(oneLeft.json)}`);
  const notSpent = await peekRateLimit(FRESH, "paymaster");
  check("5.5 asking for tokens spends none of the budget",
    notSpent.status === "ok" && notSpent.remaining === RATE_LIMITS.paymaster.limit, JSON.stringify(notSpent));

  const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const msg = "BlueAgent test message";
  const sigEoa = await account.signMessage({ message: msg });
  check("5.6 verifySiwe still accepts a plain EOA signature (no RPC needed)", await verifySiwe(account.address, msg, sigEoa));

  const sessionSrc = readFileSync(join(process.cwd(), "src/lib/session.ts"), "utf8");
  const fn = sessionSrc.slice(sessionSrc.indexOf("export async function verifySiwe"));
  check("5.7 verifySiwe falls back to the chain for contract-account signatures (ERC-1271/6492)",
    /siweChainClient\.verifyMessage\(/.test(fn.slice(0, 1200)));

  console.log("\n6. No client hands the wallet an ungated paymaster URL");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(name) && !p.includes(`${join("src", "app", "api")}`)) {
        const code = readFileSync(p, "utf8");
        if (/paymasterService\s*:\s*\{\s*url\s*:\s*`[^`]*\/api\/paymaster/.test(code)) offenders.push(relative(process.cwd(), p));
      }
    }
  };
  walk(join(process.cwd(), "src"));
  check("6.1 every paymasterService URL comes from useSponsoredGas (token attached)", offenders.length === 0, offenders.join(", "));

  // The fallback lives in ONE place. A card that builds its own paymaster
  // capability would also build its own (missing) fallback — that is the
  // exact drift that left both cards stranded on a refusal.
  const builders: string[] = [];
  const HOOK = join("src", "hooks", "useSponsoredGas.ts");
  const walk2 = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk2(p);
      else if (/\.(tsx|ts)$/.test(name) && !p.includes(join("src", "app", "api")) && !p.endsWith(HOOK)) {
        if (/paymasterService\s*:\s*\{\s*url\b/.test(readFileSync(p, "utf8"))) builders.push(relative(process.cwd(), p));
      }
    }
  };
  walk2(join(process.cwd(), "src"));
  check("6.2 no card builds a paymasterService capability itself (only useSponsoredGas does, with its fallback)",
    builders.length === 0, builders.join(", "));
  const toolCards = readFileSync(join(process.cwd(), "src/app/chat/components/ToolCards.tsx"), "utf8");
  const sendCardStart = toolCards.indexOf("export function SendCard(");
  const cardSrc: Array<[string, string]> = [
    ["WalletSendCard", readFileSync(join(process.cwd(), "src/app/app/bank/WalletSendCard.tsx"), "utf8")],
    ["ToolCards SendCard", toolCards.slice(sendCardStart, toolCards.indexOf("\nexport ", sendCardStart + 1))],
  ];
  for (const [name, src] of cardSrc) {
    check(`6.3 ${name} sends through the hook's sendCalls (sponsored, then user-paid on refusal)`,
      /sendCalls:\s*sendSponsored\b/.test(src) && /await sendSponsored\(/.test(src)
        && (src.match(/sendCallsAsync\(/g) ?? []).length === 1,
      name);
  }

  console.log("\n7. The budget is atomic and fails CLOSED (KV code path)");
  // Turn the KV path on. lib/kv bound `kv` to its Map fallback at import (env
  // was empty then), so this runs the real KV branch of rate-limit.ts against
  // an async store — nothing leaves the box.
  process.env.KV_REST_API_URL = "https://kv.invalid";
  process.env.KV_REST_API_TOKEN = "test-not-a-real-token";
  const LIMIT = RATE_LIMITS.paymaster.limit;

  // Harness sanity: the read-compare-INCR shape the paymaster tier used to run
  // DOES overshoot against this store under concurrency, so 7.1 is not passing
  // just because the harness serialises everything.
  const naive = async (id: string) => {
    const k = `rl:naive:${id}:count`;
    const c = (await kv.get<number>(k)) ?? 0;
    if (c >= LIMIT) return false;
    await kv.incr(k);
    return true;
  };
  const naiveOk = (await Promise.all(Array.from({ length: 150 }, () => naive("race")))).filter(Boolean).length;
  check("7.0 harness: a read-then-INCR limiter overshoots here under 150 parallel calls", naiveOk > LIMIT, `${naiveOk} passed, limit ${LIMIT}`);

  const RACER = "0x5555555555555555555555555555555555555555";
  const expires: Array<[string, number]> = [];
  const realExpire = kv.expire;
  kv.expire = async (k: string, sec: number) => { expires.push([k, sec]); return realExpire(k, sec); };
  const burst = await Promise.all(Array.from({ length: 150 }, () => rateLimit(RACER, "paymaster")));
  kv.expire = realExpire;
  const passed = burst.filter((b) => b.success).length;
  check("7.1 150 parallel paymaster calls → exactly the hourly limit pass", passed === LIMIT, `${passed} passed, limit ${LIMIT}`);
  check("7.2 EXPIRE is set once, on the first hit, to the end of the window",
    expires.length === 1 && expires[0][1] > 0 && expires[0][1] <= RATE_LIMITS.paymaster.windowSeconds + 5,
    JSON.stringify(expires));
  const racerPeek = await peekRateLimit(RACER, "paymaster");
  check("7.3 the peek reads the same counter the limiter writes", racerPeek.status === "ok" && racerPeek.remaining === 0, JSON.stringify(racerPeek));

  // A lost EXPIRE must not become a permanent lock-out: the counter is keyed by
  // window, so the next window starts from a new key whatever the old one's TTL.
  const LOST = "0x6666666666666666666666666666666666666666";
  kv.expire = async () => { /* lost */ };
  for (let i = 0; i < LIMIT + 3; i++) await rateLimit(LOST, "paymaster");
  kv.expire = realExpire;
  const lockedNow = await rateLimit(LOST, "paymaster");
  const realNow = Date.now;
  Date.now = () => realNow() + RATE_LIMITS.paymaster.windowSeconds * 1000;
  const nextWindow = await rateLimit(LOST, "paymaster");
  Date.now = realNow;
  check("7.4 a counter whose EXPIRE was lost still resets next window (no permanent lock-out)",
    !lockedNow.success && nextWindow.success, `now=${lockedNow.success} next=${nextWindow.success}`);

  const realIncr = kv.incr;
  kv.incr = async () => { throw new Error("simulated Upstash cap (#148)"); };
  const down = await rateLimit(FRESH, "paymaster");
  check("7.5 KV error on the paymaster tier → REFUSED (not a per-instance Map)",
    !down.success && down.unavailable === true, JSON.stringify(down));
  const before = forwarded.length;
  const freshTok = mintPaymasterToken(FRESH, "base");
  r = await callPaymaster(`network=base&t=${encodeURIComponent(freshTok!)}`, stub(FRESH));
  check("7.6 …and the paymaster says the budget is UNCHECKABLE, not spent, and forwards nothing",
    r.json.error?.code === -32005 && /could not be checked/.test(r.json.error.message) && forwarded.length === before,
    JSON.stringify(r.json));
  const chatDown = await rateLimit("203.0.113.9", "chat");
  check("7.7 other tiers are unchanged: a KV error still falls through to the in-memory limiter",
    chatDown.success && chatDown.unavailable === undefined, JSON.stringify(chatDown));
  kv.incr = realIncr;

  const realGet = kv.get;
  kv.get = (async (k: string) => {
    if (k.startsWith("rl:")) throw new Error("simulated Upstash cap (#148)");
    return realGet(k);
  }) as typeof kv.get;
  const blind = await peekRateLimit(FRESH, "paymaster");
  check("7.8 an unreadable budget peeks as 'unavailable', never as 'open'", blind.status === "unavailable", JSON.stringify(blind));
  const blindTok = await askToken(FRESH);
  check("7.9 …so no token is minted (the paymaster would refuse it the same way)",
    blindTok.status === 503 && blindTok.json.token === null && blindTok.json.reason === "sponsorship_unavailable",
    `${blindTok.status} ${JSON.stringify(blindTok.json)}`);
  kv.get = realGet;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;

  console.log("\n8. A refused send falls back to user-paid gas — once");
  const viemLike = (code: number, message: string) => {
    // The shape viem hands a card: a wrapper whose cause is the wallet's RPC error.
    const inner = Object.assign(new Error(message), { code, details: message });
    return Object.assign(new Error(`Transaction failed.\n\nDetails: ${message}`), { shortMessage: "Transaction failed.", cause: inner });
  };
  check("8.1 our paymaster's refusal, wrapped by viem, is recognised",
    isSponsorshipRefusal(viemLike(-32005, "gas sponsorship limit reached for this wallet — try again later, or send without sponsorship")));
  check("8.2 an expired token (-32001) is recognised", isSponsorshipRefusal(viemLike(-32001, "gas sponsorship refused (expired)")));
  check("8.3 a wallet that rewords it but keeps the code is recognised", isSponsorshipRefusal(viemLike(-32005, "Limit exceeded")));
  check("8.4 a wallet that keeps only the word 'paymaster' is recognised", isSponsorshipRefusal(new Error("Paymaster request failed")));
  check("8.5 a user cancel is NOT a refusal — even one that mentions the paymaster",
    !isSponsorshipRefusal(viemLike(4001, "User rejected the request.")) && !isSponsorshipRefusal(new Error("User denied paymaster request")));
  check("8.6 a revert, a timeout or a network error is NOT a refusal (no second prompt that could double-send)",
    !isSponsorshipRefusal(viemLike(3, "execution reverted")) && !isSponsorshipRefusal(new Error("The request took too long to respond."))
      && !isSponsorshipRefusal(new TypeError("Failed to fetch")));

  const DS = { value: "0xdeadbeef" as `0x${string}`, optional: true };
  const run = async (paymasterUrl: string | null, outcomes: Array<"ok" | Error>) => {
    const calls: SendCapabilities[] = [];
    let refused = 0;
    let result: unknown;
    let thrown: unknown;
    try {
      result = await sendWithSponsorFallback({
        paymasterUrl,
        dataSuffix: DS,
        onRefused: () => { refused++; },
        send: async (caps) => {
          calls.push(caps);
          const o = outcomes[calls.length - 1];
          if (o instanceof Error) throw o;
          return `id-${calls.length}`;
        },
      });
    } catch (e) { thrown = e; }
    return { calls, refused, result, thrown };
  };
  const PM = "https://blueagent.dev/api/paymaster?network=base&t=x";
  let x = await run(null, ["ok"]);
  check("8.7 no token → one user-paid send, no paymaster attached",
    x.calls.length === 1 && !x.calls[0].paymasterService && x.calls[0].dataSuffix === DS && x.refused === 0);
  x = await run(PM, ["ok"]);
  check("8.8 token → one sponsored send", x.calls.length === 1 && x.calls[0].paymasterService?.url === PM && x.result === "id-1");
  x = await run(PM, [viemLike(-32005, "gas sponsorship limit reached for this wallet"), "ok"]);
  check("8.9 refused → retried ONCE without the paymaster (same builder code), and the card is told",
    x.calls.length === 2 && x.calls[0].paymasterService?.url === PM && !x.calls[1].paymasterService
      && x.calls[1].dataSuffix === DS && x.refused === 1 && x.result === "id-2" && !x.thrown,
    JSON.stringify({ calls: x.calls.length, refused: x.refused, result: x.result }));
  const cancel = viemLike(4001, "User rejected the request.");
  x = await run(PM, [cancel]);
  check("8.10 a cancel is not retried and not reported as a refusal", x.calls.length === 1 && x.thrown === cancel && x.refused === 0);
  const second = new Error("insufficient funds for gas");
  x = await run(PM, [viemLike(-32001, "gas sponsorship refused (expired)"), second]);
  check("8.11 a failed fallback surfaces ITS error, and never loops", x.calls.length === 2 && x.thrown === second);

  console.log(`\npaymaster-gate-test: ${passes}/${passes + failures} passed`);
  if (failures > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
