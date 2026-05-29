/**
 * test-x402.mjs — Test x402 payment flow dùng Bankr CLI wallet
 *
 * Không cần private key — dùng `bankr wallet sign` để sign EIP-3009.
 *
 * Usage:
 *   node test-x402.mjs [tool] [input_json] [direct?]
 *
 * Examples:
 *   node test-x402.mjs ecosystem-digest '{"focus":"Base DeFi"}'
 *   node test-x402.mjs token-pick-signal '{}'
 *   node test-x402.mjs ecosystem-digest '{"focus":"Base DeFi"}' direct
 */

import { execSync } from "child_process";
import { randomBytes } from "crypto";

// ── Config ──────────────────────────────────────────────────────────────────
const WALLET   = "0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f";
const TOOL     = process.argv[2] ?? "ecosystem-digest";
const INPUT    = JSON.parse(process.argv[3] ?? "{}");
const DIRECT   = process.argv[4] === "direct";

const ENDPOINT = DIRECT
  ? `https://x402.bankr.bot/${WALLET}/${TOOL}`
  : `https://blueagent.dev/api/${TOOL}`;

console.log(`\n🔧  Tool:     ${TOOL}`);
console.log(`📡  Endpoint: ${ENDPOINT}`);
console.log(`🌐  Mode:     ${DIRECT ? "DIRECT → Bankr" : "blueagent.dev → Bankr + fallback"}\n`);

// ── Step 1: Call endpoint → expect 402 ──────────────────────────────────────
console.log("Step 1: Calling endpoint (expect 402)...");
const res1 = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(INPUT),
});

console.log(`  → HTTP ${res1.status}`);

if (res1.status === 200) {
  const data = await res1.json();
  console.log("\n✅  200 trực tiếp (no payment needed — Vercel fallback hoặc dev mode):");
  console.log(JSON.stringify(data, null, 2).slice(0, 1000));
  process.exit(0);
}

if (res1.status !== 402) {
  const text = await res1.text();
  console.error(`\n❌  Expected 402, got ${res1.status}:`, text.slice(0, 300));
  process.exit(1);
}

// ── Step 2: Parse 402 ───────────────────────────────────────────────────────
const d402    = await res1.json();
const accepts = d402.accepts?.[0] ?? d402.paymentDetails?.accepts?.[0];

if (!accepts) {
  console.error("❌  No accepts in 402:", JSON.stringify(d402));
  process.exit(1);
}

const { payTo, maxAmountRequired, asset, extra, scheme, network } = accepts;
const x402Version = d402.x402Version ?? 1;
const usdcAmt = (Number(maxAmountRequired) / 1_000_000).toFixed(2);

console.log(`\n💰  Cần thanh toán: $${usdcAmt} USDC`);
console.log(`    payTo:   ${payTo}`);
console.log(`    asset:   ${asset} (USDC Base)`);

// ── Step 3: Build EIP-712 typed data ────────────────────────────────────────
const nonce       = "0x" + randomBytes(32).toString("hex");
const validBefore = (Math.floor(Date.now() / 1000) + 300).toString();

const typedData = {
  domain: {
    name:              extra?.name    ?? "USD Coin",
    version:           extra?.version ?? "2",
    chainId:           8453,
    verifyingContract: asset ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
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
    from:        WALLET,
    to:          payTo,
    value:       maxAmountRequired,
    validAfter:  "0",
    validBefore,
    nonce,
  },
};

// ── Step 4: Sign với Bankr CLI ───────────────────────────────────────────────
console.log("\nStep 2: Signing với bankr wallet sign...");
console.log("  (Bankr wallet:", WALLET, ")");

let signature;
try {
  const result = execSync(
    `bankr wallet sign --type eth_signTypedData_v4 --typed-data '${JSON.stringify(typedData)}'`,
    { encoding: "utf-8", timeout: 30000 }
  );
  // Extract signature from output (0x...)
  const match = result.match(/(0x[0-9a-fA-F]{130})/);
  if (!match) {
    console.error("❌  Không tìm thấy signature trong output:\n", result);
    process.exit(1);
  }
  signature = match[1];
  console.log(`  → Signed ✓ (${signature.slice(0, 20)}...)`);
} catch (e) {
  console.error("❌  bankr wallet sign thất bại:", e.message);
  process.exit(1);
}

// ── Step 5: Build X-Payment header ──────────────────────────────────────────
const payment = {
  x402Version,
  scheme:  scheme  ?? "exact",
  network: network ?? "eip155:8453",
  payload: {
    signature,
    authorization: {
      from:        WALLET,
      to:          payTo,
      value:       maxAmountRequired,
      validAfter:  "0",
      validBefore,
      nonce,
    },
  },
};

const xPaymentHeader = Buffer.from(JSON.stringify(payment)).toString("base64");

// ── Step 6: Call với payment ─────────────────────────────────────────────────
console.log("\nStep 3: Gửi request với X-Payment header...");
const res2 = await fetch(ENDPOINT, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Payment": xPaymentHeader,
  },
  body: JSON.stringify(INPUT),
});

console.log(`  → HTTP ${res2.status}`);
const data2 = await res2.json();

if (res2.ok) {
  console.log("\n✅  THÀNH CÔNG! Kết quả:");
  console.log(JSON.stringify(data2, null, 2).slice(0, 2000));
  if (DIRECT) {
    console.log("\n🎯  Bankr handler chạy thành công! Request sẽ được count trong dashboard.");
  }
} else {
  console.error(`\n❌  THẤT BẠI (HTTP ${res2.status}):`);
  console.error(JSON.stringify(data2, null, 2));
  if (data2.error === "Endpoint unavailable") {
    console.error("\n⚠️   Bankr handler crash — fallback không hoạt động ở mode DIRECT.");
    console.error("     Thử không dùng 'direct' để Vercel fallback handle.");
  }
}
