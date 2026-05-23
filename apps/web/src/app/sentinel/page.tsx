"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity   = "critical" | "high" | "medium" | "low";
type TargetType = "address" | "token" | "domain";

interface Finding {
  id:         string;
  threatName: string;
  category:   string;
  severity:   Severity;
  target:     string;
  targetType: string;
  summary:    string;
  detectedAt: string;
  alerted:    boolean;
}

interface Watch {
  id:        string;
  target:    string;
  targetType: TargetType;
  label?:    string;
  active:    boolean;
  createdAt: string;
}

interface Stats {
  totalScans:       number;
  totalFindings:    number;
  lastScan:         string | null;
  activeWatches:    number;
  criticalFindings: number;
  highFindings:     number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEV: Record<Severity, { badge: string; bar: string; left: string; bg: string; label: string }> = {
  critical: { badge: "text-red-400 border-red-500/40 bg-red-500/10",    bar: "bg-red-500",    left: "border-l-red-500",    bg: "bg-red-500/5",    label: "🚨 CRITICAL" },
  high:     { badge: "text-orange-400 border-orange-500/40 bg-orange-500/10", bar: "bg-orange-500", left: "border-l-orange-500", bg: "bg-orange-500/5", label: "⚠️ HIGH"     },
  medium:   { badge: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10", bar: "bg-yellow-500", left: "border-l-yellow-500", bg: "bg-yellow-500/5", label: "🟡 MEDIUM"  },
  low:      { badge: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10", bar: "bg-emerald-500", left: "border-l-emerald-500", bg: "bg-emerald-500/5", label: "🟢 LOW" },
};

const THREAT_CATS = [
  { icon: "🍯", name: "Honeypot",       color: "#f87171", desc: "Token blocks sells after buy" },
  { icon: "🏃", name: "Rug Pull",       color: "#fb923c", desc: "Unlocked LP, unlimited mint" },
  { icon: "🎣", name: "Phishing",       color: "#fbbf24", desc: "Fake Coinbase / Uniswap domains" },
  { icon: "🌀", name: "Mixer / AML",    color: "#a78bfa", desc: "Tornado Cash, sanctions exposure" },
  { icon: "⚡", name: "Exploit",        color: "#f472b6", desc: "Flash loan, reentrancy patterns" },
  { icon: "🩸", name: "Drain",          color: "#ef4444", desc: "Approval drainers, NFT sweeps" },
  { icon: "🎭", name: "Scam Token",     color: "#60a5fa", desc: "Impersonating USDC / ETH" },
  { icon: "🔓", name: "Bad Approval",   color: "#34d399", desc: "Infinite approval to unverified" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000)     return `${Math.floor(d / 1_000)}s ago`;
  if (d < 3_600_000)  return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

function trunc(s: string, n = 18): string {
  return s.length <= n ? s : s.slice(0, 8) + "…" + s.slice(-4);
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  stats, watches, scanning, scanResult,
  onScan, onRemoveWatch,
}: {
  stats:         Stats | null;
  watches:       Watch[];
  scanning:      boolean;
  scanResult:    string | null;
  onScan:        () => void;
  onRemoveWatch: (id: string) => void;
}) {
  return (
    <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto border-r border-[#1A1A2E] py-8 px-4">

      {/* Header */}
      <div className="px-2 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          <span className="font-mono text-[10px] text-red-400 tracking-widest">LIVE · BASE CHAIN</span>
        </div>
        <h2 className="font-mono text-lg font-bold text-white">
          Blue<span className="text-red-400">Sentinel</span>
        </h2>
        <p className="font-mono text-[10px] text-slate-700 mt-0.5">24/7 onchain security monitor</p>
      </div>

      {/* Stats */}
      <div className="px-2 mb-6">
        <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-3">FINDINGS</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Critical", value: stats?.criticalFindings ?? 0, color: "text-red-400" },
            { label: "High",     value: stats?.highFindings     ?? 0, color: "text-orange-400" },
            { label: "Total",    value: stats?.totalFindings    ?? 0, color: "text-white" },
            { label: "Scans",    value: stats?.totalScans       ?? 0, color: "text-slate-400" },
          ].map(s => (
            <div key={s.label} className="card-surface rounded-lg p-2.5">
              <p className={`font-mono text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="font-mono text-[9px] text-slate-700 mt-0.5 uppercase tracking-widest">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scan */}
      <div className="px-2 mb-6">
        <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-3">SCAN</p>
        <button onClick={onScan} disabled={scanning}
          className={`w-full font-mono text-xs px-3 py-2.5 rounded-lg border transition-all ${
            scanning
              ? "border-[#4FC3F7]/20 text-[#4FC3F7]/50 cursor-not-allowed"
              : "border-[#4FC3F7]/30 text-[#4FC3F7] hover:bg-[#4FC3F7]/5"
          }`}>
          {scanning ? "↺ scanning…" : "↺ trigger scan"}
        </button>
        {scanResult && (
          <p className="font-mono text-[10px] text-emerald-400 mt-2 px-1">{scanResult}</p>
        )}
        {stats?.lastScan && (
          <p className="font-mono text-[10px] text-slate-700 mt-1.5 px-1">
            last scan {timeAgo(stats.lastScan)}
          </p>
        )}
        <p className="font-mono text-[10px] text-slate-800 mt-1 px-1">cron: daily 12:00 UTC</p>
      </div>

      {/* Watched targets */}
      <div className="px-2 mb-6">
        <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-3">
          WATCHED · <span className="text-[#4FC3F7]">{watches.length}</span>
        </p>
        {watches.length === 0 ? (
          <p className="font-mono text-[10px] text-slate-800 px-1">No active watches</p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            {watches.map(w => (
              <div key={w.id}
                className="card-surface rounded-lg px-3 py-2 flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  {w.label && (
                    <p className="font-mono text-[10px] text-white truncate mb-0.5">{w.label}</p>
                  )}
                  <code className="font-mono text-[9px] text-[#4FC3F7] block truncate">
                    {trunc(w.target, 20)}
                  </code>
                  <span className="font-mono text-[9px] text-slate-700 capitalize">{w.targetType}</span>
                </div>
                <button onClick={() => onRemoveWatch(w.id)}
                  className="font-mono text-[9px] text-slate-800 hover:text-red-400 transition-colors shrink-0">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer links */}
      <div className="mt-auto px-2 pt-6 border-t border-[#1A1A2E] space-y-2">
        <a href="/api/sentinel/test-alert"
          className="font-mono text-[10px] text-slate-700 hover:text-red-400 transition-colors block">
          🚨 test alert →
        </a>
        <a href="/api/sentinel/findings"
          className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors block">
          findings API →
        </a>
        <Link href="/hub"
          className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors block">
          ← hub
        </Link>
        <a href="https://t.me/blueagent_hub" target="_blank" rel="noreferrer"
          className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors block">
          @blueagent_hub →
        </a>
      </div>
    </aside>
  );
}

// ─── Finding card ─────────────────────────────────────────────────────────────

function FindingCard({ f, onDismiss }: { f: Finding; onDismiss: (id: string) => void }) {
  return (
    <div className={`card-surface rounded-xl p-4 border-l-4 ${SEV[f.severity].left}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${SEV[f.severity].badge}`}>
            {SEV[f.severity].label}
          </span>
          <span className="font-mono text-sm text-white">{f.threatName}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] text-slate-600">{timeAgo(f.detectedAt)}</span>
          <button onClick={() => onDismiss(f.id)}
            className="font-mono text-[10px] text-slate-700 hover:text-red-400 transition-colors">✕</button>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[10px] text-slate-600 capitalize">{f.targetType}</span>
        <code className="font-mono text-[10px] text-[#4FC3F7]">{trunc(f.target, 22)}</code>
        <span className="font-mono text-[10px] text-slate-700 ml-auto capitalize">{f.category}</span>
        {f.alerted && <span className="font-mono text-[9px] text-emerald-600">✓ alerted</span>}
      </div>
      <p className="font-mono text-xs text-slate-500 leading-relaxed line-clamp-2">{f.summary}</p>
    </div>
  );
}

// ─── Add watch form ───────────────────────────────────────────────────────────

function AddWatchForm({ onAdded }: { onAdded: () => void }) {
  const [target,  setTarget]  = useState("");
  const [type,    setType]    = useState<TargetType>("address");
  const [label,   setLabel]   = useState("");
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [err,     setErr]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target.trim()) return;
    setLoading(true); setErr("");
    try {
      const res  = await fetch("/api/sentinel/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: target.trim(), targetType: type, label: label.trim() || undefined }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Failed");
      setDone(true); setTarget(""); setLabel("");
      onAdded();
      setTimeout(() => setDone(false), 3000);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }

  return (
    <div className="card-surface rounded-xl p-5">
      <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-4">// ADD WATCH TARGET</p>

      {done ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
          <p className="font-mono text-xs text-emerald-400">✓ Sentinel is now watching this target</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-1.5">
            {(["address","token","domain"] as TargetType[]).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`font-mono text-[10px] px-2.5 py-1.5 rounded border transition-colors capitalize flex-1 ${
                  type === t
                    ? "border-[#4FC3F7]/40 text-[#4FC3F7] bg-[#4FC3F7]/8"
                    : "border-[#1A1A2E] text-slate-600 hover:text-slate-300"
                }`}>{t}</button>
            ))}
          </div>

          <input
            className="w-full bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2.5 font-mono text-xs text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/30 transition-colors"
            placeholder={type === "domain" ? "example.com or https://…" : "0x… address"}
            value={target} onChange={e => setTarget(e.target.value)} required
          />

          <input
            className="w-full bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2.5 font-mono text-xs text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/30 transition-colors"
            placeholder="Label (optional) — e.g. My wallet, USDC contract"
            value={label} onChange={e => setLabel(e.target.value)}
          />

          {err && <p className="font-mono text-[10px] text-red-400">{err}</p>}

          <button type="submit" disabled={loading || !target.trim()}
            className="w-full py-2.5 bg-[#4FC3F7]/8 hover:bg-[#4FC3F7]/15 border border-[#4FC3F7]/30 text-[#4FC3F7] font-mono text-xs rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? "Adding…" : "🛡️ Watch this target →"}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SentinelPage() {
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [watches,  setWatches]  = useState<Watch[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [sevFilter, setSevFilter] = useState<Severity | "all">("all");

  const load = useCallback(async () => {
    try {
      const res  = await fetch("/api/sentinel/watch");
      const data = await res.json() as { stats: Stats; findings: Finding[]; watches: Watch[] };
      setStats(data.stats);
      setFindings(data.findings ?? []);
      setWatches((data.watches ?? []).filter(w => w.active));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleScan() {
    setScanning(true); setScanResult(null);
    try {
      const res  = await fetch("/api/sentinel/scan");
      const data = await res.json() as { findings?: number; alerted?: number };
      setScanResult(`✓ ${data.findings ?? 0} finding(s) · ${data.alerted ?? 0} alerted`);
      void load();
    } catch { setScanResult("scan error"); }
    finally { setScanning(false); }
  }

  async function dismissFinding(id: string) {
    await fetch(`/api/sentinel/findings?id=${id}`, { method: "DELETE" });
    void load();
  }

  async function removeWatch(id: string) {
    await fetch(`/api/sentinel/watch?id=${id}`, { method: "DELETE" });
    void load();
  }

  const filtered = findings
    .filter(f => sevFilter === "all" || f.severity === sevFilter)
    .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());

  return (
    <>
      <Navbar />
      <div className="flex bg-[#050508] font-mono pt-16">

        {/* ── Sidebar ────────────────────────────────────── */}
        <Sidebar
          stats={stats}
          watches={watches}
          scanning={scanning}
          scanResult={scanResult}
          onScan={handleScan}
          onRemoveWatch={removeWatch}
        />

        {/* ── Main content ───────────────────────────────── */}
        <main className="flex-1 h-[calc(100vh-4rem)] overflow-y-auto px-6 lg:px-10 py-10">

          {/* Page header */}
          <div className="mb-8">
            <p className="font-mono text-xs text-red-400 tracking-widest mb-3">// ONCHAIN SECURITY MONITOR</p>
            <h1 className="font-mono text-4xl sm:text-5xl font-bold text-white mb-3">
              Blue<span className="text-red-400">Sentinel</span>
            </h1>
            <p className="font-mono text-base text-slate-400 max-w-xl leading-relaxed">
              Watch wallets, tokens, and domains. Get instant Telegram alerts when threats are detected on Base.
            </p>
          </div>

          {/* ── Bento top row — stat cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Critical",        value: stats?.criticalFindings ?? 0, color: "text-red-400",    border: "border-l-red-500"    },
              { label: "High",            value: stats?.highFindings     ?? 0, color: "text-orange-400", border: "border-l-orange-500" },
              { label: "Active Watches",  value: stats?.activeWatches    ?? 0, color: "text-[#4FC3F7]",  border: "border-l-[#4FC3F7]"  },
              { label: "Total Scans",     value: stats?.totalScans       ?? 0, color: "text-white",      border: "border-l-[#1A1A2E]"  },
            ].map(s => (
              <div key={s.label} className={`card-surface rounded-xl p-4 border-l-4 ${s.border}`}>
                <p className={`font-mono text-3xl font-bold ${s.color}`}>{s.value}</p>
                <p className="font-mono text-[10px] text-slate-600 mt-1 uppercase tracking-widest">{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── Main grid — findings + add watch ── */}
          <div className="grid lg:grid-cols-3 gap-6 mb-6">

            {/* Findings feed — 2/3 width */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-xs text-slate-600 tracking-widest">// LIVE FINDINGS</p>
                {/* Severity filter */}
                <div className="flex gap-1">
                  {(["all","critical","high","medium","low"] as const).map(s => (
                    <button key={s} onClick={() => setSevFilter(s)}
                      className={`font-mono text-[9px] px-2 py-1 rounded border transition-colors capitalize ${
                        sevFilter === s
                          ? "border-[#4FC3F7]/40 text-[#4FC3F7] bg-[#4FC3F7]/8"
                          : "border-[#1A1A2E] text-slate-700 hover:text-slate-400"
                      }`}>{s}</button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="card-surface rounded-xl p-10 text-center">
                  <p className="font-mono text-xs text-slate-700 animate-pulse">loading…</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="card-surface rounded-xl p-12 text-center">
                  <p className="text-3xl mb-3">🛡️</p>
                  <p className="font-mono text-sm text-slate-400 mb-1">No findings</p>
                  <p className="font-mono text-[10px] text-slate-700">
                    {watches.length === 0 ? "Add a target to start monitoring" : "All watched targets look clean"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map(f => (
                    <FindingCard key={f.id} f={f} onDismiss={dismissFinding} />
                  ))}
                </div>
              )}
            </div>

            {/* Add watch form — 1/3 width */}
            <div className="space-y-4">
              <AddWatchForm onAdded={load} />

              {/* Mobile watches list */}
              <div className="card-surface rounded-xl p-5 lg:hidden">
                <p className="font-mono text-xs text-slate-600 tracking-widest mb-3">
                  // WATCHES · {watches.length}
                </p>
                {watches.length === 0 ? (
                  <p className="font-mono text-[10px] text-slate-700">No active watches</p>
                ) : (
                  <div className="space-y-2">
                    {watches.map(w => (
                      <div key={w.id} className="flex items-center gap-2 border-b border-[#1A1A2E] pb-2 last:border-0 last:pb-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          {w.label && <p className="font-mono text-[10px] text-white truncate">{w.label}</p>}
                          <code className="font-mono text-[9px] text-[#4FC3F7] block truncate">{trunc(w.target, 20)}</code>
                        </div>
                        <button onClick={() => removeWatch(w.id)}
                          className="font-mono text-[9px] text-slate-700 hover:text-red-400 transition-colors">remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Threat catalog ── */}
          <div className="mb-6">
            <p className="font-mono text-xs text-slate-600 tracking-widest mb-3">// THREAT CATALOG · 8 CATEGORIES</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {THREAT_CATS.map(t => (
                <div key={t.name}
                  className="card-surface rounded-xl p-3 hover:border-[#2A2A4E] transition-colors text-center card-hover">
                  <p className="text-2xl mb-2">{t.icon}</p>
                  <p className="font-mono text-[10px] font-bold mb-1" style={{ color: t.color }}>{t.name}</p>
                  <p className="font-mono text-[9px] text-slate-700 leading-tight hidden sm:block">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── How it works ── */}
          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            {[
              { step: "01", color: "#4FC3F7", title: "Watch",  desc: "Add any wallet, token contract, or domain. Sentinel registers it for continuous monitoring." },
              { step: "02", color: "#A78BFA", title: "Scan",   desc: "Every cycle, checks each target against threat catalog + Hub security tools (honeypot, AML, phishing)." },
              { step: "03", color: "#34D399", title: "Alert",  desc: "Critical and high-severity findings trigger instant Telegram alerts — before damage is done." },
            ].map(h => (
              <div key={h.step} className="card-surface rounded-xl p-5">
                <p className="font-mono text-4xl font-bold mb-3" style={{ color: h.color + "30" }}>{h.step}</p>
                <p className="font-mono text-sm font-bold mb-2" style={{ color: h.color }}>{h.title}</p>
                <p className="font-mono text-xs text-slate-500 leading-relaxed">{h.desc}</p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-[#1A1A2E] pt-5 flex items-center justify-between flex-wrap gap-3">
            <p className="font-mono text-[10px] text-slate-800">
              Blue<span className="text-red-400/40">Sentinel</span> · {stats?.totalFindings ?? 0} threats detected · Base chain 8453
            </p>
            <div className="flex items-center gap-4">
              <a href="https://x.com/blueagent_" target="_blank" rel="noreferrer"
                className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors">@blueagent_</a>
              <a href="https://t.me/blueagent_hub" target="_blank" rel="noreferrer"
                className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors">Telegram</a>
              <Link href="/hub" className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors">Hub →</Link>
            </div>
          </div>

        </main>
      </div>
    </>
  );
}
