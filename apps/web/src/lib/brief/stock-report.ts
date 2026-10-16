/**
 * The stock-token report (ShunTr 2026-10-16, "bản tin cổ phiếu token"): which
 * onchain stocks trade ABOVE or BELOW the real stock right now, on Base 8453
 * and Robinhood Chain 4663, and where the same stock is cheaper.
 *
 * Built from the same desk rows as the brief (lib/brief/stocks.ts), already
 * through the F6 quarantine. Everything here is classification in code, with
 * the thresholds named below — no model call, no derived prices:
 *
 *   gap      = the desk's drift_pct (DEX vs Chainlink oracle, + = DEX above)
 *   liquid   = the token's pools hold ≥ MIN_TVL_USD (total_tvl_usd); a thinner
 *              pool's gap is counted, not listed
 *   held back = |gap| ≥ SUSPECT_PCT: measured 2026-10-16, CRWV read +42% and
 *              SNDK +21.8% in REGULAR hours on $132K / $394K of liquidity — a
 *              gap that size is far likelier a bad reading than a price, and
 *              printing it would cost the report its credibility on day one
 *   cheaper  = a ticker on BOTH desks: the side with the lower gap is cheaper
 *              relative to the stock. Compared as gaps, never as raw prices —
 *              a Base B20 and an RH token need not represent the same number
 *              of shares, so their dollar prices are not comparable.
 *
 * Facts, not a signal: nothing here says buy or sell.
 */
import type { TickerSnapshot } from "@/lib/blue-hood/types";
import type { BriefChain } from "./types";

export const GAP_PCT = 1.5;
export const MIN_TVL_USD = 100_000;
export const SUSPECT_PCT = 15;
export const MAX_LISTED = 5;
/** A cross-chain difference smaller than this is not worth a line. */
export const CHEAPER_MIN_PCT = 0.5;

export interface ReportRow {
  chain: BriefChain;
  ticker: string;
  gap: number;
  tvl: number | null;
  vol: number | null;
}

export interface DeskReport {
  above: ReportRow[];
  below: ReportRow[];
  inLine: string[];
  heldBack: ReportRow[];
  /** Gaps on pools under MIN_TVL_USD: counted only. */
  thin: number;
  /** Rows with no gap reading. */
  unread: number;
}

export interface CheaperRow { ticker: string; cheaper: BriefChain; base: number; robinhood: number; by: number }

export interface StockReport {
  desks: Partial<Record<BriefChain, DeskReport>>;
  cheaper: CheaperRow[];
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Pure. One desk's rows → its report. */
export function classifyDesk(chain: BriefChain, rows: TickerSnapshot[]): DeskReport {
  const r: DeskReport = { above: [], below: [], inLine: [], heldBack: [], thin: 0, unread: 0 };
  for (const t of rows) {
    const gap = num(t.drift_pct);
    if (gap == null || t.provenance === "quarantined") { r.unread++; continue; }
    const row: ReportRow = { chain, ticker: t.ticker.toUpperCase(), gap, tvl: num(t.total_tvl_usd), vol: num(t.volume_24h_usd) };
    if (Math.abs(gap) >= SUSPECT_PCT) { r.heldBack.push(row); continue; }
    if (row.tvl == null || row.tvl < MIN_TVL_USD) { if (Math.abs(gap) >= GAP_PCT) r.thin++; else r.inLine.push(row.ticker); continue; }
    if (gap >= GAP_PCT) r.above.push(row);
    else if (gap <= -GAP_PCT) r.below.push(row);
    else r.inLine.push(row.ticker);
  }
  r.above.sort((a, b) => b.gap - a.gap);
  r.below.sort((a, b) => a.gap - b.gap);
  r.heldBack.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  r.inLine = [...new Set(r.inLine)].sort();
  return r;
}

/** Pure. Tickers on both desks, both liquid and readable: which side is cheaper vs the stock. */
export function cheaperVenue(base: TickerSnapshot[], robinhood: TickerSnapshot[]): CheaperRow[] {
  const usable = (t: TickerSnapshot) => {
    const g = num(t.drift_pct), tvl = num(t.total_tvl_usd);
    return g != null && t.provenance !== "quarantined" && Math.abs(g) < SUSPECT_PCT && tvl != null && tvl >= MIN_TVL_USD ? g : null;
  };
  const rh = new Map<string, number>();
  for (const t of robinhood) { const g = usable(t); if (g != null) rh.set(t.ticker.toUpperCase(), g); }
  const out: CheaperRow[] = [];
  for (const t of base) {
    const g = usable(t), k = t.ticker.toUpperCase(), o = rh.get(k);
    if (g == null || o == null) continue;
    const by = Math.abs(g - o);
    if (by < CHEAPER_MIN_PCT) continue;
    out.push({ ticker: k, cheaper: g < o ? "base" : "robinhood", base: g, robinhood: o, by: Math.round(by * 100) / 100 });
  }
  return out.sort((a, b) => b.by - a.by);
}

const CHAIN: Record<BriefChain, string> = { base: "Base", robinhood: "Robinhood Chain" };
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
const usd = (n: number | null) => n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1e3)}K`;

/** Lines for the report section; `e`/`b` are the caller's escape and bold. */
export function renderReport(rep: StockReport, e: (s: string) => string, b: (s: string) => string): string[] {
  const out: string[] = [];
  const line = (r: ReportRow) => `• ${e(`${r.ticker} ${pct(r.gap)} · pool ${usd(r.tvl)} · 24h vol ${usd(r.vol)}`)}`;
  for (const c of ["robinhood", "base"] as const) {
    const d = rep.desks[c];
    if (!d) continue;
    if (out.length) out.push("");
    out.push(b(`${CHAIN[c]}`));
    if (d.above.length) {
      out.push(e("Priced above the stock:"));
      for (const r of d.above.slice(0, MAX_LISTED)) out.push(line(r));
      if (d.above.length > MAX_LISTED) out.push(e(`• …and ${d.above.length - MAX_LISTED} more`));
    }
    if (d.below.length) {
      out.push(e("Priced below the stock:"));
      for (const r of d.below.slice(0, MAX_LISTED)) out.push(line(r));
      if (d.below.length > MAX_LISTED) out.push(e(`• …and ${d.below.length - MAX_LISTED} more`));
    }
    if (d.inLine.length) {
      const shown = d.inLine.slice(0, 6).join(", ");
      out.push(e(`In line (within ${GAP_PCT}%): ${shown}${d.inLine.length > 6 ? ` and ${d.inLine.length - 6} more` : ""}`));
    }
    if (!d.above.length && !d.below.length && !d.inLine.length) out.push(e("No liquid reading on this desk right now."));
    if (d.heldBack.length) {
      out.push(e(`Held back: ${d.heldBack.map((r) => `${r.ticker} ${pct(r.gap)}`).join(", ")}. A gap that size is more likely a bad reading than a real price.`));
    }
    if (d.thin) out.push(e(`${d.thin} more gap${d.thin === 1 ? "" : "s"} on pools under ${usd(MIN_TVL_USD)}, not listed.`));
  }
  if (rep.cheaper.length) {
    out.push("", b("Same stock, both chains"));
    for (const r of rep.cheaper.slice(0, MAX_LISTED)) {
      out.push(`• ${e(`${r.ticker}: cheaper on ${CHAIN[r.cheaper]} by ${r.by.toFixed(1)} points (Base ${pct(r.base)}, Robinhood Chain ${pct(r.robinhood)} vs the stock)`)}`);
    }
  }
  return out;
}
