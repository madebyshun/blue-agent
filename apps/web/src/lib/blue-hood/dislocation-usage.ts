/**
 * Per-key call counting for `GET /api/hood/dislocation`.
 *
 * WHY THIS IS NOT `usage-daily.ts`
 * --------------------------------
 * `lib/usage-daily.ts` carries an explicit, load-bearing promise in its header:
 * "No wallet, no IP, no arguments, no prompt text, no user identifier of any
 * kind. The field key is `<surface>|<tool>|<outcome>` and nothing else, so this
 * can never become a per-user behaviour log." That promise is kept by having no
 * field to put a caller in. Adding a caller dimension there would break it for
 * all 114 catalog tools at once, to serve one endpoint.
 *
 * The dislocation endpoint needs the opposite thing, and needs it for a stated
 * reason: it is the first Blue Hood surface intended to be SOLD, and without
 * per-caller counts we cannot price it later and cannot tell a pilot customer
 * what they used. So the caller dimension lives here, in its own key, with its
 * own retention, and can be dropped wholesale without touching a single number
 * the rest of the product reports.
 *
 * WHAT IS STORED, AND WHAT IS NOT
 * -------------------------------
 * The field is `<keyHash>|<chain>|<outcome>`. `keyHash` is a truncated SHA-256
 * of the caller-supplied `x-api-key`, never the key itself: KV holds no value
 * that can be replayed against this or any other endpoint, and a pilot customer
 * is still looked up by hashing their key again. No IP, no ticker, no
 * user-agent. The ticker is deliberately absent — "which stocks does this
 * customer watch" is their trading intent, it is not needed to bill them, and
 * the cheapest way to not leak it is to have nowhere to put it.
 *
 * ⚠️ CARDINALITY IS ATTACKER-CONTROLLED, SO THE CAP IS MANDATORY.
 * This endpoint is public and the key is whatever the caller sends, so a
 * sprayer can mint unlimited distinct keys. That is the same hazard
 * `usage-daily.ts` documents for `clientInfo.name`, and it takes the same
 * remedy and the same admission rule: an ALREADY-SEEN key always increments, a
 * NEW key is admitted only while the day is under `KEY_CAP`. That ordering is
 * what makes the counts survive a spray — a real repeat customer keeps
 * climbing instead of being crowded out by noise. Overflow lands in a sentinel
 * so a capped day can never read as a complete one.
 *
 * Every function here swallows its errors. This is a read-only market-data
 * endpoint; a metering failure must never turn into a failed read, and least of
 * all into a WRONG read — the whole point of the route is that a caller can
 * trust a number or be told there isn't one.
 */
import { createHash } from "node:crypto";
import { kv } from "@/lib/kv";
import { utcDay, RETENTION_DAYS } from "@/lib/usage-daily";
import type { HoodChain } from "@/lib/blue-hood/types";

/** Outcome of one metered call, from the caller's point of view. */
export type DislocationOutcome =
  /** A live row, inside the freshness window. */
  | "ok"
  /** Answered, but the snapshot was old / unreadable / absent. */
  | "stale"
  /** Rejected before any read — bad or missing `chain`/`ticker`, or not watched. */
  | "rejected";

const KEY = (day: string) => `hood:disloc:day:${day}`;

/**
 * Distinct caller keys kept per day. Sized for a pilot, not a platform: if this
 * ever binds legitimately, that is a signal to issue real keys rather than to
 * raise the number.
 */
export const KEY_CAP = 64;

/**
 * Field recorded for a caller that sent no key at all. NOT folded in with
 * hashed keys: "anonymous traffic" and "this customer's traffic" answer
 * different questions, and collapsing them would make the free tier
 * indistinguishable from a pilot's usage on the invoice.
 */
export const ANON_KEY_HASH = "anon";

/**
 * Sentinel for "distinct keys were dropped because the day's cap was full".
 * A leading `_` is unreachable by `hashApiKey` (hex only) and by
 * `ANON_KEY_HASH`, so no caller can impersonate this field.
 */
const OVERFLOW_FIELD = "_overflow";

/** Hex length kept from the SHA-256. 16 hex chars = 64 bits — far beyond
 *  collision range for a key set bounded by `KEY_CAP`, and short enough to
 *  read in a report. */
const HASH_LEN = 16;

/**
 * Stable, non-reversible id for a caller key.
 *
 * Deliberately unsalted: the point is that the SAME key maps to the SAME field
 * across deploys and across serverless instances, so a customer's usage does
 * not split into two rows when an env var changes. A salt would buy resistance
 * to offline enumeration of a secret we do not store and do not issue — and
 * would cost the one property the counter exists for.
 */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, HASH_LEN);
}

/**
 * Read the caller key off a request. Returns `ANON_KEY_HASH` when absent.
 *
 * ⚠️ THIS IS NOT AUTH AND MUST NOT BECOME AUTH. Nothing is verified, nothing is
 * rejected, no key is issued. It is an opaque caller-chosen label so usage can
 * be attributed before there is a billing system. If this endpoint ever gates
 * on a key, that is a payment-path change and belongs in its own review, not in
 * a counter module.
 */
export function callerKeyHash(req: Request): string {
  const raw = req.headers.get("x-api-key");
  if (!raw) return ANON_KEY_HASH;
  const trimmed = raw.trim();
  if (!trimmed) return ANON_KEY_HASH;
  return hashApiKey(trimmed);
}

/** Keys we have already set a TTL on, per serverless instance. Same lazy-EXPIRE
 *  trick and same caveats as `usage-daily.ts`'s `expirySet`. */
const expirySet = new Set<string>();

/**
 * Caller fields already admitted on this instance, so the steady state costs one
 * command instead of two. Best-effort: a cold instance re-checks, which is
 * correct but slower, never wrong.
 */
const admitted = new Set<string>();

/** Record one call. Never throws. */
export async function recordDislocationCall(
  keyHash: string,
  chain: HoodChain | "none",
  outcome: DislocationOutcome,
): Promise<void> {
  const key = KEY(utcDay());
  const field = `${keyHash}|${chain}|${outcome}`;
  try {
    if (!admitted.has(field)) {
      const existing = await kv.hgetall(key);
      const fields = Object.keys(existing ?? {});
      // Count DISTINCT CALLERS, not distinct fields: one caller legitimately
      // occupies up to 2 chains x 3 outcomes = 6 fields, so capping on raw field
      // count would evict real customers at a sixth of the intended ceiling.
      const callers = new Set(
        fields.filter((f) => f !== OVERFLOW_FIELD).map((f) => f.split("|")[0]),
      );
      if (!fields.includes(field) && !callers.has(keyHash) && callers.size >= KEY_CAP) {
        await kv.hincrby(key, OVERFLOW_FIELD, 1);
        return;
      }
      admitted.add(field);
    }
    await kv.hincrby(key, field, 1);
    if (!expirySet.has(key)) {
      expirySet.add(key);
      await kv.expire(key, RETENTION_DAYS * 86_400);
    }
  } catch {
    // Best-effort by design — see the header.
  }
}

export interface DislocationDayUsage {
  day: string;
  /** null = the HGETALL threw. NOT the same as {}, which is "read fine, no calls". */
  callers: Record<string, { chain: string; ok: number; stale: number; rejected: number }> | null;
  /** Calls whose caller was dropped because the day's key cap was full. */
  dropped: number;
}

const OUTCOMES = new Set<string>(["ok", "stale", "rejected"]);

/** Read the last `days` UTC days of dislocation usage, newest first. */
export async function readDislocationDays(days: number): Promise<DislocationDayUsage[]> {
  const n = Math.max(1, Math.min(days, RETENTION_DAYS));
  const out: DislocationDayUsage[] = [];
  for (let i = 0; i < n; i++) {
    const day = utcDay(new Date(Date.now() - i * 86_400_000));
    let callers: DislocationDayUsage["callers"];
    let dropped = 0;
    try {
      const h = await kv.hgetall(KEY(day));
      callers = {};
      for (const [field, raw] of Object.entries(h ?? {})) {
        const count = Number(raw);
        if (!Number.isFinite(count)) continue;
        if (field === OVERFLOW_FIELD) { dropped += count; continue; }
        const parts = field.split("|");
        if (parts.length !== 3) continue;
        const [keyHash, chain, outcome] = parts;
        if (!keyHash || !OUTCOMES.has(outcome)) continue;
        const id = `${keyHash}|${chain}`;
        callers[id] ??= { chain, ok: 0, stale: 0, rejected: 0 };
        callers[id][outcome as DislocationOutcome] += count;
      }
    } catch {
      callers = null;
    }
    out.push({ day, callers, dropped });
  }
  return out;
}
