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
 * canonical ERC-4337 EntryPoint for a smart wallet (and that op's own
 * `success` decides confirmed vs reverted, not the bundle's receipt).
 *
 * …and the tx must be THIS action's, not merely the wallet's (review
 * 2026-10-01): a wallet's proof alone let anyone pair an unauthenticated MCP
 * build with any old tx that wallet ever sent and publish it as a Blue Agent
 * trade. So every attach also needs the tx to be mined no earlier than the
 * record was created (`ATTACH_SKEW_MS`), and an MCP record — whose wallet
 * nobody proved — must match the transaction its builder returned (`bind`:
 * the `to`, the head of the calldata, the value). MCP records join the
 * wallet's history (the index) only once proven that way.
 *
 * Storage: `act:<id>` (TTL 180 days) and `act:w:<wallet>` (newest-first id
 * list, capped — session records at creation, MCP records only when proven).
 * Reads that fail are "unavailable", never "no actions".
 */
import { randomUUID } from "crypto";
import { decodeEventLog, keccak256, parseUnits, toHex, type Hex, type Log } from "viem";
import { kvGetProbe, kvMutate, kvSetOrThrow, kvTryLock } from "@/lib/kv";
import { clientFor, readTokenMeta, type TxChain } from "@/lib/tx-chains";
import { recordSettled } from "@/lib/action-stats";

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
  /** What was quoted. `unit` says how expected_out / min_out are written —
   *  "base" (integer base units, e.g. 0x's buyAmount) or "whole" (decimal
   *  token units, e.g. a pool estimate). Absent ⟹ unknown, and no realized
   *  slippage is computed against it. */
  quote?: { expected_out?: string | null; min_out?: string | null; venue?: string | null; unit?: "base" | "whole" };
  /** The pre-trade check (G2) as it stood when the action was prepared. */
  check?: { verdict: string; reasons: string[] } | null;
  status: ActionStatus;
  tx_hash?: Hex;
  receipt?: { status: "success" | "reverted"; block: number; gas_used: string } | null;
  /** G4 — what a confirmed swap actually delivered, read from the receipt's
   *  own ERC-20 Transfer logs to the wallet (base units), and how far that
   *  was from the quote. null ⟹ unmeasured (native-ETH output leaves no log;
   *  a quote without a unit cannot be compared) — never 0. */
  realized?: { out: string; slippage_bps: number | null } | null;
  /** MCP only: the transaction the builder returned, which an attached tx
   *  must match (see the header). `data_head` is the first 68 bytes of the
   *  calldata as lowercase hex without 0x ("" for a plain value transfer). */
  bind?: { to: string; data_head: string; value: string } | null;
}

export const ACTION_TTL_S = 180 * 24 * 3600;
/** How much earlier than the record a tx's block may be: clock skew between
 *  our server and the chain, and a card that records a moment after
 *  broadcast. Anything older is not this action's transaction. */
export const ATTACH_SKEW_MS = 5 * 60 * 1000;
const BIND_HEAD_HEX = 136; // selector + 2 ABI words
export const ACTION_INDEX_CAP = 200;
const recKey = (id: string) => `act:${id}`;
const idxKey = (wallet: string) => `act:w:${wallet.toLowerCase()}`;
const txKey = (chain: TxChain, hash: string) => `act:tx:${chain}:${hash.toLowerCase()}`;

/**
 * One transaction backs at most one action. Without this a wallet could attach
 * the same real tx to many of its own records and every copy would count on
 * the public meter (G4). Claimed only AFTER the chain proves the wallet sent
 * it — claiming earlier would let anyone squat a pending hash and lock its
 * real owner out.
 */
async function claimTx(chain: TxChain, hash: string, id: string): Promise<"ok" | "taken" | "error"> {
  const lock = await kvTryLock(txKey(chain, hash), id, ACTION_TTL_S);
  if (lock === "acquired") return "ok";
  if (lock === "error") return "error";
  const holder = await kvGetProbe<string>(txKey(chain, hash));
  if (holder.status === "error") return "error";
  return holder.status === "hit" && String(holder.value) === id ? "ok" : "taken";
}

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
  /** MCP builders: the tx they returned — { to, data, value }. */
  built?: { to?: unknown; data?: unknown; value?: unknown } | null;
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
    ...(input.source === "mcp" ? { bind: bindOf(input.built) } : {}),
  };
  await kvSetOrThrow(recKey(rec.id), rec, ACTION_TTL_S);
  // An MCP record names a wallet nobody proved, so it is NOT indexed here — a
  // flood of them would otherwise evict the wallet's real history. It joins
  // the index when a matching transaction proves it (attachTx).
  if (rec.source !== "mcp") await indexRecord(rec);
  return rec;
}

/** The index is a work hint; a skipped write loses the entry from the list,
 *  never the record itself (it is still readable by id). */
async function indexRecord(rec: ActionRecord): Promise<void> {
  await kvMutate<string[]>(idxKey(rec.wallet), [], (ids) =>
    [rec.id, ...ids.filter((x) => x !== rec.id)].slice(0, ACTION_INDEX_CAP));
}

function bindOf(built: { to?: unknown; data?: unknown; value?: unknown } | null | undefined): ActionRecord["bind"] {
  const to = typeof built?.to === "string" ? built.to.toLowerCase() : "";
  if (!ADDR.test(to)) return null;
  const data = typeof built?.data === "string" ? built.data.toLowerCase().replace(/^0x/, "") : "";
  let value = "0";
  try { value = BigInt(typeof built?.value === "string" || typeof built?.value === "number" ? built.value : 0).toString(); } catch { value = "0"; }
  return { to, data_head: /^[0-9a-f]*$/.test(data) ? data.slice(0, BIND_HEAD_HEX) : "", value };
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
  | { ok: false; code: "NOT_FOUND" | "UNAVAILABLE" | "NOT_MINED" | "NOT_SENT_BY_WALLET" | "NOT_THIS_ACTION" | "ALREADY_ATTACHED" | "BAD_HASH"; message: string };

type Proof = { sent: true; receipt: NonNullable<ActionRecord["receipt"]>; logs: Log[]; op_success: boolean | null; block: bigint };

/** Did `wallet` send this transaction? EOA / 7702: tx.from. Smart wallet: an
 *  EntryPoint's UserOperationEvent naming it as sender — whose `success` is
 *  returned, because a reverted op sits inside a successful bundle. */
export async function sentByWallet(chain: TxChain, txHash: Hex, wallet: string): Promise<
  Proof | { sent: false; mined: boolean }
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
  let op_success: boolean | null = null;
  if (!sent) {
    for (const log of receipt.logs) {
      if (!ENTRY_POINTS.has(log.address.toLowerCase()) || log.topics[0] !== USER_OP_TOPIC) continue;
      try {
        const ev = decodeEventLog({ abi: USER_OP_EVENT, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
        if ((ev.args.sender as string).toLowerCase() === w) { sent = true; op_success = ev.args.success === true; break; }
      } catch { /* not decodable — not proof */ }
    }
  }
  if (!sent) return { sent: false, mined: true };
  return {
    sent: true,
    receipt: { status: receipt.status, block: Number(receipt.blockNumber), gas_used: receipt.gasUsed.toString() },
    logs: receipt.logs,
    op_success,
    block: receipt.blockNumber,
  };
}

/** Is this proven transaction THIS action's? Mined no earlier than the record
 *  (all sources), and for an MCP record, the transaction its builder returned.
 *  "unreadable" ⟹ the chain could not be asked — retry, never a verdict. */
async function isThisAction(rec: ActionRecord, txHash: Hex, proof: Proof): Promise<"yes" | "no" | "unreadable"> {
  const client = clientFor(rec.chain);
  try {
    const block = await client.getBlock({ blockNumber: proof.block });
    if (Number(block.timestamp) * 1000 < rec.created_at - ATTACH_SKEW_MS) return "no";
  } catch { return "unreadable"; }
  if (rec.source !== "mcp") return "yes";
  const bind = rec.bind;
  if (!bind) return "no"; // an MCP record with nothing to match proves nothing
  let tx;
  try { tx = await client.getTransaction({ hash: txHash }); } catch { return "unreadable"; }
  const input = (tx.input ?? "0x").toLowerCase().replace(/^0x/, "");
  const direct = (tx.to ?? "").toLowerCase() === bind.to;
  const toWord = bind.to.slice(2);
  if (bind.data_head) {
    // A direct call starts with the built calldata (a builder-code suffix may
    // follow); a smart-wallet or 7702 batch carries it inside its own calldata.
    return (direct && input.startsWith(bind.data_head)) || (input.includes(toWord) && input.includes(bind.data_head)) ? "yes" : "no";
  }
  // A plain value transfer: the recipient and the amount.
  const valueWord = BigInt(bind.value).toString(16).padStart(64, "0");
  return (direct && tx.value.toString() === bind.value) || (input.includes(toWord) && input.includes(valueWord)) ? "yes" : "no";
}

// ─── Realized output (G4) ────────────────────────────────────────────────────

const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const NATIVE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

/** Σ of `tokenOut` the wallet received in this receipt, in base units, from
 *  the token's own Transfer logs. null ⟹ no such log (native-ETH output, or a
 *  token that did not arrive) — unmeasured, never 0. */
export function receivedFromLogs(logs: readonly Pick<Log, "address" | "topics" | "data">[], tokenOut: string, wallet: string): bigint | null {
  if (!ADDR.test(tokenOut) || tokenOut.toLowerCase() === NATIVE_SENTINEL) return null;
  const token = tokenOut.toLowerCase();
  const w = wallet.toLowerCase();
  let sum = 0n;
  let seen = false;
  for (const log of logs) {
    if (log.address.toLowerCase() !== token || log.topics[0] !== TRANSFER_TOPIC || log.topics.length < 3) continue;
    if (`0x${String(log.topics[2]).slice(26)}`.toLowerCase() !== w) continue;
    try { sum += BigInt(log.data); seen = true; } catch { /* malformed — not counted */ }
  }
  return seen ? sum : null;
}

/** The token a swap record says it bought. */
function swapTokenOut(p: ActionRecord["params"]): string | null {
  if (typeof p.tokenOut === "string") return p.tokenOut;
  if (p.direction === "buy" && typeof p.token === "string") return p.token;
  return null; // a sell into native ETH
}

async function realizedFor(rec: ActionRecord, logs: readonly Log[]): Promise<ActionRecord["realized"]> {
  if (rec.kind !== "swap") return null;
  const tokenOut = swapTokenOut(rec.params);
  if (!tokenOut) return null;
  const got = receivedFromLogs(logs, tokenOut, rec.wallet);
  if (got === null) return null;
  let expected: bigint | null = null;
  const q = rec.quote;
  if (q?.expected_out && q.unit) {
    try {
      expected = q.unit === "base"
        ? BigInt(q.expected_out)
        : parseUnits(q.expected_out, (await readTokenMeta(rec.chain, tokenOut as Hex)).decimals);
    } catch { expected = null; }
  }
  const slippage_bps = expected !== null && expected > 0n
    ? Math.max(-10_000, Math.min(10_000, Number(((expected - got) * 10_000n) / expected)))
    : null;
  return { out: got.toString(), slippage_bps };
}

/** A record the chain just settled: receipt, status, realized output — and
 *  the public meter counts it (once; see lib/action-stats.ts). */
async function settled(rec: ActionRecord, txHash: Hex, proof: Proof): Promise<ActionRecord> {
  // A smart wallet's op can revert inside a bundle that succeeded.
  const status: ActionStatus = proof.receipt.status === "success" && proof.op_success !== false ? "confirmed" : "reverted";
  let realized: ActionRecord["realized"] = null;
  if (status === "confirmed") {
    try { realized = await realizedFor(rec, proof.logs); } catch { realized = null; }
  }
  return { ...rec, tx_hash: txHash, receipt: proof.receipt, status, realized, updated_at: Date.now() };
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
    // An MCP record's wallet is unproven, so an unmined hash is NOT stored on
    // it — that would put a pending row in a stranger's history on nothing
    // but a caller's word. The agent retries once the tx is mined.
    if (rec.source === "mcp") {
      return { ok: false, code: "NOT_MINED", message: "not mined yet — attach it again once the transaction is mined" };
    }
    // A session record: just broadcast, no receipt yet. Held as `submitted`,
    // UNPROVEN, and verified the next time the owner reads (refreshSubmitted).
    const pending: ActionRecord = { ...rec, tx_hash: txHash as Hex, receipt: null, status: "submitted", updated_at: Date.now() };
    await kvSetOrThrow(recKey(id), pending, ACTION_TTL_S);
    return { ok: true, record: pending };
  }
  const mine = await isThisAction(rec, txHash as Hex, proof);
  if (mine === "unreadable") return { ok: false, code: "UNAVAILABLE", message: "could not read the transaction from the chain — nothing was changed; retry" };
  if (mine === "no") {
    return { ok: false, code: "NOT_THIS_ACTION", message: "that transaction is not this action's — it predates the action, or it is not the transaction that was built" };
  }
  const claim = await claimTx(rec.chain, txHash, rec.id);
  if (claim === "taken") return { ok: false, code: "ALREADY_ATTACHED", message: "that transaction already backs another action" };
  if (claim === "error") return { ok: false, code: "UNAVAILABLE", message: "storage unavailable — nothing was changed" };
  const updated = await settled(rec, txHash as Hex, proof);
  await kvSetOrThrow(recKey(id), updated, ACTION_TTL_S);
  if (rec.source === "mcp") await indexRecord(updated);
  await recordSettled(updated);
  return { ok: true, record: updated };
}

// ─── List (owner only — the route checks the session) ────────────────────────

export type ActionList = { status: "ok"; actions: ActionRecord[] } | { status: "unavailable" };

/** Settle a `submitted` record against the chain (see attachTx). */
export async function refreshSubmitted(rec: ActionRecord): Promise<ActionRecord> {
  if (rec.status !== "submitted" || !rec.tx_hash) return rec;
  const proof = await sentByWallet(rec.chain, rec.tx_hash, rec.wallet);
  if (!proof.sent && !proof.mined) return rec; // still pending
  const mine = proof.sent ? await isThisAction(rec, rec.tx_hash, proof) : "no";
  if (mine === "unreadable") return rec; // settle on a later read
  const claim = proof.sent && mine === "yes" ? await claimTx(rec.chain, rec.tx_hash, rec.id) : "ok";
  if (claim === "error") return rec; // settle on a later read
  // Sent by someone else, not this action's, or already backing another of
  // this wallet's records: the hash is dropped and the record is unsigned.
  const next: ActionRecord = proof.sent && mine === "yes" && claim === "ok"
    ? await settled(rec, rec.tx_hash, proof)
    : { ...rec, tx_hash: undefined, receipt: null, status: "prepared", updated_at: Date.now() };
  try {
    await kvSetOrThrow(recKey(rec.id), next, ACTION_TTL_S);
    // Counted only once the settled record is saved — a count for a record
    // that still reads `submitted` would be counted again by nothing, but it
    // would describe a trade the owner's history does not yet show.
    await recordSettled(next);
  } catch { /* shown settled; saved (and counted) on the next read */ }
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
    // fromAddress). It is indexed only once a transaction proven to be the
    // one it built is attached; this filter is the belt to that brace, for
    // records indexed before 2026-10-01.
    if (r.record.source === "mcp" && r.record.status !== "confirmed" && r.record.status !== "reverted") continue;
    if (r.record.status === "submitted" && refreshed < REFRESH_PER_READ) {
      refreshed++;
      out.push(await refreshSubmitted(r.record));
    } else {
      out.push(r.record);
    }
  }
  return { status: "ok", actions: out };
}
