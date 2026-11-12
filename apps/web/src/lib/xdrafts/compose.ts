/**
 * X drafts for @blueagent_ — composed from measured data, sent to ShunTr on
 * Telegram, posted BY HAND. Nothing here posts to X.
 *
 * Theme (ShunTr 2026-11-12): Xen's #8, "a weekend price feed ... lenders and
 * derivatives venues need a weekend price they can reliably reference", and
 * the Base stock data Blue Agent reads that Base itself does not publish
 * (after-hours and weekend pricing, oracle gaps, corporate actions). Depth at
 * $10k/$100k was planned and dropped 2026-11-12: quoteBuyImpact read NVDAc at
 * 14% for $10k where base.org shows 0.05%, so it is not publishable yet. No portfolio content. Each post stands alone so ShunTr can tag
 * Base or Xen on it.
 *
 * Format, after data bots that get read (Whale Alert, Lookonchain): one fixed
 * emoji per post type so the feed is recognisable, the headline number in the
 * first line, $CASHTAG for the share (clickable on X), one fact per line, one
 * closing line on why it matters, no hashtags, the link left for a reply.
 *
 * Calendar (Vietnam time; UTC 00:00 and 13:00):
 *          07:00                     20:00
 *   Mon    weekend, last read        Base's call for the open
 *   Tue    weekend scorecard         pre-open gaps
 *   Wed    yesterday's widest gap    pre-open gaps
 *   Thu    volume by NYSE session    corporate actions ahead
 *   Fri    yesterday's widest gap    feeds freeze tonight
 *   Sat    weekend so far            weekend so far
 *   Sun    weekend so far            weekend so far
 *
 * Copy rules, enforced in `lint`: no em dash, at most 280 characters, chains
 * by name. Every number comes from a source read below; no model writes text.
 */
import hoodLive from "@/app/api/x402/_handlers/hood-live";
import { scorecardView } from "@/lib/weekend/view";
import { readBaseSeriesDays } from "@/lib/base-stocks/base-series";
import { cryptoMove } from "@/lib/weekend/scorecard";
import { readSessionVolume } from "@/lib/weekend/sessions";
import { COINBASE_BASE_STOCKS } from "@/lib/base-stocks/coinbase-list";
import { actionIds, actionsFor } from "@/lib/base-stocks/corporate-actions";

export interface Draft { kind: string; text: string; shot: string; tag: string; problems: string[] }
type Failed = { kind: string; error: string };

const SITE = "https://app.blueagent.dev";
const sp = (n: number, d = 2) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(d)}%`;
const usd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`);
const cash = (t: string) => `$${t}`;

export function lint(text: string): string[] {
  const p: string[] = [];
  if (/\u2014/.test(text)) p.push("em dash");
  if (text.length > 280) p.push(`${text.length} characters (max 280)`);
  if (/\b(8453|4663)\b/.test(text)) p.push("chain id in copy; write the chain name");
  return p;
}

const draft = (kind: string, text: string, shot: string, tag: string): Draft => ({ kind, text, shot, tag, problems: lint(text) });
const TAG_XEN = "Xen (#8, the weekend price feed)";
const TAG_BASE = "@base (data Base does not publish)";

// ── renderers: pure, so the copy can be tested and previewed on any data ──

type Gap = { ticker: string; drift_pct: number };
type Peak = { ticker: string; drift_pct: number; abs_drift_pct: number; session: string; is_open: boolean };
type Move = { ticker: string; weekend_move_pct: number };
type Graded = { ticker: string; weekend_move_pct: number; open_gap_pct: number; hit: boolean | null };
type Record_ = { ready: boolean; hit_rate: number | null; hits: number; calls: number; weekends: number };
type Crypto = { btc_pct: number | null; eth_pct: number | null } | null;

const sortAbs = <T,>(xs: T[], f: (x: T) => number) => [...xs].sort((a, b) => Math.abs(f(b)) - Math.abs(f(a)));
const sessionWord = (s: string) => (s === "regular" ? "during market hours" : s === "premarket" ? "pre-market" : s === "afterhours" ? "after the close" : s === "weekend" ? "over the weekend" : s);

export function preOpenText(rows: Gap[]): Draft {
  if (!rows.length) throw new Error("no Base rows on the board");
  const top = sortAbs(rows, (r) => r.drift_pct).slice(0, 3);
  const wide = Math.abs(top[0].drift_pct) >= 0.5;
  const head = wide
    ? `⏱ ${cash(top[0].ticker)} is ${sp(top[0].drift_pct)} off its oracle on Base, an hour before the open.`
    : `⏱ Pre-open on Base: every stock token within 0.5% of its Chainlink feed.`;
  const lines = top.map((r) => `${cash(r.ticker)}  ${sp(r.drift_pct)}`).join("\n");
  const tail = wide ? "Outside the feed's own 0.5% step." : "Pools are tracking the oracle.";
  return draft("pre-open", `${head}\n\nPool vs Chainlink:\n${lines}\n\n${tail}`, `${SITE}/markets/drift`, wide ? TAG_BASE : "none");
}

export function yesterdayText(peaks: Peak[]): Draft {
  if (!peaks.length) throw new Error("no peaks recorded yesterday");
  const top = [...peaks].sort((a, b) => b.abs_drift_pct - a.abs_drift_pct).slice(0, 3);
  const p = top[0];
  const head = `🌙 ${cash(p.ticker)} traded ${Math.abs(p.drift_pct).toFixed(2)}% ${p.drift_pct >= 0 ? "above" : "below"} its Chainlink feed on Base ${sessionWord(p.session)} yesterday.`;
  const lines = top.slice(1).map((x) => `${cash(x.ticker)}  ${sp(x.drift_pct)}  ${sessionWord(x.session)}`).join("\n");
  const closed = top.filter((x) => !x.is_open).length;
  return draft("yesterday",
    `${head}\n\nNext widest:\n${lines}\n\n${closed} of the top ${top.length} came while NYSE was closed. Those are the hours an overnight or weekend price has to cover.`,
    `${SITE}/markets/drift`, Math.abs(p.drift_pct) >= 1 ? TAG_XEN : "none");
}

export function weekendText(rows: Move[], crypto: Crypto, last = false): Draft {
  if (!rows.length) throw new Error("no weekend reading");
  const top = sortAbs(rows, (r) => r.weekend_move_pct).slice(0, 3);
  const avg = rows.reduce((a, r) => a + r.weekend_move_pct, 0) / rows.length;
  const c = crypto?.eth_pct != null && crypto?.btc_pct != null ? `\n\nSame window: $BTC ${sp(crypto.btc_pct, 1)}, $ETH ${sp(crypto.eth_pct, 1)}.` : "";
  const head = last
    ? `📅 Before Monday's open, Base priced ${rows.length} stock tokens ${sp(avg)} on average vs Friday's close.`
    : `📅 NYSE is shut. On Base, ${rows.length} stock tokens are ${sp(avg)} on average vs Friday's close.`;
  return draft(last ? "weekend-last" : "weekend",
    `${head}\n\n${top.map((r) => `${cash(r.ticker)}  ${sp(r.weekend_move_pct)}`).join("\n")}${c}\n\nThe Chainlink feeds still show Friday. Graded at the open.`,
    `${SITE}/markets/weekend`, TAG_XEN);
}

export function callText(rows: Move[]): Draft {
  if (!rows.length) throw new Error("no call taken");
  const calls = rows.filter((r) => Math.abs(r.weekend_move_pct) >= 0.5);
  const up = calls.filter((r) => r.weekend_move_pct > 0).map((r) => cash(r.ticker));
  const down = calls.filter((r) => r.weekend_move_pct < 0).map((r) => cash(r.ticker));
  const lines = [up.length ? `Up: ${up.join(" ")}` : "", down.length ? `Down: ${down.join(" ")}` : ""].filter(Boolean).join("\n") || "No stock moved 0.5% or more. All flat.";
  return draft("call",
    `📍 Base's call for today's open, from where stock tokens traded Sunday night vs Friday's close:\n\n${lines}\n\nMoves under 0.5% count as flat. Graded after the bell.`,
    `${SITE}/markets/weekend`, TAG_XEN);
}

export function scorecardText(rows: Graded[], s: Record_): Draft {
  if (!rows.length) throw new Error("no graded weekend");
  const calls = rows.filter((r) => r.hit !== null), hits = calls.filter((r) => r.hit).length;
  const big = sortAbs(rows, (r) => r.open_gap_pct)[0];
  const meanMove = rows.reduce((a, r) => a + Math.abs(r.weekend_move_pct), 0) / rows.length;
  const meanGap = rows.reduce((a, r) => a + Math.abs(r.open_gap_pct), 0) / rows.length;
  const record = s.ready && s.hit_rate != null ? `${Math.round(s.hit_rate * 100)}% over ${s.weekends} weekends` : `${s.hits} of ${s.calls} over ${s.weekends} weekends`;
  return draft("scorecard",
    `📊 Weekend scorecard: Base called ${hits} of ${calls.length} opens right.\n\nBase moved ${meanMove.toFixed(1)}% on average over the weekend. The open moved ${meanGap.toFixed(1)}%.\nBiggest gap: ${cash(big.ticker)} ${sp(big.open_gap_pct)}\n\nRecord: ${record}.`,
    `${SITE}/markets/weekend`, TAG_XEN);
}

export function sessionsText(v: { share: { open: number; nights: number; weekend: number }; total_usd: number; tickers: unknown[]; weeks: number }): Draft {
  return draft("sessions",
    `🕰 ${Math.round(100 - v.share.open)}% of stock token volume on Base traded while NYSE was closed.\n\nNYSE open  ${Math.round(v.share.open)}%\nNights, pre/post  ${Math.round(v.share.nights)}%\nWeekends  ${Math.round(v.share.weekend)}%\n\n${usd(v.total_usd)} across ${v.tickers.length} stock tokens, last ${v.weeks} weeks.`,
    `${SITE}/markets/weekend`, TAG_BASE);
}

export function actionsText(items: { ticker: string; type: string; announced_at: string | null }[]): Draft {
  if (!items.length) throw new Error("no announced actions");
  const lines = items.slice(0, 3).map((a) => `${cash(a.ticker)}  ${a.type}${a.announced_at ? `, announced ${a.announced_at.slice(5, 10).replace("-", "/")}` : ""}`).join("\n");
  return draft("actions",
    `🧾 ${items.length} corporate action${items.length > 1 ? "s" : ""} announced on chain for stock tokens on Base, not yet applied:\n\n${lines}\n\nPosted on the token before multiplier() changes.`,
    `${SITE}/markets`, TAG_BASE);
}

export function fridayText(last: Graded[] | null, weekendShare: number | null): Draft {
  const avgMove = last?.length ? last.reduce((a, r) => a + Math.abs(r.weekend_move_pct), 0) / last.length : null;
  const avgGap = last?.length ? last.reduce((a, r) => a + Math.abs(r.open_gap_pct), 0) / last.length : null;
  const lines = [
    weekendShare != null ? `${Math.round(weekendShare)}% of stock token volume on Base trades on weekends.` : "",
    avgMove != null && avgGap != null ? `Last weekend Base moved ${avgMove.toFixed(1)}% on average. Monday's open moved ${avgGap.toFixed(1)}%.` : "",
  ].filter(Boolean).join("\n");
  if (!lines) throw new Error("no weekend history to cite");
  return draft("friday",
    `🔒 Chainlink feeds for stock tokens on Base stop at 8pm ET tonight. Pools don't.\n\n${lines}\n\nWhat Base prices this weekend, graded Monday.`,
    `${SITE}/markets/weekend`, TAG_XEN);
}

// ── readers ────────────────────────────────────────────────────────────────

async function boardRows(): Promise<Gap[]> {
  const r = await hoodLive(new Request("https://blueagent.dev/api/x402/hood-live", { method: "POST", body: JSON.stringify({ chain: "base" }) }));
  if (!r.ok) throw new Error(`hood-live ${r.status}`);
  const j = (await r.json()) as { rows?: { ticker: string; drift_pct: number | null }[] };
  return (j.rows ?? []).filter((x): x is Gap => x.drift_pct != null);
}

export async function preOpen() { return preOpenText(await boardRows()); }

export async function yesterdayGaps(now: Date) {
  const day = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");
  const [read] = await readBaseSeriesDays([day]);
  if (read.status !== "hit") throw new Error(`archive ${day}: ${read.status}`);
  return yesterdayText(read.value.peaks);
}

export async function weekendSoFar(now: Date, last = false) {
  const card = await scorecardView({ limit: 1 });
  if (card === "error") throw new Error("scorecard unreadable");
  const view = card.live ?? card.pending;
  if (!view || !view.rows.length) throw new Error("no weekend reading");
  const freeze = Math.max(...view.rows.map((r) => r.close_round_at));
  const c = await cryptoMove(new Date(freeze * 1000).toISOString(), now.toISOString()).catch(() => null);
  return weekendText(view.rows, c, last);
}

export async function theCall() {
  const card = await scorecardView({ limit: 1 });
  if (card === "error") throw new Error("scorecard unreadable");
  const view = card.pending ?? card.live;
  if (!view) throw new Error("no call taken this weekend");
  return callText(view.rows);
}

export async function scorecard() {
  const card = await scorecardView({ limit: 1 });
  if (card === "error") throw new Error("scorecard unreadable");
  if (!card.weekends[0]) throw new Error("no graded weekend");
  return scorecardText(card.weekends[0].rows, card.summary);
}

export async function sessions() {
  const v = await readSessionVolume();
  if (!v) throw new Error("no complete session-volume record yet");
  return sessionsText({ share: v.share, total_usd: v.total_usd, tickers: v.tickers, weeks: v.window.weeks });
}

export async function corporateActions() {
  const ids = await actionIds();
  const tokens = [...new Set(ids.map((x) => x.token.toLowerCase()))];
  const items: { ticker: string; type: string; announced_at: string | null }[] = [];
  for (const t of tokens) {
    const { actions } = await actionsFor(t);
    const ticker = COINBASE_BASE_STOCKS.find((s) => s.token.toLowerCase() === t)?.ticker ?? t.slice(0, 8);
    for (const a of actions) if (a.status === "announced") items.push({ ticker, type: a.type, announced_at: a.announced_at });
  }
  items.sort((a, b) => String(b.announced_at).localeCompare(String(a.announced_at)));
  return actionsText(items);
}

export async function fridayFreeze() {
  const [card, v] = await Promise.all([scorecardView({ limit: 1 }), readSessionVolume().catch(() => null)]);
  const last = card !== "error" && card.weekends[0] ? card.weekends[0].rows : null;
  return fridayText(last, v?.share.weekend ?? null);
}

/** What the cron sends for this slot. `slot` is the UTC hour, 0 or 13. */
export async function draftsFor(now: Date, slot: 0 | 13): Promise<(Draft | Failed)[]> {
  const dow = now.getUTCDay(); // 0 Sun .. 6 Sat
  const plan: Record<number, [string, () => Promise<Draft>]> = slot === 0
    ? {
        0: ["weekend", () => weekendSoFar(now)],
        1: ["weekend-last", () => weekendSoFar(now, true)],
        2: ["scorecard", scorecard],
        3: ["yesterday", () => yesterdayGaps(now)],
        4: ["sessions", sessions],
        5: ["yesterday", () => yesterdayGaps(now)],
        6: ["weekend", () => weekendSoFar(now)],
      }
    : {
        0: ["weekend", () => weekendSoFar(now)],
        1: ["call", theCall],
        2: ["pre-open", preOpen],
        3: ["pre-open", preOpen],
        4: ["actions", corporateActions],
        5: ["friday", fridayFreeze],
        6: ["weekend", () => weekendSoFar(now)],
      };
  const [kind, fn] = plan[dow];
  try { return [await fn()]; } catch (e) { return [{ kind, error: (e as Error).message.slice(0, 160) }]; }
}

// ── delivery ───────────────────────────────────────────────────────────────

export const KV_DRAFTS_CHAT = "xdrafts:chat:v1";

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The Telegram message for one draft: the post in a copyable block, then checks. */
export function telegramText(d: Draft | Failed, now: Date): string {
  const when = now.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  if ("error" in d) return `<b>Draft · ${escHtml(d.kind)}</b> · ${when}\nNot composed: ${escHtml(d.error)}. Nothing to post this slot.`;
  const checks = d.problems.length ? `⚠️ ${escHtml(d.problems.join(", "))}` : `✓ no em dash · ${d.text.length}/280 · chain by name`;
  return `<b>Draft · ${escHtml(d.kind)}</b> · ${when}\n\n<pre>${escHtml(d.text)}</pre>\n${checks}\n🏷 Tag: ${escHtml(d.tag)}\n📸 ${escHtml(d.shot)} (link goes in a reply)\nPost by hand on @blueagent_.`;
}
