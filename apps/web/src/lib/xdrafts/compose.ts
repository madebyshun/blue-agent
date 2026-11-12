/**
 * X drafts for @blueagent_ — composed from measured data, sent to ShunTr on
 * Telegram, posted BY HAND. Nothing here posts to X.
 *
 * Theme (ShunTr 2026-11-12): Xen's #8, "a weekend price feed ... lenders and
 * derivatives venues need a weekend price they can reliably reference", and
 * the Base stock data Blue Agent reads that Base itself does not publish
 * (after-hours and weekend pricing, oracle gaps, corporate actions). No
 * portfolio content. Each post stands alone so ShunTr can tag Base or Xen.
 * Depth at $10k/$100k was planned and dropped 2026-11-12: quoteBuyImpact read
 * NVDAc at 14% for $10k where base.org shows 0.05%, so it is not publishable.
 *
 * Voice (ShunTr 2026-11-12, after @aixbt_agent; @blueagent_ has X Premium):
 * all lowercase, no emoji, no hashtags, no cashtags, no links in the post.
 * One paragraph: what happened and when, the exact numbers with before and
 * after, the implication introduced by "so", and what the data cannot show.
 * Neutral analyst tone; never a buy or sell call.
 *
 * Calendar (Vietnam time; UTC 00:00 and 13:00):
 *          07:00                     20:00
 *   Mon    weekend, last read        base's call for the open
 *   Tue    weekend scorecard         pre-open gaps
 *   Wed    yesterday's widest gap    pre-open gaps
 *   Thu    volume by nyse session    corporate actions ahead
 *   Fri    yesterday's widest gap    feeds freeze tonight
 *   Sat    weekend so far            weekend so far
 *   Sun    weekend so far            weekend so far
 *
 * Copy rules, enforced in `lint`: lowercase, no em dash, no chain id, no
 * emoji, at most 700 characters. Every number comes from a source read
 * below; no model writes the text.
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
export const MAX_CHARS = 700;

const pct = (n: number, d = 2) => `${Math.abs(n).toFixed(d)}%`;
const usd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}b` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}m` : `$${Math.round(n / 1e3)}k`);
const tok = (t: string) => `${t.toLowerCase()}c`;
const share = (t: string) => t.toLowerCase();
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
export const dayWord = (iso: string) => { const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const updown = (n: number) => (n >= 0 ? "up" : "down");
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function lint(text: string): string[] {
  const p: string[] = [];
  if (/—/.test(text)) p.push("em dash");
  if (text.length > MAX_CHARS) p.push(`${text.length} characters (max ${MAX_CHARS})`);
  if (/\b(8453|4663)\b/.test(text)) p.push("chain id in copy; write the chain name");
  if (text !== text.toLowerCase()) p.push("not all lowercase");
  if (/\p{Extended_Pictographic}/u.test(text)) p.push("emoji");
  if (/#\w|\$[a-z]{2,}\b|https?:\/\//.test(text)) p.push("hashtag, cashtag or link in the post");
  return p;
}

const draft = (kind: string, text: string, shot: string, tag: string): Draft => {
  const t = text.toLowerCase();
  return { kind, text: t, shot, tag, problems: lint(t) };
};
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
const sessionWord = (s: string) => (s === "regular" ? "during market hours" : s === "premarket" ? "before the open" : s === "afterhours" ? "after the close" : s === "weekend" ? "over the weekend" : s);

export function preOpenText(rows: Gap[]): Draft {
  if (!rows.length) throw new Error("no Base rows on the board");
  const top = sortAbs(rows, (r) => r.drift_pct).slice(0, 3);
  const w = top[0];
  const rest = top.slice(1).map((r) => `${tok(r.ticker)} at ${pct(r.drift_pct)} ${r.drift_pct >= 0 ? "above" : "below"}`);
  const wide = Math.abs(w.drift_pct) >= 0.5;
  const so = wide
    ? `that is outside the 0.5% move the feed needs before it republishes, so a lender marking to chainlink is not seeing the price base trades at.`
    : `every gap is inside the 0.5% move the feed needs before it republishes, so the pools are tracking the oracle into the open.`;
  return draft("pre-open",
    `an hour before the us open, the widest gap between a stock token pool on base and its chainlink feed is ${tok(w.ticker)}, ${pct(w.drift_pct)} ${w.drift_pct >= 0 ? "above" : "below"} the feed. next are ${list(rest)}. ${so} which side is right is settled at the bell.`,
    `${SITE}/markets/drift`, wide ? TAG_BASE : "none");
}

export function yesterdayText(peaks: Peak[], day: string): Draft {
  if (!peaks.length) throw new Error("no peaks recorded yesterday");
  const top = [...peaks].sort((a, b) => b.abs_drift_pct - a.abs_drift_pct).slice(0, 3);
  const p = top[0];
  const rest = top.slice(1).map((x) => `${tok(x.ticker)} at ${pct(x.drift_pct)} ${sessionWord(x.session)}`);
  const closed = top.filter((x) => !x.is_open).length;
  return draft("yesterday",
    `on ${dayWord(day)}, ${tok(p.ticker)}, the ${share(p.ticker)} stock token on base, traded ${pct(p.drift_pct)} ${p.drift_pct >= 0 ? "above" : "below"} its chainlink feed ${sessionWord(p.session)}, the widest gap of any stock token on base that day. the next widest were ${list(rest)}. ${closed} of the 3 came while nyse was closed. the feed only republishes on a 0.5% move or its heartbeat, so a lender marking to it can sit on a stale price through exactly those hours. whether the pool was early or just wrong is not known until the next open.`,
    `${SITE}/markets/drift`, Math.abs(p.drift_pct) >= 1 ? TAG_XEN : "none");
}

export function weekendText(rows: Move[], crypto: Crypto, friday: string, last = false): Draft {
  if (!rows.length) throw new Error("no weekend reading");
  const top = sortAbs(rows, (r) => r.weekend_move_pct).slice(0, 3);
  const avg = rows.reduce((a, r) => a + r.weekend_move_pct, 0) / rows.length;
  const moves = top.map((r) => `${tok(r.ticker)} ${updown(r.weekend_move_pct)} ${pct(r.weekend_move_pct)}`);
  const c = crypto?.eth_pct != null && crypto?.btc_pct != null
    ? ` over the same window btc is ${updown(crypto.btc_pct)} ${pct(crypto.btc_pct, 1)} and eth ${updown(crypto.eth_pct)} ${pct(crypto.eth_pct, 1)}, so part of the move may be crypto, not the stocks.`
    : "";
  const lead = last
    ? `going into monday, ${rows.length} stock tokens on base are ${updown(avg)} ${pct(avg)} on average from their ${dayWord(friday)} close`
    : `nyse closed on ${dayWord(friday)}, and ${rows.length} stock tokens on base are ${updown(avg)} ${pct(avg)} on average from that close`;
  return draft(last ? "weekend-last" : "weekend",
    `${lead}, while their chainlink feeds still show friday's price. the biggest moves are ${list(moves)}.${c} a lender pricing these as collateral has to pick between a frozen feed and a pool that trades with crypto. which one was closer is graded at the open.`,
    `${SITE}/markets/weekend`, TAG_XEN);
}

export function callText(rows: Move[]): Draft {
  if (!rows.length) throw new Error("no call taken");
  const calls = rows.filter((r) => Math.abs(r.weekend_move_pct) >= 0.5);
  const up = calls.filter((r) => r.weekend_move_pct > 0).map((r) => tok(r.ticker));
  const down = calls.filter((r) => r.weekend_move_pct < 0).map((r) => tok(r.ticker));
  const flat = rows.length - calls.length;
  const parts = [up.length ? `${list(up)} above friday's close` : "", down.length ? `${list(down)} below ${up.length ? "it" : "friday's close"}` : ""].filter(Boolean);
  return draft("call",
    `at 22:00 utc on sunday, base priced ${parts.length ? list(parts) : "no stock token more than 0.5% from friday's close"}${flat ? `, with ${flat} more inside 0.5% and counted as flat` : ""}. that is base's call for today's open, taken before the chainlink feeds wake up, so it is a read of the weekend that no oracle gave. whether it holds is graded after the bell.`,
    `${SITE}/markets/weekend`, TAG_XEN);
}

export function scorecardText(rows: Graded[], s: Record_, friday: string): Draft {
  if (!rows.length) throw new Error("no graded weekend");
  const calls = rows.filter((r) => r.hit !== null), hits = calls.filter((r) => r.hit).length;
  const big = sortAbs(rows, (r) => r.open_gap_pct)[0];
  const meanMove = rows.reduce((a, r) => a + Math.abs(r.weekend_move_pct), 0) / rows.length;
  const meanGap = rows.reduce((a, r) => a + Math.abs(r.open_gap_pct), 0) / rows.length;
  const record = s.ready && s.hit_rate != null ? `${Math.round(s.hit_rate * 100)}% of ${s.calls} calls over ${s.weekends} weekends` : `${s.hits} of ${s.calls} calls over ${s.weekends} weekends`;
  return draft("scorecard",
    `the weekend from ${dayWord(friday)}, graded. stock token pools on base called the direction of monday's open right ${hits} times out of ${calls.length}. on average they moved ${meanMove.toFixed(1)}% over the weekend, while the open moved ${meanGap.toFixed(1)}% from friday's close. the biggest gap was ${tok(big.ticker)}, ${updown(big.open_gap_pct)} ${pct(big.open_gap_pct)} at the open. so base priced ${meanMove < meanGap ? `about ${Math.round((meanMove / meanGap) * 100)}% of the size of` : "more than"} what the weekend did. the record now stands at ${record}. one weekend is too few to say whether the pools are early or just noisy.`,
    `${SITE}/markets/weekend`, TAG_XEN);
}

export function sessionsText(v: { share: { open: number; nights: number; weekend: number }; total_usd: number; tickers: unknown[]; weeks: number }): Draft {
  return draft("sessions",
    `over the last ${v.weeks} weeks, ${usd(v.total_usd)} of stock tokens traded in dex pools on base across ${v.tickers.length} names. only ${Math.round(v.share.open)}% of it traded while nyse was open. ${Math.round(v.share.nights)}% came at night and in pre and post market, and ${Math.round(v.share.weekend)}% on weekends. so most of the market for these tokens runs when the exchange that sets their price is shut. dex volume includes arbitrage and bots, and how much of it is real demand is not known.`,
    `${SITE}/markets/weekend`, TAG_BASE);
}

export function actionsText(items: { ticker: string; type: string; announced_at: string | null }[]): Draft {
  if (!items.length) throw new Error("no announced actions");
  const top = items.slice(0, 3).map((a) => `${tok(a.ticker)} (${a.type.toLowerCase()}${a.announced_at ? `, ${dayWord(a.announced_at)}` : ""})`);
  return draft("actions",
    `coinbase has announced ${items.length} corporate actions on chain for stock tokens on base that have not been applied yet. the latest are ${list(top)}. each one is posted on the token itself before multiplier() changes, so a holder or a lender can see a dividend or split coming before the price it reports moves. the record does not say exactly when each will be applied.`,
    `${SITE}/markets`, TAG_BASE);
}

export function fridayText(last: Graded[] | null, weekendShare: number | null): Draft {
  const avgMove = last?.length ? last.reduce((a, r) => a + Math.abs(r.weekend_move_pct), 0) / last.length : null;
  const avgGap = last?.length ? last.reduce((a, r) => a + Math.abs(r.open_gap_pct), 0) / last.length : null;
  const facts = [
    weekendShare != null ? `about ${Math.round(weekendShare)}% of stock token volume on base trades on weekends` : "",
    avgMove != null && avgGap != null ? `last weekend the pools moved ${avgMove.toFixed(1)}% on average while monday's open moved ${avgGap.toFixed(1)}%` : "",
  ].filter(Boolean);
  if (!facts.length) throw new Error("no weekend history to cite");
  return draft("friday",
    `the chainlink feeds for stock tokens on base stop updating at 8pm et tonight, and the pools keep trading until monday. ${list(facts)}. so for two days the only live price for these tokens is a pool that also trades with crypto. what base prices this weekend gets graded at monday's open.`,
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
  const iso = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const [read] = await readBaseSeriesDays([iso.replaceAll("-", "")]);
  if (read.status !== "hit") throw new Error(`archive ${iso}: ${read.status}`);
  return yesterdayText(read.value.peaks, iso);
}

export async function weekendSoFar(now: Date, last = false) {
  const card = await scorecardView({ limit: 1 });
  if (card === "error") throw new Error("scorecard unreadable");
  const view = card.live ?? card.pending;
  if (!view || !view.rows.length) throw new Error("no weekend reading");
  const freeze = Math.max(...view.rows.map((r) => r.close_round_at));
  const c = await cryptoMove(new Date(freeze * 1000).toISOString(), now.toISOString()).catch(() => null);
  return weekendText(view.rows, c, view.friday, last);
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
  const w = card.weekends[0];
  if (!w) throw new Error("no graded weekend");
  return scorecardText(w.rows, card.summary, w.friday);
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
  const checks = d.problems.length ? `⚠️ ${escHtml(d.problems.join(", "))}` : `✓ lowercase · no emoji, cashtag or link · ${d.text.length}/${MAX_CHARS}`;
  return `<b>Draft · ${escHtml(d.kind)}</b> · ${when}\n\n<pre>${escHtml(d.text)}</pre>\n${checks}\n🏷 Tag: ${escHtml(d.tag)}\n📸 ${escHtml(d.shot)} (link goes in a reply)\nPost by hand on @blueagent_.`;
}
