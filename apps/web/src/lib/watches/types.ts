/**
 * Price watches (2026-10-01) — "tell me when NVDA on Robinhood Chain drops
 * below $220", "tell me if ZIP is up 20% in an hour".
 *
 * A watch is NOT a scheduled prompt. Scheduled prompts (lib/scheduled-tasks.ts)
 * run the model daily/weekly and cost chat credits per run. A watch is checked
 * every 5 minutes IN CODE, with no model call, so it is free (ShunTr,
 * 2026-10-01: free, capped at MAX_WATCHES_PER_WALLET). When one fires it
 * writes an alert the user sees in the Scheduled page's Alerts box and in the
 * "Price alerts" chat conversation.
 *
 * Where a price comes from is fixed per watch at creation, by the server:
 *   stock token (verified registry, by contract) → Chainlink oracle price;
 *     a stale oracle (weekends, market closed) never fires a price watch
 *   crypto token → its deepest GeckoTerminal pool at creation, read again by
 *     pool address each tick (batched: one call per 30 watches per chain)
 *   % change → that same pool's own 1h / 24h change (GeckoTerminal), so no
 *     price history has to be stored — the KV budget (#148) is why
 */
import type { LaunchChain } from "@/lib/launchpads/registry";

export const MAX_WATCHES_PER_WALLET = 20;
export const MAX_ALERTS_KEPT = 50;
/** A price watch that fired re-arms only after the price moves back this far. */
export const REARM_BAND = 0.01;

export type WatchKind = "price" | "change";
export type WatchDirection = "above" | "below" | "up" | "down";
export type WatchWindow = "1h" | "24h";

export interface WatchTarget {
  chain: LaunchChain;
  token: string;            // checksummed contract
  symbol: string;           // on-chain symbol (display)
  /** "stock" ⇒ price from Chainlink `feed`; "crypto" ⇒ price from `pool`. */
  asset: "stock" | "crypto";
  feed?: string;            // Chainlink feed (stock only)
  heartbeat?: number;       // feed heartbeat, seconds
  pool?: string;            // GeckoTerminal pool address (price for crypto, change for both)
  poolName?: string;
  /** Is the watched token the pool's BASE token (else its quote). */
  poolBase?: boolean;
}

export interface Watch extends WatchTarget {
  id: string;
  kind: WatchKind;
  direction: WatchDirection;   // price: above|below · change: up|down
  threshold: number;           // USD for price, percent for change
  window?: WatchWindow;        // change only
  repeat: boolean;             // false ⇒ one-shot: deactivates after firing
  active: boolean;
  armed: boolean;              // false between a fire and its re-arm
  createdAt: number;
  lastTriggeredAt?: number;
  lastError?: string;
}

export interface WatchAlert {
  id: string;
  watchId: string;
  at: number;
  chain: LaunchChain;
  token: string;
  symbol: string;
  /** The whole message, written in code from the reading. */
  text: string;
}

export interface WatchReading {
  priceUsd: number | null;
  priceSource: "chainlink" | "dexscreener" | "geckoterminal" | null;
  /** Chainlink older than 2× its heartbeat (market closed) — no price fires. */
  stale: boolean;
  change1h: number | null;
  change24h: number | null;
  /** Where the 1h/24h change came from — always a pool, even for a stock. */
  changeSource: "dexscreener" | "geckoterminal" | null;
}

export const CHAIN_NAME: Record<LaunchChain, string> = { base: "Base", robinhood: "Robinhood Chain" };

export function describeRule(w: Pick<Watch, "kind" | "direction" | "threshold" | "window" | "symbol" | "chain">): string {
  const who = `${w.symbol} on ${CHAIN_NAME[w.chain]}`;
  if (w.kind === "price") return `${who} ${w.direction === "above" ? "rises to or above" : "falls to or below"} $${w.threshold}`;
  return `${who} is ${w.direction === "up" ? "up" : "down"} ${w.threshold}% or more over ${w.window === "1h" ? "1 hour" : "24 hours"}`;
}
