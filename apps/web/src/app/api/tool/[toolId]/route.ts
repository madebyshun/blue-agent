import { NextRequest, NextResponse } from "next/server";

const BANKR_BASE = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f";
// Mac Mini tunnel — fallback when Bankr Lambda is unavailable
const TUNNEL_BASE = process.env.TUNNEL_BASE_URL ?? "";

type PaymentPayload = {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
};

async function callTunnel(toolId: string, toolParams: Record<string, unknown>): Promise<NextResponse | null> {
  if (!TUNNEL_BASE) return null;
  try {
    const res = await fetch(`${TUNNEL_BASE}/${toolId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toolParams),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    console.info(`[tool/${toolId}] tunnel 200 OK`);
    return NextResponse.json({ result: data });
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ toolId: string }> }) {
  const { toolId } = await params;
  let body: { toolParams?: Record<string, string>; payment?: PaymentPayload } = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const toolParams = body.toolParams ?? {};
  const payment = body.payment;
  const bankrUrl = `${BANKR_BASE}/${toolId}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (payment) headers["X-Payment"] = Buffer.from(JSON.stringify(payment)).toString("base64");

  let res: Response;
  try {
    res = await fetch(bankrUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(toolParams),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    // Bankr unreachable — if we have payment, try tunnel directly
    if (payment) {
      const tunnelResult = await callTunnel(toolId, toolParams);
      if (tunnelResult) return tunnelResult;
    }
    return NextResponse.json({ error: "Could not reach BlueAgent service." }, { status: 502 });
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  // 402 — payment required, return requirements to client
  if (res.status === 402) {
    const data = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    return NextResponse.json({ requiresPayment: true, paymentDetails: data });
  }

  // Bankr handler broken (Lambda unavailable) — fall back to tunnel
  if (!res.ok && payment) {
    console.warn(`[tool/${toolId}] Bankr → ${res.status}, trying tunnel fallback`);
    const tunnelResult = await callTunnel(toolId, toolParams);
    if (tunnelResult) return tunnelResult;
  }

  const data = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
  if (!res.ok) {
    return NextResponse.json({ error: typeof data === "string" ? data : JSON.stringify(data) }, { status: res.status });
  }

  return NextResponse.json({ result: typeof data === "string" ? { text: data } : data });
}
