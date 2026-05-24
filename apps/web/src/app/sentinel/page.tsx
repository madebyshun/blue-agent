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
  indicators: string[];
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
  totalDiscovered?: number;
  lastScan:         string | null;
  activeWatches:    number;
  criticalFindings: number;
  highFindings:     number;
}

interface DiscoveryInfo {
  count:     number;
  tokens:    number;
  domains:   number;
  scannedAt: string;
}

interface ScanLog {
  runId:        string;
  startedAt:    string;
  finishedAt:   string;
  durationMs:   number;
  userWatches:  number;
  autoTargets:  number;
  totalScanned: number;
  findings:     number;
  alerted:      number;
  errors:       number;
  log:          string[];
}

interface SchedulerConfig {
  enabled:         boolean;
  intervalMinutes: number;
  mode:            "qstash" | "vercel-cron" | "manual";
  startedAt?:      string;
  scheduleId?:     string;
}

interface Health {
  status: "healthy" | "degraded" | "down";
  reason: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEV: Record<Severity, { badge: string; left: string; label: string }> = {
  critical: { badge: "text-red-400 border-red-500/40 bg-red-500/10",           left: "border-l-red-500",    label: "🚨 CRITICAL" },
  high:     { badge: "text-orange-400 border-orange-500/40 bg-orange-500/10",   left: "border-l-orange-500", label: "⚠️ HIGH"     },
  medium:   { badge: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",   left: "border-l-yellow-500", label: "🟡 MEDIUM"   },
  low:      { badge: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10", left: "border-l-emerald-500", label: "🟢 LOW"    },
};

const THREAT_CATS = [
  { icon: "🍯", name: "Honeypot",       color: "#f87171", desc: "Token blocks sells after buy"         },
  { icon: "🏃", name: "Rug Pull",       color: "#fb923c", desc: "Unlocked LP, unlimited mint"          },
  { icon: "🎣", name: "Phishing",       color: "#fbbf24", desc: "Fake Coinbase / Uniswap domains"      },
  { icon: "🌀", name: "Mixer / AML",    color: "#a78bfa", desc: "Tornado Cash, sanctions exposure"     },
  { icon: "⚡", name: "Exploit",        color: "#f472b6", desc: "Flash loan, reentrancy patterns"      },
  { icon: "🩸", name: "Drain",          color: "#ef4444", desc: "Approval drainers, NFT sweeps"        },
  { icon: "🎭", name: "Scam Token",     color: "#60a5fa", desc: "Impersonating USDC / ETH"             },
  { icon: "🔓", name: "Bad Approval",   color: "#34d399", desc: "Infinite approval to unverified"      },
  { icon: "🔄", name: "Proxy Upgrade",  color: "#c084fc", desc: "Malicious implementation upgrade"     },
  { icon: "🚀", name: "Post-Deploy",    color: "#f59e0b", desc: "Backdoor or high-risk new contract"    },
  { icon: "💧", name: "Liq. Drain",     color: "#38bdf8", desc: "Liquidity rug, price crash, vol abuse"  },
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
      {f.indicators?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {f.indicators.slice(0, 4).map(ind => (
            <span key={ind} className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#0D0D1A] border border-[#1A1A2E] text-slate-500">
              {ind}
            </span>
          ))}
          {f.indicators.length > 4 && (
            <span className="font-mono text-[9px] text-slate-700">+{f.indicators.length - 4}</span>
          )}
        </div>
      )}
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
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ target: target.trim(), targetType: type, label: label.trim() || undefined }),
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
                    ? "border-[#4FC3F7]/40 text-[#4FC3F7] bg-[#4FC3F7]/10"
                    : "border-[#1A1A2E] text-slate-600 hover:text-slate-300"
                }`}>{t}</button>
            ))}
          </div>
          <input
            className="w-full px-3 py-2 rounded-lg font-mono text-xs bg-[#050508] border border-[#1A1A2E] text-white placeholder:text-slate-700 outline-none focus:border-[#4FC3F7]/40 transition-colors"
            placeholder={type === "domain" ? "example.com or https://…" : "0x… address"}
            value={target} onChange={e => setTarget(e.target.value)} required
          />
          <input
            className="w-full px-3 py-2 rounded-lg font-mono text-xs bg-[#050508] border border-[#1A1A2E] text-white placeholder:text-slate-700 outline-none focus:border-[#4FC3F7]/40 transition-colors"
            placeholder="Label (optional) — e.g. My wallet, USDC contract"
            value={label} onChange={e => setLabel(e.target.value)}
          />
          {err && <p className="font-mono text-[10px] text-red-400">{err}</p>}
          <button type="submit" disabled={loading || !target.trim()}
            className="w-full py-2.5 bg-[#4FC3F7]/10 hover:bg-[#4FC3F7]/15 border border-[#4FC3F7]/30 text-[#4FC3F7] font-mono text-xs rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {loading ? "Adding…" : "🛡️ Watch this target →"}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SentinelPage() {
  const [stats,       setStats]       = useState<Stats | null>(null);
  const [findings,    setFindings]    = useState<Finding[]>([]);
  const [watches,     setWatches]     = useState<Watch[]>([]);
  const [scheduler,   setScheduler]   = useState<SchedulerConfig | null>(null);
  const [health,      setHealth]      = useState<Health | null>(null);
  const [discovery,   setDiscovery]   = useState<DiscoveryInfo | null>(null);
  const [scanLogs,    setScanLogs]    = useState<ScanLog[]>([]);
  const [logsOpen,    setLogsOpen]    = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [scanning,    setScanning]    = useState(false);
  const [scanResult,  setScanResult]  = useState<string | null>(null);
  const [sevFilter,   setSevFilter]   = useState<Severity | "all">("all");
  const [ctrlLoading, setCtrlLoading] = useState(false);
  const [interval,    setInterval_]   = useState(15);

  const load = useCallback(async () => {
    try {
      const [watchRes, ctrlRes, discRes, logsRes] = await Promise.all([
        fetch("/api/sentinel/watch"),
        fetch("/api/sentinel/control"),
        fetch("/api/sentinel/discovery"),
        fetch("/api/sentinel/logs"),
      ]);
      const watchData = await watchRes.json() as { stats: Stats; findings: Finding[]; watches: Watch[] };
      const ctrlData  = await ctrlRes.json() as { config: SchedulerConfig; health?: Health };
      const discData  = discRes.ok ? await discRes.json() as DiscoveryInfo : null;
      const logsData  = logsRes.ok ? await logsRes.json() as { logs: ScanLog[] } : null;
      setStats(watchData.stats);
      setFindings(watchData.findings ?? []);
      setWatches((watchData.watches ?? []).filter(w => w.active));
      setScheduler(ctrlData.config ?? null);
      if (ctrlData.health) setHealth(ctrlData.health);
      if (discData) setDiscovery(discData);
      if (logsData) setScanLogs(logsData.logs ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(id);
  }, [load]);

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

  async function handleControl(action: "start" | "stop") {
    setCtrlLoading(true);
    try {
      const res  = await fetch("/api/sentinel/control", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action, intervalMinutes: interval, startedBy: "web" }),
      });
      const data = await res.json() as { config: SchedulerConfig };
      setScheduler(data.config);
    } catch { /* ignore */ }
    finally { setCtrlLoading(false); }
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

        {/* ── Sidebar ──────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-[#1A1A2E]">

          {/* Header */}
          <div className="px-5 pt-6 pb-4 border-b border-[#1A1A2E]">
            <div className="flex items-center justify-between mb-1">
              <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// BLUE SENTINEL</p>
              {health && (
                <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border ${
                  health.status === "healthy"  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" :
                  health.status === "degraded" ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" :
                                                 "text-red-400 border-red-500/30 bg-red-500/10"
                }`}>
                  {health.status === "healthy" ? "● healthy" : health.status === "degraded" ? "◐ degraded" : "○ down"}
                </span>
              )}
            </div>
            <p className="font-mono text-[10px] text-slate-700">24/7 onchain security monitor · Base</p>
            {health && health.status !== "healthy" && (
              <p className="font-mono text-[9px] text-yellow-600 mt-1">{health.reason}</p>
            )}
          </div>

          {/* Stats */}
          <div className="px-4 pt-4 pb-3 border-b border-[#1A1A2E]">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-3">Threat Summary</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Critical", value: stats?.criticalFindings ?? 0, color: "#ef4444" },
                { label: "High",     value: stats?.highFindings     ?? 0, color: "#f97316" },
                { label: "Findings", value: stats?.totalFindings    ?? 0, color: "#e2e8f0" },
                { label: "Scans",    value: stats?.totalScans       ?? 0, color: "#64748b" },
              ].map(s => (
                <div key={s.label} className="card-surface rounded-lg p-2.5">
                  <p className="font-mono text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="font-mono text-[9px] text-slate-700 mt-0.5 uppercase tracking-widest">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Scheduler */}
          <div className="px-4 pt-4 pb-3 border-b border-[#1A1A2E]">
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">Auto Scan</p>
              <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border ${
                scheduler?.enabled
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : "text-slate-600 border-[#1A1A2E]"
              }`}>
                {scheduler?.enabled ? "● RUNNING" : "○ STOPPED"}
              </span>
            </div>

            {/* Interval selector */}
            <div className="flex gap-1 mb-2">
              {[5, 15, 30, 60].map(v => (
                <button key={v} onClick={() => setInterval_(v)}
                  className={`font-mono text-[9px] flex-1 py-1 rounded border transition-colors ${
                    interval === v
                      ? "border-[#4FC3F7]/40 text-[#4FC3F7] bg-[#4FC3F7]/10"
                      : "border-[#1A1A2E] text-slate-700 hover:text-slate-400"
                  }`}>{v}m</button>
              ))}
            </div>

            <div className="flex gap-1.5">
              <button onClick={() => handleControl("start")} disabled={ctrlLoading}
                className="flex-1 font-mono text-[10px] py-1.5 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/5 transition-colors disabled:opacity-40">
                ▶ Start
              </button>
              <button onClick={() => handleControl("stop")} disabled={ctrlLoading}
                className="flex-1 font-mono text-[10px] py-1.5 rounded border border-[#1A1A2E] text-slate-600 hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-40">
                ■ Stop
              </button>
            </div>

            {scheduler?.mode === "qstash" && scheduler.enabled && (
              <p className="font-mono text-[9px] text-[#4FC3F7] mt-1.5">via QStash · every {scheduler.intervalMinutes}m</p>
            )}
            {scheduler?.mode === "manual" && scheduler.enabled && (
              <p className="font-mono text-[9px] text-slate-700 mt-1.5">manual mode · set QSTASH_TOKEN</p>
            )}
          </div>

          {/* Manual scan */}
          <div className="px-4 pt-3 pb-3 border-b border-[#1A1A2E]">
            <button onClick={handleScan} disabled={scanning}
              className={`w-full font-mono text-xs px-3 py-2 rounded-lg border transition-all ${
                scanning
                  ? "border-[#4FC3F7]/20 text-[#4FC3F7]/50 cursor-not-allowed"
                  : "border-[#4FC3F7]/30 text-[#4FC3F7] hover:bg-[#4FC3F7]/5"
              }`}>
              {scanning ? "↺ scanning…" : "↺ scan now"}
            </button>
            {scanResult && (
              <p className="font-mono text-[10px] text-emerald-400 mt-1.5">{scanResult}</p>
            )}
            {stats?.lastScan && (
              <p className="font-mono text-[10px] text-slate-700 mt-1">last {timeAgo(stats.lastScan)}</p>
            )}
          </div>

          {/* Watched targets — scrollable */}
          <div className="flex-1 overflow-y-auto">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase px-5 pt-4 pb-2">
              Watches · <span className="text-[#4FC3F7]">{watches.length}</span>
            </p>
            {watches.length === 0 ? (
              <p className="font-mono text-[10px] text-slate-800 px-5 py-2">No active watches</p>
            ) : (
              watches.map(w => (
                <div key={w.id}
                  className="w-full text-left px-5 py-2.5 transition-all border-l-2 border-transparent hover:bg-[#0D0D1A] flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1 shrink-0" />
                  <div className="flex-1 min-w-0">
                    {w.label && (
                      <p className="font-mono text-xs text-white truncate">{w.label}</p>
                    )}
                    <code className="font-mono text-[10px] text-[#4FC3F7] block truncate">{trunc(w.target, 22)}</code>
                    <span className="font-mono text-[9px] text-slate-700 capitalize">{w.targetType}</span>
                  </div>
                  <button onClick={() => removeWatch(w.id)}
                    className="font-mono text-[9px] text-slate-800 hover:text-red-400 transition-colors mt-0.5">✕</button>
                </div>
              ))
            )}
          </div>

          {/* Scan logs summary */}
          {scanLogs.length > 0 && (
            <div className="px-4 pt-3 pb-3 border-t border-[#1A1A2E]">
              <button onClick={() => setLogsOpen(v => !v)}
                className="w-full flex items-center justify-between group">
                <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">
                  Scan Logs · <span className="text-[#4FC3F7]">{scanLogs.length}</span>
                </p>
                <span className="font-mono text-[9px] text-slate-700 group-hover:text-slate-400 transition-colors">
                  {logsOpen ? "▲" : "▼"}
                </span>
              </button>
              {logsOpen && (
                <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                  {scanLogs.slice(0, 10).map(l => (
                    <div key={l.runId} className="border border-[#1A1A2E] rounded-lg px-2.5 py-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-mono text-[9px] text-slate-500">{timeAgo(l.startedAt)}</span>
                        <span className={`font-mono text-[9px] ${l.errors > 0 ? "text-red-400" : "text-emerald-400"}`}>
                          {l.errors > 0 ? `✗ ${l.errors} err` : "✓ ok"}
                        </span>
                      </div>
                      <p className="font-mono text-[9px] text-slate-600">
                        {l.totalScanned} scanned · {l.findings} found · {l.alerted} alerted · {l.durationMs}ms
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-4 border-t border-[#1A1A2E]">
            <div className="space-y-1.5">
              <a href="/api/sentinel/test-alert"
                className="font-mono text-[10px] text-slate-700 hover:text-red-400 transition-colors block">
                🚨 test alert →
              </a>
              <a href="/api/sentinel/logs"
                className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors block">
                scan logs API →
              </a>
              <Link href="/hub"
                className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors block">
                ← hub
              </Link>
            </div>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────── */}
        <main className="flex-1 h-[calc(100vh-4rem)] overflow-y-auto">

          {/* Hero header */}
          <div className="px-8 py-10 border-b border-[#1A1A2E]">
            <div className="inline-flex items-center gap-2 border border-red-500/20 bg-red-500/5 rounded-full px-4 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="font-mono text-[10px] text-red-400 tracking-widest">LIVE · BASE CHAIN 8453</span>
            </div>
            <h1 className="font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight mb-3">
              Blue<span className="text-red-400">Sentinel</span>
            </h1>
            <p className="font-mono text-sm text-slate-400 max-w-lg leading-relaxed">
              Watch wallets, tokens, and domains. Get instant Telegram alerts when threats are detected on Base.
            </p>
          </div>

          {/* Content */}
          <div className="px-6 lg:px-10 py-8 max-w-5xl w-full space-y-8">

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Critical",    value: stats?.criticalFindings ?? 0, color: "text-red-400",    border: "border-l-red-500"    },
                { label: "High",        value: stats?.highFindings     ?? 0, color: "text-orange-400", border: "border-l-orange-500" },
                { label: "Auto-scanned", value: discovery?.count ?? (stats?.totalDiscovered ?? 0), color: "text-[#4FC3F7]", border: "border-l-[#4FC3F7]" },
                { label: "Total Scans", value: stats?.totalScans       ?? 0, color: "text-slate-300",  border: "border-l-[#1A1A2E]"  },
              ].map(s => (
                <div key={s.label} className={`card-surface rounded-xl p-4 border-l-4 ${s.border}`}>
                  <p className={`font-mono text-3xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="font-mono text-[10px] text-slate-600 mt-1 uppercase tracking-widest">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Auto-discovery status bar */}
            {discovery && (
              <div className="card-surface rounded-xl px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                  <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest uppercase">Auto Discovery</p>
                </div>
                <p className="font-mono text-[10px] text-slate-400">
                  <span className="text-white">{discovery.count}</span> targets last cycle
                  · <span className="text-emerald-400">{discovery.tokens}</span> tokens
                  · <span className="text-purple-400">{discovery.domains}</span> domains
                </p>
                <p className="font-mono text-[10px] text-slate-700 ml-auto">
                  DexScreener · URLhaus · Patterns · refreshed {timeAgo(discovery.scannedAt)}
                </p>
              </div>
            )}

            {/* Findings feed — full width */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">Live Findings</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] text-slate-700">auto-refresh 30s</span>
                  <div className="flex gap-1">
                    {(["all","critical","high","medium","low"] as const).map(s => (
                      <button key={s} onClick={() => setSevFilter(s)}
                        className={`font-mono text-[9px] px-2 py-1 rounded border transition-colors capitalize ${
                          sevFilter === s
                            ? "border-[#4FC3F7]/40 text-[#4FC3F7] bg-[#4FC3F7]/10"
                            : "border-[#1A1A2E] text-slate-700 hover:text-slate-400"
                        }`}>{s}</button>
                    ))}
                  </div>
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
                    Sentinel is scanning Base automatically — alerts fire when threats are found
                  </p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {filtered.map(f => (
                    <FindingCard key={f.id} f={f} onDismiss={dismissFinding} />
                  ))}
                </div>
              )}
            </div>

            {/* Mobile watches */}
            <div className="card-surface rounded-xl p-5 lg:hidden">
              <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-3">
                Watches · {watches.length}
              </p>
              {watches.length === 0 ? (
                <p className="font-mono text-[10px] text-slate-700">No user watches — auto-discovery is active</p>
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
                        className="font-mono text-[9px] text-slate-700 hover:text-red-400 transition-colors">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Threat catalog */}
            <div>
              <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-3">Threat Catalog · 9 Categories</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {THREAT_CATS.map(t => (
                  <div key={t.name} className="card-surface card-hover rounded-xl p-3 text-center">
                    <p className="text-2xl mb-2">{t.icon}</p>
                    <p className="font-mono text-[10px] font-bold mb-1" style={{ color: t.color }}>{t.name}</p>
                    <p className="font-mono text-[9px] text-slate-700 leading-tight hidden sm:block">{t.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* How it works */}
            <div>
              <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-3">How It Works</p>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { step: "01", color: "#4FC3F7", title: "Watch",  desc: "Add any wallet, token contract, or domain. Sentinel registers it for continuous monitoring on Base." },
                  { step: "02", color: "#A78BFA", title: "Scan",   desc: "Each cycle checks targets against threat catalog + Hub security tools: honeypot, AML, phishing." },
                  { step: "03", color: "#34D399", title: "Alert",  desc: "Critical and high-severity findings trigger instant Telegram alerts — before damage is done." },
                ].map(h => (
                  <div key={h.step} className="card-surface rounded-xl p-5">
                    <p className="font-mono text-4xl font-bold mb-3" style={{ color: h.color + "30" }}>{h.step}</p>
                    <p className="font-mono text-sm font-bold mb-2" style={{ color: h.color }}>{h.title}</p>
                    <p className="font-mono text-xs text-slate-500 leading-relaxed">{h.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-[#1A1A2E] pt-5 flex items-center justify-between flex-wrap gap-3">
              <p className="font-mono text-[10px] text-slate-800">
                Blue<span className="text-red-400/40">Sentinel</span> · {stats?.totalFindings ?? 0} threats detected · Base 8453
              </p>
              <div className="flex items-center gap-4">
                <a href="https://x.com/blueagent_" target="_blank" rel="noreferrer"
                  className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors">@blueagent_</a>
                <a href="https://t.me/blueagent_hub" target="_blank" rel="noreferrer"
                  className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors">Telegram</a>
                <Link href="/hub" className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors">Hub →</Link>
              </div>
            </div>
          </div>

        </main>
      </div>
    </>
  );
}
