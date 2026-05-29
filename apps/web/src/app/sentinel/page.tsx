"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity   = "critical" | "high" | "medium" | "low";
type TargetType = "address" | "token" | "domain";

interface DailySnapshot {
  date:        string;
  total:       number;
  bySeverity:  { critical: number; high: number; medium: number; low: number };
  byCategory:  Record<string, number>;
  targets:     string[];
}

interface TimelineStats {
  totalThreats:  number;
  totalTargets:  number;
  bySeverity:    { critical: number; high: number; medium: number; low: number };
  byCategory:    Record<string, number>;
  dailyPeak:     number;
  activeDays:    number;
  snapshots:     DailySnapshot[];
}

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
  critical: { badge: "text-red-400 border-red-500/40 bg-red-500/10",            left: "border-l-red-500",    label: "🚨 CRITICAL" },
  high:     { badge: "text-orange-400 border-orange-500/40 bg-orange-500/10",   left: "border-l-orange-500", label: "⚠️ HIGH"     },
  medium:   { badge: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",   left: "border-l-yellow-500", label: "🟡 MEDIUM"   },
  low:      { badge: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10", left: "border-l-emerald-500", label: "🟢 LOW"    },
};

const THREAT_CATS = [
  { icon: "🍯", name: "Honeypot",      color: "#f87171", desc: "Token blocks sells after buy"          },
  { icon: "🏃", name: "Rug Pull",      color: "#fb923c", desc: "Unlocked LP, unlimited mint"           },
  { icon: "🎣", name: "Phishing",      color: "#fbbf24", desc: "Fake Coinbase / Uniswap domains"       },
  { icon: "🌀", name: "Mixer / AML",   color: "#a78bfa", desc: "Tornado Cash, sanctions exposure"      },
  { icon: "⚡", name: "Exploit",       color: "#f472b6", desc: "Flash loan, reentrancy patterns"       },
  { icon: "🩸", name: "Drain",         color: "#ef4444", desc: "Approval drainers, NFT sweeps"         },
  { icon: "🎭", name: "Scam Token",    color: "#60a5fa", desc: "Impersonating USDC / ETH"              },
  { icon: "🔓", name: "Bad Approval",  color: "#34d399", desc: "Infinite approval to unverified"       },
  { icon: "🔄", name: "Proxy Upgrade", color: "#c084fc", desc: "Malicious implementation upgrade"      },
  { icon: "🚀", name: "Post-Deploy",   color: "#f59e0b", desc: "Backdoor or high-risk new contract"    },
  { icon: "💧", name: "Liq. Drain",    color: "#38bdf8", desc: "Liquidity rug, price crash, vol abuse" },
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

// ─── Threat Timeline chart ────────────────────────────────────────────────────

function ThreatTimeline({ stats }: { stats: TimelineStats }) {
  const { snapshots, totalThreats, totalTargets, bySeverity, dailyPeak, activeDays } = stats;

  function dayLabel(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
  }

  const peak = dailyPeak || 1;

  return (
    <div className="card-surface rounded-xl p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-1">Threat Timeline · Last 7 Days</p>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-mono text-4xl font-bold text-white">{totalThreats}</span>
            <span className="font-mono text-sm text-slate-500">threats detected</span>
            {totalThreats > 0 && (
              <span className="font-mono text-[10px] text-slate-700">
                across {totalTargets} unique target{totalTargets !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Severity breakdown */}
        <div className="flex gap-3 flex-wrap">
          {([
            { key: "critical", color: "text-red-400",    label: "Critical" },
            { key: "high",     color: "text-orange-400", label: "High"     },
            { key: "medium",   color: "text-yellow-400", label: "Medium"   },
          ] as const).map(({ key, color, label }) =>
            bySeverity[key] > 0 && (
              <div key={key} className="text-center">
                <p className={`font-mono text-xl font-bold ${color}`}>{bySeverity[key]}</p>
                <p className="font-mono text-[9px] text-slate-700 uppercase tracking-widest">{label}</p>
              </div>
            )
          )}
          <div className="text-center">
            <p className="font-mono text-xl font-bold text-slate-400">{activeDays}</p>
            <p className="font-mono text-[9px] text-slate-700 uppercase tracking-widest">Active days</p>
          </div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-1.5 h-24">
        {snapshots.map((s) => {
          const heightPct = s.total === 0 ? 0 : Math.max((s.total / peak) * 100, 4);
          const critPct   = s.total > 0 ? (s.bySeverity.critical / s.total) * 100 : 0;
          const highPct   = s.total > 0 ? (s.bySeverity.high     / s.total) * 100 : 0;
          const restPct   = 100 - critPct - highPct;
          const isToday   = s.date === new Date().toISOString().slice(0, 10);

          return (
            <div key={s.date} className="flex-1 flex flex-col items-center gap-1 group">
              <div className="relative w-full flex justify-center">
                {s.total > 0 && (
                  <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 pointer-events-none">
                    <div className="card-surface border border-[#1A1A2E] rounded-lg px-2 py-1.5 text-center whitespace-nowrap shadow-lg">
                      <p className="font-mono text-[10px] text-white font-bold">{s.total} threat{s.total !== 1 ? "s" : ""}</p>
                      {s.bySeverity.critical > 0 && (
                        <p className="font-mono text-[9px] text-red-400">🚨 {s.bySeverity.critical} critical</p>
                      )}
                      {s.bySeverity.high > 0 && (
                        <p className="font-mono text-[9px] text-orange-400">⚠️ {s.bySeverity.high} high</p>
                      )}
                      <p className="font-mono text-[9px] text-slate-600">{s.targets.length} target{s.targets.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                )}

                <div
                  className={`w-full rounded-t-sm transition-all duration-300 overflow-hidden flex flex-col justify-end ${
                    isToday ? "ring-1 ring-[#4FC3F7]/20" : ""
                  }`}
                  style={{ height: "96px" }}
                >
                  {s.total > 0 ? (
                    <div className="w-full flex flex-col" style={{ height: `${heightPct}%` }}>
                      {critPct > 0 && (
                        <div className="w-full bg-red-500/80" style={{ height: `${critPct}%` }} />
                      )}
                      {highPct > 0 && (
                        <div className="w-full bg-orange-500/70" style={{ height: `${highPct}%` }} />
                      )}
                      {restPct > 0 && (
                        <div className="w-full bg-yellow-500/40" style={{ height: `${restPct}%` }} />
                      )}
                    </div>
                  ) : (
                    <div className="w-full bg-[#0D0D1A]" style={{ height: "4px" }} />
                  )}
                </div>
              </div>

              <p className={`font-mono text-[8px] text-center leading-tight ${isToday ? "text-[#4FC3F7]" : "text-slate-700"}`}>
                {dayLabel(s.date).split(" ")[0]}<br />
                {dayLabel(s.date).split(" ")[1]}
              </p>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#1A1A2E] flex-wrap">
        {[
          { color: "bg-red-500/80",    label: "Critical"      },
          { color: "bg-orange-500/70", label: "High"          },
          { color: "bg-yellow-500/40", label: "Medium / Low"  },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${l.color}`} />
            <span className="font-mono text-[9px] text-slate-700">{l.label}</span>
          </div>
        ))}
        {totalThreats === 0 && (
          <p className="font-mono text-[10px] text-slate-800 ml-auto">No threats in the last 7 days 🛡️</p>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SentinelPage() {
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [findings,  setFindings]  = useState<Finding[]>([]);
  const [watches,   setWatches]   = useState<Watch[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerConfig | null>(null);
  const [health,    setHealth]    = useState<Health | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryInfo | null>(null);
  const [scanLogs,  setScanLogs]  = useState<ScanLog[]>([]);
  const [timeline,  setTimeline]  = useState<TimelineStats | null>(null);
  const [logsOpen,  setLogsOpen]  = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [sevFilter, setSevFilter] = useState<Severity | "all">("all");

  // ── Add Watch form state ───────────────────────────────────────────────────
  const [watchTarget,   setWatchTarget]   = useState("");
  const [watchLabel,    setWatchLabel]    = useState("");
  const [watchTgId,     setWatchTgId]     = useState("");
  const [watchType,     setWatchType]     = useState<TargetType>("address");
  const [watchAdding,   setWatchAdding]   = useState(false);
  const [watchError,    setWatchError]    = useState("");
  const [watchSuccess,  setWatchSuccess]  = useState(false);
  const [formOpen,      setFormOpen]      = useState(false);

  // ── Instant scan bar state ────────────────────────────────────────────────
  const [scanInput,     setScanInput]     = useState("");
  const [scanLoading,   setScanLoading]   = useState(false);
  const [scanResult,    setScanResult]    = useState<null | {
    score: number; grade: string; risk_level: string; type: string;
    indicators: string[]; summary: string; scan_ms: number; cached: boolean;
    categories: Record<string, { severity: string; indicators: string[] }>;
  }>(null);

  const load = useCallback(async () => {
    try {
      const [watchRes, ctrlRes, discRes, logsRes, histRes] = await Promise.all([
        fetch("/api/sentinel/watch"),
        fetch("/api/sentinel/control"),
        fetch("/api/sentinel/discovery"),
        fetch("/api/sentinel/logs"),
        fetch("/api/sentinel/history?days=7"),
      ]);
      const watchData = await watchRes.json() as { stats: Stats; findings: Finding[]; watches: Watch[] };
      const ctrlData  = await ctrlRes.json() as { config: SchedulerConfig; health?: Health };
      const discData  = discRes.ok  ? await discRes.json() as DiscoveryInfo            : null;
      const logsData  = logsRes.ok  ? await logsRes.json() as { logs: ScanLog[] }     : null;
      const histData  = histRes.ok  ? await histRes.json() as { stats: TimelineStats } : null;

      setStats(watchData.stats);
      setFindings(watchData.findings ?? []);
      setWatches((watchData.watches ?? []).filter(w => w.active));
      setScheduler(ctrlData.config ?? null);
      if (ctrlData.health) setHealth(ctrlData.health);
      if (discData)        setDiscovery(discData);
      if (logsData)        setScanLogs(logsData.logs ?? []);
      if (histData?.stats) setTimeline(histData.stats);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const id = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function dismissFinding(id: string) {
    await fetch(`/api/sentinel/findings?id=${id}`, { method: "DELETE" });
    void load();
  }

  async function removeWatch(id: string) {
    await fetch(`/api/sentinel/watch?id=${id}`, { method: "DELETE" });
    void load();
  }

  async function addWatch(e: React.FormEvent) {
    e.preventDefault();
    if (!watchTarget.trim()) return;
    setWatchAdding(true);
    setWatchError("");
    setWatchSuccess(false);
    try {
      const res  = await fetch("/api/sentinel/watch", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          target:         watchTarget.trim(),
          targetType:     watchType,
          label:          watchLabel.trim() || undefined,
          telegramChatId: watchTgId.trim() || undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setWatchError(data.error ?? "Failed to add watch");
      } else {
        setWatchSuccess(true);
        setWatchTarget("");
        setWatchLabel("");
        setWatchTgId("");
        setFormOpen(false);
        void load();
      }
    } catch {
      setWatchError("Network error — try again");
    } finally {
      setWatchAdding(false);
    }
  }

  // Dedupe: collapse same target+category within same day into one finding
  const deduped = findings.reduce<Finding[]>((acc, f) => {
    const key = `${f.target.toLowerCase()}:${f.category}:${f.detectedAt.slice(0, 10)}`;
    if (!acc.find(x => `${x.target.toLowerCase()}:${x.category}:${x.detectedAt.slice(0, 10)}` === key)) {
      acc.push(f);
    }
    return acc;
  }, []);

  const filtered = deduped
    .filter(f => sevFilter === "all" || f.severity === sevFilter)
    .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());

  async function clearAllFindings() {
    await Promise.all(findings.map(f => fetch(`/api/sentinel/findings?id=${f.id}`, { method: "DELETE" })));
    void load();
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const target = scanInput.trim();
    if (!target) return;
    setScanLoading(true);
    setScanResult(null);
    try {
      const isAddress = /^0x[0-9a-fA-F]{40}$/i.test(target);
      const typeParam = isAddress ? "" : "&type=domain";
      const res  = await fetch(`/api/sentinel/score?address=${encodeURIComponent(target)}${typeParam}`);
      const data = await res.json();
      setScanResult(data as typeof scanResult);
    } catch { /* ignore */ }
    finally { setScanLoading(false); }
  }

  // ── Scan result helpers (extracted for readability) ─────────────────────────
  const gradeColor: Record<string, string> = {
    A: "text-emerald-400", B: "text-emerald-400",
    C: "text-yellow-400",  D: "text-orange-400", F: "text-red-400",
  };
  const riskBorder: Record<string, string> = {
    safe: "border-emerald-500/30", low: "border-emerald-500/30",
    medium: "border-yellow-500/30", high: "border-orange-500/30", critical: "border-red-500/30",
  };
  const riskBg: Record<string, string> = {
    safe: "bg-emerald-500/5", low: "bg-emerald-500/5",
    medium: "bg-yellow-500/5", high: "bg-orange-500/5", critical: "bg-red-500/5",
  };

  return (
    <>
      <Navbar />
      <div className="flex bg-[#050508] font-mono pt-16 h-screen overflow-hidden">

        {/* ══ LEFT SIDEBAR (280px) ══════════════════════════════════════════════ */}
        <aside className="hidden lg:flex flex-col w-[280px] shrink-0 h-full border-r border-[#1A1A2E] overflow-y-auto">

          {/* Header */}
          <div className="px-5 pt-6 pb-4 border-b border-[#1A1A2E]">
            <p className="font-mono text-xs text-red-400 tracking-widest">// BLUE SENTINEL</p>
            <p className="font-mono text-[10px] text-slate-700 mt-1">24/7 autonomous threat monitor · Base</p>
          </div>

          {/* Scan engine — read-only status */}
          <div className="px-5 pt-4 pb-4 border-b border-[#1A1A2E] space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">Scan Engine</p>
              <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border ${
                scheduler?.enabled
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : "text-slate-600 border-[#1A1A2E]"
              }`}>
                {scheduler?.enabled ? "● autonomous" : "○ stopped"}
              </span>
            </div>
            <p className="font-mono text-[9px] text-slate-700">
              every {scheduler?.intervalMinutes ?? 15}m · QStash · Base 8453
            </p>
            {stats?.lastScan && (
              <p className="font-mono text-[9px] text-slate-700">last scan {timeAgo(stats.lastScan)}</p>
            )}
            {health && (
              <p className={`font-mono text-[9px] ${
                health.status === "healthy"  ? "text-emerald-600" :
                health.status === "degraded" ? "text-yellow-600"  : "text-red-500"
              }`}>
                {health.status === "healthy" ? "✓" : health.status === "degraded" ? "⚠" : "✗"} {health.status}
              </p>
            )}
          </div>

          {/* Watched targets — scrollable */}
          <div className="flex-1 overflow-y-auto">
            {/* Add Watch header + toggle */}
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">
                Watches · <span className="text-[#4FC3F7]">{watches.length}</span>
              </p>
              <button
                onClick={() => { setFormOpen(v => !v); setWatchError(""); setWatchSuccess(false); }}
                className="font-mono text-[10px] text-slate-600 hover:text-[#4FC3F7] transition-colors border border-[#1A1A2E] hover:border-[#4FC3F7]/30 px-2 py-0.5 rounded"
              >
                {formOpen ? "✕ cancel" : "+ add"}
              </button>
            </div>

            {/* Add Watch form */}
            {formOpen && (
              <form onSubmit={addWatch} className="px-5 pb-4 space-y-2 border-b border-[#1A1A2E]">
                {/* Target type tabs */}
                <div className="flex gap-1">
                  {(["address", "token", "domain"] as TargetType[]).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setWatchType(t)}
                      className={`font-mono text-[9px] px-2 py-1 rounded border transition-colors capitalize ${
                        watchType === t
                          ? "border-[#4FC3F7]/40 text-[#4FC3F7] bg-[#4FC3F7]/10"
                          : "border-[#1A1A2E] text-slate-700 hover:text-slate-400"
                      }`}
                    >{t}</button>
                  ))}
                </div>

                {/* Target input */}
                <input
                  type="text"
                  value={watchTarget}
                  onChange={e => setWatchTarget(e.target.value)}
                  placeholder={watchType === "domain" ? "coinbase-clone.xyz" : "0x…"}
                  className="w-full font-mono text-[10px] bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2 text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40"
                  required
                />

                {/* Label input */}
                <input
                  type="text"
                  value={watchLabel}
                  onChange={e => setWatchLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="w-full font-mono text-[10px] bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2 text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40"
                />

                {/* Telegram ID input */}
                <div>
                  <input
                    type="text"
                    value={watchTgId}
                    onChange={e => setWatchTgId(e.target.value)}
                    placeholder="Telegram ID (for DM alerts)"
                    className="w-full font-mono text-[10px] bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2 text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40"
                  />
                  <p className="font-mono text-[9px] text-slate-700 mt-1">
                    Get your ID: <a href="https://t.me/blueagent_bot" target="_blank" rel="noreferrer" className="text-[#4FC3F7] hover:underline">t.me/blueagent_bot</a> → /start
                  </p>
                </div>

                {/* Error / success */}
                {watchError   && <p className="font-mono text-[9px] text-red-400">{watchError}</p>}
                {watchSuccess && <p className="font-mono text-[9px] text-emerald-400">✓ Watch added</p>}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={watchAdding || !watchTarget.trim()}
                  className="w-full font-mono text-[10px] py-2 rounded-lg border border-[#4FC3F7]/30 text-[#4FC3F7] bg-[#4FC3F7]/5 hover:bg-[#4FC3F7]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {watchAdding ? "Adding…" : "Monitor this →"}
                </button>
              </form>
            )}

            {watches.length === 0 ? (
              <p className="font-mono text-[10px] text-slate-700 px-5 py-3">
                No watches yet —{" "}
                <button onClick={() => setFormOpen(true)} className="text-[#4FC3F7] hover:underline">add one above</button>
              </p>
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

          {/* Scan logs — collapsible */}
          {scanLogs.length > 0 && (
            <div className="px-5 pt-3 pb-3 border-t border-[#1A1A2E]">
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
                        {l.totalScanned} scanned · {l.findings} found · {l.durationMs}ms
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer links */}
          <div className="px-5 py-4 border-t border-[#1A1A2E]">
            <div className="space-y-1.5">
              <a href="https://t.me/blockyagent_bot" target="_blank" rel="noreferrer"
                className="font-mono text-[10px] text-slate-600 hover:text-[#4FC3F7] transition-colors block">
                🤖 @blockyagent_bot → /start
              </a>
              <a href="https://t.me/blueagent_hub" target="_blank" rel="noreferrer"
                className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors block">
                💬 Telegram community →
              </a>
              <Link href="/hub"
                className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors block">
                ← hub
              </Link>
            </div>
          </div>
        </aside>

        {/* ══ CENTER PANEL (flex-1, scrollable) ═══════════════════════════════ */}
        <main className="flex-1 flex flex-col h-full overflow-hidden">

          {/* Scan bar — sticky top */}
          <div className="shrink-0 px-6 py-4 border-b border-[#1A1A2E] bg-[#050508]">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                <span className="font-mono text-[9px] text-red-400 tracking-widest uppercase">Blue Sentinel · Live · Base 8453</span>
              </div>
              <span className="font-mono text-[9px] text-slate-700 ml-auto">auto-refresh 30s</span>
            </div>
            <form onSubmit={handleScan} className="flex gap-2">
              <input
                type="text"
                value={scanInput}
                onChange={e => { setScanInput(e.target.value); setScanResult(null); }}
                placeholder="0x... or domain.xyz — instant risk scan"
                className="flex-1 font-mono text-sm bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-4 py-2.5 text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors"
              />
              <button
                type="submit"
                disabled={scanLoading || !scanInput.trim()}
                className="font-mono text-sm px-4 py-2.5 rounded-lg border border-[#4FC3F7]/30 text-[#4FC3F7] bg-[#4FC3F7]/5 hover:bg-[#4FC3F7]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {scanLoading ? "…" : "Scan →"}
              </button>
            </form>

            {/* Inline scan result */}
            {scanResult && (
              <div className={`mt-2 rounded-lg border px-4 py-3 ${riskBorder[scanResult.risk_level] ?? "border-[#1A1A2E]"} ${riskBg[scanResult.risk_level] ?? ""}`}>
                <div className="flex items-center gap-4 flex-wrap">
                  <span className={`font-mono text-2xl font-bold ${gradeColor[scanResult.grade] ?? "text-white"}`}>{scanResult.grade}</span>
                  <div>
                    <span className="font-mono text-sm text-white font-bold">{scanResult.score}/100 </span>
                    <span className={`font-mono text-[10px] uppercase ${gradeColor[scanResult.grade] ?? ""}`}>{scanResult.risk_level}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(scanResult.categories ?? {}).map(([cat, v]) => {
                      const sev = v.severity;
                      const c = sev === "critical" ? "text-red-400 border-red-500/30 bg-red-500/10"
                        : sev === "high" ? "text-orange-400 border-orange-500/30 bg-orange-500/10"
                        : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10";
                      return <span key={cat} className={`font-mono text-[9px] px-1.5 py-0.5 rounded border uppercase ${c}`}>{cat.replace(/_/g, " ")}</span>;
                    })}
                  </div>
                  <span className="font-mono text-[9px] text-slate-700">{scanResult.scan_ms}ms · {scanResult.cached ? "cached" : "live"}</span>
                  {scanResult.risk_level !== "safe" && scanResult.risk_level !== "low" && (
                    <button
                      onClick={() => { setWatchTarget(scanInput.trim()); setWatchType(/^0x/i.test(scanInput.trim()) ? "address" : "domain"); setFormOpen(true); }}
                      className="font-mono text-[9px] px-2 py-1 rounded border border-[#4FC3F7]/20 text-[#4FC3F7] hover:bg-[#4FC3F7]/5 transition-colors ml-auto"
                    >+ monitor →</button>
                  )}
                </div>
                {scanResult.indicators.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {scanResult.indicators.slice(0, 8).map(i => (
                      <span key={i} className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#0D0D1A] border border-[#1A1A2E] text-slate-600">{i.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Findings feed — scrollable */}
          <div className="flex-1 overflow-y-auto">
            {/* Findings header */}
            <div className="sticky top-0 bg-[#050508] px-6 py-2.5 border-b border-[#1A1A2E] flex items-center gap-3 z-10">
              <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">
                Findings · <span className="text-white">{filtered.length}</span>
                {deduped.length < findings.length && (
                  <span className="text-slate-700 ml-1">({findings.length - deduped.length} dupes hidden)</span>
                )}
              </p>
              {findings.length > 0 && (
                <button onClick={clearAllFindings}
                  className="font-mono text-[9px] text-slate-700 hover:text-red-400 border border-[#1A1A2E] hover:border-red-500/30 px-2 py-0.5 rounded transition-colors">
                  clear all
                </button>
              )}
              <div className="flex gap-1 ml-auto">
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

            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <p className="font-mono text-xs text-slate-700 animate-pulse">loading…</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <p className="text-4xl mb-3">🛡️</p>
                  <p className="font-mono text-sm text-slate-400 mb-1">No findings</p>
                  <p className="font-mono text-[10px] text-slate-700 max-w-xs">Sentinel scans Base every 15m — alerts fire when threats are detected</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {filtered.map(f => <FindingCard key={f.id} f={f} onDismiss={dismissFinding} />)}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* ══ RIGHT PANEL (320px, sticky) ══════════════════════════════════════ */}
        <aside className="hidden xl:flex flex-col w-[320px] shrink-0 h-full border-l border-[#1A1A2E] overflow-y-auto">

          {/* Stat cards */}
          <div className="p-4 border-b border-[#1A1A2E] grid grid-cols-2 gap-2">
            {[
              { label: "Critical",  value: stats?.criticalFindings ?? 0, color: "text-red-400",    border: "border-l-red-500"    },
              { label: "High",      value: stats?.highFindings     ?? 0, color: "text-orange-400", border: "border-l-orange-500" },
              { label: "Scanned",   value: discovery?.count ?? (stats?.totalDiscovered ?? 0), color: "text-[#4FC3F7]", border: "border-l-[#4FC3F7]" },
              { label: "Total Runs",value: stats?.totalScans       ?? 0, color: "text-slate-300",  border: "border-l-[#1A1A2E]"  },
            ].map(s => (
              <div key={s.label} className={`card-surface rounded-lg p-3 border-l-4 ${s.border}`}>
                <p className={`font-mono text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="font-mono text-[9px] text-slate-700 mt-0.5 uppercase tracking-widest">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Timeline */}
          {timeline && (
            <div className="p-4 border-b border-[#1A1A2E]">
              <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-3">Threat Timeline · 7 Days</p>
              <div className="flex items-end gap-1 h-16">
                {timeline.snapshots.map(s => {
                  const peak = timeline.dailyPeak || 1;
                  const h = s.total === 0 ? 0 : Math.max((s.total / peak) * 100, 4);
                  const isToday = s.date === new Date().toISOString().slice(0, 10);
                  return (
                    <div key={s.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                      {s.total > 0 && (
                        <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 whitespace-nowrap">
                          <div className="card-surface border border-[#1A1A2E] rounded px-2 py-1 text-center shadow-lg">
                            <p className="font-mono text-[9px] text-white">{s.total} threats</p>
                          </div>
                        </div>
                      )}
                      <div className="w-full flex flex-col justify-end" style={{ height: "56px" }}>
                        {s.total > 0 ? (
                          <div className="w-full rounded-t-sm overflow-hidden" style={{ height: `${h}%` }}>
                            <div className="w-full h-full bg-red-500/70" />
                          </div>
                        ) : (
                          <div className="w-full bg-[#0D0D1A] rounded-t-sm" style={{ height: "3px" }} />
                        )}
                      </div>
                      <p className={`font-mono text-[8px] ${isToday ? "text-[#4FC3F7]" : "text-slate-800"}`}>
                        {new Date(s.date + "T00:00:00Z").toLocaleDateString("en", { weekday: "short", timeZone: "UTC" }).slice(0, 2)}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-2">
                {(["critical","high","medium"] as const).map(k => timeline.bySeverity[k] > 0 && (
                  <div key={k} className="text-center">
                    <p className={`font-mono text-base font-bold ${k === "critical" ? "text-red-400" : k === "high" ? "text-orange-400" : "text-yellow-400"}`}>{timeline.bySeverity[k]}</p>
                    <p className="font-mono text-[8px] text-slate-700 uppercase">{k.slice(0,4)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Auto-discovery */}
          {discovery && (
            <div className="px-4 py-3 border-b border-[#1A1A2E]">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                <p className="font-mono text-[9px] text-[#4FC3F7] tracking-widest uppercase">Auto Discovery</p>
              </div>
              <p className="font-mono text-[10px] text-slate-400">
                <span className="text-white">{discovery.count}</span> targets ·{" "}
                <span className="text-emerald-400">{discovery.tokens}</span> tokens ·{" "}
                <span className="text-purple-400">{discovery.domains}</span> domains
              </p>
              <p className="font-mono text-[9px] text-slate-700 mt-1">refreshed {timeAgo(discovery.scannedAt)}</p>
            </div>
          )}

          {/* Scan logs */}
          {scanLogs.length > 0 && (
            <div className="px-4 py-3 border-b border-[#1A1A2E]">
              <button onClick={() => setLogsOpen(v => !v)} className="w-full flex items-center justify-between mb-2">
                <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase">Scan Logs · {scanLogs.length}</p>
                <span className="font-mono text-[9px] text-slate-700">{logsOpen ? "▲" : "▼"}</span>
              </button>
              {logsOpen && (
                <div className="space-y-1.5">
                  {scanLogs.slice(0, 8).map(l => (
                    <div key={l.runId} className="border border-[#1A1A2E] rounded-lg px-2 py-1.5">
                      <div className="flex justify-between mb-0.5">
                        <span className="font-mono text-[9px] text-slate-500">{timeAgo(l.startedAt)}</span>
                        <span className={`font-mono text-[9px] ${l.errors > 0 ? "text-red-400" : "text-emerald-400"}`}>
                          {l.errors > 0 ? `✗ ${l.errors}` : "✓"}
                        </span>
                      </div>
                      <p className="font-mono text-[9px] text-slate-600">{l.totalScanned} scanned · {l.findings} found</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* How it works — compact */}
          <div className="px-4 py-3 border-b border-[#1A1A2E] space-y-3">
            <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase">How It Works</p>
            {[
              { n: "01", color: "#4FC3F7", title: "Watch",  desc: "Add any wallet, token, or domain to monitor 24/7" },
              { n: "02", color: "#A78BFA", title: "Scan",   desc: "Checks against 8 threat categories each cycle"    },
              { n: "03", color: "#34D399", title: "Alert",  desc: "Critical threats trigger instant Telegram DM"     },
            ].map(h => (
              <div key={h.n} className="flex items-start gap-3">
                <span className="font-mono text-xs font-bold shrink-0" style={{ color: h.color + "60" }}>{h.n}</span>
                <div>
                  <p className="font-mono text-[10px] font-bold mb-0.5" style={{ color: h.color }}>{h.title}</p>
                  <p className="font-mono text-[9px] text-slate-600 leading-relaxed">{h.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 mt-auto space-y-1.5">
            <a href="https://t.me/blockyagent_bot" target="_blank" rel="noreferrer"
              className="font-mono text-[9px] text-slate-600 hover:text-[#4FC3F7] transition-colors block">
              🤖 @blockyagent_bot → /start
            </a>
            <a href="https://t.me/blueagent_hub" target="_blank" rel="noreferrer"
              className="font-mono text-[9px] text-slate-700 hover:text-white transition-colors block">
              💬 Telegram community →
            </a>
            <Link href="/approvals" className="font-mono text-[9px] text-[#60A5FA] hover:text-white transition-colors block">
              🔐 Approval Tracker →
            </Link>
            <Link href="/hub" className="font-mono text-[9px] text-slate-700 hover:text-white transition-colors block">
              ← hub
            </Link>
            <p className="font-mono text-[9px] text-slate-800 pt-1">
              {stats?.totalFindings ?? 0} threats · Base 8453
            </p>
          </div>
        </aside>

      </div>
    </>
  );
}
