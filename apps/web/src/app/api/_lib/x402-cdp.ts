/**
 * Self-hosted x402 settlement via Coinbase CDP facilitator (Base mainnet).
 *
 * We are the resource server: we return 402 requirements (payTo = our Club
 * wallet), then on a valid X-Payment we call CDP's facilitator to verify +
 * settle the EIP-3009 USDC transfer on-chain. Coinbase relays gas; USDC moves
 * from the user to our payTo wallet.
 *
 * Auth uses @coinbase/x402's createAuthHeader (CDP JWT). Requires env:
 *   CDP_API_KEY_ID, CDP_API_KEY_SECRET
 */
const CDP_HOST = "https://api.cdp.coinbase.com/platform/v2/x402";
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const PAY_TO = "0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f"; // Bankr Club wallet — receives USDC

export type PaymentRequirements = {
  scheme: "exact";
  network: "eip155:8453";
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { name: string; version: string };
};

export function buildRequirements(
  toolId: string,
  priceUnits: string,
  resource: string
): PaymentRequirements {
  return {
    scheme: "exact",
    network: "eip155:8453",
    maxAmountRequired: priceUnits,
    resource,
    description: `Blue Agent: ${toolId}`,
    mimeType: "application/json",
    payTo: PAY_TO,
    maxTimeoutSeconds: 120,
    asset: USDC_BASE,
    extra: { name: "USD Coin", version: "2" },
  };
}

type SettleResult = { ok: boolean; status: number; detail: unknown };

async function cdpCall(
  path: "/settle" | "/verify",
  paymentPayload: unknown,
  paymentRequirements: PaymentRequirements
): Promise<SettleResult> {
  const id = process.env.CDP_API_KEY_ID;
  const secret = process.env.CDP_API_KEY_SECRET;
  if (!id || !secret) {
    return { ok: false, status: 0, detail: "CDP_API_KEY_ID / CDP_API_KEY_SECRET not set" };
  }

  try {
    // Use the SDK's own facilitator config — it builds the correct CDP JWT
    // headers (right `uri` claim) per endpoint. Reads CDP_API_KEY_ID/SECRET env.
    const { facilitator } = await import("@coinbase/x402");
    const base = facilitator.url ?? CDP_HOST;
    const authHeaders = await facilitator.createAuthHeaders?.();
    const endpointHeaders = path === "/settle" ? authHeaders?.settle : authHeaders?.verify;

    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(endpointHeaders ?? {}),
      },
      body: JSON.stringify({ x402Version: 1, paymentPayload, paymentRequirements }),
      signal: AbortSignal.timeout(30_000),
    });
    // Read body ONCE as text, then try to parse JSON (avoids double-read error)
    const raw = await res.text();
    let detail: unknown;
    try { detail = JSON.parse(raw); } catch { detail = raw.slice(0, 400); }
    return { ok: res.ok, status: res.status, detail };
  } catch (e) {
    return { ok: false, status: 0, detail: `CDP call error: ${(e as Error).message}` };
  }
}

/** Settle the payment on-chain via CDP. Returns ok=true only if USDC moved. */
export async function cdpSettle(
  paymentPayload: unknown,
  paymentRequirements: PaymentRequirements
): Promise<SettleResult> {
  const r = await cdpCall("/settle", paymentPayload, paymentRequirements);
  const d = r.detail as Record<string, unknown> | string;
  const success = r.ok && (typeof d === "object" ? d?.success !== false : true);
  console.log(`[cdp] settle ${r.status}:`, JSON.stringify(r.detail).slice(0, 300));
  return { ...r, ok: success };
}
