import { NextRequest, NextResponse } from "next/server";

/**
 * Shared bankr.bot x402 proxy.
 * - Forwards X-Payment header from client → bankr.bot
 * - Safely handles empty / non-JSON responses
 * - Returns 502 on network errors
 */
export async function proxyTool(req: NextRequest, endpoint: string): Promise<NextResponse> {
  // Parse request body (optional)
  let body = "{}";
  try { body = await req.text(); } catch {}

  // Forward payment header if present
  const xPayment = req.headers.get("x-payment") ?? req.headers.get("X-Payment");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (xPayment) headers["X-Payment"] = xPayment;

  // Call upstream
  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not reach service", message: (e as Error).message },
      { status: 502 }
    );
  }

  // Safely read and parse response
  let text = "";
  try { text = await upstream.text(); } catch {}

  let data: unknown = text;
  if (text) {
    try { data = JSON.parse(text); } catch {}
  } else {
    // Empty body — synthesize minimal JSON so client doesn't crash
    data = upstream.status === 402
      ? { error: "Payment required" }
      : { error: "Empty response from service" };
  }

  return NextResponse.json(data, { status: upstream.status });
}
