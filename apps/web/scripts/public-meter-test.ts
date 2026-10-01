/**
 * public-meter-test — G4 (2026-09-30): the public meter counts real trades,
 * from action records the chain settled, and nothing it cannot back.
 *
 *   §1  realized slippage comes from the receipt's own Transfer logs, against
 *       a FIRM quote only (Base 0x — an RH estimate is not slippage);
 *       unmeasurable → null, never 0
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
import { createAction, attachTx, listActions, readAction, receivedFromLogs, isFirmQuote } from "../src/lib/actions";
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
const BUNDLER = "0xbd1e000000000000000000000000000000000003";
const ENTRY = "0x0000000071727de22e5e9d8baf0edac6f37da032";
const USER_OP_TOPIC = keccak256(toHex("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)"));
const H = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const TRANSFER = keccak256(toHex("Transfer(address,address,uint256)"));
const transfer = (token: string, from: string, to: string, value: bigint) => ({
  address: token,
  topics: [TRANSFER, pad(from as `0x${string}`, { size: 32 }), pad(to as `0x${string}`, { size: 32 })],
  data: encodeAbiParameters([{ type: "uint256" }], [value]),
  logIndex: "0x0",
});

// `ts` is the block timestamp (seconds, default now) — the block NUMBER is set
// to it so eth_getBlockByNumber can answer from the number alone. `tx` is what
// eth_getTransactionByHash returns (to / input / value).
type Fx = { from: string; logs?: unknown[]; status?: string; ts?: number; tx?: { to: string; input?: string; value?: bigint } };
const RECEIPTS: Record<string, Fx> = {};
let mined = new Set<string>();
const nowS = () => Math.floor(Date.now() / 1000);
function receipt(n: number, r: Fx) {
  RECEIPTS[H(n)] = { ts: nowS(), ...r };
  mined.add(H(n));
  return H(n);
}
const hex = (n: number | bigint) => `0x${n.toString(16)}`;

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
    const bn = hex(fx.ts ?? nowS());
    return rpc({
      blockHash: H(7), blockNumber: bn, contractAddress: null, cumulativeGasUsed: "0x5208",
      effectiveGasPrice: "0x1", from: fx.from, gasUsed: "0x5208",
      logs: (fx.logs ?? []).map((l) => ({ ...(l as object), blockHash: H(7), blockNumber: bn, transactionHash: h, transactionIndex: "0x0", removed: false })),
      logsBloom: `0x${"0".repeat(512)}`, status: fx.status ?? "0x1", to: fx.tx?.to ?? POOL, transactionHash: h, transactionIndex: "0x0", type: "0x2",
    });
  }
  if (req.method === "eth_getBlockByNumber") {
    const n = String(req.params[0]);
    return rpc({
      number: n, hash: H(7), parentHash: H(6), timestamp: n, nonce: "0x0000000000000000", difficulty: "0x0", gasLimit: "0x1c9c380",
      gasUsed: "0x0", miner: POOL, extraData: "0x", logsBloom: `0x${"0".repeat(512)}`, transactionsRoot: H(1), stateRoot: H(2),
      receiptsRoot: H(3), sha3Uncles: H(4), size: "0x1", totalDifficulty: "0x0", baseFeePerGas: "0x1", transactions: [], uncles: [],
    });
  }
  if (req.method === "eth_getTransactionByHash") {
    const h = String(req.params[0]);
    const fx = RECEIPTS[h];
    if (!fx || !mined.has(h)) return rpc(null);
    return rpc({
      hash: h, from: fx.from, to: fx.tx?.to ?? POOL, input: fx.tx?.input ?? "0x", value: hex(fx.tx?.value ?? 0n),
      blockHash: H(7), blockNumber: hex(fx.ts ?? nowS()), transactionIndex: "0x0", nonce: "0x1", gas: "0x5208", gasPrice: "0x1",
      type: "0x0", v: "0x1b", r: H(8), s: H(9), chainId: "0x2105",
    });
  }
  if (req.method === "eth_call") {
    const data = String((req.params[0] as { data?: string }).data ?? "");
    if (data.startsWith("0x313ce567")) return rpc(encodeAbiParameters([{ type: "uint8" }], [6]));
    if (data.startsWith("0x95d89b41")) return rpc(encodeAbiParameters([{ type: "string" }], ["TOK"]));
  }
  return rpc(null, { code: 3, message: "execution reverted" });
}) as typeof fetch;

// A Base swap signed against a 0x quote — the one FIRM quote (isFirmQuote),
// unless the test overrides venue/chain to show what is NOT one.
const swap = (quote: Parameters<typeof createAction>[0]["quote"], chain: "base" | "robinhood" = "base") =>
  createAction({ wallet: ALICE, kind: "swap", chain, source: "wallet", params: { tokenIn: "ETH", tokenOut: TOKEN, amountIn: "0.1" }, quote: quote ? { venue: "0x", ...quote } : quote });

(async () => {
  console.log("\n1. realized slippage — from the receipt, against the quote's own unit");
  ok("Transfer logs to the wallet are summed; other recipients and tokens ignored",
    receivedFromLogs([transfer(TOKEN, POOL, ALICE, 600n), transfer(TOKEN, POOL, ALICE, 390n), transfer(TOKEN, POOL, BOB, 5n), transfer(POOL, POOL, ALICE, 7n)] as never, TOKEN, ALICE) === 990n);
  ok("native-ETH output leaves no log → null (unmeasured, never 0)",
    receivedFromLogs([] as never, "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", ALICE) === null);

  let a = await swap({ expected_out: "1000", unit: "base" });
  let r = await attachTx(a.id, receipt(1, { from: ALICE, logs: [transfer(TOKEN, POOL, ALICE, 990n)] }));
  ok("base-unit quote 1000, received 990 → 100 bps", r.ok && r.record.realized?.slippage_bps === 100 && r.record.realized?.out === "990", JSON.stringify(r.ok && r.record.realized));

  // What both Robinhood Chain cards record: a GeckoTerminal ESTIMATE in whole
  // units. Received-vs-estimate there is the price source's error (it read
  // −50 bps here, "better than quoted", on a swap with no slippage at all), so
  // it is recorded as what the user saw and never published as slippage.
  a = await swap({ expected_out: "10.0", unit: "whole", venue: "RobinhoodSwapRouter" });
  r = await attachTx(a.id, receipt(2, { from: ALICE, logs: [transfer(TOKEN, POOL, ALICE, 10_050_000n)] }));
  ok("an RH-style display-only estimate → the output is recorded, the slippage is null (not a firm quote)",
    r.ok && r.record.realized?.out === "10050000" && r.record.realized?.slippage_bps === null, JSON.stringify(r.ok && r.record.realized));
  ok("isFirmQuote: only Base + 0x + base units",
    isFirmQuote({ chain: "base", quote: { venue: "0x", unit: "base" } })
    && isFirmQuote({ chain: "base", quote: { venue: "0x AllowanceHolder", unit: "base" } })
    && !isFirmQuote({ chain: "robinhood", quote: { venue: "RobinhoodSwapRouter", unit: "base" } })
    && !isFirmQuote({ chain: "robinhood", quote: { venue: "RobinhoodSwapRouter", unit: "whole" } })
    && !isFirmQuote({ chain: "base", quote: { venue: "0x", unit: "whole" } })
    && !isFirmQuote({ chain: "base", quote: { venue: "0xdeadbeef", unit: "base" } }));

  a = await swap({ expected_out: "1000" });
  r = await attachTx(a.id, receipt(3, { from: ALICE, logs: [transfer(TOKEN, POOL, ALICE, 990n)] }));
  ok("a quote with no unit → the output is recorded, the slippage is null", r.ok && r.record.realized?.out === "990" && r.record.realized?.slippage_bps === null, JSON.stringify(r.ok && r.record.realized));

  a = await swap({ expected_out: "1000", unit: "base" });
  r = await attachTx(a.id, receipt(4, { from: ALICE, status: "0x0" }));
  ok("a reverted swap has no realized output", r.ok && r.record.status === "reverted" && !r.record.realized);

  // An agent's (MCP) send: its wallet is unproven, so the attached tx must be
  // the one the builder returned — 1 ETH to Bob.
  const send = await createAction({ wallet: ALICE, kind: "send", chain: "robinhood", source: "mcp", params: { token: "ETH", amount: "1", to: BOB },
    built: { to: BOB, data: "0x", value: "0xde0b6b3a7640000" } });
  r = await attachTx(send.id, receipt(5, { from: ALICE, tx: { to: BOB, value: 10n ** 18n } }));
  ok("an MCP record attaches the transaction its builder returned", r.ok && r.record.status === "confirmed", JSON.stringify(r));

  console.log("\n2. each settled action counts once");
  let st = await readActionStats();
  ok("confirmed 4 (3 swaps + 1 send), reverted 1", st.confirmed === 4 && st.reverted === 1, JSON.stringify({ c: st.confirmed, r: st.reverted }));
  ok("by kind / chain / agent", st.by_kind.swap === 3 && st.by_kind.send === 1 && st.by_chain.base === 3 && st.by_chain.robinhood === 1 && st.via_agent === 1, JSON.stringify(st));
  ok("distinct wallets is a count (1)", st.wallets === 1);
  ok(`one measured sample (< ${SLIP_MIN_N}) → the median is withheld, n is said`, st.slippage.n === 1 && st.slippage.median_bps === null, JSON.stringify(st.slippage));
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
  ok("settled on read, twice → counted once", st.confirmed === 5 && st.slippage.n === 2, JSON.stringify({ c: st.confirmed, n: st.slippage.n }));

  for (let i = 0; i < 3; i++) {
    const x = await swap({ expected_out: "1000", unit: "base" });
    await attachTx(x.id, receipt(10 + i, { from: ALICE, logs: [transfer(TOKEN, POOL, ALICE, 980n)] }));
  }
  st = await readActionStats();
  ok(`at ${SLIP_MIN_N}+ samples the median is published`, st.slippage.n === 5 && st.slippage.median_bps === median([100, 0, 200, 200, 200]), JSON.stringify(st.slippage));

  console.log("\n2b. the tx must be THIS action's (review 2026-10-01)");
  const before = await readActionStats();
  let fresh = await swap({ expected_out: "1000", unit: "base" });
  r = await attachTx(fresh.id, receipt(20, { from: ALICE, ts: nowS() - 3600, logs: [transfer(TOKEN, POOL, ALICE, 1n)] }));
  ok("a tx mined an hour before the action is refused (NOT_THIS_ACTION), whoever sent it", !r.ok && r.code === "NOT_THIS_ACTION", JSON.stringify(r));
  const mcpSwap = await createAction({ wallet: ALICE, kind: "swap", chain: "base", source: "mcp", params: { tokenIn: "ETH", tokenOut: TOKEN, amountIn: "0.1" },
    quote: { expected_out: "1000", unit: "base" }, built: { to: POOL, data: `0x12345678${"ab".repeat(64)}`, value: "0" } });
  r = await attachTx(mcpSwap.id, receipt(21, { from: ALICE, tx: { to: POOL, input: `0x87654321${"cd".repeat(64)}` }, logs: [transfer(TOKEN, POOL, ALICE, 1n)] }));
  ok("an MCP record refuses a tx of its wallet that is not the one it built", !r.ok && r.code === "NOT_THIS_ACTION", JSON.stringify(r));
  const unmined = H(22);
  RECEIPTS[unmined] = { from: ALICE, ts: nowS(), tx: { to: POOL, input: `0x12345678${"ab".repeat(64)}` } };
  r = await attachTx(mcpSwap.id, unmined);
  const still = await readAction(mcpSwap.id);
  ok("an MCP record does not store an unmined hash (NOT_MINED, record untouched)",
    !r.ok && r.code === "NOT_MINED" && still.status === "found" && still.record.status === "prepared" && !still.record.tx_hash, JSON.stringify(r));
  let listed = await listActions(ALICE, 200);
  ok("…and an unproven MCP record is not in the wallet's history (nor its index)", listed.status === "ok" && !listed.actions.some((x) => x.id === mcpSwap.id));
  mined.add(unmined);
  RECEIPTS[unmined].logs = [transfer(TOKEN, POOL, ALICE, 1000n)];
  r = await attachTx(mcpSwap.id, unmined);
  listed = await listActions(ALICE, 200);
  ok("once the built tx is mined and attached, it is proven and listed", r.ok && r.record.status === "confirmed" && listed.status === "ok" && listed.actions.some((x) => x.id === mcpSwap.id), JSON.stringify(r));
  fresh = await swap({ expected_out: "1000", unit: "base" });
  const failedOp = {
    address: ENTRY,
    topics: [USER_OP_TOPIC, H(99), pad(ALICE as `0x${string}`, { size: 32 }), pad("0x0000000000000000000000000000000000000000", { size: 32 })],
    data: encodeAbiParameters([{ type: "uint256" }, { type: "bool" }, { type: "uint256" }, { type: "uint256" }], [1n, false, 10n, 20n]),
    logIndex: "0x0",
  };
  r = await attachTx(fresh.id, receipt(23, { from: BUNDLER, logs: [failedOp], tx: { to: ENTRY } }));
  ok("a smart wallet's op that reverted inside a successful bundle → REVERTED, not confirmed", r.ok && r.record.status === "reverted", JSON.stringify(r.ok && r.record.status));
  const after = await readActionStats();
  ok("…and the meter counts it as reverted; the refused attaches counted nothing",
    after.reverted === before.reverted + 1 && after.confirmed === before.confirmed + 1, JSON.stringify({ before: [before.confirmed, before.reverted], after: [after.confirmed, after.reverted] }));

  console.log("\n3. refusals count only on measured evidence");
  const block = (code: string, level: "BLOCK" | "WARN" = "BLOCK"): PreTradeCheck =>
    ({ verdict: level === "BLOCK" ? "BLOCK" : "WARN", asset_type: "crypto", label: "x", reasons: [{ level, code: code as never, text: "t" }], checked_at: "" });
  await recordPreTradeBlock(block("IMPOSTOR"), { chain: "base", token: "0xAAAA000000000000000000000000000000000001" });
  await recordPreTradeBlock(block("IMPOSTOR"), { chain: "base", token: "0xaaaa000000000000000000000000000000000001" });
  await recordPreTradeBlock(block("HONEYPOT"), { chain: "base", token: "0xbbbb000000000000000000000000000000000002" });
  await recordPreTradeBlock(block("NOT_ADDRESS"), { chain: "base", token: "NVDA" });
  await recordPreTradeBlock(block("IMPOSTOR", "WARN"), { chain: "base", token: "0xcccc000000000000000000000000000000000003" });
  st = await readActionStats();
  ok("distinct tokens refused on evidence: the same token twice (any case) counts once; a ticker typo and a WARN do not count",
    st.blocked.tokens === 2, `tokens=${st.blocked.tokens}`);
  await recordPreTradeBlock(block("BRIDGE_COST"), { chain: "base", token: "ETH" });
  st = await readActionStats();
  ok("bridge refusals are not published (no door keeps that count honest)", !("bridges" in st.blocked), JSON.stringify(st.blocked));

  console.log("\n4. /api/stats/public");
  const { GET } = await import("../src/app/api/stats/public/route");
  const body = (await (await GET()).json()) as Record<string, unknown> & {
    actions?: { ok?: boolean; confirmed?: number };
    usage?: { revenueEstBasis?: string };
    settlement?: { scope?: string; verify_url?: string };
  };
  ok("actions block published, readable", body.actions?.ok === true && body.actions.confirmed === 9, JSON.stringify(body.actions));
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
