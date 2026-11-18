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
 * Calendar (Vietnam time; UTC 00:00, 06:00 and 13:00). The 13:00 column
 * (ShunTr 2026-11-18, "only 2 a day, add more") carries the short list posts.
 * `/drafts now` composes every kind at once (allDrafts).
 *          07:00                     13:00                20:00
 *   Mon    weekend, last read        volume share         base's call for the open
 *   Tue    weekend scorecard         gap list             pre-open gaps
 *   Wed    share of 24h volume       yesterday's gap      widest gaps, as a list
 *   Thu    volume by nyse session    volume share         corporate actions ahead
 *   Fri    yesterday's widest gap    gap list             feeds freeze tonight
 *   Sat    weekend so far            volume share         weekend so far
 *   Sun    weekend so far            gap list             weekend so far
 *
 * Copy rules, enforced in `lint`: lowercase, no em dash, no chain id, no
 * emoji, at most 700 characters. Every number comes from a source read
 * below; no model writes the text.
 */
import hoodLive from "@/app/api/x402/_handlers/hood-live";
import { scorecardView } from "@/lib/weekend/view";
import { readBaseSeriesDays } from "@/lib/base-stocks/base-series";
import { cryptoMove, fridayOf } from "@/lib/weekend/scorecard";
import { readSessionVolume } from "@/lib/weekend/sessions";
import { COINBASE_BASE_STOCKS } from "@/lib/base-stocks/coinbase-list";
import { actionIds, actionsFor } from "@/lib/base-stocks/corporate-actions";
import { readStockMarkets } from "@/lib/markets";

import { requireFreshStockSnapshot, type StockDraftEvidence } from "../../../../../packages/core/src/stock-observations";

export interface Draft { evidence?: StockDraftEvidence; snapshot_id?: string; kind: string; text: string; shot: string; tag: string; problems: string[] }
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
// Every session label the desk can emit needs a phrase here. A missing one
// falls through as the raw enum, so the published post reads "traded 0.6%
// above its chainlink feed holiday" — grammatical noise in a copy block, and
// the compiler cannot see it because the chain is a ternary, not a Record.
const sessionWord = (s: string) =>
  s === "regular" ? "during market hours"
  : s === "premarket" ? "before the open"
  : s === "afterhours" ? "after the close"
  : s === "weekend" ? "over the weekend"
  : s === "holiday" ? "on a market holiday"
  : s;

export function preOpenText(rows: Gap[]): Draft {
  if (!rows.length) throw new Error("no Base rows on the board");
  const top = sortAbs(rows, (r) => r.drift_pct).slice(0, 3);
  const w = top[0];
  const rest = top.slice(1).map((r) => `${tok(r.ticker)} at ${pct(r.drift_pct)} ${r.drift_pct >= 0 ? "above" : "below"}`);
  const wide = Math.abs(w.drift_pct) >= 0.5;
  const so = wide
    ? `so the pool and oracle disagree by at least 0.5%; that alone does not establish which is right.`
    : `so all readable gaps in our tracked set are below 0.5%.`;
  return draft("pre-open",
    `in the latest pre-open snapshot, the widest gap among the stock tokens we track on base is ${tok(w.ticker)}, ${pct(w.drift_pct)} ${w.drift_pct >= 0 ? "above" : "below"} the feed. next are ${list(rest)}. ${so} pool spot is not an executable quote.`,
    `${SITE}/markets/drift`, wide ? TAG_BASE : "none");
}

export function yesterdayText(peaks: Peak[], day: string): Draft {
  if (!peaks.length) throw new Error("no peaks recorded yesterday");
  const top = [...peaks].sort((a, b) => b.abs_drift_pct - a.abs_drift_pct).slice(0, 3);
  const p = top[0];
  const rest = top.slice(1).map((x) => `${tok(x.ticker)} at ${pct(x.drift_pct)} ${sessionWord(x.session)}`);
  const closed = top.filter((x) => !x.is_open).length;
  return draft("yesterday",
    `on ${dayWord(day)}, ${tok(p.ticker)}, the ${share(p.ticker)} stock token on base, traded ${pct(p.drift_pct)} ${p.drift_pct >= 0 ? "above" : "below"} its chainlink feed ${sessionWord(p.session)}, the widest gap among the stock tokens we track on base that day. the next widest were ${list(rest)}. ${closed} of the ${top.length} came while nyse was closed. oracle timestamps and pool liquidity matter: a gap alone does not prove price discovery or a stale feed.`,
    `${SITE}/markets/drift`, Math.abs(p.drift_pct) >= 1 ? TAG_XEN : "none");
}

export function weekendText(rows: Move[], crypto: Crypto, friday: string, last = false, asOf?: string): Draft {
  if (!rows.length) throw new Error("no weekend reading");
  const top = sortAbs(rows, (r) => r.weekend_move_pct).slice(0, 3);
  const avg = rows.reduce((a, r) => a + r.weekend_move_pct, 0) / rows.length;
  const moves = top.map((r) => `${tok(r.ticker)} ${updown(r.weekend_move_pct)} ${pct(r.weekend_move_pct)}`);
  // Crypto uses its own explicitly dated hourly-candle window. Do not imply
  // that every stock's last oracle round occurred at the same instant.
  const c = crypto?.eth_pct != null && crypto?.btc_pct != null
    ? ` btc and eth context is in the evidence snapshot; different reference times prevent a like-for-like return comparison.` : "";
  const stamp = asOf ? ` at ${asOf.slice(11, 16)} utc on ${dayWord(asOf)}` : "";
  const lead = (last ? "going into monday" : `over the weekend of ${dayWord(friday)}`) + stamp;
  return draft(last ? "weekend-last" : "weekend",
    `${lead}, the ${rows.length} stock tokens we track on base trade ${updown(avg)} ${pct(avg)} on average versus their last pre-weekend chainlink references. biggest gaps: ${list(moves)}. these are pool-to-oracle gaps, not returns from the official stock close.${c} the fixed sunday call is compared with the first recorded post-open oracle reading, not the opening auction.`,
    `${SITE}/markets/weekend`, TAG_XEN);
}

export function callText(rows: Move[]): Draft {
  if (!rows.length) throw new Error("no call taken");
  const calls = rows.filter((r) => Math.abs(r.weekend_move_pct) >= 0.5);
  const up = calls.filter((r) => r.weekend_move_pct > 0).map((r) => tok(r.ticker));
  const down = calls.filter((r) => r.weekend_move_pct < 0).map((r) => tok(r.ticker));
  const flat = rows.length - calls.length;
  const parts = [up.length ? `${list(up)} above their pre-weekend oracle references` : "", down.length ? `${list(down)} below ${up.length ? "it" : "their pre-weekend oracle references"}` : ""].filter(Boolean);
  return draft("call",
    `at 22:00 utc on sunday, base priced ${parts.length ? list(parts) : "no stock token more than 0.5% from its pre-weekend oracle reference"}${flat ? `, with ${flat} more inside 0.5% and counted as flat` : ""}. this is the fixed call for the stocks we track. it is compared with the first recorded post-open chainlink reading, not the opening auction.`,
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
    `the weekend from ${dayWord(friday)}, graded for the stock tokens we track on base. the fixed sunday pool gaps matched the direction of the first recorded post-open chainlink reading ${hits} times out of ${calls.length} directional calls. average absolute gaps versus the pre-weekend reference: pools ${meanMove.toFixed(1)}%, post-open oracle ${meanGap.toFixed(1)}%. biggest oracle gap: ${tok(big.ticker)} ${updown(big.open_gap_pct)} ${pct(big.open_gap_pct)}. the record is ${record}. this uses oracle observations, not official opening auction prices.`,
    `${SITE}/markets/weekend`, TAG_XEN);
}

export function sessionsText(v: { share: { open: number; nights: number; weekend: number }; total_usd: number; tickers: unknown[]; weeks: number }): Draft {
  return draft("sessions",
    `over the last ${v.weeks} weeks, ${usd(v.total_usd)} of stock tokens traded in dex pools on base across ${v.tickers.length} names. only ${Math.round(v.share.open)}% of it traded while nyse was open. ${Math.round(v.share.nights)}% came at night and in pre and post market, and ${Math.round(v.share.weekend)}% on weekends. these percentages describe our tracked sample, not all stock tokens on base. dex volume includes arbitrage and bots, and how much of it is real demand is not known.`,
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
    weekendShare != null ? `about ${Math.round(weekendShare)}% of volume in our tracked base stock pools traded on weekends` : "",
    avgMove != null && avgGap != null ? `in the latest graded weekend the pools moved ${avgMove.toFixed(1)}% on average while the post-open oracle moved ${avgGap.toFixed(1)}%` : "",
  ].filter(Boolean);
  if (!facts.length) throw new Error("no weekend history to cite");
  return draft("friday",
    `the stock tokens we track on base can trade through the weekend while their 24/5 chainlink references may hold their last value. ${list(facts)}. a held oracle value is not an executable quote. the sunday call is compared with the first recorded post-open oracle reading.`,
    `${SITE}/markets/weekend`, TAG_XEN);
}

// List posts (ShunTr 2026-11-18, after @checkrsocial's "base attention:"):
// a header line and five ranked rows, nothing else. The numbers carry the
// post, so there is no "so" clause; the header names the chain.
const signed = (n: number, d = 1) => `${n >= 0 ? "+" : "-"}${Math.abs(n).toFixed(d)}%`;

type Vol = { ticker: string; volume24hUsd: number };
export function volumeShareText(rows: Vol[]): Draft {
  const live = rows.filter((r) => r.volume24hUsd > 0);
  const total = live.reduce((a, r) => a + r.volume24hUsd, 0);
  if (live.length < 5 || total <= 0) throw new Error("fewer than 5 base stock pools traded in 24h");
  const top = [...live].sort((a, b) => b.volume24hUsd - a.volume24hUsd).slice(0, 5);
  return draft("volume-share",
    `base stock tokens, share of 24h volume:\n${top.map((r) => `- ${tok(r.ticker)} ${(100 * r.volume24hUsd / total).toFixed(1)}%`).join("\n")}`,
    `${SITE}/markets`, "none");
}

export function gapListText(rows: Gap[]): Draft {
  if (rows.length < 3) throw new Error("fewer than 3 readable gaps on the board");
  const top = sortAbs(rows, (r) => r.drift_pct).slice(0, 5);
  return draft("gap-list",
    `widest gaps, base pool vs chainlink:\n${top.map((r) => `- ${tok(r.ticker)} ${signed(r.drift_pct)}`).join("\n")}`,
    `${SITE}/markets/drift`, Math.abs(top[0].drift_pct) >= 1 ? TAG_XEN : "none");
}

// ── readers ────────────────────────────────────────────────────────────────

async function boardRows(now: Date) {
  const r = await hoodLive(new Request("https://blueagent.dev/api/x402/hood-live", { method: "POST", body: JSON.stringify({ chain: "base" }) }));
  if (!r.ok) throw new Error(`hood-live ${r.status}`);
  const j = (await r.json()) as { rows?: { ticker: string; drift_pct: number | null }[]; as_of?: string; is_stale?: boolean; base_desk?: { as_of?: string | null } };
  const asOf = j.base_desk?.as_of ?? "";
  requireFreshStockSnapshot(asOf, now);
  if (j.is_stale) throw new Error("drift board is stale");
  return { rows: (j.rows ?? []).filter((x): x is Gap => x.drift_pct != null && Number.isFinite(x.drift_pct)), raw: j, asOf };
}

const evidenced = (d: Draft, source: string, as_of: string, inputs: unknown, method: string): Draft =>
  ({ ...d, evidence: { source, as_of, inputs, method } });

export async function preOpen(now = new Date()) {
  const b = await boardRows(now);
  return evidenced(preOpenText(b.rows), "hood-live:base", b.asOf, b.raw, "Rank readable tracked Base rows by absolute DEX vs oracle gap.");
}

export async function yesterdayGaps(now: Date) {
  const iso = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const [read] = await readBaseSeriesDays([iso.replaceAll("-", "")]);
  if (read.status !== "hit") throw new Error(`archive ${iso}: ${read.status}`);
  const asOf = [...read.value.points.map((p) => p.at), ...read.value.peaks.map((p) => p.at)].sort().pop();
  if (!asOf) throw new Error("archive has no dated observations");
  return evidenced(yesterdayText(read.value.peaks, iso), "base-series:peaks", asOf, read.value, "Per-cycle peaks in the tracked Base sample; not a census of all listed stocks.");
}

export async function weekendSoFar(now: Date, last = false) {
  const card = await scorecardView({ limit: 1 });
  if (card === "error") throw new Error("scorecard unreadable");
  const view = card.live ?? card.pending;
  if (!view || !view.rows.length) throw new Error("no weekend reading");
  const freeze = Math.max(...view.rows.map((r) => r.close_round_at));
  requireFreshStockSnapshot(view.call_at, now);
  const c = await cryptoMove(new Date(freeze * 1000).toISOString(), view.call_at).catch(() => null);
  return evidenced(weekendText(view.rows, c, view.friday, last, view.call_at), "weekend-scorecard:live", view.call_at,
    { view, crypto: c }, "Arithmetic mean of DEX/reference - 1 across included tracked rows. Each row has its own reference timestamp. Crypto is contextual only, with its own dated hourly candles.");
}

export async function theCall(now = new Date()) {
  const card = await scorecardView({ limit: 1 });
  if (card === "error") throw new Error("scorecard unreadable");
  const view = card.pending;
  if (!view || view.friday !== fridayOf(now)) throw new Error("no fixed call taken this weekend");
  return evidenced(callText(view.rows), "weekend-scorecard:fixed-call", view.call_at, view, "Fixed Sunday 22:00 UTC call; first recorded post-open oracle benchmark, not opening auction.");
}

export async function scorecard() {
  // The weekend from the newest window; the record from the whole store
  // (scorecardView's summary covers only the window it returns).
  const card = await scorecardView({ limit: 52 });
  if (card === "error") throw new Error("scorecard unreadable");
  const w = card.weekends[0];
  if (!w) throw new Error("no graded weekend");
  return evidenced(scorecardText(w.rows, card.summary, w.friday), "weekend-scorecard:graded", w.graded_at, { weekend: w, summary: card.summary }, "Compare frozen Sunday call with first recorded regular-session oracle round dated after 09:30 ET.");
}

export async function sessions() {
  const v = await readSessionVolume();
  if (!v) throw new Error("no complete session-volume record yet");
  return evidenced(sessionsText({ share: v.share, total_usd: v.total_usd, tickers: v.tickers, weeks: v.window.weeks }), "weekend-session-volume", v.computed_at, v, "Volume shares describe the tracked sample and recorded window only.");
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
  return evidenced(actionsText(items), "base-corporate-actions", new Date().toISOString(), items, "Currently announced actions in the read record; no execution date inferred.");
}

export async function volumeShare() {
  const m = await readStockMarkets();
  const base = m.rows.filter((r) => r.chain === "base");
  const unread = base.filter((r) => !r.read).length;
  // A share needs the whole denominator: an unread pool would inflate every
  // other row, so a partial read is not composed.
  if (unread) throw new Error(`${unread} base stock pools unread; share would be overstated`);
  const rows = base.filter((r): r is typeof r & { volume24hUsd: number } => r.volume24hUsd != null && Number.isFinite(r.volume24hUsd));
  return evidenced(volumeShareText(rows), "markets:stocks:base", m.readAt, rows.map((r) => ({ ticker: r.ticker, contract: r.contract, volume24hUsd: r.volume24hUsd })),
    "Each token's GeckoTerminal 24h USD volume over the sum across every listed Base stock token; all rows read.");
}

export async function gapList(now = new Date()) {
  const b = await boardRows(now);
  return evidenced(gapListText(b.rows), "hood-live:base", b.asOf, b.raw, "Top 5 readable tracked Base rows by absolute DEX vs oracle gap, signed.");
}

export async function fridayFreeze() {
  const [card, v] = await Promise.all([scorecardView({ limit: 1 }), readSessionVolume().catch(() => null)]);
  const last = card !== "error" && card.weekends[0] ? card.weekends[0].rows : null;
  return evidenced(fridayText(last, v?.share.weekend ?? null), "weekend-history", new Date().toISOString(), { weekend: card !== "error" ? card.weekends[0] ?? null : null, volume: v }, "Historical sample context, not a promise of feed freeze times.");
}

export type Slot = 0 | 6 | 13;

/** Compose one draft, refuse it on a copy-check failure, keep its evidence. */
async function finalize(kind: string, fn: () => Promise<Draft>): Promise<Draft | Failed> {
  try {
    const d = await fn();
    if (d.problems.length) throw new Error(`draft failed copy checks: ${d.problems.join(", ")}`);
    const { saveDraftSnapshot } = await import("./snapshots");
    d.snapshot_id = await saveDraftSnapshot(d, new Date());
    return d;
  } catch (e) { return { kind, error: (e as Error).message.slice(0, 160) }; }
}

/** Every kind at once, for `/drafts now`. Sequential: they share upstreams. */
export async function allDrafts(now: Date): Promise<(Draft | Failed)[]> {
  const kinds: [string, () => Promise<Draft>][] = [
    ["volume-share", volumeShare], ["gap-list", () => gapList(now)], ["pre-open", () => preOpen(now)],
    ["yesterday", () => yesterdayGaps(now)], ["weekend", () => weekendSoFar(now)], ["call", () => theCall(now)],
    ["scorecard", scorecard], ["sessions", sessions], ["actions", corporateActions], ["friday", fridayFreeze],
  ];
  const out: (Draft | Failed)[] = [];
  for (const [k, fn] of kinds) out.push(await finalize(k, fn));
  return out;
}

/** What the cron sends for this slot. `slot` is the UTC hour, 0, 6 or 13. */
export async function draftsFor(now: Date, slot: Slot): Promise<(Draft | Failed)[]> {
  const dow = now.getUTCDay(); // 0 Sun .. 6 Sat
  const plan: Record<number, [string, () => Promise<Draft>]> = slot === 6
    ? {
        0: ["gap-list", () => gapList(now)],
        1: ["volume-share", volumeShare],
        2: ["gap-list", () => gapList(now)],
        3: ["yesterday", () => yesterdayGaps(now)],
        4: ["volume-share", volumeShare],
        5: ["gap-list", () => gapList(now)],
        6: ["volume-share", volumeShare],
      }
    : slot === 0
    ? {
        0: ["weekend", () => weekendSoFar(now)],
        1: ["weekend-last", () => weekendSoFar(now, true)],
        2: ["scorecard", scorecard],
        3: ["volume-share", volumeShare],
        4: ["sessions", sessions],
        5: ["yesterday", () => yesterdayGaps(now)],
        6: ["weekend", () => weekendSoFar(now)],
      }
    : {
        0: ["weekend", () => weekendSoFar(now)],
        1: ["call", () => theCall(now)],
        2: ["pre-open", () => preOpen(now)],
        3: ["gap-list", () => gapList(now)],
        4: ["actions", corporateActions],
        5: ["friday", fridayFreeze],
        6: ["weekend", () => weekendSoFar(now)],
      };
  const [kind, fn] = plan[dow];
  return [await finalize(kind, fn)];
}

// ── delivery ───────────────────────────────────────────────────────────────

export const KV_DRAFTS_CHAT = "xdrafts:chat:v1";

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The Telegram message for one draft: the post in a copyable block, then checks. */
export function telegramText(d: Draft | Failed, now: Date): string {
  const when = now.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  if ("error" in d) return `<b>Draft · ${escHtml(d.kind)}</b> · ${when}\nNot composed: ${escHtml(d.error)}. Nothing to post this slot.`;
  const checks = d.problems.length ? `⚠️ ${escHtml(d.problems.join(", "))}` : `✓ lowercase · no emoji, cashtag or link · ${d.text.length}/${MAX_CHARS}`;
  return `<b>Draft · ${escHtml(d.kind)}</b> · ${when}\n\n<pre>${escHtml(d.text)}</pre>\n${checks}\n🏷 Tag: ${escHtml(d.tag)}\n📸 ${escHtml(d.shot)} (link goes in a reply)\n${d.snapshot_id ? `Evidence: https://app.blueagent.dev/markets/drift/evidence/${d.snapshot_id}\n` : ""}Post by hand on @blueagent_.`;
}
