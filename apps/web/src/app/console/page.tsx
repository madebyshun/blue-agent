"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";

type Command = {
  id: string;
  label: string;
  cmd: string;
  desc: string;
  example: string;
  skills: string[];
};

const COMMANDS: Command[] = [
  {
    id: "idea",
    label: "Idea",
    cmd: "blue idea",
    desc: "Turn a rough concept into a fundable brief — problem, why now, why Base, MVP scope, risks, 24h plan.",
    example: "A USDC streaming payroll app for DAOs on Base",
    skills: ["base-standards", "bankr-tools"],
  },
  {
    id: "build",
    label: "Build",
    cmd: "blue build",
    desc: "Architecture, stack, folder structure, integrations, and test plan. No hallucinated addresses.",
    example: "Build a token-gated API with x402 payments on Base",
    skills: ["base-addresses", "base-standards", "bankr-tools"],
  },
  {
    id: "audit",
    label: "Audit",
    cmd: "blue audit",
    desc: "500+ security checks · 13 categories · Base-native. Reentrancy, oracle, MEV, x402, Coinbase Smart Wallet.",
    example: "Audit this ERC-20 contract: [paste code]",
    skills: ["base-security", "base-addresses"],
  },
  {
    id: "ship",
    label: "Ship",
    cmd: "blue ship",
    desc: "Deployment checklist, verification steps, release notes, monitoring. Everything you forget when excited to launch.",
    example: "Ship my Uniswap v4 hook to Base mainnet",
    skills: ["base-standards", "base-addresses"],
  },
  {
    id: "raise",
    label: "Raise",
    cmd: "blue raise",
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
      <main className="min-h-screen bg-[#050508] font-mono pt-16 flex flex-col lg:flex-row">

        {/* Sidebar — command picker */}
        <aside className="lg:w-64 border-b lg:border-b-0 lg:border-r border-[#1A1A2E] p-4 flex flex-col gap-1 shrink-0">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest px-3 py-2">COMMANDS</p>
          {COMMANDS.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => { setSelected(cmd); setResult(""); setError(""); }}
              className={`text-left px-3 py-3 rounded-lg transition-all ${
                selected.id === cmd.id
                  ? "bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 text-white"
                  : "text-slate-500 hover:text-white hover:bg-[#1A1A2E]/50"
              }`}
            >
              <div className="font-mono text-xs font-semibold mb-0.5">
                {selected.id === cmd.id && <span className="text-[#4FC3F7]">❯ </span>}
                {cmd.cmd}
              </div>
              <div className="font-mono text-[10px] text-slate-600 leading-snug">{cmd.label} — {cmd.desc.slice(0, 50)}…</div>
            </button>
          ))}

          {/* CLI hint */}
          <div className="mt-auto pt-4 border-t border-[#1A1A2E]">
            <p className="font-mono text-[10px] text-slate-700 px-1">
              Or run in terminal:
            </p>
            <div className="mt-1 bg-[#0D0D14] rounded px-2 py-1.5">
              <span className="font-mono text-[10px] text-slate-600">$ </span>
              <span className="font-mono text-[10px] text-[#4FC3F7]">npx @blueagent/builder {selected.id}</span>
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <div className="flex-1 flex flex-col p-6 max-w-4xl">

          {/* Command header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-[#4FC3F7]">&lt;{selected.label}&gt;</span>
              <span className="font-mono text-sm text-white font-semibold">{selected.cmd}</span>
            </div>
            <p className="font-mono text-xs text-slate-500 mb-2">{selected.desc}</p>
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
            <div className="card-surface rounded-lg p-1 flex gap-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e as any); } }}
                placeholder={selected.example}
                rows={3}
                className="flex-1 bg-transparent px-3 py-2 font-mono text-sm text-white placeholder-slate-700 outline-none resize-none"
              />
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                className="self-end font-mono text-xs font-semibold bg-[#4FC3F7] text-[#050508] px-4 py-2 rounded hover:bg-[#29ABE2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-1 mr-1"
              >
                {loading ? "..." : "Run →"}
              </button>
            </div>
            <p className="font-mono text-[10px] text-slate-700 mt-1 px-1">Enter to submit · Shift+Enter for newline</p>
          </form>

          {/* Output */}
          {error && (
            <div className="card-surface rounded-lg p-4 border-red-500/20 mb-4">
              <p className="font-mono text-xs text-red-400">{error}</p>
            </div>
          )}

          {loading && (
            <div className="card-surface rounded-lg p-6 flex items-center gap-3">
              <div className="glow-dot animate-pulse" />
              <span className="font-mono text-xs text-slate-500">Blue Agent thinking…</span>
            </div>
          )}

          {result && (
            <div className="card-surface rounded-lg p-6 flex-1">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#1A1A2E]">
                <div className="glow-dot" />
                <span className="font-mono text-xs text-slate-400">blue {selected.id}</span>
                <span className="font-mono text-xs text-slate-700 ml-auto">grounded · 6 skills loaded</span>
              </div>
              <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {result}
              </pre>
            </div>
          )}

          {!result && !loading && !error && (
            <div className="card-surface rounded-lg p-8 text-center">
              <p className="font-mono text-xs text-slate-700 mb-2">// waiting for input</p>
              <p className="font-mono text-[10px] text-slate-800">6 skills loaded · Base-grounded · Bankr LLM</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
