"use client";
import { useState } from "react";
import Navbar from "@/components/Navbar";

export default function ScorePage() {
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
      // Calls the Blue Agent x402 builder-score API
      const clean = handle.replace(/^@/, "");
      const res = await fetch(`https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/builder-score?handle=${encodeURIComponent(clean)}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch score");
    } finally {
      setLoading(false);
    }
  }

  const TIER_EMOJI: Record<string, string> = {
    Explorer: "🌱", Builder: "🔨", Maker: "⚡", Legend: "🔥", Founder: "👑",
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#050508] font-mono pt-24 px-6">
        <div className="max-w-2xl mx-auto">

          {/* Header */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-2">
              <p className="font-mono text-xs text-[#4FC3F7]">// builder score</p>
              <span className="font-mono text-[10px] text-[#4FC3F7] border border-[#4FC3F7]/30 px-1.5 py-0.5 rounded">coming soon</span>
            </div>
            <h1 className="font-mono text-3xl font-bold text-white mb-3">Builder Score</h1>
            <p className="font-mono text-sm text-slate-500">
              Proof of build on Base. Score any builder from their X handle.
            </p>
          </div>

          {/* Input form */}
          <form onSubmit={handleSubmit} className="mb-8">
            <div className="flex gap-3">
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@handle or handle"
                className="flex-1 font-mono text-sm bg-[#0D0D14] border border-[#1A1A2E] rounded px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors"
              />
              <button
                type="submit"
                disabled={loading || !handle.trim()}
                className="font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-5 py-3 rounded hover:bg-[#29ABE2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "..." : "Get Score"}
              </button>
            </div>
          </form>

          {/* Error */}
          {error && (
            <div className="card-surface rounded-lg p-4 mb-6 border-red-500/20">
              <p className="font-mono text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Result card */}
          {result && (
            <div className="card-surface rounded-lg p-6">
              {/* terminal header */}
              <div className="flex items-center gap-2 mb-5 pb-4 border-b border-[#1A1A2E]">
                <div className="glow-dot" />
                <span className="font-mono text-xs text-slate-400">@{result.handle ?? handle.replace(/^@/, "")}</span>
              </div>

              {/* Score + tier */}
              <div className="flex items-baseline gap-4 mb-6">
                <span className="font-mono text-5xl font-bold text-white">{result.score ?? "--"}</span>
                <div>
                  <div className="font-mono text-sm text-[#4FC3F7]">
                    {TIER_EMOJI[result.tier] ?? ""} {result.tier ?? "Unknown"}
                  </div>
                  <div className="font-mono text-xs text-slate-600">out of 100</div>
                </div>
              </div>

              {/* Dimensions */}
              {result.dimensions && (
                <div className="space-y-2 mb-6">
                  {[
                    { label: "Activity",   val: result.dimensions.activity,   max: 25 },
                    { label: "Social",     val: result.dimensions.social,     max: 25 },
                    { label: "Uniqueness", val: result.dimensions.uniqueness, max: 20 },
                    { label: "Thesis",     val: result.dimensions.thesis,     max: 20 },
                    { label: "Community",  val: result.dimensions.community,  max: 10 },
                  ].map(({ label, val, max }) => {
                    const pct = Math.round((val / max) * 100);
                    return (
                      <div key={label} className="flex items-center gap-3">
                        <span className="font-mono text-xs text-slate-500 w-20">{label}</span>
                        <div className="flex-1 h-1 bg-[#1A1A2E] rounded-full">
                          <div
                            className="h-1 bg-[#4FC3F7] rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-slate-500 w-10 text-right">{val}/{max}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Summary */}
              {result.summary && (
                <p className="font-mono text-xs text-slate-500 border-t border-[#1A1A2E] pt-4">
                  {result.summary}
                </p>
              )}
            </div>
          )}

          {/* Coming soon note */}
          <p className="font-mono text-xs text-slate-700 mt-8 text-center">
            Full Builder Score with verified onchain data — coming soon.
          </p>
        </div>
      </main>
    </>
  );
}
