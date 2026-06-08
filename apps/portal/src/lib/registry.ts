/**
 * Blue Hub — community-registered APIs registry.
 *
 * KV-backed CRUD for APIs submitted via /submit. First-party APIs live in
 * src/app/marketplace/_data.ts (hardcoded); this file handles everything
 * registered by external builders.
 *
 * Keys:
 *   hub:tools:index            → string[] of tool IDs (the master list)
 *   hub:tools:item:<id>        → RegisteredAPI JSON
 *   hub:builders:tools:<addr>  → string[] of tool IDs owned by this wallet
 */

import { kv } from "./kv";

export interface RegisteredAPIInput {
  key:         string;
  label:       string;
  placeholder: string;
  required?:   boolean;
}

export interface RegisteredAPI {
  id:             string;                          // slug
  name:           string;
  provider:       string;                          // display handle
  description:    string;
  category:       string;
  endpoint:       string;                          // HTTPS URL
  inputs:         RegisteredAPIInput[];
  price:          string;                          // "$0.20"
  priceUSDC:      number;                          // 200000 = $0.20
  builderAddress: `0x${string}`;                   // revenue recipient
  submittedAt:    number;
  signature?:     string;                          // SIWE signature (when wallet wired)
  verified:       boolean;                         // Blue Hub reviewed
  aiReady:        boolean;
  agentName?:     string;
  // Runtime stats (denormalized — set on read from counters)
  callCount?:     number;
  revenueTotal?:  number;
}

const K = {
  index:   "hub:tools:index",
  item:    (id: string)   => `hub:tools:item:${id}`,
  builder: (addr: string) => `hub:builders:tools:${addr.toLowerCase()}`,
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function listRegisteredIds(): Promise<string[]> {
  return (await kv.get<string[]>(K.index)) ?? [];
}

export async function getRegisteredAPI(id: string): Promise<RegisteredAPI | null> {
  return (await kv.get<RegisteredAPI>(K.item(id))) ?? null;
}

export async function listRegisteredAPIs(): Promise<RegisteredAPI[]> {
  const ids = await listRegisteredIds();
  if (ids.length === 0) return [];
  const items = await Promise.all(ids.map(getRegisteredAPI));
  return items.filter((t): t is RegisteredAPI => !!t);
}

export async function getBuilderAPIs(addr: string): Promise<RegisteredAPI[]> {
  const ids = (await kv.get<string[]>(K.builder(addr))) ?? [];
  if (ids.length === 0) return [];
  const items = await Promise.all(ids.map(getRegisteredAPI));
  return items.filter((t): t is RegisteredAPI => !!t);
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function putAPI(api: RegisteredAPI): Promise<void> {
  await kv.set(K.item(api.id), api);

  // Master index
  const ids = await listRegisteredIds();
  if (!ids.includes(api.id)) {
    ids.push(api.id);
    await kv.set(K.index, ids);
  }

  // Builder index
  const builderIds = (await kv.get<string[]>(K.builder(api.builderAddress))) ?? [];
  if (!builderIds.includes(api.id)) {
    builderIds.push(api.id);
    await kv.set(K.builder(api.builderAddress), builderIds);
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z][a-z0-9-]{2,40}$/;
export const isValidSlug = (id: string): boolean => SLUG_RE.test(id);

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
export const isValidAddress = (a: string): boolean => ADDR_RE.test(a);

// ─── Lenient endpoint probe ───────────────────────────────────────────────────

export interface ProbeResult {
  ok:         boolean;
  status:     number;
  durationMs: number;
  aiReady:    boolean;
  hint?:      string;
}

export async function probeEndpoint(endpoint: string): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({}),
      signal:  AbortSignal.timeout(8000),
    });
    const durationMs = Date.now() - t0;
    const okStatus   = (res.status >= 200 && res.status < 300) || res.status === 402;
    let aiReady = false;
    try { await res.clone().json(); aiReady = true; } catch {}
    return {
      ok:     okStatus,
      status: res.status,
      durationMs,
      aiReady,
      hint:   okStatus ? `${res.status} · ${durationMs}ms` : `Got ${res.status} — expected 2xx or 402.`,
    };
  } catch (e) {
    return {
      ok:         false,
      status:     0,
      durationMs: Date.now() - t0,
      aiReady:    false,
      hint:       `Unreachable: ${(e as Error).message}`,
    };
  }
}
