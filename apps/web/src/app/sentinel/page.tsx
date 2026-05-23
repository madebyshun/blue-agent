"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SentinelStats {
  totalScans:       number;
  totalFindings:    number;
  lastScan:         string | null;
  activeWatches:    number;
  criticalFindings: number;
  highFindings:     number;
}

interface Finding {
  id:          string;
  threatName:  string;
  category:    string;
  severity:    "critical" | "high" | "medium" | "low";
  target:      string;
  targetType:  string;
  summary:     string;
  detectedAt:  string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const THREAT_CATEGORIES = [
  { icon: "🍯", name: "Honeypot",           desc: "Tokens that block sells after buy" },
  { icon: "🏃", name: "Rug Pull",           desc: "Unlocked LP, unlimited mint, unrenounced ownership" },
  { icon: "🎣", name: "Phishing",           desc: "Domains impersonating Coinbase, Uniswap, Base" },
  { icon: "🌀", name: "Mixer / AML",        desc: "Tornado Cash exposure, sanctions, layering" },
  { icon: "⚡", name: "Exploit Pattern",    desc: "Flash loan attacks, reentrancy vulnerabilities" },
  { icon: "🩸", name: "Wallet Drain",       desc: "Unlimited approval drainers, NFT sweeps" },
  { icon: "🎭", name: "Scam Token",         desc: "Tokens impersonating USDC, ETH, major assets" },
  { icon: "🔓", name: "Malicious Approval", desc: "Infinite ERC-20 approvals to unverified contracts" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Watch",
    desc:  "Add any wallet, token contract, or domain. Sentinel registers it for continuous monitoring.",
    color: "#4FC3F7",
  },
  {
    step: "02",
    title: "Scan",
    desc:  "Every cycle, Sentinel checks each target against the threat catalog + Hub security tools.",
    color: "#A78BFA",
  },
  {
    step: "03",
    title: "Alert",
    desc:  "Critical and high-severity findings trigger instant Telegram alerts — before damage is done.",
    color: "#34D399",
  },
];

const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400 border-red-500/40 bg-red-500/10",
  high:     "text-orange-400 border-orange-500/40 bg-orange-500/10",
  medium:   "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
  low:      "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
};

const SEV_BAR: Record<string, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-500",
  medium:   "bg-yellow-500",
  low:      "bg-emerald-500",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)     return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function truncate(s: string, n = 18): string {
  if (s.length <= n) return s;
  return s.slice(0, 8) + "…" + s.slice(-4);
}

// ─── Animated counter ─────────────────────────────────────────────────────────

function Counter({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) return;
    const steps = 40;
    const inc   = value / steps;
    let cur     = 0;
    const t     = setInterval(() => {
      cur += inc;
      if (cur >= value) { setDisplay(value); clearInterval(t); }
      else setDisplay(Math.floor(cur));
    }, duration / steps);
    return () => clearInterval(t);
  }, [value, duration]);

  return <>{display.toLocaleString()}</>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SentinelLandingPage() {
  const [stats,    setStats]    = useState<SentinelStats | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [watchInput, setWatchInput] = useState("");
  const [watchType,  setWatchType]  = useState<"address" | "token" | "domain">("address");
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchDone,    setWatchDone]    = useState(false);

  const load = useCallback(async () => {
    try {
      const res  = await fetch("/api/sentinel/watch");
      const data = await res.json() as {
        stats:    SentinelStats;
        findings: Finding[];
      };
      setStats(data.stats);
      setFindings((data.findings ?? []).slice(0, 5));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleWatch(e: React.FormEvent) {
    e.preventDefault();
    if (!watchInput.trim()) return;
    setWatchLoading(true);
    try {
      await fetch("/api/sentinel/watch", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ target: watchInput.trim(), targetType: watchType }),
      });
      setWatchDone(true);
      setWatchInput("");
      void load();
    } finally {
      setWatchLoading(false);
    }
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#050508] font-mono text-white">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section className="relative pt-28 pb-16 px-4 text-center overflow-hidden">
          {/* Glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-red-500/5 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-3xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 border border-red-500/20 bg-red-500/5 rounded-full px-4 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="font-mono text-[10px] text-red-400 tracking-widest">LIVE · Base chain · 24/7</span>
            </div>

            <h1 className="font-mono text-5xl sm:text-6xl font-bold tracking-tight mb-4">
              Blue<span className="text-red-400">Sentinel</span>
            </h1>

            <p className="font-mono text-base text-slate-400 max-w-xl mx-auto leading-relaxed mb-8">
              24/7 onchain security monitor for Base.
              Watch wallets, tokens, and domains —
              get instant alerts before damage is done.
            </p>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/hub/sentinel"
                className="font-mono text-sm px-6 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg transition-colors">
                Open Dashboard →
              </Link>
              <Link href="/hub"
                className="font-mono text-sm px-6 py-3 bg-[#1A1A2E] hover:bg-[#1A1A2E]/80 border border-[#2A2A3E] text-slate-400 rounded-lg transition-colors">
                Hub Tools
              </Link>
            </div>
          </div>
        </section>

        {/* ── Live stats ────────────────────────────────────────────────────── */}
        <section className="py-10 border-y border-[#1A1A2E]">
          <div className="max-w-4xl mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Threats Detected",   value: stats?.totalFindings   ?? 0, accent: true  },
                { label: "Active Watches",      value: stats?.activeWatches   ?? 0, accent: false },
                { label: "Scans Run",           value: stats?.totalScans      ?? 0, accent: false },
                { label: "Critical Findings",   value: stats?.criticalFindings ?? 0, accent: true  },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className={`font-mono text-3xl font-bold mb-1 ${s.accent ? "text-red-400" : "text-white"}`}>
                    <Counter value={s.value} />
                  </p>
                  <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">{s.label}</p>
                </div>
              ))}
            </div>
            {stats?.lastScan && (
              <p className="text-center font-mono text-[10px] text-slate-800 mt-4">
                last scan {timeAgo(stats.lastScan)}
              </p>
            )}
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────────── */}
        <section className="py-16 px-4">
          <div className="max-w-4xl mx-auto">
            <p className="font-mono text-[10px] text-slate-700 tracking-widest text-center mb-10">// HOW IT WORKS</p>
            <div className="grid md:grid-cols-3 gap-6">
              {HOW_IT_WORKS.map(h => (
                <div key={h.step} className="relative p-6 rounded-xl border border-[#1A1A2E] bg-[#0D0D1A]">
                  <div className="font-mono text-4xl font-bold mb-4" style={{ color: h.color + "30" }}>
                    {h.step}
                  </div>
                  <p className="font-mono text-base font-bold mb-2" style={{ color: h.color }}>
                    {h.title}
                  </p>
                  <p className="font-mono text-xs text-slate-500 leading-relaxed">{h.desc}</p>

                  {/* Connector arrow */}
                  {h.step !== "03" && (
                    <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                      <span className="font-mono text-slate-700">→</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Threat catalog ────────────────────────────────────────────────── */}
        <section className="py-16 px-4 border-t border-[#1A1A2E]">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-2">// THREAT CATALOG</p>
              <p className="font-mono text-2xl font-bold text-white">8 threat categories</p>
              <p className="font-mono text-xs text-slate-600 mt-2">monitored continuously across Base</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {THREAT_CATEGORIES.map(t => (
                <div key={t.name}
                  className="p-4 rounded-xl border border-[#1A1A2E] bg-[#0D0D1A] hover:border-red-500/20 transition-colors">
                  <p className="text-2xl mb-2">{t.icon}</p>
                  <p className="font-mono text-xs font-bold text-white mb-1">{t.name}</p>
                  <p className="font-mono text-[10px] text-slate-600 leading-relaxed">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Live findings feed ────────────────────────────────────────────── */}
        <section className="py-16 px-4 border-t border-[#1A1A2E]">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-1">// LIVE FINDINGS</p>
                <p className="font-mono text-sm text-white">Recent threats detected on Base</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                <span className="font-mono text-[10px] text-red-400">live</span>
              </div>
            </div>

            {findings.length === 0 ? (
              <div className="rounded-xl border border-[#1A1A2E] bg-[#0D0D1A] p-10 text-center">
                <p className="text-3xl mb-3">🛡️</p>
                <p className="font-mono text-sm text-slate-500">No findings yet</p>
                <p className="font-mono text-[10px] text-slate-700 mt-1">Add a watch target to start monitoring</p>
              </div>
            ) : (
              <div className="space-y-3">
                {findings.map(f => (
                  <div key={f.id}
                    className={`rounded-xl border p-4 flex items-start gap-4 ${
                      f.severity === "critical" ? "border-red-500/20 bg-red-500/5" :
                      f.severity === "high"     ? "border-orange-500/20 bg-orange-500/5" :
                      "border-[#1A1A2E] bg-[#0D0D1A]"
                    }`}>
                    <div className={`w-1 self-stretch rounded-full shrink-0 ${SEV_BAR[f.severity]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${SEV_COLOR[f.severity]}`}>
                          {f.severity}
                        </span>
                        <span className="font-mono text-xs text-white">{f.threatName}</span>
                        <span className="font-mono text-[10px] text-slate-700 ml-auto">{timeAgo(f.detectedAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[10px] text-slate-600 capitalize">{f.targetType}</span>
                        <code className="font-mono text-[10px] text-[#4FC3F7]">{truncate(f.target)}</code>
                      </div>
                      <p className="font-mono text-[10px] text-slate-500 leading-relaxed line-clamp-2">{f.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="text-center mt-6">
              <Link href="/hub/sentinel"
                className="font-mono text-xs text-slate-600 hover:text-[#4FC3F7] transition-colors">
                View all findings in dashboard →
              </Link>
            </div>
          </div>
        </section>

        {/* ── Quick watch CTA ───────────────────────────────────────────────── */}
        <section className="py-16 px-4 border-t border-[#1A1A2E]">
          <div className="max-w-xl mx-auto text-center">
            <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-3">// WATCH YOUR ASSETS</p>
            <h2 className="font-mono text-2xl font-bold text-white mb-2">Start monitoring in seconds</h2>
            <p className="font-mono text-xs text-slate-500 mb-8">
              Add any wallet, token, or domain. Sentinel watches 24/7 and alerts you the moment a threat is detected.
            </p>

            {watchDone ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
                <p className="font-mono text-sm text-emerald-400 mb-1">✓ Watch target added</p>
                <p className="font-mono text-[10px] text-slate-500">Sentinel is now monitoring this target.</p>
                <Link href="/hub/sentinel"
                  className="inline-block mt-4 font-mono text-xs text-[#4FC3F7] hover:text-[#4FC3F7]/80 transition-colors">
                  View in dashboard →
                </Link>
              </div>
            ) : (
              <form onSubmit={handleWatch} className="space-y-3">
                {/* Target type */}
                <div className="flex gap-2 justify-center">
                  {(["address", "token", "domain"] as const).map(t => (
                    <button key={t} type="button" onClick={() => setWatchType(t)}
                      className={`font-mono text-[10px] px-3 py-1.5 rounded border transition-colors capitalize ${
                        watchType === t
                          ? "border-red-500/40 text-red-400 bg-red-500/10"
                          : "border-[#1A1A2E] text-slate-600 hover:text-slate-300"
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>

                <input
                  className="w-full bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-4 py-3 font-mono text-xs text-white placeholder-slate-700 focus:outline-none focus:border-red-500/30 transition-colors"
                  placeholder={
                    watchType === "domain"  ? "example.com or https://…" :
                    watchType === "token"   ? "0x… token contract address" :
                                             "0x… wallet or contract address"
                  }
                  value={watchInput}
                  onChange={e => setWatchInput(e.target.value)}
                  required
                />

                <button
                  type="submit"
                  disabled={watchLoading || !watchInput.trim()}
                  className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-mono text-xs rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {watchLoading ? "Adding…" : "🛡️ Watch this target →"}
                </button>
              </form>
            )}
          </div>
        </section>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <footer className="border-t border-[#1A1A2E] py-8 px-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="font-mono text-xs text-white font-bold">Blue<span className="text-red-400">Sentinel</span></p>
              <p className="font-mono text-[10px] text-slate-700 mt-0.5">by @blueagent_ · Base chain · x402</p>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/hub/sentinel" className="font-mono text-[10px] text-slate-600 hover:text-slate-300 transition-colors">Dashboard</Link>
              <Link href="/hub"          className="font-mono text-[10px] text-slate-600 hover:text-slate-300 transition-colors">Hub Tools</Link>
              <a href="https://t.me/blueagent_hub" target="_blank" rel="noreferrer"
                className="font-mono text-[10px] text-slate-600 hover:text-slate-300 transition-colors">Telegram</a>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
