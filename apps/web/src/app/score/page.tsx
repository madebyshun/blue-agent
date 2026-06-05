"use client";
import { useState } from "react";
import Navbar from "@/components/Navbar";

export default function ScorePage({ inShell = false }: { inShell?: boolean }) {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!handle.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const clean = handle.replace(/^@/, "");
      const res = await fetch(`https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/builder-score?handle=${encodeURIComponent(clean)}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch score");
    } finally {
      setLoading(false);
    }
  }

  const TIER_CONFIG: Record<string, { emoji: string; color: string }> = {
    Explorer: { emoji: "🌱", color: "#34D399" },
    Builder:  { emoji: "🔨", color: "#4FC3F7" },
    Maker:    { emoji: "⚡", color: "#A78BFA" },
    Legend:   { emoji: "🔥", color: "#F59E0B" },
    Founder:  { emoji: "👑", color: "#F59E0B" },
  };

  return (
    <>
      {!inShell && <Navbar />}
      <div className={`flex bg-[#050508] font-mono ${inShell ? "h-full overflow-hidden" : "pt-14"}`}>

        {/* ── Sidebar ── */}
        <aside className={`hidden lg:flex flex-col w-72 shrink-0 border-r border-[#1A1A2E] ${inShell ? "h-full" : "sticky top-14 h-[calc(100vh-3.5rem)]"}`}>
          <div className="px-5 pt-6 pb-4 border-b border-[#1A1A2E]">
            <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">// BUILDER SCORE</p>
            <p className="font-mono text-[10px] text-slate-700 mt-1">Proof of build on Base</p>
          </div>

          {/* Tiers */}
          <div className="px-5 pt-5 pb-4 border-b border-[#1A1A2E]">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">TIERS</p>
            <div className="space-y-2">
              {[
                { tier: "Explorer", range: "0–25",  emoji: "🌱", color: "#34D399" },
                { tier: "Builder",  range: "26–50", emoji: "🔨", color: "#4FC3F7" },
                { tier: "Maker",    range: "51–70", emoji: "⚡", color: "#A78BFA" },
                { tier: "Legend",   range: "71–90", emoji: "🔥", color: "#F59E0B" },
                { tier: "Founder",  range: "91–100",emoji: "👑", color: "#F59E0B" },
              ].map(t => (
                <div key={t.tier} className="flex items-center justify-between px-2 py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{t.emoji}</span>
                    <span className="font-mono text-xs" style={{ color: t.color }}>{t.tier}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-700">{t.range}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dimensions */}
          <div className="px-5 pt-4 pb-4 border-b border-[#1A1A2E]">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">DIMENSIONS</p>
            <div className="space-y-1.5">
              {[
                { label: "Activity",   max: 25, note: "onchain tx frequency" },
                { label: "Social",     max: 25, note: "X engagement + reach" },
                { label: "Uniqueness", max: 20, note: "original contributions" },
                { label: "Thesis",     max: 20, note: "builder credibility" },
                { label: "Community",  max: 10, note: "ecosystem involvement" },
              ].map(d => (
                <div key={d.label} className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-slate-500">{d.label}</span>
                  <span className="font-mono text-[10px] text-slate-700">/{d.max}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto px-5 py-4 border-t border-[#1A1A2E]">
            <p className="font-mono text-[10px] text-slate-700">x402 · Base · Bankr LLM</p>
            <p className="font-mono text-[10px] text-slate-800 mt-0.5">Full onchain score — coming soon</p>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 h-full overflow-y-auto">

          {/* Compact header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#1A1A2E]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
            <h1 className="font-mono text-sm font-bold text-white">Builder Score</h1>
            <span className="font-mono text-[10px] text-slate-600">Score any Base builder from their X handle</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 border border-[#4FC3F7]/30 text-[#4FC3F7] rounded ml-auto">coming soon</span>
          </div>

          <div className="px-6 py-6 max-w-2xl">

            {/* Search form */}
            <form onSubmit={handleSubmit} className="mb-6">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="@handle or handle"
                  className="flex-1 font-mono text-sm bg-[#0D0D14] border border-[#1A1A2E] rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors"
                />
                <button
                  type="submit"
                  disabled={loading || !handle.trim()}
                  className="font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-5 py-3 rounded-lg hover:bg-[#29ABE2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "…" : "Get Score →"}
                </button>
              </div>
            </form>

            {/* Error */}
            {error && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 mb-6">
                <p className="font-mono text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="bg-[#0D0D1A] border border-[#1A1A2E] rounded-xl p-8 text-center">
                <p className="font-mono text-xs text-slate-700 animate-pulse">scanning builder profile…</p>
              </div>
            )}

            {/* Result */}
            {result && !loading && (
              <div className="space-y-4">
                {/* Score card */}
                <div className="bg-[#0D0D1A] border border-[#1A1A2E] rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-5 pb-4 border-b border-[#1A1A2E]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                    <span className="font-mono text-xs text-slate-400">@{result.handle ?? handle.replace(/^@/, "")}</span>
                  </div>

                  <div className="flex items-baseline gap-5 mb-6">
                    <span className="font-mono text-6xl font-black text-white">{result.score ?? "--"}</span>
                    <div>
                      <div className="font-mono text-base font-bold" style={{ color: TIER_CONFIG[result.tier]?.color ?? "#4FC3F7" }}>
                        {TIER_CONFIG[result.tier]?.emoji ?? ""} {result.tier ?? "Unknown"}
                      </div>
                      <div className="font-mono text-[10px] text-slate-600">out of 100</div>
                    </div>
                  </div>

                  {/* Score bar */}
                  <div className="h-1.5 bg-[#1A1A2E] rounded-full mb-5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${result.score ?? 0}%`,
                        background: (result.score ?? 0) >= 70 ? "#34D399" : (result.score ?? 0) >= 40 ? "#4FC3F7" : "#A78BFA",
                      }}
                    />
                  </div>

                  {/* Dimensions */}
                  {result.dimensions && (
                    <div className="space-y-2">
                      {[
                        { label: "Activity",   val: result.dimensions.activity,   max: 25 },
                        { label: "Social",     val: result.dimensions.social,     max: 25 },
                        { label: "Uniqueness", val: result.dimensions.uniqueness, max: 20 },
                        { label: "Thesis",     val: result.dimensions.thesis,     max: 20 },
                        { label: "Community",  val: result.dimensions.community,  max: 10 },
                      ].map(({ label, val, max }) => (
                        <div key={label} className="flex items-center gap-3">
                          <span className="font-mono text-[10px] text-slate-500 w-20 shrink-0">{label}</span>
                          <div className="flex-1 h-1 bg-[#1A1A2E] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#4FC3F7] rounded-full"
                              style={{ width: `${Math.round((val / max) * 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-slate-500 w-10 text-right shrink-0">{val}/{max}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Summary */}
                {result.summary && (
                  <div className="bg-[#0D0D1A] border border-[#1A1A2E] rounded-xl p-4">
                    <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-2">// SUMMARY</p>
                    <p className="font-mono text-xs text-slate-400 leading-relaxed">{result.summary}</p>
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!result && !loading && !error && (
              <div className="bg-[#0D0D1A] border border-[#1A1A2E] rounded-xl p-10 text-center">
                <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-2">// ENTER A HANDLE</p>
                <p className="font-mono text-xs text-slate-700">Type any X/Twitter handle to get their Base builder score</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
