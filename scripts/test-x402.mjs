/**
 * test-x402.mjs — Test x402 payment flow from terminal
 *
 * Usage:
 *   node scripts/test-x402.mjs [tool] [--local] [--dry]
 *
 * Examples:
 *   node scripts/test-x402.mjs ecosystem-digest --local   # hit local dev server
 *   node scripts/test-x402.mjs token-pick-signal          # hit production
 *   node scripts/test-x402.mjs ecosystem-digest --dry     # sign only, don't call API
 *
 * Requires a private key with USDC on Base.
 * Set TEST_PRIVATE_KEY env var (or it uses a generated burner).
 */

import {
  createWalletClient, createPublicClient, http, hexToSignature,
  parseAbi, formatUnits,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

// ── Config ──────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const toolId = args.find(a => !a.startsWith("--")) ?? "ecosystem-digest";
const isLocal = args.includes("--local");
const isDry   = args.includes("--dry");

const BASE_URL = isLocal
  ? "http://localhost:3000"
  : "https://blueagent.dev";

const USDC  = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

// Use provided key or generate a burner (burner has no USDC — for dry runs only)
const PRIVATE_KEY = process.env.TEST_PRIVATE_KEY ?? generatePrivateKey();
const account     = privateKeyToAccount(PRIVATE_KEY);

console.log("\n═══ x402 Test ═══════════════════════════════════════");
console.log(`Tool:    ${toolId}`);
console.log(`Server:  ${BASE_URL}`);
console.log(`Wallet:  ${account.address}`);
console.log(`Mode:    ${isDry ? "dry (sign only)" : "live"}`);
console.log("═══════════════════════════════════════════════════\n");

// ── Step 0: Check USDC balance ───────────────────────────────────────────────

const publicClient = createPublicClient({ chain: base, transport: http() });
const balance = await publicClient.readContract({
  address: USDC,
  abi: USDC_ABI,
  functionName: "balanceOf",
  args: [account.address],
});
console.log(`[0] USDC balance: ${formatUnits(balance, 6)} USDC`);
if (balance === 0n && !isDry) {
  console.error("❌ No USDC in wallet. Fund this address or use --dry flag.");
  process.exit(1);
}

// ── Step 1: GET 402 payment requirements ────────────────────────────────────

console.log(`\n[1] Fetching payment requirements from ${BASE_URL}/api/tool/${toolId} ...`);
const r1 = await fetch(`${BASE_URL}/api/tool/${toolId}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ toolParams: {} }),
});
const d1 = await r1.json();

if (!d1.requiresPayment) {
  console.log("✓ Tool is free (no payment required). Result:", JSON.stringify(d1.result ?? d1).slice(0, 200));
  process.exit(0);
}

const paymentDetails = d1.paymentDetails;
const accepts = paymentDetails?.accepts;
if (!accepts?.length) {
  console.error("❌ No payment requirements in 402:", JSON.stringify(d1));
  process.exit(1);
}

const req = accepts[0];
console.log(`✓ Got 402: ${parseFloat(req.maxAmountRequired) / 1e6} USDC → ${req.payTo}`);
console.log(`  network: ${req.network}, scheme: ${req.scheme}`);
console.log(`  maxTimeoutSeconds: ${req.maxTimeoutSeconds}`);

// ── Step 2: Sign EIP-3009 TransferWithAuthorization ─────────────────────────

const NETWORK_MAP = { "eip155:8453": "base", "eip155:84532": "base-sepolia" };
const network     = NETWORK_MAP[req.network] ?? req.network;
const nowSec      = Math.floor(Date.now() / 1000);
const validAfter  = BigInt(nowSec - 600);
const validBefore = BigInt(nowSec + (req.maxTimeoutSeconds ?? 60));
const nonce       = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;

console.log(`\n[2] Signing EIP-3009 authorization ...`);
console.log(`  from:        ${account.address}`);
console.log(`  to:          ${req.payTo}`);
console.log(`  value:       ${req.maxAmountRequired} atoms (${parseFloat(req.maxAmountRequired)/1e6} USDC)`);
console.log(`  validAfter:  ${validAfter} (${new Date(Number(validAfter)*1000).toISOString()})`);
console.log(`  validBefore: ${validBefore} (${new Date(Number(validBefore)*1000).toISOString()})`);
console.log(`  nonce:       ${nonce}`);

const walletClient = createWalletClient({ account, chain: base, transport: http() });

const signature = await walletClient.signTypedData({
  domain: {
    name:              req.extra?.name    ?? "USD Coin",
    version:           req.extra?.version ?? "2",
    chainId:           8453,
    verifyingContract: (req.asset ?? USDC),
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
    value:       BigInt(req.maxAmountRequired),
    validAfter,
    validBefore,
    nonce,
  },
});
console.log(`✓ Signature: ${signature.slice(0, 20)}...`);

// ── Step 3: Build X-PAYMENT header ──────────────────────────────────────────

const xPayment = Buffer.from(JSON.stringify({
  x402Version: 1,
  scheme:      req.scheme ?? "exact",
  network,
  payload: {
    signature,
    authorization: {
      from:        account.address,
      to:          req.payTo,
      value:       req.maxAmountRequired,
      validAfter:  validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
    },
  },
})).toString("base64");

console.log(`\n[3] X-PAYMENT header built (${xPayment.length} chars)`);

if (isDry) {
  console.log("\n── DRY RUN: stopping before API call ──");
  console.log("X-PAYMENT (base64):", xPayment.slice(0, 80), "...");
  process.exit(0);
}

// ── Step 4: Call API with X-PAYMENT ─────────────────────────────────────────

console.log(`\n[4] Calling ${BASE_URL}/api/${toolId} with X-PAYMENT ...`);
const t0 = Date.now();
const r2 = await fetch(`${BASE_URL}/api/${toolId}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-PAYMENT": xPayment,
  },
  body: JSON.stringify({}),
});
const d2 = await r2.json();
const elapsed = Date.now() - t0;

console.log(`✓ Response: HTTP ${r2.status} in ${elapsed}ms`);

if (!r2.ok) {
  console.error("❌ Error:", JSON.stringify(d2));
  process.exit(1);
}

console.log("\n── Result ──────────────────────────────────────────");
console.log(JSON.stringify(d2, null, 2).slice(0, 2000));
console.log("────────────────────────────────────────────────────\n");
console.log("✅ x402 flow complete. Check Vercel logs for [proxy] settlement tx.");
