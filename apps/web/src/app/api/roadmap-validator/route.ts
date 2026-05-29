import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/roadmap-validator";

export async function POST(req: NextRequest) {
  const xPayment = req.headers.get("x-payment") ?? req.headers.get("X-Payment");
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (xPayment) headers["X-Payment"] = xPayment;

  try {
    const res = await fetch(ENDPOINT, {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(55_000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ error: "Service unavailable", message: (e as Error).message }, { status: 502 });
  }
}
