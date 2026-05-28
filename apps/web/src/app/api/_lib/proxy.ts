import { NextRequest, NextResponse } from "next/server";

/**
 * Shared bankr.bot x402 proxy.
 *
 * Protocol-correct flow when X-Payment present + fallback available:
 *   1. Forward request WITH X-PAYMENT to Bankr endpoint
 *   2. Bankr verifies payment, logs to dashboard, settles USDC
 *   3. If Bankr returns 200      → return their result
 *   4. If Bankr returns 402      → payment invalid, return 402 to client
 *   5. If Bankr handler broken   → run our local 3-agent pipeline (fallback)
 *
 * Other cases:
 *   - No X-Payment + fallback    → run locally (free / dev mode)
 *   - No X-Payment + no fallback → proxy to Bankr (returns 402 to client)
 *   - X-Payment + no fallback    → forward to Bankr for full handling
 */

export async function proxyTool(
  req: NextRequest,
  endpoint: string,
  fallback?: (body: Record<string, unknown>) => Promise<NextResponse>
): Promise<NextResponse> {
  const xPayment = req.headers.get("x-payment") ?? req.headers.get("X-Payment");

  // Parse body once — shared across branches
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  // ── No payment + local fallback → run locally (free) ─────────────────────
  if (!xPayment && fallback) {
    console.info(`[proxy] no payment → local: ${endpoint}`);
    return fallback(body);
  }

  // ── Forward to Bankr with X-PAYMENT ──────────────────────────────────────
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (xPayment) headers["X-Payment"] = xPayment;

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    // Network error — if fallback available, run locally
    if (fallback) {
      console.warn(`[proxy] Bankr unreachable, running local: ${(e as Error).message}`);
      return fallback(body);
    }
    return NextResponse.json(
      { error: "Could not reach service", message: (e as Error).message },
      { status: 502 }
    );
  }

  // 402 — payment required or invalid → pass through to client
  if (upstream.status === 402) {
    const data = await upstream.json().catch(() => ({}));
    console.info(`[proxy] Bankr → 402 (payment required)`);
    return NextResponse.json(data, { status: 402 });
  }

  // 200 — Bankr handled it successfully (payment verified + settled)
  if (upstream.ok) {
    const data = await upstream.json().catch(() => ({ error: "Failed to parse response" }));
    console.info(`[proxy] Bankr → 200 OK`);
    return NextResponse.json(data);
  }

  // Non-200, non-402 (handler broken) — fall back to local pipeline if available
  const errorBody = await upstream.json().catch(() => ({}));
  console.warn(`[proxy] Bankr → ${upstream.status} (handler broken):`, JSON.stringify(errorBody));

  if (fallback) {
    console.info(`[proxy] falling back to local pipeline: ${endpoint}`);
    return fallback(body);
  }

  return NextResponse.json(errorBody, { status: upstream.status });
}
