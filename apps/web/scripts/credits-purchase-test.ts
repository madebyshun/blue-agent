/**
 * credits-purchase-test — /api/credits/purchase credits ONLY real top-ups.
 *
 * The bug this pins (plan §2 fix 2, 2026-09-30): TOPUP_TREASURY is the same
 * address as the x402 payee, and an x402 settlement (EIP-3009
 * transferWithAuthorization) emits the very Transfer the route sums —
 * from = payer, to = treasury, token = USDC. So paying for a Hub tool and then
 * posting that settlement hash here minted credits for USDC that had already
 * bought something. The discriminator is USDC's own AuthorizationUsed event,
 * which EIP-3009 always emits and a plain transfer never does.
 *
 * Hermetic: KV env cleared (in-memory ledger), BASE_RPC_URL pointed at a dummy
 * host, and `fetch` answers eth_getTransactionReceipt from fixtures below.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}
process.env.BASE_RPC_URL = "https://rpc.invalid/base";

import { NextRequest } from "next/server";
import { encodeAbiParameters, keccak256, pad, toHex, type Hex } from "viem";
import { USDC_BASE, TOPUP_TREASURY, creditsForUsdc } from "../src/lib/payments";
import { getBalance } from "../src/lib/credit-ledger";

let passes = 0;
let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (pass) passes++; else failures++;
}

const CALLER = "0x1111111111111111111111111111111111111111" as const;
const STRANGER = "0x3333333333333333333333333333333333333333" as const;
const OTHER_TOKEN = "0x4444444444444444444444444444444444444444" as const;

const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));
const AUTH_USED_TOPIC = keccak256(toHex("AuthorizationUsed(address,bytes32)"));
const topicAddr = (a: string) => pad(a as Hex, { size: 32 });

function transferLog(token: string, from: string, to: string, units: bigint, i: number) {
  return {
    address: token,
    topics: [TRANSFER_TOPIC, topicAddr(from), topicAddr(to)],
    data: encodeAbiParameters([{ type: "uint256" }], [units]),
    logIndex: toHex(i),
  };
}
function authUsedLog(authorizer: string, i: number) {
  return {
    address: USDC_BASE,
    topics: [AUTH_USED_TOPIC, topicAddr(authorizer), keccak256(toHex(`nonce-${i}`))],
    data: "0x",
    logIndex: toHex(i),
  };
}

const HASHES = {
  topup: keccak256(toHex("plain top-up")),
  x402: keccak256(toHex("x402 settlement")),
  stranger: keccak256(toHex("someone else's transfer")),
  wrongToken: keccak256(toHex("wrong token")),
  strangerAuth: keccak256(toHex("someone else's authorization in the same tx")),
};

type Log = ReturnType<typeof transferLog> | ReturnType<typeof authUsedLog>;
const FIXTURES: Record<string, Log[]> = {
  [HASHES.topup]: [transferLog(USDC_BASE, CALLER, TOPUP_TREASURY, 5_000_000n, 0)],
  [HASHES.x402]: [
    authUsedLog(CALLER, 0),
    transferLog(USDC_BASE, CALLER, TOPUP_TREASURY, 50_000n, 1),
  ],
  [HASHES.stranger]: [transferLog(USDC_BASE, STRANGER, TOPUP_TREASURY, 5_000_000n, 0)],
  [HASHES.wrongToken]: [transferLog(OTHER_TOKEN, CALLER, TOPUP_TREASURY, 5_000_000n, 0)],
  // A plain top-up by the caller batched with SOMEONE ELSE's authorization:
  // only the caller's own authorization disqualifies the caller's transfer.
  [HASHES.strangerAuth]: [
    authUsedLog(STRANGER, 0),
    transferLog(USDC_BASE, CALLER, TOPUP_TREASURY, 1_000_000n, 1),
  ],
};

function receiptFor(hash: string) {
  const blockHash = keccak256(toHex("block"));
  const logs = (FIXTURES[hash] ?? []).map((l) => ({
    ...l,
    blockHash,
    blockNumber: "0x10",
    transactionHash: hash,
    transactionIndex: "0x0",
    removed: false,
  }));
  return {
    blockHash,
    blockNumber: "0x10",
    contractAddress: null,
    cumulativeGasUsed: "0x5208",
    effectiveGasPrice: "0x1",
    from: CALLER,
    gasUsed: "0x5208",
    logs,
    logsBloom: `0x${"0".repeat(512)}`,
    status: "0x1",
    to: USDC_BASE,
    transactionHash: hash,
    transactionIndex: "0x0",
    type: "0x2",
  };
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).startsWith("https://rpc.invalid/")) {
    const req = JSON.parse(String(init?.body ?? "{}")) as { id: number; method: string; params: unknown[] };
    const result = req.method === "eth_getTransactionReceipt" ? receiptFor(String(req.params[0])) : null;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  return realFetch(input, init);
}) as typeof fetch;

async function purchase(address: string, txHash: string) {
  const { POST } = await import("../src/app/api/credits/purchase/route");
  const res = await POST(new NextRequest("http://localhost/api/credits/purchase", {
    method: "POST",
    body: JSON.stringify({ address, txHash }),
  }));
  return { status: res.status, json: (await res.json()) as { ok?: boolean; credits?: number; alreadyCredited?: boolean; error?: string } };
}

(async () => {
  const start = (await getBalance(CALLER)).balance;

  console.log("\n1. A plain USDC transfer to the treasury is a top-up");
  let r = await purchase(CALLER, HASHES.topup);
  check("1.1 credited", r.json.ok === true && r.json.credits === creditsForUsdc(5), JSON.stringify(r.json));
  const afterTopup = (await getBalance(CALLER)).balance;
  check("1.2 the ledger moved by exactly that much", afterTopup - start === creditsForUsdc(5), `${start} → ${afterTopup}`);
  r = await purchase(CALLER, HASHES.topup);
  check("1.3 the same hash again is idempotent, not a second credit",
    r.json.alreadyCredited === true && (await getBalance(CALLER)).balance === afterTopup, JSON.stringify(r.json));

  console.log("\n2. An x402 settlement is NOT a top-up");
  r = await purchase(CALLER, HASHES.x402);
  check("2.1 refused (it already paid for a tool call)", r.status === 400 && r.json.ok === false, JSON.stringify(r.json));
  check("2.2 no credit minted", (await getBalance(CALLER)).balance === afterTopup);
  r = await purchase(CALLER, HASHES.x402);
  check("2.3 still refused on retry", r.status === 400);

  console.log("\n3. The existing bindings still hold");
  r = await purchase(CALLER, HASHES.stranger);
  check("3.1 someone else's transfer credits nobody (from ≠ caller)", r.status === 400, JSON.stringify(r.json));
  r = await purchase(CALLER, HASHES.wrongToken);
  check("3.2 a non-USDC token is not credited", r.status === 400, JSON.stringify(r.json));
  r = await purchase(CALLER, HASHES.strangerAuth);
  check("3.3 another wallet's authorization does not disqualify the caller's own transfer",
    r.json.ok === true && r.json.credits === creditsForUsdc(1), JSON.stringify(r.json));

  console.log(`\ncredits-purchase-test: ${passes}/${passes + failures} passed`);
  if (failures > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
