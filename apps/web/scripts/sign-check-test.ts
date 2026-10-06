/**
 * sign-check-test — "what will signing this do?" (lib/sign-check.ts, plan
 * 2026-10-06 task 1.2). Hermetic: RPC (getCode, eth_call, eth_simulateV1) and
 * GoPlus are stubs.
 *
 *   1. transactions: decode + simulate; unlimited grant, grant to a wallet,
 *      operator-for-all, revert, out-only unknown call; a revoke is clean
 *   2. typed data: Permit2, ERC-2612, DAI, Seaport (giveaway BLOCKs), other
 *      chain, unknown type
 *   3. EIP-7702: always WARN, chainId 0 flagged, a cleared delegation is clean
 *   4. evidence: a flagged spender BLOCKs; an unread feed never does
 *   5. the catalog + MCP + chat wiring
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];

import fs from "node:fs";
import path from "node:path";
import { encodeAbiParameters } from "viem";
import { signCheck, decodeCall, __setSignFetch } from "../src/lib/sign-check";
import { __setRecipientFetch } from "../src/lib/recipient-check";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const FROM    = "0x1111111111111111111111111111111111111111";
const TOKEN   = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ROUTER  = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"; // a contract
const WALLET  = "0xcccccccccccccccccccccccccccccccccccccccc"; // no code
const THIEF   = "0xdddddddddddddddddddddddddddddddddddddddd"; // flagged, a contract
const NFT     = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee01";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const MAX = "f".repeat(64);
const pad = (h: string) => h.replace(/^0x/, "").padStart(64, "0");
const topic = (a: string) => "0x" + pad(a);

let goplusUp = true;
let sim: { status: "0x1" | "0x0"; logs: { address: string; topics: string[]; data: string }[] } | "error" = { status: "0x1", logs: [] };

const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  let req: { id?: number; method?: string; params?: unknown[] } | { id?: number; method?: string; params?: unknown[] }[] | null = null;
  try { req = JSON.parse(String(init?.body ?? "")); } catch { req = null; }
  const one = (r: { id?: number; method?: string; params?: unknown[] }) => {
    const reply = (result: unknown) => ({ jsonrpc: "2.0", id: r.id ?? 1, result });
    if (r.method === "eth_getCode") {
      const at = String((r.params as string[])[0]).toLowerCase();
      return reply([TOKEN, ROUTER, THIEF, PERMIT2.toLowerCase(), NFT].includes(at) ? "0x6080" : "0x");
    }
    if (r.method === "eth_call") {
      const c = (r.params as { to: string; data?: string; input?: string }[])[0];
      const d = String(c.data ?? c.input ?? "");
      if (d.startsWith("0x313ce567")) return reply(encodeAbiParameters([{ type: "uint8" }], [6]));
      if (d.startsWith("0x95d89b41")) return reply(encodeAbiParameters([{ type: "string" }], ["USDC"]));
      return { jsonrpc: "2.0", id: r.id ?? 1, error: { code: 3, message: "execution reverted" } };
    }
    if (r.method === "eth_simulateV1") {
      if (sim === "error") return { jsonrpc: "2.0", id: r.id ?? 1, error: { code: -32000, message: "insufficient funds" } };
      return reply([{ calls: [{ status: sim.status, logs: sim.logs }] }]);
    }
    return reply(null);
  };
  if (Array.isArray(req)) return Response.json(req.map(one));
  if (req && (req as { method?: string }).method) return Response.json(one(req as { method?: string }));
  if (url.startsWith("https://api.gopluslabs.io/")) {
    if (!goplusUp) return new Response("down", { status: 504 });
    const addr = url.split("/address_security/")[1].split("?")[0].toLowerCase();
    return Response.json({ code: 1, result: { stealing_attack: addr === THIEF ? "1" : "0", sanctioned: "0", mixer: "0", blacklist_doubt: "0", data_source: addr === THIEF ? "ScamSniffer" : "" } });
  }
  return new Response("not stubbed", { status: 502 });
}) as typeof fetch;
globalThis.fetch = stub;
__setSignFetch(stub);
__setRecipientFetch(stub);

const codes = (c: { reasons: { code: string; level: string }[] }) => c.reasons.map((r) => `${r.level}:${r.code}`);
const has = (c: { reasons: { code: string; level: string }[] }, code: string, level?: string) => c.reasons.some((r) => r.code === code && (!level || r.level === level));
const transferLog = (token: string, from: string, to: string, amt: bigint) =>
  ({ address: token, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", topic(from), topic(to)], data: "0x" + amt.toString(16).padStart(64, "0") });

(async () => {
  console.log("1. transactions");
  ok("decodeCall reads Permit2.approve only on the Permit2 contract",
    decodeCall(PERMIT2, "0x87517c45" + pad(TOKEN) + pad(ROUTER) + MAX + pad("1")).kind === "approve" && decodeCall(ROUTER, "0x87517c45" + pad(TOKEN)).kind === "unknown");
  let c = await signCheck({ chain: "base", from: FROM, tx: { to: TOKEN, data: "0x095ea7b3" + pad(ROUTER) + MAX } });
  ok("unlimited approve to a contract → WARN GRANT_UNLIMITED, not PARTY_NO_CODE", c.verdict === "WARN" && has(c, "GRANT_UNLIMITED") && !has(c, "PARTY_NO_CODE"), codes(c).join(","));
  ok("…and the summary names the spender and UNLIMITED", /UNLIMITED USDC/.test(c.summary[0]) && c.summary[0].includes(ROUTER), c.summary[0]);
  c = await signCheck({ chain: "base", from: FROM, tx: { to: TOKEN, data: "0x095ea7b3" + pad(WALLET) + pad("f4240") } });
  ok("a bounded approve to a plain wallet → WARN PARTY_NO_CODE", has(c, "PARTY_NO_CODE", "WARN") && !has(c, "GRANT_UNLIMITED"), codes(c).join(","));
  c = await signCheck({ chain: "base", from: FROM, tx: { to: TOKEN, data: "0x095ea7b3" + pad(WALLET) + pad("0") } });
  ok("approve(…, 0) is a revoke → PASS with a revoke summary", c.verdict === "PASS" && /Revokes/.test(c.summary[0]), codes(c).join(","));
  c = await signCheck({ chain: "base", from: FROM, tx: { to: NFT, data: "0xa22cb465" + pad(ROUTER) + pad("1") } });
  ok("setApprovalForAll(true) → WARN OPERATOR_ALL", has(c, "OPERATOR_ALL", "WARN"));
  sim = { status: "0x0", logs: [] };
  c = await signCheck({ chain: "base", from: FROM, tx: { to: ROUTER, data: "0x12345678" } });
  ok("a reverting simulation → WARN SIM_REVERTS", has(c, "SIM_REVERTS", "WARN") && c.simulated === true);
  sim = { status: "0x1", logs: [transferLog(TOKEN, FROM, ROUTER, 5_000_000n)] };
  c = await signCheck({ chain: "base", from: FROM, tx: { to: ROUTER, data: "0x12345678" } });
  ok("an unknown call that only takes assets → WARN SIM_OUT_ONLY, with the effect listed",
    has(c, "SIM_OUT_ONLY", "WARN") && c.effects?.[0]?.direction === "out" && c.effects?.[0]?.amount === "5" && c.effects?.[0]?.symbol === "USDC", JSON.stringify(c.effects));
  sim = { status: "0x1", logs: [transferLog(TOKEN, FROM, ROUTER, 5_000_000n), transferLog("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", ROUTER, FROM, 10n ** 15n)] };
  c = await signCheck({ chain: "base", from: FROM, tx: { to: ROUTER, data: "0x12345678" } });
  ok("a swap-shaped call (out and in) is not flagged out-only; ETH in is read", !has(c, "SIM_OUT_ONLY") && c.effects?.some((e) => e.direction === "in" && e.symbol === "ETH" && e.amount === "0.001") === true, JSON.stringify(c.effects));
  sim = "error";
  c = await signCheck({ chain: "base", from: FROM, tx: { to: ROUTER, data: "0x12345678" } });
  ok("unknown call + simulation failed → WARN TX_UNREAD (an unmeasured gap is never PASS)", has(c, "TX_UNREAD", "WARN") && c.simulated === false);
  sim = { status: "0x1", logs: [] };
  c = await signCheck({ chain: "base", tx: { to: TOKEN, data: "0xa9059cbb" + pad(ROUTER) + pad("f4240") } });
  ok("a decoded transfer with no `from` → INFO only (decoded, not simulated)", c.verdict === "PASS" && has(c, "SIM_NO_FROM", "INFO"));

  console.log("2. typed data");
  const now = Math.floor(Date.now() / 1000);
  c = await signCheck({ chain: "base", typedData: { domain: { name: "Permit2", chainId: 8453, verifyingContract: PERMIT2 }, primaryType: "PermitSingle",
    message: { details: { token: TOKEN, amount: "1461501637330902918203684832716283019655932542975", expiration: "281474976710655", nonce: 0 }, spender: ROUTER, sigDeadline: String(now + 600) } } });
  ok("Permit2 PermitSingle max → WARN unlimited + long-lived", has(c, "GRANT_UNLIMITED") && has(c, "GRANT_LONG_LIVED") && c.kind === "typed_data" && c.simulated === null, codes(c).join(","));
  c = await signCheck({ chain: "base", typedData: JSON.stringify({ domain: { name: "USD Coin", chainId: 8453, verifyingContract: TOKEN }, primaryType: "Permit",
    message: { owner: FROM, spender: THIEF, value: "1000000", nonce: 0, deadline: String(now + 600) } }) });
  ok("ERC-2612 permit (as a JSON string) to a flagged spender → BLOCK naming the source", c.verdict === "BLOCK" && c.reasons.some((r) => r.code === "PARTY_FLAGGED" && /ScamSniffer/.test(r.text)));
  c = await signCheck({ chain: "base", typedData: { domain: { name: "Dai", chainId: 8453, verifyingContract: TOKEN }, primaryType: "Permit", message: { holder: FROM, spender: ROUTER, nonce: 0, expiry: 0, allowed: true } } });
  ok("DAI-style permit allowed=true reads as unlimited", has(c, "GRANT_UNLIMITED"));
  c = await signCheck({ chain: "base", typedData: { domain: { name: "Seaport", chainId: 8453 }, primaryType: "OrderComponents",
    message: { offerer: FROM, offer: [{ token: NFT, startAmount: "1" }], consideration: [{ token: "0x0000000000000000000000000000000000000000", startAmount: "1", recipient: WALLET }] } } });
  ok("Seaport order that pays the signer nothing → BLOCK SEAPORT_GIVEAWAY", c.verdict === "BLOCK" && has(c, "SEAPORT_GIVEAWAY"));
  c = await signCheck({ chain: "base", typedData: { domain: { name: "Seaport", chainId: 8453 }, primaryType: "OrderComponents",
    message: { offerer: FROM, offer: [{ token: NFT, startAmount: "1" }], consideration: [{ startAmount: "1000000000000000000", recipient: FROM }, { startAmount: "25000000000000000", recipient: ROUTER }] } } });
  ok("a normal Seaport listing → WARN SEAPORT_ORDER, not BLOCK", c.verdict === "WARN" && has(c, "SEAPORT_ORDER"));
  c = await signCheck({ chain: "base", typedData: { domain: { name: "Permit2", chainId: 1, verifyingContract: PERMIT2 }, primaryType: "PermitSingle",
    message: { details: { token: TOKEN, amount: "100", expiration: String(now + 600) }, spender: ROUTER } } });
  ok("a domain for another chain → WARN TD_OTHER_CHAIN", has(c, "TD_OTHER_CHAIN", "WARN"));
  c = await signCheck({ chain: "base", typedData: { domain: { name: "SomeApp" }, primaryType: "Mail", message: { contents: "hi" } } });
  ok("an unrecognised primaryType → WARN, never PASS", c.verdict === "WARN" && has(c, "TD_UNKNOWN_TYPE"));
  c = await signCheck({ chain: "base", typedData: "not json" });
  ok("garbage → WARN TD_UNREAD", has(c, "TD_UNREAD", "WARN"));

  console.log("3. EIP-7702");
  c = await signCheck({ chain: "base", authorization: { address: ROUTER, chainId: 8453 } });
  ok("a delegation is always WARN", c.verdict === "WARN" && has(c, "AUTH_DELEGATION") && !has(c, "AUTH_ANY_CHAIN"));
  c = await signCheck({ chain: "base", authorization: { address: WALLET, chainId: 0 } });
  ok("chainId 0 and a delegate with no code are both called out", has(c, "AUTH_ANY_CHAIN") && has(c, "AUTH_NO_CODE"));
  c = await signCheck({ chain: "base", authorization: { address: THIEF, chainId: 8453 } });
  ok("a flagged delegate → BLOCK", c.verdict === "BLOCK");
  c = await signCheck({ chain: "base", authorization: { address: "0x0000000000000000000000000000000000000000", chainId: 8453 } });
  ok("delegating to 0x0 clears the delegation → PASS", c.verdict === "PASS");

  console.log("4. unread feed");
  goplusUp = false;
  c = await signCheck({ chain: "base", from: FROM, tx: { to: TOKEN, data: "0x095ea7b3" + pad(THIEF) + pad("f4240") } });
  ok("feed down: no BLOCK claimed, the gap is stated", c.verdict !== "BLOCK" && has(c, "PARTY_FLAGS_UNREAD", "INFO"), codes(c).join(","));
  goplusUp = true;

  console.log("5. wiring");
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");
  ok("catalog: sign-check is a $0.00 id", /id: "sign-check",[\s\S]{0,2500}?price: "\$0\.00"/.test(read("src/lib/agent-tools.ts")));
  ok("HANDLERS has it", /"sign-check":\s+hSignCheck/.test(read("src/app/api/x402/_handlers/index.ts")));
  ok("MCP: hub_sign_check in the manifest and the map", /name: "hub_sign_check"/.test(read("src/lib/mcp-tools.ts")) && /hub_sign_check:\s+"sign-check"/.test(read("src/app/api/mcp/route.ts")));
  ok("chat: defined, dispatched, and routed to by the prompt", /name: "hub_sign_check"/.test(read("src/app/api/chat/route.ts")) && /hub_sign_check:\s+"sign-check"/.test(read("src/app/api/chat/route.ts")) && /hub_sign_check/.test(read("src/app/api/chat/system-prompt.ts")));

  console.log(failures === 0 ? "\nsign-check-test: PASS" : `\nsign-check-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
