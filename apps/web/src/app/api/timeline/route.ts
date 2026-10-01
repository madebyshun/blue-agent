/**
 * /api/timeline — the wallet's one timeline (lib/activity.ts).
 *
 * GET  → { items, unavailable: string[] } newest first: fired alerts, signed
 *        trades (with the pre-trade verdict they went through), automation
 *        checks, recurring-task runs, pre-trade BLOCKs. A source that could
 *        not be read is NAMED in `unavailable`, never silently dropped.
 * POST → { kind: "task_run" | "task_failed", label, text } — a FOREGROUND
 *        recurring run reported by the browser that ran it (background runs
 *        are written by the cron tick itself). It lands only in this wallet's
 *        own private feed, so a forged entry can mislead nobody but its author.
 *
 * Wallet from the SIWE session only — same rule as /api/watches.
 */
import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { normalizeWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { rateLimit } from "@/lib/rate-limit";
import { readFeed, pushFeed, type ActivityItem } from "@/lib/activity";
import { readAlerts } from "@/lib/watches/store";
import { listActions } from "@/lib/actions";
import { TX_CHAINS } from "@/lib/tx-chains";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;

async function requireWallet(req: NextRequest): Promise<{ wallet: string } | { res: NextResponse }> {
  const session = await readSession(req);
  if (session.status === "unavailable") return { res: NextResponse.json({ error: "Could not verify session." }, { status: 503, headers: NO_STORE }) };
  if (session.status === "anonymous") return { res: NextResponse.json({ error: "Sign in with your wallet to see your activity." }, { status: 401, headers: NO_STORE }) };
  const claimed = normalizeWallet(new URL(req.url).searchParams.get("address"));
  if (claimed && claimed !== session.wallet.toLowerCase()) {
    const r = actingWalletRefusal({ status: "mismatch", sessionWallet: session.wallet });
    r.headers.set("Cache-Control", "no-store");
    return { res: r };
  }
  return { wallet: session.wallet.toLowerCase() };
}

const short = (a?: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a ?? "?");

export async function GET(req: NextRequest) {
  const auth = await requireWallet(req);
  if ("res" in auth) return auth.res;
  const unavailable: string[] = [];
  const items: ActivityItem[] = [];

  const [feed, alerts, actions] = await Promise.all([readFeed(auth.wallet), readAlerts(auth.wallet), listActions(auth.wallet, 20)]);

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
  return NextResponse.json({ items: items.slice(0, 80), unavailable }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const auth = await requireWallet(req);
  if ("res" in auth) return auth.res;
  const rl = await rateLimit(auth.wallet, "hub");
  if (!rl.success) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: NO_STORE });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE }); }
  const kind = b.kind === "task_run" || b.kind === "task_failed" ? b.kind : null;
  const label = typeof b.label === "string" ? b.label.slice(0, 80) : "";
  const text = typeof b.text === "string" ? b.text.replace(/\s+/g, " ").slice(0, 280) : "";
  if (!kind || !label) return NextResponse.json({ error: "send { kind: task_run | task_failed, label, text }" }, { status: 400, headers: NO_STORE });
  await pushFeed(auth.wallet, [{ at: Date.now(), kind, text: `${label}${text ? ` — ${text}` : ""}` }]);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
