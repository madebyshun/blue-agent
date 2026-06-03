/**
 * trigger-bazaar-cdp.mjs — Trigger Bazaar indexing via CDP managed wallet.
 *
 * Không cần private key — CDP giữ và sign thay bạn.
 * CDP wallet address sẽ được in ra để bạn fund USDC.
 *
 * Usage:
 *   node scripts/trigger-bazaar-cdp.mjs [tool]
 *
 * Requires env (từ Vercel):
 *   CDP_API_KEY_ID, CDP_API_KEY_SECRET
 *
 * Flow:
 *   1. Create (or reuse) CDP server wallet "blue-hub-bazaar-trigger"
 *   2. Print wallet address → bạn send USDC tới đó
 *   3. Script ký EIP-3009 qua CDP signTypedData (no private key exposure)
 *   4. POST to /api/x402/{tool} → CDP verify+settle → Bazaar indexes
 */

import { CdpClient } from "@coinbase/cdp-sdk";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { base } from "viem/chains";
import { readFileSync } from "fs";

// ── Load env ─────────────────────────────────────────────────────────────────

// Load env file but never overwrite vars already set in the environment
function loadEnv(file) {
  try {
    const lines = readFileSync(file, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key] && val) process.env[key] = val; // only set if not already set and non-empty
    }
  } catch {}
}
loadEnv(new URL("../apps/web/.env.local", import.meta.url).pathname);
loadEnv("/tmp/vercel-env-prod.txt");

const CDP_KEY_ID     = process.env.CDP_API_KEY_ID;
const CDP_KEY_SECRET = process.env.CDP_API_KEY_SECRET;

if (!CDP_KEY_ID || !CDP_KEY_SECRET) {
  console.error("❌ Missing CDP_API_KEY_ID or CDP_API_KEY_SECRET");
  process.exit(1);
}

// ── Config ────────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const toolId = args.find(a => !a.startsWith("--")) ?? "blue-idea"; // $0.05 cheapest
const ENDPOINT = `https://blueagent.dev/api/x402/${toolId}`;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WALLET_NAME = "blue-hub-bazaar-trigger";

const USDC_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

const TOOL_BODIES = {
  "blue-idea":         { description: "AI-powered DeFi yield optimizer on Base" },
  "token-pick-signal": { context: "Base DeFi opportunities" },
  "ecosystem-digest":  {},
  "contract-trust":    { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  "market-fit":        { name: "Blue Hub", description: "x402 AI tools for Base builders" },
};

console.log("\n═══ Bazaar Trigger — CDP Managed Wallet ══════════════");
console.log(`Tool:    ${toolId}`);
console.log(`URL:     ${ENDPOINT}`);
console.log("══════════════════════════════════════════════════════\n");

// ── Init CDP ──────────────────────────────────────────────────────────────────

const cdp = new CdpClient({
  apiKeyId:     CDP_KEY_ID,
  apiKeySecret: CDP_KEY_SECRET,
});

// ── Step 1: Get or create CDP server wallet ───────────────────────────────────

console.log(`[1] Getting/creating CDP server wallet "${WALLET_NAME}" ...`);
const account = await cdp.evm.getOrCreateAccount({ name: WALLET_NAME });
console.log(`✓ Wallet address: ${account.address}`);

// ── Step 2: Check USDC balance ────────────────────────────────────────────────

const publicClient = createPublicClient({ chain: base, transport: http() });
const balance = await publicClient.readContract({
  address: USDC,
  abi: USDC_ABI,
  functionName: "balanceOf",
  args: [account.address],
});
console.log(`[2] USDC balance: ${formatUnits(balance, 6)} USDC`);

if (balance === 0n) {
  console.log("\n⚠️  Wallet có 0 USDC. Cần fund trước:");
  console.log(`   → Gửi ít nhất 0.10 USDC (Base mainnet) đến:`);
  console.log(`   → ${account.address}`);
  console.log("\n   Sau khi gửi xong, chạy lại script này.");
  process.exit(0);
}

// ── Step 3: GET 402 payment requirements ─────────────────────────────────────

console.log(`\n[3] Fetching 402 requirements ...`);
const r1 = await fetch(ENDPOINT, { method: "GET" });
const d1 = await r1.json();

if (r1.status !== 402) {
  console.error(`❌ Expected 402, got ${r1.status}`);
  process.exit(1);
}

const req = d1.accepts?.[0];
if (!req) {
  console.error("❌ No accepts[] in response");
  process.exit(1);
}
console.log(`✓ amount: ${Number(req.amount)/1e6} USDC → ${req.payTo}`);

if (balance < BigInt(req.amount)) {
  console.error(`❌ Insufficient: have ${formatUnits(balance, 6)}, need ${Number(req.amount)/1e6}`);
  process.exit(1);
}

// ── Step 4: Sign EIP-3009 via CDP signTypedData ───────────────────────────────

const nowSec      = Math.floor(Date.now() / 1000);
const validAfter  = 0n;
const validBefore = BigInt(nowSec + (req.maxTimeoutSeconds ?? 120));
const nonce       = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;

console.log(`\n[4] Signing EIP-3009 via CDP (no private key needed) ...`);

const { signature } = await cdp.evm.signTypedData({
  address: account.address,
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

// ── Step 5: Build X-Payment header (x402 v2) ─────────────────────────────────

const xPaymentHeader = Buffer.from(JSON.stringify({
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
})).toString("base64");

// ── Step 6: POST with payment ─────────────────────────────────────────────────

const body = TOOL_BODIES[toolId] ?? {};
console.log(`\n[5] Calling ${ENDPOINT} ...`);
console.log(`    body: ${JSON.stringify(body)}`);

const t0 = Date.now();
const r2 = await fetch(ENDPOINT, {
  method: "POST",
  headers: {
    "Content-Type":  "application/json",
    "X-Payment":     xPaymentHeader,
  },
  body: JSON.stringify(body),
});
const elapsed = Date.now() - t0;
console.log(`✓ HTTP ${r2.status} in ${elapsed}ms`);

const d2 = await r2.json().catch(() => ({}));

if (!r2.ok) {
  console.error(`\n❌ Error ${r2.status}:`, JSON.stringify(d2, null, 2).slice(0, 500));
  process.exit(1);
}

// ── Result ────────────────────────────────────────────────────────────────────

const settle = d2._settle;
console.log("\n══ Settlement ════════════════════════════════════════");
if (settle?.ok) {
  console.log(`✅ USDC settled on-chain!`);
  if (settle.tx) console.log(`   Tx: https://basescan.org/tx/${settle.tx}`);
} else {
  console.log(`⚠️  settle.ok=${settle?.ok} | status: ${settle?.status}`);
  console.log(`   detail:`, JSON.stringify(settle).slice(0, 200));
}

const preview = { ...d2 };
delete preview._settle;
console.log("\n══ Tool Output ═══════════════════════════════════════");
console.log(JSON.stringify(preview, null, 2).slice(0, 800));

console.log("\n══ Next Steps ════════════════════════════════════════");
if (settle?.ok) {
  console.log("✅ Bazaar indexing triggered!");
  console.log("   Check in ~2 min: https://agentic.market/services/blueagent-dev");
}
console.log("══════════════════════════════════════════════════════\n");
