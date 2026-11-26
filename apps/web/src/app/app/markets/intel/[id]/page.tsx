import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MarketScroll, MarketContainer } from "../../MarketLayout";
import MarketsHeader from "../../MarketsHeader";
import { MarketNav } from "../../MarketVisuals";
import CopyDraftButton from "../CopyDraftButton";
import { readIntelEvent } from "@/lib/intel/store";
import { buildIntelXDraft } from "@/lib/intel/draft";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const ev = await readIntelEvent(id);
  if (!ev) return { title: "Intel Event Not Found — Blue Agent" };
  return {
    title: `${ev.symbol} ${ev.session} volume (${ev.nyDate}) — Blue Agent Markets Intel`,
    description: `${ev.symbol} on Base 8453 hit $${Math.round(ev.observedUsd).toLocaleString("en-US")} (${ev.volumeMultiple.toFixed(2)}x prior ${ev.baselineLookbackDays}d median).`,
  };
}

const fmtUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default async function IntelEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ev = await readIntelEvent(id);
  if (!ev) notFound();

  const xDraft = buildIntelXDraft(ev);

  return (
    <div className="flex flex-col h-full bg-[#070b12] overflow-hidden font-mono">
      <MarketsHeader active="markets" chip={`INTEL EVIDENCE · ${ev.symbol} · BASE 8453`} />
      <MarketScroll>
        <MarketContainer>
          <MarketNav active="intel" />

          <div className="mt-5 space-y-5 pb-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/markets/intel" className="text-[12px] text-[#4FC3F7] hover:underline">
                Back to Markets Intel
              </Link>
              <a
                href={`/api/markets/intel/${encodeURIComponent(ev.id)}`}
                className="text-[12px] text-[#94A3B8] hover:text-[#4FC3F7]"
              >
                Open raw evidence JSON
              </a>
            </div>

            {ev.isFixture && (
              <div className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-4 py-3 text-[12px] text-[#F59E0B]">
                LABELED DEMO FIXTURE — This record uses fixture data to demonstrate the evidence page and copy-ready X draft flow. It is not a live market reading.
              </div>
            )}

            {/* Header summary */}
            <section className="rounded-2xl border border-[#1A1A2E] bg-[#0B0F1E] p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-[22px] font-semibold text-white">
                    {ev.symbol} · {ev.name}
                  </h1>
                  <span className="rounded border border-[#4FC3F7]/40 bg-[#4FC3F7]/10 px-2 py-0.5 text-[11px] uppercase text-[#4FC3F7]">
                    {ev.session}
                  </span>
                  <span className="rounded border border-[#1A1A2E] px-2 py-0.5 text-[11px] text-[#94A3B8]">
                    BASE 8453 · {ev.detectorVersion} · REV #{ev.revision}
                  </span>
                </div>
                <span className="text-[18px] font-semibold text-[#10B981] tabular-nums">
                  {ev.volumeMultiple.toFixed(2)}x median
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px] text-[#94A3B8] pt-2 border-t border-[#1A1A2E]">
                <div>
                  <span className="block text-[#64748B]">Session Window ({ev.timeZone})</span>
                  <span className="text-[#E2E8F0]">{ev.nyDate} · {ev.windowNyLabel}</span>
                </div>
                <div>
                  <span className="block text-[#64748B]">UTC Range</span>
                  <span className="text-[#E2E8F0]">{ev.windowStartUtc} to {ev.windowEndUtc}</span>
                </div>
                <div>
                  <span className="block text-[#64748B]">Token Contract (Base 8453)</span>
                  <a
                    href={`https://basescan.org/token/${ev.tokenAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#4FC3F7] hover:underline break-all"
                  >
                    {ev.tokenAddress}
                  </a>
                </div>
              </div>
              <p className="text-[12px] text-[#94A3B8]">{ev.boundaryNote}</p>
            </section>

            {/* Quantitative comparison */}
            <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="rounded-xl border border-[#1A1A2E] bg-[#0B0F1E] p-4">
                <span className="block text-[11px] text-[#64748B]">Observed Volume</span>
                <span className="mt-1 block text-[20px] font-semibold text-white tabular-nums">{fmtUsd(ev.observedUsd)}</span>
              </div>
              <div className="rounded-xl border border-[#1A1A2E] bg-[#0B0F1E] p-4">
                <span className="block text-[11px] text-[#64748B]">Baseline Median ({ev.baselineLookbackDays}d)</span>
                <span className="mt-1 block text-[20px] font-semibold text-[#E2E8F0] tabular-nums">{fmtUsd(ev.baselineMedianUsd)}</span>
              </div>
              <div className="rounded-xl border border-[#1A1A2E] bg-[#0B0F1E] p-4">
                <span className="block text-[11px] text-[#64748B]">Baseline Samples</span>
                <span className="mt-1 block text-[20px] font-semibold text-[#E2E8F0] tabular-nums">n = {ev.baselineSampleCount}</span>
              </div>
              <div className="rounded-xl border border-[#1A1A2E] bg-[#0B0F1E] p-4">
                <span className="block text-[11px] text-[#64748B]">USD Increase</span>
                <span className="mt-1 block text-[20px] font-semibold text-[#10B981] tabular-nums">+{fmtUsd(ev.usdIncreaseUsd)}</span>
              </div>
              <div className="rounded-xl border border-[#1A1A2E] bg-[#0B0F1E] p-4">
                <span className="block text-[11px] text-[#64748B]">Volume Multiple</span>
                <span className="mt-1 block text-[20px] font-semibold text-[#10B981] tabular-nums">{ev.volumeMultiple.toFixed(2)}x</span>
              </div>
            </section>

            {/* Copy-ready X draft */}
            <section className="rounded-2xl border border-[#4FC3F7]/30 bg-[#0B0F1E] p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#4FC3F7]">
                    X Draft for @blueagent_
                  </h2>
                  <p className="text-[11px] text-[#64748B]">
                    Draft only — no automatic posting. Every figure is sourced directly from this stored evidence record.
                  </p>
                </div>
                <CopyDraftButton draft={xDraft} />
              </div>
              <blockquote className="rounded-xl border border-[#1A1A2E] bg-[#070b12] p-4 text-[13px] leading-relaxed text-[#E2E8F0] select-all">
                {xDraft}
              </blockquote>
              <p className="text-[11px] text-[#64748B]">{xDraft.length} characters</p>
            </section>

            {/* Pool breakdown */}
            <section className="rounded-2xl border border-[#1A1A2E] bg-[#0B0F1E] p-5 space-y-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#E2E8F0]">
                Selected Pools & Contribution ({ev.poolContributions.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[#1A1A2E] text-[#64748B]">
                      <th className="py-2 pr-4">Pool</th>
                      <th className="py-2 pr-4">DEX</th>
                      <th className="py-2 pr-4 text-right">Observed USD</th>
                      <th className="py-2 pr-4 text-right">Share</th>
                      <th className="py-2 pr-4 text-right">28d Median</th>
                      <th className="py-2 text-right">Missing Hrs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ev.poolContributions.map((p) => (
                      <tr key={p.address} className="border-b border-[#1A1A2E]/60 text-[#CBD5E1]">
                        <td className="py-2.5 pr-4">
                          <span className="block text-[#E2E8F0]">{p.name}</span>
                          <span className="text-[11px] text-[#64748B]">{p.address}</span>
                        </td>
                        <td className="py-2.5 pr-4 text-[#94A3B8]">{p.dex}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{fmtUsd(p.observedUsd)}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-[#4FC3F7]">{p.sharePct.toFixed(1)}%</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-[#94A3B8]">
                          {p.baselineMedianUsd !== null ? fmtUsd(p.baselineMedianUsd) : "—"}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{p.missingHoursInWindow}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-[#64748B]">
                Same pool set used in both the evaluated window and all prior {ev.baselineLookbackDays}-day baseline windows.
              </p>
            </section>

            {/* Coverage gaps, trigger rule, provenance */}
            <section className="rounded-2xl border border-[#1A1A2E] bg-[#0B0F1E] p-5 space-y-3 text-[12px]">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#E2E8F0]">
                Rule, Coverage & Provenance
              </h2>
              <div className="space-y-2 text-[#CBD5E1]">
                <p><span className="text-[#64748B]">Trigger rule:</span> {ev.triggerRule}</p>
                <p><span className="text-[#64748B]">Source:</span> {ev.source}</p>
                <p><span className="text-[#64748B]">Last update:</span> {ev.updatedAt} (created {ev.createdAt})</p>
                <p>
                  <span className="text-[#64748B]">Coverage:</span>{" "}
                  {ev.coverage.observedHoursCompleteAcrossPools}/{ev.coverage.expectedHours} complete full hours in window ·{" "}
                  {ev.coverage.missingPoolHours} missing pool-hour(s) ·{" "}
                  {ev.coverage.excludedIncompleteBaselineWindows}/{ev.coverage.candidateBaselineWindows} prior candidate windows excluded as incomplete.
                </p>
                {ev.coverage.straddlingHoursExcluded.length > 0 && (
                  <p>
                    <span className="text-[#64748B]">Boundary-straddling hours excluded:</span>{" "}
                    {ev.coverage.straddlingHoursExcluded.join("; ")}
                  </p>
                )}
                {ev.coverage.notes.length > 0 && (
                  <ul className="list-disc pl-5 text-[#94A3B8] space-y-1">
                    {ev.coverage.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Revision history */}
            {ev.revisions.length > 0 && (
              <section className="rounded-2xl border border-[#1A1A2E] bg-[#0B0F1E] p-5 space-y-2 text-[12px]">
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#E2E8F0]">
                  Evidence Revisions ({ev.revisions.length} prior)
                </h2>
                <div className="space-y-2">
                  {ev.revisions.map((r) => (
                    <div key={r.revision} className="rounded-lg border border-[#1A1A2E] bg-[#070b12] p-3 text-[#94A3B8]">
                      Rev #{r.revision} (superseded {r.supersededAt}): Observed {fmtUsd(r.observedUsd)} vs median {fmtUsd(r.baselineMedianUsd)} ({r.volumeMultiple.toFixed(2)}x, +{fmtUsd(r.usdIncreaseUsd)}, n={r.baselineSampleCount})
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </MarketContainer>
      </MarketScroll>
    </div>
  );
}
