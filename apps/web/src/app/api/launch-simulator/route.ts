import { NextRequest, NextResponse } from "next/server";

const TREASURY = "0xf31f59e7b8b58555f7871f71973a394c8f1bffe5";

const TIER_ENDPOINTS: Record<string, string> = {
  standard: `https://x402.bankr.bot/${TREASURY}/launch-simulator`,
  deep:     `https://x402.bankr.bot/${TREASURY}/launch-simulator-2`,
  ultra:    `https://x402.bankr.bot/${TREASURY}/launch-simulator-3`,
};

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const tier = (body.tier as string) ?? "standard";
  const endpoint = TIER_ENDPOINTS[tier] ?? TIER_ENDPOINTS.standard;
  const xPayment = req.headers.get("x-payment") ?? req.headers.get("X-Payment");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (xPayment) headers["X-Payment"] = xPayment;

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
  } catch (e) {
    return NextResponse.json({ error: "Could not reach simulation service", message: (e as Error).message }, { status: 502 });
  }

  const ct = upstream.headers.get("content-type") ?? "application/json";
  const data = ct.includes("application/json") ? await upstream.json() : await upstream.text();
  return NextResponse.json(data, { status: upstream.status });
}
