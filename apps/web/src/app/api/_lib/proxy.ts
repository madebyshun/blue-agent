import { NextRequest, NextResponse } from "next/server";

/**
 * Pure pass-through proxy to Bankr x402 cloud.
 *
 * The browser cannot call x402.bankr.bot directly (CORS), so we relay through
 * this Next.js route. We forward the request — including the X-Payment header —
 * verbatim to Bankr, and return Bankr's response verbatim.
 *
 * Bankr is the resource server AND facilitator: it verifies the payment,
 * settles USDC on-chain (charging the user), runs the tool, and returns the
 * result. We do NOT run anything locally and do NOT settle ourselves — that
 * would serve results without collecting payment.
 *
 * The `fallback` parameter is accepted for call-site compatibility but is
 * intentionally NOT used: every paid request must go through Bankr so the
 * user is actually charged.
 */
export async function proxyTool(
  req: NextRequest,
  endpoint: string,
  _fallback?: (body: Record<string, unknown>) => Promise<NextResponse>
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
      signal:  AbortSignal.timeout(110_000),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Bankr cloud unreachable", message: (e as Error).message },
      { status: 502 }
    );
  }

  // Relay Bankr's response verbatim (status + body + settlement receipt header).
  const text = await upstream.text();
  const respHeaders: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") ?? "application/json",
  };
  const settleReceipt =
    upstream.headers.get("x-payment-response") ?? upstream.headers.get("X-Payment-Response");
  if (settleReceipt) respHeaders["X-Payment-Response"] = settleReceipt;

  return new NextResponse(text, { status: upstream.status, headers: respHeaders });
}
