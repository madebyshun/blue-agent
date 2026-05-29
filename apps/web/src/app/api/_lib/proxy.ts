import { NextRequest, NextResponse } from "next/server";

// Bankr's own facilitator — relays gas + settles USDC to Bankr's payTo wallet.
// (Discovered from the `facilitator` field in Bankr's 402 discovery response.)
const FACILITATOR = "https://api.bankr.bot/facilitator";
const USDC        = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/**
 * Decode X-Payment header and settle USDC on-chain via facilitator.
 * AWAITED (not fire-and-forget) so the on-chain transferWithAuthorization
 * actually completes before the serverless function returns — otherwise
 * Vercel freezes the lambda and the settle never runs.
 * Returns a status object that callers surface in the response for visibility.
 */
async function settlePayment(
  xPayment: string,
  endpoint: string
): Promise<{ ok: boolean; detail: unknown }> {
  try {
    const payment = JSON.parse(Buffer.from(xPayment, "base64").toString("utf-8"));
    const auth = payment?.payload?.authorization as Record<string, string> | undefined;
    if (!auth?.to || !auth?.value || !auth?.from) {
      return { ok: false, detail: "missing authorization fields" };
    }

    const toolName = endpoint.split("/").pop() ?? "tool";
    // Mirror Bankr's 402 discovery requirement shape exactly (maxTimeoutSeconds 60,
    // empty mimeType) so its facilitator accepts the settle.
    const requirement = {
      scheme:            "exact",
      network:           "eip155:8453",
      maxAmountRequired: auth.value,
      amount:            auth.value,
      payTo:             auth.to,
      asset:             USDC,
      maxTimeoutSeconds: 60,
      resource:          endpoint,
      description:       `Blue Agent: ${toolName}`,
      mimeType:          "",
      extra:             { name: "USD Coin", version: "2" },
    };

    // Bankr's facilitator speaks x402 v1 (its error echoed x402Version:1).
    // The EIP-3009 signature is over the authorization typed-data only, so
    // changing the envelope version does NOT invalidate it.
    const paymentV1 = { ...payment, x402Version: 1 };
    const requirementV1 = { ...requirement };

    const res = await fetch(`${FACILITATOR}/settle`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        x402Version:         1,
        paymentPayload:      paymentV1,
        paymentRequirements: requirementV1,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const detail = await res.json().catch(async () => (await res.text()).slice(0, 200));
    console.log(`[proxy] settle ${res.status}:`, JSON.stringify(detail));
    return { ok: res.ok, detail };
  } catch (e) {
    console.error("[proxy] settle error:", (e as Error).message);
    return { ok: false, detail: (e as Error).message };
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

  // Run local fallback AND settle USDC in parallel, then return merged result.
  // settle is AWAITED so the on-chain transfer completes before we respond
  // (Vercel freezes the lambda once the response is sent).
  const localWithSettle = async (): Promise<NextResponse> => {
    if (!xPayment || !fallback) {
      return NextResponse.json({ error: "Payment Required", message: "This tool requires payment." }, { status: 402 });
    }
    const [resp, settle] = await Promise.all([
      fallback(body).catch((fe: Error) =>
        NextResponse.json({ error: "Tool error", message: fe.message }, { status: 500 })
      ),
      settlePayment(xPayment, endpoint),
    ]);
    const rd = await resp.json().catch(() => null);
    return NextResponse.json(
      { ...(rd ?? {}), _settle: settle },
      { status: settle.ok ? 200 : resp.status }
    );
  };

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
    if (xPayment && fallback) return await localWithSettle();
    return NextResponse.json({ error: "Service unavailable", message: (e as Error).message }, { status: 502 });
  }

  // 200 — check if Bankr handler actually ran or returned an "unavailable" error
  if (upstream.ok) {
    const data = await upstream.json().catch(() => ({ error: "Failed to parse response" }));
    const isUnavailable = typeof data.error === "string" &&
      (data.error.includes("unavailable") || data.error.includes("Endpoint"));
    if (isUnavailable && fallback) {
      console.warn("[proxy] Bankr handler unavailable → local fallback + settle");
      return await localWithSettle();
    }
    return NextResponse.json(data);
  }

  // 402 — pass through (payment required or invalid)
  if (upstream.status === 402) {
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: 402 });
  }

  // 5xx — Bankr handler broken → local fallback + settle if payment sent
  if (upstream.status >= 500 && fallback) {
    console.warn(`[proxy] Bankr ${upstream.status} → local fallback + settle`);
    return await localWithSettle();
  }

  // Other errors — pass through
  const errData = await upstream.json().catch(() => ({}));
  return NextResponse.json(errData, { status: upstream.status });
}
