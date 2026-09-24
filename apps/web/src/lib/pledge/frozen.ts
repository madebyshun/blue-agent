/**
 * The frozen pledge ledger — the committed, verified record the page serves.
 *
 * ─── Why a static file feeds a page whose whole promise is "read live" ──────
 *
 * The pledge window CLOSED on 2026-08-24 (config.ts). After a deadline the set
 * of eligible transfers is FINAL — nothing new can land, so a live re-scan on
 * every request buys nothing and risks everything. And the live sources have,
 * in fact, gone wrong in the one direction this page cannot tolerate:
 *
 *   • Moralis (Base indexer)  → 401 once the key lapsed.
 *   • Blockscout (RH indexer) → 403 behind Cloudflare.
 *   • Base RPC                → rate-limited mid-scan.
 *   • RH RPC                  → returned a SHORT list — 10 of 18 transfers.
 *
 * That last one is the failure `sources.ts` names as indistinguishable from
 * theft: a holder opens the ledger, does not see their pledge, and concludes it
 * was taken. It was observed in production (RH showing 10 wallets / 10 txs
 * against a true 16 / 18) and is the reason this file exists.
 *
 * So the eligible set was reconstructed once, exhaustively, from on-chain
 * Transfer logs on BOTH chains — every range scanned, every transfer carrying
 * its own tx hash and block timestamp, deadline-filtered — and committed here.
 * It is not a cache and not a guess: every row below links to an explorer and
 * can be checked by anyone. `fetchFrozenChain` serves it through the exact same
 * `SourceResult` contract the live adapters use, so all the downstream
 * aggregation, denomination and rendering is unchanged — only the provenance,
 * reported honestly as `source: "frozen"`, is different.
 *
 * ─── Why this validates instead of trusting the file ────────────────────────
 *
 * Same reason as `sales.ts`: `resolveJsonModule` widens every string to
 * `string`, so a typo in a committed hash, a wallet that is not an address, or
 * a per-chain total that no longer matches its transfers is NOT a type error
 * and nothing would catch it. `loadFrozen()` runs at module scope, so a
 * malformed file fails the BUILD rather than reaching a holder — and it
 * re-derives each chain's transfer count, wallet count and raw-unit total from
 * the transfer rows and asserts them against the `_meta` block that was written
 * beside them. A file that has been edited in a way that changes the numbers
 * cannot load.
 */
import { getAddress } from "viem";
import { CHAINS, RECEIVING_WALLET, PLEDGE_DEADLINE_ISO, type ChainKey } from "./config";
import type { PledgeTx, SourceResult } from "./types";
import raw from "./frozen-transfers.json";

interface FrozenTransfer {
  chain: string;
  wallet: string;
  amount: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
}

interface FrozenChainMeta {
  token: string;
  chainId: number;
  transfers: number;
  wallets: number;
  totalRawUnits: string;
  totalTokens: string;
}

export interface FrozenLedger {
  receivingWallet: string;
  deadlineIso: string;
  transfers: PledgeTx[];
}

// The frozen ledger is a deadline-final set — it is meaningless without a
// deadline to have filtered against. If the window is reopened (config sets
// PLEDGE_DEADLINE_ISO back to null) this file must not silently serve a stale
// set, so refuse to load at all.
if (!PLEDGE_DEADLINE_ISO) {
  throw new Error("frozen.ts: PLEDGE_DEADLINE_ISO is null — a frozen ledger requires a closed window");
}
const DEADLINE_ISO: string = PLEDGE_DEADLINE_ISO;
const DEADLINE_UNIX = Math.floor(Date.parse(DEADLINE_ISO) / 1000);

function isChainKey(v: unknown): v is ChainKey {
  return typeof v === "string" && v in CHAINS;
}

function validateTransfer(input: unknown, index: number): PledgeTx {
  const t = input as Record<string, unknown>;
  const at = `transfers[${index}]`;

  if (!isChainKey(t?.chain)) {
    throw new Error(
      `frozen-transfers.json: ${at}.chain must be one of ${Object.keys(CHAINS).join(", ")}`,
    );
  }
  if (typeof t.wallet !== "string") {
    throw new Error(`frozen-transfers.json: ${at}.wallet must be a string`);
  }
  let wallet: string;
  try {
    wallet = getAddress(t.wallet); // throws on a non-address; also checksums it
  } catch {
    throw new Error(`frozen-transfers.json: ${at}.wallet is not a valid address: ${t.wallet}`);
  }
  if (typeof t.amount !== "string" || !/^\d+$/.test(t.amount) || t.amount === "0") {
    throw new Error(`frozen-transfers.json: ${at}.amount must be a positive integer string of raw units`);
  }
  if (typeof t.txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(t.txHash)) {
    throw new Error(`frozen-transfers.json: ${at}.txHash must be a 32-byte 0x hash`);
  }
  if (typeof t.blockNumber !== "number" || !Number.isInteger(t.blockNumber) || t.blockNumber <= 0) {
    throw new Error(`frozen-transfers.json: ${at}.blockNumber must be a positive integer`);
  }
  // The whole point of this file is the deadline filter. A row at or past the
  // deadline in a set that claims to be pre-deadline is a reconstruction bug,
  // not an eligible pledge — refuse it rather than publish it.
  if (typeof t.timestamp !== "number" || !Number.isInteger(t.timestamp) || t.timestamp <= 0) {
    throw new Error(`frozen-transfers.json: ${at}.timestamp must be a positive unix-seconds integer`);
  }
  if (t.timestamp >= DEADLINE_UNIX) {
    throw new Error(
      `frozen-transfers.json: ${at} has timestamp ${t.timestamp} at or past the deadline ${DEADLINE_UNIX}`,
    );
  }

  return { wallet, chain: t.chain, amount: t.amount, txHash: t.txHash, blockNumber: t.blockNumber, timestamp: t.timestamp };
}

/**
 * Read, validate and self-check the frozen file. Throws on anything malformed.
 *
 * `input` defaults to the committed file and exists so a test can drive the
 * same validation with deliberately-broken fixtures — the rejections are the
 * point, and a rejection path that is never executed is not a rejection path.
 */
export function loadFrozen(input: unknown = raw): FrozenLedger {
  const doc = input as { _meta?: Record<string, unknown>; transfers?: unknown } | null;

  const meta = doc?._meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== "object") {
    throw new Error("frozen-transfers.json: missing `_meta`");
  }
  if (typeof meta.receivingWallet !== "string" || getAddress(meta.receivingWallet) !== RECEIVING_WALLET) {
    throw new Error(
      `frozen-transfers.json: _meta.receivingWallet must equal the configured ${RECEIVING_WALLET}`,
    );
  }
  if (meta.deadlineIso !== DEADLINE_ISO) {
    throw new Error(
      `frozen-transfers.json: _meta.deadlineIso ${JSON.stringify(meta.deadlineIso)} != configured ${DEADLINE_ISO}`,
    );
  }

  const list = doc?.transfers;
  if (!Array.isArray(list)) {
    throw new Error("frozen-transfers.json: `transfers` must be an array");
  }
  const transfers = list.map(validateTransfer);

  // ─── Self-check: re-derive per-chain counts + totals from the rows and
  //     assert them against the committed `_meta`. A file edited in a way that
  //     changes the numbers fails to load rather than publishing a wrong split.
  for (const chain of Object.keys(CHAINS) as ChainKey[]) {
    const rows = transfers.filter((t) => t.chain === chain);
    const cm = meta[chain] as FrozenChainMeta | undefined;
    if (!cm || typeof cm !== "object") {
      throw new Error(`frozen-transfers.json: _meta.${chain} is missing`);
    }
    if (getAddress(cm.token) !== getAddress(CHAINS[chain].token.address)) {
      throw new Error(`frozen-transfers.json: _meta.${chain}.token != configured token`);
    }
    if (cm.chainId !== CHAINS[chain].chainId) {
      throw new Error(`frozen-transfers.json: _meta.${chain}.chainId != configured chainId`);
    }
    if (cm.transfers !== rows.length) {
      throw new Error(
        `frozen-transfers.json: _meta.${chain}.transfers=${cm.transfers} but found ${rows.length} rows`,
      );
    }
    const wallets = new Set(rows.map((r) => r.wallet.toLowerCase()));
    if (cm.wallets !== wallets.size) {
      throw new Error(
        `frozen-transfers.json: _meta.${chain}.wallets=${cm.wallets} but found ${wallets.size} distinct`,
      );
    }
    const total = rows.reduce((s, r) => s + BigInt(r.amount), 0n);
    if (cm.totalRawUnits !== total.toString()) {
      throw new Error(
        `frozen-transfers.json: _meta.${chain}.totalRawUnits=${cm.totalRawUnits} but rows sum to ${total}`,
      );
    }
  }

  return { receivingWallet: RECEIVING_WALLET, deadlineIso: DEADLINE_ISO, transfers };
}

// Validate once, at module load. A malformed committed file fails the build.
const FROZEN = loadFrozen();

/**
 * Serve the frozen transfers for one chain through the same `SourceResult`
 * contract the live adapters use. Never fails (the file was validated at load),
 * never truncates, and reports its provenance as `source: "frozen"`.
 */
export function fetchFrozenChain(chain: ChainKey): SourceResult {
  const txs = FROZEN.transfers.filter((t) => t.chain === chain);
  return { ok: true, txs, source: "frozen", truncated: false };
}
