/**
 * B20 Registry — CDP SQL API path (PRIMARY).
 *
 * Replaces the chunked getLogs scan (registry-logs.ts) with a single CDP SQL
 * query against {base|base_sepolia}.events, filtered to the B20Factory address.
 * One round-trip returns the full history (~2.5k rows on Sepolia in <100ms of
 * server execution) instead of ~2k sequential 2,000-block getLogs chunks.
 *
 * ── WHY THE QUERY IS DELIBERATELY MINIMAL ───────────────────────────────────
 * The CDP SQL endpoint sits behind Cloudflare's managed WAF, which challenges
 * (HTTP 403 "Just a moment…") any request body that matches SQL-injection
 * heuristics. Confirmed triggers (verified against the live endpoint):
 *   • event_signature = 'B20Created(address,uint8,...)'  → parens look like a
 *     function-call / SQLi payload.
 *   • ORDER BY <col> DESC                                → flagged keyword combo.
 *   • a second `AND <col> = '...'` condition             → tips the attack score.
 * A single `WHERE address = '0x…'` filter passes cleanly. The B20Factory emits
 * ONLY B20Created events, so the address filter alone selects exactly the
 * registry — every other concern (event-type match, reorg `action='added'`,
 * sort, dedup, counts) is done in CODE on the returned rows. Decoded indexed
 * args (token, variant) are surfaced by CDP inside `parameters`, so no topic
 * math is needed.
 *
 * Auth: CDP JWT (generateJwt) — SERVER-SIDE ONLY. The secret key never reaches
 * the client. This module must only be imported from server code.
 *
 * Output shape is byte-for-byte the same B20RegistryResult as registry-logs.ts,
 * so the Registry UI is unchanged. On ANY failure this throws; the caller
 * (registry-action.ts) catches and falls back to getB20Registry (getLogs).
 *
 * KV cache key: "b20:registry:cdp:{network}"  TTL 24 h, 5-min freshness window.
 * (Separate key from the getLogs fallback's "b20:registry:v2:{network}" so the
 * two cache shapes never collide.)
 */

import { generateJwt } from "@coinbase/cdp-sdk/auth";
import { kv } from "@vercel/kv";
import { B20_FACTORY_ADDRESS } from "./inspect-abi";
import type { B20RegistryEntry, B20RegistryResult } from "./registry-logs";

// ── Endpoint ────────────────────────────────────────────────────────────────

const CDP_HOST = "api.cdp.coinbase.com";
const CDP_PATH = "/platform/v2/data/query/run";
const CDP_TIMEOUT_MS = 20_000;

// events table stores addresses lowercase — ClickHouse string compare is exact.
const FACTORY_LC = B20_FACTORY_ADDRESS.toLowerCase();

const TABLE = { mainnet: "base", sepolia: "base_sepolia" } as const;
const EXPLORER = {
  mainnet: "https://basescan.org",
  sepolia: "https://sepolia.basescan.org",
} as const;

// ── Cache ───────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 100;            // newest entries kept for display (match getLogs)
const FRESH_MS = 5 * 60 * 1_000;    // return cache immediately if fresher than this
const KV_TTL_S = 24 * 3_600;        // 24 h

const cacheKey = (network: string) => `b20:registry:cdp:${network}`;
const tokenSetKey = (network: string) => `b20:tokenset:cdp:${network}`;
type CachedResult = B20RegistryResult & { _updatedAt?: number };

// ── CDP SQL transport ───────────────────────────────────────────────────────

interface CdpRow {
  block_number: string;
  transaction_hash: string;
  action: string;
  parameters: {
    token?: string;
    variant?: string;
    name?: string;
    symbol?: string;
    decimals?: string;
    variantEventParams?: string;
  };
}

/** Run a read-only SQL query via the CDP Data SQL API. Throws on any non-200. */
async function runCdpSql(sql: string): Promise<CdpRow[]> {
  const id = process.env.CDP_API_KEY_ID;
  const secret = process.env.CDP_API_KEY_SECRET;
  if (!id || !secret) throw new Error("CDP_API_KEY_ID / CDP_API_KEY_SECRET not set");

  const jwt = await generateJwt({
    apiKeyId: id,
    apiKeySecret: secret,
    requestMethod: "POST",
    requestHost: CDP_HOST,
    requestPath: CDP_PATH,
    expiresIn: 120,
  });

  const res = await fetch(`https://${CDP_HOST}${CDP_PATH}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(CDP_TIMEOUT_MS),
  });

  if (!res.ok) {
    // Includes the Cloudflare WAF challenge (403) — surface enough to debug,
    // never the body (could be a large HTML challenge page).
    throw new Error(`CDP SQL HTTP ${res.status}`);
  }

  const json = (await res.json()) as { result?: CdpRow[] | null };
  return Array.isArray(json.result) ? json.result : [];
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns up to MAX_ENTRIES B20Created entries (newest-first) plus an accurate
 * full count across all history. Single CDP SQL query; all filtering/sorting/
 * dedup/counting done in code. Throws on failure (caller falls back to getLogs).
 *
 * Mainnet pre-activation returns 0 rows honestly (no B20Created events yet).
 */
export async function getB20RegistryCDP(
  network: "mainnet" | "sepolia",
): Promise<B20RegistryResult> {
  // 1. Fresh cache → return immediately (zero network).
  try {
    const cached = await kv.get<CachedResult>(cacheKey(network));
    if (cached?._updatedAt && Date.now() - cached._updatedAt < FRESH_MS) {
      const { _updatedAt, ...rest } = cached;
      void _updatedAt;
      return { ...rest, cached: true };
    }
  } catch {
    /* ignore cache read errors — fall through to a live query */
  }

  // 2. Single WAF-safe query: address-only filter, no ORDER BY / event_signature
  //    / action filter. Factory emits only B20Created, so this is exactly the
  //    registry. (See file header for the WAF rationale.)
  const sql =
    `SELECT block_number, transaction_hash, action, parameters ` +
    `FROM ${TABLE[network]}.events ` +
    `WHERE address = '${FACTORY_LC}' LIMIT 50000`;
  const rows = await runCdpSql(sql); // throws → caller falls back to getLogs

  // 3. Filter action='added' (reorg-safe), dedup by token (keep highest block).
  const byToken = new Map<string, B20RegistryEntry>();
  for (const row of rows) {
    if (row.action !== "added") continue;
    const token = (row.parameters?.token ?? "").toLowerCase();
    if (!token) continue;

    const variantNum = Number(row.parameters?.variant ?? 0);
    const variant: 0 | 1 = variantNum === 1 ? 1 : 0;
    const entry: B20RegistryEntry = {
      token,
      variant,
      variantLabel: variant === 1 ? "STABLECOIN" : "ASSET",
      name: row.parameters?.name ?? "",
      symbol: row.parameters?.symbol ?? "",
      decimals: Number(row.parameters?.decimals ?? 18),
      blockNumber: row.block_number ?? "",
      txHash: row.transaction_hash ?? "",
      explorerUrl: `${EXPLORER[network]}/token/${token}`,
    };

    const prev = byToken.get(token);
    if (!prev || safeBig(entry.blockNumber) > safeBig(prev.blockNumber)) {
      byToken.set(token, entry);
    }
  }

  // 4. Sort newest-first, derive counts + entries window in code.
  const all = [...byToken.values()].sort((a, b) => {
    const diff = safeBig(b.blockNumber) - safeBig(a.blockNumber);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });

  const total = all.length;
  const assetCount = all.filter((e) => e.variant === 0).length;
  const stablecoinCount = all.filter((e) => e.variant === 1).length;
  const entries = all.slice(0, MAX_ENTRIES);

  // fromBlock / toBlock = observed min / max block among entries (honest range).
  let minB = 0n;
  let maxB = 0n;
  for (const e of all) {
    const b = safeBig(e.blockNumber);
    if (b === 0n) continue;
    if (minB === 0n || b < minB) minB = b;
    if (b > maxB) maxB = b;
  }

  const result: B20RegistryResult = {
    network,
    entries,
    total,
    assetCount,
    stablecoinCount,
    fromBlock: minB.toString(),
    toBlock: maxB.toString(),
    capped: false,
  };

  // 5. Cache (non-fatal on failure).
  try {
    await kv.set(cacheKey(network), { ...result, _updatedAt: Date.now() }, { ex: KV_TTL_S });
  } catch {
    /* stale cache acceptable */
  }

  return result;
}

/**
 * Authoritative isB20 allowlist: the set of token addresses (lowercase) minted
 * by the B20Factory (B20Created, action='added'). An address is a genuine B20
 * token IFF it is in this set.
 *
 * Why this exists: the `0xb200…` prefix is a vanity-address convention, NOT a
 * proof of B20-ness. Plenty of ordinary ERC-20s deployed via CallZap (or any
 * CREATE2 vanity miner) also start with 0xb200, and because they use
 * OpenZeppelin AccessControl they emit the SAME RoleGranted/RoleRevoked/Paused
 * events. Filtering Activity by prefix alone therefore surfaces ERC-20
 * impostors as if they were B20 control actions (verified: 2 mainnet
 * "RoleRevoked" came from the CFB index fund, isB20=false). Intersecting event
 * emitters with this set drops them.
 *
 * Same WAF-safe single-address query + KV cache as the registry. Cached under
 * "b20:tokenset:cdp:{network}". Throws on CDP failure (caller decides fallback).
 */
export async function getB20TokenSet(
  network: "mainnet" | "sepolia",
): Promise<Set<string>> {
  // Fresh cache → return immediately.
  try {
    const cached = await kv.get<{ tokens: string[]; _updatedAt: number }>(
      tokenSetKey(network),
    );
    if (cached?._updatedAt && Date.now() - cached._updatedAt < FRESH_MS) {
      return new Set(cached.tokens);
    }
  } catch {
    /* ignore cache read errors — fall through to a live query */
  }

  // Same minimal WAF-safe query as the registry (address-only filter).
  const sql =
    `SELECT action, parameters ` +
    `FROM ${TABLE[network]}.events ` +
    `WHERE address = '${FACTORY_LC}' LIMIT 50000`;
  const rows = await runCdpSql(sql); // throws on failure

  const set = new Set<string>();
  for (const row of rows) {
    if (row.action !== "added") continue; // reorg-safe
    const token = (row.parameters?.token ?? "").toLowerCase();
    if (token) set.add(token);
  }

  try {
    await kv.set(
      tokenSetKey(network),
      { tokens: [...set], _updatedAt: Date.now() },
      { ex: KV_TTL_S },
    );
  } catch {
    /* stale cache acceptable */
  }

  return set;
}

/** Parse a decimal block-number string to bigint; 0n on any bad input. */
function safeBig(v: string): bigint {
  try {
    return v ? BigInt(v) : 0n;
  } catch {
    return 0n;
  }
}
