/**
 * mcp-paid-e2e — one REAL paid call to a Blue Agent MCP v2 tool, end to end.
 * NOT part of `npm test` (it spends real USDC): run it by hand.
 *
 *   read -s "K?buyer key: " && BUYER_PRIVATE_KEY=$K npx tsx scripts/mcp-paid-e2e.ts [url|local] [tool]; unset K
 *
 * url  defaults to https://blueagent.dev/api/mcp; tool defaults to stock_signal ($0.01).
 * `local` runs THIS checkout's route in-process instead (the Vercel preview is
 * behind deployment protection) — start it with the app's env so CDP can settle:
 *   npx tsx --env-file=<path to apps/web/.env.local> scripts/mcp-paid-e2e.ts local
 * The key is read from the environment and never printed or sent anywhere: it
 * signs one EIP-3009 transferWithAuthorization locally, for exactly the amount
 * and payTo the server quoted. Use a wallet holding only what you mean to spend.
 *
 * Walks the x402 MCP transport by hand, so a failure says which step broke:
 *   1. call unpaid → expect isError + structuredContent (PaymentRequired)
 *   2. sign the quoted requirement → PaymentPayload in _meta["x402/payment"]
 *   3. call again → expect a result + _meta["x402/payment-response"].success
 */
import { privateKeyToAccount } from "viem/accounts";
import { toHex } from "viem";
import { randomBytes } from "node:crypto";

const URL_ = process.argv[2] ?? "https://blueagent.dev/api/mcp";
const TOOL = process.argv[3] ?? "stock_signal";
const ARGS: Record<string, Record<string, unknown>> = {
  stock_signal: { ticker: "NVDA" },
  trending_safe: { limit: 3 },
  token_verdict: { token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", chain: "base" },
};

async function call(meta?: Record<string, unknown>) {
  const init = {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: TOOL, arguments: ARGS[TOOL] ?? {}, ...(meta ? { _meta: meta } : {}) } }),
  };
  let res: Response;
  if (URL_ === "local") {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("../src/app/api/mcp/route");
    res = await POST(new NextRequest("https://blueagent.dev/api/mcp", init));
  } else {
    res = await fetch(URL_, init);
  }
  const j = (await res.json()) as { result?: Record<string, unknown>; error?: unknown };
  if (!j.result) throw new Error(`no result (HTTP ${res.status}): ${JSON.stringify(j).slice(0, 300)}`);
  return j.result as { isError?: boolean; structuredContent?: Record<string, unknown>; content?: { text: string }[]; _meta?: Record<string, unknown> };
}

(async () => {
  const key = process.env.BUYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("set BUYER_PRIVATE_KEY (0x + 64 hex) in the environment");
  const account = privateKeyToAccount(key as `0x${string}`);
  console.log(`buyer ${account.address} · ${TOOL} · ${URL_}`);

  console.log("1. unpaid call");
  const first = await call();
  const pr = first.structuredContent as { accepts?: Record<string, unknown>[]; resource?: unknown } | undefined;
  if (!first.isError || !pr?.accepts?.length) throw new Error(`expected PaymentRequired, got ${JSON.stringify(first).slice(0, 300)}`);
  const req = pr.accepts[0] as { amount: string; payTo: `0x${string}`; asset: `0x${string}`; network: string; maxTimeoutSeconds: number; extra: { name: string; version: string } };
  console.log(`   quoted ${Number(req.amount) / 1e6} USDC → ${req.payTo} on ${req.network}`);

  console.log("2. sign EIP-3009 locally");
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: account.address,
    to: req.payTo,
    value: req.amount,
    validAfter: String(now - 60),
    validBefore: String(now + req.maxTimeoutSeconds),
    nonce: toHex(randomBytes(32)),
  };
  const signature = await account.signTypedData({
    domain: { name: req.extra.name, version: req.extra.version, chainId: 8453, verifyingContract: req.asset },
    types: { TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ] },
    primaryType: "TransferWithAuthorization",
    message: { ...authorization, value: BigInt(authorization.value), validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore), nonce: authorization.nonce as `0x${string}` },
  });

  console.log("3. paid call");
  const paid = await call({ "x402/payment": { x402Version: 2, accepted: req, resource: pr.resource, payload: { signature, authorization } } });
  const receipt = paid._meta?.["x402/payment-response"] as { success?: boolean; transaction?: string } | undefined;
  console.log(`   isError=${!!paid.isError} settled=${receipt?.success} tx=${receipt?.transaction ?? "-"}`);
  console.log(`   ${(paid.content?.[0]?.text ?? "").slice(0, 400)}`);
  if (paid.isError || !receipt?.success) process.exit(1);
  console.log(`\nOK — https://basescan.org/tx/${receipt.transaction}`);
})().catch((e) => { console.error(`FAILED: ${(e as Error).message}`); process.exit(1); });
