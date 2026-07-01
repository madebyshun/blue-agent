/**
 * B20 Watchlist — per-wallet multi-token monitoring (compliance dashboard brick).
 *
 * An issuer (e.g. a neobank running several B20 stablecoins) watches a set of
 * tokens. For each, we keep a SNAPSHOT of the compliance-critical on-chain state
 * captured when they last acknowledged it. On every view we re-inspect live and
 * DIFF live-vs-snapshot, surfacing changes ("transfers paused", "supply cap
 * lowered", "transfer policy changed"). This is pull-based change detection —
 * no cron, no push — so it adds zero new infra.
 *
 * Pure module: types + snapshot/diff functions only. No I/O, no "use server".
 * The KV read/write + live inspect live in app/app/b20/watchlist-action.ts.
 */

import type { B20Inspection } from "./inspect";

// ── Snapshot — the minimal compliance-critical state we diff on ────────────────
//
// We deliberately diff the SUPPLY CAP (a deliberate compliance lever) and NOT
// raw totalSupply: an active stablecoin mints/burns constantly, so totalSupply
// would flag "changed" on every transfer and bury the real signal. totalSupply
// is carried for display only.

export interface WatchSnapshot {
  variant:   string;                 // "ASSET" | "STABLECOIN" | "UNKNOWN"
  currency?: string;                 // stablecoin peg, when set
  paused:    { transfer: boolean; mint: boolean; burn: boolean };
  /** Per-scope policy state as a compact "open" | "blocked" | "custom#<id>" tag. */
  policy:    { transferSender: string; transferReceiver: string; transferExecutor: string; mintReceiver: string };
  supplyCap: string;                 // formatted, "uncapped", or "—"
  totalSupply: string;               // formatted — display only, never diffed
}

export interface WatchItem {
  address:    string;                // lowercase
  network:    "mainnet" | "sepolia";
  label?:     string;                // optional user label
  name?:      string;
  symbol?:    string;
  addedAt:    number;                // ms epoch
  snapshot:   WatchSnapshot;         // baseline for diffing
  snapshotAt: number;                // ms epoch the snapshot was taken/acknowledged
}

export type WatchChangeKind = "pause" | "policy" | "cap";

export interface WatchChange {
  kind:   WatchChangeKind;
  /** Severity hint for the UI: "warn" = tightening/restriction, "info" = loosening/neutral. */
  tone:   "warn" | "info";
  text:   string;                    // human-readable, e.g. "Transfers paused"
}

/** A watched token with its live state + diff vs the stored snapshot. */
export interface WatchEntryStatus {
  item:        WatchItem;
  live?:       WatchSnapshot;        // current on-chain state (absent if inspect failed)
  changes:     WatchChange[];        // diff snapshot → live (empty when in sync / unavailable)
  isB20:       boolean;
  unavailable?: boolean;             // live inspect failed — show last-known, no false "no change"
  explorerUrl: string;
}

// ── Snapshot builders ──────────────────────────────────────────────────────────

/** Compact per-scope policy tag used for stable diffing. */
function policyTag(p?: { kind: "open" | "blocked" | "custom"; policyId: string }): string {
  if (!p) return "open";
  return p.kind === "custom" ? `custom#${p.policyId}` : p.kind;
}

/** Build the diff-able snapshot from a live inspection. */
export function snapshotFromInspection(info: B20Inspection): WatchSnapshot {
  return {
    variant:   info.variant ?? "UNKNOWN",
    currency:  info.currency,
    paused: {
      transfer: !!info.paused?.transfer,
      mint:     !!info.paused?.mint,
      burn:     !!info.paused?.burn,
    },
    policy: {
      transferSender:   policyTag(info.policies?.transferSender),
      transferReceiver: policyTag(info.policies?.transferReceiver),
      transferExecutor: policyTag(info.policies?.transferExecutor),
      mintReceiver:     policyTag(info.policies?.mintReceiver),
    },
    supplyCap:   info.supplyCapFormatted ?? "—",
    totalSupply: info.totalSupplyFormatted ?? "—",
  };
}

// ── Diff ────────────────────────────────────────────────────────────────────────

const SCOPE_LABEL: Record<keyof WatchSnapshot["policy"], string> = {
  transferSender:   "transfer-sender",
  transferReceiver: "transfer-receiver",
  transferExecutor: "transfer-executor",
  mintReceiver:     "mint-receiver",
};

function prettyPolicy(tag: string): string {
  if (tag === "open")    return "open (ALWAYS_ALLOW)";
  if (tag === "blocked") return "blocked (ALWAYS_BLOCK)";
  return tag.replace("custom#", "custom policy #");
}

/**
 * Diff a baseline snapshot against the current live state. Returns the list of
 * compliance-relevant changes. `prev`/`cur` order matters: prev = acknowledged
 * baseline, cur = live now.
 */
export function diffSnapshot(prev: WatchSnapshot, cur: WatchSnapshot): WatchChange[] {
  const changes: WatchChange[] = [];

  // Pause transitions — pausing is the restrictive (warn) direction.
  const features: (keyof WatchSnapshot["paused"])[] = ["transfer", "mint", "burn"];
  const featLabel: Record<string, string> = { transfer: "Transfers", mint: "Minting", burn: "Burning" };
  for (const f of features) {
    if (prev.paused[f] !== cur.paused[f]) {
      changes.push({
        kind: "pause",
        tone: cur.paused[f] ? "warn" : "info",
        text: `${featLabel[f]} ${cur.paused[f] ? "paused" : "resumed"}`,
      });
    }
  }

  // Policy changes per scope. Tightening (→ blocked/custom) is warn; loosening
  // (→ open) is info.
  (Object.keys(SCOPE_LABEL) as (keyof WatchSnapshot["policy"])[]).forEach((scope) => {
    const before = prev.policy[scope];
    const after  = cur.policy[scope];
    if (before !== after) {
      changes.push({
        kind: "policy",
        tone: after === "open" ? "info" : "warn",
        text: `${SCOPE_LABEL[scope]} policy changed: ${prettyPolicy(before)} → ${prettyPolicy(after)}`,
      });
    }
  });

  // Supply-cap change. Lowering / setting a cap is restrictive; raising /
  // removing is loosening.
  if (prev.supplyCap !== cur.supplyCap) {
    const tightened =
      (prev.supplyCap === "uncapped" && cur.supplyCap !== "uncapped") ||
      lowered(prev.supplyCap, cur.supplyCap);
    changes.push({
      kind: "cap",
      tone: tightened ? "warn" : "info",
      text: `Supply cap changed: ${prev.supplyCap} → ${cur.supplyCap}`,
    });
  }

  return changes;
}

/** True when `cur` is a strictly smaller numeric cap than `prev` (both numeric). */
function lowered(prev: string, cur: string): boolean {
  const p = Number(prev), c = Number(cur);
  return Number.isFinite(p) && Number.isFinite(c) && c < p;
}
