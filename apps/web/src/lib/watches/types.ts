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

/**
 * What to PREPARE when the watch fires (2026-10-01). Never executed: the alert
 * carries it, and the "Price alerts" chat renders the ordinary trade card
 * filled with it — live quote, pre-trade check, and the user's own signature.
 *   buy  → spend `amount` of the chain's cash (USDC on Base, USDG on Robinhood
 *          Chain) on the watched token
 *   sell → sell `amount` of the watched token for that cash — a number, or a
 *          quantity word the card resolves against the live balance
 */
export interface WatchTrade { side: "buy" | "sell"; amount: string }

/**
 * Checked at a fixed time instead of every 5 minutes — an AUTOMATION: "every
 * day at 09:00, if ETH is below $2,500, prepare a $50 buy". Each check stands
 * alone (no re-arm band); a check whose condition does not hold is logged to
 * the activity feed so the user can see it ran.
 */
export interface WatchCheckAt { schedule: "daily" | "weekly"; time: string; tz?: string }

export const CASH: Record<"base" | "robinhood", string> = { base: "USDC", robinhood: "USDG" };

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
  trade?: WatchTrade;
  checkAt?: WatchCheckAt;
  /** Scheduled watches only: when the next check is due, and the last one. */
  nextCheckAt?: number;
  lastCheckedAt?: number;
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
  /** The trade to prepare, when the watch carries one. */
  trade?: WatchTrade & { cash: string };
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

function usd(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return n >= 1 ? `$${n}` : `$${n.toPrecision(3)}`;
}

export function describeTrade(t: WatchTrade, symbol: string, chain: "base" | "robinhood"): string {
  const cash = CASH[chain];
  if (t.side === "buy") return `prepare a buy of ${/^\d/.test(t.amount) ? `$${t.amount}` : t.amount} of ${symbol} with ${cash}`;
  return `prepare a sale of ${t.amount} ${symbol} for ${cash}`;
}

export function describeCheck(c: WatchCheckAt): string {
  return `${c.schedule === "weekly" ? "every week" : "every day"} at ${c.time}${c.tz ? ` (${c.tz})` : ""}`;
}

/** The whole automation in one sentence — rule, timing and the prepared trade. */
export function describeWatch(w: Pick<Watch, "kind" | "direction" | "threshold" | "window" | "symbol" | "chain" | "trade" | "checkAt">): string {
  const when = w.checkAt ? `${describeCheck(w.checkAt)}, if ${describeRule(w)}` : `when ${describeRule(w)}`;
  return w.trade ? `${when}, ${describeTrade(w.trade, w.symbol, w.chain)}` : `alert me ${when}`;
}

export function describeRule(w: Pick<Watch, "kind" | "direction" | "threshold" | "window" | "symbol" | "chain">): string {
  const who = `${w.symbol} on ${CHAIN_NAME[w.chain]}`;
  if (w.kind === "price") return `${who} ${w.direction === "above" ? "rises to or above" : "falls to or below"} ${usd(w.threshold)}`;
  return `${who} is ${w.direction === "up" ? "up" : "down"} ${w.threshold}% or more over ${w.window === "1h" ? "1 hour" : "24 hours"}`;
}
