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
  id:         string;
  target:     string;
  targetType: TargetType;
  label?:     string;
  active:     boolean;
  createdAt:  string;
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

const SEV_STYLES: Record<Severity, { badge: string; bar: string; border: string; glow: string }> = {
  critical: { badge: "text-red-400 border-red-500/40 bg-red-500/10",    bar: "bg-red-500",    border: "border-l-red-500",    glow: "bg-red-500/5"    },
  high:     { badge: "text-orange-400 border-orange-500/40 bg-orange-500/10", bar: "bg-orange-500", border: "border-l-orange-500", glow: "bg-orange-500/5" },
  medium:   { badge: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10", bar: "bg-yellow-500", border: "border-l-yellow-500", glow: "bg-yellow-500/5" },
  low:      { badge: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10", bar: "bg-emerald-500", border: "border-l-emerald-500", glow: "bg-emerald-500/5" },
};

const SEV_EMOJI: Record<Severity, string> = { critical: "🚨", high: "⚠️", medium: "🟡", low: "🟢" };

const THREATS = [
  { icon: "🍯", name: "Honeypot",    color: "#f87171" },
  { icon: "🏃", name: "Rug Pull",    color: "#fb923c" },
  { icon: "🎣", name: "Phishing",    color: "#fbbf24" },
  { icon: "🌀", name: "Mixer/AML",   color: "#a78bfa" },
  { icon: "⚡", name: "Exploit",     color: "#f472b6" },
  { icon: "🩸", name: "Drain",       color: "#ef4444" },
  { icon: "🎭", name: "Scam Token",  color: "#60a5fa" },
  { icon: "🔓", name: "Bad Approval",color: "#34d399" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000)     return `${Math.floor(d / 1000)}s ago`;
  if (d < 3_600_000)  return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

function trunc(s: string, n = 16): string {
  return s.length <= n ? s : s.slice(0, 8) + "…" + s.slice(-4);
}

// ─── Animated counter ─────────────────────────────────────────────────────────

function Counter({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!to) return;
    const steps = 30;
    let i = 0;
    const t = setInterval(() => {
      i++;
      setN(Math.round((to * i) / steps));
      if (i >= steps) clearInterval(t);
    }, 900 / steps);
    return () => clearInterval(t);
  }, [to]);
  return <>{n.toLocaleString()}</>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SentinelPage() {
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [watches,  setWatches]  = useState<Watch[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Watch form
  const [target,  setTarget]  = useState("");
  const [type,    setType]    = useState<TargetType>("address");
  const [label,   setLabel]   = useState("");
  const [adding,  setAdding]  = useState(false);
  const [added,   setAdded]   = useState(false);
  const [addErr,  setAddErr]  = useState("");

  // Scan
  const [scanning,    setScanning]    = useState(false);
  const [scanResult,  setScanResult]  = useState<string | null>(null);

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!target.trim()) return;
    setAdding(true); setAddErr("");
    try {
      const res  = await fetch("/api/sentinel/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: target.trim(), targetType: type, label: label.trim() || undefined }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Failed");
      setAdded(true); setTarget(""); setLabel("");
      setTimeout(() => setAdded(false), 3000);
      void load();
    } catch (e) { setAddErr((e as Error).message); }
    finally { setAdding(false); }
  }

  async function handleScan() {
    setScanning(true); setScanResult(null);
    try {
      const res  = await fetch("/api/sentinel/scan");
      const data = await res.json() as { findings?: number; alerted?: number };
      setScanResult(`✓ ${data.findings ?? 0} finding(s) · ${data.alerted ?? 0} alert(s) sent`);
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

  const critical = findings.filter(f => f.severity === "critical");
  const high     = findings.filter(f => f.severity === "high");
  const recent   = [...findings].sort((a,b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()).slice(0, 6);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#050508] font-mono text-white pt-16">
        <div className="max-w-7xl mx-auto px-4 py-8">

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Link href="/hub" className="text-[10px] text-slate-700 hover:text-slate-400 transition-colors">← hub</Link>
                <span className="text-slate-800">/</span>
                <span className="text-[10px] text-red-400">sentinel</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                Blue<span className="text-red-400">Sentinel</span>
              </h1>
              <p className="text-xs text-slate-600 mt-1">24/7 onchain security monitor · Base chain</p>
            </div>

            <div className="flex items-center gap-3">
              {stats?.lastScan && (
                <span className="text-[10px] text-slate-700">last scan {timeAgo(stats.lastScan)}</span>
              )}
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-500">live</span>
              </div>
            </div>
          </div>

          {/* ── BENTO GRID ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-12 gap-3 auto-rows-auto">

            {/* ── [A] CRITICAL counter — spans 3 cols ── */}
            <div className="col-span-6 sm:col-span-3 card-surface rounded-xl p-5 border-l-4 border-l-red-500 flex flex-col justify-between">
              <p className="text-[10px] text-slate-600 tracking-widest uppercase">Critical</p>
              <p className="text-4xl font-bold text-red-400 mt-2">
                {loading ? "—" : <Counter to={stats?.criticalFindings ?? 0} />}
              </p>
              <p className="text-[10px] text-slate-700 mt-1">findings</p>
            </div>

            {/* ── [B] HIGH counter ── */}
            <div className="col-span-6 sm:col-span-3 card-surface rounded-xl p-5 border-l-4 border-l-orange-500 flex flex-col justify-between">
              <p className="text-[10px] text-slate-600 tracking-widest uppercase">High</p>
              <p className="text-4xl font-bold text-orange-400 mt-2">
                {loading ? "—" : <Counter to={stats?.highFindings ?? 0} />}
              </p>
              <p className="text-[10px] text-slate-700 mt-1">findings</p>
            </div>

            {/* ── [C] WATCHES counter ── */}
            <div className="col-span-6 sm:col-span-3 card-surface rounded-xl p-5 flex flex-col justify-between">
              <p className="text-[10px] text-slate-600 tracking-widest uppercase">Watches</p>
              <p className="text-4xl font-bold text-[#4FC3F7] mt-2">
                {loading ? "—" : <Counter to={stats?.activeWatches ?? 0} />}
              </p>
              <p className="text-[10px] text-slate-700 mt-1">active targets</p>
            </div>

            {/* ── [D] SCANS counter ── */}
            <div className="col-span-6 sm:col-span-3 card-surface rounded-xl p-5 flex flex-col justify-between">
              <p className="text-[10px] text-slate-600 tracking-widest uppercase">Scans</p>
              <p className="text-4xl font-bold text-white mt-2">
                {loading ? "—" : <Counter to={stats?.totalScans ?? 0} />}
              </p>
              <p className="text-[10px] text-slate-700 mt-1">total runs</p>
            </div>

            {/* ── [E] LIVE FINDINGS FEED — tall left column ── */}
            <div className="col-span-12 lg:col-span-7 card-surface rounded-xl p-5 flex flex-col" style={{ minHeight: "420px" }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] text-slate-600 tracking-widest uppercase">Live Findings</p>
                  <p className="text-xs text-slate-400 mt-0.5">{findings.length} total · {critical.length} critical</p>
                </div>
                <button onClick={handleScan} disabled={scanning}
                  className="text-[10px] px-3 py-1.5 rounded border border-[#2A2A3E] text-slate-500 hover:text-white hover:border-[#4FC3F7]/30 transition-colors disabled:opacity-50">
                  {scanning ? "scanning…" : "↺ scan now"}
                </button>
              </div>

              {scanResult && (
                <p className="text-[10px] text-emerald-400 mb-3 border border-emerald-500/20 bg-emerald-500/5 rounded px-2 py-1">
                  {scanResult}
                </p>
              )}

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {loading ? (
                  <p className="text-[10px] text-slate-700 animate-pulse pt-4 text-center">loading…</p>
                ) : recent.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-12">
                    <p className="text-3xl mb-3">🛡️</p>
                    <p className="text-xs text-slate-500">No findings yet</p>
                    <p className="text-[10px] text-slate-700 mt-1">Add a target and run a scan</p>
                  </div>
                ) : (
                  recent.map(f => (
                    <div key={f.id}
                      className={`rounded-lg border-l-2 p-3 ${SEV_STYLES[f.severity].border} ${SEV_STYLES[f.severity].glow} border border-[#1A1A2E]`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${SEV_STYLES[f.severity].badge}`}>
                            {SEV_EMOJI[f.severity]} {f.severity}
                          </span>
                          <span className="text-xs text-white">{f.threatName}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-slate-700">{timeAgo(f.detectedAt)}</span>
                          <button onClick={() => dismissFinding(f.id)}
                            className="text-[10px] text-slate-700 hover:text-red-400 transition-colors">✕</button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] text-slate-600 capitalize">{f.targetType}</span>
                        <code className="text-[10px] text-[#4FC3F7]">{trunc(f.target)}</code>
                        {f.alerted && <span className="text-[9px] text-emerald-600 ml-auto">✓ alerted</span>}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">{f.summary}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── [F] RIGHT COLUMN ── */}
            <div className="col-span-12 lg:col-span-5 flex flex-col gap-3">

              {/* [F1] ADD WATCH FORM */}
              <div className="card-surface rounded-xl p-5">
                <p className="text-[10px] text-[#4FC3F7] tracking-widest mb-4">// ADD WATCH TARGET</p>

                {added ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
                    <p className="text-xs text-emerald-400">✓ Target added — Sentinel is watching</p>
                  </div>
                ) : (
                  <form onSubmit={handleAdd} className="space-y-3">
                    <div className="flex gap-1.5">
                      {(["address","token","domain"] as TargetType[]).map(t => (
                        <button key={t} type="button" onClick={() => setType(t)}
                          className={`text-[10px] px-2.5 py-1 rounded border transition-colors capitalize flex-1 ${
                            type === t
                              ? "border-[#4FC3F7]/40 text-[#4FC3F7] bg-[#4FC3F7]/10"
                              : "border-[#1A1A2E] text-slate-600 hover:text-slate-300"
                          }`}>{t}</button>
                      ))}
                    </div>
                    <input
                      className="w-full bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2.5 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors"
                      placeholder={type === "domain" ? "example.com" : "0x… address"}
                      value={target} onChange={e => setTarget(e.target.value)} required
                    />
                    <input
                      className="w-full bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2.5 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors"
                      placeholder="Label (optional)"
                      value={label} onChange={e => setLabel(e.target.value)}
                    />
                    {addErr && <p className="text-[10px] text-red-400">{addErr}</p>}
                    <button type="submit" disabled={adding || !target.trim()}
                      className="w-full py-2.5 bg-[#4FC3F7]/10 hover:bg-[#4FC3F7]/20 border border-[#4FC3F7]/30 text-[#4FC3F7] text-xs rounded-lg transition-colors disabled:opacity-50">
                      {adding ? "Adding…" : "🛡️ Watch this target →"}
                    </button>
                  </form>
                )}
              </div>

              {/* [F2] ACTIVE WATCHES */}
              <div className="card-surface rounded-xl p-5 flex-1">
                <p className="text-[10px] text-slate-600 tracking-widest mb-3">
                  // WATCHED TARGETS · <span className="text-[#4FC3F7]">{watches.length}</span>
                </p>
                {watches.length === 0 ? (
                  <p className="text-[10px] text-slate-700 py-4 text-center">No active watches</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {watches.map(w => (
                      <div key={w.id} className="flex items-center gap-2 bg-[#0D0D1A] rounded-lg px-3 py-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          {w.label && <p className="text-[10px] text-white truncate">{w.label}</p>}
                          <code className="text-[10px] text-[#4FC3F7] block truncate">{trunc(w.target, 22)}</code>
                          <span className="text-[9px] text-slate-700 capitalize">{w.targetType}</span>
                        </div>
                        <button onClick={() => removeWatch(w.id)}
                          className="text-[9px] text-slate-700 hover:text-red-400 transition-colors shrink-0">remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── [G] THREAT CATALOG — full width ── */}
            <div className="col-span-12 card-surface rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] text-slate-600 tracking-widest">// THREAT CATALOG · <span className="text-white">8 categories</span></p>
                <p className="text-[10px] text-slate-700">Base chain · updated 2026-05-24</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {THREATS.map(t => (
                  <div key={t.name}
                    className="bg-[#0D0D1A] rounded-lg p-3 border border-[#1A1A2E] hover:border-[#2A2A3E] transition-colors text-center">
                    <p className="text-xl mb-1.5">{t.icon}</p>
                    <p className="text-[10px] font-bold" style={{ color: t.color }}>{t.name}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── [H] HOW IT WORKS + FOOTER INFO ── */}
            <div className="col-span-12 sm:col-span-4 card-surface rounded-xl p-5">
              <p className="text-[10px] text-slate-600 tracking-widest mb-4">// HOW IT WORKS</p>
              <div className="space-y-4">
                {[
                  { step: "01", color: "#4FC3F7", title: "Watch",  desc: "Add any wallet, token, or domain to the watch list." },
                  { step: "02", color: "#A78BFA", title: "Scan",   desc: "Sentinel checks each target against the threat catalog + Hub tools." },
                  { step: "03", color: "#34D399", title: "Alert",  desc: "Critical findings trigger instant Telegram alerts." },
                ].map(h => (
                  <div key={h.step} className="flex items-start gap-3">
                    <span className="text-lg font-bold shrink-0" style={{ color: h.color + "40" }}>{h.step}</span>
                    <div>
                      <p className="text-xs font-bold mb-0.5" style={{ color: h.color }}>{h.title}</p>
                      <p className="text-[10px] text-slate-600 leading-relaxed">{h.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── [I] SCAN SCHEDULE ── */}
            <div className="col-span-12 sm:col-span-4 card-surface rounded-xl p-5">
              <p className="text-[10px] text-[#4FC3F7] tracking-widest mb-4">// SCAN SCHEDULE</p>
              <div className="space-y-2.5">
                {[
                  ["Cron interval",    "daily 12:00 UTC"],
                  ["Catalog check",   "instant · no API"],
                  ["Hub tools",       "honeypot + risk_gate"],
                  ["AML screen",      "address targets"],
                  ["Phishing scan",   "domain targets"],
                  ["Alert threshold", "severity ≥ high"],
                  ["Channels",        "Telegram + webhook"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-600">{k}</span>
                    <span className="text-[10px] text-slate-300">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── [J] QUICK ACTIONS ── */}
            <div className="col-span-12 sm:col-span-4 card-surface rounded-xl p-5">
              <p className="text-[10px] text-slate-600 tracking-widest mb-4">// QUICK ACTIONS</p>
              <div className="space-y-2">
                <button onClick={handleScan} disabled={scanning}
                  className="w-full text-left px-3 py-2.5 rounded-lg bg-[#0D0D1A] border border-[#1A1A2E] hover:border-[#4FC3F7]/30 transition-colors group disabled:opacity-50">
                  <span className="text-[10px] text-[#4FC3F7] group-hover:text-[#4FC3F7]">
                    {scanning ? "↺ scanning…" : "↺ trigger scan now"}
                  </span>
                </button>
                <a href="/api/sentinel/test-alert"
                  className="w-full block text-left px-3 py-2.5 rounded-lg bg-[#0D0D1A] border border-[#1A1A2E] hover:border-red-500/30 transition-colors">
                  <span className="text-[10px] text-red-400">🚨 send test alert → Telegram</span>
                </a>
                <a href="/api/sentinel/findings"
                  className="w-full block text-left px-3 py-2.5 rounded-lg bg-[#0D0D1A] border border-[#1A1A2E] hover:border-[#2A2A3E] transition-colors">
                  <span className="text-[10px] text-slate-500">↗ findings API (JSON)</span>
                </a>
                <a href="/api/sentinel/watch"
                  className="w-full block text-left px-3 py-2.5 rounded-lg bg-[#0D0D1A] border border-[#1A1A2E] hover:border-[#2A2A3E] transition-colors">
                  <span className="text-[10px] text-slate-500">↗ watches API (JSON)</span>
                </a>
              </div>
            </div>

          </div>{/* end bento grid */}

          {/* ── Footer ────────────────────────────────────────────────────── */}
          <div className="mt-8 border-t border-[#1A1A2E] pt-5 flex items-center justify-between flex-wrap gap-3">
            <p className="text-[10px] text-slate-800">
              Blue<span className="text-red-400/50">Sentinel</span> · {stats?.totalFindings ?? 0} threats detected · Base chain 8453
            </p>
            <div className="flex items-center gap-4">
              <a href="https://x.com/blueagent_" target="_blank" rel="noreferrer"
                className="text-[10px] text-slate-700 hover:text-slate-400 transition-colors">X</a>
              <a href="https://t.me/blueagent_hub" target="_blank" rel="noreferrer"
                className="text-[10px] text-slate-700 hover:text-slate-400 transition-colors">Telegram</a>
              <Link href="/hub" className="text-[10px] text-slate-700 hover:text-slate-400 transition-colors">Hub</Link>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
