import { NextRequest, NextResponse } from "next/server";

/**
 * Shared bankr.bot x402 proxy.
 *
 * Simple flow:
 *   - No X-Payment  → forward to Bankr (no payment) → Bankr returns 402 requirements
 *   - X-Payment     → forward to Bankr with payment → Bankr verifies + runs tool
 *                     If Bankr handler broken (5xx) → run local fallback pipeline
 *                     If Bankr network error        → run local fallback pipeline
 *                     If Bankr 402 (bad payment)    → pass 402 to client
 */

export async function proxyTool(
  req: NextRequest,
  endpoint: string,
  fallback?: (body: Record<string, unknown>) => Promise<NextResponse>
): Promise<NextResponse> {
  const xPayment = req.headers.get("x-payment") ?? req.headers.get("X-Payment");

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (xPayment) headers["X-Payment"] = xPayment;

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(60_000),
    });
  } catch (e) {
    // Bankr network error — fallback locally if X-PAYMENT was present
    if (xPayment && fallback) {
      console.warn(`[proxy] Bankr unreachable → local fallback: ${(e as Error).message}`);
      try { return await fallback(body); }
      catch (fe) { return NextResponse.json({ error: "Tool error", message: (fe as Error).message }, { status: 500 }); }
    }
    return NextResponse.json({ error: "Service unavailable", message: (e as Error).message }, { status: 502 });
  }

  // 402 — no payment or bad payment → pass through to client
  if (upstream.status === 402) {
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: 402 });
  }

  // 200 — Bankr handled it (payment verified + settled)
  if (upstream.ok) {
    const data = await upstream.json().catch(() => ({ error: "Failed to parse response" }));
    return NextResponse.json(data);
  }

  // 5xx — Bankr handler broken → local fallback if X-PAYMENT was sent
  const errorBody = await upstream.json().catch(() => ({}));
  console.warn(`[proxy] Bankr → ${upstream.status} → local fallback`);
  if (xPayment && fallback) {
    try { return await fallback(body); }
    catch (fe) { return NextResponse.json({ error: "Tool error", message: (fe as Error).message }, { status: 500 }); }
  }

  return NextResponse.json(errorBody, { status: upstream.status });
}
