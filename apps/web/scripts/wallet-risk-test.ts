/**
 * wallet-risk-test — the address screen rebuilt 2026-10-07 on GoPlus +
 * explorer + chain (plan-build-2026-10-06 task 2.1). Hermetic: every request
 * is a stub.
 *
 *   1. the feed unread → 502, verdict UNKNOWN (not charged, not "clean")
 *   2. a hard GoPlus flag, or the explorer's scam mark → FLAGGED, sources named
 *   3. soft flags only → CAUTION
 *   4. nothing named → NO_KNOWN_FLAGS — the word CLEAN never appears
 *   5. chain facts: wallet / contract / EIP-7702 account (with its delegate)
 *   6. no LLM in the handler
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];

import fs from "node:fs";
import path from "node:path";
import { HANDLERS } from "../src/app/api/x402/_handlers/index";
import { __setRecipientFetch } from "../src/lib/recipient-check";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const THIEF = "0x1111111111111111111111111111111111111111";
const MIXER = "0x2222222222222222222222222222222222222222";
const PLAIN = "0x3333333333333333333333333333333333333333";
const SCAM  = "0x4444444444444444444444444444444444444444"; // explorer says scam, feed silent
const C     = "0x5555555555555555555555555555555555555555"; // contract
const D7702 = "0x6666666666666666666666666666666666666666";
const DELEG = "0x7777777777777777777777777777777777777777";
let goplusUp = true;

const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.gopluslabs.io/")) {
    if (!goplusUp) return new Response("gateway timeout", { status: 504 });
    const a = url.split("/address_security/")[1].split("?")[0].toLowerCase();
    return Response.json({ code: 1, result: {
      stealing_attack: a === THIEF ? "1" : "0", sanctioned: a === THIEF ? "1" : "0", mixer: a === MIXER ? "1" : "0",
      blacklist_doubt: "0", phishing_activities: "0", data_source: a === THIEF ? "SlowMist,BlockSec" : "",
    } });
  }
  if (url.includes("blockscout.com/api/v2/addresses/")) {
    const a = url.split("/addresses/")[1].split(/[/?]/)[0].toLowerCase();
    return Response.json({ is_scam: a === SCAM, name: null, public_tags: a === SCAM ? [{ display_name: "Fake_Phishing" }] : [] });
  }
  let req: { id?: number; method?: string; params?: unknown[] } | null = null;
  try { req = JSON.parse(String(init?.body ?? "")); } catch { req = null; }
  const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: req?.id ?? 1, result });
  if (req?.method === "eth_getCode") {
    const at = String((req.params as string[])[0]).toLowerCase();
    return reply(at === C ? "0x6080" : at === D7702 ? "0xef0100" + DELEG.slice(2) : "0x");
  }
  if (req?.method === "eth_getTransactionCount") return reply("0x18");
  if (req?.method === "eth_getBalance") return reply("0xde0b6b3a7640000");
  return new Response("not stubbed", { status: 502 });
}) as typeof fetch;
globalThis.fetch = stub;
__setRecipientFetch(stub);

async function run(address: string) {
  const r = await HANDLERS["wallet-risk"](new Request("https://x/api/x402/wallet-risk", { method: "POST", body: JSON.stringify({ address }) }));
  return { status: r.status, body: await r.json() as Record<string, any> };
}

(async () => {
  console.log("1. feed unread");
  goplusUp = false;
  let r = await run(THIEF);
  ok("502 so the x402 route never settles", r.status === 502);
  ok("verdict UNKNOWN, flags null — not screened is not clean", r.body.verdict === "UNKNOWN" && r.body.flags === null);
  goplusUp = true;

  console.log("2. FLAGGED");
  r = await run(THIEF);
  ok("hard flags → FLAGGED with the flags and their sources", r.status === 200 && r.body.verdict === "FLAGGED" && r.body.flags.hard.includes("sanctioned") && r.body.flags.source === "SlowMist,BlockSec");
  r = await run(SCAM);
  ok("the explorer's scam mark alone → FLAGGED, tag carried", r.body.verdict === "FLAGGED" && r.body.explorer.is_scam === true && r.body.explorer.tags.includes("Fake_Phishing"));

  console.log("3. CAUTION");
  r = await run(MIXER);
  ok("a soft flag only → CAUTION", r.body.verdict === "CAUTION");

  console.log("4. NO_KNOWN_FLAGS");
  r = await run(PLAIN);
  ok("nothing named → NO_KNOWN_FLAGS", r.body.verdict === "NO_KNOWN_FLAGS");
  ok("the word CLEAN appears nowhere in the response", !/\bCLEAN\b/.test(JSON.stringify(r.body)));

  console.log("5. chain facts");
  ok("a plain wallet with its nonce and balance", r.body.chain_facts.kind === "wallet" && r.body.chain_facts.outbound_tx_count === 24 && r.body.chain_facts.eth_balance === 1);
  r = await run(C);
  ok("a contract", r.body.chain_facts.kind === "contract");
  r = await run(D7702);
  ok("an EIP-7702 account names its delegate", r.body.chain_facts.kind === "eip7702_account" && r.body.chain_facts.delegate === DELEG);

  console.log("6. no LLM");
  const src = fs.readFileSync(path.resolve(__dirname, "../src/app/api/x402/_handlers/wallet-risk.ts"), "utf8");
  ok("the handler calls no model", !/callLLM|callVeniceLLM|callBankrLLM/.test(src));

  console.log(failures === 0 ? "\nwallet-risk-test: PASS" : `\nwallet-risk-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
