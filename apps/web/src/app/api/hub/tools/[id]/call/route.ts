/**
 * /api/hub/tools/[id]/call — proxy a call to a builder's endpoint.
 *
 * Phase 3 MVP: free proxy that forwards the request body, returns the
 * response, and increments the lifetime call counter. Payment + revenue
 * split (Phase 4) will plug in here once the splitter contract is live.
 *
 * Until then, builders that price their tools above $0 should require
 * payment on their own endpoint (we forward the X-Payment header).
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import { getRegisteredTool, incrCallCount, addRevenue } from "@/lib/hub-registry";
import { kv } from "@/lib/kv";

export const runtime = "nodejs";

const BUILDER_SHARE_BPS  = 8000;    // 80%
const TREASURY_SHARE_BPS = 2000;    // 20%

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { success } = await rateLimit(getIdentifier(req), "api");
  if (!success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const tool = await getRegisteredTool(id);
  if (!tool) return NextResponse.json({ error: "Tool not found" }, { status: 404 });

  let body: unknown = {};
  try { body = await req.json(); } catch { /* allow empty body */ }

  // Forward to builder's endpoint
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const xPayment = req.headers.get("x-payment");
  if (xPayment) headers["X-Payment"] = xPayment;

  let upstream: Response;
  try {
    upstream = await fetch(tool.endpoint, {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(90_000),
    });
  } catch (e) {
    return NextResponse.json({
      error: "Upstream call failed",
      detail: (e as Error).message,
    }, { status: 502 });
  }

  const data = await upstream.text();

  // Track the call regardless of upstream status (mirrors usage:<id> counter
  // that powers Hub Featured ranking).
  try { await kv.incr(`usage:${id}`); } catch {}
  await incrCallCount(id);

  // If upstream succeeded AND tool has a price, credit the builder's share
  // (Phase 3: bookkeeping only; no funds move until Phase 4 splitter).
  if (upstream.ok && tool.priceUSDC > 0) {
    const builderShare = Math.floor((tool.priceUSDC * BUILDER_SHARE_BPS) / 10_000);
    await addRevenue(id, builderShare);
  }

  // Pass through content-type + status so the client sees the real response shape.
  const contentType = upstream.headers.get("content-type") ?? "application/json";
  return new NextResponse(data, {
    status:  upstream.status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Blue-Hub-Tool": id,
      "X-Blue-Hub-Builder-Share-Bps": String(BUILDER_SHARE_BPS),
      "X-Blue-Hub-Treasury-Share-Bps": String(TREASURY_SHARE_BPS),
    },
  });
}
