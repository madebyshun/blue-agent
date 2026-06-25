/**
 * B20 Registry — reads B20Created events from B20Factory via chunked getLogs.
 *
 * COUNT STRATEGY — incremental full count:
 *   Cold (no KV): full forward scan FLOOR → latest, dedup all addresses,
 *     cache everything (total, breakdown, newest 100 entries, address set, lastScannedBlock).
 *   Warm (cache fresh, < 5 min): return immediately — zero RPC.
 *   Stale (cache ≥ 5 min): incremental scan lastScannedBlock+1 → latest, dedup
 *     new tokens against stored address set, merge and re-cache.
 *
 *   total = unique token addresses across all time → stable, never jumps.
 *   assetCount + stablecoinCount = total (both from full address set, not just 100 entries).
 *   entries = 100 newest, kept in same cache struct, merged on each update.
 *
 * FLOOR (earliest block a B20Created event could exist):
 *   Sepolia: 43_010_000  (Beryl activated ~43,018,656; buffer ~8,656 blocks)
 *   Mainnet: dynamic — max(0, latest − ⌈(now − beryl_mainnet_ts) / 2s⌉ − 5_000)
 *            Pre-activation: returns 0 entries / total = 0 (honest).
 *
 * KV key: "b20:registry:v2:{network}"  TTL: 24 h (freshness via updatedAt field).
 * Public Base RPC hard-limits getLogs to 2,000 blocks per chunk.
 */

import { createPublicClient, http, decodeEventLog } from "viem";
import { base, baseSepolia } from "viem/chains";
import { kv } from "@vercel/kv";
import { B20_FACTORY_ADDRESS } from "./inspect-abi";

// ── Network config ─────────────────────────────────────────────────────────

const NETS = {
  mainnet: {
    chain:    base,
    rpc:      "https://mainnet.base.org",
    explorer: "https://basescan.org",
  },
  sepolia: {
    chain:    baseSepolia,
    rpc:      "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
  },
} as const;

// ── Event ABI ─────────────────────────────────────────────────────────────

const B20_CREATED_ABI = [
  {
    type:   "event",
    name:   "B20Created",
    inputs: [
      { name: "token",              type: "address", indexed: true  },
      { name: "variant",            type: "uint8",   indexed: true  },
      { name: "name",               type: "string",  indexed: false },
      { name: "symbol",             type: "string",  indexed: false },
      { name: "decimals",           type: "uint8",   indexed: false },
      { name: "variantEventParams", type: "bytes",   indexed: false },
    ],
  },
] as const;

const B20_CREATED_TOPIC0 =
  "0xfd9bf2730513a1709722ff379a0844dfd8f997d600693c2bcc659e188bbdba0d" as `0x${string}`;

// ── Constants ──────────────────────────────────────────────────────────────

const CHUNK_SIZE    = 2_000n;         // RPC hard limit per getLogs call
const MAX_ENTRIES   = 100;            // newest entries kept for display
const FRESH_MS      = 5 * 60 * 1_000; // 5 min — return cache immediately if fresher than this
const KV_TTL_S      = 24 * 3_600;    // 24 h KV TTL (freshness controlled by updatedAt)

// Beryl activation timestamps (Unix seconds)
const BERYL_TS = {
  sepolia: 1_781_805_600,  // 2026-06-18 18:00 UTC
  mainnet: 1_782_410_400,  // 2026-06-25 18:00 UTC
} as const;

// Hardcoded floor for Sepolia (Beryl activation ~block 43,018,656, buffer ~8,656)
const FLOOR_SEPOLIA = 43_010_000n;

// ── Public types ───────────────────────────────────────────────────────────

export interface B20RegistryEntry {
  token:        string;
  variant:      0 | 1;
  variantLabel: "ASSET" | "STABLECOIN";
  name:         string;
  symbol:       string;
  decimals:     number;
  blockNumber:  string;
  txHash:       string;
  explorerUrl:  string;
}

export interface B20RegistryResult {
  network:         "mainnet" | "sepolia";
  entries:         B20RegistryEntry[];
  total:           number;  // unique token count — full history (not just entries)
  assetCount:      number;  // ASSET variant count from full history
  stablecoinCount: number;  // STABLECOIN variant count from full history
  fromBlock:       string;
  toBlock:         string;
  capped:          boolean; // always false with incremental strategy
  error?:          string;
  cached?:         boolean;
}

// ── Internal KV structure ──────────────────────────────────────────────────

interface RegistryCache {
  total:           number;
  assetCount:      number;
  stablecoinCount: number;
  lastScannedBlock: string;   // bigint serialized as decimal string
  addresses:       string[];  // ALL unique token addresses ever seen (lowercase), for dedup
  entries:         B20RegistryEntry[]; // newest MAX_ENTRIES for display
  updatedAt:       number;    // Date.now() ms timestamp
}

// ── KV helpers ─────────────────────────────────────────────────────────────

const cacheKey = (network: string) => `b20:registry:v2:${network}`;

async function readCache(network: string): Promise<RegistryCache | null> {
  try   { return await kv.get<RegistryCache>(cacheKey(network)); }
  catch { return null; }
}

async function writeCache(network: string, data: RegistryCache): Promise<void> {
  try   { await kv.set(cacheKey(network), data, { ex: KV_TTL_S }); }
  catch { /* non-fatal — stale cache is acceptable */ }
}

// ── Floor computation ──────────────────────────────────────────────────────

/**
 * Returns the earliest block that could contain a B20Created event.
 * Returns null if the network's Beryl has not activated yet (mainnet pre-activation).
 */
function getFloor(network: "mainnet" | "sepolia", latest: bigint): bigint | null {
  if (network === "sepolia") return FLOOR_SEPOLIA;

  // Mainnet: compute from activation timestamp
  const nowSec = Math.floor(Date.now() / 1_000);
  if (nowSec < BERYL_TS.mainnet) return null; // pre-activation — no tokens

  const secsSince   = nowSec - BERYL_TS.mainnet;
  const blocksSince = BigInt(Math.ceil(secsSince / 2)); // ~2 s/block on Base
  const buffer      = 5_000n;
  const floor       = latest > blocksSince + buffer ? latest - blocksSince - buffer : 0n;
  return floor;
}

// ── Scan helpers ───────────────────────────────────────────────────────────

type RpcLog = {
  data:             `0x${string}`;
  topics:           readonly `0x${string}`[];
  blockNumber:      bigint | null;
  transactionHash:  `0x${string}` | null;
};

// viem getLogs overloads require a helper to avoid "topics not in type" TS error
const mkLogParams = (factory: `0x${string}`, fb: bigint, tb: bigint) => ({
  address:   factory,
  topics:    [B20_CREATED_TOPIC0] as [`0x${string}`],
  fromBlock: fb,
  toBlock:   tb,
});

type GetLogsFn = (params: ReturnType<typeof mkLogParams>) => Promise<unknown[]>;

/**
 * Forward scan fromBlock → toBlock in CHUNK_SIZE windows.
 * Skips failed chunks (RPC hiccup) and continues to next window.
 */
async function scanRange(
  getLogs:   GetLogsFn,
  fromBlock: bigint,
  toBlock:   bigint,
  factory:   `0x${string}`,
): Promise<RpcLog[]> {
  const allLogs: RpcLog[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end      = cursor + CHUNK_SIZE - 1n;
    const chunkEnd = end < toBlock ? end : toBlock;
    try {
      const chunk = await getLogs(mkLogParams(factory, cursor, chunkEnd));
      allLogs.push(...(chunk as RpcLog[]));
    } catch { /* skip chunk */ }
    cursor = chunkEnd + 1n;
  }
  return allLogs;
}

function decodeLog(log: RpcLog, explorerBase: string): B20RegistryEntry | null {
  try {
    const decoded = decodeEventLog({
      abi:    B20_CREATED_ABI,
      data:   log.data,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    });
    const a = decoded.args as {
      token?:    `0x${string}`;
      variant?:  number;
      name?:     string;
      symbol?:   string;
      decimals?: number;
    };
    const token   = (a.token ?? "").toLowerCase();
    const variant = Number(a.variant ?? 0);
    if (!token) return null;
    return {
      token,
      variant:      (variant === 1 ? 1 : 0) as 0 | 1,
      variantLabel: variant === 1 ? "STABLECOIN" : "ASSET",
      name:         a.name     ?? "",
      symbol:       a.symbol   ?? "",
      decimals:     a.decimals ?? 18,
      blockNumber:  log.blockNumber?.toString() ?? "",
      txHash:       log.transactionHash ?? "",
      explorerUrl:  `${explorerBase}/token/${token}`,
    };
  } catch {
    return null;
  }
}

// ── Core ───────────────────────────────────────────────────────────────────

/**
 * Returns up to MAX_ENTRIES B20Created entries (newest-first) plus an accurate
 * full count across all history since Beryl activation.
 *
 * Call sequence:
 *   1. Read KV cache
 *   2a. Fresh   → return immediately (zero RPC after block#)
 *   2b. Stale   → incremental scan (lastScanned+1 → latest), merge, re-cache
 *   2c. Missing → full scan (floor → latest), build cache from scratch
 */
export async function getB20Registry(
  network: "mainnet" | "sepolia",
): Promise<B20RegistryResult> {
  const net     = NETS[network];
  const client  = createPublicClient({ chain: net.chain, transport: http(net.rpc, { timeout: 15_000 }) });
  const factory = B20_FACTORY_ADDRESS as `0x${string}`;

  // 1. Get current block
  let latest: bigint;
  try   { latest = await client.getBlockNumber(); }
  catch {
    return {
      network, entries: [], total: 0, assetCount: 0, stablecoinCount: 0,
      fromBlock: "0", toBlock: "0", capped: false, error: "RPC unreachable",
    };
  }

  // 2. Pre-activation check (mainnet only before Beryl)
  const floor = getFloor(network, latest);
  if (floor === null) {
    return {
      network, entries: [], total: 0, assetCount: 0, stablecoinCount: 0,
      fromBlock: "0", toBlock: latest.toString(), capped: false,
    };
  }

  // 3. Try KV cache
  const cache = await readCache(network);

  // 4. Fresh cache → return immediately
  if (cache && (Date.now() - cache.updatedAt) < FRESH_MS) {
    return {
      network,
      entries:         cache.entries,
      total:           cache.total,
      assetCount:      cache.assetCount,
      stablecoinCount: cache.stablecoinCount,
      fromBlock:       floor.toString(),
      toBlock:         cache.lastScannedBlock,
      capped:          false,
      cached:          true,
    };
  }

  // 5. Decide scan range
  let scanFrom: bigint;
  if (!cache) {
    // Cold start — full scan from Beryl floor
    scanFrom = floor;
  } else {
    const lastBlock = BigInt(cache.lastScannedBlock);
    if (lastBlock >= latest) {
      // No new blocks since last scan — just refresh updatedAt and return
      const refreshed: RegistryCache = { ...cache, updatedAt: Date.now() };
      await writeCache(network, refreshed);
      return {
        network,
        entries:         cache.entries,
        total:           cache.total,
        assetCount:      cache.assetCount,
        stablecoinCount: cache.stablecoinCount,
        fromBlock:       floor.toString(),
        toBlock:         latest.toString(),
        capped:          false,
        cached:          true,
      };
    }
    // Incremental — only new blocks
    scanFrom = lastBlock + 1n;
  }

  // 6. Scan
  const getLogsBound: GetLogsFn = (p) => client.getLogs(p);

  let rawLogs: RpcLog[] = [];
  try   { rawLogs = await scanRange(getLogsBound, scanFrom, latest, factory); }
  catch { /* graceful — fall through with empty logs */ }

  // 7. Decode + dedup against existing address set
  const seen         = new Set<string>(cache?.addresses ?? []);
  const newEntries: B20RegistryEntry[] = [];

  for (const log of rawLogs) {
    const entry = decodeLog(log, net.explorer);
    if (!entry)           continue;
    if (seen.has(entry.token)) continue; // deduplicate
    seen.add(entry.token);
    newEntries.push(entry);
  }

  // 8. Merge totals
  const addedAsset   = newEntries.filter(e => e.variant === 0).length;
  const addedStable  = newEntries.filter(e => e.variant === 1).length;

  const total          = (cache?.total          ?? 0) + newEntries.length;
  const assetCount     = (cache?.assetCount     ?? 0) + addedAsset;
  const stablecoinCount= (cache?.stablecoinCount ?? 0) + addedStable;

  // 9. Merge entries: old + new → sort newest-first → keep MAX_ENTRIES
  const merged = [...(cache?.entries ?? []), ...newEntries]
    .sort((a, b) => {
      const diff = BigInt(b.blockNumber || "0") - BigInt(a.blockNumber || "0");
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    })
    .slice(0, MAX_ENTRIES);

  // 10. Save cache
  const newCache: RegistryCache = {
    total,
    assetCount,
    stablecoinCount,
    lastScannedBlock: latest.toString(),
    addresses:        [...seen],
    entries:          merged,
    updatedAt:        Date.now(),
  };
  await writeCache(network, newCache);

  return {
    network,
    entries:         merged,
    total,
    assetCount,
    stablecoinCount,
    fromBlock:       scanFrom.toString(),
    toBlock:         latest.toString(),
    capped:          false,
  };
}
