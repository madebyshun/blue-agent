import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";

/**
 * Shared bankr.bot x402 proxy.
 *
 * Routing logic:
 *   - No X-Payment + fallback provided → run locally via Bankr LLM (no payment gate)
 *   - No X-Payment + no fallback       → proxy to bankr.bot (returns 402 if unpaid)
 *   - X-Payment present                → forward to bankr.bot for payment verification
 *   - bankr.bot 5xx                    → use fallback if provided
 *   - Network error                    → use fallback if provided
 */
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

  // ── Forward to bankr.bot (with or without X-Payment) ─────────────────────
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
    if (fallback) {
      console.warn(`[proxy] network error on ${endpoint}, using fallback`);
      return fallback(body);
    }
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

  // Any non-2xx error from Bankr handler — use fallback if provided
  if (!upstream.ok && fallback) {
    console.warn(`[proxy] upstream ${endpoint} → ${upstream.status}, using fallback`);
    return fallback(body);
  }

  const ct = upstream.headers.get("content-type") ?? "";
  const data = ct.includes("application/json")
    ? await upstream.json().catch(() => ({ error: "Failed to parse response" }))
    : await upstream.text().catch(() => "");

  // Bankr returned 200 but with an error body — fall back to local pipeline
  if (upstream.ok && fallback && typeof data === "object" && data !== null && "error" in (data as object)) {
    console.warn(`[proxy] upstream ${endpoint} → 200 but error body, using fallback:`, (data as Record<string,unknown>).error);
    return fallback(body);
  }

  if (!upstream.ok) {
    console.error(`[proxy] upstream ${endpoint} → ${upstream.status}:`, JSON.stringify(data));
  }

  return NextResponse.json(data, { status: upstream.status });
}
