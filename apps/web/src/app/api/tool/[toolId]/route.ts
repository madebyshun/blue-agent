import { NextRequest, NextResponse } from "next/server";

const BASE_URL = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5";

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
  const toolUrl = `${BASE_URL}/${toolId}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (payment) headers["X-Payment"] = Buffer.from(JSON.stringify(payment)).toString("base64");

  let res: Response;
  try {
    res = await fetch(toolUrl, { method: "POST", headers, body: JSON.stringify(toolParams) });
  } catch {
    return NextResponse.json({ error: "Could not reach BlueAgent service." }, { status: 502 });
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (res.status === 402) {
    const data = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    return NextResponse.json({ requiresPayment: true, paymentDetails: data });
  }

  const data = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
  if (!res.ok) {
    return NextResponse.json({ error: typeof data === "string" ? data : JSON.stringify(data) }, { status: res.status });
  }

  return NextResponse.json({ result: typeof data === "string" ? { text: data } : data });
}
