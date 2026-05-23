"use client";

/**
 * Blue Sentinel — Dashboard
 * /hub/sentinel
 *
 * 24/7 onchain security monitor for Base.
 * - Watch targets (wallet / token / domain)
 * - Live findings feed with severity badges
 * - Threat catalog overview
 * - Scan stats
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity   = "critical" | "high" | "medium" | "low";
type TargetType = "address" | "token" | "domain";

interface Finding {
  id:          string;
  threatId:    string;
  threatName:  string;
  category:    string;
  severity:    Severity;
  target:      string;
  targetType:  TargetType;
  summary:     string;
  chain:       string;
  detectedAt:  string;
  alerted:     boolean;
}

interface WatchSubscription {
  id:            string;
  target:        string;
  targetType:    TargetType;
  label?:        string;
  alertChannels: string[];
  createdAt:     string;
  active:        boolean;
}

interface SentinelStats {
  totalScans:      number;
  totalFindings:   number;
  lastScan:        string | null;
  activeWatches:   number;
  criticalFindings: number;
  highFindings:    number;
}

interface CatalogInfo {
  total:       number;
  categories:  string[];
  lastUpdated: string;
}

interface WatchResponse {
  ok:       boolean;
  watches:  WatchSubscription[];
  findings: Finding[];
  stats:    SentinelStats;
  catalog:  CatalogInfo;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<Severity, string> = {
  critical: "text-red-400 border-red-500/40 bg-red-500/10",
  high:     "text-orange-400 border-orange-500/40 bg-orange-500/10",
  medium:   "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
  low:      "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
};

const SEV_DOT: Record<Severity, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-500",
  medium:   "bg-yellow-500",
  low:      "bg-emerald-500",
};

const SEV_EMOJI: Record<Severity, string> = {
  critical: "🚨",
  high:     "⚠️",
  medium:   "🟡",
  low:      "🟢",
};

const TARGET_PLACEHOLDER: Record<TargetType, string> = {
  address: "0x… (wallet or contract)",
  token:   "0x… (token contract)",
  domain:  "example.com or https://…",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)       return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000)    return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)   return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function truncate(s: string, n = 14): string {
  if (s.length <= n) return s;
  return s.slice(0, 6) + "…" + s.slice(-4);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent = false,
}: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`card-surface rounded-xl p-4 flex flex-col gap-1 ${accent ? "border border-red-500/20" : ""}`}>
      <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">{label}</p>
      <p className={`font-mono text-2xl font-bold ${accent ? "text-red-400" : "text-white"}`}>{value}</p>
      {sub && <p className="font-mono text-[10px] text-slate-700">{sub}</p>}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${SEV_COLOR[severity]}`}>
      {SEV_EMOJI[severity]} {severity}
    </span>
  );
}

function FindingCard({
  finding,
  onDismiss,
}: {
  finding: Finding;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className={`card-surface rounded-xl p-4 border-l-2 ${
      finding.severity === "critical" ? "border-red-500" :
      finding.severity === "high"     ? "border-orange-500" :
      finding.severity === "medium"   ? "border-yellow-500" : "border-emerald-500"
    }`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <SeverityBadge severity={finding.severity} />
          <span className="font-mono text-xs text-white">{finding.threatName}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] text-slate-600">{timeAgo(finding.detectedAt)}</span>
          <button
            onClick={() => onDismiss(finding.id)}
            className="font-mono text-[10px] text-slate-700 hover:text-slate-400 transition-colors"
            title="Dismiss"
          >✕</button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[10px] text-slate-600">{finding.targetType}</span>
        <code className="font-mono text-[10px] text-[#4FC3F7] bg-[#4FC3F7]/5 px-1 rounded">
          {truncate(finding.target, 20)}
        </code>
        <span className="font-mono text-[10px] text-slate-700 ml-auto">{finding.category}</span>
      </div>

      <p className="font-mono text-[10px] text-slate-500 leading-relaxed line-clamp-3">
        {finding.summary}
      </p>

      {finding.alerted && (
        <p className="font-mono text-[9px] text-emerald-600 mt-2">✓ alert sent</p>
      )}
    </div>
  );
}

function WatchCard({
  watch,
  onRemove,
}: {
  watch: WatchSubscription;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="card-surface rounded-xl p-3 flex items-center gap-3">
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${watch.active ? "bg-emerald-400" : "bg-slate-700"}`} />
      <div className="flex-1 min-w-0">
        {watch.label && (
          <p className="font-mono text-xs text-white mb-0.5 truncate">{watch.label}</p>
        )}
        <code className="font-mono text-[10px] text-[#4FC3F7] truncate block">
          {watch.target.length > 24 ? truncate(watch.target, 24) : watch.target}
        </code>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[9px] text-slate-700 capitalize">{watch.targetType}</span>
          <span className="font-mono text-[9px] text-slate-700">·</span>
          <span className="font-mono text-[9px] text-slate-700">{watch.alertChannels.join(", ")}</span>
        </div>
      </div>
      <button
        onClick={() => onRemove(watch.id)}
        className="font-mono text-[10px] text-slate-700 hover:text-red-400 transition-colors shrink-0"
        title="Remove watch"
      >remove</button>
    </div>
  );
}

// ─── Add Watch Form ───────────────────────────────────────────────────────────

function AddWatchForm({ onAdded }: { onAdded: () => void }) {
  const [target,     setTarget]     = useState("");
  const [targetType, setTargetType] = useState<TargetType>("address");
  const [label,      setLabel]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sentinel/watch", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ target: target.trim(), targetType, label: label.trim() || undefined }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Failed to add watch");
      setTarget("");
      setLabel("");
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-surface rounded-xl p-5 space-y-4">
      <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// ADD WATCH TARGET</p>

      {/* Target type */}
      <div className="flex gap-2">
        {(["address", "token", "domain"] as TargetType[]).map(t => (
          <button key={t} type="button" onClick={() => setTargetType(t)}
            className={`font-mono text-[10px] px-3 py-1.5 rounded transition-colors capitalize ${
              targetType === t
                ? "bg-[#4FC3F7]/15 text-[#4FC3F7] border border-[#4FC3F7]/30"
                : "text-slate-600 border border-[#1A1A2E] hover:text-slate-300"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Target input */}
      <input
        className="w-full bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2.5 font-mono text-xs text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors"
        placeholder={TARGET_PLACEHOLDER[targetType]}
        value={target}
        onChange={e => setTarget(e.target.value)}
        required
      />

      {/* Label */}
      <input
        className="w-full bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2.5 font-mono text-xs text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors"
        placeholder="Label (optional) — e.g. My wallet, USDC contract"
        value={label}
        onChange={e => setLabel(e.target.value)}
      />

      {error && <p className="font-mono text-[10px] text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading || !target.trim()}
        className="w-full py-2.5 bg-[#4FC3F7]/10 hover:bg-[#4FC3F7]/20 border border-[#4FC3F7]/30 text-[#4FC3F7] font-mono text-xs rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Adding…" : "Add to watch list →"}
      </button>
    </form>
  );
}

// ─── Threat Catalog Table ─────────────────────────────────────────────────────

function CatalogInfo({ catalog }: { catalog: CatalogInfo }) {
  return (
    <div className="card-surface rounded-xl p-5">
      <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-4">// THREAT CATALOG</p>
      <div className="flex items-center gap-6 mb-4">
        <div>
          <p className="font-mono text-2xl font-bold text-white">{catalog.total}</p>
          <p className="font-mono text-[10px] text-slate-700">threat types</p>
        </div>
        <div>
          <p className="font-mono text-sm text-white">{catalog.categories.length}</p>
          <p className="font-mono text-[10px] text-slate-700">categories</p>
        </div>
        <div className="ml-auto">
          <p className="font-mono text-[10px] text-slate-700">updated {catalog.lastUpdated}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {catalog.categories.map(c => (
          <span key={c} className="font-mono text-[9px] px-2 py-1 rounded border border-[#1A1A2E] text-slate-600 capitalize">
            {c.replace(/_/g, " ")}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SentinelPage() {
  const [data,    setData]    = useState<WatchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<"findings" | "watches" | "catalog">("findings");
  const [sevFilter, setSevFilter] = useState<Severity | "all">("all");

  const loadData = useCallback(async () => {
    try {
      const res  = await fetch("/api/sentinel/watch");
      const json = await res.json() as WatchResponse;
      setData(json);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    // Poll every 60s while page is open
    const interval = setInterval(() => void loadData(), 60_000);
    return () => clearInterval(interval);
  }, [loadData]);

  async function dismissFinding(id: string) {
    await fetch(`/api/sentinel/findings?id=${id}`, { method: "DELETE" });
    void loadData();
  }

  async function removeWatch(watchId: string) {
    await fetch(`/api/sentinel/watch?id=${watchId}`, { method: "DELETE" });
    void loadData();
  }

  const stats    = data?.stats;
  const findings = (data?.findings ?? []).filter(f =>
    sevFilter === "all" || f.severity === sevFilter
  );
  const watches = (data?.watches ?? []).filter(w => w.active);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#050508] font-mono pt-16">
        <div className="max-w-6xl mx-auto px-4 py-8">

          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Link href="/hub" className="font-mono text-[10px] text-slate-700 hover:text-slate-400 transition-colors">
                  ← hub
                </Link>
                <span className="text-slate-800">/</span>
                <span className="font-mono text-[10px] text-[#4FC3F7]">sentinel</span>
              </div>
              <h1 className="font-mono text-2xl font-bold text-white">Blue Sentinel</h1>
              <p className="font-mono text-xs text-slate-600 mt-1">24/7 onchain security monitor for Base</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-[10px] text-emerald-500">
                  {stats?.lastScan ? `last scan ${timeAgo(stats.lastScan)}` : "waiting for first scan"}
                </span>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <StatCard
              label="Active Watches"
              value={stats?.activeWatches ?? 0}
              sub="targets monitored"
            />
            <StatCard
              label="Critical Findings"
              value={stats?.criticalFindings ?? 0}
              sub="require action"
              accent={(stats?.criticalFindings ?? 0) > 0}
            />
            <StatCard
              label="High Findings"
              value={stats?.highFindings ?? 0}
              sub="last 7 days"
            />
            <StatCard
              label="Total Scans"
              value={stats?.totalScans ?? 0}
              sub="all time"
            />
          </div>

          {/* Main grid */}
          <div className="grid lg:grid-cols-3 gap-6">

            {/* Left — Watch form + catalog */}
            <div className="space-y-4">
              <AddWatchForm onAdded={loadData} />
              {data?.catalog && <CatalogInfo catalog={data.catalog} />}
            </div>

            {/* Right — Findings / Watches / Catalog tabs */}
            <div className="lg:col-span-2">

              {/* Tabs */}
              <div className="flex gap-1 mb-4 border-b border-[#1A1A2E] pb-2">
                {(["findings", "watches", "catalog"] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`font-mono text-xs px-4 py-1.5 rounded-t transition-colors capitalize ${
                      tab === t
                        ? "text-[#4FC3F7] bg-[#4FC3F7]/10"
                        : "text-slate-600 hover:text-slate-300"
                    }`}>
                    {t}
                    {t === "findings" && (data?.findings?.length ?? 0) > 0 && (
                      <span className="ml-1.5 font-mono text-[9px] px-1 rounded bg-orange-500/20 text-orange-400">
                        {data?.findings?.length}
                      </span>
                    )}
                    {t === "watches" && watches.length > 0 && (
                      <span className="ml-1.5 font-mono text-[9px] px-1 rounded bg-[#4FC3F7]/20 text-[#4FC3F7]">
                        {watches.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {loading && (
                <div className="card-surface rounded-xl p-8 text-center">
                  <p className="font-mono text-xs text-slate-700 animate-pulse">loading sentinel data…</p>
                </div>
              )}

              {/* Findings tab */}
              {!loading && tab === "findings" && (
                <div className="space-y-3">
                  {/* Severity filter */}
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {(["all", "critical", "high", "medium", "low"] as const).map(s => (
                      <button key={s} onClick={() => setSevFilter(s)}
                        className={`font-mono text-[10px] px-2.5 py-1 rounded border transition-colors capitalize ${
                          sevFilter === s
                            ? "border-[#4FC3F7]/50 text-[#4FC3F7] bg-[#4FC3F7]/10"
                            : "border-[#1A1A2E] text-slate-600 hover:text-slate-300"
                        }`}>
                        {s === "all" ? "all" : `${SEV_EMOJI[s]} ${s}`}
                      </button>
                    ))}
                  </div>

                  {findings.length === 0 ? (
                    <div className="card-surface rounded-xl p-8 text-center">
                      <p className="font-mono text-3xl mb-3">🛡️</p>
                      <p className="font-mono text-sm text-slate-400 mb-1">No findings</p>
                      <p className="font-mono text-[10px] text-slate-700">
                        {watches.length === 0
                          ? "Add targets to start monitoring"
                          : "All watched targets look clean"}
                      </p>
                    </div>
                  ) : (
                    findings.map(f => (
                      <FindingCard key={f.id} finding={f} onDismiss={dismissFinding} />
                    ))
                  )}
                </div>
              )}

              {/* Watches tab */}
              {!loading && tab === "watches" && (
                <div className="space-y-2">
                  {watches.length === 0 ? (
                    <div className="card-surface rounded-xl p-8 text-center">
                      <p className="font-mono text-3xl mb-3">👁️</p>
                      <p className="font-mono text-sm text-slate-400 mb-1">No active watches</p>
                      <p className="font-mono text-[10px] text-slate-700">
                        Add a wallet, token, or domain to start monitoring
                      </p>
                    </div>
                  ) : (
                    watches.map(w => (
                      <WatchCard key={w.id} watch={w} onRemove={removeWatch} />
                    ))
                  )}
                </div>
              )}

              {/* Catalog tab */}
              {!loading && tab === "catalog" && (
                <div className="space-y-2">
                  <p className="font-mono text-[10px] text-slate-700 mb-3">
                    {data?.catalog?.total ?? 0} threat types across {data?.catalog?.categories?.length ?? 0} categories
                  </p>
                  {(["critical", "high", "medium"] as Severity[]).map(sev => {
                    const catGroups = data?.catalog?.categories ?? [];
                    // Group indicators inline — just show severity headers
                    return (
                      <div key={sev} className="card-surface rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`w-2 h-2 rounded-full ${SEV_DOT[sev]}`} />
                          <span className="font-mono text-xs text-white capitalize">{sev} threats</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {catGroups.map((c, i) => (
                            <span key={i} className="font-mono text-[9px] px-2 py-0.5 rounded border border-[#1A1A2E] text-slate-600 capitalize">
                              {c.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Scan schedule note */}
                  <div className="card-surface rounded-xl p-4 mt-4">
                    <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-2">// SCAN SCHEDULE</p>
                    <div className="space-y-1.5">
                      {[
                        ["Honeypot check",    "every watch scan"],
                        ["Risk gate",         "every watch scan"],
                        ["AML screening",     "address targets"],
                        ["Phishing scan",     "domain targets"],
                        ["Scan interval",     "every 15 minutes"],
                        ["Alert channels",    "Telegram + webhook"],
                      ].map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between">
                          <span className="font-mono text-[10px] text-slate-600">{k}</span>
                          <span className="font-mono text-[10px] text-slate-400">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Footer */}
          <div className="mt-12 border-t border-[#1A1A2E] pt-6 flex items-center justify-between">
            <p className="font-mono text-[10px] text-slate-800">
              Blue Sentinel · {data?.stats?.totalScans ?? 0} total scans · Base (chain 8453)
            </p>
            <p className="font-mono text-[10px] text-slate-800">
              powered by @blueagent_ × @aeonframework × @miroshark_
            </p>
          </div>

        </div>
      </div>
    </>
  );
}
