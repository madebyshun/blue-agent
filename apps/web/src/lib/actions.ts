/**
 * Action records (G1, 2026-09-30 — docs/rebuild-5-tang-2026-09-30.md §0b).
 *
 * One record per swap / send / bridge BlueAgent prepared, carried through the
 * whole loop: what was asked (params), what was quoted, what the pre-trade
 * check said (G2), and — once the user signed — the transaction and its
 * receipt. It is the accountability layer's ledger of REAL trades, replacing a
 * track record that graded predictions nobody traded on.
 *
 * Privacy (§7 #15): a record is readable only by its wallet, through the SIWE
 * session (GET /api/actions). Only aggregates are ever published (G4).
 *
 * Proof, not trust, for the one field that matters: a tx hash is attached only
 * after the chain confirms that wallet sent it — `tx.from` for an EOA (EIP-7702
 * included), or a `UserOperationEvent` with `sender == wallet` emitted by a
 * canonical ERC-4337 EntryPoint for a smart wallet. So attaching needs no
 * session (an agent that built the trade through MCP can report its hash), and
 * nobody can pin someone else's transaction onto a wallet's history.
 *
 * Storage: `act:<id>` (TTL 180 days) and `act:w:<wallet>` (newest-first id
 * list, capped). Reads that fail are "unavailable", never "no actions".
 */
import { randomUUID } from "crypto";
import { decodeEventLog, keccak256, toHex, type Hex } from "viem";
import { kvGetProbe, kvMutate, kvSetOrThrow } from "@/lib/kv";
import { clientFor, type TxChain } from "@/lib/tx-chains";

export type ActionKind = "swap" | "send" | "bridge";
export type ActionSource = "chat" | "wallet" | "hood" | "mcp";
export type ActionStatus = "prepared" | "submitted" | "confirmed" | "reverted";

export interface ActionRecord {
  id: string;
  wallet: string;           // lowercased 0x
  kind: ActionKind;
  chain: TxChain;           // the chain the transaction is signed on
  source: ActionSource;
  created_at: number;
  updated_at: number;
  /** What was asked — token/amount/recipient as the card or builder had them. */
  params: Record<string, string | number | null>;
  /** What was quoted, in the output token's whole units when known. */
  quote?: { expected_out?: string | null; min_out?: string | null; venue?: string | null };
  /** The pre-trade check (G2) as it stood when the action was prepared. */
  check?: { verdict: string; reasons: string[] } | null;
  status: ActionStatus;
  tx_hash?: Hex;
  receipt?: { status: "success" | "reverted"; block: number; gas_used: string } | null;
}

export const ACTION_TTL_S = 180 * 24 * 3600;
export const ACTION_INDEX_CAP = 200;
const recKey = (id: string) => `act:${id}`;
const idxKey = (wallet: string) => `act:w:${wallet.toLowerCase()}`;

/**
 * Canonical ERC-4337 EntryPoints (v0.7, v0.6) — the only emitters whose
 * UserOperationEvent counts as proof a smart wallet sent a transaction.
 * MEASURED 2026-09-30 on Base 8453 and Robinhood Chain 4663: both addresses
 * hold code (32,072 / 47,380 hex chars, identical on both chains — the
 * deterministic deployment) and answer `getNonce(address,uint192)`.
 */
export const ENTRY_POINTS = new Set([
  "0x0000000071727de22e5e9d8baf0edac6f37da032",
  "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789",
]);
const USER_OP_EVENT = [{
  type: "event", name: "UserOperationEvent",
  inputs: [
    { indexed: true, name: "userOpHash", type: "bytes32" },
    { indexed: true, name: "sender", type: "address" },
    { indexed: true, name: "paymaster", type: "address" },
    { indexed: false, name: "nonce", type: "uint256" },
    { indexed: false, name: "success", type: "bool" },
    { indexed: false, name: "actualGasCost", type: "uint256" },
    { indexed: false, name: "actualGasUsed", type: "uint256" },
  ],
}] as const;
const USER_OP_TOPIC = keccak256(toHex("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)"));

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createAction(input: {
  wallet: string;
  kind: ActionKind;
  chain: TxChain;
  source: ActionSource;
  params: ActionRecord["params"];
  quote?: ActionRecord["quote"];
  check?: ActionRecord["check"];
}): Promise<ActionRecord> {
  const now = Date.now();
  const rec: ActionRecord = {
    id: randomUUID(),
    wallet: input.wallet.toLowerCase(),
    kind: input.kind,
    chain: input.chain,
    source: input.source,
    created_at: now,
    updated_at: now,
    params: input.params,
    quote: input.quote,
    check: input.check ?? null,
    status: "prepared",
  };
  await kvSetOrThrow(recKey(rec.id), rec, ACTION_TTL_S);
  // The index is a work hint; a skipped write loses the entry from the list,
  // never the record itself (it is still readable by id).
  await kvMutate<string[]>(idxKey(rec.wallet), [], (ids) =>
    [rec.id, ...ids.filter((x) => x !== rec.id)].slice(0, ACTION_INDEX_CAP));
  return rec;
}

export type ActionRead =
  | { status: "found"; record: ActionRecord }
  | { status: "missing" }
  | { status: "unavailable" };

export async function readAction(id: string): Promise<ActionRead> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return { status: "missing" };
  const p = await kvGetProbe<ActionRecord>(recKey(id));
  if (p.status === "error") return { status: "unavailable" };
  if (p.status === "miss" || !p.value) return { status: "missing" };
  return { status: "found", record: p.value };
}

// ─── Attach a transaction — proven on-chain ──────────────────────────────────

export type AttachResult =
  | { ok: true; record: ActionRecord }
  | { ok: false; code: "NOT_FOUND" | "UNAVAILABLE" | "NOT_MINED" | "NOT_SENT_BY_WALLET" | "ALREADY_ATTACHED" | "BAD_HASH"; message: string };

/** Did `wallet` send this transaction? EOA / 7702: tx.from. Smart wallet: an
 *  EntryPoint's UserOperationEvent naming it as sender. */
export async function sentByWallet(chain: TxChain, txHash: Hex, wallet: string): Promise<
  { sent: true; receipt: NonNullable<ActionRecord["receipt"]> } | { sent: false; mined: boolean }
> {
  const client = clientFor(chain);
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch {
    return { sent: false, mined: false };
  }
  const w = wallet.toLowerCase();
  let sent = receipt.from.toLowerCase() === w;
  if (!sent) {
    for (const log of receipt.logs) {
      if (!ENTRY_POINTS.has(log.address.toLowerCase()) || log.topics[0] !== USER_OP_TOPIC) continue;
      try {
        const ev = decodeEventLog({ abi: USER_OP_EVENT, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
        if ((ev.args.sender as string).toLowerCase() === w) { sent = true; break; }
      } catch { /* not decodable — not proof */ }
    }
  }
  if (!sent) return { sent: false, mined: true };
  return {
    sent: true,
    receipt: { status: receipt.status, block: Number(receipt.blockNumber), gas_used: receipt.gasUsed.toString() },
  };
}

export async function attachTx(id: string, txHash: string): Promise<AttachResult> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false, code: "BAD_HASH", message: "tx_hash must be a 0x-prefixed 32-byte hash" };
  const read = await readAction(id);
  if (read.status === "unavailable") return { ok: false, code: "UNAVAILABLE", message: "storage unavailable — nothing was changed" };
  if (read.status === "missing") return { ok: false, code: "NOT_FOUND", message: "no such action" };
  const rec = read.record;
  if (rec.tx_hash && rec.tx_hash.toLowerCase() !== txHash.toLowerCase()) {
    return { ok: false, code: "ALREADY_ATTACHED", message: "a different transaction is already attached to this action" };
  }
  const proof = await sentByWallet(rec.chain, txHash as Hex, rec.wallet);
  if (!proof.sent && proof.mined) {
    return { ok: false, code: "NOT_SENT_BY_WALLET", message: "that transaction was not sent by this action's wallet" };
  }
  if (!proof.sent) {
    // Just broadcast — no receipt yet. Held as `submitted`, UNPROVEN, and
    // verified the next time the owner reads (refreshSubmitted): proven →
    // confirmed/reverted; sent by someone else → the hash is dropped.
    const pending: ActionRecord = { ...rec, tx_hash: txHash as Hex, receipt: null, status: "submitted", updated_at: Date.now() };
    await kvSetOrThrow(recKey(id), pending, ACTION_TTL_S);
    return { ok: true, record: pending };
  }
  const updated: ActionRecord = {
    ...rec,
    tx_hash: txHash as Hex,
    receipt: proof.receipt,
    status: proof.receipt.status === "success" ? "confirmed" : "reverted",
    updated_at: Date.now(),
  };
  await kvSetOrThrow(recKey(id), updated, ACTION_TTL_S);
  return { ok: true, record: updated };
}

// ─── List (owner only — the route checks the session) ────────────────────────

export type ActionList = { status: "ok"; actions: ActionRecord[] } | { status: "unavailable" };

/** Settle a `submitted` record against the chain (see attachTx). */
export async function refreshSubmitted(rec: ActionRecord): Promise<ActionRecord> {
  if (rec.status !== "submitted" || !rec.tx_hash) return rec;
  const proof = await sentByWallet(rec.chain, rec.tx_hash, rec.wallet);
  if (!proof.sent && !proof.mined) return rec; // still pending
  const next: ActionRecord = proof.sent
    ? { ...rec, receipt: proof.receipt, status: proof.receipt.status === "success" ? "confirmed" : "reverted", updated_at: Date.now() }
    : { ...rec, tx_hash: undefined, receipt: null, status: "prepared", updated_at: Date.now() };
  try { await kvSetOrThrow(recKey(rec.id), next, ACTION_TTL_S); } catch { /* shown settled; saved next read */ }
  return next;
}

/** Pending records settled per read — bounded, so a long history is not one
 *  RPC call per row. The rest settle on later reads. */
const REFRESH_PER_READ = 5;

export async function listActions(wallet: string, limit = 50): Promise<ActionList> {
  const idx = await kvGetProbe<string[]>(idxKey(wallet));
  if (idx.status === "error") return { status: "unavailable" };
  const ids = (idx.status === "hit" ? idx.value : []).slice(0, Math.max(1, Math.min(limit, ACTION_INDEX_CAP)));
  const out: ActionRecord[] = [];
  let refreshed = 0;
  for (const id of ids) {
    const r = await readAction(id);
    if (r.status !== "found") continue;
    // An MCP-built record names a wallet nobody proved (an agent passed a
    // fromAddress). It joins the owner's history only once a transaction
    // proven to come from that wallet is attached — otherwise anyone could
    // fill a stranger's history with trades they never made.
    if (r.record.source === "mcp" && r.record.status !== "confirmed" && r.record.status !== "reverted" && r.record.status !== "submitted") continue;
    if (r.record.status === "submitted" && refreshed < REFRESH_PER_READ) {
      refreshed++;
      out.push(await refreshSubmitted(r.record));
    } else {
      out.push(r.record);
    }
  }
  return { status: "ok", actions: out };
}
