// /markets/drift — the Blue Hood drift board, Base 8453 only (moved here from
// /hood on 2026-11-12, which now redirects). Chainlink oracle vs the deepest
// Base pool for each desk stock, from the poller's last 5-minute cycle: the
// same rows the free `hood-live` x402 id serves. Arrows stopped publishing on
// 2026-09-30; their record stays at /hood/arrows.
import type { Metadata } from "next";
import Link from "next/link";
import MarketsHeader from "../MarketsHeader";
import StockMark from "@/components/blue-hood/StockMark";
import hoodLive from "@/app/api/x402/_handlers/hood-live";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Drift — Blue Agent",
  description: "Chainlink oracle vs Base DEX price for stock tokens on Base 8453, every 5 minutes.",
};

interface Row {
  ticker: string; contract: string; explorer: string;
  oracle_usd: number | null; dex_usd: number | null; drift_pct: number | null;
  total_tvl_usd: number | null; volume_24h_usd: number | null;
  market_session: string; oracle_updated_at: number | null;
}

const usd = (n: number | null) => (n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(2)}`);
const px = (n: number | null) => (n == null ? "—" : `$${n.toFixed(2)}`);
const ago = (s: number | null) => {
  if (s == null) return "—";
  const m = Math.round((Date.now() / 1000 - s) / 60);
  return m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

export default async function DriftPage() {
  let rows: Row[] = [];
  let asOf: string | null = null, stale = false, failed = false;
  try {
    const r = await hoodLive(new Request("https://blueagent.dev/api/x402/hood-live", { method: "POST", body: JSON.stringify({ chain: "base" }) }));
    if (!r.ok) failed = true;
    else {
      const j = (await r.json()) as { rows?: Row[]; as_of?: string; is_stale?: boolean };
      rows = (j.rows ?? []).sort((a, b) => Math.abs(b.drift_pct ?? 0) - Math.abs(a.drift_pct ?? 0));
      asOf = j.as_of ?? null; stale = !!j.is_stale;
    }
  } catch { failed = true; }

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_a]:font-mono">
      <MarketsHeader active={null} chip="Drift · Base 8453" />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-6 w-full max-w-[1120px] mx-auto flex flex-col gap-5">
          <section>
            <div className="text-[11px] tracking-[0.16em] text-[#64748B]">BASE 8453 · ORACLE VS DEX</div>
            <h1 className="mt-2 text-[26px] md:text-[32px] font-semibold text-[#F8FAFC] leading-tight">Where Base trades a stock away from its oracle.</h1>
            <p className="mt-2 text-[13px] text-[#94A3B8] leading-relaxed max-w-[760px]">
              Each row is a Coinbase stock token on Base: its Chainlink price, the deepest Base pool&apos;s price and the gap between them, read every 5 minutes. Over a weekend the oracle holds Friday&apos;s price, so the gap is what Base is pricing for Monday; the <Link href="/markets/weekend" className="text-[#4FC3F7]">weekend scorecard</Link> grades it.
            </p>
          </section>

          {failed ? (
            <p className="text-[13px] text-[#F59E0B]">The drift board could not be read right now. Nothing is shown rather than an empty board.</p>
          ) : (
            <div className="bg-[#0B0F1E] border border-[#1A1A2E] rounded-[16px] overflow-x-auto">
              <table className="w-full text-[13px] min-w-[720px]">
                <thead>
                  <tr className="text-left text-[#64748B] text-[11px] tracking-[0.08em]">
                    <th className="px-4 py-3">STOCK</th><th className="text-right">ORACLE</th><th className="text-right">BASE DEX</th>
                    <th className="text-right">DRIFT</th><th className="text-right">POOL TVL</th><th className="text-right">24H VOL</th><th className="text-right pr-4">ORACLE AGE</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.ticker} className="border-t border-[#1A1A2E]">
                      <td className="px-4 py-2.5">
                        <a href={r.explorer} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 text-[#E2E8F0] hover:text-[#4FC3F7]">
                          <StockMark ticker={r.ticker} chain="base" size={24} /><span>{r.ticker}c</span>
                        </a>
                      </td>
                      <td className="text-right text-[#94A3B8]">{px(r.oracle_usd)}</td>
                      <td className="text-right text-[#E2E8F0]">{px(r.dex_usd)}</td>
                      <td className={`text-right ${r.drift_pct == null ? "text-[#64748B]" : r.drift_pct > 0 ? "text-[#4ADE80]" : r.drift_pct < 0 ? "text-[#F87171]" : "text-[#94A3B8]"}`}>
                        {r.drift_pct == null ? "—" : `${r.drift_pct > 0 ? "+" : ""}${r.drift_pct.toFixed(2)}%`}
                      </td>
                      <td className="text-right text-[#94A3B8]">{usd(r.total_tvl_usd)}</td>
                      <td className="text-right text-[#94A3B8]">{usd(r.volume_24h_usd)}</td>
                      <td className="text-right pr-4 text-[#64748B]">{ago(r.oracle_updated_at)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-4 text-[#64748B]">No Base rows in the last poll.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[12px] text-[#64748B] leading-relaxed">
            {asOf && <>Last poll {new Date(asOf).toUTCString().slice(17, 22)} UTC{stale ? " (stale)" : ""}. </>}
            Sources: Chainlink feeds on Base 8453 (multiplier divided out) and each token&apos;s deepest pool via GeckoTerminal. Free for agents: POST /api/x402/hood-live. Drift arrows stopped publishing on 2026-09-30; <Link href="/hood/arrows" className="text-[#4FC3F7]">their record</Link> stays public.
          </p>
        </div>
      </div>
    </div>
  );
}
