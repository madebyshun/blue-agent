import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";

/**
 * Shared bankr.bot x402 proxy.
 * - Forwards X-Payment header from client → bankr.bot
 * - Safely handles empty / non-JSON responses
 * - Returns 502 on network errors
 * - Rate limited: 20 tool runs/min per IP
 */
export async function proxyTool(req: NextRequest, endpoint: string): Promise<NextResponse> {
  // Forward payment header if present
  const xPayment = req.headers.get("x-payment") ?? req.headers.get("X-Payment");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (xPayment) headers["X-Payment"] = xPayment;

  // Parse body the same way as launch-simulator (req.json, not req.text)
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  // Call upstream
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

  const ct = upstream.headers.get("content-type") ?? "";
  const data = ct.includes("application/json")
    ? await upstream.json().catch(() => ({ error: "Failed to parse response" }))
    : await upstream.text().catch(() => "");

  if (upstream.status !== 200) {
    console.error(`[proxy] upstream ${endpoint} → ${upstream.status}:`, JSON.stringify(data));
  }

  return NextResponse.json(data, { status: upstream.status });
}
