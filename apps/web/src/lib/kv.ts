/**
 * Blue Agent — KV Store
 * Wraps @vercel/kv with graceful fallback to in-memory Map.
 * Works in local dev without KV env vars, auto-upgrades in production.
 */

// ─── In-memory fallback ───────────────────────────────────────────────────────
const memStore = new Map<string, unknown>();

const fallback = {
  async get<T>(key: string): Promise<T | null> {
    return (memStore.get(key) as T) ?? null;
  },
  async set(key: string, value: unknown, opts?: { ex?: number }): Promise<void> {
    memStore.set(key, value);
    if (opts?.ex) {
      setTimeout(() => memStore.delete(key), opts.ex * 1000);
    }
  },
  async del(...keys: string[]): Promise<void> {
    keys.forEach((k) => memStore.delete(k));
  },
  async incr(key: string): Promise<number> {
    const val = ((memStore.get(key) as number) ?? 0) + 1;
    memStore.set(key, val);
    return val;
  },
  async expire(key: string, seconds: number): Promise<void> {
    const val = memStore.get(key);
    if (val !== undefined) {
      setTimeout(() => memStore.delete(key), seconds * 1000);
    }
  },
};

// ─── KV singleton ────────────────────────────────────────────────────────────
type KVClient = typeof fallback;

function getKV(): KVClient {
  if (
    process.env.KV_REST_API_URL &&
    process.env.KV_REST_API_TOKEN
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { kv } = require("@vercel/kv");
    return kv as KVClient;
  }
  return fallback;
}

export const kv = getKV();

// ─── Typed helpers ────────────────────────────────────────────────────────────

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    return await kv.get<T>(key);
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  try {
    await kv.set(key, value, ttlSeconds ? { ex: ttlSeconds } : undefined);
  } catch {}
}

export async function kvDel(...keys: string[]): Promise<void> {
  try {
    await kv.del(...keys);
  } catch {}
}

export const isKVEnabled = (): boolean =>
  !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
