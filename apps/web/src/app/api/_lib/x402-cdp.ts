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
import { X402_PAY_TO } from "@/lib/x402-payee";

const CDP_HOST = "https://api.cdp.coinbase.com/platform/v2/x402";
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// Blue Agent treasury — receives every USDC settlement. Re-exported from
// lib/x402-payee so it cannot drift from the value the browser signs against;
// a divergence fails CDP verification on every Hub call.
export const PAY_TO = X402_PAY_TO;

export type PaymentRequirements = {
  scheme: "exact";
  network: "eip155:8453";
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  /** `assetTransferMethod` is x402 v2's transfer-method hint; "permit2" opts a
   *  smart-account client into the Permit2 flow instead of EIP-3009. */
  extra: { name: string; version: string; assetTransferMethod?: string };
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

/**
 * The second accepts entry: the same terms, but Permit2 instead of EIP-3009.
 *
 * WHY: smart accounts (Blocky Agent's among them) can't sign an EIP-3009
 * transferWithAuthorization — that signature must come from the EOA that owns
 * the USDC, and a 4337 account signs through its own flow. Permit2's
 * signature-transfer works for any address that holds the token, smart account
 * included. ShunTr, 2026-11-16, on Blocky failing to pay x402 from a smart
 * account: add a permit2 accept.
 *
 * SHAPE (from @x402/evm 2.x, not guessed): the client that sees
 * `extra.assetTransferMethod: "permit2"` signs a PermitWitnessTransferFrom
 * over Permit2's own domain (name "Permit2", verifyingContract
 * 0x0000…22D4), spender = the x402 exact proxy 0x4020…0001, witness.to =
 * payTo, and answers payload.permit2Authorization. The CDP facilitator
 * verifies/settles that shape; nothing server-side changes.
 *
 * accepts[0] stays EIP-3009 on purpose: existing clients read the FIRST entry
 * and keep working unchanged. A permit2-aware client picks the entry whose
 * extra names its transfer method.
 */
export function buildPermit2Requirements(amountUnits: string): PaymentRequirements {
  return {
    ...buildRequirements(amountUnits),
    extra: { name: "USD Coin", version: "2", assetTransferMethod: "permit2" },
  };
}

/**
 * Requirements for a payment that goes to SOMEONE ELSE: the job board's unlock
 * (api/jobs/[id]/deliveries/[did]/unlock), where the poster pays the agent that
 * did the work, directly. Blue Agent is never the payee there and holds nothing:
 * the facilitator moves USDC from the poster to `payTo` in one authorization.
 * Same network, asset and settlement path as every other door, which is why it
 * lives here and not in the route (x402-payee-check group 6).
 */
export function buildRequirementsTo(amountUnits: string, payTo: string): PaymentRequirements {
  return { ...buildRequirements(amountUnits), payTo, maxTimeoutSeconds: 300 };
}

/** Reshape the hub's X-Payment into a v2 PaymentPayload (adds `accepted`, `resource`, `extensions`).
 *
 * IMPORTANT: Preserve scheme/network/payload from the client's X-Payment so CDP can parse the
 * full PaymentPayload. CDP's schema requires {x402Version, scheme, network, payload} — if we
 * drop scheme/network, CDP may strip unknown fields (resource, extensions) before discovery.
 */
function toV2PaymentPayload(
  incoming: unknown,
  requirements: PaymentRequirements,
  resource?: { url: string; description?: string; mimeType?: string },
  extensions?: Record<string, unknown>,
) {
  const obj = (incoming ?? {}) as Record<string, unknown>;
  // Preserve all client fields (scheme, network, payload, etc.) so CDP validation passes.
  // Then override/add: accepted, resource, extensions from server side.
  return {
    ...obj,
    x402Version: 2,
    accepted: requirements,
    // Bazaar: resource.url + extensions are read by CDP facilitator's extractDiscoveryInfo
    ...(resource ? { resource } : {}),
    ...(extensions ? { extensions } : {}),
  };
}

type SettleResult = { ok: boolean; status: number; detail: unknown; tx?: string };

/** Bazaar extension payload — forwarded to CDP so it can catalog the service. */
export type BazaarExtension = {
  info: {
    input: {
      type: string;
      method: string;
      bodyType?: string;
      body?: Record<string, unknown>;
    };
    output: { example?: unknown };
  };
};

async function cdpCall(
  path: "/settle" | "/verify",
  paymentPayload: unknown,
  requirements: PaymentRequirements,
  resource?: { url: string; description?: string; mimeType?: string },
  extensions?: Record<string, unknown>,
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

    // Bazaar extension goes INSIDE paymentPayload (resource + extensions fields).
    // The official x402 middleware sends extensions with the SETTLE call via processSettlement
    // (see x402-next handleSettlement → processSettlement(paymentPayload, reqs, declaredExtensions)).
    // We send on both /verify and /settle to maximize compatibility.
    const v2Payload = toV2PaymentPayload(
      paymentPayload,
      requirements,
      resource,
      extensions,
    );

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

    // Log Bazaar EXTENSION-RESPONSES header for debugging Bazaar cataloging
    const extResp = res.headers.get("extension-responses") ?? res.headers.get("EXTENSION-RESPONSES");
    if (extResp) {
      try {
        const decoded = JSON.parse(Buffer.from(extResp, "base64").toString("utf-8"));
        console.log(`[cdp] ${path} EXTENSION-RESPONSES:`, JSON.stringify(decoded));
      } catch {
        console.log(`[cdp] ${path} EXTENSION-RESPONSES (raw):`, extResp.slice(0, 200));
      }
    }

    return { ok: res.ok, status: res.status, detail };
  } catch (e) {
    return { ok: false, status: 0, detail: `CDP call error: ${(e as Error).message}` };
  }
}

/** Verify a payment is valid (signature + funds) WITHOUT moving money. */
export async function cdpVerify(
  paymentPayload: unknown,
  requirements: PaymentRequirements,
  resource?: { url: string; description?: string; mimeType?: string; serviceName?: string; tags?: string[]; iconUrl?: string },
  extensions?: Record<string, unknown>,
): Promise<SettleResult> {
  const r = await cdpCall("/verify", paymentPayload, requirements, resource, extensions);
  const d = r.detail as Record<string, unknown> | string;
  const valid = r.ok && (typeof d === "object" && d !== null ? d?.isValid !== false : true);
  console.log(`[cdp] verify ${r.status}:`, JSON.stringify(r.detail).slice(0, 200));
  return { ...r, ok: valid };
}

/** Settle on-chain via CDP. ok=true only if USDC moved. */
export async function cdpSettle(
  paymentPayload: unknown,
  requirements: PaymentRequirements,
  resource?: { url: string; description?: string; mimeType?: string; serviceName?: string; tags?: string[]; iconUrl?: string },
  extensions?: Record<string, unknown>,
): Promise<SettleResult> {
  const r = await cdpCall("/settle", paymentPayload, requirements, resource, extensions);
  const d = r.detail as Record<string, unknown> | string;
  const success = r.ok && (typeof d === "object" && d !== null ? d?.success !== false : true);
  // x402 settle response carries the on-chain tx hash (field name varies)
  const tx = typeof d === "object" && d !== null
    ? (d.transaction ?? d.txHash ?? d.transactionHash) as string | undefined
    : undefined;
  console.log(`[cdp] settle ${r.status}:`, JSON.stringify(r.detail).slice(0, 300));
  return { ...r, ok: success, tx };
}
