import { NextRequest, NextResponse } from "next/server";

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/token-pick-signal";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  const xPayment = req.headers.get("x-payment") ?? req.headers.get("X-Payment");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (xPayment) headers["X-Payment"] = xPayment;

  let upstream: Response;
  try {
    upstream = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
  } catch (e) {
    return NextResponse.json({ error: "Could not reach service", message: (e as Error).message }, { status: 502 });
  }

  const ct = upstream.headers.get("content-type") ?? "application/json";
  const data = ct.includes("application/json") ? await upstream.json() : await upstream.text();
  return NextResponse.json(data, { status: upstream.status });
}
