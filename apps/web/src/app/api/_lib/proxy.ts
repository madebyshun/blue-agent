import { NextRequest, NextResponse } from "next/server";
import { recoverTypedDataAddress, createWalletClient, createPublicClient, http, hexToSignature, parseAbi } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Shared bankr.bot x402 proxy.
 *
 * Routing logic:
 *   - No X-Payment + fallback provided → run locally via Bankr LLM (no payment gate)
 *   - No X-Payment + no fallback       → proxy to bankr.bot (returns 402 if unpaid)
 *   - X-Payment present + fallback     → verify EIP-3009 signature locally → run local pipeline
 *   - X-Payment present + no fallback  → forward to bankr.bot for payment verification
 */

type PaymentRequirements = {
  scheme: string; network: string;
  payTo: string; maxAmountRequired: string;
  resource: string; asset?: string; extra?: Record<string,string>;
  maxTimeoutSeconds?: number;
  description?: string; mimeType?: string;
};

// Bankr 402 uses CAIP-2 format ("eip155:8453") but x402 lib only accepts short names ("base")
const NETWORK_MAP: Record<string, string> = {
  "eip155:8453":  "base",
  "eip155:84532": "base-sepolia",
};

const AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from",        type: "address" },
    { name: "to",          type: "address" },
    { name: "value",       type: "uint256" },
    { name: "validAfter",  type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce",       type: "bytes32" },
  ],
} as const;

/**
 * Verify EIP-3009 TransferWithAuthorization signature using viem.
 * No external facilitator needed — ecrecover is deterministic.
 */
async function verifyEip3009(
  paymentPayload: Record<string, unknown>,
  paymentRequirements: PaymentRequirements,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const p = paymentPayload as {
      payload?: {
        signature?: string;
        authorization?: {
          from?: string; to?: string; value?: string;
          validAfter?: string; validBefore?: string; nonce?: string;
        };
      };
    };
    const auth = p.payload?.authorization;
    const sig  = p.payload?.signature;
    if (!auth || !sig) return { ok: false, reason: "missing_payload" };
    if (!auth.from || !auth.to || !auth.value || !auth.nonce) return { ok: false, reason: "missing_authorization_fields" };

    // Timing checks
    const nowSec      = Math.floor(Date.now() / 1000);
    const validAfter  = BigInt(auth.validAfter  ?? "0");
    const validBefore = BigInt(auth.validBefore ?? "0");
    if (nowSec < Number(validAfter))  return { ok: false, reason: "not_yet_valid" };
    if (nowSec >= Number(validBefore)) return { ok: false, reason: "expired" };

    // Recipient and value checks
    if (auth.to.toLowerCase() !== paymentRequirements.payTo.toLowerCase())
      return { ok: false, reason: "recipient_mismatch" };
    if (BigInt(auth.value) < BigInt(paymentRequirements.maxAmountRequired))
      return { ok: false, reason: "insufficient_amount" };

    // Reconstruct EIP-712 domain from payment requirements
    const asset  = (paymentRequirements.asset ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as `0x${string}`;
    const domain = {
      name:              paymentRequirements.extra?.name    ?? "USD Coin",
      version:           paymentRequirements.extra?.version ?? "2",
      chainId:           8453,
      verifyingContract: asset,
    };

    // Recover signer address from the signature
    const recovered = await recoverTypedDataAddress({
      domain,
      types:       AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from:        auth.from as `0x${string}`,
        to:          auth.to  as `0x${string}`,
        value:       BigInt(auth.value),
        validAfter,
        validBefore,
        nonce:       auth.nonce as `0x${string}`,
      },
      signature: sig as `0x${string}`,
    });

    if (recovered.toLowerCase() !== auth.from.toLowerCase()) {
      console.warn("[proxy] signature mismatch: recovered", recovered, "expected", auth.from);
      return { ok: false, reason: "invalid_signature" };
    }

    // Check on-chain USDC balance
    const publicClient = createPublicClient({ chain: base, transport: http() });
    const balance = await publicClient.readContract({
      address: asset,
      abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
      functionName: "balanceOf",
      args: [auth.from as `0x${string}`],
    });
    if (balance < BigInt(auth.value)) {
      console.warn("[proxy] insufficient USDC balance:", balance.toString(), "<", auth.value);
      return { ok: false, reason: "insufficient_funds" };
    }

    console.info("[proxy] EIP-3009 verified: payer", recovered, "balance", balance.toString(), "amount", auth.value);
    return { ok: true };
  } catch (e) {
    console.warn("[proxy] EIP-3009 verify error:", e);
    return { ok: false, reason: "signature_verify_error" };
  }
}

const USDC_ABI = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external",
]);

/**
 * Submit transferWithAuthorization on-chain to actually deduct USDC.
 * Runs in background — requires RELAYER_PRIVATE_KEY env var with ETH on Base.
 */
async function settleOnChain(
  paymentPayload: Record<string, unknown>,
  paymentRequirements: PaymentRequirements,
): Promise<void> {
  const relayerKey = process.env.RELAYER_PRIVATE_KEY;
  if (!relayerKey) {
    console.warn("[proxy] RELAYER_PRIVATE_KEY not set — skipping on-chain settlement");
    return;
  }
  try {
    const p = paymentPayload as { payload?: { signature?: string; authorization?: Record<string, string> } };
    const auth = p.payload?.authorization;
    const sig  = p.payload?.signature;
    if (!auth || !sig) return;

    const { v, r, s } = hexToSignature(sig as `0x${string}`);
    const account = privateKeyToAccount(relayerKey as `0x${string}`);
    const client  = createWalletClient({ account, chain: base, transport: http() });
    const asset   = (paymentRequirements.asset ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as `0x${string}`;

    const hash = await client.writeContract({
      address: asset,
      abi: USDC_ABI,
      functionName: "transferWithAuthorization",
      args: [
        auth.from        as `0x${string}`,
        auth.to          as `0x${string}`,
        BigInt(auth.value),
        BigInt(auth.validAfter  ?? "0"),
        BigInt(auth.validBefore ?? "0"),
        auth.nonce       as `0x${string}`,
        Number(v),
        r,
        s,
      ],
    });
    console.info("[proxy] settlement tx submitted:", hash);
  } catch (e) {
    console.warn("[proxy] settlement error:", e);
  }
}

export async function proxyTool(
  req: NextRequest,
  endpoint: string,
  fallback?: (body: Record<string, unknown>) => Promise<NextResponse>
): Promise<NextResponse> {
  const xPayment = req.headers.get("x-payment") ?? req.headers.get("X-Payment");

  // Parse body once — shared with fallback
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  // ── No payment header + local handler available → run locally (free) ──────
  if (!xPayment && fallback) {
    console.info(`[proxy] no payment → local: ${endpoint}`);
    return fallback(body);
  }

  // ── X-Payment present + fallback: verify signature, run local pipeline ────
  if (xPayment && fallback) {
    // Decode base64 payment header
    let paymentPayload: Record<string, unknown> | null = null;
    try {
      const json = Buffer.from(xPayment, "base64").toString("utf8");
      paymentPayload = JSON.parse(json) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "invalid_payment_encoding" }, { status: 402 });
    }

    // Fetch payment requirements fresh from Bankr to get authoritative payTo/asset
    let paymentRequirements: PaymentRequirements | null = null;
    try {
      const reqsRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (reqsRes.status === 402) {
        const d = await reqsRes.json() as { accepts?: PaymentRequirements[] };
        const raw = d.accepts?.[0] ?? null;
        if (raw) paymentRequirements = { ...raw, network: NETWORK_MAP[raw.network] ?? raw.network };
      }
    } catch (e) {
      console.warn("[proxy] could not fetch payment requirements:", e);
    }

    if (paymentRequirements) {
      const { ok, reason } = await verifyEip3009(paymentPayload, paymentRequirements);
      if (!ok) {
        console.warn("[proxy] payment verification failed:", reason);
        return NextResponse.json({ error: reason ?? "Payment verification failed" }, { status: 402 });
      }
      // Settle in background — submit transferWithAuthorization on-chain
      settleOnChain(paymentPayload, paymentRequirements).catch(e =>
        console.warn("[proxy] background settle failed:", e)
      );
    } else {
      console.warn("[proxy] could not get payment requirements, running local anyway");
    }

    return fallback(body);
  }

  // ── No fallback: forward directly to bankr.bot ────────────────────────────
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (xPayment) headers["X-Payment"] = xPayment;

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not reach service", message: (e as Error).message },
      { status: 502 }
    );
  }

  // 402 — pass through so client can complete x402 payment flow
  if (upstream.status === 402) {
    const ct = upstream.headers.get("content-type") ?? "";
    const data = ct.includes("application/json")
      ? await upstream.json().catch(() => ({}))
      : await upstream.text().catch(() => "");
    return NextResponse.json(data, { status: 402 });
  }

  const ct = upstream.headers.get("content-type") ?? "";
  const data = ct.includes("application/json")
    ? await upstream.json().catch(() => ({ error: "Failed to parse response" }))
    : await upstream.text().catch(() => "");

  if (!upstream.ok) {
    console.error(`[proxy] upstream ${endpoint} → ${upstream.status}:`, JSON.stringify(data));
  }

  return NextResponse.json(data, { status: upstream.status });
}
