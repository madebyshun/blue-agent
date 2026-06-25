/**
 * B20 Registry — reads B20Created events from B20Factory via chunked getLogs.
 *
 * Public Base RPC hard-limits getLogs to 2000 blocks per request.
 * Strategy: scan BACKWARDS from latest in 2000-block chunks; stop when we
 * have MAX_RESULTS logs or MAX_CHUNKS chunks exhausted.
 * Results are cached in Vercel KV for 120 s so subsequent calls are instant.
 *
 * B20Created event:
 *   event B20Created(
 *     address indexed token,
 *     uint8   indexed variant,
 *     string          name,
 *     string          symbol,
 *     uint8           decimals,
 *     bytes           variantEventParams
 *   )
 * topic0: 0xfd9bf2730513a1709722ff379a0844dfd8f997d600693c2bcc659e188bbdba0d
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

const CHUNK_SIZE  = 2000n;  // hard RPC block-range limit
const MAX_RESULTS = 100;
const MAX_CHUNKS  = 100;    // 200 k block scan window backwards from latest
const CACHE_TTL_S = 120;    // 2-minute KV cache

// ── Types ──────────────────────────────────────────────────────────────────

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
  network:   "mainnet" | "sepolia";
  entries:   B20RegistryEntry[];
  total:     number;
  fromBlock: string;
  toBlock:   string;
  capped:    boolean;
  error?:    string;
  cached?:   boolean;
}

// ── Cache helpers ──────────────────────────────────────────────────────────

const cacheKey = (network: string) => `b20:registry:${network}`;

async function readCache(network: string): Promise<B20RegistryResult | null> {
  try {
    return await kv.get<B20RegistryResult>(cacheKey(network));
  } catch {
    return null;
  }
}

async function writeCache(result: B20RegistryResult): Promise<void> {
  try {
    // Don't cache error results — let next request retry
    if (!result.error) {
      await kv.set(cacheKey(result.network), result, { ex: CACHE_TTL_S });
    }
  } catch { /* non-fatal */ }
}

// ── Core ───────────────────────────────────────────────────────────────────

/**
 * Returns up to MAX_RESULTS B20Created events, newest-first.
 * Scans backwards from latest block in CHUNK_SIZE=2000 increments.
 * Cache hit returns immediately; miss scans then caches.
 */
export async function getB20Registry(
  network: "mainnet" | "sepolia",
): Promise<B20RegistryResult> {
  // 1. Try KV cache first
  const cached = await readCache(network);
  if (cached) return { ...cached, cached: true };

  const net    = NETS[network];
  const client = createPublicClient({
    chain:     net.chain,
    transport: http(net.rpc, { timeout: 15_000 }),
  });
  const factory = B20_FACTORY_ADDRESS as `0x${string}`;

  // 2. Get current block
  let latest: bigint;
  try {
    latest = await client.getBlockNumber();
  } catch {
    return { network, entries: [], total: 0, fromBlock: "0", toBlock: "0", capped: false, error: "RPC unreachable" };
  }

  // Helper: typed params for getLogs — mirrors the pattern viem accepts
  const logParams = (fb: bigint, tb: bigint) => ({
    address:   factory,
    topics:    [B20_CREATED_TOPIC0] as [`0x${string}`],
    fromBlock: fb,
    toBlock:   tb,
  });

  // 3. Scan backwards in CHUNK_SIZE-block windows
  type RpcLog = Awaited<ReturnType<typeof client.getLogs>>[number];
  const allLogs: RpcLog[] = [];
  let toBlock   = latest;
  let scanFrom  = latest;   // updated to oldest fromBlock processed
  let chunks    = 0;

  while (allLogs.length < MAX_RESULTS && chunks < MAX_CHUNKS) {
    const fromBlock = toBlock >= CHUNK_SIZE ? toBlock - CHUNK_SIZE + 1n : 0n;
    scanFrom = fromBlock;

    try {
      const chunk = await client.getLogs(logParams(fromBlock, toBlock));
      allLogs.push(...chunk);
    } catch {
      // Skip this chunk (RPC hiccup) — continue to next older range
    }

    chunks++;
    if (fromBlock === 0n) break; // hit genesis
    toBlock = fromBlock - 1n;
  }

  const total  = allLogs.length;
  const capped = total > MAX_RESULTS;

  // Sort newest-first (getLogs returns oldest-first per chunk)
  const sorted = [...allLogs].sort((a, b) => {
    const diff = (b.blockNumber ?? 0n) - (a.blockNumber ?? 0n);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });

  // 4. Decode
  const entries: B20RegistryEntry[] = sorted.slice(0, MAX_RESULTS).flatMap(log => {
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
      return [{
        token,
        variant:      (variant === 1 ? 1 : 0) as 0 | 1,
        variantLabel: variant === 1 ? "STABLECOIN" : "ASSET",
        name:         a.name     ?? "",
        symbol:       a.symbol   ?? "",
        decimals:     a.decimals ?? 18,
        blockNumber:  log.blockNumber?.toString() ?? "",
        txHash:       log.transactionHash ?? "",
        explorerUrl:  `${net.explorer}/token/${token}`,
      }];
    } catch {
      return []; // skip malformed log
    }
  });

  const result: B20RegistryResult = {
    network,
    entries,
    total,
    fromBlock: scanFrom.toString(),
    toBlock:   latest.toString(),
    capped,
  };

  // 5. Cache result (only on success)
  await writeCache(result);

  return result;
}
