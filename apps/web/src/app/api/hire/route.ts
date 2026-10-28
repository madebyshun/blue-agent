/**
 * POST /api/hire — call ANOTHER seller's x402 service for a Blue Agent user
 * (the Hire Agent modal on /exchange). Two steps, same route:
 *
 *   {payTo, url, input}               → we call the seller UNPAID and return its
 *                                       402 quote, so the browser can show the
 *                                       price and payee before anything is signed;
 *   {payTo, url, input, payment}      → we forward the user's own signed payment
 *                                       to the seller and return its answer.
 *
 * Blue Agent never signs, never settles and never holds anything here: the user's
 * wallet signs one EIP-3009 authorization to the SELLER's payTo, and the seller's
 * facilitator settles it. We only carry the request because browsers cannot call
 * most sellers directly (CORS).
 *
 * The only URLs this route will call are the seller's own resources from our
 * Bazaar index (readProviderDetail) — https, listed under that exact payTo — so
 * it is not an open proxy. Answers are capped at 200 KB.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readProviderDetail } from "@/lib/hub/exchange";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_BODY = 200_000;
const hits = new Map<string, { at: number; n: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 60_000) { hits.set(ip, { at: now, n: 1 }); return false; }
  h.n++;
  return h.n > 20;
}

function decodeHeader(v: string | null): unknown {
  if (!v) return null;
  try { return JSON.parse(Buffer.from(v, "base64").toString("utf8")); } catch { return null; }
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (limited(ip)) return NextResponse.json({ error: "Too many requests; wait a minute." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { payTo?: string; url?: string; input?: unknown; payment?: string };
  const payTo = String(b.payTo ?? "").toLowerCase();
  const url = String(b.url ?? "");
  if (!/^0x[0-9a-f]{40}$/.test(payTo)) return NextResponse.json({ error: "payTo must be a 0x address." }, { status: 400 });
  const detail = await readProviderDetail(payTo);
  const res = detail?.resources.find((r) => r.url === url);
  if (!res || !/^https:\/\//.test(url)) return NextResponse.json({ error: "That service is not in this seller's listing." }, { status: 404 });

  const method = res.method === "GET" ? "GET" : "POST";
  const input = b.input && typeof b.input === "object" ? (b.input as Record<string, unknown>) : {};
  let target = url;
  if (method === "GET" && Object.keys(input).length) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(input)) u.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
    target = u.toString();
  }
  const headers: Record<string, string> = { accept: "application/json" };
  if (method === "POST") headers["content-type"] = "application/json";
  if (typeof b.payment === "string" && b.payment) {
    headers["x-payment"] = b.payment;            // x402 v1 name, still read by most sellers
    headers["payment-signature"] = b.payment;    // x402 v2 name
  }
  let r: Response;
  try {
    r = await fetch(target, { method, headers, body: method === "POST" ? JSON.stringify(input) : undefined, signal: AbortSignal.timeout(45_000), redirect: "manual", cache: "no-store" });
  } catch (e) {
    return NextResponse.json({ error: `The seller did not answer (${(e as Error).message.slice(0, 80)}).`, paid: b.payment ? "unknown" : false }, { status: 502 });
  }
  const text = (await r.text().catch(() => "")).slice(0, MAX_BODY);
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* not JSON: keep text */ }
  const quoteHeader = decodeHeader(r.headers.get("payment-required"));
  const receipt = decodeHeader(r.headers.get("payment-response") ?? r.headers.get("x-payment-response"));
  return NextResponse.json({
    status: r.status,
    quote: r.status === 402 ? (body && typeof body === "object" && "accepts" in (body as object) ? body : quoteHeader) : null,
    body: r.status === 402 ? null : body,
    receipt,
    sellerSettles: true,
  });
}
