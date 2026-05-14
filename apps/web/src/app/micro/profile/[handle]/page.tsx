"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import type { MicroReputation, MicroClaim } from "@/lib/micro-types";
import { CLAIM_STATUS_COLORS } from "@/lib/micro-types";

const GRID_BG = {
  backgroundImage:
    "linear-gradient(rgba(79,195,247,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(79,195,247,0.03) 1px,transparent 1px)",
  backgroundSize: "40px 40px",
};

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const fill = (score / 100) * circ;
  const color = score >= 80 ? "#4FC3F7" : score >= 60 ? "#A78BFA" : score >= 40 ? "#FACC15" : "#F87171";
  return (
    <svg width="96" height="96" className="rotate-[-90deg]">
      <circle cx="48" cy="48" r={radius} stroke="#1A1A2E" strokeWidth="6" fill="none" />
      <circle
        cx="48" cy="48" r={radius}
        stroke={color}
        strokeWidth="6"
        fill="none"
        strokeDasharray={`${fill} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text
        x="48" y="48"
        dominantBaseline="middle"
        textAnchor="middle"
        fill={color}
        fontSize="18"
        fontWeight="bold"
        fontFamily="monospace"
        style={{ transform: "rotate(90deg)", transformOrigin: "48px 48px" }}
      >
        {score}
      </text>
    </svg>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card-surface rounded-xl border border-[#1A1A2E] p-4">
      <div className="font-mono text-[10px] text-slate-600 mb-1">{label}</div>
      <div className="font-mono text-lg font-bold text-white">{value}</div>
      {sub && <div className="font-mono text-[10px] text-slate-700 mt-0.5">{sub}</div>}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface ProfileData {
  reputation: MicroReputation;
  recent_claims: MicroClaim[];
  top_platforms: { platform: string; count: number }[];
  posted_count: number;
}

export default function MicroProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);

  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/micro/profile/${handle}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((d) => {
        if (d) setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [handle]);

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="bg-[#050508] min-h-screen pt-16 font-mono" style={GRID_BG}>
          <div className="max-w-3xl mx-auto px-4 py-12">
            <div className="card-surface rounded-xl p-6 border border-[#1A1A2E] animate-pulse-slow h-64" />
          </div>
        </main>
      </>
    );
  }

  if (notFound || !data) {
    return (
      <>
        <Navbar />
        <main className="bg-[#050508] min-h-screen pt-16 font-mono" style={GRID_BG}>
          <div className="max-w-3xl mx-auto px-4 py-20 text-center">
            <div className="font-mono text-slate-500 text-2xl mb-3">○</div>
            <p className="font-mono text-sm text-slate-500 mb-2">@{handle} not found</p>
            <p className="font-mono text-[11px] text-slate-700 mb-6">
              This handle has no microtask activity yet.
            </p>
            <Link href="/micro" className="font-mono text-xs text-[#4FC3F7] hover:underline">
              ← Browse marketplace
            </Link>
          </div>
        </main>
      </>
    );
  }

  const { reputation: rep, recent_claims, top_platforms, posted_count } = data;
  const scoreLabel = rep.score >= 80 ? "Excellent" : rep.score >= 60 ? "Good" : rep.score >= 40 ? "Fair" : "New";

  return (
    <>
      <Navbar />
      <main className="bg-[#050508] font-mono min-h-screen pt-16" style={GRID_BG}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">

          {/* Breadcrumb */}
          <div className="mb-6">
            <Link href="/micro" className="font-mono text-[11px] text-slate-600 hover:text-slate-400 transition-colors">
              ← Microtasks
            </Link>
          </div>

          {/* Profile header */}
          <div className="card-surface rounded-xl border border-[#1A1A2E] p-6 mb-4">
            <div className="flex items-center gap-6 flex-wrap">
              <ScoreRing score={rep.score} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h1 className="font-mono text-xl font-bold text-white">@{rep.handle}</h1>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-[#4FC3F7]/30 text-[#4FC3F7] bg-[#4FC3F7]/10">
                    {scoreLabel}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-slate-600 mb-3">
                  Reputation score: <span className="text-white font-bold">{rep.score}/100</span>
                </div>
                {rep.address && (
                  <div className="font-mono text-[10px] text-slate-700 break-all">
                    {rep.address.slice(0, 6)}…{rep.address.slice(-4)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <StatCard
              label="Completed"
              value={String(rep.completed)}
              sub={`${rep.rejected} rejected`}
            />
            <StatCard
              label="Approval rate"
              value={`${(rep.approved_rate * 100).toFixed(0)}%`}
              sub={rep.completed + rep.rejected > 0 ? `${rep.completed + rep.rejected} total` : "no history"}
            />
            <StatCard
              label="Total earned"
              value={`$${rep.total_earned_usdc.toFixed(2)}`}
              sub="USDC"
            />
            <StatCard
              label="Avg turnaround"
              value={rep.avg_turnaround_minutes > 0
                ? rep.avg_turnaround_minutes >= 60
                  ? `${(rep.avg_turnaround_minutes / 60).toFixed(1)}h`
                  : `${rep.avg_turnaround_minutes}m`
                : "—"
              }
              sub="accept → submit"
            />
            <StatCard
              label="Tasks posted"
              value={String(posted_count)}
              sub="as creator"
            />
            <StatCard
              label="Last active"
              value={rep.last_activity ? formatDate(rep.last_activity) : "—"}
            />
          </div>

          {/* Top platforms */}
          {top_platforms.length > 0 && (
            <div className="card-surface rounded-xl border border-[#1A1A2E] p-5 mb-4">
              <div className="font-mono text-[10px] text-slate-600 mb-3">Top platforms</div>
              <div className="flex flex-wrap gap-2">
                {top_platforms.map((tp) => (
                  <div key={tp.platform}
                    className="font-mono text-[11px] px-3 py-1.5 rounded-lg border border-[#1A1A2E] bg-[#0D0D14] text-slate-300">
                    {tp.platform} <span className="text-slate-600">× {tp.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent claims */}
          {recent_claims.length > 0 && (
            <div className="card-surface rounded-xl border border-[#1A1A2E] p-5">
              <div className="font-mono text-[10px] text-slate-600 mb-3">
                Recent activity ({recent_claims.length})
              </div>
              <div className="space-y-2">
                {recent_claims.map((claim) => (
                  <div key={claim.id}
                    className="flex items-center justify-between gap-3 py-2 border-b border-[#1A1A2E] last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${CLAIM_STATUS_COLORS[claim.status]}`}>
                        {claim.status}
                      </span>
                      <Link
                        href={`/micro/${claim.task_id}`}
                        className="font-mono text-[11px] text-slate-400 hover:text-[#4FC3F7] transition-colors truncate"
                      >
                        task/{claim.task_id.slice(0, 8)}…
                      </Link>
                    </div>
                    <span className="font-mono text-[10px] text-slate-700 flex-shrink-0">
                      {formatDate(claim.accepted_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recent_claims.length === 0 && (
            <div className="card-surface rounded-xl border border-[#1A1A2E] p-8 text-center">
              <p className="font-mono text-sm text-slate-600">No task activity yet</p>
              <Link href="/micro" className="inline-block mt-3 font-mono text-xs text-[#4FC3F7] hover:underline">
                Browse open tasks →
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
