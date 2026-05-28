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

async function verifyAndSettle(
  facilitatorUrl: string,
  paymentHeader: string,
  paymentRequirements: PaymentRequirements,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const reqBody = { paymentPayload: paymentHeader, paymentRequirements };
    console.info("[proxy] facilitator/verify →", facilitatorUrl, JSON.stringify({ paymentRequirements, payloadPreview: paymentHeader.slice(0, 80) }));
    const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
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
    // Settle in background — USDC transfer is submitted on-chain
    fetch(`${facilitatorUrl}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentPayload: paymentHeader, paymentRequirements }),
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
        paymentRequirements = d.accepts?.[0] ?? null;
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
