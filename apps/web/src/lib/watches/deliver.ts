/**
 * Deliver a fired watch OUTSIDE the app (plan 2026-10-06 task 2.3).
 *
 * Until 2026-10-07 a fired alert reached the user only in-app: /api/watches,
 * the timeline, and BlueBot's 3-minute poll of /api/devices/feed. A user who
 * set "tell me if ETH drops 5%" and closed the tab heard nothing.
 *
 * Telegram, through the link that already exists: a wallet is linked to a
 * Telegram account only by its owner (SIWE-minted code → /start in the bot,
 * lib/blue-hood/watchlist.ts), so a linked wallet has opted in. Unlinked
 * wallets are skipped silently — that is the default, not a failure.
 *
 * Rules:
 *   • at most once per alert: `alert.id` (<watchId>:<tickTime>) is claimed with
 *     SETNX before sending, so a re-run tick never DMs twice;
 *   • the message says what happened and links to Blue Chat. A prepared trade
 *     is named, never executable from Telegram — the user reviews and signs in
 *     their own wallet, as everywhere else;
 *   • `/alerts off` in the bot stops them (per Telegram user), `/alerts on`
 *     resumes; every message says so;
 *   • never throws: delivery is downstream of the alert being recorded, and a
 *     Telegram outage must not fail the tick.
 */
import { kvDel, kvGet, kvSet, kvSetNX } from "@/lib/kv";
import { tgUserForAddress } from "@/lib/blue-hood/watchlist";
import { esc, sendMessage } from "@/lib/telegram/bot";
import type { WatchAlert } from "./types";

const OPEN_URL = "https://app.blueagent.dev/chat?alerts=1";
/** Per-Telegram-user opt-out, set by `/alerts off` in the bot. */
const muteKey = (tgId: string | number) => `watch:tg:mute:${tgId}`;

export async function setWatchAlertsMuted(tgId: string | number, muted: boolean): Promise<void> {
  if (muted) await kvSet(muteKey(tgId), 1); else await kvDel(muteKey(tgId));
}
export async function watchAlertsMuted(tgId: string | number): Promise<boolean> {
  try { return !!(await kvGet(muteKey(tgId))); } catch { return false; }
}
const SENT_TTL_S = 7 * 86_400;

export function renderAlert(a: WatchAlert): string {
  const chain = a.chain === "robinhood" ? "Robinhood Chain 4663" : "Base 8453";
  const lines = [`🔔 <b>${esc(a.symbol || "Alert")}</b> · ${chain}`, esc(a.text)];
  if (a.trade) lines.push("A trade card is ready in Blue Chat — review the check and sign it in your own wallet. Nothing was traded.");
  lines.push(`<a href="${OPEN_URL}">Open in Blue Chat</a> · /alerts off to stop these`);
  return lines.join("\n");
}

export async function deliverAlerts(owner: string, alerts: WatchAlert[]): Promise<{ sent: number; skipped: number; failed: number }> {
  const tally = { sent: 0, skipped: 0, failed: 0 };
  if (!alerts.length) return tally;
  let tgId: string | number | null = null;
  try { tgId = await tgUserForAddress(owner); } catch { tgId = null; }
  if (!tgId || (await watchAlertsMuted(tgId))) { tally.skipped += alerts.length; return tally; }
  for (const a of alerts) {
    try {
      if (!(await kvSetNX(`watch:tg:sent:${a.id}`, 1, SENT_TTL_S))) { tally.skipped++; continue; }
      const r = await sendMessage(tgId, renderAlert(a));
      if (r.ok) tally.sent++; else tally.failed++;
    } catch { tally.failed++; }
  }
  return tally;
}
