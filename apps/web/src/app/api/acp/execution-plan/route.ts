/**
 * ACP wrapper: Blue Hood EXECUTION PLAN (Offering #1).
 *
 * Public GET, ACP-shaped. Given `?ticker=&size_usd=` it returns a Blue Hood
 * execution plan (deepest pool + slippage estimate + split + route) computed
 * live from RH-Chain pool data — see `lib/blue-hood/execution-plan.ts`.
 *
 * WHY FREE-AT-THE-URL: like the other `/api/acp/*` endpoints, the HTTP layer
 * carries no paywall. Monetisation for Offering #1 is the ACP job/escrow layer
 * (built once the seller-adapter shape is confirmed with Virtuals) — the ACP
 * adapter is the sanctioned caller and gates on funded escrow. Exposing the
 * compute here now gives us the exact shape the adapter will call plus a URL to
 * self-test from outside (a graduation requirement).
 *
 * ── Anti-ungraduation guarantees enforced HERE ───────────────────────────────
 *   • REJECT-INCOMPLETE, immediately: missing/blank params → 400 with a clear,
 *     structured error. Never let a malformed request run then expire.
 *   • DECLINE, don't hang: the compute is raced against an INTERNAL deadline
 *     (< any ACP SLA). If live data is slow (GeckoTerminal 429/backoff) we
 *     return 503 "temporarily unavailable" — the job is declined with NO charge
 *     rather than left to time out.
 *   • The engine health-gate is deliberately NOT applied: this plan reads pools
 *     LIVE from GeckoTerminal, independent of the KV snapshot poller, so gating
 *     on `computeEngineHealth()` would cause FALSE declines when an unrelated KV
 *     throttle is up. The real dependency-gate ("did live pool data come back")
 *     lives in `computeExecutionPlan` → `no_market_data` decline.
 */
import { acpEnvelope, clientIp, corsHeaders, preflight, rateLimit } from "@/lib/acp";
import { computeExecutionPlan, type ExecPlanResult } from "@/lib/blue-hood/execution-plan";
// The SAME normalisers the paid ACP job path uses. This URL is what a buyer
// self-tests against before escrowing, so it must refuse exactly what the paid
// path refuses — see `lib/blue-hood/acp-requirement.ts`.
import { readRequirement } from "@/lib/blue-hood/acp-requirement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCS = "https://blueagent.dev/hood";
// Internal deadline. Must sit UNDER any ACP job SLA so we proactively decline
// instead of letting a job expire. GeckoTerminal's worst-case backoff can run
// long; 12s bounds our wait without cutting off a normal (~1–3s) read.
const INTERNAL_DEADLINE_MS = 12_000;

type Timeout = { __timeout: true };
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | Timeout> {
  return Promise.race([
    p,
    new Promise<Timeout>((res) => setTimeout(() => res({ __timeout: true }), ms)),
  ]);
}

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: Request) {
  const rl = rateLimit(clientIp(req));
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited", retry_after_s: rl.retry_after_s },
      { status: 429, headers: { ...corsHeaders(), "Retry-After": String(rl.retry_after_s) } },
    );
  }

  const url = new URL(req.url);
  // Same alias table as the paid path (REQUIREMENT_KEYS), so a buyer who
  // self-tests here with `chain_id` / `action` gets the answer the paid job
  // would give rather than a confident plan for the wrong desk.
  const req0 = readRequirement((k) => url.searchParams.get(k));
  const ticker = req0.ticker;
  const hasSize = Number.isFinite(req0.size_usd);
  const chain = req0.chain;
  const side = req0.side;

  // ── Reject-incomplete FAST — before any compute or network ───────────────
  if (!ticker || !hasSize) {
    return Response.json(
      acpEnvelope(
        {
          ok: false,
          error: "missing_input",
          reason: "Both `ticker` and `size_usd` are required.",
          hint: "e.g. /api/acp/execution-plan?ticker=TSLA&size_usd=100000",
        },
        DOCS,
      ),
      { status: 400, headers: corsHeaders() },
    );
  }
  const size = req0.size_usd;
  if (!Number.isFinite(size) || size <= 0) {
    return Response.json(
      acpEnvelope(
        {
          ok: false,
          error: "invalid_size",
          reason: "`size_usd` must be a positive number.",
          hint: "e.g. size_usd=100000 for a $100k order.",
        },
        DOCS,
      ),
      { status: 400, headers: corsHeaders() },
    );
  }

  // ── Wrong desk / unreadable side: refuse, exactly as the paid path does ───
  // A ticker string does not identify a token. NVDA, META, GOOGL and TSLA exist
  // on BOTH Robinhood Chain (4663) and Base (8453), and this desk prices only
  // RH. Answering a Base request off RH data is a wrong answer, not a near miss,
  // and this URL is where a buyer forms their expectations before paying.
  if (chain !== "robinhood") {
    return Response.json(
      acpEnvelope(
        {
          ok: false,
          error: "unsupported_chain",
          reason:
            `Offering #1 covers Robinhood Chain (4663) only. "${ticker}" may also exist ` +
            `on Base (8453), and this desk cannot price that token.`,
          hint: "Omit `chain`, or send chain=robinhood.",
        },
        DOCS,
      ),
      { status: 400, headers: corsHeaders() },
    );
  }
  // `"unknown"` means unreadable, never "assume buy" — the engine coerces any
  // non-"sell" value to a buy, so defaulting here would hand someone who typed
  // "short" a buy plan stamped as what they asked for.
  if (side === "unknown") {
    return Response.json(
      acpEnvelope(
        {
          ok: false,
          error: "unsupported_side",
          reason: `Send "buy" or "sell".`,
          hint: "Omit `side` for a buy.",
        },
        DOCS,
      ),
      { status: 400, headers: corsHeaders() },
    );
  }

  // ── Compute, bounded by the internal deadline (never hang) ────────────────
  const raced = await withDeadline(
    computeExecutionPlan({ ticker, size_usd: size, side }),
    INTERNAL_DEADLINE_MS,
  );
  if ("__timeout" in raced) {
    return Response.json(
      acpEnvelope(
        {
          ok: false,
          error: "temporarily_unavailable",
          reason: `Market data did not return within ${INTERNAL_DEADLINE_MS}ms — job declined, no charge. Retry shortly.`,
        },
        DOCS,
      ),
      { status: 503, headers: corsHeaders() },
    );
  }

  const result = raced as ExecPlanResult;
  if (result.ok === false) {
    // reject = bad input (400, caller fixes it); decline = market unreadable
    // (503, retry later, no charge). Distinct so a buyer/adapter can tell "my
    // fault" from "come back later".
    const status = result.kind === "reject" ? 400 : 503;
    return Response.json(acpEnvelope(result, DOCS), { status, headers: corsHeaders() });
  }

  // Name the desk, like the paid deliverable does (`buildDeliverable`, which
  // stamps chain/chain_id for the same reason). Depth, slippage and a route are
  // meaningless without the chain they were measured on, and this was the one
  // receipt of the two that omitted it — the surface a buyer reads FIRST.
  return Response.json(
    acpEnvelope({ ...result, chain: "robinhood", chain_id: 4663 }, DOCS),
    { status: 200, headers: corsHeaders() },
  );
}
