/**
 * Blue Hood — LLM chain health probe.
 *
 * T-A.1 #3. One cheap `callLLM` call, returns the attempts trace + the
 * first provider that succeeded (or null if all failed). Blue Hood smoke
 * asserts `first_success_provider !== null` so a broken chain (e.g.
 * banned Bankr / stale Venice key) doesn't ship silently. Local surfacing
 * of this failure is the whole point — reviewer's ask.
 *
 * Auth: `X-Blue-Internal` bypass (same header the poller uses), so a
 * public caller can never poll our LLM providers on our dime.
 */
import { NextRequest, NextResponse } from "next/server";
import { callLLM, VIRTUALS_DEFAULT_MODEL } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? "";

function isAuthorized(req: NextRequest): boolean {
  const xInternal = req.headers.get("x-blue-internal") ?? req.headers.get("X-Blue-Internal");
  if (INTERNAL_KEY) return xInternal === INTERNAL_KEY;
  // Local dev without a key: allow so smoke works out of the box.
  return process.env.NODE_ENV !== "production";
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  // Trivial prompt — we're pinging health, not generating anything.
  const opts = {
    system: "Reply with a single word: ok.",
    user: "ping",
    temperature: 0,
    maxTokens: 4,
    // No web-search — cheapest and fastest across providers.
    webSearch: false,
  };
  // Which models the chain will try. Surfaced so a probe response is
  // self-diagnosing — removes the "which model was that?" guesswork
  // that let the Virtuals model-string bug survive 4 CI runs.
  const models = {
    virtuals: process.env.VIRTUALS_MODEL ?? VIRTUALS_DEFAULT_MODEL,
    venice:   process.env.VENICE_MODEL   ?? "llama-3.3-70b",
    bankr:    "(bankr default)",
  };
  try {
    const r = await callLLM(opts);
    return NextResponse.json(
      {
        ok: true,
        first_success_provider: r.provider,
        first_success_model:
          r.provider === "virtuals" ? models.virtuals :
          r.provider === "venice"   ? models.venice :
          r.provider === "bankr"    ? models.bankr :
          null,
        attempts: r.attempts,
        models,
        chain_duration_ms: Date.now() - started,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (e) {
    const err = e as Error & { attempts?: unknown };
    return NextResponse.json(
      {
        ok: false,
        first_success_provider: null,
        attempts: Array.isArray(err.attempts) ? err.attempts : [],
        models,
        error: err.message,
        chain_duration_ms: Date.now() - started,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" }, status: 200 },
    );
  }
}
