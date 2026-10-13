/**
 * Morning brief — "what changed in my wallet overnight" (plan 2026-10-13, A+C).
 *
 * A snapshot is what the chain said about one wallet at one moment: the tokens
 * it held on Base 8453 and Robinhood Chain 4663, and the approvals still open
 * on each. The brief is the DIFF between today's snapshot and the last one —
 * computed in code (./diff.ts), never by a model, so every line in it is a
 * reading or the difference of two readings.
 *
 * "Unread" is kept distinct from "empty" everywhere: a leg whose read failed
 * says so in the brief, and is never diffed against yesterday (a failed read
 * diffed against a full one would report every token as "gone").
 */
import type { TxChain } from "@/lib/tx-chains";

export type BriefChain = TxChain;
export const BRIEF_CHAINS: readonly BriefChain[] = ["base", "robinhood"] as const;
export const CHAIN_LABEL: Record<BriefChain, string> = { base: "Base 8453", robinhood: "Robinhood Chain 4663" };

export interface HoldRow {
  chain: BriefChain;
  /** Token contract, lowercase; "native" for ETH. */
  token: string;
  symbol: string;
  /** Human amount as read (decimal string). */
  amount: string;
  /** USD value from the holdings read's own price source; null when unpriced. */
  usd: number | null;
  /** lib/wallet/token-trust: impostor = wears a pinned symbol at another address. */
  trust: "verified" | "impostor" | "unverified";
}

export interface GrantRow {
  chain: BriefChain;
  /** `${type}|${asset}|${spender}` — stable across days. */
  key: string;
  type: "erc20" | "nft_operator" | "permit2";
  symbol: string;
  spender: string;
  allowance: string;
  unlimited: boolean;
  level: "BLOCK" | "WARN" | "INFO";
  why: string;
}

/** ok = read; partial = read, but the source cannot prove the list complete;
 *  unread = the read failed (never diffed). */
export type LegRead = "ok" | "partial" | "unread";

export interface Snapshot {
  v: 1;
  at: number;
  wallet: string;
  holdings: HoldRow[];
  holdingsRead: Record<BriefChain, LegRead>;
  grants: GrantRow[];
  /** false = the approval audit could not read every source on that chain. */
  grantsRead: Record<BriefChain, boolean>;
}

export type BalanceChange =
  | { kind: "new"; row: HoldRow }
  | { kind: "gone"; row: HoldRow }
  | { kind: "changed"; row: HoldRow; before: string; deltaPct: number | null };

export interface BriefDiff {
  wallet: string;
  at: number;
  /** null on the first brief: there is nothing to compare with yet. */
  since: number | null;
  totals: Partial<Record<BriefChain, { usd: number; before: number | null; priced: number; unpriced: number }>>;
  balances: BalanceChange[];
  /** Tokens that arrived and that the user should NOT interact with:
   *  impostors of a pinned symbol, and unpriced unknown tokens. */
  unsolicited: HoldRow[];
  grantsNew: GrantRow[];
  grantsClosed: GrantRow[];
  /** Every open grant at BLOCK or WARN right now, not only the new ones. */
  grantsRisky: GrantRow[];
  grantsOpen: Partial<Record<BriefChain, number>>;
  unread: string[];
}
