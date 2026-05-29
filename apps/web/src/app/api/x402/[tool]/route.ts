/**
 * Generic x402 relay → Bankr cloud.
 *
 * The browser cannot call x402.bankr.bot directly: Bankr's CORS preflight
 * (OPTIONS) returns 404, which browsers treat as a failed preflight for any
 * request carrying the custom X-Payment header. This one thin route is the
 * only shim we need — it forwards the request verbatim to Bankr and returns
 * Bankr's response verbatim. Bankr verifies payment, settles USDC (charges
 * the user), runs the handler, and returns the result.
 *
 * No local compute, no local settlement. One route replaces 72 per-tool
 * proxy routes plus all the fallback/settle complexity.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

// Bankr Club account agent wallet — endpoints + earnings live here.
const AGENT = "0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool } = await params;
  const xPayment = req.headers.get("x-payment") ?? req.headers.get("X-Payment");

  let body = "";
  try { body = await req.text(); } catch {}

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (xPayment) headers["X-Payment"] = xPayment;

  let upstream: Response;
  try {
    upstream = await fetch(`https://x402.bankr.bot/${AGENT}/${tool}`, {
      method:  "POST",
      headers,
      body:    body || "{}",
      signal:  AbortSignal.timeout(110_000),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Bankr cloud unreachable", message: (e as Error).message },
      { status: 502 }
    );
  }

  const text = await upstream.text();
  const respHeaders: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") ?? "application/json",
  };
  const receipt =
    upstream.headers.get("x-payment-response") ?? upstream.headers.get("X-Payment-Response");
  if (receipt) respHeaders["X-Payment-Response"] = receipt;

  return new NextResponse(text, { status: upstream.status, headers: respHeaders });
}
