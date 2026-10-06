/**
 * approval-audit-test — open grants + unsigned revokes (lib/approval-audit.ts,
 * plan 2026-10-06 task 1.3). Hermetic: explorer, RPC and GoPlus are stubs.
 *
 *   1. history is a candidate list; LIVE state decides (spent/revoked = closed)
 *   2. levels in code: flagged → BLOCK, plain-wallet spender / unlimited /
 *      operator-for-all / long Permit2 → WARN, bounded to a contract → INFO
 *   3. exposure = min(allowance, balance); Permit2 "never" expiry
 *   4. each revoke decodes to the right zeroing call on the right contract
 *   5. unread history is reported, and the route answers 502, never an empty 200
 *   6. Blockscout's null-padded topics are read correctly (measured shape)
 *   7. wiring: catalog, HANDLERS, chat tool + card
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "BLOCKSCOUT_API_KEY"]) delete process.env[k];

import fs from "node:fs";
import path from "node:path";
import { decodeFunctionData, encodeAbiParameters } from "viem";
import { approvalAudit, __setAuditFetch, PERMIT2 } from "../src/lib/approval-audit";
import { __setRecipientFetch } from "../src/lib/recipient-check";
import { HANDLERS } from "../src/app/api/x402/_handlers/index";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const OWNER  = "0x1111111111111111111111111111111111111111";
const USDC   = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OLD    = "0xabababababababababababababababababababab"; // approved once, since revoked
const ROUTER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"; // contract, unlimited
const DAPP   = "0xb0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0"; // contract, bounded
const EOA    = "0xcccccccccccccccccccccccccccccccccccccccc"; // plain wallet spender
const THIEF  = "0xdddddddddddddddddddddddddddddddddddddddd"; // flagged contract
const NFT    = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee01";
const MARKET = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee02";
const UNI    = "0xf0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0"; // Permit2 spender
const T = {
  approval: "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
  all:      "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31",
  p2:       "0xda9fa7c1b00402c17d0161b249b1ab8bbec047c5a52207b9c112deffd817036b",
};
const tp = (a: string) => "0x" + a.slice(2).padStart(64, "0");
const word = (n: bigint) => encodeAbiParameters([{ type: "uint256" }], [n]);
const MAXU = 2n ** 256n - 1n;
const allowance: Record<string, bigint> = { [`${USDC}|${ROUTER}`]: MAXU, [`${USDC}|${DAPP}`]: 5_000_000n, [`${USDC}|${EOA}`]: 1_000_000n, [`${USDC}|${THIEF}`]: 10n ** 12n, [`${USDC}|${OLD}`]: 0n };
let historyUp = true;
const seen: string[] = [];

const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("blockscout.com")) seen.push(url);
  if (url.startsWith("https://api.blockscout.com/")) return new Response("pro down in this test", { status: 503 });
  if (url.includes("blockscout.com/api?module=logs")) {
    if (!historyUp) return Response.json({ message: "Too many requests", result: null, status: "0" }, { status: 429 });
    const u = new URL(url);
    const t0 = u.searchParams.get("topic0"), addr = u.searchParams.get("address");
    // Measured shape: topics padded to four with null.
    if (t0 === T.approval) return Response.json({ message: "OK", status: "1", result: [ROUTER, DAPP, EOA, THIEF, OLD].map((sp) => ({ address: USDC, topics: [T.approval, tp(OWNER), tp(sp), null], data: word(1n) })) });
    if (t0 === T.all) return Response.json({ message: "OK", status: "1", result: [{ address: NFT, topics: [T.all, tp(OWNER), tp(MARKET), null], data: word(1n) }] });
    if (!t0 && addr?.toLowerCase() === PERMIT2.toLowerCase()) return Response.json({ message: "OK", status: "1", result: [{ address: PERMIT2, topics: [T.p2, tp(OWNER), tp(USDC), tp(UNI)], data: "0x" }] });
    return Response.json({ message: "No logs found", status: "0", result: [] });
  }
  if (url.startsWith("https://api.gopluslabs.io/")) {
    const a = url.split("/address_security/")[1].split("?")[0].toLowerCase();
    return Response.json({ code: 1, result: { stealing_attack: a === THIEF ? "1" : "0", sanctioned: "0", mixer: "0", blacklist_doubt: "0", data_source: a === THIEF ? "ScamSniffer" : "" } });
  }
  let req: { id?: number; method?: string; params?: unknown[] } | null = null;
  try { req = JSON.parse(String(init?.body ?? "")); } catch { req = null; }
  const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: req?.id ?? 1, result });
  if (req?.method === "eth_getCode") {
    const at = String((req.params as string[])[0]).toLowerCase();
    return reply(at === EOA ? "0x" : "0x6080");
  }
  if (req?.method === "eth_call") {
    const c = (req.params as { to: string; data?: string; input?: string }[])[0];
    const d = String(c.data ?? c.input ?? ""), to = c.to.toLowerCase();
    const arg = (i: number) => "0x" + d.slice(10 + i * 64 + 24, 10 + (i + 1) * 64);
    if (d.startsWith("0xdd62ed3e")) return reply(word(allowance[`${to}|${arg(1)}`] ?? 0n));            // allowance(owner, spender)
    if (d.startsWith("0x70a08231")) return reply(word(7_000_000n));                                     // balanceOf → 7 USDC
    if (d.startsWith("0x313ce567")) return reply(encodeAbiParameters([{ type: "uint8" }], [6]));
    if (d.startsWith("0x95d89b41")) return reply(encodeAbiParameters([{ type: "string" }], ["USDC"]));
    if (d.startsWith("0xe985e9c5")) return reply(word(1n));                                             // isApprovedForAll → true
    if (d.startsWith("0x927da105")) return reply(encodeAbiParameters([{ type: "uint160" }, { type: "uint48" }, { type: "uint48" }], [2n ** 160n - 1n, 2 ** 48 - 1, 0])); // Permit2.allowance
    return Response.json({ jsonrpc: "2.0", id: req.id ?? 1, error: { code: 3, message: "execution reverted" } });
  }
  return new Response("not stubbed", { status: 502 });
}) as typeof fetch;
globalThis.fetch = stub;
__setAuditFetch(stub, 0);
__setRecipientFetch(stub);

const ERC20 = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }] as const;
const NFTA = [{ type: "function", name: "setApprovalForAll", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "bool" }], outputs: [] }] as const;
const P2 = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }, { type: "uint160" }, { type: "uint48" }], outputs: [] }] as const;

(async () => {
  const a = await approvalAudit("base", OWNER, { fresh: true });
  const find = (type: string, spender: string) => a.grants.find((g) => g.type === type && g.spender === spender.toLowerCase());

  console.log("1. state decides");
  ok("6 live grants (4 ERC-20 + 1 operator + 1 Permit2); the revoked one is closed", a.counts.live === 6 && a.counts.closed_since === 1 && !find("erc20", OLD), JSON.stringify(a.counts));
  ok("nothing unread", a.unread.length === 0, JSON.stringify(a.unread));

  console.log("2. levels");
  ok("flagged spender → BLOCK, sorted first", a.grants[0].level === "BLOCK" && a.grants[0].spender === THIEF && /stealing attack/.test(a.grants[0].why));
  ok("plain-wallet spender → WARN", find("erc20", EOA)?.level === "WARN" && find("erc20", EOA)?.spender_is_contract === false);
  ok("unlimited to a contract → WARN", find("erc20", ROUTER)?.level === "WARN" && find("erc20", ROUTER)?.allowance === "UNLIMITED");
  ok("bounded to a contract → INFO", find("erc20", DAPP)?.level === "INFO");
  ok("operator-for-all → WARN", find("nft_operator", MARKET)?.level === "WARN");
  ok("Permit2 max → WARN, expires never", find("permit2", UNI)?.level === "WARN" && find("permit2", UNI)?.expires === "never");

  console.log("3. exposure");
  ok("exposure is min(allowance, balance): unlimited on a 7 USDC balance exposes 7", find("erc20", ROUTER)?.exposed === "7");
  ok("…and a 5 USDC grant exposes 5", find("erc20", DAPP)?.exposed === "5");

  console.log("4. revokes");
  const r1 = find("erc20", ROUTER)!.revoke;
  const d1 = decodeFunctionData({ abi: ERC20, data: r1.data as `0x${string}` });
  ok("ERC-20 revoke = approve(spender, 0) on the token", r1.to === USDC && d1.functionName === "approve" && String(d1.args[0]).toLowerCase() === ROUTER && d1.args[1] === 0n && r1.chain_id === 8453);
  const r2 = find("nft_operator", MARKET)!.revoke;
  const d2 = decodeFunctionData({ abi: NFTA, data: r2.data as `0x${string}` });
  ok("operator revoke = setApprovalForAll(operator, false) on the collection", r2.to === NFT && d2.args[1] === false);
  const r3 = find("permit2", UNI)!.revoke;
  const d3 = decodeFunctionData({ abi: P2, data: r3.data as `0x${string}` });
  ok("Permit2 revoke = Permit2.approve(token, spender, 0, 0)", r3.to === PERMIT2 && String(d3.args[0]).toLowerCase() === USDC && d3.args[2] === 0n);

  console.log("5. unread");
  historyUp = false;
  const b = await approvalAudit("base", OWNER, { fresh: true });
  ok("history down → listed in unread, no grants claimed", b.unread.length === 3 && b.grants.length === 0);
  const res = await HANDLERS["approval-audit"](new Request("https://x/api/x402/approval-audit", { method: "POST", body: JSON.stringify({ wallet: OWNER, fresh: true }) }));
  ok("the route answers 502 (not charged, not 'no approvals')", res.status === 502);
  historyUp = true;

  console.log("6. optional PRO key");
  process.env.BLOCKSCOUT_API_KEY = "proapi_test";
  seen.length = 0;
  const k = await approvalAudit("base", OWNER, { fresh: true });
  const pro = seen.filter((u) => u.startsWith("https://api.blockscout.com/v2/api?chain_id=8453&apikey=proapi_test&module=logs"));
  ok("with a key, the PRO API is asked first (chain_id + apikey)", pro.length === 3, `${pro.length} PRO request(s)`);
  ok("…and when it fails the keyless instance answers, same result", k.counts.live === 6 && k.unread.length === 0);
  ok("the key never reaches the per-chain instance", !seen.some((u) => u.includes("base.blockscout.com") && u.includes("proapi_test")));
  delete process.env.BLOCKSCOUT_API_KEY;

  console.log("7. wiring");
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");
  ok("catalog: approval-audit is a $0.00 id", /id: "approval-audit",[\s\S]{0,2500}?price: "\$0\.00"/.test(read("src/lib/agent-tools.ts")));
  ok("chat: tool, dispatch, wallet default, card", /name: "hub_approvals"/.test(read("src/app/api/chat/route.ts")) && /hub_approvals:\s+"approval-audit"/.test(read("src/app/api/chat/route.ts")) && /toolName === "hub_approvals" && !args\.wallet && userAddress/.test(read("src/app/api/chat/route.ts")) && /case "hub_approvals"/.test(read("src/app/chat/components/ToolCards.tsx")));
  ok("the card only lets the audited wallet revoke", /address\.toLowerCase\(\) === audit\.wallet\.toLowerCase\(\)/.test(read("src/components/wallet/ApprovalsPanel.tsx")) && /disabled=\{!owner/.test(read("src/components/wallet/ApprovalsPanel.tsx")));

  console.log(failures === 0 ? "\napproval-audit-test: PASS" : `\napproval-audit-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
