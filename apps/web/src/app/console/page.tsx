"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import MarkdownOutput from "@/components/MarkdownOutput";
import { useAccount, useConnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { bestConnector } from "@/lib/wallet";
import { fetchBlueBalance, getTierInfo, type TierInfo } from "@/lib/credits";

type Command = {
  id: string;
  label: string;
  cmd: string;
  desc: string;
  example: string;
  skills: string[];
  price: string;
};

const COMMANDS: Command[] = [
  {
    id: "idea", label: "Idea", cmd: "blue idea", price: "$0.05",
    desc: "Turn a rough concept into a fundable brief — problem, why now, why Base, MVP scope, risks, 24h plan.",
    example: "A USDC streaming payroll app for DAOs on Base",
    skills: ["base-standards", "bankr-tools"],
  },
  {
    id: "build", label: "Build", cmd: "blue build", price: "$0.50",
    desc: "Architecture, stack, folder structure, integrations, and test plan. No hallucinated addresses.",
    example: "Build a token-gated API with x402 payments on Base",
    skills: ["base-addresses", "base-standards", "bankr-tools"],
  },
  {
    id: "audit", label: "Audit", cmd: "blue audit", price: "$1.00",
    desc: "500+ security checks · 13 categories · Base-native. Reentrancy, oracle, MEV, x402, Coinbase Smart Wallet.",
    example: "Audit this ERC-20 contract: [paste code]",
    skills: ["base-security", "base-addresses"],
  },
  {
    id: "ship", label: "Ship", cmd: "blue ship", price: "$0.10",
    desc: "Deployment checklist, verification steps, release notes, monitoring. Everything you forget when excited to launch.",
    example: "Ship my Uniswap v4 hook to Base mainnet",
    skills: ["base-standards", "base-addresses"],
  },
  {
    id: "raise", label: "Raise", cmd: "blue raise", price: "$0.20",
    desc: "Fundraising narrative, investor deck outline, smart money map, competitive landscape for your Base niche.",
    example: "Raise a pre-seed for my Base DeFi protocol",
    skills: ["blue-agent-identity", "base-standards"],
  },
];

function shortAddr(a: string) { return a.slice(0,6) + "…" + a.slice(-4); }

export default function ConsolePage() {
  const [selected, setSelected] = useState<Command>(COMMANDS[0]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const { address, isConnected } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();
  const [tier, setTier] = useState<TierInfo | null>(null);

  useEffect(() => {
    if (!address) { setTier(null); return; }
    fetchBlueBalance(address).then(b => setTier(getTierInfo(b)));
  }, [address]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setResult("");
    setError("");
    try {
      const res = await fetch("/api/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: selected.id, prompt }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setResult(data.result ?? data.text ?? JSON.stringify(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />
      <div className="flex bg-[#050508] font-mono pt-16">

        {/* ── Sidebar ──────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-[#1A1A2E]">
          {/* Header */}
          <div className="px-5 pt-6 pb-4 border-b border-[#1A1A2E]">
            <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// COMMANDS</p>
          </div>
          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-2">
            {COMMANDS.map((cmd) => (
              <button
                key={cmd.id}
                onClick={() => { setSelected(cmd); setResult(""); setError(""); }}
                className={`w-full text-left px-5 py-3 transition-all border-l-2 ${
                  selected.id === cmd.id
                    ? "border-[#4FC3F7] bg-[#4FC3F7]/5 text-white"
                    : "border-transparent text-slate-500 hover:text-white hover:bg-[#0D0D1A]"
                }`}
              >
                <div className="font-mono text-sm flex items-center justify-between">
                  <span>{cmd.cmd}</span>
                  <span className="font-mono text-[10px] text-slate-700 ml-2">{cmd.price}</span>
                </div>
                <div className="font-mono text-[10px] text-slate-700 mt-0.5 leading-snug">{cmd.label} — {cmd.desc.slice(0, 40)}…</div>
              </button>
            ))}
          </nav>
          {/* Footer — wallet + terminal hint */}
          <div className="px-5 py-4 border-t border-[#1A1A2E] space-y-3">
            {/* Wallet state */}
            {isConnected && address ? (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: tier?.color ?? "#475569", boxShadow: `0 0 5px ${tier?.color ?? "#475569"}` }} />
                <span className="font-mono text-[10px] text-slate-400 truncate">{shortAddr(address)}</span>
                {tier && (
                  <span className="font-mono text-[10px] ml-auto px-1.5 py-0.5 rounded"
                    style={{ background: `${tier.color}20`, color: tier.color }}>
                    {tier.tier}
                  </span>
                )}
              </div>
            ) : (
              <button
                onClick={() => connect({ connector: bestConnector() })}
                disabled={isConnecting}
                className="w-full font-mono text-[10px] font-semibold py-2 rounded border transition-all disabled:opacity-50"
                style={{ borderColor: "#4FC3F7", color: "#4FC3F7", background: "#4FC3F710" }}
              >
                {isConnecting ? "Connecting…" : "Connect Wallet"}
              </button>
            )}
            {/* Terminal hint */}
            <div>
              <p className="font-mono text-[10px] text-slate-700 mb-1.5">run in terminal:</p>
              <div className="bg-[#0D0D14] rounded-lg px-3 py-2">
                <span className="font-mono text-[10px] text-slate-600">$ </span>
                <span className="font-mono text-[10px] text-[#4FC3F7]">blue {selected.id}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────── */}
        <main className="flex-1 h-[calc(100vh-4rem)] overflow-y-auto">

          {/* Page hero */}
          <div className="text-center py-12 px-8 border-b border-[#1A1A2E]">
            <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-4 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
              <span className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">FOUNDER CONSOLE</span>
            </div>
            <h1 className="font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
              BLUE<span className="text-[#4FC3F7]">AGENT</span> Console
            </h1>
            <p className="font-mono text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
              5 AI commands for Base builders — grounded in real Base knowledge.
            </p>
            {/* Mobile command tabs */}
            <div className="lg:hidden flex gap-2 mt-6 flex-wrap justify-center">
              {COMMANDS.map((cmd) => (
                <button key={cmd.id}
                  onClick={() => { setSelected(cmd); setResult(""); setError(""); }}
                  className={`font-mono text-xs px-3 py-1.5 rounded-lg transition-all ${
                    selected.id === cmd.id ? "bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30" : "text-slate-500 hover:text-white"
                  }`}>
                  {cmd.cmd}
                </button>
              ))}
            </div>
          </div>

          <div className="px-6 lg:px-10 py-8 w-full">

          {/* Command info */}
          <div className="mb-6 card-surface rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-xs text-[#4FC3F7]">&lt;{selected.label}&gt;</span>
              <span className="font-mono text-sm text-white font-semibold">{selected.cmd}</span>
              <span className="font-mono text-xs text-slate-700 ml-auto">{selected.price}</span>
            </div>
            <p className="font-mono text-sm text-slate-400 mb-3 leading-relaxed">{selected.desc}</p>
            <div className="flex flex-wrap gap-1">
              {selected.skills.map((s) => (
                <span key={s} className="font-mono text-[10px] text-slate-600 border border-[#1A1A2E] px-2 py-0.5 rounded">
                  [{s}]
                </span>
              ))}
            </div>
          </div>

          {/* Wallet gate banner */}
          {!isConnected && (
            <div className="mb-6 card-surface rounded-xl p-4 border border-[#4FC3F7]/15 flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-slate-300 font-semibold mb-0.5">Connect to unlock Console</p>
                <p className="font-mono text-[10px] text-slate-600">Hold $BLUEAGENT · pay {selected.price} per run</p>
              </div>
              <button
                onClick={() => connect({ connector: bestConnector() })}
                disabled={isConnecting}
                className="shrink-0 font-mono text-xs font-semibold px-3 py-1.5 rounded border transition-all disabled:opacity-50"
                style={{ borderColor: "#4FC3F7", color: "#4FC3F7", background: "#4FC3F710" }}
              >
                {isConnecting ? "Connecting…" : "Connect →"}
              </button>
            </div>
          )}

          {/* Tier badge (connected) */}
          {isConnected && tier && (
            <div className="mb-4 flex items-center gap-2 px-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: tier.color }} />
              <span className="font-mono text-[10px]" style={{ color: tier.color }}>{tier.tier}</span>
              {tier.discount > 0 && (
                <span className="font-mono text-[10px] text-green-400">{Math.round(tier.discount * 100)}% discount</span>
              )}
              {tier.nextTier && (
                <span className="font-mono text-[10px] text-slate-700 ml-auto">
                  {(tier.nextTier.need / 1000).toFixed(0)}K BLUE → {tier.nextTier.name}
                </span>
              )}
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="mb-6">
            <div className="card-surface rounded-xl p-1 flex gap-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent); } }}
                placeholder={selected.example}
                rows={3}
                disabled={!isConnected}
                className="flex-1 bg-transparent px-3 py-2 font-mono text-sm text-white placeholder-slate-700 outline-none resize-none disabled:opacity-40"
              />
              <button type="submit" disabled={loading || !prompt.trim() || !isConnected}
                className="self-end font-mono text-xs font-semibold bg-[#4FC3F7] text-[#050508] px-4 py-2 rounded-lg hover:bg-[#29ABE2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-1 mr-1">
                {loading ? "…" : "Run →"}
              </button>
            </div>
            <p className="font-mono text-[10px] text-slate-700 mt-1.5 px-1">Enter to submit · Shift+Enter for newline</p>
          </form>

          {/* Output — error */}
          {error && (
            <div className="card-surface rounded-xl p-4 border border-[#4FC3F7]/10 mb-4">
              <p className="font-mono text-xs text-slate-500">// Coming soon for holders — hold $BLUEAGENT to unlock Console access</p>
            </div>
          )}

          {loading && (
            <div className="card-surface rounded-xl p-6 flex items-center gap-3">
              <div className="glow-dot animate-pulse" />
              <span className="font-mono text-xs text-slate-500">Blue Agent thinking…</span>
            </div>
          )}

          {result && (
            <div className="card-surface rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#1A1A2E]">
                <div className="glow-dot" />
                <span className="font-mono text-xs text-slate-400">blue {selected.id}</span>
                <span className="font-mono text-xs text-slate-700 ml-auto">grounded · 34 skills loaded</span>
              </div>
              <MarkdownOutput content={result} />
            </div>
          )}

          {!result && !loading && !error && (
            <div className="flex flex-col gap-4">
              {/* Command context */}
              <div className="card-surface rounded-xl p-5">
                <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">// COMMAND CONTEXT</p>
                <p className="font-mono text-xs text-slate-300 leading-relaxed mb-4">{selected.desc}</p>
                <div className="flex items-start gap-3">
                  <span className="font-mono text-[10px] text-[#4FC3F7] shrink-0 w-16 mt-0.5">example</span>
                  <span className="font-mono text-[10px] text-slate-600 italic">{selected.example}</span>
                </div>
              </div>

              {/* Skills grounding */}
              <div className="card-surface rounded-xl p-5">
                <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">// GROUNDING FILES LOADED</p>
                <div className="flex flex-wrap gap-2">
                  {selected.skills.map(s => (
                    <span key={s} className="font-mono text-[10px] px-2.5 py-1 bg-[#050508] border border-[#1A1A2E] text-slate-500 rounded">
                      [{s}]
                    </span>
                  ))}
                </div>
              </div>

              {/* How it works */}
              <div className="card-surface rounded-xl p-5">
                <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">// HOW IT WORKS</p>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { step: "01", label: "Input", desc: "Describe your idea, project, or code" },
                    { step: "02", label: "Ground", desc: "Blue Agent cross-refs 34 Base skill files" },
                    { step: "03", label: "Output", desc: "Structured result · no hallucinations" },
                  ].map(s => (
                    <div key={s.step}>
                      <span className="font-mono text-[10px] text-[#4FC3F7]">{s.step}</span>
                      <p className="font-mono text-xs text-white mt-1 mb-1">{s.label}</p>
                      <p className="font-mono text-[10px] text-slate-600 leading-relaxed">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status bar */}
              <div className="flex items-center gap-3 px-4 py-3 border border-[#1A1A2E] rounded-xl">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse shrink-0" />
                <span className="font-mono text-[10px] text-slate-700">
                  {isConnected
                    ? `34 skills loaded · Base-grounded · Bankr LLM · ${selected.price}/run`
                    : "Connect wallet to run commands · Hold $BLUEAGENT · pay per use · x402 on Base"}
                </span>
              </div>
            </div>
          )}
          </div>
        </main>
      </div>
    </>
  );
}
