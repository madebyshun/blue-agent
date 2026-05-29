/**
 * Self-hosted x402 settlement via Coinbase CDP facilitator (Base mainnet).
 *
 * We are the resource server: return 402 requirements (payTo = Club wallet),
 * then on a valid X-Payment settle the EIP-3009 USDC transfer on-chain through
 * CDP. Coinbase relays gas; USDC moves from the user to our payTo wallet.
 *
 * Uses the x402 v2 wire format expected by CDP:
 *   PaymentRequirements = { scheme, network, asset, amount, payTo, maxTimeoutSeconds, extra }
 *   PaymentPayload      = { x402Version: 2, accepted: <requirements>, payload: { signature, authorization } }
 *
 * Requires env: CDP_API_KEY_ID, CDP_API_KEY_SECRET
 */
const CDP_HOST = "https://api.cdp.coinbase.com/platform/v2/x402";
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const PAY_TO = "0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f"; // Bankr Club wallet — receives USDC

export type PaymentRequirements = {
  scheme: "exact";
  network: "eip155:8453";
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
};

/** Build x402 v2 PaymentRequirements (amount in USDC micro-units). */
export function buildRequirements(amountUnits: string): PaymentRequirements {
  return {
    scheme: "exact",
    network: "eip155:8453",
    asset: USDC_BASE,
    amount: amountUnits,
    payTo: PAY_TO,
    maxTimeoutSeconds: 120,
    extra: { name: "USD Coin", version: "2" },
  };
}

/** Reshape the hub's X-Payment into a v2 PaymentPayload (adds `accepted`). */
function toV2PaymentPayload(incoming: unknown, requirements: PaymentRequirements) {
  const obj = (incoming ?? {}) as Record<string, unknown>;
  const inner = (obj.payload ?? obj) as Record<string, unknown>; // { signature, authorization }
  return {
    x402Version: 2,
    accepted: requirements,
    payload: inner,
  };
}

type SettleResult = { ok: boolean; status: number; detail: unknown; tx?: string };

async function cdpCall(
  path: "/settle" | "/verify",
  paymentPayload: unknown,
  requirements: PaymentRequirements
): Promise<SettleResult> {
  const id = process.env.CDP_API_KEY_ID;
  const secret = process.env.CDP_API_KEY_SECRET;
  if (!id || !secret) {
    return { ok: false, status: 0, detail: "CDP_API_KEY_ID / CDP_API_KEY_SECRET not set" };
  }

  try {
    const { facilitator } = await import("@coinbase/x402");
    const base = facilitator.url ?? CDP_HOST;
    const authHeaders = await facilitator.createAuthHeaders?.();
    const endpointHeaders = path === "/settle" ? authHeaders?.settle : authHeaders?.verify;

    const v2Payload = toV2PaymentPayload(paymentPayload, requirements);

    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(endpointHeaders ?? {}) },
      body: JSON.stringify({
        x402Version: 2,
        paymentPayload: v2Payload,
        paymentRequirements: requirements,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const raw = await res.text();
    let detail: unknown;
    try { detail = JSON.parse(raw); } catch { detail = raw.slice(0, 400); }
    return { ok: res.ok, status: res.status, detail };
  } catch (e) {
    return { ok: false, status: 0, detail: `CDP call error: ${(e as Error).message}` };
  }
}

/** Verify a payment is valid (signature + funds) WITHOUT moving money. */
export async function cdpVerify(
  paymentPayload: unknown,
  requirements: PaymentRequirements
): Promise<SettleResult> {
  const r = await cdpCall("/verify", paymentPayload, requirements);
  const d = r.detail as Record<string, unknown> | string;
  const valid = r.ok && (typeof d === "object" && d !== null ? d?.isValid !== false : true);
  console.log(`[cdp] verify ${r.status}:`, JSON.stringify(r.detail).slice(0, 200));
  return { ...r, ok: valid };
}

/** Settle on-chain via CDP. ok=true only if USDC moved. */
export async function cdpSettle(
  paymentPayload: unknown,
  requirements: PaymentRequirements
): Promise<SettleResult> {
  const r = await cdpCall("/settle", paymentPayload, requirements);
  const d = r.detail as Record<string, unknown> | string;
  const success = r.ok && (typeof d === "object" && d !== null ? d?.success !== false : true);
  // x402 settle response carries the on-chain tx hash (field name varies)
  const tx = typeof d === "object" && d !== null
    ? (d.transaction ?? d.txHash ?? d.transactionHash) as string | undefined
    : undefined;
  console.log(`[cdp] settle ${r.status}:`, JSON.stringify(r.detail).slice(0, 300));
  return { ...r, ok: success, tx };
}
