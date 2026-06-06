"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import AppPageHeader from "@/components/app/AppPageHeader";
import { useAccount, useSignTypedData, useConnect, useDisconnect } from "wagmi";

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

// ── Sidebar tiers ─────────────────────────────────────────────────────────────

const TIERS: { tier: Tier; label: string; price: string; desc: string; features: string[] }[] = [
  {
    tier: 1,
    label: "Quick Signal",
    price: "$0.10",
    desc: "Baseline ecosystem read + 3-agent verdict.",
    features: ["Blue Agent analysis", "Aeon ecosystem signals", "MiroShark consensus", "Final verdict + action items"],
  },
  {
    tier: 2,
    label: "Deep Signal",
    price: "$0.35",
    desc: "Live market data included in the assessment.",
    features: ["Everything in Quick Signal", "Live DexScreener market data", "Price · volume · liquidity", "Enhanced confidence scoring"],
  },
  {
    tier: 3,
    label: "Full Simulation",
    price: "$0.50",
    desc: "Complete intelligence report with risk matrix.",
    features: ["Everything in Deep Signal", "5-axis risk matrix", "Timeline recommendation", "Full multi-agent analysis"],
  },
];

// ── Payment helpers ───────────────────────────────────────────────────────────

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

function randomNonce(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function usdcDisplay(raw: string): string {
  const n = Number(raw);
  return isNaN(n) ? raw : `$${(n / 1_000_000).toFixed(2)}`;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const verdictColor = (v: string) => {
  if (v === "LAUNCH" || v === "execute") return "#34d399";
  if (v === "WAIT"   || v === "alert_human") return "#fbbf24";
  return "#f87171";
};

function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xs text-slate-500 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-[#1A1A2E]">
        <div className="h-1 rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="font-mono text-xs font-bold w-8 text-right" style={{ color }}>{value}%</span>
    </div>
  );
}

function RiskBar({ label, value }: { label: string; value: number }) {
  const color = value >= 7 ? "#34d399" : value >= 4 ? "#fbbf24" : "#f87171";
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xs text-slate-500 w-40 shrink-0">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-[#1A1A2E]">
        <div className="h-1 rounded-full transition-all duration-700" style={{ width: `${value * 10}%`, background: color }} />
      </div>
      <span className="font-mono text-xs font-bold w-6 text-right" style={{ color }}>{value}</span>
      <span className="font-mono text-[10px] text-slate-700">/10</span>
    </div>
  );
}

function marketRows(md: Record<string, unknown>): { label: string; value: string }[] {
  const n = (v: unknown) => Number(v);
  return [
    { label: "Price",      value: md.priceUsd    ? `$${md.priceUsd as string}` : "—" },
    { label: "24h Volume", value: md.volume24h    ? `$${n(md.volume24h).toLocaleString()}` : "—" },
    { label: "Liquidity",  value: md.liquidityUsd ? `$${n(md.liquidityUsd).toLocaleString()}` : "—" },
    { label: "24h Change", value: md.priceChange24h != null
      ? `${n(md.priceChange24h) > 0 ? "+" : ""}${md.priceChange24h as string}%` : "—" },
  ];
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Step = "idle" | "calling" | "signing" | "paying" | "done" | "error";

export default function SimulatorPage({ inShell = false }: { inShell?: boolean }) {
  const [tier, setTier]         = useState<Tier>(1);
  const [project, setProject]   = useState("");
  const [description, setDesc]  = useState("");
  const [ticker, setTicker]     = useState("");
  const [contract, setContract] = useState("");
  const [step, setStep]         = useState<Step>("idle");
  const [payAmount, setPayAmount] = useState<string | null>(null);
  const [results, setResults]   = useState<Partial<Record<Tier, SimResult>>>({});
  const [error, setError]       = useState<string | null>(null);

  const result = results[tier] ?? null;

  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();

  const loading = step === "calling" || step === "signing" || step === "paying";

  async function runSimulation(e: React.FormEvent) {
    e.preventDefault();
    if (!project.trim() || !address) return;
    setStep("calling");
    setError(null);
    setPayAmount(null);

    try {
      const body = { project, description, ticker, contract, tier };

      // Step 1 — call without payment → expect 402
      const r1 = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (r1.ok) {
        // No payment required (shouldn't happen in production, but handle gracefully)
        const d1 = await r1.json() as SimResult;
        if (d1.final_verdict) { setResults((prev) => ({ ...prev, [tier]: d1 })); setStep("done"); }
        else { setError("Unexpected response from service."); setStep("error"); }
        return;
      }

      if (r1.status !== 402) {
        const err = await r1.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Service error ${r1.status}`);
      }

      // Step 2 — got 402, sign payment
      const d1 = await r1.json() as {
        accepts?: { payTo: string; maxAmountRequired: string; asset?: string; extra?: { name?: string; version?: string } }[];
      };
      const accepts = d1.accepts?.[0];
      if (!accepts) throw new Error("Invalid payment details from service.");

      const { payTo, maxAmountRequired, asset, extra } = accepts;
      setPayAmount(usdcDisplay(maxAmountRequired));
      setStep("signing");

      const nonce = randomNonce();
      const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);

      const signature = await signTypedDataAsync({
        domain: {
          name: extra?.name ?? "USD Coin",
          version: extra?.version ?? "2",
          chainId: 8453,
          verifyingContract: (asset ?? USDC_BASE) as `0x${string}`,
        },
        types: {
          TransferWithAuthorization: [
            { name: "from",        type: "address" },
            { name: "to",         type: "address" },
            { name: "value",      type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore",type: "uint256" },
            { name: "nonce",      type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization",
        message: {
          from: address,
          to: payTo as `0x${string}`,
          value: BigInt(maxAmountRequired),
          validAfter: BigInt(0),
          validBefore,
          nonce,
        },
      });

      // Step 3 — submit with X-Payment header
      setStep("paying");
      const payment = {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453",
        payload: {
          signature,
          authorization: {
            from: address,
            to: payTo,
            value: maxAmountRequired,
            validAfter: "0",
            validBefore: validBefore.toString(),
            nonce,
          },
        },
      };
      const xPaymentHeader = btoa(JSON.stringify(payment));

      const r2 = await fetch("/api/simulator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Payment": xPaymentHeader,
        },
        body: JSON.stringify(body),
      });
      const d2 = await r2.json() as SimResult & { error?: string; message?: string };
      if (d2.final_verdict) { setResults((prev) => ({ ...prev, [tier]: d2 })); setStep("done"); }
      else {
        const errMsg = [d2.error, d2.message].filter(Boolean).join(": ") || "Simulation failed.";
        throw new Error(errMsg);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("rejected") || msg.includes("denied") ? "Payment rejected in wallet." : msg);
      setStep("error");
    }
  }

  const selectedTier = TIERS.find((t) => t.tier === tier)!;

  return (
    <div className={inShell ? "flex flex-col h-full bg-[#050508]" : ""}>
      {!inShell && <Navbar />}
      {inShell && (
        <AppPageHeader
          label="SIMULATOR"
          subtitle="Launch simulator · 3-agent analysis · x402 payments"
          accent="#A78BFA"
          right={<span className="text-[10px] px-1.5 py-0.5 border border-[#A78BFA]/30 text-[#A78BFA] rounded">Multi-agent</span>}
        />
      )}
      <div className={`flex bg-[#050508] font-mono ${inShell ? "flex-1 overflow-hidden" : "pt-14"}`}>

          {/* ── Sidebar ──────────────────────────────────── */}
          <aside className={`hidden lg:flex flex-col w-72 shrink-0 overflow-y-auto border-r border-[#1A1A2E] py-10 px-4 ${inShell ? "h-full" : "sticky top-14 h-[calc(100vh-3.5rem)]"}`}>
            <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-4 px-2">SIMULATION TIER</p>
            <nav className="flex flex-col gap-1">
              {TIERS.map((t) => (
                <button
                  key={t.tier}
                  onClick={() => setTier(t.tier)}
                  className={`text-left px-3 py-2.5 rounded-lg transition-all ${
                    tier === t.tier
                      ? "bg-[#4FC3F7]/8 text-[#4FC3F7]"
                      : "text-slate-500 hover:text-slate-300 hover:bg-[#1A1A2E]/50"
                  }`}
                >
                  <div className="font-mono text-sm flex items-center justify-between">
                    <span>{t.label}</span>
                    <span className="font-mono text-[10px] text-slate-700">{t.price}</span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-700 mt-0.5 leading-snug">{t.desc.slice(0, 38)}…</div>
                </button>
              ))}
            </nav>

            <div className="mt-6 pt-6 border-t border-[#1A1A2E]">
              <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-3 px-2">AGENTS</p>
              <div className="flex flex-col gap-2 px-2">
                {[
                  { dot: "#4FC3F7", label: "Blue Agent", note: "analysis" },
                  { dot: "#A78BFA", label: "Aeon",       note: "ecosystem" },
                  { dot: "#34d399", label: "MiroShark",  note: "consensus" },
                ].map((a) => (
                  <div key={a.label} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: a.dot }} />
                    <span className="font-mono text-xs text-slate-600">{a.label}</span>
                    <span className="font-mono text-[10px] text-slate-800 ml-auto">{a.note}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-auto px-2 pt-6 border-t border-[#1A1A2E] space-y-3">
              {isConnected && address ? (
                <div>
                  <p className="font-mono text-[10px] text-slate-700 mb-1">WALLET</p>
                  <p className="font-mono text-[10px] text-[#4FC3F7] truncate">{address.slice(0,6)}…{address.slice(-4)}</p>
                  <button onClick={() => disconnect()}
                    className="font-mono text-[10px] text-slate-700 hover:text-red-400 transition-colors mt-1">
                    disconnect
                  </button>
                </div>
              ) : null}
              <div>
                <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer"
                  className="font-mono text-xs text-slate-700 hover:text-white transition-colors block mb-1">@blueagent_ →</a>
                <a href="/docs" className="font-mono text-xs text-slate-700 hover:text-white transition-colors block">docs →</a>
              </div>
            </div>
          </aside>

          {/* ── Main content ─────────────────────────────── */}
          <main className="flex-1 h-[calc(100vh-3.5rem)] overflow-y-auto px-6 lg:px-10 py-10">

            {/* Page header */}
            <div className="mb-10">
              <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-3">// PRE-LAUNCH INTELLIGENCE</p>
              <h1 className="font-mono text-4xl sm:text-5xl font-bold text-white mb-3">
                Launch<span className="text-[#4FC3F7]">Simulator</span>
              </h1>
              <p className="font-mono text-base text-slate-400 max-w-xl">
                3-agent pre-launch intelligence — Blue Agent · Aeon · MiroShark. Know before you ship.
              </p>

              {/* Mobile tier tabs */}
              <div className="lg:hidden flex gap-2 mt-6 flex-wrap border-b border-[#1A1A2E] pb-4">
                {TIERS.map((t) => (
                  <button key={t.tier}
                    onClick={() => setTier(t.tier)}
                    className={`font-mono text-xs px-3 py-1.5 rounded-lg transition-all ${
                      tier === t.tier ? "bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30" : "text-slate-500 hover:text-white"
                    }`}>
                    {t.label} · {t.price}
                  </button>
                ))}
              </div>
            </div>

            {/* Tier info card */}
            <div className="mb-6 card-surface rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs text-[#4FC3F7]">&lt;Tier {selectedTier.tier}&gt;</span>
                <span className="font-mono text-sm text-white font-semibold">{selectedTier.label}</span>
                <span className="font-mono text-xs text-slate-700 ml-auto">{selectedTier.price}</span>
              </div>
              <p className="font-mono text-sm text-slate-400 mb-3 leading-relaxed">{selectedTier.desc}</p>
              <div className="flex flex-wrap gap-1">
                {selectedTier.features.map((f) => (
                  <span key={f} className="font-mono text-[10px] text-slate-600 border border-[#1A1A2E] px-2 py-0.5 rounded">{f}</span>
                ))}
              </div>
            </div>

            {/* Input form */}
            <form onSubmit={runSimulation} className="mb-6 space-y-3">
              <div className="card-surface rounded-xl p-4 space-y-3">
                <div>
                  <label className="font-mono text-[10px] text-slate-600 tracking-widest block mb-1.5">PROJECT NAME *</label>
                  <input
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                    placeholder="e.g. BlueMint"
                    className="w-full px-3 py-2 rounded-lg font-mono text-sm bg-[#050508] border border-[#1A1A2E] text-white placeholder:text-slate-700 outline-none focus:border-[#4FC3F7]/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-slate-600 tracking-widest block mb-1.5">DESCRIPTION</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="What does your project do? Be specific about Base ecosystem fit."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg font-mono text-sm bg-[#050508] border border-[#1A1A2E] text-white placeholder:text-slate-700 outline-none focus:border-[#4FC3F7]/40 transition-colors resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-mono text-[10px] text-slate-600 tracking-widest block mb-1.5">TICKER</label>
                    <input
                      value={ticker}
                      onChange={(e) => setTicker(e.target.value)}
                      placeholder="$BLUE"
                      className="w-full px-3 py-2 rounded-lg font-mono text-sm bg-[#050508] border border-[#1A1A2E] text-white placeholder:text-slate-700 outline-none focus:border-[#4FC3F7]/40 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] text-slate-600 tracking-widest block mb-1.5">CONTRACT {tier < 2 && <span className="text-slate-800">(tier 2+)</span>}</label>
                    <input
                      value={contract}
                      onChange={(e) => setContract(e.target.value)}
                      placeholder="0x…"
                      disabled={tier < 2}
                      className="w-full px-3 py-2 rounded-lg font-mono text-sm bg-[#050508] border border-[#1A1A2E] text-white placeholder:text-slate-700 outline-none focus:border-[#4FC3F7]/40 transition-colors disabled:opacity-30"
                    />
                  </div>
                </div>
              </div>
              {!isConnected ? (
                <div className="card-surface rounded-xl p-4 space-y-2">
                  <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">CONNECT WALLET TO RUN</p>
                  {connectors.map((c) => (
                    <button key={c.id} onClick={() => connect({ connector: c })}
                      className="w-full font-mono text-sm text-slate-300 border border-[#1A1A2E] hover:border-[#4FC3F7]/40 hover:text-white px-4 py-2.5 rounded-xl transition-all text-left flex items-center justify-between">
                      <span>{c.name}</span>
                      <span className="text-[#4FC3F7] text-xs">→</span>
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={loading || !project.trim()}
                  className="w-full font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-4 py-2.5 rounded-xl hover:bg-[#29ABE2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {step === "calling"  && <><Spinner /> Calling agents…</>}
                  {step === "signing"  && <><Spinner /> Sign {payAmount ?? selectedTier.price} USDC in wallet…</>}
                  {step === "paying"   && <><Spinner /> Submitting payment…</>}
                  {(step === "idle" || step === "done" || step === "error") && `Run Tier ${tier} · ${selectedTier.price} USDC →`}
                </button>
              )}
              <p className="font-mono text-[10px] text-slate-700 px-1">
                x402 · USDC on Base · 3 agents in parallel
              </p>
            </form>

            {/* Error */}
            {step === "error" && error && (
              <div className="card-surface rounded-xl p-4 border border-red-500/20 mb-6">
                <p className="font-mono text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="card-surface rounded-xl p-6 flex items-center gap-3 mb-6">
                <div className="glow-dot animate-pulse" />
                <span className="font-mono text-xs text-slate-500">
                  {step === "signing" ? `Sign ${payAmount ?? selectedTier.price} USDC in your wallet…` :
                   step === "paying"  ? "Submitting payment on Base…" :
                   "Blue Agent + Aeon + MiroShark running…"}
                </span>
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-4">

                {/* Verdict header */}
                <div className="card-surface rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-1">
                        SIMULATION COMPLETE — {new Date(result.timestamp).toLocaleTimeString()}
                      </p>
                      <div className="font-mono text-4xl font-bold" style={{ color: verdictColor(result.final_verdict) }}>
                        {result.final_verdict}
                      </div>
                      <p className="font-mono text-sm text-slate-500 mt-1">Confidence: <span className="text-white">{result.confidence}%</span></p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[10px] text-slate-700">TIER {result.tier}</p>
                      <p className="font-mono text-[10px] text-slate-700">Launch Simulator</p>
                    </div>
                  </div>
                </div>

                {/* 3 agents */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                  {/* Blue Agent */}
                  <div className="card-surface rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-2 h-2 rounded-full bg-[#4FC3F7]" />
                      <span className="font-mono text-xs text-[#4FC3F7] tracking-widest">BLUE AGENT</span>
                    </div>
                    <div className="font-mono font-bold text-2xl mb-0.5" style={{ color: verdictColor(result.blue_agent.verdict) }}>
                      {result.blue_agent.verdict}
                    </div>
                    <p className="font-mono text-[10px] text-slate-600 mb-3">score: {result.blue_agent.score}</p>
                    <p className="font-mono text-xs text-slate-400 mb-4 leading-relaxed">{result.blue_agent.summary}</p>

                    {result.blue_agent.strengths?.length > 0 && (
                      <>
                        <p className="font-mono text-[10px] text-[#34d399] tracking-widest mb-1.5">STRENGTHS</p>
                        <ul className="space-y-1 mb-3">
                          {result.blue_agent.strengths.map((s, i) => (
                            <li key={i} className="font-mono text-xs text-slate-400 leading-snug">· {s}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {result.blue_agent.risks?.length > 0 && (
                      <>
                        <p className="font-mono text-[10px] text-[#f87171] tracking-widest mb-1.5">RISKS</p>
                        <ul className="space-y-1">
                          {result.blue_agent.risks.map((r, i) => (
                            <li key={i} className="font-mono text-xs text-slate-400 leading-snug">· {r}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>

                  {/* Aeon */}
                  <div className="card-surface rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#A78BFA]" />
                        <span className="font-mono text-xs text-[#A78BFA] tracking-widest">AEON</span>
                      </div>
                      <span className={`font-mono text-[10px] border px-1.5 py-0.5 rounded ${
                        result.aeon.status === "live"
                          ? "text-[#A78BFA] border-[#A78BFA]/40"
                          : "text-slate-700 border-slate-800"
                      }`}>
                        {result.aeon.status === "live" ? "live" : "simulated"}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 mb-3">
                      <div className="font-mono font-bold text-lg text-white capitalize">{result.aeon.ecosystem_health}</div>
                      <div className="font-mono text-sm text-slate-500">timing: <span className="text-white">{result.aeon.timing_score}/10</span></div>
                    </div>
                    <p className="font-mono text-xs text-slate-400 mb-4 italic leading-relaxed">"{result.aeon.narrative_fit}"</p>
                    <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-2">ECOSYSTEM SIGNALS</p>
                    <ul className="space-y-2">
                      {result.aeon.signals?.map((s, i) => (
                        <li key={i} className="font-mono text-xs text-slate-400 flex gap-2 leading-snug">
                          <span className="text-[#A78BFA] shrink-0">→</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* MiroShark */}
                  <div className="card-surface rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#34d399]" />
                        <span className="font-mono text-xs text-[#34d399] tracking-widest">MIROSHARK</span>
                      </div>
                      <span className={`font-mono text-[10px] border px-1.5 py-0.5 rounded ${
                        result.miroshark.status === "live"
                          ? "text-[#34d399] border-[#34d399]/40"
                          : "text-slate-700 border-slate-800"
                      }`}>
                        {result.miroshark.status === "live" ? "live" : "simulated"}
                      </span>
                    </div>
                    <div className="font-mono font-bold text-lg mb-1" style={{ color: verdictColor(result.miroshark.recommendation) }}>
                      {result.miroshark.recommendation.replace("_", " ").toUpperCase()}
                    </div>
                    <p className="font-mono text-xs text-slate-400 mb-4 leading-relaxed">{result.miroshark.sentiment_summary}</p>
                    <div className="space-y-2.5 mb-4">
                      <Bar value={result.miroshark.bull}    color="#34d399" label="Bull" />
                      <Bar value={result.miroshark.bear}    color="#f87171" label="Bear" />
                      <Bar value={result.miroshark.neutral} color="#94a3b8" label="Neutral" />
                    </div>
                    <p className="font-mono text-[10px] text-slate-700">
                      Decision threshold: bull &gt;60% → execute · 40-60% → alert · bear &gt;40% → skip
                    </p>
                  </div>
                </div>

                {/* Market data (tier 2+) */}
                {result.tier >= 2 && result.market_data && (result.market_data.available as boolean) && (
                  <div className="card-surface rounded-xl p-5">
                    <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">LIVE MARKET DATA — DexScreener / Base</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {marketRows(result.market_data).map((r) => (
                        <div key={r.label}>
                          <p className="font-mono text-[10px] text-slate-600 mb-0.5">{r.label}</p>
                          <p className="font-mono text-sm text-white">{r.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Risk matrix (tier 3) */}
                {result.tier >= 3 && result.risk_matrix && (
                  <div className="card-surface rounded-xl p-5">
                    <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-4">RISK MATRIX</p>
                    <div className="space-y-3">
                      <RiskBar label="Market Timing"       value={result.risk_matrix.market_timing} />
                      <RiskBar label="Community Readiness" value={result.risk_matrix.community_readiness} />
                      <RiskBar label="Ecosystem Fit"       value={result.risk_matrix.ecosystem_fit} />
                      <RiskBar label="Technical Readiness" value={result.risk_matrix.technical_readiness} />
                      <RiskBar label="Narrative Strength"  value={result.risk_matrix.narrative_strength} />
                    </div>
                    <p className="font-mono text-[10px] text-slate-700 mt-3">Higher score = better readiness (0-10)</p>
                  </div>
                )}

                {/* Timeline (tier 3) */}
                {result.tier >= 3 && result.timeline_recommendation && (
                  <div className="card-surface rounded-xl p-5">
                    <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">TIMELINE RECOMMENDATION</p>
                    <p className="font-mono text-sm text-slate-300 leading-relaxed">{result.timeline_recommendation}</p>
                  </div>
                )}

                {/* Action items */}
                {result.action_items?.length > 0 && (
                  <div className="card-surface rounded-xl p-5">
                    <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-4">ACTION ITEMS</p>
                    <ol className="space-y-3">
                      {result.action_items.map((item, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="font-mono text-xs text-[#4FC3F7] shrink-0 mt-0.5">{i + 1}.</span>
                          <span className="font-mono text-sm text-slate-300 leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </main>
      </div>
    </div>
  );
}

