/**
 * /api/usage/daily — the per-surface, per-day, per-outcome breakdown.
 *
 * The sibling `/api/usage` publishes `usage:<id>` lifetime totals and is public,
 * because a run-count chip on a tool card is a product surface. This one is not
 * that. It answers an operator question — "which tools get called, from where,
 * and do they work?" — and the answer includes how much traffic each surface
 * does and does not get. That is a business fact, not a product fact, so it is
 * gated.
 *
 * AUTH — `Authorization: Bearer $CRON_SECRET`, the house pattern.
 *
 * Deliberately NOT accepting the `?secret=` half of that pattern, which several
 * cron routes allow. A secret in a query string lands in Vercel's request logs,
 * in any proxy in front of it, and in browser history the moment someone opens
 * the URL to look at the numbers — which is exactly how this endpoint will be
 * used. The header costs one `curl -H` and leaks nowhere.
 *
 * ⚠️ `CRON_SECRET` was exposed by the retired `/api/sentinel/control` route
 * (#164) for roughly 100 days before it was deleted. If it has not been rotated
 * since, this gate is weaker than it looks — the fix is rotation, not a
 * different gate here.
 *
 * READING THE OUTPUT
 * ------------------
 * `days[]` is newest-first. A day with `rows: null` means the KV read FAILED and
 * we know nothing about that day; a day with `rows: {}` means it was read fine
 * and nothing was called. Those are different facts and the response keeps them
 * different — the same #150 discipline `/api/usage` applies by omitting
 * unreadable counters instead of emitting `0`.
 *
 * `totals` sums only the days that were actually readable, and
 * `unreadable_days` says how many were skipped, so a partial outage cannot
 * quietly deflate a total that then gets quoted as measured.
 *
 * This meter is FORWARD-ONLY and started at the deploy that shipped
 * lib/usage-daily.ts. Days before that are empty because nothing was writing,
 * not because nothing was called. Do not present early buckets as a baseline.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  readDays,
  readHandshakeDays,
  readUnmatchedClientNames,
  RETENTION_DAYS,
  type UsageSurface,
} from "@/lib/usage-daily";

export const runtime = "nodejs";
export const maxDuration = 15;

const CRON_SECRET = process.env.CRON_SECRET ?? "";

export async function GET(req: NextRequest) {
  // No secret configured ⇒ refuse, rather than defaulting open. An empty
  // expected value compared against an empty header would authenticate everyone.
  if (!CRON_SECRET) {
    return NextResponse.json(
      { error: "Not configured", detail: "CRON_SECRET is unset in this deployment." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw  = Number(req.nextUrl.searchParams.get("days") ?? 14);
  const days = Number.isFinite(raw) ? Math.max(1, Math.min(Math.trunc(raw), RETENTION_DAYS)) : 14;

  const [buckets, initBuckets, rawBuckets] = await Promise.all([
    readDays(days),
    readHandshakeDays(days),
    readUnmatchedClientNames(days),
  ]);

  // Roll the readable days up per (surface, tool).
  const totals: Record<string, { surface: UsageSurface; tool: string; ok: number; err: number }> = {};
  let unreadableDays = 0;
  for (const b of buckets) {
    if (b.rows === null) { unreadableDays++; continue; }
    for (const [id, r] of Object.entries(b.rows)) {
      totals[id] ??= { surface: r.surface, tool: r.tool, ok: 0, err: 0 };
      totals[id].ok  += r.ok;
      totals[id].err += r.err;
    }
  }

  const ranked = Object.values(totals).sort((a, b) => (b.ok + b.err) - (a.ok + a.err));

  const bySurface: Record<string, { ok: number; err: number; tools: number }> = {};
  for (const r of ranked) {
    bySurface[r.surface] ??= { ok: 0, err: 0, tools: 0 };
    bySurface[r.surface].ok  += r.ok;
    bySurface[r.surface].err += r.err;
    bySurface[r.surface].tools++;
  }

  // MCP `initialize` count, per client family. Same null-vs-empty discipline as
  // above: an unreadable day is counted, never folded in as a zero.
  const byClient: Record<string, number> = {};
  let unreadableInitDays = 0;
  for (const b of initBuckets) {
    if (b.clients === null) { unreadableInitDays++; continue; }
    for (const [client, n] of Object.entries(b.clients)) {
      byClient[client] = (byClient[client] ?? 0) + n;
    }
  }

  // The sampled names behind `by_client.other`, busiest first. This exists because
  // `other` led every bucket on day one and the counter could not say what it was.
  const unmatched: Record<string, number> = {};
  let droppedNames = 0;
  for (const b of rawBuckets) {
    if (b.names === null) continue;
    droppedNames += b.dropped;
    for (const [name, n] of Object.entries(b.names)) {
      unmatched[name] = (unmatched[name] ?? 0) + n;
    }
  }
  const unmatchedRanked = Object.fromEntries(
    Object.entries(unmatched).sort((a, b) => b[1] - a[1]),
  );

  return NextResponse.json(
    {
      window_days:     days,
      retention_days:  RETENTION_DAYS,
      forward_only:    true,
      note:
        "Forward-only: starts at the deploy that shipped lib/usage-daily.ts. " +
        "An empty early day means nothing was recorded, not that nothing was called. " +
        "rows:null = KV read failed for that day; rows:{} = read fine, no calls.",
      unreadable_days: unreadableDays,
      by_surface:      bySurface,
      /** Per (surface, tool), summed over the readable days, busiest first. */
      tools:           ranked,
      days:            buckets,
      /**
       * MCP `initialize` messages. NOT an install count — every editor restart
       * re-handshakes, so this bounds installs from above. `unnamed` is a caller
       * that sent no clientInfo (curl, smoke scripts, our own CI); `other` is a
       * real client with no bucket yet.
       */
      mcp_handshakes: {
        note:
          "Counts MCP `initialize` messages, not installs: one client restarting " +
          "ten times is ten handshakes. Use it to tell 'nobody' from 'somebody'. " +
          "`unnamed` sent no clientInfo at all (curl, smoke scripts, our own CI). " +
          "`other` is a real client whose name matches no known family — a prompt " +
          "to add one, not a synonym for `unnamed`. Bucketing is forward-only, so " +
          "a handshake already filed as `other` cannot be reclassified later.",
        unreadable_days: unreadableInitDays,
        by_client:       byClient,
        /**
         * The raw names behind `by_client.other` — a hard-capped daily sample, so
         * `other` is actionable instead of just a signal that something is missing.
         * Whatever leads here is the next entry for MCP_CLIENT_FAMILIES.
         */
        unmatched_names: {
          note:
            "Folded raw `clientInfo.name` values that matched no family, i.e. the " +
            "contents of `by_client.other`. Sampled, not complete: at most a dozen " +
            "distinct names per day are kept, and `dropped` counts handshakes whose " +
            "name arrived after that day's sample was full. Do NOT add these to any " +
            "handshake total — they are already counted in `by_client.other`. " +
            "Forward-only: this sampling started after `other` had already led for " +
            "a day, so the earliest unknowns have no name anywhere and never will.",
          dropped:  droppedNames,
          by_name:  unmatchedRanked,
          days:     rawBuckets,
        },
        days:            initBuckets,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
