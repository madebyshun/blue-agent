import { NextRequest, NextResponse } from "next/server";

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/blue-debug";

export async function POST(req: NextRequest) {
  const xPayment = req.headers.get("x-payment");
  const body = await req.text();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (xPayment) headers["X-Payment"] = xPayment;

  let upstreamStatus = 0;
  let upstreamBody = "";
  let upstreamHeaders: Record<string, string> = {};

  try {
    const upstream = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: body || "{}",
      signal: AbortSignal.timeout(30000),
    });
    upstreamStatus = upstream.status;
    upstreamBody = await upstream.text();
    upstream.headers.forEach((v, k) => { upstreamHeaders[k] = v; });
  } catch (e) {
    return NextResponse.json({ error: "fetch_failed", message: (e as Error).message });
  }

  return NextResponse.json({
    received: {
      has_x_payment: !!xPayment,
      x_payment_length: xPayment?.length ?? 0,
      x_payment_preview: xPayment?.slice(0, 50),
      body_preview: body.slice(0, 100),
    },
    bankr_response: {
      status: upstreamStatus,
      body: upstreamBody.slice(0, 500),
      headers: upstreamHeaders,
    },
  });
}
