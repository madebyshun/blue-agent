/**
 * B20 Registry — reads B20Created events from the B20Factory via eth_getLogs.
 * Server-side only (uses Node.js / viem).
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
import { B20_FACTORY_ADDRESS } from "./inspect-abi";

// ── Network config ─────────────────────────────────────────────────────────────

const NETS = {
  mainnet: {
    chain:   base,
    rpc:     "https://mainnet.base.org",
    explorer: "https://basescan.org",
  },
  sepolia: {
    chain:   baseSepolia,
    rpc:     "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
  },
} as const;

// ── Event ABI ─────────────────────────────────────────────────────────────────
// as const lets viem infer the decoded log.args shape.

const B20_CREATED_ABI = [
  {
    type:   "event",
    name:   "B20Created",
    inputs: [
      { name: "token",             type: "address", indexed: true  },
      { name: "variant",           type: "uint8",   indexed: true  },
      { name: "name",              type: "string",  indexed: false },
      { name: "symbol",            type: "string",  indexed: false },
      { name: "decimals",          type: "uint8",   indexed: false },
      { name: "variantEventParams", type: "bytes",  indexed: false },
    ],
  },
] as const;

// topic0 for B20Created — used for raw-topic filter
const B20_CREATED_TOPIC0 = "0xfd9bf2730513a1709722ff379a0844dfd8f997d600693c2bcc659e188bbdba0d" as `0x${string}`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface B20RegistryEntry {
  token:        string;
  variant:      0 | 1;                     // 0 = ASSET, 1 = STABLECOIN
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
  total:     number;         // total events seen (may be capped)
  fromBlock: string;
  toBlock:   string;
  capped:    boolean;        // true when we returned fewer logs than exist
}

// ── Core ──────────────────────────────────────────────────────────────────────

const MAX_RESULTS = 100;

/**
 * Returns up to MAX_RESULTS B20Created events for the given network,
 * sorted newest-first. Uses public Base RPC — no API key needed.
 */
export async function getB20Registry(
  network: "mainnet" | "sepolia",
): Promise<B20RegistryResult> {
  const net    = NETS[network];
  const client = createPublicClient({ chain: net.chain, transport: http(net.rpc, { timeout: 20_000 }) });
  const factory = B20_FACTORY_ADDRESS as `0x${string}`;

  const toBlock = await client.getBlockNumber();

  // Scan strategy: try from block 0 for a brand-new factory.
  // Filter by topic0 to avoid the getLogs generic type issue with AbiEvent.
  // Each log is decoded manually via decodeEventLog.
  let logs: Awaited<ReturnType<typeof client.getLogs>>;
  let fromBlock = 0n;

  const logParams = (fb: bigint) => ({
    address:   factory,
    topics:    [B20_CREATED_TOPIC0] as [`0x${string}`],
    fromBlock: fb,
    toBlock,
  });

  try {
    logs = await client.getLogs(logParams(0n));
  } catch {
    // Fallback: last ~2 million blocks (~11.5 days on Base 0.5s blocks)
    fromBlock = toBlock > 2_000_000n ? toBlock - 2_000_000n : 0n;
    logs = await client.getLogs(logParams(fromBlock));
  }

  const total  = logs.length;
  const capped = total > MAX_RESULTS;

  // Reverse so newest is first; cap
  const reversed = [...logs].reverse().slice(0, MAX_RESULTS);

  const entries: B20RegistryEntry[] = reversed.flatMap(log => {
    // Decode the raw log using the ABI
    let token    = "";
    let variant  = 0;
    let name     = "";
    let symbol   = "";
    let decimals = 18;
    try {
      const decoded = decodeEventLog({
        abi:    B20_CREATED_ABI,
        data:   log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      const a = decoded.args as {
        token?:   `0x${string}`;
        variant?: number;
        name?:    string;
        symbol?:  string;
        decimals?: number;
      };
      token    = a.token    ?? "";
      variant  = Number(a.variant  ?? 0);
      name     = a.name     ?? "";
      symbol   = a.symbol   ?? "";
      decimals = a.decimals ?? 18;
    } catch {
      return []; // skip malformed log
    }

    return [{
      token:        token.toLowerCase(),
      variant:      (variant === 1 ? 1 : 0) as 0 | 1,
      variantLabel: variant === 1 ? "STABLECOIN" : "ASSET",
      name,
      symbol,
      decimals,
      blockNumber:  log.blockNumber?.toString() ?? "",
      txHash:       log.transactionHash ?? "",
      explorerUrl:  `${net.explorer}/token/${token}`,
    }];
  });

  return {
    network,
    entries,
    total,
    fromBlock: fromBlock.toString(),
    toBlock:   toBlock.toString(),
    capped,
  };
}
