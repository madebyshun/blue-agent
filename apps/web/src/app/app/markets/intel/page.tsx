import Link from "next/link";
import type { Metadata } from "next";
import { MarketScroll, MarketContainer } from "../MarketLayout";
import MarketsHeader from "../MarketsHeader";
import { MarketHero, MarketNav } from "../MarketVisuals";
import { DEMO_FIXTURE_EVENT, listIntelEvents, readIntelScanSummary } from "@/lib/intel/store";
import { DEFAULT_INTEL_CONFIG, INTEL_TARGET_TICKERS, type IntelEvent } from "@/lib/intel/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Markets Intel — Blue Agent",
  description:
    "Unusual DEX swap volume by NYSE session for NVDAc, AAPLc, and MSTRc on Base 8453, with verifiable evidence and copy-ready X drafts.",
};

const fmtUsd = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B`
  : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K`
  : `$${Math.round(n)}`;

function EventRow({ ev }: { ev: IntelEvent }) {
  return (
    <Link
      href={`/markets/intel/${ev.id}`}
      className="block rounded-xl border border-[#1A1A2E] bg-[#0B0F1E] p-4 hover:border-[#4FC3F7]/50 transition-colors"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-mono text-[15px] font-semibold text-white">{ev.symbol}</span>
          <span className="rounded border border-[#4FC3F7]/30 bg-[#4FC3F7]/10 px-2 py-0.5 font-mono text-[11px] uppercase text-[#4FC3F7]">
            {ev.session}
          </span>
          <span className="font-mono text-[12px] text-[#94A3B8]">
            {ev.nyDate} · {ev.windowNyLabel}
          </span>
          {ev.isFixture && (
            <span className="rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 font-mono text-[11px] text-[#F59E0B]">
              FIXTURE
            </span>
          )}
        </div>
        <span className="font-mono text-[14px] font-semibold text-[#10B981] tabular-nums">
          {ev.volumeMultiple.toFixed(2)}x median
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px] font-mono pt-2 border-t border-[#1A1A2E]">
        <div>
          <span className="block text-[#64748B]">Observed</span>
          <span className="text-[#E2E8F0] tabular-nums">{fmtUsd(ev.observedUsd)}</span>
        </div>
        <div>
          <span className="block text-[#64748B]">{ev.baselineLookbackDays}d Median (n={ev.baselineSampleCount})</span>
          <span className="text-[#E2E8F0] tabular-nums">{fmtUsd(ev.baselineMedianUsd)}</span>
        </div>
        <div>
          <span className="block text-[#64748B]">USD Increase</span>
          <span className="text-[#10B981] tabular-nums">+{fmtUsd(ev.usdIncreaseUsd)}</span>
        </div>
        <div>
          <span className="block text-[#64748B]">Scope · Rev</span>
          <span className="text-[#94A3B8]">{ev.pools.length} Base pool(s) · r{ev.revision}</span>
        </div>
      </div>
    </Link>
  );
}

export default async function MarketsIntelPage() {
  const [events, scan] = await Promise.all([listIntelEvents(), readIntelScanSummary()]);

  return (
    <div className="flex flex-col h-full bg-[#070b12] overflow-hidden font-mono">
      <MarketsHeader
        active="markets"
        chip={`INTEL V1 · ${INTEL_TARGET_TICKERS.length} VERIFIED B20 STOCKS · BASE 8453`}
      />
      <MarketScroll>
        <MarketContainer>
          <MarketHero
            label="MARKETS INTEL V1"
            title="Unusual session volume."
            description="Comparable full-hour America/New_York trading windows across all 12 verified Base B20 stock tokens, measured against each token's prior 28-day median across the same selected DEX pools."
            stats={[
              { label: "Live events stored", value: String(events.length), detail: "idempotent · versioned" },
              { label: "Tracked tokens", value: String(INTEL_TARGET_TICKERS.length), detail: "NVDAc · AAPLc · MSTRc + 9 more" },
              {
                label: "Trigger floor",
                value: `${DEFAULT_INTEL_CONFIG.minVolumeMultiple}x`,
                detail: `+${fmtUsd(DEFAULT_INTEL_CONFIG.minUsdIncrease)} · n>=${DEFAULT_INTEL_CONFIG.minBaselineSamples}`,
              },
            ]}
          />
          <MarketNav active="intel" />

          <section className="mt-5 space-y-4">
            <div className="rounded-xl border border-[#1A1A2E] bg-[#0B0F1E] p-4 text-[12px] text-[#94A3B8] space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[#E2E8F0] font-semibold tracking-wider uppercase">Detector Rules (v1)</span>
                <span className="text-[#64748B]">
                  {scan ? `Last scan: ${scan.scannedAt}` : "No scheduled scan recorded yet"}
                </span>
              </div>
              <p>
                Comparable full-hour windows in America/New_York: premarket (04:00-09:00 ET, 5h), regular (10:00-16:00 ET, 6h), afterhours (16:00-20:00 ET, 4h).
                Candles straddling the 09:30 ET open (09:00-10:00 ET), NYSE holidays, early-close regular sessions, and incomplete windows are excluded rather than estimated.
              </p>
              <p>
                Thresholds: observed &gt;= {DEFAULT_INTEL_CONFIG.minVolumeMultiple}x prior {DEFAULT_INTEL_CONFIG.lookbackDays}d median,
                absolute increase &gt;= {fmtUsd(DEFAULT_INTEL_CONFIG.minUsdIncrease)}, and &gt;= {DEFAULT_INTEL_CONFIG.minBaselineSamples} complete comparable baseline windows across the same top {DEFAULT_INTEL_CONFIG.maxPools} Base pools.
              </p>
              {scan && (
                <p className="text-[#64748B]">
                  Last scan summary: {scan.windowsEvaluated} window(s) evaluated · {scan.qualifiedCount} qualified · {scan.normalCount} normal · {scan.insufficientDataCount} insufficient-data.
                </p>
              )}
            </div>

            {events.length > 0 ? (
              <div className="space-y-3">
                <h2 className="text-[12px] uppercase tracking-[0.16em] text-[#94A3B8]">Live Evidence Events</h2>
                {events.map((ev) => (
                  <EventRow key={ev.id} ev={ev} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-[#1A1A2E] bg-[#0B0F1E] p-5 space-y-3">
                <p className="text-[13px] text-[#E2E8F0]">No live unusual-volume events stored yet.</p>
                <p className="text-[12px] text-[#94A3B8]">
                  Run the cron endpoint <code className="text-[#4FC3F7]">/api/cron/markets-intel</code> or the historical replay script to ingest qualifying events, or inspect the clearly labeled demo fixture below to verify the evidence page and X draft workflow.
                </p>
              </div>
            )}

            <div className="space-y-2.5 pt-2">
              <h2 className="text-[12px] uppercase tracking-[0.16em] text-[#F59E0B]">Labeled Demo Fixture</h2>
              <EventRow ev={DEMO_FIXTURE_EVENT} />
            </div>
          </section>
        </MarketContainer>
      </MarketScroll>
    </div>
  );
}
