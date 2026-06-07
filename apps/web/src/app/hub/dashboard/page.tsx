"use client";

/**
 * /hub/dashboard — Builder dashboard.
 * Shows tools owned by the connected wallet, live call counts, accrued revenue.
 * Withdraw button is a Phase 4 hook (splitter contract not yet live).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@/components/ConnectModal";

interface BuilderTool {
  id:            string;
  name:          string;
  description:   string;
  category:      string;
  endpoint:      string;
  price:         string;
  priceUSDC:     number;
  verified:      boolean;
  aiReady:       boolean;
  submittedAt:   number;
  callCount?:    number;
  revenueTotal?: number;
}

function shortAddr(a: string) { return a.slice(0, 6) + "…" + a.slice(-4); }
function usdc(units: number)  { return `$${(units / 1_000_000).toFixed(4)}`; }
function relTime(ms: number)  {
  const d = Date.now() - ms;
  if (d < 60_000)    return "just now";
  if (d < 3600_000)  return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

export default function BuilderDashboard() {
  const { address, isConnected } = useAccount();
  const [tools, setTools]     = useState<BuilderTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    setErr(null);
    fetch(`/api/hub/builders/${address}/tools`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: { tools: BuilderTool[] }) => setTools(d.tools))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [address]);

  const stats = tools.reduce(
    (acc, t) => ({
      tools:   acc.tools + 1,
      calls:   acc.calls + (t.callCount ?? 0),
      revenue: acc.revenue + (t.revenueTotal ?? 0),
    }),
    { tools: 0, calls: 0, revenue: 0 },
  );

  return (
    <div className="min-h-screen bg-[#050508] text-white font-mono">

      {/* Header */}
      <div className="border-b border-[#1A1A2E] px-6 h-14 flex items-center gap-3">
        <Link href="/hub" className="text-xs text-slate-500 hover:text-white transition-colors">← Hub</Link>
        <span className="w-1 h-1 rounded-full bg-[#34D399] animate-pulse" />
        <p className="text-xs text-[#34D399] tracking-widest">// BUILDER DASHBOARD</p>
        <p className="text-[10px] text-slate-700 hidden sm:block">Your tools, calls, and revenue</p>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/hub/submit" className="text-[11px] px-3 py-1.5 rounded-lg border border-[#A78BFA]/30 text-[#A78BFA] bg-[#A78BFA]/5 hover:bg-[#A78BFA]/10 transition-all">
            + Submit tool
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {!isConnected ? (
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#34D399]/10 border border-[#34D399]/20 flex items-center justify-center mx-auto mb-6">
              <svg className="w-7 h-7 text-[#34D399]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
              </svg>
            </div>
            <h2 className="text-lg font-bold mb-2">Connect to view your dashboard</h2>
            <p className="text-sm text-slate-500 mb-6 max-w-xs mx-auto">
              See tools you&apos;ve registered, live call counts, and accrued USDC revenue.
            </p>
            <ConnectButton label="Connect Wallet" />
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatCard label="TOOLS"   value={String(stats.tools)} accent="#4FC3F7" />
              <StatCard label="CALLS"   value={stats.calls.toLocaleString()} accent="#A78BFA" />
              <StatCard label="REVENUE" value={usdc(stats.revenue)} accent="#34D399" sub="80% builder share" />
            </div>

            {/* Wallet badge */}
            <div className="mb-6 rounded-xl border border-[#1A1A2E] bg-[#0d0d12] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-[#4FC3F7] animate-pulse" />
                <span className="text-xs text-slate-300">Wallet</span>
                <code className="text-xs text-[#4FC3F7]">{address ? shortAddr(address) : ""}</code>
              </div>
              <a href={`https://basescan.org/address/${address}`} target="_blank" rel="noopener noreferrer"
                 className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
                Basescan ↗
              </a>
            </div>

            {/* Loading / error */}
            {loading && <p className="text-xs text-slate-600">Loading your tools…</p>}
            {err && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 mb-4">
                <p className="text-xs text-red-400">{err}</p>
              </div>
            )}

            {/* Empty */}
            {!loading && !err && tools.length === 0 && (
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-8 text-center">
                <p className="text-sm font-semibold mb-1">No tools registered yet</p>
                <p className="text-[11px] text-slate-600 mb-4">List your first tool — earn USDC per call on Base.</p>
                <Link href="/hub/submit" className="inline-block text-xs px-4 py-2 rounded-xl border border-[#A78BFA]/30 text-[#A78BFA] bg-[#A78BFA]/5 hover:bg-[#A78BFA]/10 transition-all">
                  Submit your first tool →
                </Link>
              </div>
            )}

            {/* Tool list */}
            {tools.length > 0 && (
              <div className="rounded-2xl border border-[#1A1A2E] overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2 border-b border-[#1A1A2E] bg-[#0a0a0f] text-[10px] tracking-widest text-slate-600">
                  <span>TOOL</span>
                  <span>STATUS</span>
                  <span className="text-right">CALLS</span>
                  <span className="text-right">REVENUE</span>
                  <span className="text-right">SUBMITTED</span>
                </div>
                {tools.map(t => (
                  <Link key={t.id} href={`/hub/${t.id}`}
                    className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-3 border-b border-[#1A1A2E] last:border-0 hover:bg-[#A78BFA]/5 transition-colors items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{t.name}</p>
                      <p className="text-[10px] text-slate-600 truncate">{t.description}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {t.verified ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#34D399]/30 text-[#34D399]/90 bg-[#34D399]/5">✓ Verified</span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-400 bg-amber-500/5">pending review</span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-right tabular-nums">{(t.callCount ?? 0).toLocaleString()}</span>
                    <span className="text-xs font-semibold text-[#34D399] text-right tabular-nums">{usdc(t.revenueTotal ?? 0)}</span>
                    <span className="text-[10px] text-slate-600 text-right">{relTime(t.submittedAt)}</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Withdraw banner (Phase 4) */}
            {tools.length > 0 && stats.revenue > 0 && (
              <div className="mt-6 rounded-xl border border-[#A78BFA]/20 bg-[#A78BFA]/5 p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold mb-0.5">{usdc(stats.revenue)} accrued · ready to claim</p>
                  <p className="text-[10px] text-slate-600">Splitter contract (80% builder / 20% treasury) launches Phase 4. Bookkeeping is live now.</p>
                </div>
                <button disabled className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#A78BFA]/30 text-[#A78BFA]/60 bg-[#A78BFA]/5 cursor-not-allowed">
                  Withdraw (coming soon)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] px-5 py-4">
      <p className="text-[10px] tracking-widest mb-1" style={{ color: accent }}>{label}</p>
      <p className="text-2xl font-bold leading-none" style={{ color: accent }}>{value}</p>
      {sub && <p className="text-[10px] text-slate-700 mt-1">{sub}</p>}
    </div>
  );
}
