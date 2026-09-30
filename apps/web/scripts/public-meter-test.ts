/**
 * public-meter-test — G4 (2026-09-30): the public meter counts real trades,
 * from action records the chain settled, and nothing it cannot back.
 *
 *   §1  realized slippage comes from the receipt's own Transfer logs, against
 *       the quote in its stated unit; unmeasurable → null, never 0
 *   §2  each settled action counts ONCE (retries, second readers, one tx
 *       attached twice)
 *   §3  refusals count only on evidence the server measured
 *   §4  /api/stats/public: actions in, launches out, estimates and scope said,
 *       no wallet leaks
 *
 * Hermetic: KV env cleared (in-memory), every JSON-RPC answered by a stub.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}

import fs from "node:fs";
import path from "node:path";
import { encodeAbiParameters, keccak256, pad, toHex } from "viem";
import { createAction, attachTx, listActions, receivedFromLogs } from "../src/lib/actions";
import { readActionStats, recordPreTradeBlock, median, SLIP_MIN_N } from "../src/lib/action-stats";
import type { PreTradeCheck } from "../src/lib/pre-trade-check";
import { X402_PAY_TO } from "../src/lib/x402-payee";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const ALICE = "0xa11ce00000000000000000000000000000000001";
const BOB = "0xb0b0000000000000000000000000000000000002";
const POOL = "0x9001000000000000000000000000000000000009";
const TOKEN = "0x70ce000000000000000000000000000000000007"; // 6-decimals output token
const H = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const TRANSFER = keccak256(toHex("Transfer(address,address,uint256)"));
const transfer = (token: string, from: string, to: string, value: bigint) => ({
  address: token,
  topics: [TRANSFER, pad(from as `0x${string}`, { size: 32 }), pad(to as `0x${string}`, { size: 32 })],
  data: encodeAbiParameters([{ type: "uint256" }], [value]),
  logIndex: "0x0",
});

const RECEIPTS: Record<string, { from: string; logs?: unknown[]; status?: string }> = {};
let mined = new Set<string>();
function receipt(n: number, r: { from: string; logs?: unknown[]; status?: string }) {
  RECEIPTS[H(n)] = r;
  mined.add(H(n));
  return H(n);
}

globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  let req: { id: number; method: string; params: unknown[] } | null = null;
  try { req = JSON.parse(String(init?.body ?? "")); } catch { req = null; }
  const rpc = (result: unknown, error?: unknown) =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: req?.id ?? 1, ...(error ? { error } : { result }) }), { status: 200, headers: { "Content-Type": "application/json" } });
  if (!req || typeof req.method !== "string") return new Response("{}", { status: 404 });
  if (req.method === "eth_getTransactionReceipt") {
    const h = String(req.params[0]);
    const fx = RECEIPTS[h];
    if (!fx || !mined.has(h)) return rpc(null);
    return rpc({
      blockHash: H(7), blockNumber: "0x10", contractAddress: null, cumulativeGasUsed: "0x5208",
      effectiveGasPrice: "0x1", from: fx.from, gasUsed: "0x5208",
      logs: (fx.logs ?? []).map((l) => ({ ...(l as object), blockHash: H(7), blockNumber: "0x10", transactionHash: h, transactionIndex: "0x0", removed: false })),
      logsBloom: `0x${"0".repeat(512)}`, status: fx.status ?? "0x1", to: POOL, transactionHash: h, transactionIndex: "0x0", type: "0x2",
    });
  }
  if (req.method === "eth_call") {
    const data = String((req.params[0] as { data?: string }).data ?? "");
    if (data.startsWith("0x313ce567")) return rpc(encodeAbiParameters([{ type: "uint8" }], [6]));
    if (data.startsWith("0x95d89b41")) return rpc(encodeAbiParameters([{ type: "string" }], ["TOK"]));
  }
  return rpc(null, { code: 3, message: "execution reverted" });
}) as typeof fetch;

const swap = (quote: Parameters<typeof createAction>[0]["quote"]) =>
  createAction({ wallet: ALICE, kind: "swap", chain: "base", source: "wallet", params: { tokenIn: "ETH", tokenOut: TOKEN, amountIn: "0.1" }, quote });

(async () => {
  console.log("\n1. realized slippage — from the receipt, against the quote's own unit");
  ok("Transfer logs to the wallet are summed; other recipients and tokens ignored",
    receivedFromLogs([transfer(TOKEN, POOL, ALICE, 600n), transfer(TOKEN, POOL, ALICE, 390n), transfer(TOKEN, POOL, BOB, 5n), transfer(POOL, POOL, ALICE, 7n)] as never, TOKEN, ALICE) === 990n);
  ok("native-ETH output leaves no log → null (unmeasured, never 0)",
    receivedFromLogs([] as never, "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", ALICE) === null);

  let a = await swap({ expected_out: "1000", unit: "base" });
  let r = await attachTx(a.id, receipt(1, { from: ALICE, logs: [transfer(TOKEN, POOL, ALICE, 990n)] }));
  ok("base-unit quote 1000, received 990 → 100 bps", r.ok && r.record.realized?.slippage_bps === 100 && r.record.realized?.out === "990", JSON.stringify(r.ok && r.record.realized));

  a = await swap({ expected_out: "10.0", unit: "whole" });
  r = await attachTx(a.id, receipt(2, { from: ALICE, logs: [transfer(TOKEN, POOL, ALICE, 10_050_000n)] }));
  ok("whole-unit quote 10.0 (decimals read on-chain: 6), received 10.05 → −50 bps (better than quoted)",
    r.ok && r.record.realized?.slippage_bps === -50, JSON.stringify(r.ok && r.record.realized));

  a = await swap({ expected_out: "1000" });
  r = await attachTx(a.id, receipt(3, { from: ALICE, logs: [transfer(TOKEN, POOL, ALICE, 990n)] }));
  ok("a quote with no unit → the output is recorded, the slippage is null", r.ok && r.record.realized?.out === "990" && r.record.realized?.slippage_bps === null, JSON.stringify(r.ok && r.record.realized));

  a = await swap({ expected_out: "1000", unit: "base" });
  r = await attachTx(a.id, receipt(4, { from: ALICE, status: "0x0" }));
  ok("a reverted swap has no realized output", r.ok && r.record.status === "reverted" && !r.record.realized);

  const send = await createAction({ wallet: ALICE, kind: "send", chain: "robinhood", source: "mcp", params: { token: "ETH", amount: "1", to: BOB } });
  await attachTx(send.id, receipt(5, { from: ALICE }));

  console.log("\n2. each settled action counts once");
  let st = await readActionStats();
  ok("confirmed 4 (3 swaps + 1 send), reverted 1", st.confirmed === 4 && st.reverted === 1, JSON.stringify({ c: st.confirmed, r: st.reverted }));
  ok("by kind / chain / agent", st.by_kind.swap === 3 && st.by_kind.send === 1 && st.by_chain.base === 3 && st.by_chain.robinhood === 1 && st.via_agent === 1, JSON.stringify(st));
  ok("distinct wallets is a count (1)", st.wallets === 1);
  ok(`two measured samples (< ${SLIP_MIN_N}) → the median is withheld, n is said`, st.slippage.n === 2 && st.slippage.median_bps === null, JSON.stringify(st.slippage));
  ok("the meter says when it started (forward-only)", typeof st.since === "string" && st.since.length >= 10);

  await attachTx(a.id, H(4));
  st = await readActionStats();
  ok("re-attaching the same tx to the same action does not recount", st.reverted === 1 && st.confirmed === 4);
  const dup = await swap({ expected_out: "1000", unit: "base" });
  r = await attachTx(dup.id, H(1));
  st = await readActionStats();
  ok("one tx cannot back a second action — refused, not recounted", !r.ok && st.confirmed === 4, JSON.stringify(r));

  // A pending hash settled by the owner's reads — twice — counts once.
  const pend = await swap({ expected_out: "1000", unit: "base" });
  RECEIPTS[H(6)] = { from: ALICE, logs: [transfer(TOKEN, POOL, ALICE, 1000n)] };
  r = await attachTx(pend.id, H(6));
  ok("unmined → submitted", r.ok && r.record.status === "submitted");
  mined.add(H(6));
  await listActions(ALICE);
  await listActions(ALICE);
  st = await readActionStats();
  ok("settled on read, twice → counted once", st.confirmed === 5 && st.slippage.n === 3, JSON.stringify({ c: st.confirmed, n: st.slippage.n }));

  for (let i = 0; i < 3; i++) {
    const x = await swap({ expected_out: "1000", unit: "base" });
    await attachTx(x.id, receipt(10 + i, { from: ALICE, logs: [transfer(TOKEN, POOL, ALICE, 980n)] }));
  }
  st = await readActionStats();
  ok(`at ${SLIP_MIN_N}+ samples the median is published`, st.slippage.n === 6 && st.slippage.median_bps === median([100, -50, 0, 200, 200, 200]), JSON.stringify(st.slippage));

  console.log("\n3. refusals count only on measured evidence");
  const block = (code: string, level: "BLOCK" | "WARN" = "BLOCK"): PreTradeCheck =>
    ({ verdict: level === "BLOCK" ? "BLOCK" : "WARN", asset_type: "crypto", label: "x", reasons: [{ level, code: code as never, text: "t" }], checked_at: "" });
  await recordPreTradeBlock(block("IMPOSTOR"), { chain: "base", token: "0xAAAA000000000000000000000000000000000001" }, { costMeasuredByServer: false });
  await recordPreTradeBlock(block("IMPOSTOR"), { chain: "base", token: "0xaaaa000000000000000000000000000000000001" }, { costMeasuredByServer: false });
  await recordPreTradeBlock(block("HONEYPOT"), { chain: "base", token: "0xbbbb000000000000000000000000000000000002" }, { costMeasuredByServer: false });
  await recordPreTradeBlock(block("NOT_ADDRESS"), { chain: "base", token: "NVDA" }, { costMeasuredByServer: false });
  await recordPreTradeBlock(block("IMPOSTOR", "WARN"), { chain: "base", token: "0xcccc000000000000000000000000000000000003" }, { costMeasuredByServer: false });
  st = await readActionStats();
  ok("distinct tokens refused on evidence: the same token twice (any case) counts once; a ticker typo and a WARN do not count",
    st.blocked.tokens === 2, `tokens=${st.blocked.tokens}`);
  await recordPreTradeBlock(block("BRIDGE_COST"), { chain: "base", token: "ETH" }, { costMeasuredByServer: false });
  st = await readActionStats();
  ok("a bridge BLOCK on a browser-reported cost is not counted", st.blocked.bridges === 0);
  await recordPreTradeBlock(block("BRIDGE_COST"), { chain: "base", token: "ETH" }, { costMeasuredByServer: true });
  st = await readActionStats();
  ok("a bridge BLOCK on a cost this server read is", st.blocked.bridges === 1);

  console.log("\n4. /api/stats/public");
  const { GET } = await import("../src/app/api/stats/public/route");
  const body = (await (await GET()).json()) as Record<string, unknown> & {
    actions?: { ok?: boolean; confirmed?: number };
    usage?: { revenueEstBasis?: string };
    settlement?: { scope?: string; verify_url?: string };
  };
  ok("actions block published, readable", body.actions?.ok === true && body.actions.confirmed === 8, JSON.stringify(body.actions));
  ok("the retired launches block is absent (not zeroed)", !("launches" in body));
  ok("revenueEst carries its basis: an estimate, not revenue", /Estimate/.test(body.usage?.revenueEstBasis ?? "") && /not revenue/.test(body.usage?.revenueEstBasis ?? ""));
  ok("settlement states its scope and where to verify", /Forward-only/.test(body.settlement?.scope ?? "") && (body.settlement?.verify_url ?? "").toLowerCase().includes(X402_PAY_TO.toLowerCase()));
  const wire = JSON.stringify(body).toLowerCase();
  ok("no trading wallet appears anywhere in the public payload", !wire.includes(ALICE.slice(2)) && !wire.includes(BOB.slice(2)));

  const view = fs.readFileSync(path.resolve(__dirname, "../src/app/stats/StatsView.tsx"), "utf8");
  ok("/stats: no launches read, trades shown, revenue labelled an estimate",
    !/launches\./.test(view) && /Trades Signed/.test(view) && /not settled/.test(view) && /paid, free & internal/.test(view));
  ok("/stats: the arrow record is linked as history while arrows are frozen", /ARROWS_FROZEN \?/.test(view) && /as history/.test(view));

  console.log(failures === 0 ? "\npublic-meter-test: PASS" : `\npublic-meter-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
