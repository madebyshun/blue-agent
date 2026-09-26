/**
 * /api/hub/tools/[id]/call — proxy a call to a builder's endpoint.
 *
 * A pass-through, deliberately: it forwards the body, forwards the caller's
 * X-Payment header UNCHANGED, returns the builder's response verbatim, and
 * counts the call. It does not verify payment and it does not settle. The
 * builder's own endpoint does both, against the builder's own wallet.
 *
 * ── THE SPLIT IS 100/0, AND THAT IS A CONSEQUENCE, NOT A POLICY CHOICE ──────
 * EIP-3009 `transferWithAuthorization` settles to exactly ONE recipient. There
 * is no on-chain fan-out, so the payee IS the split. For an external tool the
 * payee has to be the builder — that is the address their verifier checks — so
 * the user's single signature pays them 100% and nothing routes through Blue.
 *
 * 🔴 These constants read 9500/500 until 2026-09-26 and were fiction in the
 * direction that costs someone money: they were pure bookkeeping (no splitter
 * contract has ever existed, and no code anywhere pays an accrual out), yet
 * they were published in two places a third party reads as a promise — the
 * X-Blue-Hub-*-Share-Bps response headers below, and `splitPct: 95` on the
 * builder dashboard. A builder could reasonably have believed Blue was holding
 * 95% of their revenue for them. Blue was holding nothing, because Blue never
 * received anything: the same commit that fixed the payee proved the old flow
 * signed the Blue treasury and the builder's verifier refused every attempt
 * (desk-x402-block: callCount 2, revenueTotal 0).
 *
 * Do NOT restore a non-zero treasury cut here as a one-line constant edit. A
 * cut Blue actually collects needs a mechanism — either a second authorization
 * (two wallet signatures per call) or Blue receiving the money and paying the
 * builder later, which is CUSTODY of a third party's funds and ShunTr's call.
 * Editing the number without one of those changes the claim and not the money,
 * which is exactly the bug this paragraph exists to record. Pinned by
 * `scripts/external-payee-check.ts`.
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import { getRegisteredTool, incrCallCount, addRevenue } from "@/lib/hub-registry";
import { kv } from "@/lib/kv";
import { recordCall } from "@/lib/usage-daily";

export const runtime = "nodejs";

/** 100% — the builder's endpoint is the payee, so the user's one signature
 *  pays them in full. See the 🔴 block above before changing this. */
const BUILDER_SHARE_BPS  = 10_000;
/** 0% — Blue is not in the settlement path for external tools and cannot take
 *  a cut without a mechanism that does not exist yet. */
const TREASURY_SHARE_BPS = 0;

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

  // 🔴 An unpaid request that comes back 402 is the Hub ASKING HOW TO PAY, not a
  // use of the tool, and it must not be counted as one.
  //
  // This became load-bearing the moment the Hub started resolving the payee from
  // the builder's live 402: one click now sends two requests through here, a
  // discovery probe and then the paid call. Counting both made every external
  // tool's public call count and its `usage:<id>` ranking weight ~2× a hosted
  // tool's for the same amount of real use — and `usage:<id>` is what orders Hub
  // Featured, so the inflation was not cosmetic. MEASURED on desk-x402-block the
  // day the payee fix shipped: callCount 3, revenueTotal 0. Not one of those
  // three was a use; they were failed or unpaid attempts.
  //
  // The condition is `!xPayment && 402` and not the simpler `!xPayment`, because
  // a genuinely free external tool ($0) is called with no payment and answers
  // 2xx — that IS a use. And an endpoint that 503s an unpaid probe is a real
  // attempted use that failed, which `recordCall` should still see as "err",
  // otherwise a down tool looks idle instead of broken.
  const isDiscovery = !xPayment && upstream.status === 402;
  if (!isDiscovery) {
    try { await kv.incr(`usage:${id}`); } catch {}
    await incrCallCount(id);
    // Same call with surface + day + outcome kept apart. `usage:<id>` above is
    // written by three surfaces into one integer; this is the one that can answer
    // "was this the Hub runner or a paying agent?". See lib/usage-daily.ts.
    await recordCall(id, "hub", upstream.ok ? "ok" : "err");
  }

  // A successful paid call means the builder was paid DIRECTLY, by the caller's
  // own authorization, to the builder's own wallet. So this is not an accrual
  // Blue owes anyone — it is an estimate of gross volume the builder has already
  // received, kept so their dashboard can show a total. It is an estimate and
  // not a measurement because it multiplies the LISTED price by successful
  // forwards; the amount actually signed comes from the builder's live 402 and
  // can be lower. Never present it as a balance, and never pay out from it.
  if (upstream.ok && tool.priceUSDC > 0) {
    await addRevenue(id, Math.floor((tool.priceUSDC * BUILDER_SHARE_BPS) / 10_000));
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
