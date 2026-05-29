import { NextRequest, NextResponse } from "next/server";

const FACILITATOR = "https://facilitator.x402.org";
const USDC        = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/**
 * Decode X-Payment header and fire-and-forget USDC settlement via facilitator.
 * Called when local fallback runs (Bankr handler broken) so USDC is still deducted.
 */
function settlePayment(xPayment: string, endpoint: string): void {
  try {
    const payment = JSON.parse(Buffer.from(xPayment, "base64").toString("utf-8"));
    const auth = payment?.payload?.authorization as Record<string, string> | undefined;
    if (!auth?.to || !auth?.value || !auth?.from) return;

    // Extract tool name from endpoint URL: .../0xf31f.../ecosystem-digest → ecosystem-digest
    const toolName = endpoint.split("/").pop() ?? "tool";

    const requirement = {
      scheme:            "exact",
      network:           "eip155:8453",
      maxAmountRequired: auth.value,
      payTo:             auth.to,
      asset:             USDC,
      maxTimeoutSeconds: 300,
      resource:          endpoint,
      description:       `Blue Agent: ${toolName}`,
      mimeType:          "application/json",
      extra:             { name: "USD Coin", version: "2" },
    };

    fetch(`${FACILITATOR}/settle`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        x402Version:         payment.x402Version ?? 2,
        paymentPayload:      payment,
        paymentRequirements: requirement,
      }),
      signal: AbortSignal.timeout(20_000),
    })
      .then(r => r.json().then(d => console.log("[proxy] settle:", JSON.stringify(d))))
      .catch(e => console.error("[proxy] settle error:", (e as Error).message));

  } catch (e) {
    console.error("[proxy] settlePayment parse error:", (e as Error).message);
  }
}

/**
 * Thin pass-through proxy to Bankr x402 cloud.
 *
 * No X-Payment → forward to Bankr → Bankr returns 402 requirements
 * X-Payment    → forward to Bankr → Bankr verifies + settles + runs tool
 *                If Bankr handler broken → run locally + settle via facilitator
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
    // Bankr unreachable — fallback locally + settle USDC if payment was sent
    if (xPayment && fallback) {
      settlePayment(xPayment, endpoint);
      try { return await fallback(body); }
      catch (fe) { return NextResponse.json({ error: "Tool error", message: (fe as Error).message }, { status: 500 }); }
    }
    return NextResponse.json({ error: "Service unavailable", message: (e as Error).message }, { status: 502 });
  }

  // 200 — check if Bankr handler actually ran or returned an "unavailable" error
  if (upstream.ok) {
    const data = await upstream.json().catch(() => ({ error: "Failed to parse response" }));
    const isUnavailable = typeof data.error === "string" &&
      (data.error.includes("unavailable") || data.error.includes("Endpoint"));
    if (isUnavailable && fallback) {
      console.warn("[proxy] Bankr handler unavailable → local fallback + settle");
      if (xPayment) settlePayment(xPayment, endpoint);
      try { return await fallback(body); }
      catch (fe) { return NextResponse.json({ error: "Tool error", message: (fe as Error).message }, { status: 500 }); }
    }
    return NextResponse.json(data);
  }

  // 402 — pass through (payment required or invalid)
  if (upstream.status === 402) {
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: 402 });
  }

  // 5xx — Bankr handler broken → local fallback + settle USDC
  if (upstream.status >= 500 && fallback) {
    console.warn(`[proxy] Bankr ${upstream.status} → local fallback + settle`);
    if (xPayment) settlePayment(xPayment, endpoint);
    try { return await fallback(body); }
    catch (fe) { return NextResponse.json({ error: "Tool error", message: (fe as Error).message }, { status: 500 }); }
  }

  // Other errors — pass through
  const errData = await upstream.json().catch(() => ({}));
  return NextResponse.json(errData, { status: upstream.status });
}
