/**
 * The stock-token part of the brief (plan 2026-10-13, D): for the onchain
 * stocks a wallet holds, and for each desk as a whole — DEX price against the
 * Chainlink oracle, against Coinbase's NAV on Base, and which US session it is.
 *
 * Every number is READ, not derived here, except the two differences printed
 * beside them (drift as the desk recorded it; premium = dex / nav − 1):
 *   • oracle, DEX, drift — the Hood desk snapshot (KV_BASE_ROWS_LATEST for
 *     Base, KV_SNAPSHOT_LATEST for Robinhood Chain), published through the F6
 *     quarantine so a pre-fix RH row's DEX leg is withheld, not shown;
 *   • NAV — Coinbase's tokenized-stocks API (Base only; coinbase-catalog.ts);
 *   • amounts — the wallet's own holdings read.
 *
 * Facts, not a signal. Arrows are frozen (2026-09-30) and nothing here says
 * buy or sell: a gap is reported with the session it sits in, and the reader
 * decides what it means.
 *
 * Identity is by CONTRACT, never ticker: NVDA/META/GOOGL exist on both chains
 * as different tokens (#206, #280). A Base token is a stock token iff its
 * contract is in Coinbase's catalog or on the Base desk; an RH token iff its
 * contract is in the RH registry.
 */
import { kvGetProbe } from "@/lib/kv";
import { KV_BASE_ROWS_LATEST, KV_SNAPSHOT_LATEST } from "@/lib/blue-hood/kv-keys";
import { publishDeskRows } from "@/lib/blue-hood/quarantine";
import { matchesChain, partitionBaseRows, type BaseDeskLatest, type HoodSnapshot, type TickerSnapshot } from "@/lib/blue-hood/types";
import { HEALTHY_MAX_AGE_S } from "@/lib/blue-hood/health";
import { RWA_TOKENS } from "@/lib/robinhood/rwa-registry";
import { nyseMarketStatus } from "@/lib/robinhood/rwa-market";
import { coinbaseCatalog, navPremiumPct, type CoinbaseStock } from "@/lib/base-stocks/coinbase-catalog";
import type { BriefChain, HoldRow } from "./types";

export type Session = "regular" | "premarket" | "afterhours" | "weekend";
export type DeskState = "ok" | "stale" | "unread";

export interface StockRow {
  chain: BriefChain;
  ticker: string;
  name: string;
  contract: string;
  /** Amount the wallet holds; null for a desk-wide row. */
  held: string | null;
  oracle: number | null;
  dex: number | null;
  /** As recorded by the desk (positive = DEX above oracle). */
  drift: number | null;
  nav: number | null;
  premium: number | null;
  onDesk: boolean;
  /** RH row recorded before the F6 price fix: DEX leg withheld. */
  withheld: boolean;
}

export interface StockBriefData {
  session: Session;
  desk: Record<BriefChain, DeskState>;
  catalogRead: boolean;
  held: StockRow[];
  /** Largest |drift| per desk, non-stale desks only. */
  movers: Record<BriefChain, StockRow[]>;
}

export const MOVERS_PER_DESK = 5;

type Desk = { state: DeskState; rows: TickerSnapshot[] };

async function readDesk(chain: BriefChain, now: number): Promise<Desk> {
  const fresh = (startedAt: string | undefined) => {
    const t = startedAt ? Date.parse(startedAt) : NaN;
    return Number.isFinite(t) && (now - t) / 1000 <= HEALTHY_MAX_AGE_S;
  };
  if (chain === "base") {
    const p = await kvGetProbe<BaseDeskLatest>(KV_BASE_ROWS_LATEST);
    if (p.status !== "hit" || !p.value?.rows?.length) return { state: "unread", rows: [] };
    return { state: fresh(p.value.started_at) ? "ok" : "stale", rows: publishDeskRows(partitionBaseRows(p.value.rows).attributed) };
  }
  const p = await kvGetProbe<HoodSnapshot>(KV_SNAPSHOT_LATEST);
  if (p.status !== "hit" || !p.value?.tickers?.length) return { state: "unread", rows: [] };
  return { state: fresh(p.value.started_at) ? "ok" : "stale", rows: publishDeskRows(p.value.tickers.filter((r) => matchesChain(r, "robinhood"))) };
}

function fromDesk(chain: BriefChain, r: TickerSnapshot, cat: Map<string, CoinbaseStock>, held: string | null): StockRow {
  const c = chain === "base" ? cat.get(r.contract.toLowerCase()) : undefined;
  const nav = c?.nav ?? null;
  return {
    chain, ticker: r.ticker.toUpperCase(), name: r.name, contract: r.contract.toLowerCase(), held,
    oracle: r.oracle_usd, dex: r.dex_usd, drift: r.drift_pct, nav, premium: navPremiumPct(r.dex_usd, nav),
    onDesk: true, withheld: r.provenance === "quarantined",
  };
}

const RH_STOCKS = new Map(RWA_TOKENS.filter((t) => t.kind === "stock" || t.kind === "etf").map((t) => [t.contract.toLowerCase(), t]));

/**
 * Pure assembly — the IO above feeds it, scripts/brief-stocks-test.ts pins it.
 */
export function assembleStocks(input: {
  holdings: HoldRow[] | null;
  desks: Record<BriefChain, Desk>;
  catalog: CoinbaseStock[] | null;
  now: number;
}): StockBriefData {
  const cat = new Map((input.catalog ?? []).map((c) => [c.contract, c]));
  const byContract: Record<BriefChain, Map<string, TickerSnapshot>> = {
    base: new Map(input.desks.base.rows.map((r) => [r.contract.toLowerCase(), r])),
    robinhood: new Map(input.desks.robinhood.rows.map((r) => [r.contract.toLowerCase(), r])),
  };

  const held: StockRow[] = [];
  for (const h of input.holdings ?? []) {
    if (h.token === "native") continue;
    const desk = byContract[h.chain].get(h.token);
    if (desk) { held.push(fromDesk(h.chain, desk, cat, h.amount)); continue; }
    if (h.chain === "base") {
      const c = cat.get(h.token);
      if (!c) continue;
      const px = h.usd != null && Number(h.amount) > 0 ? h.usd / Number(h.amount) : null;
      held.push({ chain: "base", ticker: c.ticker, name: c.name, contract: c.contract, held: h.amount, oracle: null, dex: px, drift: null, nav: c.nav, premium: navPremiumPct(px, c.nav), onDesk: false, withheld: false });
    } else {
      const t = RH_STOCKS.get(h.token);
      if (!t) continue;
      const px = h.usd != null && Number(h.amount) > 0 ? h.usd / Number(h.amount) : null;
      held.push({ chain: "robinhood", ticker: t.ticker, name: t.name, contract: h.token, held: h.amount, oracle: null, dex: px, drift: null, nav: null, premium: null, onDesk: false, withheld: false });
    }
  }

  const movers = { base: [] as StockRow[], robinhood: [] as StockRow[] };
  for (const c of ["base", "robinhood"] as const) {
    if (input.desks[c].state !== "ok") continue;
    movers[c] = input.desks[c].rows
      .filter((r) => typeof r.drift_pct === "number" && Number.isFinite(r.drift_pct))
      .sort((a, b) => Math.abs(b.drift_pct!) - Math.abs(a.drift_pct!))
      .slice(0, MOVERS_PER_DESK)
      .map((r) => fromDesk(c, r, cat, null));
  }

  return {
    session: nyseMarketStatus(new Date(input.now)).session,
    desk: { base: input.desks.base.state, robinhood: input.desks.robinhood.state },
    catalogRead: input.catalog !== null,
    held, movers,
  };
}

export async function stockBrief(holdings: HoldRow[] | null, now = Date.now()): Promise<StockBriefData> {
  const [base, robinhood, catalog] = await Promise.all([
    readDesk("base", now).catch((): Desk => ({ state: "unread", rows: [] })),
    readDesk("robinhood", now).catch((): Desk => ({ state: "unread", rows: [] })),
    coinbaseCatalog().catch(() => null),
  ]);
  return assembleStocks({ holdings, desks: { base, robinhood }, catalog, now });
}
