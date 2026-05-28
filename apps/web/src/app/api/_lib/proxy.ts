import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";

/**
 * Shared bankr.bot x402 proxy.
 *
 * Routing logic:
 *   - No X-Payment + fallback provided → run locally via Bankr LLM (no payment gate)
 *   - No X-Payment + no fallback       → proxy to bankr.bot (returns 402 if unpaid)
 *   - X-Payment present + fallback     → verify via Bankr facilitator → settle USDC → run local pipeline
 *   - X-Payment present + no fallback  → forward to bankr.bot for payment verification
 *   - Network error                    → use fallback if provided
 */

type PaymentRequirements = {
  scheme: string; network: string;
  payTo: string; maxAmountRequired: string;
  resource: string; asset?: string; extra?: Record<string,string>;
  maxTimeoutSeconds?: number;
};

// Bankr 402 uses CAIP-2 format ("eip155:8453") but x402 lib only accepts short names ("base")
const NETWORK_MAP: Record<string, string> = {
  "eip155:8453":  "base",
  "eip155:84532": "base-sepolia",
};

// Facilitator expects paymentPayload as a PARSED object (not the raw base64 string)
function decodePaymentHeader(b64: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch { return null; }
}

async function verifyAndSettle(
  facilitatorUrl: string,
  paymentHeader: string,
  paymentRequirements: PaymentRequirements,
): Promise<{ ok: boolean; reason?: string }> {
  const paymentPayload = decodePaymentHeader(paymentHeader);
  if (!paymentPayload) {
    console.warn("[proxy] failed to decode payment header");
    return { ok: false, reason: "invalid_payment_encoding" };
  }

  // Use x402.org facilitator (Coinbase-backed) — Bankr's facilitator returns 500
  const facilitator = "https://www.x402.org/facilitator";

  try {
    console.info("[proxy] facilitator/verify →", facilitator, JSON.stringify({ paymentRequirements, x402Version: paymentPayload.x402Version }));
    const verifyRes = await fetch(`${facilitator}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
      signal: AbortSignal.timeout(15_000),
    });
    const rawText = await verifyRes.text();
    console.info(`[proxy] facilitator/verify ← HTTP ${verifyRes.status}:`, rawText);
    let verifyData: { isValid?: boolean; invalidReason?: string } = {};
    try { verifyData = JSON.parse(rawText); } catch {}
    if (!verifyData.isValid) {
      console.warn("[proxy] facilitator verify failed:", verifyData.invalidReason ?? rawText);
      return { ok: false, reason: verifyData.invalidReason ?? `facilitator_${verifyRes.status}` };
    }
    // Settle in background — submits EIP-3009 TransferWithAuthorization on-chain
    fetch(`${facilitator}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
      signal: AbortSignal.timeout(30_000),
    }).then(r => r.json()).then(d => {
      console.info("[proxy] settle:", JSON.stringify(d));
    }).catch(e => {
      console.warn("[proxy] settle error:", e);
    });
    return { ok: true };
  } catch (e) {
    console.warn("[proxy] facilitator error:", e);
    return { ok: false, reason: "facilitator_error" };
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

  // ── X-Payment present + fallback: verify via facilitator, run local pipeline ─
  if (xPayment && fallback) {
    // Fetch payment requirements fresh from Bankr (get the 402 body)
    let paymentRequirements: PaymentRequirements | null = null;
    let facilitatorUrl = "https://api.bankr.bot/facilitator";
    try {
      const reqsRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (reqsRes.status === 402) {
        const d = await reqsRes.json() as { accepts?: PaymentRequirements[]; facilitator?: string };
        const raw = d.accepts?.[0] ?? null;
        if (raw) {
          // Normalize network to x402 lib format ("eip155:8453" → "base")
          paymentRequirements = { ...raw, network: NETWORK_MAP[raw.network] ?? raw.network };
        }
        if (d.facilitator) facilitatorUrl = d.facilitator;
      }
    } catch (e) {
      console.warn("[proxy] could not fetch payment requirements:", e);
    }

    if (paymentRequirements) {
      const { ok, reason } = await verifyAndSettle(facilitatorUrl, xPayment, paymentRequirements);
      if (!ok) {
        return NextResponse.json({ error: reason ?? "Payment verification failed" }, { status: 402 });
      }
      console.info(`[proxy] payment verified → running local pipeline: ${endpoint}`);
    } else {
      // Can't get requirements — still run locally (endpoint may not be gated)
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
