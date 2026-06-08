/**
 * Blue Hub portal — KV store wrapper.
 *
 * Uses Upstash Redis when KV_REST_API_URL + KV_REST_API_TOKEN are set
 * (production). Falls back to in-memory Map for local dev — data won't
 * survive server restarts but the API surface is the same.
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
};

// ─── Upstash Redis client (lazy) ──────────────────────────────────────────────

type KVClient = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<void>;
  del(...keys: string[]): Promise<void>;
};

function getKV(): KVClient {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (url && token) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("@upstash/redis");
    const redis = new Redis({ url, token });
    return {
      get:  <T>(key: string) => redis.get(key) as Promise<T | null>,
      set:  (key: string, value: unknown, opts?: { ex?: number }) =>
              opts?.ex ? redis.set(key, value, { ex: opts.ex }) : redis.set(key, value),
      del:  (...keys: string[]) => redis.del(...keys),
    };
  }

  return fallback;
}

export const kv = getKV();

export const isKVEnabled = (): boolean =>
  !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
