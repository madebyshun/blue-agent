"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { AGENT_TOOLS } from "@/lib/agent-tools";

type Agent = "blue" | "aeon" | "miroshark";
const AGENT_COLORS: Record<Agent, string> = { blue: "#4FC3F7", aeon: "#A78BFA", miroshark: "#34D399" };
const AGENT_LABELS: Record<Agent, string> = { blue: "Blue", aeon: "Aeon", miroshark: "MiroShark" };

function agentsOf(t: { isComposite: boolean; agentName: string }): Agent[] {
  if (t.isComposite) return ["blue", "aeon", "miroshark"];
  if (t.agentName === "Aeon") return ["aeon"];
  if (t.agentName === "MiroShark") return ["miroshark"];
  return ["blue"];
}

export default function ToolDetailClient({ toolId }: { toolId: string }) {
  const tool = AGENT_TOOLS.find(t => t.id === toolId);
  const [runs, setRuns] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/usage")
      .then(r => r.json())
      .then((u: Record<string, number>) => setRuns(u[toolId] ?? 0))
      .catch(() => {});
  }, [toolId]);

  if (!tool) return null;
  const agents = agentsOf(tool);

  const share = () => {
    const url = `https://blueagent.dev/hub/${toolId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#050508] font-mono pt-16 text-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-8">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6 text-xs">
            <Link href="/hub" className="text-slate-500 hover:text-[#4FC3F7] transition-colors">Hub</Link>
            <span className="text-slate-700">/</span>
            <span className="text-slate-400 truncate">{tool.name}</span>
          </div>

          {/* Hero */}
          <div className="relative overflow-hidden rounded-2xl border border-[#1A1A2E] bg-[#0A0A12] p-7 mb-6">
            <div className="absolute -top-16 -right-8 w-60 h-60 rounded-full bg-[#4FC3F7]/10 blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                {agents.map(a => (
                  <span key={a} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold"
                    style={{ color: AGENT_COLORS[a], borderColor: `${AGENT_COLORS[a]}30`, background: `${AGENT_COLORS[a]}0D` }}>
                    <span className="w-1 h-1 rounded-full" style={{ background: AGENT_COLORS[a] }} />
                    {AGENT_LABELS[a]}
                  </span>
                ))}
                <span className="ml-auto font-mono text-[10px] text-slate-600 uppercase tracking-wider">{tool.category}</span>
              </div>

              <h1 className="text-2xl xl:text-3xl font-bold text-white tracking-tight leading-tight">{tool.name}</h1>
              <p className="text-sm text-slate-400 mt-3 leading-relaxed">{tool.description}</p>

              <div className="flex flex-wrap items-center gap-2 mt-5">
                {tool.price && (
                  <span className="px-3 py-1.5 rounded-lg border border-[#4FC3F7]/30 bg-[#4FC3F7]/5 text-[#4FC3F7] text-sm font-bold">
                    {tool.price} <span className="text-[10px] text-slate-500 font-normal">/ run</span>
                  </span>
                )}
                <span className="px-3 py-1.5 rounded-lg border border-[#1A1A2E] bg-[#0D0D1A] text-xs text-slate-400">
                  {runs === null ? "…" : runs.toLocaleString()} <span className="text-[10px] text-slate-600">runs</span>
                </span>
                <span className="px-3 py-1.5 rounded-lg border border-[#1A1A2E] bg-[#0D0D1A] text-xs text-slate-400">
                  pay in USDC · no API key
                </span>
              </div>

              <div className="flex items-center gap-2.5 mt-6">
                <Link href={`/hub?tool=${toolId}`}
                  className="px-5 py-2.5 rounded-xl bg-[#4FC3F7] text-[#050508] font-mono text-sm font-semibold hover:bg-[#29ABE2] transition-colors">
                  Run this tool →
                </Link>
                <button onClick={share}
                  className={`px-4 py-2.5 rounded-xl border font-mono text-xs transition-all ${
                    copied ? "text-[#34D399] border-[#34D399]/40 bg-[#34D399]/5"
                           : "text-slate-400 border-[#1A1A2E] hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30"
                  }`}>
                  {copied ? "✓ Link copied" : "Share ↗"}
                </button>
              </div>
            </div>
          </div>

          {/* Inputs — what you provide */}
          {tool.inputs.length > 0 && (
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0A0A12] p-6 mb-6">
              <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-4">// INPUTS</p>
              <div className="space-y-3">
                {tool.inputs.map(inp => (
                  <div key={inp.key} className="flex items-start gap-3">
                    <span className="font-mono text-xs text-slate-300 min-w-[120px]">
                      {inp.label}
                      {inp.required && <span className="text-[#4FC3F7] ml-1">*</span>}
                    </span>
                    <span className="font-mono text-[11px] text-slate-600 leading-relaxed">{inp.placeholder}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How it works — 3-agent pipeline */}
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0A0A12] p-6 mb-6">
            <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest mb-4">// HOW IT WORKS</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {agents.map((a, i) => (
                <span key={a} className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg border" style={{ color: AGENT_COLORS[a], borderColor: `${AGENT_COLORS[a]}30` }}>
                    {AGENT_LABELS[a]}
                  </span>
                  {i < agents.length - 1 && <span className="text-slate-700">→</span>}
                </span>
              ))}
            </div>
            <p className="font-mono text-[11px] text-slate-500 mt-4 leading-relaxed">
              {agents.length > 1
                ? "Multi-agent consensus: each agent contributes, then synthesizes into one verdict — grounded in live Base data."
                : "Runs on Base with live data grounding. Pay per call in USDC via x402 — no subscription, no API key."}
            </p>
          </div>

          {/* CTA footer */}
          <div className="flex items-center justify-between rounded-2xl border border-[#1A1A2E] bg-gradient-to-br from-[#4FC3F7]/[0.06] to-[#A78BFA]/[0.06] p-6">
            <div>
              <p className="font-mono text-sm font-semibold text-white">Run {tool.name}</p>
              <p className="font-mono text-[11px] text-slate-500 mt-1">Connect a wallet · pay {tool.price} in USDC · get results in seconds</p>
            </div>
            <Link href={`/hub?tool=${toolId}`}
              className="px-5 py-2.5 rounded-xl bg-[#4FC3F7] text-[#050508] font-mono text-sm font-semibold hover:bg-[#29ABE2] transition-colors shrink-0">
              Run →
            </Link>
          </div>

        </div>
      </div>
    </>
  );
}
