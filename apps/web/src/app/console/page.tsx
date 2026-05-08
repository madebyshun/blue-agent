"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

type LaunchMode = "token" | "agent";

type TokenResult = {
  tokenName: string;
  tokenSymbol: string;
  launchScore: number;
  summary: string;
  positioning: { tagline: string; whyNow: string; targetCommunity: string; differentiator: string };
  tokenomics: { supply: string; feeStructure: string; liquidityNote: string };
  launchChecklist: string[];
  growthTactics: string[];
  risks: string[];
  bankrPrompt: string;
  bankrJob?: { jobId: string; status: string; pollUrl: string } | null;
  recommendation: string;
};

const AGENT_STEPS = [
  { label: "Name the agent",         desc: "Give your agent a name and purpose" },
  { label: "Choose persona + model", desc: "Define personality and select Bankr model" },
  { label: "Set tools + price",      desc: "Pick skills and set per-session pricing" },
  { label: "Publish to marketplace", desc: "Go live on Bankr and start earning" },
];

const INPUT_CLS = "w-full px-4 py-2.5 rounded-xl font-mono text-sm bg-[#050508] border border-[#1A1A2E] text-white placeholder:text-slate-600 outline-none focus:border-[#4FC3F7]/40 transition-colors";

export default function ConsolePage() {
  const [mode, setMode] = useState<LaunchMode>("token");

  const [tokenName,   setTokenName]   = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl,    setImageUrl]    = useState("");
  const [twitter,     setTwitter]     = useState("");
  const [website,     setWebsite]     = useState("");

  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<TokenResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [copied,  setCopied]  = useState(false);

  async function handleTokenLaunch(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenName || !tokenSymbol || !description) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/tool/token-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolParams: { tokenName, tokenSymbol, description, imageUrl, twitter, website },
        }),
      });
      const data = await res.json();
      if (data.result) setResult(data.result as TokenResult);
      else setError(data.error ?? "Something went wrong.");
    } catch {
      setError("Could not reach Blue Agent service.");
    } finally {
      setLoading(false);
    }
  }

  function copyPrompt() {
    if (!result?.bankrPrompt) return;
    navigator.clipboard.writeText(result.bankrPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const scoreColor = (s: number) => s >= 75 ? "#34d399" : s >= 50 ? "#fbbf24" : "#f87171";

  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-4 py-1.5 mb-6">
            <span className="font-mono text-xs text-[#4FC3F7] tracking-widest">LAUNCH WIZARD</span>
          </div>
          <h1 className="font-mono font-bold text-4xl sm:text-5xl text-white mb-4">
            Launch on <span className="text-gradient-blue">Base</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl">
            Deploy a fair-launch token via Bankr + Clanker, or publish an agent to the Bankr marketplace.
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-10">
          {(["token", "agent"] as LaunchMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setResult(null); setError(null); }}
              className="font-mono px-5 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer"
              style={{
                background: mode === m ? "#4FC3F7" : "#0D0D14",
                color: mode === m ? "#050508" : "#94a3b8",
                border: mode === m ? "none" : "1px solid #1A1A2E",
              }}
            >
              {m === "token" ? "Token Launch" : "Agent Launch"}
            </button>
          ))}
        </div>

        {/* TOKEN LAUNCH */}
        {mode === "token" && (
          <>
            <div className="grid md:grid-cols-2 gap-10">
              {/* Form */}
              <form onSubmit={handleTokenLaunch} className="flex flex-col gap-4">
                <div>
                  <label className="block font-mono text-xs text-slate-500 mb-1.5">Token Name *</label>
                  <input value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="e.g. Blue Agent" required className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block font-mono text-xs text-slate-500 mb-1.5">Symbol *</label>
                  <input value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())} placeholder="e.g. BLUE" maxLength={8} required className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block font-mono text-xs text-slate-500 mb-1.5">Description *</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this token represent or fund?" rows={3} required className={INPUT_CLS} style={{ resize: "vertical" }} />
                </div>
                <div>
                  <label className="block font-mono text-xs text-slate-500 mb-1.5">Image URL</label>
                  <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className={INPUT_CLS} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-mono text-xs text-slate-500 mb-1.5">Twitter / X</label>
                    <input value={twitter} onChange={(e) => setTwitter(e.target.value.replace("@", ""))} placeholder="handle (no @)" className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className="block font-mono text-xs text-slate-500 mb-1.5">Website</label>
                    <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." className={INPUT_CLS} />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !tokenName || !tokenSymbol || !description}
                  className="font-mono text-sm font-semibold bg-[#4FC3F7] hover:bg-[#29ABE2] text-[#050508] px-5 py-3 rounded-lg transition-all disabled:opacity-50 mt-2"
                >
                  {loading ? "Generating launch plan…" : "Generate Launch Plan →"}
                </button>

                {error && <p className="font-mono text-sm text-red-400">{error}</p>}
              </form>

              {/* Info cards */}
              <div className="flex flex-col gap-4">
                <div className="card-surface rounded-2xl p-6">
                  <div className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-4">HOW IT WORKS</div>
                  <ol className="space-y-3 text-sm text-slate-400">
                    {[
                      "Fill in your token details",
                      "Get a launch plan + ready-to-run Bankr prompt",
                      "Paste the prompt into Bankr to deploy on Base",
                      "Claim 40% of every swap fee to your wallet",
                    ].map((step, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="font-mono font-bold text-[#4FC3F7]">{i + 1}.</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="card-surface rounded-2xl p-6">
                  <div className="font-mono text-xs text-slate-500 tracking-widest mb-4">FEE STRUCTURE (per trade)</div>
                  <div className="space-y-2">
                    {[
                      { label: "You (creator)", pct: "40%", color: "#34d399" },
                      { label: "Bankr",          pct: "40%", color: "#4FC3F7" },
                      { label: "Clanker",        pct: "20%", color: "#A78BFA" },
                    ].map((r) => (
                      <div key={r.label} className="flex justify-between items-center">
                        <span className="font-mono text-sm text-slate-400">{r.label}</span>
                        <span className="font-mono text-sm font-bold" style={{ color: r.color }}>{r.pct}</span>
                      </div>
                    ))}
                  </div>
                  <p className="font-mono text-xs text-slate-600 mt-4">
                    1% total fee on every Uniswap V3 swap · No upfront cost
                  </p>
                </div>
              </div>
            </div>

            {/* Result */}
            {result && (
              <div className="mt-12 space-y-5">
                <div className="card-surface rounded-2xl p-6 flex flex-col md:flex-row md:items-center gap-4 justify-between">
                  <div>
                    <h2 className="font-mono font-bold text-2xl text-white">
                      {result.tokenName} <span className="text-[#4FC3F7]">({result.tokenSymbol})</span>
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">{result.summary}</p>
                  </div>
                  <div className="text-center">
                    <div className="font-mono text-4xl font-black" style={{ color: scoreColor(result.launchScore) }}>
                      {result.launchScore}
                    </div>
                    <div className="font-mono text-xs text-slate-500">launch score</div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                  {result.positioning && (
                    <div className="card-surface rounded-2xl p-6">
                      <div className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-3">POSITIONING</div>
                      <p className="font-mono font-bold text-white mb-3">&quot;{result.positioning.tagline}&quot;</p>
                      <div className="space-y-1.5 text-sm text-slate-400">
                        <p><span className="font-semibold text-slate-300">Why now:</span> {result.positioning.whyNow}</p>
                        <p><span className="font-semibold text-slate-300">Community:</span> {result.positioning.targetCommunity}</p>
                        <p><span className="font-semibold text-slate-300">Edge:</span> {result.positioning.differentiator}</p>
                      </div>
                    </div>
                  )}

                  {result.tokenomics && (
                    <div className="card-surface rounded-2xl p-6">
                      <div className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-3">TOKENOMICS</div>
                      <div className="space-y-1.5 text-sm text-slate-400">
                        <p><span className="font-semibold text-slate-300">Supply:</span> {result.tokenomics.supply}</p>
                        <p><span className="font-semibold text-slate-300">Fees:</span> {result.tokenomics.feeStructure}</p>
                        <p><span className="font-semibold text-slate-300">Liquidity:</span> {result.tokenomics.liquidityNote}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                  {result.launchChecklist?.length > 0 && (
                    <div className="card-surface rounded-2xl p-6">
                      <div className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-3">LAUNCH CHECKLIST</div>
                      <ul className="space-y-1.5 text-sm text-slate-400">
                        {result.launchChecklist.map((item, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-[#4FC3F7]">□</span> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-col gap-4">
                    {result.growthTactics?.length > 0 && (
                      <div className="card-surface rounded-2xl p-5">
                        <div className="font-mono text-xs text-emerald-400 tracking-widest mb-2">GROWTH TACTICS</div>
                        <ul className="space-y-1 text-sm text-slate-400">
                          {result.growthTactics.map((t, i) => <li key={i}>· {t}</li>)}
                        </ul>
                      </div>
                    )}
                    {result.risks?.length > 0 && (
                      <div className="card-surface rounded-2xl p-5">
                        <div className="font-mono text-xs text-red-400 tracking-widest mb-2">RISKS</div>
                        <ul className="space-y-1 text-sm text-slate-400">
                          {result.risks.map((r, i) => <li key={i}>· {r}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {result.bankrPrompt && (
                  <div className="card-surface rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-mono text-xs text-[#4FC3F7] tracking-widest">
                        BANKR LAUNCH PROMPT — paste this into Bankr to deploy
                      </div>
                      <button
                        onClick={copyPrompt}
                        className="font-mono text-xs px-3 py-1 rounded-lg transition-all"
                        style={{
                          background: copied ? "rgba(52,211,153,0.1)" : "rgba(79,195,247,0.1)",
                          color: copied ? "#34d399" : "#4FC3F7",
                          border: `1px solid ${copied ? "rgba(52,211,153,0.3)" : "rgba(79,195,247,0.3)"}`,
                        }}
                      >
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <pre className="font-mono text-sm p-4 rounded-xl overflow-x-auto bg-[#050508] text-slate-300 border border-[#1A1A2E] whitespace-pre-wrap break-words">
                      {result.bankrPrompt}
                    </pre>
                    {result.bankrJob && (
                      <p className="font-mono text-xs mt-2 text-emerald-400">
                        ✓ Submitted to Bankr · Job ID: {result.bankrJob.jobId}
                      </p>
                    )}
                  </div>
                )}

                <div className="card-surface rounded-2xl p-5 text-center font-mono font-semibold text-white border" style={{ borderColor: scoreColor(result.launchScore) + "40" }}>
                  {result.recommendation}
                </div>
              </div>
            )}
          </>
        )}

        {/* AGENT LAUNCH */}
        {mode === "agent" && (
          <div>
            <div className="grid md:grid-cols-2 gap-5 mb-8">
              {AGENT_STEPS.map((step, i) => (
                <div key={step.label} className="card-surface rounded-2xl p-6 flex gap-4 items-start">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-mono text-sm bg-[#4FC3F7]/10 border border-[#4FC3F7]/30 text-[#4FC3F7]">
                    {i + 1}
                  </div>
                  <div>
                    <div className="font-mono font-semibold text-white">{step.label}</div>
                    <div className="font-mono text-sm text-slate-400 mt-0.5">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card-surface rounded-2xl p-6 border border-[#A78BFA]/20">
              <div className="font-mono text-xs text-[#A78BFA] tracking-widest mb-2">COMING SOON</div>
              <p className="text-sm text-slate-400">
                The full agent wizard is in active development. Use{" "}
                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[#4FC3F7]/5 border border-[#4FC3F7]/20 text-[#4FC3F7]">
                  blue launch
                </span>{" "}
                in the console to generate an agent config today.
              </p>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
