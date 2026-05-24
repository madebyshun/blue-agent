/**
 * Blue Sentinel — Upgrade Watcher
 *
 * Detects recent proxy contract upgrades on Base by querying
 * the EIP-1967 Upgraded(address) event log.
 *
 * Upgraded event:
 *   topic: 0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b
 *   emitted by: UUPS + Transparent proxies on upgrade
 *
 * Each cycle scans the last ~500 blocks (~15 min on Base at 2s/block).
 * Returns proxy addresses + their new implementation for audit.
 */

import { kvGet, kvSet } from "@/lib/kv";

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_RPC      = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
const ALCHEMY_KEY   = process.env.ALCHEMY_API_KEY ?? "";
const RPC_URL       = ALCHEMY_KEY
  ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
  : BASE_RPC;

// EIP-1967 Upgraded(address indexed implementation)
const UPGRADED_TOPIC = "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b";

// Blocks per 15-min cycle (Base ~2s block time)
const BLOCKS_PER_CYCLE = 450;
const MAX_UPGRADES     = 30; // cap per cycle

const LAST_BLOCK_KEY = "sentinel:upgrade:last_block";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpgradeEvent {
  proxyAddress:  string;
  newImpl:       string;
  blockNumber:   number;
  txHash:        string;
}

// ─── RPC helpers ─────────────────────────────────────────────────────────────

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal:  AbortSignal.timeout(12000),
  });
  const data = await res.json() as { result: T; error?: { message: string } };
  if (data.error) throw new Error(`RPC error: ${data.error.message}`);
  return data.result;
}

async function getLatestBlock(): Promise<number> {
  const hex = await rpc<string>("eth_blockNumber", []);
  return parseInt(hex, 16);
}

async function getLogs(fromBlock: number, toBlock: number): Promise<Array<{
  address: string;
  topics:  string[];
  data:    string;
  blockNumber: string;
  transactionHash: string;
}>> {
  return rpc("eth_getLogs", [{
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock:   `0x${toBlock.toString(16)}`,
    topics:    [UPGRADED_TOPIC],
  }]);
}

// ─── Main: discoverUpgrades ───────────────────────────────────────────────────

export async function discoverUpgrades(): Promise<UpgradeEvent[]> {
  try {
    const latestBlock = await getLatestBlock();

    // Resume from last scanned block to avoid missing events between cycles
    const savedBlock  = await kvGet<number>(LAST_BLOCK_KEY);
    const fromBlock   = savedBlock
      ? savedBlock + 1
      : latestBlock - BLOCKS_PER_CYCLE;

    // Don't scan future blocks
    if (fromBlock > latestBlock) return [];

    const logs = await getLogs(fromBlock, latestBlock);

    // Persist checkpoint
    await kvSet(LAST_BLOCK_KEY, latestBlock, 60 * 60 * 24); // 24h TTL

    const upgrades: UpgradeEvent[] = [];

    for (const log of logs.slice(0, MAX_UPGRADES)) {
      // topics[1] = indexed implementation address (padded to 32 bytes)
      const implTopic = log.topics[1];
      if (!implTopic) continue;

      // Trim 0x000000000000000000000000 prefix → 20-byte address
      const newImpl = "0x" + implTopic.slice(26);
      if (!newImpl || newImpl === "0x" + "0".repeat(40)) continue;

      upgrades.push({
        proxyAddress: log.address.toLowerCase(),
        newImpl:      newImpl.toLowerCase(),
        blockNumber:  parseInt(log.blockNumber, 16),
        txHash:       log.transactionHash,
      });
    }

    return upgrades;
  } catch (e) {
    console.error("[UpgradeWatcher] discoverUpgrades error:", e);
    return [];
  }
}
