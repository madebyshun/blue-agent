/**
 * The wallet's one timeline, assembled from its three private sources:
 * the feed (automation checks, recurring-task runs, pre-trade BLOCKs), fired
 * price alerts, and action records (trades prepared and signed through Blue
 * Agent). Read by /api/timeline (SIWE) and /api/devices/feed (a linked
 * device's read-only token) — one builder, so the two never disagree.
 *
 * A source that could not be read is NAMED in `unavailable`, never silently
 * dropped (an empty list would read as "nothing happened").
 */
import { readFeed, type ActivityItem } from "@/lib/activity";
import { readAlerts } from "@/lib/watches/store";
import { listActions } from "@/lib/actions";
import { TX_CHAINS } from "@/lib/tx-chains";

const short = (a?: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a ?? "?");

export async function buildTimeline(wallet: string, max = 80): Promise<{ items: ActivityItem[]; unavailable: string[] }> {
  const unavailable: string[] = [];
  const items: ActivityItem[] = [];

  const [feed, alerts, actions] = await Promise.all([readFeed(wallet), readAlerts(wallet), listActions(wallet, 20)]);

  if (feed == null) unavailable.push("checks and runs");
  else for (const f of feed) {
    items.push({
      id: f.id, at: f.at, kind: f.kind, chain: f.chain, source: f.source,
      title: f.kind === "automation_checked" ? "Automation checked" : f.kind === "task_run" ? "Recurring task ran"
        : f.kind === "task_failed" ? "Recurring task failed" : "Trade refused by the pre-trade check",
      detail: f.text,
    });
  }

  if (alerts.status !== "ok") unavailable.push("alerts");
  else for (const a of alerts.value.alerts) {
    items.push({
      id: `alert:${a.id}`, at: a.at, kind: "alert", chain: a.chain,
      title: a.trade ? "Automation fired — trade prepared" : "Price alert fired",
      detail: a.trade ? `${a.text} Waiting for your signature in the Price alerts chat.` : a.text,
    });
  }

  if (actions.status !== "ok") unavailable.push("trades");
  else for (const r of actions.actions) {
    const p = r.params ?? {};
    // Param names as the cards record them (bank/SwapCard, bank/RhSwapCard,
    // RobinhoodSwapCard, WalletSendCard, RobinhoodBridgeCard).
    const what = r.kind === "swap" ? `${p.amountIn ?? p.amount ?? "?"} ${p.symIn ?? short(String(p.tokenIn ?? ""))} → ${p.symOut ?? short(String(p.tokenOut ?? p.token ?? ""))}`
      : r.kind === "send" ? `${p.amount ?? "?"} ${p.symbol ?? short(String(p.token ?? ""))} to ${short(String(p.to ?? ""))}`
      : `${p.amount ?? "?"} ${p.symbol ?? short(String(p.token ?? ""))} ${p.fromChain === "robinhood" ? "Robinhood → Base" : "Base → Robinhood"}`;
    const status = r.status === "confirmed" ? "confirmed" : r.status === "reverted" ? "reverted" : r.status === "submitted" ? "pending" : "prepared";
    const verdict = r.check?.verdict ? ` · pre-trade check: ${r.check.verdict}` : "";
    items.push({
      id: `trade:${r.id}`, at: r.updated_at ?? r.created_at, kind: "trade", chain: r.chain,
      title: `${r.kind === "swap" ? "Trade" : r.kind === "send" ? "Send" : "Bridge"} ${status}`,
      detail: `${what}${verdict}`,
      href: r.tx_hash ? `${TX_CHAINS[r.chain].explorer}/tx/${r.tx_hash}` : undefined,
      source: r.tx_hash ? TX_CHAINS[r.chain].explorerName : undefined,
    });
  }

  items.sort((a, b) => b.at - a.at);
  return { items: items.slice(0, max), unavailable };
}
