/**
 * Blue Agent — Rate Limiting
 * Uses @upstash/ratelimit with Vercel KV backend.
 * Falls back to in-memory sliding window when KV is not available.
 */
import { isKVEnabled, kv, kvSet } from "./kv";

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
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

// ─── Main rate limit function ─────────────────────────────────────────────────
export async function rateLimit(
  identifier: string, // IP or wallet address
  type: RateLimitKey = "default"
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const config = RATE_LIMITS[type];
  const key = `rl:${type}:${identifier}`;

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
