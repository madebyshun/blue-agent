/**
 * trigger-bazaar.mjs — Make a real x402 v2 payment to trigger Bazaar indexing.
 *
 * Usage:
 *   TEST_PRIVATE_KEY=0x... node scripts/trigger-bazaar.mjs [tool]
 *
 * Examples:
 *   TEST_PRIVATE_KEY=0x... node scripts/trigger-bazaar.mjs token-pick-signal
 *   TEST_PRIVATE_KEY=0x... node scripts/trigger-bazaar.mjs blue-idea
 *
 * After one successful verify+settle, Blue Hub appears at:
 *   https://agentic.market/services/blueagent-dev
 *
 * Requires:
 *   - Private key with USDC on Base mainnet
 *   - node >= 18
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  formatUnits,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// ── Config ───────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const toolId = args.find(a => !a.startsWith("--")) ?? "blue-idea"; // cheapest: $0.05
const BASE_URL = "https://blueagent.dev";
const ENDPOINT = `${BASE_URL}/api/x402/${toolId}`;

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function nonces(address) view returns (uint256)",
]);

if (!process.env.TEST_PRIVATE_KEY) {
  console.error("❌ Missing TEST_PRIVATE_KEY env var.");
  console.error("   Usage: TEST_PRIVATE_KEY=0x... node scripts/trigger-bazaar.mjs [tool]");
  process.exit(1);
}

const account = privateKeyToAccount(process.env.TEST_PRIVATE_KEY);

console.log("\n═══ Bazaar Trigger — x402 v2 ════════════════════════");
console.log(`Tool:    ${toolId}`);
console.log(`URL:     ${ENDPOINT}`);
console.log(`Wallet:  ${account.address}`);
console.log("══════════════════════════════════════════════════════\n");

// ── Step 0: Check USDC balance ───────────────────────────────────────────────

const publicClient = createPublicClient({ chain: base, transport: http() });
const balance = await publicClient.readContract({
  address: USDC,
  abi: USDC_ABI,
  functionName: "balanceOf",
  args: [account.address],
});
console.log(`[0] USDC balance: ${formatUnits(balance, 6)} USDC`);
if (balance === 0n) {
  console.error("❌ No USDC. Fund this wallet with USDC on Base mainnet first.");
  process.exit(1);
}

// ── Step 1: GET 402 requirements ────────────────────────────────────────────

console.log(`[1] Fetching 402 requirements (GET ${ENDPOINT}) ...`);
const r1 = await fetch(ENDPOINT, { method: "GET" });
const d1 = await r1.json();

if (r1.status !== 402) {
  console.error(`❌ Expected HTTP 402, got ${r1.status}:`, JSON.stringify(d1).slice(0, 200));
  process.exit(1);
}

const req = d1.accepts?.[0];
if (!req) {
  console.error("❌ No accepts[] in 402 body:", JSON.stringify(d1).slice(0, 300));
  process.exit(1);
}

console.log(`✓ Got requirements:`);
console.log(`  amount:  ${req.amount} atoms (${Number(req.amount) / 1e6} USDC)`);
console.log(`  payTo:   ${req.payTo}`);
console.log(`  network: ${req.network}`);
console.log(`  scheme:  ${req.scheme}`);

if (balance < BigInt(req.amount)) {
  console.error(`❌ Insufficient USDC: have ${formatUnits(balance, 6)}, need ${Number(req.amount)/1e6}`);
  process.exit(1);
}

// ── Step 2: Sign EIP-3009 TransferWithAuthorization ─────────────────────────

const nowSec      = Math.floor(Date.now() / 1000);
const validAfter  = BigInt(0); // valid immediately
const validBefore = BigInt(nowSec + (req.maxTimeoutSeconds ?? 120));
const nonce       = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;

console.log(`\n[2] Signing EIP-3009 TransferWithAuthorization ...`);
console.log(`  from:        ${account.address}`);
console.log(`  to:          ${req.payTo}`);
console.log(`  value:       ${req.amount} (${Number(req.amount)/1e6} USDC)`);
console.log(`  validBefore: ${new Date(Number(validBefore) * 1000).toISOString()}`);

const walletClient = createWalletClient({ account, chain: base, transport: http() });

const signature = await walletClient.signTypedData({
  domain: {
    name:              req.extra?.name    ?? "USD Coin",
    version:           req.extra?.version ?? "2",
    chainId:           8453,
    verifyingContract: req.asset ?? USDC,
  },
  types: {
    TransferWithAuthorization: [
      { name: "from",        type: "address" },
      { name: "to",          type: "address" },
      { name: "value",       type: "uint256" },
      { name: "validAfter",  type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce",       type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: {
    from:        account.address,
    to:          req.payTo,
    value:       BigInt(req.amount),
    validAfter,
    validBefore,
    nonce,
  },
});
console.log(`✓ Signature: ${signature.slice(0, 30)}...`);

// ── Step 3: Build X-Payment header (x402 v2 format) ─────────────────────────

const paymentPayload = {
  x402Version: 2,
  scheme:      req.scheme,
  network:     req.network,
  payload: {
    signature,
    authorization: {
      from:        account.address,
      to:          req.payTo,
      value:       req.amount,
      validAfter:  validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
    },
  },
};

const xPaymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
console.log(`\n[3] X-Payment built (${xPaymentHeader.length} chars)`);

// ── Step 4: POST with payment → triggers CDP verify + run + settle ────────────

console.log(`\n[4] Calling ${ENDPOINT} with X-Payment ...`);
const t0 = Date.now();

// Tool-specific body (use minimal valid input)
const TOOL_BODIES = {
  "blue-idea":    { description: "AI-powered DeFi yield optimizer on Base" },
  "blue-build":   { idea: "AI-powered DeFi yield optimizer on Base" },
  "blue-ship":    { project: "Blue Hub x402 API" },
  "blue-raise":   { project: "Blue Hub", traction: "35 tools, x402 payments" },
  "blue-audit":   { code: "// test contract\npragma solidity ^0.8.0;\ncontract Test {}" },
  "contract-trust": { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  "token-pick-signal": { context: "Base DeFi opportunities" },
  "ecosystem-digest":  {},
  "market-fit":        { name: "Blue Hub", description: "x402 AI tools for Base builders" },
  "narrative-position": { context: "Base DeFi Q2 2026" },
};

const body = TOOL_BODIES[toolId] ?? {};
console.log(`  body: ${JSON.stringify(body)}`);

const r2 = await fetch(ENDPOINT, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Payment": xPaymentHeader,
  },
  body: JSON.stringify(body),
});

const elapsed = Date.now() - t0;
console.log(`✓ Response: HTTP ${r2.status} in ${elapsed}ms`);

const d2 = await r2.json().catch(() => ({}));

if (!r2.ok) {
  console.error(`\n❌ Tool returned error ${r2.status}:`);
  console.error(JSON.stringify(d2, null, 2).slice(0, 500));
  process.exit(1);
}

// ── Step 5: Result ───────────────────────────────────────────────────────────

const settle = d2._settle;
console.log("\n══ Settlement ════════════════════════════════════════");
if (settle?.ok) {
  console.log(`✅ USDC settled on-chain!`);
  if (settle.tx) {
    console.log(`   Tx: https://basescan.org/tx/${settle.tx}`);
  }
} else {
  console.log(`⚠️  settle.ok = ${settle?.ok} | status: ${settle?.status}`);
}

console.log("\n══ Tool Output (preview) ════════════════════════════");
const preview = { ...d2 };
delete preview._settle;
console.log(JSON.stringify(preview, null, 2).slice(0, 1000));

console.log("\n══ Next Steps ════════════════════════════════════════");
console.log("✅ Payment verified + settled. Bazaar indexing triggered.");
console.log("   Check in ~2 min: https://agentic.market/services/blueagent-dev");
console.log("══════════════════════════════════════════════════════\n");
