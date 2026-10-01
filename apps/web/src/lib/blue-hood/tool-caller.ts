/**
 * Blue Hood — dual-mode x402 tool caller.
 *
 * The poller needs to hit x402 tools 26+ times per cycle. We support two
 * modes so localhost dev doesn't have to fight the prod internal-bypass:
 *
 *   • **local mode** (default in dev)  — import HANDLERS directly, no HTTP.
 *   • **http mode**  (set BH_TOOL_TARGET) — hit `${BH_TOOL_TARGET}/api/x402/<id>`
 *     with `X-Blue-Internal` + `X-Blue-Service: internal`. Same headers the
 *     semantic-smoke CI script uses, same headers the frontend cron will
 *     use when it wants to warm prod's cache.
 *
 * The default is local because prod itself will use local — Vercel functions
 * calling other Vercel functions over HTTP would burn extra $ + latency for
 * no gain. Http mode is there for out-of-band debugging.
 *
 * Both modes return what the tool PUBLISHES. The one reading the recorder needs
 * unpublished — M5 under the F6 quarantine — goes through `callRecorderTool`
 * below instead, which is always local.
 */

import { internalX402Headers, hasInternalKey } from "@/lib/x402-internal";

const TARGET = process.env.BH_TOOL_TARGET ?? "";
export const TOOL_CALLER_MODE: "http" | "local" = TARGET ? "http" : "local";

type ToolResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

let localHandlers: Record<string, (req: Request) => Promise<Response>> | null = null;
async function getLocalHandlers() {
  if (localHandlers) return localHandlers;
  const mod = await import("@/app/api/x402/_handlers");
  localHandlers = mod.HANDLERS;
  return localHandlers;
}

/**
 * Call an x402 tool by id and return its parsed JSON (or a normalized error).
 * Never throws — poller callers can `.map` over 26 tickers without a try/catch.
 */
export async function callTool<T = Record<string, unknown>>(
  tool: string,
  body: unknown,
  { timeoutMs = 15_000 }: { timeoutMs?: number } = {},
): Promise<ToolResult<T>> {
  try {
    if (TOOL_CALLER_MODE === "http") {
      if (!hasInternalKey()) return { ok: false, status: 500, error: "INTERNAL_SERVICE_KEY not set for http mode" };
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      const r = await fetch(`${TARGET}/api/x402/${tool}`, {
        method: "POST",
        headers: internalX402Headers(),
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      clearTimeout(t);
      const data = (await r.json().catch(() => ({}))) as T;
      if (!r.ok) return { ok: false, status: r.status, error: (data as { error?: string }).error ?? `HTTP ${r.status}` };
      return { ok: true, data };
    }

    const HANDLERS = await getLocalHandlers();
    const h = HANDLERS[tool];
    if (!h) return { ok: false, status: 503, error: `No local handler for ${tool}` };
    return await runLocal<T>(tool, h, body);
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}

// NOTE: local mode still hits real upstream data sources (GeckoTerminal,
// Chainlink RPC, etc.) — it just skips HTTP + x402 payment/bypass.
async function runLocal<T>(
  tool: string,
  h: (req: Request) => Promise<Response>,
  body: unknown,
): Promise<ToolResult<T>> {
  const req = new Request(`http://localhost/api/x402/${tool}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await h(req);
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) return { ok: false, status: res.status, error: (data as { error?: string }).error ?? `HTTP ${res.status}` };
  return { ok: true, data };
}

/**
 * Raw measurements the RECORDER needs and no door may publish unprojected (F6,
 * lib/blue-hood/quarantine.ts). `HANDLERS["rh-stock-arb"]` answers through the
 * quarantine, which withholds the DEX price, delta and verdict of any reading
 * without the pool-rate stamp — so if the stamp were ever lost, `callTool`
 * would hand the poller a snapshot with no DEX leg and the archive would stop
 * recording the numbers. The recorder takes the raw reading, stamp and all,
 * and the readers decide what to publish. The grader needs the same reading to
 * close open arrows.
 */
const RECORDER_SOURCES = {
  "rh-stock-arb": async () =>
    (await import("@/app/api/x402/_handlers/rh-stock-arb")).measureRhStockArb,
} as const;
export type RecorderSource = keyof typeof RECORDER_SOURCES;

/**
 * `callTool` for the recorder: same result shape, same never-throws contract,
 * but it runs the UNPUBLISHED measurement.
 *
 * ALWAYS LOCAL, including in http mode. The raw reading has no HTTP door by
 * design — the only route that serves this id serves the quarantined body — so
 * "fetch it from BH_TOOL_TARGET" is not a thing that can be done, and pretending
 * otherwise would silently record withheld nulls. Callers are the poller and the
 * grader, which publish nothing; scripts/rh-quarantine-check.ts asserts that no
 * route calls this.
 */
export async function callRecorderTool<T = Record<string, unknown>>(
  tool: RecorderSource,
  body: unknown,
): Promise<ToolResult<T>> {
  try {
    const h = await RECORDER_SOURCES[tool]();
    return await runLocal<T>(tool, h, body);
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}
