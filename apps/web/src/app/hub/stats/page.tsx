"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { AGENT_TOOLS } from "@/lib/agent-tools";

// ─── Types ────────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  name: string;
  category: string;
  price: string;
  runs: number;
  revenueEst: number;
};

type Stats = {
  totals: {
    tools: number;
    totalRuns: number;
    totalRevenueEst: number;
    usdcBalance: number | null;
    wallet: string;
  };
  rows: Row[];
};

// ─── Design tokens ────────────────────────────────────────────────────────────

const CAT_META: Record<string, { label: string; color: string; bg: string }> = {
  intelligence:    { label: "Intelligence",    color: "#4FC3F7", bg: "rgba(79,195,247,0.12)"  },
  builder:         { label: "Builder",         color: "#A78BFA", bg: "rgba(167,139,250,0.12)" },
  trading:         { label: "Trading",         color: "#34D399", bg: "rgba(52,211,153,0.12)"  },
  security:        { label: "Security",        color: "#F87171", bg: "rgba(248,113,113,0.12)" },
  "agent-economy": { label: "Agent Economy",   color: "#FACC15", bg: "rgba(250,204,21,0.12)"  },
  "base-ecosystem":{ label: "Base Ecosystem",  color: "#60A5FA", bg: "rgba(96,165,250,0.12)"  },
  "on-chain":      { label: "On-chain",        color: "#FB923C", bg: "rgba(251,146,60,0.12)"  },
  content:         { label: "Content",         color: "#E879F9", bg: "rgba(232,121,249,0.12)" },
  investor:        { label: "Investor",        color: "#FACC15", bg: "rgba(250,204,21,0.12)"  },
};

function catMeta(cat: string) {
  return CAT_META[cat] ?? { label: cat, color: "#6B6B7E", bg: "rgba(107,107,126,0.1)" };
}

// Agent pill metadata
const AGENT_META: Record<string, { label: string; color: string }> = {
  "Blue + Aeon":      { label: "Blue + Aeon",      color: "#4FC3F7" },
  "Blue":             { label: "Blue",              color: "#4FC3F7" },
  "Blue + MiroShark": { label: "Blue + MiroShark",  color: "#34D399" },
};

// Build a lookup: tool id → agentName
const AGENT_MAP = Object.fromEntries(
  AGENT_TOOLS.map(t => [t.id, t.agentName])
);

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-xl border bg-[#0A0A12] p-5 flex flex-col gap-1 relative overflow-hidden"
      style={{ borderColor: accent ? `${accent}30` : "#1A1A2E" }}
    >
      {accent && (
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{ background: `radial-gradient(circle at 0% 100%, ${accent}, transparent 70%)` }}
        />
      )}
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate-600">{label}</p>
      <p
        className="font-mono text-2xl font-bold"
        style={{ color: accent ?? "#fff" }}
      >
        {value}
      </p>
      {sub && <p className="font-mono text-[10px] text-slate-700">{sub}</p>}
    </div>
  );
}

function CategoryBar({
  cat,
  runs,
  revenue,
  maxRuns,
}: {
  cat: string;
  runs: number;
  revenue: number;
  maxRuns: number;
}) {
  const m = catMeta(cat);
  const pct = maxRuns > 0 ? (runs / maxRuns) * 100 : 0;
  return (
    <div className="flex items-center gap-3 group">
      <div className="w-28 shrink-0">
        <span
          className="font-mono text-[10px] px-1.5 py-0.5 rounded"
          style={{ color: m.color, background: m.bg }}
        >
          {m.label}
        </span>
      </div>
      <div className="flex-1 h-1.5 bg-[#1A1A2E] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: m.color, opacity: 0.7 }}
        />
      </div>
      <span className="font-mono text-[11px] text-slate-400 tabular-nums w-14 text-right">
        {runs.toLocaleString()} runs
      </span>
      <span className="font-mono text-[10px] text-slate-600 tabular-nums w-14 text-right">
        ${revenue.toFixed(2)}
      </span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const [data, setData] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ts, setTs] = useState<string>("");

  useEffect(() => {
    fetch("/api/stats")
      .then(async r => {
        if (!r.ok) { setErr("Failed to load stats."); return; }
        setData(await r.json());
        setTs(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      })
      .catch(() => setErr("Failed to load stats."));
  }, []);

  // Derived: category aggregates
  const catStats = useMemo(() => {
    if (!data) return [];
    const map: Record<string, { runs: number; revenue: number; count: number }> = {};
    for (const r of data.rows) {
      const k = r.category || "other";
      if (!map[k]) map[k] = { runs: 0, revenue: 0, count: 0 };
      map[k].runs += r.runs;
      map[k].revenue += r.revenueEst;
      map[k].count += 1;
    }
    return Object.entries(map)
      .map(([cat, v]) => ({ cat, ...v }))
      .sort((a, b) => b.runs - a.runs || b.revenue - a.revenue);
  }, [data]);

  // Derived: agent aggregates
  const agentStats = useMemo(() => {
    if (!data) return [];
    const map: Record<string, { runs: number; count: number }> = {};
    for (const r of data.rows) {
      const agent = AGENT_MAP[r.id] ?? "Blue";
      if (!map[agent]) map[agent] = { runs: 0, count: 0 };
      map[agent].runs += r.runs;
      map[agent].count += 1;
    }
    return Object.entries(map)
      .map(([agent, v]) => ({ agent, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const maxRuns  = data ? Math.max(1, ...data.rows.map(r => r.runs)) : 1;
  const maxCatRuns = catStats.length ? Math.max(1, ...catStats.map(c => c.runs)) : 1;

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#050508] font-mono pt-16 text-slate-200">
        {/* Grid pattern overlay */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(79,195,247,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(79,195,247,0.02) 1px,transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative max-w-5xl mx-auto px-6 py-8">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6 text-xs">
            <Link href="/hub" className="text-slate-500 hover:text-[#4FC3F7] transition-colors">Hub</Link>
            <span className="text-slate-700">/</span>
            <span className="text-slate-400">Analytics</span>
          </div>

          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#34D399] shadow-[0_0_8px_#34D399] animate-pulse" />
                  <span className="font-mono text-[10px] text-[#34D399] uppercase tracking-widest">Live</span>
                </span>
                <span className="font-mono text-[10px] text-slate-700 px-2 py-0.5 rounded border border-[#1A1A2E]">
                  Base Mainnet · eip155:8453
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Blue Hub Analytics</h1>
              <p className="font-mono text-[11px] text-slate-600 mt-1">
                Tool usage · revenue estimates · registry status · agent distribution
              </p>
            </div>
            {ts && (
              <div className="text-right shrink-0">
                <p className="font-mono text-[10px] text-slate-700">Updated</p>
                <p className="font-mono text-[11px] text-slate-500">{ts}</p>
              </div>
            )}
          </div>

          {/* Error */}
          {err && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 font-mono text-xs text-red-400 mb-6">
              {err}
            </div>
          )}

          {/* Loading skeleton */}
          {!err && !data && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-[#0A0A12] border border-[#1A1A2E]" />
              ))}
            </div>
          )}

          {data && (
            <>
              {/* ── KPI row ─────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <KpiCard
                  label="Tools live"
                  value={String(data.totals.tools)}
                  sub="on Blue Hub"
                  accent="#4FC3F7"
                />
                <KpiCard
                  label="Total runs"
                  value={data.totals.totalRuns.toLocaleString()}
                  sub="all time"
                />
                <KpiCard
                  label="Est. revenue"
                  value={`$${data.totals.totalRevenueEst.toFixed(2)}`}
                  sub="gross, before fees"
                  accent="#34D399"
                />
                <KpiCard
                  label="Wallet balance"
                  value={
                    data.totals.usdcBalance === null
                      ? "—"
                      : `$${data.totals.usdcBalance.toFixed(2)}`
                  }
                  sub="USDC on Base"
                  accent="#A78BFA"
                />
              </div>

              {/* ── Mid section: Category breakdown + Registry ───────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">

                {/* Category breakdown */}
                <div className="lg:col-span-3 rounded-xl border border-[#1A1A2E] bg-[#0A0A12] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                      Category Breakdown
                    </p>
                    <span className="font-mono text-[10px] text-slate-700">by runs</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {catStats.map(c => (
                      <CategoryBar
                        key={c.cat}
                        cat={c.cat}
                        runs={c.runs}
                        revenue={c.revenue}
                        maxRuns={maxCatRuns}
                      />
                    ))}
                  </div>
                </div>

                {/* Right column */}
                <div className="lg:col-span-2 flex flex-col gap-4">

                  {/* Agent distribution */}
                  <div className="rounded-xl border border-[#1A1A2E] bg-[#0A0A12] p-5 flex-1">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-4">
                      Agent Distribution
                    </p>
                    <div className="flex flex-col gap-3">
                      {agentStats.map(a => {
                        const m = AGENT_META[a.agent] ?? { label: a.agent, color: "#4FC3F7" };
                        return (
                          <div key={a.agent} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: m.color, boxShadow: `0 0 6px ${m.color}` }}
                              />
                              <span className="font-mono text-[11px] text-slate-300">{m.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] text-slate-600">
                                {a.runs.toLocaleString()} runs
                              </span>
                              <span
                                className="font-mono text-[11px] font-bold tabular-nums"
                                style={{ color: m.color }}
                              >
                                {a.count}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Registry status */}
                  <div className="rounded-xl border border-[#1A1A2E] bg-[#0A0A12] p-5">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-4">
                      Registry Status
                    </p>
                    <div className="flex flex-col gap-2.5">
                      {[
                        { label: "ERC-8257 ToolRegistry",  note: "13 tools · Base",       ok: true,  href: "https://basescan.org/address/0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1" },
                        { label: "agentic.market",          note: "1 service endpoint",    ok: true,  href: "https://agentic.market/services/blueagent-dev" },
                        { label: "CDP Bazaar",              note: "merchant indexed",      ok: true,  href: "https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f" },
                        { label: "OpenAPI spec",            note: "/.well-known/openapi.json", ok: true, href: "https://blueagent.dev/.well-known/openapi.json" },
                        { label: "ai-plugin.json",          note: "ChatGPT-compatible",    ok: true,  href: "https://blueagent.dev/.well-known/ai-plugin.json" },
                      ].map(r => (
                        <a
                          key={r.label}
                          href={r.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between group hover:opacity-80 transition-opacity"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] ${r.ok ? "text-[#34D399]" : "text-slate-600"}`}>
                              {r.ok ? "✓" : "○"}
                            </span>
                            <span className="font-mono text-[11px] text-slate-300 group-hover:text-[#4FC3F7] transition-colors">
                              {r.label}
                            </span>
                          </div>
                          <span className="font-mono text-[9px] text-slate-700">{r.note}</span>
                        </a>
                      ))}
                    </div>
                  </div>

                </div>
              </div>

              {/* ── Tool Leaderboard ──────────────────────────────────────── */}
              <div className="rounded-xl border border-[#1A1A2E] bg-[#0A0A12] overflow-hidden">
                {/* Table header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[#1A1A2E]">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Tool Leaderboard
                  </p>
                  <span className="font-mono text-[10px] text-slate-700">
                    {data.rows.length} tools · sorted by runs
                  </span>
                </div>

                {/* Column headers */}
                <div className="grid items-center px-5 py-2 border-b border-[#1A1A2E]/60 font-mono text-[9px] uppercase tracking-wider text-slate-700"
                  style={{ gridTemplateColumns: "2rem 1fr 6.5rem 5.5rem 5rem 4rem 4.5rem" }}
                >
                  <span>#</span>
                  <span>Tool</span>
                  <span>Category</span>
                  <span>Agent</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Runs</span>
                  <span className="text-right">Est. rev</span>
                </div>

                {/* Rows */}
                {data.rows.map((r, i) => {
                  const cat    = catMeta(r.category);
                  const agent  = AGENT_MAP[r.id] ?? "Blue";
                  const agentM = AGENT_META[agent] ?? { label: agent, color: "#4FC3F7" };
                  const barPct = maxRuns > 0 ? (r.runs / maxRuns) * 100 : 0;

                  return (
                    <div
                      key={r.id}
                      className="grid items-center px-5 py-2.5 border-b border-[#1A1A2E]/40 hover:bg-[#4FC3F7]/[0.025] transition-colors"
                      style={{ gridTemplateColumns: "2rem 1fr 6.5rem 5.5rem 5rem 4rem 4.5rem" }}
                    >
                      {/* Rank */}
                      <span className="font-mono text-[10px] text-slate-700 tabular-nums">{i + 1}</span>

                      {/* Tool name + bar */}
                      <div className="min-w-0 pr-3">
                        <Link
                          href={`/hub/${r.id}`}
                          className="font-mono text-xs text-slate-200 hover:text-[#4FC3F7] transition-colors truncate block"
                        >
                          {r.name}
                        </Link>
                        <div className="h-0.5 mt-1.5 bg-[#1A1A2E] rounded-full overflow-hidden max-w-[180px]">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${barPct}%`, background: "#4FC3F7", opacity: 0.5 }}
                          />
                        </div>
                      </div>

                      {/* Category badge */}
                      <div>
                        <span
                          className="font-mono text-[9px] px-1.5 py-0.5 rounded truncate inline-block max-w-full"
                          style={{ color: cat.color, background: cat.bg }}
                        >
                          {cat.label}
                        </span>
                      </div>

                      {/* Agent */}
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: agentM.color }}
                        />
                        <span className="font-mono text-[9px] text-slate-500 truncate">{agentM.label}</span>
                      </div>

                      {/* Price */}
                      <span className="font-mono text-[11px] text-slate-500 text-right tabular-nums">
                        {r.price || "—"}
                      </span>

                      {/* Runs */}
                      <span className="font-mono text-xs text-white text-right tabular-nums">
                        {r.runs.toLocaleString()}
                      </span>

                      {/* Revenue */}
                      <span className="font-mono text-xs text-[#34D399] text-right tabular-nums">
                        ${r.revenueEst.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Footer note */}
              <p className="font-mono text-[9px] text-slate-800 mt-4 text-center">
                wallet {data.totals.wallet} · est. revenue = runs × price (gross, before x402 fees) · balance via Base RPC
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
