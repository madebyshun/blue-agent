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

let passes = 0;
let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (pass) passes++; else failures++;
}

const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

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

  console.log("\n5. Tokens come only from a SIWE session");
  const { POST: TOKEN } = await import("../src/app/api/paymaster/token/route");
  const anon = await TOKEN(new NextRequest("http://localhost/api/paymaster/token", { method: "POST", body: JSON.stringify({ network: "base" }) }));
  const anonJson = (await anon.json()) as { token?: unknown; reason?: string };
  check("5.1 no session → 401, no token", anon.status === 401 && anonJson.token === null, `${anon.status} ${JSON.stringify(anonJson)}`);
  const sessionToken = await createSession(WALLET);
  const signed = await TOKEN(new NextRequest("http://localhost/api/paymaster/token", {
    method: "POST",
    body: JSON.stringify({ network: "base" }),
    headers: { cookie: `${SESSION_COOKIE}=${sessionToken}` },
  }));
  const signedJson = (await signed.json()) as { token?: string; wallet?: string };
  const bound = verifyPaymasterToken(signedJson.token, "base");
  check("5.2 a session gets a token bound to ITS wallet", signed.status === 200 && bound.ok && bound.wallet === WALLET,
    `${signed.status} wallet=${signedJson.wallet}`);

  const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const msg = "BlueAgent test message";
  const sigEoa = await account.signMessage({ message: msg });
  check("5.3 verifySiwe still accepts a plain EOA signature (no RPC needed)", await verifySiwe(account.address, msg, sigEoa));

  const sessionSrc = readFileSync(join(process.cwd(), "src/lib/session.ts"), "utf8");
  const fn = sessionSrc.slice(sessionSrc.indexOf("export async function verifySiwe"));
  check("5.4 verifySiwe falls back to the chain for contract-account signatures (ERC-1271/6492)",
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

  console.log(`\npaymaster-gate-test: ${passes}/${passes + failures} passed`);
  if (failures > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
