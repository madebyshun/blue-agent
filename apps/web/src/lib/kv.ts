/**
 * Blue Agent — KV Store
 * Uses @upstash/redis when KV_REST_API_URL + KV_REST_API_TOKEN are set.
 * Falls back to in-memory Map for local dev (no env vars needed).
 */

// ─── In-memory fallback ───────────────────────────────────────────────────────
const memStore = new Map<string, { value: unknown; expiresAt?: number }>();

function memClean(key: string) {
  const entry = memStore.get(key);
  if (entry?.expiresAt && Date.now() > entry.expiresAt) {
    memStore.delete(key);
    return true;
  }
  return false;
}

const fallback = {
  async get<T>(key: string): Promise<T | null> {
    if (memClean(key)) return null;
    return (memStore.get(key)?.value as T) ?? null;
  },
  async set(key: string, value: unknown, opts?: { ex?: number }): Promise<void> {
    memStore.set(key, {
      value,
      expiresAt: opts?.ex ? Date.now() + opts.ex * 1000 : undefined,
    });
  },
  async del(...keys: string[]): Promise<void> {
    keys.forEach((k) => memStore.delete(k));
  },
  async incr(key: string): Promise<number> {
    if (memClean(key)) memStore.set(key, { value: 0 });
    const entry = memStore.get(key);
    const val = ((entry?.value as number) ?? 0) + 1;
    memStore.set(key, { value: val, expiresAt: entry?.expiresAt });
    return val;
  },
  async incrby(key: string, by: number): Promise<number> {
    if (memClean(key)) memStore.set(key, { value: 0 });
    const entry = memStore.get(key);
    const val = ((entry?.value as number) ?? 0) + by;
    memStore.set(key, { value: val, expiresAt: entry?.expiresAt });
    return val;
  },
};

// ─── Upstash Redis client ─────────────────────────────────────────────────────
type KVClient = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<void>;
  del(...keys: string[]): Promise<void>;
  incr(key: string): Promise<number>;
  incrby(key: string, by: number): Promise<number>;
};

// Resolve Upstash REST credentials from either env var convention:
//   - KV_REST_API_URL / KV_REST_API_TOKEN          (Vercel KV legacy naming)
//   - UPSTASH_REDIS_REST_URL / ..._TOKEN           (Upstash Marketplace naming)
// The Vercel ↔ Upstash Marketplace integration injects the UPSTASH_* names, so
// supporting both means "Connect Project" works with zero manual env copying.
function kvCreds(): { url: string; token: string } | null {
  const url   = process.env.KV_REST_API_URL   ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

function getKV(): KVClient {
  const creds = kvCreds();

  if (creds) {
    const { url, token } = creds;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("@upstash/redis");
    const redis = new Redis({ url, token });
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get:  <T>(key: string) => redis.get(key) as Promise<T | null>,
      set:  (key: string, value: unknown, opts?: { ex?: number }) =>
              opts?.ex ? redis.set(key, value, { ex: opts.ex }) : redis.set(key, value),
      del:  (...keys: string[]) => redis.del(...keys),
      incr: (key: string) => redis.incr(key),
      incrby: (key: string, by: number) => redis.incrby(key, by),
    };
  }

  return fallback;
}

export const kv = getKV();

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function kvGet<T>(key: string): Promise<T | null> {
  try { return await kv.get<T>(key); } catch { return null; }
}

export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  try { await kv.set(key, value, ttlSeconds ? { ex: ttlSeconds } : undefined); } catch {}
}

export async function kvDel(...keys: string[]): Promise<void> {
  try { await kv.del(...keys); } catch {}
}

/**
 * Atomic SET if-not-exists with TTL.
 * Returns true if the key was set (lock acquired), false if it already existed.
 * Uses Redis SET NX EX — single atomic op, no race condition.
 */
export async function kvSetNX(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
  try {
    const creds = kvCreds();
    if (creds) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Redis } = require("@upstash/redis");
      const redis  = new Redis({ url: creds.url, token: creds.token });
      // SET key value NX EX ttl — atomic, returns "OK" or null
      const result = await redis.set(key, value, { nx: true, ex: ttlSeconds });
      return result === "OK";
    }
    // In-memory fallback: check expiry + set atomically
    const existing = memStore.get(key);
    const expired  = existing?.expiresAt ? Date.now() > existing.expiresAt : false;
    if (existing && !expired) return false;
    memStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  } catch {
    return false;
  }
}

export const isKVEnabled = (): boolean => kvCreds() !== null;
