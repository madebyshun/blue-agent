/**
 * The trigger rule, pure: given a watch and this tick's reading, does it fire,
 * and what is its next state? No I/O — scripts/watch-check.ts drives it.
 *
 *  price above X   fires when price ≥ X while armed
 *  price below X   fires when price ≤ X while armed
 *  change up N%    fires when the pool's 1h/24h change ≥ +N while armed
 *  change down N%  fires when it is ≤ −N while armed
 *
 * After a fire: a one-shot watch deactivates. A repeating one disarms and
 * re-arms only when the condition has clearly cleared — a price back across
 * X by REARM_BAND (so a price hovering at X fires once, not every 5 minutes),
 * a change back under half its threshold AND at least one window since the
 * last fire.
 *
 * NOTHING fires on missing data: a null price/change, or a stale oracle for a
 * price watch, leaves the watch exactly as it was.
 */
import { CHAIN_NAME, REARM_BAND, type Watch, type WatchReading } from "./types";

export interface Evaluation {
  fire: boolean;
  /** The alert text when it fires — every number from the reading. */
  text?: string;
  next: Watch;
}

const WINDOW_MS = { "1h": 3_600_000, "24h": 86_400_000 } as const;

export function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(3)}`;
}

export function evaluateWatch(w: Watch, r: WatchReading, now: number): Evaluation {
  if (!w.active) return { fire: false, next: w };
  const who = `${w.symbol} (${CHAIN_NAME[w.chain]})`;
  const src = r.priceSource === "chainlink" ? "Chainlink oracle" : r.priceSource === "dexscreener" ? "pool price, DexScreener" : "pool price, GeckoTerminal";
  const chSrc = r.changeSource === "geckoterminal" ? "GeckoTerminal" : "DexScreener";

  if (w.kind === "price") {
    const p = r.priceUsd;
    if (p == null || (r.priceSource === "chainlink" && r.stale)) return { fire: false, next: w };
    const hit = w.direction === "above" ? p >= w.threshold : p <= w.threshold;
    if (w.armed && hit) {
      const text = `${who} ${w.direction === "above" ? "rose above" : "fell below"} ${fmtPrice(w.threshold)} — now ${fmtPrice(p)} (${src}).`;
      return { fire: true, text, next: { ...w, armed: false, active: w.repeat, lastTriggeredAt: now, lastError: undefined } };
    }
    if (!w.armed && w.repeat) {
      const cleared = w.direction === "above" ? p < w.threshold * (1 - REARM_BAND) : p > w.threshold * (1 + REARM_BAND);
      if (cleared) return { fire: false, next: { ...w, armed: true } };
    }
    return { fire: false, next: w };
  }

  const win = w.window ?? "24h";
  const ch = win === "1h" ? r.change1h : r.change24h;
  if (ch == null) return { fire: false, next: w };
  const hit = w.direction === "up" ? ch >= w.threshold : ch <= -w.threshold;
  if (w.armed && hit) {
    const now$ = r.priceUsd != null ? ` — now ${fmtPrice(r.priceUsd)}` : "";
    const text = `${who} is ${ch >= 0 ? "up" : "down"} ${Math.abs(ch).toFixed(2)}% over ${win === "1h" ? "the last hour" : "24 hours"}${now$} (pool change, ${chSrc}).`;
    return { fire: true, text, next: { ...w, armed: false, active: w.repeat, lastTriggeredAt: now, lastError: undefined } };
  }
  if (!w.armed && w.repeat) {
    const calm = Math.abs(ch) < w.threshold / 2;
    const waited = !w.lastTriggeredAt || now - w.lastTriggeredAt >= WINDOW_MS[win];
    if (calm && waited) return { fire: false, next: { ...w, armed: true } };
  }
  return { fire: false, next: w };
}

export interface ScheduledEvaluation {
  fire: boolean;
  /** Fired: the alert text. Not fired: what the check saw, for the feed. */
  text: string;
  next: Watch;
}

/**
 * An automation's check at its set time. Unlike `evaluateWatch` each check
 * stands alone — no armed state, no re-arm band: "every day at 09:00, if ETH is
 * below $2,500" asks a fresh question every morning. Missing data or a stale
 * oracle is NOT "condition false": it is reported as unreadable, and the
 * next check comes round as usual.
 */
export function evaluateScheduled(w: Watch, r: WatchReading, now: number, nextCheckAt: number): ScheduledEvaluation {
  const who = `${w.symbol} (${CHAIN_NAME[w.chain]})`;
  const next: Watch = { ...w, lastCheckedAt: now, nextCheckAt };
  const src = r.priceSource === "chainlink" ? "Chainlink oracle" : r.priceSource === "dexscreener" ? "DexScreener" : "GeckoTerminal";

  if (w.kind === "price") {
    const p = r.priceUsd;
    if (p == null) return { fire: false, text: `${who}: price could not be read at the scheduled check — skipped.`, next };
    if (r.priceSource === "chainlink" && r.stale) return { fire: false, text: `${who}: the oracle is not updating (market closed) — skipped, ${fmtPrice(p)} is the last close.`, next };
    const hit = w.direction === "above" ? p >= w.threshold : p <= w.threshold;
    if (!hit) return { fire: false, text: `${who} is ${fmtPrice(p)} (${src}) — not ${w.direction} ${fmtPrice(w.threshold)}, nothing prepared.`, next };
    return {
      fire: true,
      text: `${who} is ${fmtPrice(p)} (${src}) — ${w.direction} ${fmtPrice(w.threshold)} at the scheduled check.`,
      next: { ...next, lastTriggeredAt: now, active: w.repeat ? true : false },
    };
  }
  const win = w.window ?? "24h";
  const ch = win === "1h" ? r.change1h : r.change24h;
  const label = win === "1h" ? "1h" : "24h";
  if (ch == null) return { fire: false, text: `${who}: ${label} change could not be read at the scheduled check — skipped.`, next };
  const hit = w.direction === "up" ? ch >= w.threshold : ch <= -w.threshold;
  const chSrc = r.changeSource === "geckoterminal" ? "GeckoTerminal" : "DexScreener";
  const pctText = `${ch > 0 ? "+" : ""}${ch.toFixed(2)}% over ${label} (${chSrc})`;
  if (!hit) return { fire: false, text: `${who} is ${pctText} — not ${w.direction} ${w.threshold}%, nothing prepared.`, next };
  return {
    fire: true,
    text: `${who} is ${pctText} at the scheduled check.`,
    next: { ...next, lastTriggeredAt: now, active: w.repeat ? true : false },
  };
}
