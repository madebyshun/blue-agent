"use client";
/**
 * Fired price alerts → the "🔔 Price alerts" conversation (2026-10-01).
 *
 * Alerts are written server-side by the 5-minute watch tick (lib/watches). A
 * conversation lives in the browser (localStorage + workspace sync), so the
 * browser copies them in: every minute while the tab is visible, if — and only
 * if — this wallet already has a session. It never asks for a signature (no
 * one clicked anything); a wallet that has not signed in simply gets no sync
 * until it does.
 *
 * Each alert becomes one assistant message, appended once: the newest alert
 * time already copied is remembered per wallet, and an alert at or before it
 * is skipped. The follow-up line ("↳ …") becomes a one-tap chip that checks
 * the token in chat.
 */
import { useCallback } from "react";
import { usePolling } from "@/hooks/usePolling";
import { sessionFetch } from "@/lib/session-client";
import type { ChatTask, Message, ToolLog } from "./types";
import { describeTrade, type WatchAlert } from "@/lib/watches/types";
import { pinnedTokenFor } from "@/lib/wallet/pinned-symbols";

const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/**
 * The trade an automation prepared, as the SAME tool log a chat turn would
 * produce — so the existing card renders it: Base → the convert card (live 0x
 * quote), Robinhood Chain → the Robinhood swap card (USDG ↔ token). Both run
 * the pre-trade check and wait for the user's signature; nothing here signs or
 * sends anything. The cash leg is the chain's pinned stable, by address.
 */
export function tradeToolLog(a: WatchAlert): ToolLog | null {
  const t = a.trade;
  if (!t) return null;
  const cash = pinnedTokenFor(a.chain, a.chain === "base" ? "USDC" : "USDG");
  if (!cash) return null;
  if (a.chain === "base") {
    // A watch asked for as "ETH" prices WETH's pool; the trade is in ETH itself.
    const tok = a.symbol === "ETH" ? NATIVE_ETH : a.token;
    const result = t.side === "buy"
      ? { kind: "swap", tokenIn: "USDC", tokenOut: a.symbol, amountIn: t.amount, network: "base", tokenInAddress: cash, tokenOutAddress: tok }
      : { kind: "swap", tokenIn: a.symbol, tokenOut: "USDC", amountIn: t.amount, network: "base", tokenInAddress: tok, tokenOutAddress: cash };
    return { tool: "prepare_swap", status: "done", result };
  }
  const result = t.side === "buy"
    ? { kind: "robinhood_swap", direction: "buy", token_address: a.token, token_symbol: a.symbol, token_in_address: cash, token_in_symbol: "USDG", amount: t.amount, note: "", error: "" }
    : { kind: "robinhood_swap", direction: "sell", token_address: cash, token_symbol: "USDG", token_in_address: a.token, token_in_symbol: a.symbol, amount: t.amount, note: "", error: "" };
  return { tool: "robinhood_swap", status: "done", result };
}

export const ALERTS_TASK_PREFIX = "price-alerts-";
const POLL_MS = 60_000;
const syncedKey = (w: string) => `blue_alerts_synced_${w.toLowerCase()}`;

function readSynced(w: string): number {
  try { return Number(localStorage.getItem(syncedKey(w))) || 0; } catch { return 0; }
}
function writeSynced(w: string, at: number) {
  try { localStorage.setItem(syncedKey(w), String(at)); } catch { /* best effort */ }
}

export function alertMessages(alerts: WatchAlert[], since: number): Message[] {
  return alerts
    .filter((a) => a.at > since)
    .sort((a, b) => a.at - b.at)
    .map((a) => {
      const log = tradeToolLog(a);
      const prepared = a.trade
        ? `\n\nPrepared: ${describeTrade(a.trade, a.symbol, a.chain)}. Review the live quote and the pre-trade check on the card, then sign — nothing executes unless you do.`
        : "";
      return {
        role: "assistant" as const,
        createdAt: a.at,
        content: `🔔 ${a.text}${prepared}\n↳ Check ${a.token} on ${a.chain === "base" ? "Base" : "Robinhood Chain"}`,
        ...(log ? { toolLogs: [log] } : {}),
      };
    });
}

export function usePriceAlertsSync(opts: {
  walletAddr: string | null | undefined;
  hasSession: (wallet: string) => Promise<boolean>;
  appendToAlertsTask: (wallet: string, msgs: Message[]) => void;
}) {
  const { walletAddr, hasSession, appendToAlertsTask } = opts;
  const load = useCallback(async (signal: AbortSignal) => {
    if (!walletAddr) return;
    if (!(await hasSession(walletAddr))) return;
    try {
      const r = await sessionFetch(`/api/watches?address=${walletAddr}`, { cache: "no-store", signal });
      if (!r.ok) return;
      const j = (await r.json()) as { alerts?: WatchAlert[] };
      const since = readSynced(walletAddr);
      const msgs = alertMessages(j.alerts ?? [], since);
      if (msgs.length === 0) return;
      appendToAlertsTask(walletAddr, msgs);
      writeSynced(walletAddr, Math.max(since, ...msgs.map((m) => m.createdAt ?? 0)));
    } catch { /* offline / aborted — next poll */ }
  }, [walletAddr, hasSession, appendToAlertsTask]);
  usePolling(load, POLL_MS);
}

export function alertsTask(wallet: string, model: string): ChatTask {
  const now = Date.now();
  return { id: `${ALERTS_TASK_PREFIX}${wallet.toLowerCase()}`, title: "🔔 Price alerts", messages: [], createdAt: now, updatedAt: now, model };
}
