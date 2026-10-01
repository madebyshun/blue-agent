/**
 * Blue Agent — Rate Limiting
 * KV counters on the Upstash REST client in lib/kv.ts (@upstash/ratelimit is a
 * dependency but is not what runs here).
 * Falls back to an in-memory window when KV is not available — EXCEPT for the
 * strict tiers below, which refuse rather than fall back when KV is configured
 * and errors.
 */
import { isKVEnabled, kv, kvGetProbe, kvSet } from "./kv";

// ─── In-memory fallback rate limiter ─────────────────────────────────────────
const windowStore = new Map<string, { count: number; reset: number }>();

function memRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const entry = windowStore.get(key);

  if (!entry || now > entry.reset) {
    windowStore.set(key, { count: 1, reset: now + windowMs });
    return { success: true, remaining: limit - 1, reset: now + windowMs };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, reset: entry.reset };
  }

  entry.count++;
  return { success: true, remaining: limit - entry.count, reset: entry.reset };
}

// ─── Rate limit configs ───────────────────────────────────────────────────────
export const RATE_LIMITS = {
  chat:    { limit: 30,  windowSeconds: 60  }, // 30 msgs/min
  hub:     { limit: 20,  windowSeconds: 60  }, // 20 tool runs/min
  console: { limit: 10,  windowSeconds: 60  }, // 10 commands/min
  api:     { limit: 100, windowSeconds: 60  }, // 100 req/min for public API
  default: { limit: 60,  windowSeconds: 60  }, // 60 req/min default
  // /api/pretrade-check ONLY, in its own bucket. It used to share `api`
  // (`rl:api:<ip>`) with /api/mcp, /api/signal, the hub routes and /api/pledge,
  // so an MCP agent on the same machine (or a shared NAT) could spend the
  // budget the wallet cards' safety check runs on. A throttled check is not a
  // check that ran — see usePreTradeCheck, which holds signing on a 429.
  pretrade: { limit: 120, windowSeconds: 60 },
  // Per SIWE WALLET, not per IP: sponsored gas is the project's money. A send
  // makes two paymaster calls (stub, then data), so this is ~20 sponsored
  // sends an hour. Past it the wallet still SENDS, user-paid: /api/paymaster/
  // token stops minting for it (peekRateLimit below), so the card drops its
  // "gas sponsored" badge and attaches no paymaster; and a wallet that crosses
  // the line mid-send is refused here and retried user-paid by the card
  // (sendWithSponsorFallback, hooks/useSponsoredGas.ts). A STRICT tier.
  paymaster: { limit: 40, windowSeconds: 3600 },
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  reset: number;
  /** Set only by a strict tier that refused because KV could not be read or
   *  written — the budget is UNKNOWN, not spent. Lets the caller say so. */
  unavailable?: true;
};

// ─── Strict tiers: the ones that guard project MONEY ─────────────────────────
// The general path in `rateLimit` reads the counter, compares, then INCRs —
// separate round trips with nothing tying them together — and silently drops
// to a per-instance Map when KV throws. For a chat throttle both are fine: an
// overshoot costs a few extra messages. For the paymaster tier the counter is
// the ONLY per-wallet limit on spending the project's CDP gas budget, and both
// holes are spendable: N parallel pm_getPaymasterData calls all read
// `count < limit` before any INCR lands (and at a fresh window every one of
// them takes the "reset" branch and writes count=1), and during a KV outage
// (#148) each serverless instance hands out its own full allowance.
//
// So a strict tier:
//   • INCRs FIRST and compares the value INCR returned. Redis serialises INCR,
//     so exactly `limit` callers ever see a value ≤ limit, however many race.
//   • Keys the counter by WINDOW INDEX (fixed, epoch-aligned windows). EXPIRE
//     is set on the first hit; a lost EXPIRE (crash between the two commands,
//     a KV blip) can only orphan a PAST window's key. On a single un-windowed
//     key the same loss would pin the wallet above its limit forever.
//     Worst case at a window edge is 2×limit back to back — the same as the
//     first-call-anchored window this replaced.
//   • FAILS CLOSED when KV is configured but throws: refuses with
//     `unavailable: true` rather than trust a Map that is per instance.
// Only when KV is not configured at all (local dev, hermetic tests) does a
// strict tier use the in-memory limiter, like every other tier.
const STRICT_TIERS = ["paymaster"] as const;
export type StrictRateLimitKey = (typeof STRICT_TIERS)[number];
const isStrict = (t: RateLimitKey): t is StrictRateLimitKey =>
  (STRICT_TIERS as readonly RateLimitKey[]).includes(t);

function strictWindow(type: StrictRateLimitKey, identifier: string, now: number) {
  const windowMs = RATE_LIMITS[type].windowSeconds * 1000;
  const index = Math.floor(now / windowMs);
  return { countKey: `rl:${type}:${identifier}:w${index}`, reset: (index + 1) * windowMs };
}

async function strictRateLimit(type: StrictRateLimitKey, identifier: string): Promise<RateLimitResult> {
  const { limit } = RATE_LIMITS[type];
  const now = Date.now();
  const { countKey, reset } = strictWindow(type, identifier, now);
  try {
    const n = await kv.incr(countKey);
    // +5s slack, like the general path, so the key never dies a hair early.
    if (n === 1) await kv.expire(countKey, Math.ceil((reset - now) / 1000) + 5);
    if (n > limit) return { success: false, remaining: 0, reset };
    return { success: true, remaining: limit - n, reset };
  } catch (e) {
    console.error(`[rate-limit:${type}] KV error — refusing (strict tier): ${(e as Error).message}`);
    return { success: false, remaining: 0, reset, unavailable: true };
  }
}

/**
 * Read a strict tier's remaining budget WITHOUT spending any of it.
 * /api/paymaster/token uses it so it never mints a token the paymaster is
 * about to refuse. "unavailable" (KV configured but unreadable, or junk under
 * the key) is NOT "open": a caller guarding money must treat it as no budget.
 */
export async function peekRateLimit(
  identifier: string,
  type: StrictRateLimitKey,
): Promise<{ status: "ok"; remaining: number } | { status: "unavailable" }> {
  const { limit } = RATE_LIMITS[type];
  if (isKVEnabled()) {
    const probe = await kvGetProbe<unknown>(strictWindow(type, identifier, Date.now()).countKey);
    if (probe.status === "error") return { status: "unavailable" };
    if (probe.status === "miss") return { status: "ok", remaining: limit };
    const n = typeof probe.value === "number" ? probe.value : Number(probe.value);
    if (!Number.isFinite(n)) return { status: "unavailable" };
    return { status: "ok", remaining: Math.max(0, limit - n) };
  }
  // Same key and window rules as memRateLimit, which is what `rateLimit` uses here.
  const entry = windowStore.get(`rl:${type}:${identifier}`);
  if (!entry || Date.now() > entry.reset) return { status: "ok", remaining: limit };
  return { status: "ok", remaining: Math.max(0, limit - entry.count) };
}

// ─── Main rate limit function ─────────────────────────────────────────────────
export async function rateLimit(
  identifier: string, // IP or wallet address
  type: RateLimitKey = "default"
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[type];
  const key = `rl:${type}:${identifier}`;

  // Money tiers never take the read-then-INCR path below (see STRICT_TIERS).
  if (isKVEnabled() && isStrict(type)) return strictRateLimit(type, identifier);

  if (isKVEnabled()) {
    try {
      // Use simple KV-based counter when Upstash Ratelimit has type issues
      const countKey = `${key}:count`;
      const resetKey = `${key}:reset`;
      const now = Date.now();
      const windowMs = config.windowSeconds * 1000;

      const resetAt = await kv.get<number>(resetKey);
      if (!resetAt || now > resetAt) {
        await kvSet(countKey, 1, config.windowSeconds + 5);
        await kvSet(resetKey, now + windowMs, config.windowSeconds + 5);
        return { success: true, remaining: config.limit - 1, reset: now + windowMs };
      }

      const count = (await kv.get<number>(countKey)) ?? 0;
      if (count >= config.limit) {
        return { success: false, remaining: 0, reset: resetAt };
      }
      await kv.incr(countKey);
      return { success: true, remaining: config.limit - count - 1, reset: resetAt };
    } catch {
      // fallthrough to in-memory
    }
  }

  return memRateLimit(key, config.limit, config.windowSeconds * 1000);
}

// ─── IP extractor helper ──────────────────────────────────────────────────────
export function getIdentifier(req: Request): string {
  const forwarded = (req.headers as Headers).get("x-forwarded-for");
  const real      = (req.headers as Headers).get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() ?? real ?? "unknown";
}
