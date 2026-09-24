/**
 * Which tool was called, from WHERE, on WHICH day, and did it work.
 *
 * WHY THIS EXISTS
 * ---------------
 * `usage:<id>` already counts tool runs, and several surfaces read it (/api/usage,
 * /api/stats, the Hub tool cards, the builder dashboard). It is a good counter and
 * this module does not replace it. But it collapses three things the catalog needs
 * kept apart, and the collapse is why "which tools do people actually use?" has
 * been unanswerable:
 *
 *   SURFACE — `usage:<id>` is incremented by the paid x402 route, by the free MCP
 *             bypass, and by /api/hub/tools/<id>/call, into the SAME integer. So a
 *             tool with 40 runs might be 40 paid calls or 40 free MCP calls, and
 *             those imply opposite decisions. MEASURED 2026-09-24: /api/mcp is
 *             public, unauthenticated and CORS-open, and calls the x402 route with
 *             `internalX402Headers()` — no payment, no `X-Blue-User`. It is
 *             plausibly the surface with the most real traffic and it is exactly
 *             the one the aggregate cannot isolate.
 *
 *   TIME    — it is a forward-only lifetime total. "111 tools, N runs" cannot tell
 *             you whether a tool was used last week or once in May. Trend is the
 *             whole question when deciding what to deepen and what to retire.
 *
 *   OUTCOME — the MCP path increments only AFTER a 2xx, so a tool that is called
 *             constantly and fails every time reads as a tool nobody calls. That
 *             is the single most misleading shape in the data: demand exists and
 *             the number says it does not.
 *
 * DELIBERATELY NOT COLLECTED
 * --------------------------
 * No wallet, no IP, no arguments, no prompt text, no user identifier of any kind.
 * The field key is `<surface>|<tool>|<outcome>` and nothing else, so this can
 * never become a per-user behaviour log. Counting which TOOL is popular does not
 * require knowing WHO called it, and the cheapest way to keep that promise is to
 * have no field to put it in.
 *
 * COST
 * ----
 * Upstash bills per command, and an Upstash budget overrun is what unscheduled
 * the research-loop cron (#148), so the shape here is chosen for command count,
 * not convenience:
 *
 *   write — exactly ONE `HINCRBY` per tool call, on top of the existing
 *           `usage:<id>` `INCR`. A flat key per (tool, surface, day) would cost
 *           the same to write but would make reads impossible: there is no SCAN
 *           in our KV client, so a reader would have to construct and GET
 *           111 tools × 4 surfaces × 14 days ≈ 6k keys for one report.
 *   read  — ONE `HGETALL` per day. A 14-day report is 14 commands.
 *   TTL   — `RETENTION_DAYS`, set lazily (see `expirySet`) so it costs ~1 extra
 *           command per serverless instance per day rather than one per call.
 *
 * Both functions swallow their errors. A metering failure must never turn into a
 * failed tool call — the counter is the least important thing in the request.
 */
import { kv } from "@/lib/kv";

/**
 * Where the call came in. Keep this list closed and short: it is the dimension
 * the whole module exists to preserve, and a free-form string would let a typo
 * silently create a phantom surface that looks like a real one in the report.
 */
export type UsageSurface =
  /** Paid x402 — a caller signed a USDC authorization and it settled. */
  | "x402"
  /** /api/mcp — free internal bypass, no payment, no wallet. */
  | "mcp"
  /** /api/hub/tools/<id>/call — the Hub's own in-page runner. */
  | "hub"
  /** /api/console — the 5 `blue_*` commands. */
  | "console";

export type UsageOutcome = "ok" | "err";

/** Days of history kept. Past this, the daily hash expires and is gone. */
export const RETENTION_DAYS = 90;

const KEY = (day: string) => `usage:day:${day}`;

/**
 * UTC, always. A local-timezone bucket would shift when Vercel schedules a
 * function in a different region, which silently splits one real day across two
 * buckets and makes a fortnight of data unreadable.
 */
export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Days we have already set a TTL on, per serverless instance.
 *
 * `HINCRBY` on a missing key creates it with no expiry, so something has to call
 * `EXPIRE`. Doing it on every write doubles the command cost of the whole module.
 * Instances are ephemeral and not shared, so this is a best-effort cache: the
 * worst case is a handful of redundant EXPIRE calls on the first request each
 * instance serves, and the key is guaranteed to carry a TTL after the first
 * write on any instance. Re-setting the same TTL is idempotent in Redis.
 */
const expirySet = new Set<string>();

/**
 * Record one tool call. Never throws.
 *
 * `tool` is the CATALOG id (`token-price`), not the MCP alias (`hub_token_price`),
 * so a tool reached through two surfaces aggregates into one row.
 */
export async function recordCall(
  tool: string,
  surface: UsageSurface,
  outcome: UsageOutcome,
): Promise<void> {
  if (!tool) return;
  const day = utcDay();
  const key = KEY(day);
  try {
    await kv.hincrby(key, `${surface}|${tool}|${outcome}`, 1);
    if (!expirySet.has(day)) {
      expirySet.add(day);
      await kv.expire(key, RETENTION_DAYS * 86_400);
    }
  } catch {
    // Metering is best-effort by design. See the header: a KV outage must not
    // fail a tool call the caller may have paid for.
  }
}

export interface DayUsage {
  day: string;
  /** null = the HGETALL threw. NOT the same as a day with no calls, which is {}. */
  rows: Record<string, { surface: UsageSurface; tool: string; ok: number; err: number }> | null;
}

const SURFACES = new Set<string>(["x402", "mcp", "hub", "console"]);

/**
 * Read the last `days` UTC days, newest first.
 *
 * `rows: null` vs `rows: {}` is the #150 distinction and it matters here as much
 * as anywhere: a throttled read rendering as "0 calls" would be read as "nobody
 * uses this tool", which is a conclusion, not a missing datapoint.
 */
export async function readDays(days: number): Promise<DayUsage[]> {
  const n = Math.max(1, Math.min(days, RETENTION_DAYS));
  const out: DayUsage[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() - i * 86_400_000);
    const day = utcDay(d);
    let rows: DayUsage["rows"];
    try {
      const h = await kv.hgetall(KEY(day));
      rows = {};
      for (const [field, raw] of Object.entries(h ?? {})) {
        // Field shape is `<surface>|<tool>|<outcome>`. Anything else is junk from
        // a bad write or a future format; skip it rather than let it land in a
        // report as a tool named "undefined".
        const parts = field.split("|");
        if (parts.length !== 3) continue;
        const [surface, tool, outcome] = parts;
        if (!SURFACES.has(surface) || !tool) continue;
        if (outcome !== "ok" && outcome !== "err") continue;
        const count = Number(raw);
        if (!Number.isFinite(count)) continue;
        const id = `${surface}|${tool}`;
        rows[id] ??= { surface: surface as UsageSurface, tool, ok: 0, err: 0 };
        rows[id][outcome] += count;
      }
    } catch {
      rows = null;
    }
    out.push({ day, rows });
  }
  return out;
}
