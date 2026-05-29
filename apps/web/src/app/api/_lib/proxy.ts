import { NextRequest, NextResponse } from "next/server";

/**
 * Thin pass-through proxy to Bankr x402 cloud.
 *
 * No X-Payment → forward to Bankr → Bankr returns 402 requirements
 * X-Payment    → forward to Bankr → Bankr verifies + settles + runs tool
 *                If Bankr handler broken (5xx) AND fallback provided → run locally
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
    // Bankr unreachable — fallback locally if available and payment was sent
    if (xPayment && fallback) {
      try { return await fallback(body); }
      catch (fe) { return NextResponse.json({ error: "Tool error", message: (fe as Error).message }, { status: 500 }); }
    }
    return NextResponse.json({ error: "Service unavailable", message: (e as Error).message }, { status: 502 });
  }

  // 200 — success
  if (upstream.ok) {
    const data = await upstream.json().catch(() => ({ error: "Failed to parse response" }));
    return NextResponse.json(data);
  }

  // 402 — pass through (payment required or invalid)
  if (upstream.status === 402) {
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: 402 });
  }

  // 5xx — Bankr handler broken → local fallback if available
  if (upstream.status >= 500 && fallback) {
    console.warn(`[proxy] Bankr ${upstream.status} → local fallback`);
    try { return await fallback(body); }
    catch (fe) { return NextResponse.json({ error: "Tool error", message: (fe as Error).message }, { status: 500 }); }
  }

  // Other errors — pass through
  const errData = await upstream.json().catch(() => ({}));
  return NextResponse.json(errData, { status: upstream.status });
}
