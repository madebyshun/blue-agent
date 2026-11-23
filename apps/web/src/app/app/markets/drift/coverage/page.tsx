import Link from "next/link";
import { MarketScroll, MarketContainer } from "../../MarketLayout";
import { MarketHero, MarketNav, CoverageMap } from "../../MarketVisuals";
import MarketsHeader from "../../MarketsHeader";
import { readStockCoverage } from "@/lib/base-stocks/coverage";
import { summarizeStockCoverage } from "../../../../../../../../packages/core/src/stock-coverage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Base stock coverage — Blue Agent" };
const money = (n: number | null) => n === null ? "—" : `$${n.toFixed(2)}`;
const utc = (s: string) => new Date(s).toISOString().replace("T", " ").slice(0, 19) + " UTC";
const reasonLabels: Record<string, string> = {
  rpc_block_unreadable: "Base RPC block unavailable", identity_mismatch: "Token identity mismatch", identity_unreadable: "Token identity unreadable",
  not_issued: "No supply issued", supply_unreadable: "Supply unreadable", multiplier_unreadable: "Multiplier unreadable",
  reference_multiplier_mismatch: "Issuer and onchain multiplier not reconciled", transfer_paused: "Transfers paused", transfer_pause_unreadable: "Transfer pause unreadable",
  issuer_nav_not_published: "No NAV published in the issuer API", feed_mapping_not_verified: "Chainlink feed mapping not yet verified",
  explorer_unreadable: "Explorer check inconclusive", pool_not_indexed: "No Base pool indexed by this provider", pool_no_anchored_quote: "No readable anchored quote in provider results",
  pool_unknown: "Pool provider unreadable", pool_not_checked: "Pool not checked", rpc_read_failed: "Base RPC read failed",
  reference_missing_invalid_or_older_than_7_days: "Reference date missing, invalid or over 7 days old",
  pool_activity_below_observation_floor: "Thin pool activity", pool_activity_unreadable: "Pool activity unreadable",
};

export default async function StockCoveragePage() {
  const p = await readStockCoverage();
  const v = p.status === "hit" ? p.value : null;
  const s = v ? summarizeStockCoverage(v) : null;
  const stale = v && Date.now() - Date.parse(v.updated_at) > 24 * 3600_000;
  return (
    <div className="flex h-full flex-col bg-[#070b12] text-[#E2E8F0] font-mono">
      <MarketsHeader active={null} chip="Coverage · Base 8453" />
      <MarketScroll>
        <MarketContainer>
          <MarketHero label="COVERAGE ATLAS" title="A market, mapped honestly." description="From the official catalog to an observable market. Track issuance, references and pool availability across Base, with every unknown kept visible." stats={[
            { label: "Officially listed", value: s ? String(s.listed) : "—", detail: "Base 8453" },
            { label: "Supply issued", value: s ? String(s.issued) : "—", detail: "assessed addresses" },
            { label: "Readable pool quotes", value: s ? String(s.pool_readable) : "—", detail: "indexed anchored pools" },
          ]} />
          <MarketNav active="coverage" />
          {v && <CoverageMap catalog={v.catalog} rows={v.rows} />}
          {!v || !s ? <p className="text-sm text-amber-400">{p.status === "error" ? "Coverage storage is unreadable; its contents are unknown." : "The first coverage scan has not run yet. No assessment is being inferred from the 12-stock watchlist."}</p> : <>
            <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0F1E] p-4 text-sm leading-relaxed">
              <p>{s.listed} listed · {s.assessed} assessed · {s.pending} pending · {s.issued} issued · {s.unissued} unissued · {s.issuance_unknown} supply unknown</p>
              <p>{s.issuer_reference_available} issuer NAVs available · {s.verified_feed_mapping} verified feed mappings · {s.pool_readable} pool quotes · {s.observed} comparable observations</p>
              <p className="mt-2 text-xs text-[#94A3B8]">Catalog read {utc(v.catalog_at)}. Latest batch {utc(v.updated_at)}. {v.completed_at ? "Scan complete." : "Scan in progress; these counts cover only assessed rows."}</p>
              {stale && <p className="mt-2 text-amber-400">This scan has not advanced in over 24 hours. These results are historical.</p>}
            </section>
            <p className="text-xs leading-relaxed text-[#94A3B8]">Scanned in bounded batches. A readable quote is an observation, not an executable price or grading admission. Pool activity uses reported liquidity and 24h volume; 72h candle liveness and independent price bands still require review. &quot;Not indexed&quot; describes the provider, not every pool on Base.</p>
            <div className="overflow-x-auto rounded-xl border border-[#1A1A2E]">
              <table className="w-full min-w-[1100px] text-xs">
                <thead><tr className="bg-[#0B0F1E] text-left text-[#94A3B8]">{["STOCK", "IDENTITY / ISSUANCE", "ISSUER NAV", "POOL SPOT", "GAP", "ASSESSED UTC", "ASSESSMENT"].map((h) => <th className="p-3" key={h}>{h}</th>)}</tr></thead>
                <tbody>{[...v.rows].sort((a, b) => a.ticker.localeCompare(b.ticker)).map((r) => <tr className="border-t border-[#1A1A2E] align-top" key={r.contract}>
                  <td className="p-3"><span className="inline-flex items-center gap-1.5"><Link href={`/markets/base/${r.contract}`} className="text-[#4FC3F7] hover:underline">{r.symbol}</Link>{r.explorer === "pass" && <a href={`https://basescan.org/token/${r.contract}`} target="_blank" rel="noreferrer" className="text-[10px] text-[#64748B] hover:text-[#4FC3F7]" title="Basescan">↗</a>}</span><span className="mt-1 block text-[10px] text-[#64748B]">{r.grading_admitted ? "fixed cohort" : "inventory only"}</span></td>
                  <td className="p-3">{r.identity}<span className="block text-[#94A3B8]">{r.issued === null ? "supply unknown" : r.issued ? "issued" : "unissued"}</span></td>
                  <td className="p-3">{money(r.reference_usd)}<span className="mt-1 block text-[10px] text-[#64748B]">{r.reference_at && Number.isFinite(Date.parse(r.reference_at)) ? utc(r.reference_at) : "reference date unavailable"}</span></td>
                  <td className="p-3">{money(r.pool?.price_usd ?? null)}<span className="block text-[#94A3B8]">{r.activity}</span></td>
                  <td className="p-3">{r.gap_pct === null ? "—" : `${r.gap_pct > 0 ? "+" : ""}${r.gap_pct.toFixed(2)}%`}</td>
                  <td className="p-3 whitespace-nowrap text-[#94A3B8]">{utc(r.assessed_at)}</td>
                  <td className="max-w-[360px] p-3 leading-relaxed text-[#94A3B8]">{r.reasons.length ? r.reasons.map((x) => reasonLabels[x] ?? x).join("; ") : "Comparable observation; grading admission unchanged"}</td>
                </tr>)}</tbody>
              </table>
            </div>
            {s.pending > 0 && <details className="text-xs text-[#94A3B8]"><summary className="cursor-pointer">{s.pending} stocks awaiting assessment</summary><p className="mt-3 leading-relaxed">{v.catalog.slice(v.cursor).map((r) => r.symbol).join(", ")}</p></details>}
          </>}
          <p className="text-xs text-[#94A3B8]">Sources: <a className="text-[#4FC3F7]" href="https://www.base.org/stocks">Base official catalog</a>, Coinbase Tokenized Stocks API, Base RPC, Basescan and DexScreener. <a className="text-[#4FC3F7]" href="https://blueagent.dev/api/stocks/coverage">Read coverage JSON</a>.</p>
        </MarketContainer>
      </MarketScroll>
    </div>
  );
}
