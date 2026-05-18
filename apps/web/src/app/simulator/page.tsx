"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tier = 1 | 2 | 3;

type SimResult = {
  tier: number;
  project: string;
  ticker: string | null;
  timestamp: string;
  blue_agent: {
    verdict: string;
    score: number;
    summary: string;
    strengths: string[];
    risks: string[];
  };
  aeon: {
    status: string;
    ecosystem_health: string;
    timing_score: number;
    narrative_fit: string;
    signals: string[];
  };
  miroshark: {
    status: string;
    bull: number;
    bear: number;
    neutral: number;
    recommendation: string;
    sentiment_summary: string;
  };
  market_data?: Record<string, unknown>;
  final_verdict: string;
  confidence: number;
  action_items: string[];
  risk_matrix?: {
    market_timing: number;
    community_readiness: number;
    ecosystem_fit: number;
    technical_readiness: number;
    narrative_strength: number;
  };
  timeline_recommendation?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TIERS: { tier: Tier; label: string; price: string; features: string[] }[] = [
  {
    tier: 1,
    label: "Quick Signal",
    price: "$0.10",
    features: [
      "Blue Agent LLM analysis",
      "Simulated Aeon ecosystem health",
      "Simulated MiroShark consensus",
      "Final verdict + action items",
    ],
  },
  {
    tier: 2,
    label: "Deep Signal",
    price: "$0.35",
    features: [
      "Everything in Quick Signal",
      "Live market data (DexScreener)",
      "Price, volume, liquidity check",
      "Enhanced confidence scoring",
    ],
  },
  {
    tier: 3,
    label: "Full Simulation",
    price: "$0.50",
    features: [
      "Everything in Deep Signal",
      "5-axis risk matrix",
      "Timeline recommendation",
      "Claude Sonnet analysis (fastest model)",
    ],
  },
];

const INPUT_CLS =
  "w-full px-4 py-2.5 rounded-xl font-mono text-sm bg-[#050508] border border-[#1A1A2E] text-white placeholder:text-slate-600 outline-none focus:border-[#4FC3F7]/40 transition-colors";

const verdictColor = (v: string) => {
  if (v === "LAUNCH" || v === "execute") return "#34d399";
  if (v === "WAIT"   || v === "alert_human") return "#fbbf24";
  return "#f87171";
};

function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xs text-slate-500 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[#1A1A2E]">
        <div
          className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span className="font-mono text-xs font-bold w-8 text-right" style={{ color }}>
        {value}%
      </span>
    </div>
  );
}

function RiskBar({ label, value }: { label: string; value: number }) {
  const color = value >= 7 ? "#34d399" : value >= 4 ? "#fbbf24" : "#f87171";
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xs text-slate-500 w-40 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[#1A1A2E]">
        <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${value * 10}%`, background: color }} />
      </div>
      <span className="font-mono text-xs font-bold w-6 text-right" style={{ color }}>{value}</span>
      <span className="font-mono text-xs text-slate-700">/10</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SimulatorPage() {
  const [tier, setTier]           = useState<Tier>(1);
  const [project, setProject]     = useState("");
  const [description, setDesc]    = useState("");
  const [ticker, setTicker]       = useState("");
  const [contract, setContract]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<SimResult | null>(null);
  const [error, setError]         = useState<string | null>(null);

  async function runSimulation(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/tool/launch-simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolParams: { project, description, ticker, contract, tier },
        }),
      });
      const data = await res.json() as { result?: SimResult; error?: string };
      if (data.result) setResult(data.result);
      else setError(data.error ?? "Simulation failed.");
    } catch {
      setError("Could not reach Blue Agent service.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-4 py-1.5 mb-6">
            <span className="font-mono text-xs text-[#4FC3F7] tracking-widest">LAUNCH SIMULATOR</span>
          </div>
          <h1 className="font-mono font-bold text-4xl sm:text-5xl text-white mb-4">
            Pre-launch <span className="text-gradient-blue">Intelligence</span>
          </h1>
          <p className="font-mono text-base text-slate-400 max-w-2xl">
            3-agent simulation — Blue Agent orchestrates Aeon ecosystem signals and MiroShark community consensus before you launch on Base.
          </p>
          <div className="flex gap-3 mt-4 flex-wrap">
            {["Blue Agent", "Aeon", "MiroShark"].map((a) => (
              <span key={a} className="font-mono text-xs px-3 py-1 rounded-full border border-[#4FC3F7]/20 text-slate-400">
                {a}
              </span>
            ))}
          </div>
        </div>

        {/* Tier selector */}
        <div className="grid md:grid-cols-3 gap-4 mb-10">
          {TIERS.map((t) => (
            <button
              key={t.tier}
              onClick={() => setTier(t.tier)}
              className="text-left rounded-2xl p-5 border transition-all cursor-pointer"
              style={{
                background: tier === t.tier ? "rgba(79,195,247,0.05)" : "#0D0D14",
                borderColor: tier === t.tier ? "rgba(79,195,247,0.4)" : "#1A1A2E",
              }}
            >
              <div className="flex justify-between items-start mb-3">
                <span className="font-mono text-xs text-slate-500 tracking-widest">TIER {t.tier}</span>
                <span className="font-mono text-sm font-bold" style={{ color: tier === t.tier ? "#4FC3F7" : "#64748b" }}>
                  {t.price}
                </span>
              </div>
              <div className="font-mono font-semibold text-white mb-3">{t.label}</div>
              <ul className="space-y-1.5">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2 font-mono text-xs text-slate-500">
                    <span style={{ color: tier === t.tier ? "#4FC3F7" : "#334155" }}>·</span> {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={runSimulation} className="grid md:grid-cols-2 gap-8 mb-12">
          <div className="flex flex-col gap-4">
            <div>
              <label className="block font-mono text-xs text-slate-500 mb-1.5">Project Name *</label>
              <input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="e.g. Launch Simulator"
                required
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="block font-mono text-xs text-slate-500 mb-1.5">Description *</label>
              <textarea
                value={description}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What does this project do? Who is it for?"
                rows={4}
                required
                className={INPUT_CLS}
                style={{ resize: "vertical" }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block font-mono text-xs text-slate-500 mb-1.5">Ticker (optional)</label>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="e.g. SIM"
                maxLength={8}
                className={INPUT_CLS}
              />
            </div>
            {tier >= 2 && (
              <div>
                <label className="block font-mono text-xs text-slate-500 mb-1.5">Contract Address (optional)</label>
                <input
                  value={contract}
                  onChange={(e) => setContract(e.target.value)}
                  placeholder="0x… (Base mainnet)"
                  className={INPUT_CLS}
                />
                <p className="font-mono text-xs text-slate-600 mt-1">For live market data — leave blank if pre-launch</p>
              </div>
            )}

            <div className="card-surface rounded-2xl p-5 mt-auto">
              <div className="font-mono text-xs text-slate-500 tracking-widest mb-3">AGENTS IN THIS SIMULATION</div>
              <div className="space-y-2">
                {[
                  { name: "Blue Agent", role: "Orchestrator + LLM analysis", color: "#4FC3F7" },
                  { name: "Aeon",       role: "Ecosystem signal layer",       color: "#A78BFA" },
                  { name: "MiroShark",  role: "Community consensus (Bull/Bear/Neutral)", color: "#34d399" },
                ].map((a) => (
                  <div key={a.name} className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: a.color }} />
                    <span className="font-mono text-sm font-semibold text-white">{a.name}</span>
                    <span className="font-mono text-xs text-slate-500">{a.role}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !project || !description}
              className="font-mono text-sm font-semibold bg-[#4FC3F7] hover:bg-[#29ABE2] text-[#050508] px-5 py-3 rounded-xl transition-all disabled:opacity-50"
            >
              {loading ? "Running simulation…" : `Run Tier ${tier} Simulation →`}
            </button>

            {error && <p className="font-mono text-sm text-red-400">{error}</p>}
          </div>
        </form>

        {/* Results */}
        {result && (
          <div className="space-y-5">

            {/* Final verdict banner */}
            <div
              className="rounded-2xl p-6 border flex items-center justify-between gap-4"
              style={{ borderColor: verdictColor(result.final_verdict) + "40", background: verdictColor(result.final_verdict) + "08" }}
            >
              <div>
                <div className="font-mono text-xs text-slate-500 tracking-widest mb-1">SIMULATION COMPLETE — {new Date(result.timestamp).toLocaleTimeString()}</div>
                <div className="font-mono font-black text-3xl" style={{ color: verdictColor(result.final_verdict) }}>
                  {result.final_verdict}
                </div>
                <div className="font-mono text-sm text-slate-400 mt-1">
                  Confidence: <span className="text-white font-semibold">{result.confidence}%</span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs text-slate-500 mb-1">TIER {result.tier}</div>
                <div className="font-mono text-xs text-slate-600">{result.project} {result.ticker ? `($${result.ticker})` : ""}</div>
              </div>
            </div>

            {/* 3 agent panels */}
            <div className="grid md:grid-cols-3 gap-4">

              {/* Blue Agent */}
              <div className="card-surface rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-[#4FC3F7]" />
                  <div className="font-mono text-xs text-[#4FC3F7] tracking-widest">BLUE AGENT</div>
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <div className="font-mono font-black text-2xl" style={{ color: verdictColor(result.blue_agent.verdict) }}>
                    {result.blue_agent.verdict}
                  </div>
                  <div className="font-mono text-sm text-slate-500">score: <span className="text-white">{result.blue_agent.score}</span></div>
                </div>
                <p className="font-mono text-xs text-slate-400 mb-4">{result.blue_agent.summary}</p>
                {result.blue_agent.strengths?.length > 0 && (
                  <div className="mb-3">
                    <div className="font-mono text-xs text-emerald-400 mb-1">STRENGTHS</div>
                    <ul className="space-y-1">
                      {result.blue_agent.strengths.map((s, i) => <li key={i} className="font-mono text-xs text-slate-400">· {s}</li>)}
                    </ul>
                  </div>
                )}
                {result.blue_agent.risks?.length > 0 && (
                  <div>
                    <div className="font-mono text-xs text-red-400 mb-1">RISKS</div>
                    <ul className="space-y-1">
                      {result.blue_agent.risks.map((r, i) => <li key={i} className="font-mono text-xs text-slate-400">· {r}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {/* Aeon */}
              <div className="card-surface rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#A78BFA]" />
                    <div className="font-mono text-xs text-[#A78BFA] tracking-widest">AEON</div>
                  </div>
                  <span className="font-mono text-[9px] text-slate-700 border border-slate-800 px-1.5 py-0.5 rounded">simulated</span>
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <div className="font-mono font-bold text-lg text-white capitalize">{result.aeon.ecosystem_health}</div>
                  <div className="font-mono text-sm text-slate-500">timing: <span className="text-white">{result.aeon.timing_score}/10</span></div>
                </div>
                <p className="font-mono text-xs text-slate-400 mb-4 italic">"{result.aeon.narrative_fit}"</p>
                <div className="font-mono text-xs text-slate-500 mb-2">ECOSYSTEM SIGNALS</div>
                <ul className="space-y-1.5">
                  {result.aeon.signals?.map((s, i) => (
                    <li key={i} className="font-mono text-xs text-slate-400 flex gap-2">
                      <span className="text-[#A78BFA]">→</span> {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* MiroShark */}
              <div className="card-surface rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#34d399]" />
                    <div className="font-mono text-xs text-[#34d399] tracking-widest">MIROSHARK</div>
                  </div>
                  <span className="font-mono text-[9px] text-slate-700 border border-slate-800 px-1.5 py-0.5 rounded">simulated</span>
                </div>
                <div className="mb-4">
                  <div className="font-mono font-bold text-lg mb-0.5" style={{ color: verdictColor(result.miroshark.recommendation) }}>
                    {result.miroshark.recommendation.replace("_", " ").toUpperCase()}
                  </div>
                  <p className="font-mono text-xs text-slate-400">{result.miroshark.sentiment_summary}</p>
                </div>
                <div className="space-y-2 mb-4">
                  <Bar value={result.miroshark.bull}    color="#34d399" label="Bull" />
                  <Bar value={result.miroshark.bear}    color="#f87171" label="Bear" />
                  <Bar value={result.miroshark.neutral} color="#64748b" label="Neutral" />
                </div>
                <div className="font-mono text-xs text-slate-600">
                  Decision threshold: bull &gt;60% → execute · 40-60% → alert · bear &gt;40% → skip
                </div>
              </div>
            </div>

            {/* Market data (tier 2+) */}
            {result.market_data?.available && (
              <div className="card-surface rounded-2xl p-6">
                <div className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-4">LIVE MARKET DATA (Base)</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Price",        value: result.market_data.priceUsd     ? `$${result.market_data.priceUsd}` : "—" },
                    { label: "24h Volume",   value: result.market_data.volume24h    ? `$${Number(result.market_data.volume24h).toLocaleString()}` : "—" },
                    { label: "Liquidity",    value: result.market_data.liquidityUsd ? `$${Number(result.market_data.liquidityUsd).toLocaleString()}` : "—" },
                    { label: "24h Change",   value: result.market_data.priceChange24h != null ? `${result.market_data.priceChange24h as number > 0 ? "+" : ""}${result.market_data.priceChange24h}%` : "—" },
                  ].map((m) => (
                    <div key={m.label}>
                      <div className="font-mono text-xs text-slate-500 mb-1">{m.label}</div>
                      <div className="font-mono text-sm font-bold text-white">{String(m.value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk matrix (tier 3) */}
            {result.risk_matrix && (
              <div className="card-surface rounded-2xl p-6">
                <div className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-4">RISK MATRIX</div>
                <div className="space-y-3">
                  <RiskBar label="Market Timing"       value={result.risk_matrix.market_timing} />
                  <RiskBar label="Community Readiness" value={result.risk_matrix.community_readiness} />
                  <RiskBar label="Ecosystem Fit"       value={result.risk_matrix.ecosystem_fit} />
                  <RiskBar label="Technical Readiness" value={result.risk_matrix.technical_readiness} />
                  <RiskBar label="Narrative Strength"  value={result.risk_matrix.narrative_strength} />
                </div>
                <p className="font-mono text-xs text-slate-600 mt-3">Higher score = better readiness (0-10)</p>
              </div>
            )}

            {/* Timeline (tier 3) */}
            {result.timeline_recommendation && (
              <div className="card-surface rounded-2xl p-5 border border-[#fbbf24]/20">
                <div className="font-mono text-xs text-[#fbbf24] tracking-widest mb-2">TIMELINE RECOMMENDATION</div>
                <p className="font-mono text-sm text-white">{result.timeline_recommendation}</p>
              </div>
            )}

            {/* Action items */}
            {result.action_items?.length > 0 && (
              <div className="card-surface rounded-2xl p-6">
                <div className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-3">ACTION ITEMS</div>
                <ol className="space-y-2">
                  {result.action_items.map((item, i) => (
                    <li key={i} className="flex gap-3 font-mono text-sm text-slate-400">
                      <span className="text-[#4FC3F7] font-bold">{i + 1}.</span> {item}
                    </li>
                  ))}
                </ol>
              </div>
            )}

          </div>
        )}

      </main>
      <Footer />
    </>
  );
}
