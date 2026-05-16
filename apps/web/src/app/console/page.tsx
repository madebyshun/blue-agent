"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import MarkdownOutput from "@/components/MarkdownOutput";

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

export default function ConsolePage() {
  const [selected, setSelected] = useState<Command>(COMMANDS[0]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setResult("");
    setError("");
    try {
      const res = await fetch("/api/chat", {
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
      <div className="bg-[#050508] font-mono pt-16 min-h-screen flex">

        {/* ── Sidebar ──────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 sticky top-16 self-start h-[calc(100vh-4rem)] border-r border-[#1A1A2E] py-10 px-4">
          <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-4 px-2">COMMANDS</p>
          <nav className="flex flex-col gap-1">
            {COMMANDS.map((cmd) => (
              <button
                key={cmd.id}
                onClick={() => { setSelected(cmd); setResult(""); setError(""); }}
                className={`text-left px-3 py-2.5 rounded-lg transition-all ${
                  selected.id === cmd.id
                    ? "bg-[#4FC3F7]/8 text-[#4FC3F7]"
                    : "text-slate-500 hover:text-slate-300 hover:bg-[#1A1A2E]/50"
                }`}
              >
                <div className="font-mono text-sm flex items-center justify-between">
                  <span>{cmd.cmd}</span>
                  <span className="font-mono text-[10px] text-slate-700">{cmd.price}</span>
                </div>
                <div className="font-mono text-[10px] text-slate-700 mt-0.5 leading-snug">{cmd.label} — {cmd.desc.slice(0, 40)}…</div>
              </button>
            ))}
          </nav>

          <div className="mt-auto px-2 pt-6 border-t border-[#1A1A2E]">
            <p className="font-mono text-[10px] text-slate-700 mb-2">run in terminal:</p>
            <div className="bg-[#0D0D14] rounded-lg px-3 py-2">
              <span className="font-mono text-[10px] text-slate-600">$ </span>
              <span className="font-mono text-[10px] text-[#4FC3F7]">blue {selected.id}</span>
            </div>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────── */}
        <main className="flex-1 px-6 lg:px-10 py-10 max-w-4xl">

          {/* Page header */}
          <div className="mb-10">
            <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-3">// CONSOLE</p>
            <h1 className="font-mono text-4xl sm:text-5xl font-bold text-white mb-3">
              BLUE<span className="text-[#4FC3F7]">AGENT</span> Console
            </h1>
            <p className="font-mono text-base text-slate-400 max-w-xl">
              5 AI commands for Base builders — grounded in real Base knowledge.
            </p>

            {/* Mobile command tabs */}
            <div className="lg:hidden flex gap-2 mt-6 flex-wrap border-b border-[#1A1A2E] pb-4">
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

          {/* Input */}
          <form onSubmit={handleSubmit} className="mb-6">
            <div className="card-surface rounded-xl p-1 flex gap-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent); } }}
                placeholder={selected.example}
                rows={3}
                className="flex-1 bg-transparent px-3 py-2 font-mono text-sm text-white placeholder-slate-700 outline-none resize-none"
              />
              <button type="submit" disabled={loading || !prompt.trim()}
                className="self-end font-mono text-xs font-semibold bg-[#4FC3F7] text-[#050508] px-4 py-2 rounded-lg hover:bg-[#29ABE2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-1 mr-1">
                {loading ? "…" : "Run →"}
              </button>
            </div>
            <p className="font-mono text-[10px] text-slate-700 mt-1.5 px-1">Enter to submit · Shift+Enter for newline</p>
          </form>

          {/* Output */}
          {error && (
            <div className="card-surface rounded-xl p-4 border border-red-500/20 mb-4">
              <p className="font-mono text-xs text-red-400">{error}</p>
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
                <span className="font-mono text-xs text-slate-700 ml-auto">grounded · 6 skills loaded</span>
              </div>
              <MarkdownOutput content={result} />
            </div>
          )}

          {!result && !loading && !error && (
            <div className="card-surface rounded-xl p-8 text-center">
              <p className="font-mono text-xs text-slate-700 mb-2">// waiting for input</p>
              <p className="font-mono text-[10px] text-slate-800">6 skills loaded · Base-grounded · Bankr LLM</p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
