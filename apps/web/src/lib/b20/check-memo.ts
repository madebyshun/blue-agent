import {
  createPublicClient,
  http,
  parseEventLogs,
  isHash,
  type Hex,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { MEMO_EVENT_ABI, memoToOrderId } from "./encode";

// Network keys accepted from BOTH naming schemes so the same function serves the
// chat tool (enum "base"/"baseSepolia") and the B20 UI ("mainnet"/"sepolia").
const NETWORKS = {
  mainnet: { chain: base,        rpc: "https://mainnet.base.org", explorer: "https://basescan.org" },
  sepolia: { chain: baseSepolia, rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org" },
} as const;

type NetKey = keyof typeof NETWORKS;

/** Normalize any accepted network alias -> canonical key. Defaults to sepolia. */
function normalizeNetwork(network?: string): NetKey {
  const n = (network ?? "").toLowerCase();
  if (n === "base" || n === "mainnet" || n === "8453") return "mainnet";
  return "sepolia";
}

export interface MemoLookup {
  found: boolean;
  memo: string;          // decoded order id / payment ref ("" when not found)
  caller: string | null; // address that emitted the Memo (null when not found)
  txHash: string;
  network: NetKey;       // canonical key actually queried
  txUrl: string;
  status: "found" | "no_memo" | "pending" | "invalid";
  error?: string;
}

/**
 * Look up the B20 `Memo(address indexed caller, bytes32 indexed memo)` event on a
 * transaction. Reusable from the chat tool and the Manage-tab button.
 * Never throws — returns a status-tagged result so callers can render directly.
 */
export async function checkMemo(txHash: string, network?: string): Promise<MemoLookup> {
  const net = normalizeNetwork(network);
  const cfg = NETWORKS[net];
  const txUrl = `${cfg.explorer}/tx/${txHash}`;

  // Validate the hash shape up front so we never hit the RPC with garbage.
  if (!txHash || !isHash(txHash)) {
    return { found: false, memo: "", caller: null, txHash, network: net, txUrl, status: "invalid", error: "Invalid tx hash" };
  }

  const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpc) });

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
  } catch {
    // Not mined yet, or hash doesn't exist on this network.
    return { found: false, memo: "", caller: null, txHash, network: net, txUrl, status: "pending", error: "Transaction not found or not yet mined" };
  }

  // Decode every Memo event in the receipt; take the first that yields a non-empty memo.
  let parsed: Array<{ args: { memo?: Hex; caller?: string } }> = [];
  try {
    parsed = parseEventLogs({ abi: MEMO_EVENT_ABI, logs: receipt.logs }) as typeof parsed;
  } catch {
    parsed = [];
  }

  for (const log of parsed) {
    const memoHex = log.args.memo;
    const caller = log.args.caller ?? null;
    const memo = memoHex ? memoToOrderId(memoHex).trim() : "";
    if (memo) {
      return { found: true, memo, caller, txHash, network: net, txUrl, status: "found" };
    }
  }

  return { found: false, memo: "", caller: null, txHash, network: net, txUrl, status: "no_memo" };
}
