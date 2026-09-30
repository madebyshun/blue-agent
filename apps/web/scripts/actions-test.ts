/**
 * actions-test — G1 action records (2026-09-30): private to their wallet, and
 * a transaction joins one only when the chain proves that wallet sent it.
 *
 * Hermetic: KV env cleared (in-memory), both chains' RPCs answered by a stub
 * that serves fixture receipts.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}
process.env.BASE_RPC_URL = "https://rpc.invalid/base";

import { NextRequest } from "next/server";
import { encodeAbiParameters, keccak256, pad, toHex } from "viem";
import { createAction, attachTx, listActions, readAction } from "../src/lib/actions";
import { createSession, SESSION_COOKIE } from "../src/lib/session";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const ALICE = "0xa11ce00000000000000000000000000000000001";
const BOB = "0xb0b0000000000000000000000000000000000002";
const BUNDLER = "0xbd1e000000000000000000000000000000000003";
const ENTRY = "0x0000000071727de22e5e9d8baf0edac6f37da032";
const FAKE_ENTRY = "0xfa4e000000000000000000000000000000000004";
const H = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const USER_OP_TOPIC = keccak256(toHex("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)"));

const userOpLog = (emitter: string, sender: string) => ({
  address: emitter,
  topics: [USER_OP_TOPIC, H(99), pad(sender as `0x${string}`, { size: 32 }), pad("0x0000000000000000000000000000000000000000", { size: 32 })],
  data: encodeAbiParameters([{ type: "uint256" }, { type: "bool" }, { type: "uint256" }, { type: "uint256" }], [1n, true, 10n, 20n]),
  logIndex: "0x0",
});

// tx hash → receipt fixture (absent ⇒ "not mined")
const BUILT_TO = "0xc0de000000000000000000000000000000000005";
const BUILT_DATA = `0xa9059cbb${"0".repeat(24)}${BOB.slice(2)}${"0".repeat(63)}1`;
const RECEIPTS: Record<string, { from: string; logs?: unknown[]; status?: string; to?: string; input?: string }> = {
  [H(1)]: { from: ALICE },                                          // EOA: Alice sent it
  [H(2)]: { from: BUNDLER, logs: [userOpLog(ENTRY, ALICE)] },        // smart wallet via EntryPoint
  [H(3)]: { from: BUNDLER, logs: [userOpLog(FAKE_ENTRY, ALICE)] },   // look-alike event, wrong emitter
  [H(4)]: { from: BOB },                                            // someone else's tx
  [H(5)]: { from: ALICE, to: BUILT_TO, input: BUILT_DATA },        // Alice sends the tx the MCP builder returned
  [H(6)]: { from: ALICE },                                          // Alice again (attach route)
};
let mined = new Set(Object.keys(RECEIPTS));

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  // Any JSON-RPC request is answered here — static imports are hoisted above
  // the env assignment, so the Base client may be pointed at its default URL.
  let req: { id: number; method: string; params: unknown[] } | null = null;
  try { req = JSON.parse(String(init?.body ?? "")); } catch { req = null; }
  void input;
  if (req && typeof req.method === "string") {
    let result: unknown = null;
    // Blocks are numbered by their timestamp (now), so every fixture tx is
    // mined after the record that attaches it — attachTx refuses older txs.
    const bn = `0x${Math.floor(Date.now() / 1000).toString(16)}`;
    if (req.method === "eth_getTransactionReceipt") {
      const h = String(req.params[0]);
      const fx = RECEIPTS[h];
      if (fx && mined.has(h)) {
        result = {
          blockHash: H(7), blockNumber: bn, contractAddress: null, cumulativeGasUsed: "0x5208",
          effectiveGasPrice: "0x1", from: fx.from, gasUsed: "0x5208",
          logs: (fx.logs ?? []).map((l) => ({ ...(l as object), blockHash: H(7), blockNumber: bn, transactionHash: h, transactionIndex: "0x0", removed: false })),
          logsBloom: `0x${"0".repeat(512)}`, status: fx.status ?? "0x1", to: ENTRY, transactionHash: h, transactionIndex: "0x0", type: "0x2",
        };
      }
    }
    if (req.method === "eth_getBlockByNumber") {
      const n = String(req.params[0]);
      result = {
        number: n, hash: H(7), parentHash: H(6), timestamp: n, nonce: "0x0000000000000000", difficulty: "0x0", gasLimit: "0x1c9c380",
        gasUsed: "0x0", miner: ENTRY, extraData: "0x", logsBloom: `0x${"0".repeat(512)}`, transactionsRoot: H(1), stateRoot: H(2),
        receiptsRoot: H(3), sha3Uncles: H(4), size: "0x1", totalDifficulty: "0x0", baseFeePerGas: "0x1", transactions: [], uncles: [],
      };
    }
    if (req.method === "eth_getTransactionByHash") {
      const h = String(req.params[0]);
      const fx = RECEIPTS[h];
      if (fx && mined.has(h)) {
        result = {
          hash: h, from: fx.from, to: fx.to ?? ENTRY, input: fx.input ?? "0x", value: "0x0", blockHash: H(7), blockNumber: bn,
          transactionIndex: "0x0", nonce: "0x1", gas: "0x5208", gasPrice: "0x1", type: "0x0", v: "0x1b", r: H(8), s: H(9), chainId: "0x2105",
        };
      }
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;

const base = { kind: "swap" as const, chain: "base" as const, params: { tokenIn: "ETH", tokenOut: "USDC", amountIn: "0.1" } };

(async () => {
  console.log("\n1. proof decides what attaches");
  let a = await createAction({ ...base, wallet: ALICE, source: "wallet" });
  let r = await attachTx(a.id, H(1));
  ok("an EOA tx from the action's wallet → confirmed", r.ok && r.record.status === "confirmed", JSON.stringify(r));
  a = await createAction({ ...base, wallet: ALICE, source: "wallet" });
  r = await attachTx(a.id, H(2));
  ok("a smart-wallet tx (EntryPoint UserOperationEvent, sender = wallet) → confirmed", r.ok && r.record.status === "confirmed", JSON.stringify(r));
  a = await createAction({ ...base, wallet: ALICE, source: "wallet" });
  r = await attachTx(a.id, H(3));
  ok("the same event from a non-EntryPoint contract proves nothing", !r.ok && r.code === "NOT_SENT_BY_WALLET", JSON.stringify(r));
  r = await attachTx(a.id, H(4));
  ok("someone else's tx is refused", !r.ok && r.code === "NOT_SENT_BY_WALLET");
  r = await attachTx(a.id, "0x1234");
  ok("a malformed hash is refused", !r.ok && r.code === "BAD_HASH");

  console.log("\n2. a just-broadcast tx is held, then settled");
  mined = new Set([H(1), H(2), H(3), H(5), H(6)]); // H(4) not mined yet
  const pending = await createAction({ ...base, wallet: ALICE, source: "wallet" });
  r = await attachTx(pending.id, H(4));
  ok("unmined → submitted, unproven", r.ok && r.record.status === "submitted" && r.record.receipt === null, JSON.stringify(r));
  mined = new Set(Object.keys(RECEIPTS)); // now mined — and it was Bob's
  const listed = await listActions(ALICE);
  const settled = listed.status === "ok" ? listed.actions.find((x) => x.id === pending.id) : undefined;
  ok("on the owner's read, a hash another wallet sent is dropped", settled?.status === "prepared" && !settled?.tx_hash, JSON.stringify(settled));

  console.log("\n3. MCP records need proof before they show");
  const mcp = await createAction({ ...base, wallet: ALICE, source: "mcp", built: { to: BUILT_TO, data: BUILT_DATA, value: "0" } });
  let l = await listActions(ALICE);
  ok("an unproven MCP record is not in Alice's history", l.status === "ok" && !l.actions.some((x) => x.id === mcp.id));
  r = await attachTx(mcp.id, H(1));
  ok("…a tx Alice sent that is NOT the one built is refused", !r.ok && r.code === "NOT_THIS_ACTION", JSON.stringify(r));
  await attachTx(mcp.id, H(5));
  l = await listActions(ALICE);
  ok("…until the tx the builder returned is attached", l.status === "ok" && l.actions.some((x) => x.id === mcp.id && x.status === "confirmed"));

  console.log("\n4. the routes");
  const { GET, POST } = await import("../src/app/api/actions/route");
  let res = await GET(new NextRequest(`http://localhost/api/actions?address=${ALICE}`));
  ok("GET without a session → 401", res.status === 401);
  const sess = await createSession(ALICE);
  const cookie = `${SESSION_COOKIE}=${sess}`;
  res = await GET(new NextRequest(`http://localhost/api/actions`, { headers: { cookie } }));
  const body = (await res.json()) as { actions?: unknown[] };
  ok("GET with Alice's session → her actions", res.status === 200 && Array.isArray(body.actions) && body.actions.length > 0);
  res = await POST(new NextRequest("http://localhost/api/actions", {
    method: "POST", headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ address: ALICE, kind: "send", chain: "robinhood", source: "mcp", params: { amount: "1", to: BOB, nested: { x: 1 } } }),
  }));
  const created = (await res.json()) as { action?: { source?: string; params?: Record<string, unknown> } };
  ok("a browser cannot label its record as an agent's (mcp → wallet)", created.action?.source === "wallet", JSON.stringify(created.action));
  ok("params are flattened — nested objects dropped", created.action?.params?.nested === undefined && created.action?.params?.amount === "1");
  res = await POST(new NextRequest("http://localhost/api/actions", {
    method: "POST", headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ address: BOB, kind: "send", chain: "base", params: {} }),
  }));
  ok("Alice's session cannot create records for Bob", res.status === 401);

  const { POST: ATTACH } = await import("../src/app/api/actions/[id]/tx/route");
  const fresh = await createAction({ ...base, wallet: ALICE, source: "wallet" });
  res = await ATTACH(new NextRequest(`http://localhost/api/actions/${fresh.id}/tx`, { method: "POST", body: JSON.stringify({ tx_hash: H(4) }) }), { params: Promise.resolve({ id: fresh.id }) });
  ok("attach route: someone else's tx → 403", res.status === 403);
  res = await ATTACH(new NextRequest(`http://localhost/api/actions/${fresh.id}/tx`, { method: "POST", body: JSON.stringify({ tx_hash: H(6) }) }), { params: Promise.resolve({ id: fresh.id }) });
  ok("attach route: the wallet's own tx → 200, no session needed", res.status === 200);
  const again = await readAction(fresh.id);
  ok("…and the record is confirmed", again.status === "found" && again.record.status === "confirmed");

  console.log("\n5. one transaction backs one action (G4 — no double count)");
  const dup = await createAction({ ...base, wallet: ALICE, source: "wallet" });
  r = await attachTx(dup.id, H(1));
  ok("a tx already backing another of Alice's actions is refused", !r.ok && r.code === "ALREADY_ATTACHED", JSON.stringify(r));
  r = await attachTx(fresh.id, H(6));
  ok("re-attaching the same tx to its own action is idempotent", r.ok && r.record.status === "confirmed", JSON.stringify(r));

  console.log(failures === 0 ? "\nactions-test: PASS" : `\nactions-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
