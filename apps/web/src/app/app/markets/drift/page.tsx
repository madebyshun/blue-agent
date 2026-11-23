import { MarketScroll, MarketContainer } from "../MarketLayout";
// /markets/drift — the Blue Hood drift board, Base 8453 only (moved here from
// /hood on 2026-11-12, which now redirects). Chainlink oracle vs the deepest
// Base pool for each desk stock, from the poller's last 5-minute cycle: the
// same rows the free `hood-live` x402 id serves. Arrows stopped publishing on
// 2026-09-30; their record stays at /hood/arrows.
import type { Metadata } from "next";
import { pageMeta } from "@/lib/og-card";
import Link from "next/link";
import MarketsHeader from "../MarketsHeader";
import StockMark from "@/components/blue-hood/StockMark";
import { stockOracleState } from "../../../../../../../packages/core/src/stock-observations";
import { BASE_STOCKS } from "@/lib/base-stocks/registry";
import { COINBASE_BASE_STOCKS, COINBASE_BASE_STOCKS_CHECKED_AT } from "@/lib/base-stocks/coinbase-list";
import hoodLive from "@/app/api/x402/_handlers/hood-live";
import { MarketHero, MarketNav, DriftDistribution } from "../MarketVisuals";
import CoverageSummary from "./CoverageSummary";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta("/markets/drift", "Oracle drift — Blue Agent Markets", "Chainlink feed vs Base pool price for stock tokens on Base, every 5 minutes, with pool depth, volume and when the feed last moved.");

interface Row {
  ticker: string; contract: string; explorer: string;
  oracle_usd: number | null; dex_usd: number | null; drift_pct: number | null;
  total_tvl_usd: number | null; volume_24h_usd: number | null;
  market_session: string; oracle_updated_at: number | null;
}

const usd = (n: number | null) => (n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(2)}`);
const px = (n: number | null) => (n == null ? "—" : `$${n.toFixed(2)}`);
const oracleLabel = (s: number | null, asOf: string) => ({ unavailable: "unavailable", updated_since_weekend: "updated since weekend", pre_weekend_reference: "pre-weekend reference", dated_reference: "dated reference" })[stockOracleState(s, asOf)];
const ago = (s: number | null) => {
  if (s == null) return "—";
  const m = Math.round((Date.now() / 1000 - s) / 60);
  return m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

const LOGO_BY_CONTRACT = new Map(
  COINBASE_BASE_STOCKS.filter((s) => s.image).map((s) => [s.token.toLowerCase(), s.image as string]),
);

export default async function DriftPage() {
  let rows: Row[] = [];
  let asOf: string | null = null, stale = false, failed = false;
  try {
    const r = await hoodLive(new Request("https://blueagent.dev/api/x402/hood-live", { method: "POST", body: JSON.stringify({ chain: "base" }) }));
    if (!r.ok) failed = true;
    else {
      const j = (await r.json()) as { rows?: Row[]; as_of?: string; is_stale?: boolean; base_desk?: { as_of?: string | null; status?: string } };
      rows = (j.rows ?? []).sort((a, b) => Math.abs(b.drift_pct ?? 0) - Math.abs(a.drift_pct ?? 0));
      asOf = j.base_desk?.as_of ?? null; stale = !!j.is_stale || j.base_desk?.status !== "live";
    }
  } catch { failed = true; }

  return (
    <div className="flex flex-col h-full bg-[#070b12] overflow-hidden font-mono">
      <MarketsHeader active={null} chip="Drift · Base 8453" />
      <MarketScroll>
        <MarketContainer>
          <MarketHero label="ORACLE DRIFT" title="Same stock. Different signals." description="See where Base pools trade away from their Chainlink references. Every gap is timestamped; a held reference and a live market tell different parts of the story." stats={[
            { label: "Curated watchlist", value: String(BASE_STOCKS.length), detail: "Base stock tokens" },
            { label: "Readable gaps", value: String(rows.filter((r) => r.drift_pct !== null).length), detail: "latest completed poll" },
            { label: "Widest absolute gap", value: rows.some((r) => r.drift_pct !== null) ? Math.max(...rows.map((r) => Math.abs(r.drift_pct ?? 0))).toFixed(2) + "%" : "—", detail: "within this sample" },
          ]} />
          <MarketNav active="drift" />
          <DriftDistribution rows={rows} asOf={asOf} />

          <section className="rounded-[16px] border border-[#1A1A2E] bg-[#0B0F1E] px-4 py-3 text-[12px] text-[#94A3B8] leading-relaxed">
            <p className="text-[#E2E8F0]">{BASE_STOCKS.length} tracked · {rows.length} observed · {COINBASE_BASE_STOCKS.length} in the verified catalog</p>
            <p>Catalog checked {COINBASE_BASE_STOCKS_CHECKED_AT}; <a href="https://www.base.org/stocks" target="_blank" rel="noreferrer" className="text-[#4FC3F7]">the official list</a> may have grown. Stocks outside this watchlist have not been assessed here. They are not automatically illiquid or missing an oracle.</p>
            <p>Oracle timestamps show when a reference updated, not why it held. A 24/5 feed can resume before the regular stock session opens.</p>
          </section>
          <CoverageSummary />
          {stale && !failed && <p className="text-[13px] text-[#F59E0B]">The Base poll is stale or unavailable. Do not treat these readings as current.</p>}

          {failed ? (
            <p className="text-[13px] text-[#F59E0B]">The drift board could not be read right now. Nothing is shown rather than an empty board.</p>
          ) : (
            <div className="bg-[#0B0F1E] border border-[#1A1A2E] rounded-[16px] overflow-x-auto">
              <table className="w-full text-[13px] min-w-[720px]">
                <thead>
                  <tr className="text-left text-[#64748B] text-[11px] tracking-[0.08em]">
                    <th className="px-4 py-3">STOCK</th><th className="text-right">ORACLE</th><th className="text-right">BASE DEX</th>
                    <th className="text-right">DRIFT</th><th className="text-right">POOL TVL</th><th className="text-right">24H VOL</th><th className="text-right pr-4">ORACLE REFERENCE</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const logo = LOGO_BY_CONTRACT.get(r.contract.toLowerCase());
                    return (
                      <tr key={r.ticker} className="border-t border-[#1A1A2E] hover:bg-[#0F121A]">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Link href={`/markets/base/${r.contract}`} className="flex items-center gap-2.5 text-[#E2E8F0] hover:text-[#4FC3F7]">
                              {logo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logo} alt="" width={24} height={24} className="h-6 w-6 rounded-full object-cover shrink-0 bg-[#0F121A]" />
                              ) : (
                                <StockMark ticker={r.ticker} chain="base" size={24} />
                              )}
                              <span>{r.ticker}c</span>
                            </Link>
                            <a href={r.explorer} target="_blank" rel="noreferrer" className="text-[11px] text-[#64748B] hover:text-[#4FC3F7]" title="Basescan">↗</a>
                          </div>
                        </td>
                        <td className="text-right text-[#94A3B8] tabular-nums">{px(r.oracle_usd)}</td>
                        <td className="text-right text-[#E2E8F0] tabular-nums">{px(r.dex_usd)}</td>
                        <td className={`text-right tabular-nums ${r.drift_pct == null ? "text-[#64748B]" : r.drift_pct > 0 ? "text-[#34D399]" : r.drift_pct < 0 ? "text-[#F87171]" : "text-[#94A3B8]"}`}>
                          {r.drift_pct == null ? "—" : `${r.drift_pct > 0 ? "+" : ""}${r.drift_pct.toFixed(2)}%`}
                        </td>
                        <td className="text-right text-[#94A3B8] tabular-nums">{usd(r.total_tvl_usd)}</td>
                        <td className="text-right text-[#94A3B8] tabular-nums">{usd(r.volume_24h_usd)}</td>
                        <td className="text-right pr-4 text-[#64748B]">{ago(r.oracle_updated_at)}
                          <span className="block text-[10px]">{oracleLabel(r.oracle_updated_at, asOf ?? "")}</span>
                          <span className="block text-[10px]">{r.oracle_updated_at ? new Date(r.oracle_updated_at * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "unavailable"}</span></td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-4 text-[#64748B]">No Base rows in the last poll.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[12px] text-[#64748B] leading-relaxed">
            {asOf && <>Last Base poll {new Date(asOf).toISOString().replace("T", " ").slice(0, 19)} UTC{stale ? " (stale)" : ""}. </>}
            Sources: Chainlink feeds on Base 8453 (multiplier divided out) and pool spot from GeckoTerminal/DexScreener. Free for agents: POST /api/x402/hood-live. Drift arrows stopped publishing on 2026-09-30; <Link href="/hood/arrows" className="text-[#4FC3F7]">their record</Link> stays public.
          </p>
        </MarketContainer>
      </MarketScroll>
    </div>
  );
}
