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
  { label: "Name the agent", desc: "Give your agent a name and purpose" },
  { label: "Choose persona + model", desc: "Define personality and select Bankr model" },
  { label: "Set tools + price", desc: "Pick skills and set per-session pricing" },
  { label: "Publish to marketplace", desc: "Go live on Bankr and start earning" },
];

export default function LaunchPage() {
  const [mode, setMode] = useState<LaunchMode>("token");

  // Token launch form state
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [twitter, setTwitter] = useState("");
  const [website, setWebsite] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TokenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      if (data.result) {
        setResult(data.result as TokenResult);
      } else {
        setError(data.error ?? "Something went wrong.");
      }
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

  const scoreColor = (s: number) =>
    s >= 75 ? "#16a34a" : s >= 50 ? "#d97706" : "#dc2626";

  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="badge mb-5">Launch Wizard</div>
        <h1 className="text-5xl font-black mb-4" style={{ color: "var(--text)" }}>
          Launch on Base
        </h1>
        <p className="text-lg mb-8 max-w-2xl" style={{ color: "var(--text-muted)" }}>
          Deploy a fair-launch token via Bankr + Clanker, or publish an agent to the Bankr marketplace.
        </p>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-10">
          {(["token", "agent"] as LaunchMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setResult(null); setError(null); }}
              className="px-5 py-2 rounded-full text-sm font-semibold transition-all"
              style={{
                background: mode === m ? "#4a90d9" : "var(--surface)",
                color: mode === m ? "#fff" : "var(--text-muted)",
                border: mode === m ? "none" : "1px solid var(--border)",
              }}
            >
              {m === "token" ? "🪙 Token Launch" : "🤖 Agent Launch"}
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
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                    Token Name *
                  </label>
                  <input
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    placeholder="e.g. Blue Agent"
                    required
                    className="w-full px-4 py-2.5 rounded-xl text-sm"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                    Symbol *
                  </label>
                  <input
                    value={tokenSymbol}
                    onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g. BLUE"
                    maxLength={8}
                    required
                    className="w-full px-4 py-2.5 rounded-xl text-sm font-mono"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                    Description *
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this token represent or fund?"
                    rows={3}
                    required
                    className="w-full px-4 py-2.5 rounded-xl text-sm"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", outline: "none", resize: "vertical" }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                    Image URL
                  </label>
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-4 py-2.5 rounded-xl text-sm"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                      Twitter / X
                    </label>
                    <input
                      value={twitter}
                      onChange={(e) => setTwitter(e.target.value.replace("@", ""))}
                      placeholder="handle (no @)"
                      className="w-full px-4 py-2.5 rounded-xl text-sm"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                      Website
                    </label>
                    <input
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-4 py-2.5 rounded-xl text-sm"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !tokenName || !tokenSymbol || !description}
                  className="btn-blue mt-2 disabled:opacity-50"
                >
                  {loading ? "Generating launch plan…" : "Generate Launch Plan →"}
                </button>

                {error && (
                  <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>
                )}
              </form>

              {/* Fee info card */}
              <div className="flex flex-col gap-4">
                <div className="card p-6">
                  <div className="text-xs font-semibold mb-3" style={{ color: "#4a90d9" }}>
                    HOW IT WORKS
                  </div>
                  <ol className="space-y-3 text-sm" style={{ color: "var(--text-muted)" }}>
                    <li className="flex gap-3"><span className="font-bold" style={{ color: "#4a90d9" }}>1.</span> Fill in your token details</li>
                    <li className="flex gap-3"><span className="font-bold" style={{ color: "#4a90d9" }}>2.</span> Get a launch plan + ready-to-run Bankr prompt</li>
                    <li className="flex gap-3"><span className="font-bold" style={{ color: "#4a90d9" }}>3.</span> Paste the prompt into Bankr to deploy on Base</li>
                    <li className="flex gap-3"><span className="font-bold" style={{ color: "#4a90d9" }}>4.</span> Claim 40% of every swap fee to your wallet</li>
                  </ol>
                </div>

                <div className="card p-6">
                  <div className="text-xs font-semibold mb-3" style={{ color: "var(--text-muted)" }}>
                    FEE STRUCTURE (per trade)
                  </div>
                  <div className="space-y-2 text-sm">
                    {[
                      { label: "You (creator)", pct: "40%", color: "#16a34a" },
                      { label: "Bankr", pct: "40%", color: "#4a90d9" },
                      { label: "Clanker", pct: "20%", color: "#9333ea" },
                    ].map((r) => (
                      <div key={r.label} className="flex justify-between items-center">
                        <span style={{ color: "var(--text-muted)" }}>{r.label}</span>
                        <span className="font-semibold" style={{ color: r.color }}>{r.pct}</span>
                      </div>
                    ))}
                    <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                      1% total fee on every Uniswap V3 swap · No upfront cost · No gas fees
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Result */}
            {result && (
              <div className="mt-12 space-y-6">
                {/* Header */}
                <div className="card p-6 flex flex-col md:flex-row md:items-center gap-4 justify-between">
                  <div>
                    <h2 className="text-2xl font-black" style={{ color: "var(--text)" }}>
                      {result.tokenName} <span className="font-mono text-lg" style={{ color: "#4a90d9" }}>({result.tokenSymbol})</span>
                    </h2>
                    <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{result.summary}</p>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-black" style={{ color: scoreColor(result.launchScore) }}>
                      {result.launchScore}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>launch score</div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                  {/* Positioning */}
                  {result.positioning && (
                    <div className="card p-6">
                      <div className="text-xs font-semibold mb-3" style={{ color: "#4a90d9" }}>POSITIONING</div>
                      <p className="font-bold mb-2" style={{ color: "var(--text)" }}>"{result.positioning.tagline}"</p>
                      <div className="space-y-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                        <p><span className="font-semibold">Why now:</span> {result.positioning.whyNow}</p>
                        <p><span className="font-semibold">Community:</span> {result.positioning.targetCommunity}</p>
                        <p><span className="font-semibold">Edge:</span> {result.positioning.differentiator}</p>
                      </div>
                    </div>
                  )}

                  {/* Tokenomics */}
                  {result.tokenomics && (
                    <div className="card p-6">
                      <div className="text-xs font-semibold mb-3" style={{ color: "#4a90d9" }}>TOKENOMICS</div>
                      <div className="space-y-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                        <p><span className="font-semibold">Supply:</span> {result.tokenomics.supply}</p>
                        <p><span className="font-semibold">Fees:</span> {result.tokenomics.feeStructure}</p>
                        <p><span className="font-semibold">Liquidity:</span> {result.tokenomics.liquidityNote}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                  {/* Checklist */}
                  {result.launchChecklist?.length > 0 && (
                    <div className="card p-6">
                      <div className="text-xs font-semibold mb-3" style={{ color: "#4a90d9" }}>LAUNCH CHECKLIST</div>
                      <ul className="space-y-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                        {result.launchChecklist.map((item, i) => (
                          <li key={i} className="flex gap-2">
                            <span style={{ color: "#4a90d9" }}>□</span> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Growth + Risks */}
                  <div className="flex flex-col gap-4">
                    {result.growthTactics?.length > 0 && (
                      <div className="card p-5">
                        <div className="text-xs font-semibold mb-2" style={{ color: "#16a34a" }}>GROWTH TACTICS</div>
                        <ul className="space-y-1 text-sm" style={{ color: "var(--text-muted)" }}>
                          {result.growthTactics.map((t, i) => <li key={i}>• {t}</li>)}
                        </ul>
                      </div>
                    )}
                    {result.risks?.length > 0 && (
                      <div className="card p-5">
                        <div className="text-xs font-semibold mb-2" style={{ color: "#dc2626" }}>RISKS</div>
                        <ul className="space-y-1 text-sm" style={{ color: "var(--text-muted)" }}>
                          {result.risks.map((r, i) => <li key={i}>• {r}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bankr Prompt */}
                {result.bankrPrompt && (
                  <div className="card p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-semibold" style={{ color: "#4a90d9" }}>
                        BANKR LAUNCH PROMPT — paste this into Bankr to deploy
                      </div>
                      <button
                        onClick={copyPrompt}
                        className="text-xs px-3 py-1 rounded-lg font-semibold transition-all"
                        style={{ background: copied ? "rgba(22,163,74,0.1)" : "rgba(74,144,217,0.1)", color: copied ? "#16a34a" : "#4a90d9", border: `1px solid ${copied ? "rgba(22,163,74,0.3)" : "rgba(74,144,217,0.3)"}` }}
                      >
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <pre
                      className="text-sm p-4 rounded-xl overflow-x-auto"
                      style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                    >
                      {result.bankrPrompt}
                    </pre>
                    {result.bankrJob && (
                      <p className="text-xs mt-2" style={{ color: "#16a34a" }}>
                        ✓ Submitted to Bankr · Job ID: {result.bankrJob.jobId}
                      </p>
                    )}
                  </div>
                )}

                {/* Recommendation */}
                <div
                  className="card p-5 text-center font-semibold"
                  style={{ color: "var(--text)", borderColor: scoreColor(result.launchScore) }}
                >
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
                <div key={step.label} className="card p-6 flex gap-4 items-start">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(74,144,217,0.1)", color: "#4a90d9", border: "1px solid rgba(74,144,217,0.3)" }}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <div className="font-semibold" style={{ color: "var(--text)" }}>{step.label}</div>
                    <div className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card p-6">
              <div className="text-xs font-semibold mb-2" style={{ color: "#4a90d9" }}>COMING SOON</div>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                The full agent wizard — name, persona, model config, skills, pricing, and Bankr marketplace publish — is in active development. Use <span className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: "rgba(74,144,217,0.08)", color: "#4a90d9" }}>blue launch</span> in the console to generate an agent config today.
              </p>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
