/**
 * Morning brief — subscriptions, the daily pass, and the on-demand brief.
 *
 * KV (all small; one write per subscriber per day):
 *   brief:subs              SET of subscribed wallets (lowercase)
 *   brief:sub:<wallet>      { hourUtc, tgId, since }
 *   brief:snap:<wallet>     the last baseline Snapshot (8-day TTL)
 *   brief:sent:<w>:<day>    marker: today's brief went out (2-day TTL)
 *
 * Opt-in only, from the Telegram bot (`/brief on`), and only for a wallet its
 * owner already linked to that Telegram account (SIWE-minted link code — the
 * same link price alerts ride on). The pass re-checks the link before every
 * send, so unlinking stops the brief without anyone touching `brief:subs`.
 *
 * The pass is hourly and catches up: a subscriber is due when their hour has
 * come today and today's marker is absent, so a pass that ran out of time
 * leaves the rest for the next hour instead of skipping their day.
 */
import { kv, kvGet, kvSAdd, kvSet, kvSRem, kvTryLock, kvDel } from "@/lib/kv";
import { tgUserForAddress } from "@/lib/blue-hood/watchlist";
import { sendMessage } from "@/lib/telegram/bot";
import { baselineFor, diffSnapshots } from "./diff";
import { renderBrief, renderStocks, type BriefFormat } from "./render";
import { readHoldings, takeSnapshot } from "./snapshot";
import { stockBrief } from "./stocks";
import type { Snapshot } from "./types";

export const BRIEF_DEFAULT_HOUR_UTC = 1; // 08:00 in Vietnam (UTC+7)
const OPEN_URL = "https://app.blueagent.dev/chat";
const K_SUBS = "brief:subs";
const kSub = (w: string) => `brief:sub:${w.toLowerCase()}`;
const kSnap = (w: string) => `brief:snap:${w.toLowerCase()}`;
const kSent = (w: string, day: string) => `brief:sent:${w.toLowerCase()}:${day}`;
const SNAP_TTL_S = 8 * 86_400;
const SENT_TTL_S = 2 * 86_400;

export interface BriefSub { hourUtc: number; tgId: string; since: number }

export const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export async function subscribeBrief(wallet: string, tgId: string | number, hourUtc = BRIEF_DEFAULT_HOUR_UTC): Promise<void> {
  const w = wallet.toLowerCase();
  await kvSet(kSub(w), { hourUtc, tgId: String(tgId), since: Date.now() } satisfies BriefSub);
  await kvSAdd(K_SUBS, w);
}
export async function unsubscribeBrief(wallet: string): Promise<void> {
  await kvSRem(K_SUBS, wallet.toLowerCase());
  await kvDel(kSub(wallet));
}
export async function briefSub(wallet: string): Promise<BriefSub | null> {
  return kvGet<BriefSub>(kSub(wallet));
}

/**
 * Build a brief for `wallet` now. `commit` writes the snapshot as the new
 * baseline — the daily pass does; an on-demand look from chat does not, so
 * asking "what changed?" at noon does not move tomorrow morning's comparison.
 */
export async function buildBrief(wallet: string, fmt: BriefFormat, opts: { commit?: boolean; now?: number } = {}): Promise<{ text: string; snapshot: Snapshot; first: boolean }> {
  const now = opts.now ?? Date.now();
  const prev = await kvGet<Snapshot>(kSnap(wallet)).catch(() => null);
  const prevOk = prev && prev.v === 1 && Array.isArray(prev.holdings) ? prev : null;
  const cur = await takeSnapshot(wallet, prevOk, now);
  // The stock part never blocks the brief: unread, it is simply left out.
  const stocks = await stockBrief(cur.holdings, now).catch(() => null);
  const text = renderBrief(diffSnapshots(cur, prevOk), fmt, { now, openUrl: OPEN_URL, stocks });
  if (opts.commit || !prevOk) await kvSet(kSnap(wallet), baselineFor(cur, prevOk), SNAP_TTL_S).catch(() => {});
  return { text, snapshot: cur, first: !prevOk };
}

/** Send one subscriber's brief to Telegram and mark today done. */
export async function sendBrief(wallet: string, tgId: string, now = Date.now()): Promise<boolean> {
  const { text } = await buildBrief(wallet, "html", { commit: true, now });
  const r = await sendMessage(tgId, text);
  if (r.ok) await kvSet(kSent(wallet, dayKey(now)), 1, SENT_TTL_S).catch(() => {});
  return r.ok;
}

export interface BriefPassResult { subs: number; due: number; sent: number; failed: number; unlinked: number; deferred: number; skipped?: string }

export async function runBriefPass(now: number, deadline: number): Promise<BriefPassResult> {
  const res: BriefPassResult = { subs: 0, due: 0, sent: 0, failed: 0, unlinked: 0, deferred: 0 };
  let subs: string[];
  try { subs = (await kv.smembers(K_SUBS)) ?? []; } catch { return { ...res, skipped: "subs unreadable" }; }
  res.subs = subs.length;
  if (!subs.length) return res;
  const lock = await kvTryLock("brief:pass:lock", { at: now }, 5 * 60);
  if (lock !== "acquired") return { ...res, skipped: `lock ${lock}` };
  try {
    const hour = new Date(now).getUTCHours(), day = dayKey(now);
    const recs = await kv.mget<BriefSub | null>(...subs.map(kSub));
    const sent = await kv.mget<number | null>(...subs.map((w) => kSent(w, day)));
    const due = subs.filter((w, i) => recs[i] && !sent[i] && recs[i]!.hourUtc <= hour);
    res.due = due.length;
    for (const w of due) {
      if (Date.now() > deadline) { res.deferred++; continue; }
      const sub = recs[subs.indexOf(w)]!;
      // The link is the consent: if the wallet is no longer linked to this
      // Telegram user, nothing is sent and the subscription is dropped.
      const tg = await tgUserForAddress(w).catch(() => null);
      if (!tg || tg !== sub.tgId) { res.unlinked++; await unsubscribeBrief(w).catch(() => {}); continue; }
      try { if (await sendBrief(w, tg, now)) res.sent++; else res.failed++; }
      catch (e) { res.failed++; console.error(`[brief] ${(e as Error).message.slice(0, 200)}`); }
    }
    return res;
  } finally {
    await kvDel("brief:pass:lock");
  }
}

/**
 * The stock brief on its own: both desks' largest DEX-vs-oracle gaps, NAV on
 * Base, the US session — and, with a wallet, the stock tokens it holds.
 */
export async function buildStockBrief(wallet: string | null, fmt: BriefFormat, now = Date.now()): Promise<string> {
  const holdings = wallet ? await readHoldings(wallet).catch(() => null) : null;
  const d = await stockBrief(holdings, now);
  const b = (s: string) => (fmt === "html" ? `<b>${s}</b>` : `**${s}**`);
  const lines = [`📈 ${b("Onchain stocks")} · Base 8453 and Robinhood Chain 4663`, "", ...renderStocks(d, fmt, { held: true, movers: true })];
  if (wallet && holdings && !d.held.length) lines.splice(2, 0, "You hold no stock tokens on either chain.", "");
  lines.push("", fmt === "html"
    ? "Oracle: Chainlink. DEX: the desk's pool reading. NAV: Coinbase. A gap is a measurement, not a trade signal."
    : "_Oracle: Chainlink. DEX: the desk's pool reading. NAV: Coinbase's published value per token. A gap is a measurement, not a trade signal._");
  return lines.join("\n");
}
