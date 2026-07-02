/**
 * Blue Hub v2 — Builder Registry
 *
 * KV-backed (Upstash Redis) storage for community-submitted tools.
 * First-party tools live in src/lib/agent-tools.ts; this file handles
 * everything submitted via /hub/submit by external builders.
 *
 * Keys:
 *   hub:tools:index            → string[] of tool IDs (the master list)
 *   hub:tools:item:<id>        → RegisteredTool JSON
 *   hub:tools:calls:<id>       → integer (lifetime call count; mirrors usage:<id>)
 *   hub:tools:revenue:<id>     → integer (lifetime USDC units earned by builder, 95% split)
 *   hub:builders:tools:<addr>  → string[] of tool IDs owned by this wallet
 */

import { kv, kvGet, kvSet, kvDel } from "@/lib/kv";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegisteredToolInput {
  key:         string;
  label:       string;
  placeholder: string;
  required?:   boolean;
}

export interface RegisteredTool {
  id:             string;                          // slug, e.g. "weather-on-base"
  name:           string;                          // display
  description:    string;                          // 1-line pitch
  category:       string;                          // free-text or matches Hub categories
  endpoint:       string;                          // POST URL — builder's API
  inputs:         RegisteredToolInput[];           // input schema
  price:          string;                          // "$0.20"
  priceUSDC:      number;                          // 200000 = $0.20 (6 decimals)
  builderAddress: `0x${string}`;                   // revenue recipient (verified via SIWE)
  // Submission metadata
  submittedAt:    number;                          // unix ms
  signature:      string;                          // SIWE signature of the manifest
  verified:       boolean;                         // Blue Agent reviewed (default false)
  aiReady:        boolean;                         // returns structured JSON
  // Optional
  agentName?:     string;                          // builder's agent brand (default = short addr)
  iconUrl?:       string;
  tags?:          string[];
  // Runtime stats (denormalized from KV counters; populated on read)
  callCount?:     number;
  revenueTotal?:  number;                          // USDC units earned
}

// ─── Key helpers ──────────────────────────────────────────────────────────────

const K = {
  index:      "hub:tools:index",
  item:       (id: string)   => `hub:tools:item:${id}`,
  calls:      (id: string)   => `hub:tools:calls:${id}`,
  revenue:    (id: string)   => `hub:tools:revenue:${id}`,
  builder:    (addr: string) => `hub:builders:tools:${addr.toLowerCase()}`,
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function listRegisteredToolIds(): Promise<string[]> {
  return (await kvGet<string[]>(K.index)) ?? [];
}

/** Get a registered tool with denormalized call/revenue counters. */
export async function getRegisteredTool(id: string): Promise<RegisteredTool | null> {
  const tool = await kvGet<RegisteredTool>(K.item(id));
  if (!tool) return null;
  const [calls, revenue] = await Promise.all([
    kvGet<number>(K.calls(id)),
    kvGet<number>(K.revenue(id)),
  ]);
  return { ...tool, callCount: calls ?? 0, revenueTotal: revenue ?? 0 };
}

/** Get every registered tool. Cached at the caller; pagination Phase 4. */
export async function listRegisteredTools(): Promise<RegisteredTool[]> {
  const ids = await listRegisteredToolIds();
  if (ids.length === 0) return [];
  const items = await Promise.all(ids.map(getRegisteredTool));
  return items.filter((t): t is RegisteredTool => !!t);
}

/** Tools owned by a wallet (for dashboard + public builder profile). */
export async function getBuilderTools(addr: string): Promise<RegisteredTool[]> {
  const ids = (await kvGet<string[]>(K.builder(addr))) ?? [];
  if (ids.length === 0) return [];
  const items = await Promise.all(ids.map(getRegisteredTool));
  return items.filter((t): t is RegisteredTool => !!t);
}

export interface BuilderStats {
  toolCount:    number;
  totalCalls:   number;
  totalRevenue: number;                            // USDC units (6 decimals)
}

export async function getBuilderStats(addr: string): Promise<BuilderStats> {
  const tools = await getBuilderTools(addr);
  return tools.reduce<BuilderStats>((acc, t) => ({
    toolCount:    acc.toolCount    + 1,
    totalCalls:   acc.totalCalls   + (t.callCount    ?? 0),
    totalRevenue: acc.totalRevenue + (t.revenueTotal ?? 0),
  }), { toolCount: 0, totalCalls: 0, totalRevenue: 0 });
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Persist a new tool. Caller must have already verified the SIWE signature
 * and confirmed the slug is unique (see /api/hub/tools route).
 */
export async function putTool(tool: RegisteredTool): Promise<void> {
  await kvSet(K.item(tool.id), tool);

  // Append to master index
  const ids = await listRegisteredToolIds();
  if (!ids.includes(tool.id)) {
    ids.push(tool.id);
    await kvSet(K.index, ids);
  }

  // Append to builder index
  const builderIds = (await kvGet<string[]>(K.builder(tool.builderAddress))) ?? [];
  if (!builderIds.includes(tool.id)) {
    builderIds.push(tool.id);
    await kvSet(K.builder(tool.builderAddress), builderIds);
  }
}

export async function incrCallCount(id: string): Promise<number> {
  try { return await kv.incr(K.calls(id)); } catch { return 0; }
}

/**
 * Permanently remove an external tool: deletes the item + its call/revenue
 * counters and de-indexes it from the master list and the owner's builder list.
 * Caller MUST have verified the requester owns tool.builderAddress (SIWE) first.
 */
export async function removeTool(id: string): Promise<void> {
  const tool = await kvGet<RegisteredTool>(K.item(id));
  await kvDel(K.item(id), K.calls(id), K.revenue(id));

  const ids = await listRegisteredToolIds();
  if (ids.includes(id)) await kvSet(K.index, ids.filter(x => x !== id));

  if (tool) {
    const bkey = K.builder(tool.builderAddress);
    const bids = (await kvGet<string[]>(bkey)) ?? [];
    if (bids.includes(id)) await kvSet(bkey, bids.filter(x => x !== id));
  }
}

/**
 * Add to the builder's lifetime revenue counter.
 * `usdcUnits` should be the BUILDER'S 95% share (caller already split off
 * the 5% treasury cut before invoking).
 */
export async function addRevenue(id: string, usdcUnits: number): Promise<void> {
  const current = (await kvGet<number>(K.revenue(id))) ?? 0;
  await kvSet(K.revenue(id), current + usdcUnits);
}

// ─── Validation ───────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z][a-z0-9-]{2,40}$/;

export function isValidSlug(id: string): boolean {
  return SLUG_RE.test(id);
}

/** Returns the canonical message a builder must sign to register a tool. */
export function siweMessage(
  spec: Pick<RegisteredTool, "id" | "name" | "endpoint" | "priceUSDC" | "builderAddress">,
  nonce: string,
): string {
  return [
    `Blue Hub Builder Registration`,
    ``,
    `Wallet:    ${spec.builderAddress.toLowerCase()}`,
    `Tool ID:   ${spec.id}`,
    `Tool name: ${spec.name}`,
    `Endpoint:  ${spec.endpoint}`,
    `Price:     ${spec.priceUSDC} USDC units (6 decimals)`,
    `Nonce:     ${nonce}`,
    ``,
    `By signing this message I confirm I control the wallet above and`,
    `agree to the Blue Hub builder terms: 95/5 revenue split with the`,
    `Blue Hub treasury, USDC settlement on Base.`,
  ].join("\n");
}

/**
 * Canonical message a builder signs to REMOVE one of their tools. Covers BOTH
 * registries (external + hosted) via the `registry` field. The dashboard client
 * and the DELETE routes MUST build a byte-identical string, or verification fails.
 * Signing proves wallet control — no funds move, accrued earnings are preserved.
 */
export function removeToolSiweMessage(
  registry: "external" | "hosted",
  slug: string,
  owner: string,
  nonce: string,
): string {
  // Single-space labels (no column alignment) so a client-side copy is trivially
  // byte-identical — the /hub/dashboard Remove button mirrors this exactly.
  return [
    `Blue Hub — remove tool`,
    ``,
    `I am permanently removing my tool from Blue Hub.`,
    ``,
    `Registry: ${registry}`,
    `Slug: ${slug}`,
    `Owner: ${owner.toLowerCase()}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

// ─── Endpoint probe — lenient auto-test ───────────────────────────────────────

export interface ProbeResult {
  ok:         boolean;
  status:     number;
  contentType:string;
  durationMs: number;
  hint?:      string;                              // human-readable failure reason
  aiReady:    boolean;                             // true if response was valid JSON
}

/**
 * Lenient probe — sends an empty POST and accepts any 2xx OR 402 (x402 paid).
 * Sets `aiReady: true` if the response body parsed as JSON.
 */
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
    const contentType = res.headers.get("content-type") ?? "";
    const okStatus = (res.status >= 200 && res.status < 300) || res.status === 402;
    let aiReady = false;
    try { await res.clone().json(); aiReady = true; } catch { /* not JSON */ }
    return {
      ok:          okStatus,
      status:      res.status,
      contentType,
      durationMs,
      aiReady,
      hint:        okStatus ? undefined : `Endpoint returned ${res.status} — expected 2xx or 402.`,
    };
  } catch (e) {
    return {
      ok:          false,
      status:      0,
      contentType: "",
      durationMs:  Date.now() - t0,
      aiReady:     false,
      hint:        `Could not reach endpoint: ${(e as Error).message}`,
    };
  }
}
