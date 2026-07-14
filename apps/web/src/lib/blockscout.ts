// Shared on-chain data helpers for Robinhood Chain (chainId 4663).
//
// Blockscout is Robinhood Chain's canonical block explorer — the equivalent
// of Basescan/Etherscan for Base. Unlike Etherscan, Blockscout's public v2
// REST API at https://robinhoodchain.blockscout.com/api/v2/ requires NO API
// key, so we can use it directly from server routes.
//
// This module mirrors the surface of `lib/moralis.ts` (verified contract
// source, native tx history, ERC-20 token transfers, token metadata) but
// backed by Blockscout instead of Moralis+Etherscan. All fetchers fail soft
// (return null / []) — a caller degrades to "unknown" rather than 500ing.
//
// In-module TTL caches suppress duplicate lookups within a single request or
// tightly-clustered background probes: source rarely changes (60s), tx history
// churns constantly (30s).
//
// Note: some Blockscout instances rate-limit at ~10 req/s from a single IP.
// The 5s timeout + fail-soft return keeps us from hanging a route on it.

const BLOCKSCOUT_BASE = "https://robinhoodchain.blockscout.com/api/v2";
const TIMEOUT_MS = 5000;

// ─── Tiny in-module TTL cache ────────────────────────────────────────────────
type CacheEntry<T> = { v: T; exp: number };
const cache = new Map<string, CacheEntry<unknown>>();

function cget<T>(key: string): T | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (e.exp < Date.now()) { cache.delete(key); return undefined; }
  return e.v as T;
}
function cset<T>(key: string, v: T, ttlMs: number): T {
  cache.set(key, { v, exp: Date.now() + ttlMs });
  return v;
}

async function bsGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BLOCKSCOUT_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─── Contract source / verification ──────────────────────────────────────────

export interface BlockscoutContractSource {
  verified: boolean;
  sourceCode?: string;
  contractName?: string;
  compilerVersion?: string;
  isProxy?: boolean;
  implementationAddress?: string;
  licenseType?: string;
  abi?: unknown[];
}

/**
 * Verified contract source + ABI for a Robinhood Chain address.
 * Hits `/smart-contracts/{addr}`. Returns null if the address is not a
 * verified contract (Blockscout responds 404) or on any network error — the
 * caller decides how to render "unknown".
 */
export async function getBlockscoutContractSource(addr: string): Promise<BlockscoutContractSource | null> {
  const key = `src:${addr.toLowerCase()}`;
  const hit = cget<BlockscoutContractSource | null>(key);
  if (hit !== undefined) return hit;

  // Blockscout v2 shape (verified live 2026-07 against robinhoodchain.blockscout.com):
  // { name, compiler_version, source_code, abi, is_verified, license_type,
  //   proxy_type, implementations: [{ address }] }
  const d = await bsGet<{
    name?: string;
    compiler_version?: string;
    source_code?: string;
    abi?: unknown[];
    is_verified?: boolean;
    license_type?: string;
    proxy_type?: string | null;
    implementations?: { address?: string }[];
  }>(`/smart-contracts/${addr}`);

  if (!d) return cset(key, null, 60_000);

  const verified = !!d.is_verified || !!(d.source_code && d.source_code.length > 0);
  const impl = d.implementations?.[0]?.address;
  const isProxy = !!d.proxy_type && d.proxy_type !== "unknown";

  return cset<BlockscoutContractSource>(key, {
    verified,
    sourceCode: d.source_code,
    contractName: d.name,
    compilerVersion: d.compiler_version,
    isProxy,
    implementationAddress: impl && impl !== "0x0000000000000000000000000000000000000000" ? impl : undefined,
    licenseType: d.license_type,
    abi: d.abi,
  }, 60_000);
}

// ─── Address transaction history ─────────────────────────────────────────────

export interface BlockscoutTx {
  hash: string;
  timestamp: string;
  from: string;
  to: string;
  value: string;
  method?: string;
  status?: string;
}

/**
 * Last N native transactions touching an address on Robinhood Chain.
 * Hits `/addresses/{addr}/transactions`. Blockscout returns newest-first.
 * Returns [] on any error. Pagination is available via next_page_params
 * but for safety-scan use we only need the recent slice.
 */
export async function getBlockscoutAddressTransactions(
  addr: string,
  opts: { limit?: number } = {},
): Promise<BlockscoutTx[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  const key = `tx:${addr.toLowerCase()}:${limit}`;
  const hit = cget<BlockscoutTx[]>(key);
  if (hit !== undefined) return hit;

  // Blockscout v2 tx item shape (documented + verified): { hash, timestamp,
  // from: { hash }, to: { hash }, value, method, status }
  const d = await bsGet<{
    items?: Array<{
      hash?: string;
      timestamp?: string;
      from?: { hash?: string };
      to?: { hash?: string };
      value?: string;
      method?: string;
      status?: string;
    }>;
  }>(`/addresses/${addr}/transactions?filter=to%20%7C%20from`);

  if (!d?.items) return cset(key, [] as BlockscoutTx[], 30_000);

  const rows: BlockscoutTx[] = d.items.slice(0, limit).map(t => ({
    hash: t.hash ?? "",
    timestamp: t.timestamp ?? "",
    from: t.from?.hash ?? "",
    to: t.to?.hash ?? "",
    value: t.value ?? "0",
    method: t.method,
    status: t.status,
  }));
  return cset(key, rows, 30_000);
}

// ─── Address ERC-20 token transfers ──────────────────────────────────────────

export interface BlockscoutTokenTransfer {
  hash: string;
  timestamp: string;
  from: string;
  to: string;
  token: { address: string; symbol?: string; decimals?: number };
  value: string;
}

/**
 * Recent ERC-20 token transfers touching an address on Robinhood Chain.
 * Hits `/addresses/{addr}/token-transfers`. Returns [] on any error.
 */
export async function getBlockscoutTokenTransfers(
  addr: string,
  opts: { limit?: number } = {},
): Promise<BlockscoutTokenTransfer[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  const key = `tt:${addr.toLowerCase()}:${limit}`;
  const hit = cget<BlockscoutTokenTransfer[]>(key);
  if (hit !== undefined) return hit;

  const d = await bsGet<{
    items?: Array<{
      transaction_hash?: string;
      timestamp?: string;
      from?: { hash?: string };
      to?: { hash?: string };
      token?: { address?: string; symbol?: string; decimals?: string | number };
      total?: { value?: string };
    }>;
  }>(`/addresses/${addr}/token-transfers?type=ERC-20`);

  if (!d?.items) return cset(key, [] as BlockscoutTokenTransfer[], 30_000);

  const rows: BlockscoutTokenTransfer[] = d.items.slice(0, limit).map(t => ({
    hash: t.transaction_hash ?? "",
    timestamp: t.timestamp ?? "",
    from: t.from?.hash ?? "",
    to: t.to?.hash ?? "",
    token: {
      address: t.token?.address ?? "",
      symbol: t.token?.symbol,
      decimals: typeof t.token?.decimals === "string"
        ? parseInt(t.token.decimals, 10) || undefined
        : t.token?.decimals,
    },
    value: t.total?.value ?? "0",
  }));
  return cset(key, rows, 30_000);
}

// ─── ERC-20 token metadata ───────────────────────────────────────────────────

export interface BlockscoutTokenInfo {
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string;
  holders?: number;
  type?: string;
}

/**
 * ERC-20 metadata for a Robinhood Chain token address.
 * Hits `/tokens/{addr}`. Returns null on any error / non-token address.
 */
export async function getBlockscoutTokenInfo(addr: string): Promise<BlockscoutTokenInfo | null> {
  const key = `tok:${addr.toLowerCase()}`;
  const hit = cget<BlockscoutTokenInfo | null>(key);
  if (hit !== undefined) return hit;

  const d = await bsGet<{
    address?: string;
    name?: string;
    symbol?: string;
    decimals?: string | number;
    total_supply?: string;
    holders?: string | number;
    type?: string;
  }>(`/tokens/${addr}`);

  if (!d) return cset(key, null, 60_000);

  return cset<BlockscoutTokenInfo>(key, {
    address: d.address ?? addr,
    name: d.name,
    symbol: d.symbol,
    decimals: typeof d.decimals === "string" ? parseInt(d.decimals, 10) || undefined : d.decimals,
    totalSupply: d.total_supply,
    holders: typeof d.holders === "string" ? parseInt(d.holders, 10) || undefined : d.holders,
    type: d.type,
  }, 60_000);
}

// ─── URL helper — human explorer link for the response payload ───────────────

export const blockscoutUrl = (addr: string) => `https://robinhoodchain.blockscout.com/address/${addr}`;
