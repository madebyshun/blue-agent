/**
 * X drafts for @blueagent_ — composed from measured data, sent to ShunTr on
 * Telegram, posted BY HAND. Nothing here posts to X.
 *
 * Theme (ShunTr 2026-11-12): Xen's #8, "a weekend price feed ... lenders and
 * derivatives venues need a weekend price they can reliably reference", plus
 * the stock data Blue Agent already reads on Base. No portfolio content.
 *
 * Two slots a day (UTC):
 *   00:00 (07:00 Vietnam)  Tue: the weekend scorecard, graded.
 *                          Wed-Sat: yesterday's widest oracle-vs-pool gaps.
 *                          Sun-Mon: what Base is pricing for Monday so far.
 *   13:00 (20:00 Vietnam)  Mon-Fri: pre-open board, gaps right now.
 *                          Sat-Sun: the weekend so far, with BTC/ETH beside it.
 *
 * Copy rules, enforced in `lint`: no em dash, at most 280 characters, chains
 * by name ("Base"), never by id. Every number comes from a source read in
 * this file; the text is a template, no model writes it.
 */
import hoodLive from "@/app/api/x402/_handlers/hood-live";
import { scorecardView } from "@/lib/weekend/view";
import { readBaseSeriesDays } from "@/lib/base-stocks/base-series";
import { cryptoMove } from "@/lib/weekend/scorecard";

export interface Draft { kind: string; text: string; shot: string; problems: string[] }

const SITE = "https://app.blueagent.dev";
const sp = (n: number, d = 2) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(d)}%`;

export function lint(text: string): string[] {
  const p: string[] = [];
  if (/—/.test(text)) p.push("em dash");
  if (text.length > 280) p.push(`${text.length} characters (max 280)`);
  if (/\b(8453|4663)\b/.test(text)) p.push("chain id in copy; write the chain name");
  return p;
}

const draft = (kind: string, text: string, shot: string): Draft => ({ kind, text, shot, problems: lint(text) });

interface LiveRow { ticker: string; oracle_usd: number | null; dex_usd: number | null; drift_pct: number | null; oracle_updated_at: number | null; volume_24h_usd: number | null }

async function boardRows(): Promise<LiveRow[]> {
  const r = await hoodLive(new Request("https://blueagent.dev/api/x402/hood-live", { method: "POST", body: JSON.stringify({ chain: "base" }) }));
  if (!r.ok) throw new Error(`hood-live ${r.status}`);
  const j = (await r.json()) as { rows?: LiveRow[] };
  return (j.rows ?? []).filter((x) => x.drift_pct != null);
}

// ── renderers: pure, so the copy can be tested and previewed on any data ──

type Gap = { ticker: string; drift_pct: number };
type Peak = { ticker: string; drift_pct: number; abs_drift_pct: number; session: string; is_open: boolean };
type Move = { ticker: string; weekend_move_pct: number };
type Graded = { ticker: string; weekend_move_pct: number; open_gap_pct: number; hit: boolean | null };
type Record_ = { ready: boolean; hit_rate: number | null; hits: number; calls: number; weekends: number };

export function preOpenText(rows: Gap[]): Draft {
  if (!rows.length) throw new Error("no Base rows on the board");
  const top = [...rows].sort((a, b) => Math.abs(b.drift_pct) - Math.abs(a.drift_pct)).slice(0, 3);
  const lines = top.map((r) => `${r.ticker}c ${sp(r.drift_pct)}`).join("\n");
  const verdict = Math.abs(top[0].drift_pct) < 0.5
    ? "Every gap is inside the feed's own 0.5% step. Pools are tracking the oracle."
    : `${top[0].ticker}c is outside the feed's 0.5% step.`;
  return draft("pre-open", `Pre-open on Base. Stock tokens, pool price vs their Chainlink feed:\n\n${lines}\n\n${verdict}`, `${SITE}/markets/drift`);
}

export function yesterdayText(peaks: Peak[]): Draft {
  if (!peaks.length) throw new Error("no peaks recorded yesterday");
  const top = [...peaks].sort((a, b) => b.abs_drift_pct - a.abs_drift_pct).slice(0, 3);
  const when = (s: string) => (s === "regular" ? "market open" : s === "premarket" ? "pre-market" : s === "afterhours" ? "after hours" : s);
  const lines = top.map((p) => `${p.ticker}c ${sp(p.drift_pct)} (${when(p.session)})`).join("\n");
  const closed = top.filter((p) => !p.is_open).length;
  return draft("yesterday",
    `Widest gaps yesterday between Base pools and their Chainlink feeds:\n\n${lines}\n\n${closed} of the top ${top.length} came while NYSE was closed, the hours a weekend or overnight price has to cover.`,
    `${SITE}/markets/drift`);
}

export function weekendText(rows: Move[], crypto: { btc_pct: number | null; eth_pct: number | null } | null): Draft {
  if (!rows.length) throw new Error("no weekend reading");
  const sorted = [...rows].sort((a, b) => Math.abs(b.weekend_move_pct) - Math.abs(a.weekend_move_pct));
  const avg = rows.reduce((a, r) => a + r.weekend_move_pct, 0) / rows.length;
  const top = sorted.slice(0, 3).map((r) => `${r.ticker}c ${sp(r.weekend_move_pct)}`).join("\n");
  const c = crypto?.eth_pct != null && crypto?.btc_pct != null ? `\nSame window: BTC ${sp(crypto.btc_pct, 1)}, ETH ${sp(crypto.eth_pct, 1)}.` : "";
  return draft("weekend",
    `NYSE is shut. Stock tokens on Base still trade, while their Chainlink feeds hold Friday's price.\n\nBase vs Friday, so far:\n${top}\nAverage of ${rows.length}: ${sp(avg)}${c}\n\nGraded at Monday's open.`,
    `${SITE}/markets/weekend`);
}

export function scorecardText(rows: Graded[], s: Record_): Draft {
  if (!rows.length) throw new Error("no graded weekend");
  const calls = rows.filter((r) => r.hit !== null), hits = calls.filter((r) => r.hit).length;
  const big = [...rows].sort((a, b) => Math.abs(b.open_gap_pct) - Math.abs(a.open_gap_pct))[0];
  const meanMove = rows.reduce((a, r) => a + Math.abs(r.weekend_move_pct), 0) / rows.length;
  const meanGap = rows.reduce((a, r) => a + Math.abs(r.open_gap_pct), 0) / rows.length;
  const record = s.ready && s.hit_rate != null ? `${Math.round(s.hit_rate * 100)}% over ${s.weekends} weekends` : `${s.hits} of ${s.calls} over ${s.weekends} weekends`;
  return draft("scorecard",
    `Did Base's weekend price call Monday's open?\n\nThis weekend: ${hits} of ${calls.length} calls right. Base moved ${meanMove.toFixed(1)}% on average, the open moved ${meanGap.toFixed(1)}%. Biggest gap: ${big.ticker}c ${sp(big.open_gap_pct)} at the open.\n\nRecord: ${record}.`,
    `${SITE}/markets/weekend`);
}

// ── readers ────────────────────────────────────────────────────────────────

/** Mon-Fri 13:00 UTC: where pools and feeds disagree right before the open. */
export async function preOpen(): Promise<Draft> {
  return preOpenText((await boardRows()).map((r) => ({ ticker: r.ticker, drift_pct: r.drift_pct! })));
}

/** Wed-Sat 00:00 UTC: the widest gap each stock reached yesterday, and when. */
export async function yesterdayGaps(now: Date): Promise<Draft> {
  const day = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");
  const [read] = await readBaseSeriesDays([day]);
  if (read.status !== "hit") throw new Error(`archive ${day}: ${read.status}`);
  return yesterdayText(read.value.peaks);
}

/** Sat/Sun 13:00 and Sun/Mon 00:00 UTC: what Base prices while the feed holds Friday. */
export async function weekendSoFar(now: Date): Promise<Draft> {
  const card = await scorecardView({ limit: 1 });
  if (card === "error") throw new Error("scorecard unreadable");
  const view = card.live ?? card.pending;
  if (!view || !view.rows.length) throw new Error("no weekend reading");
  const freeze = Math.max(...view.rows.map((r) => r.close_round_at));
  const c = await cryptoMove(new Date(freeze * 1000).toISOString(), now.toISOString()).catch(() => null);
  return weekendText(view.rows, c);
}

/** Tue 00:00 UTC: the weekend, graded. The #8 post. */
export async function scorecard(): Promise<Draft> {
  const card = await scorecardView({ limit: 1 });
  if (card === "error") throw new Error("scorecard unreadable");
  const w = card.weekends[0];
  if (!w) throw new Error("no graded weekend");
  return scorecardText(w.rows, card.summary);
}

/** What the cron sends for this slot. `slot` is the UTC hour, 0 or 13. */
export async function draftsFor(now: Date, slot: 0 | 13): Promise<(Draft | { kind: string; error: string })[]> {
  const dow = now.getUTCDay(); // 0 Sun .. 6 Sat
  const jobs: [string, () => Promise<Draft>][] = [];
  if (slot === 0) {
    if (dow === 2) jobs.push(["scorecard", scorecard]);
    else if (dow >= 3 && dow <= 6) jobs.push(["yesterday", () => yesterdayGaps(now)]);
    else jobs.push(["weekend", () => weekendSoFar(now)]); // Sun, Mon
  } else {
    if (dow >= 1 && dow <= 5) jobs.push(["pre-open", preOpen]);
    else jobs.push(["weekend", () => weekendSoFar(now)]);
  }
  const out: (Draft | { kind: string; error: string })[] = [];
  for (const [kind, fn] of jobs) {
    try { out.push(await fn()); } catch (e) { out.push({ kind, error: (e as Error).message.slice(0, 160) }); }
  }
  return out;
}

// ── delivery ───────────────────────────────────────────────────────────────

export const KV_DRAFTS_CHAT = "xdrafts:chat:v1";

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The Telegram message for one draft: the post in a copyable block, then checks. */
export function telegramText(d: Draft | { kind: string; error: string }, now: Date): string {
  const when = now.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  if ("error" in d) return `<b>Draft · ${escHtml(d.kind)}</b> · ${when}\nNot composed: ${escHtml(d.error)}. Nothing to post this slot.`;
  const checks = d.problems.length ? `⚠️ ${escHtml(d.problems.join(", "))}` : `✓ no em dash · ${d.text.length}/280 · chain by name`;
  return `<b>Draft · ${escHtml(d.kind)}</b> · ${when}\n\n<pre>${escHtml(d.text)}</pre>\n${checks}\n📸 ${escHtml(d.shot)}\nPost by hand on @blueagent_. Tag Xen, Jesse or Base as you see fit.`;
}
