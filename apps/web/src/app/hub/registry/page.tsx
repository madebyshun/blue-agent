"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import type { AgentProfile } from "@/app/api/agent-registry/submit/route";

// ─── Design tokens ────────────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  A: "text-[#34D399] border-[#34D399]/30 bg-[#34D399]/5",
  B: "text-[#4FC3F7] border-[#4FC3F7]/30 bg-[#4FC3F7]/5",
  C: "text-[#A78BFA] border-[#A78BFA]/30 bg-[#A78BFA]/5",
  D: "text-yellow-400 border-yellow-400/30 bg-yellow-400/5",
  F: "text-red-400 border-red-400/30 bg-red-400/5",
};

const TYPE_COLORS: Record<string, string> = {
  trading: "text-yellow-400 border-yellow-400/20",
  builder: "text-[#4FC3F7] border-[#4FC3F7]/20",
  content: "text-[#A78BFA] border-[#A78BFA]/20",
  defi:    "text-[#34D399] border-[#34D399]/20",
  infra:   "text-cyan-400 border-cyan-400/20",
  general: "text-slate-400 border-slate-700",
};

const TYPES = ["all", "trading", "builder", "content", "defi", "infra", "general"];

// ─── Submit form ──────────────────────────────────────────────────────────────

function SubmitForm({ onSubmitted, onClose }: { onSubmitted: (p: AgentProfile) => void; onClose: () => void }) {
  const [repo, setRepo]       = useState("");
  const [name, setName]       = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/agent-registry/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, name, website, twitter }),
      });
      const data = await res.json() as AgentProfile & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      onSubmitted(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-[#1A1A2E] bg-[#0D0D1A] rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// SUBMIT AGENT</p>
        <button onClick={onClose} className="font-mono text-[10px] text-slate-700 hover:text-slate-400 transition-colors">✕ close</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block font-mono text-[10px] text-slate-600 mb-1 tracking-widest">GITHUB REPO *</label>
          <input
            value={repo}
            onChange={e => setRepo(e.target.value)}
            placeholder="owner/repo or https://github.com/owner/repo"
            required
            className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/30 rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-slate-700 focus:outline-none transition-colors"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-mono text-[10px] text-slate-600 mb-1 tracking-widest">AGENT NAME</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Agent"
              className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/30 rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-slate-700 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] text-slate-600 mb-1 tracking-widest">TWITTER / X</label>
            <input
              value={twitter}
              onChange={e => setTwitter(e.target.value)}
              placeholder="@handle"
              className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/30 rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-slate-700 focus:outline-none transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="block font-mono text-[10px] text-slate-600 mb-1 tracking-widest">WEBSITE</label>
          <input
            value={website}
            onChange={e => setWebsite(e.target.value)}
            placeholder="https://youragent.xyz"
            className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/30 rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-slate-700 focus:outline-none transition-colors"
          />
        </div>
        {error && <p className="font-mono text-[10px] text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-[#4FC3F7]/10 hover:bg-[#4FC3F7]/20 disabled:opacity-40 disabled:cursor-not-allowed border border-[#4FC3F7]/20 hover:border-[#4FC3F7]/40 text-[#4FC3F7] font-mono text-xs rounded-lg transition-all"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3 h-3 border border-[#4FC3F7]/30 border-t-[#4FC3F7] rounded-full animate-spin" />
              running 3-agent audit… (~30s)
            </span>
          ) : "→ submit agent"}
        </button>
        <p className="font-mono text-[10px] text-slate-700 text-center">
          Blue Agent + Aeon + MiroShark audit your repo automatically
        </p>
      </form>
    </div>
  );
}

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentProfile }) {
  const gradeColor = GRADE_COLORS[agent.grade] ?? GRADE_COLORS.F;
  const typeColor  = TYPE_COLORS[agent.agent_type] ?? TYPE_COLORS.general;

  return (
    <Link
      href={`/hub/registry/${agent.handle}`}
      className="block bg-[#0D0D1A] border border-[#1A1A2E] hover:border-[#4FC3F7]/20 rounded-xl p-4 transition-all group"
    >
      {/* Top row: grade + name */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`font-mono text-base font-bold px-2 py-0.5 border rounded shrink-0 ${gradeColor}`}>
          {agent.grade}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm text-white group-hover:text-[#4FC3F7] transition-colors truncate">
            {agent.name}
          </p>
          <p className="font-mono text-[10px] text-slate-600 truncate">{agent.fullName}</p>
        </div>
        {agent.featured && (
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#A78BFA]/40 text-[#A78BFA] shrink-0">★</span>
        )}
      </div>

      {/* Description */}
      <p className="font-mono text-[11px] text-slate-500 line-clamp-2 mb-3 leading-relaxed">
        {agent.description || "No description"}
      </p>

      {/* Meta row */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`font-mono text-[9px] px-1.5 py-0.5 border rounded uppercase tracking-widest ${typeColor}`}>
          {agent.agent_type}
        </span>
        <span className="font-mono text-[10px] text-slate-700">{agent.language}</span>
        {agent.stars > 0 && (
          <span className="font-mono text-[10px] text-slate-700">★ {agent.stars}</span>
        )}
        <span className="ml-auto font-mono text-[10px] text-slate-600">{agent.health_score}/100</span>
      </div>

      {/* Skills */}
      {agent.skills.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {agent.skills.slice(0, 3).map(s => (
            <span key={s} className="font-mono text-[9px] px-1.5 py-0.5 bg-[#050508] border border-[#1A1A2E] text-slate-500 rounded">
              {s}
            </span>
          ))}
          {agent.skills.length > 3 && (
            <span className="font-mono text-[9px] text-slate-700">+{agent.skills.length - 3}</span>
          )}
        </div>
      )}
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegistryPage() {
  const [agents, setAgents]       = useState<AgentProfile[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showSubmit, setShowSubmit] = useState(false);
  const [filter, setFilter]       = useState("all");
  const [search, setSearch]       = useState("");
  const [newAgent, setNewAgent]   = useState<AgentProfile | null>(null);

  useEffect(() => {
    fetch("/api/agent-registry/list")
      .then(r => r.json())
      .then((d: { agents: AgentProfile[] }) => setAgents(d.agents ?? []))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  function handleSubmitted(profile: AgentProfile) {
    setAgents(prev => {
      const exists = prev.find(a => a.handle === profile.handle);
      if (exists) return prev.map(a => a.handle === profile.handle ? profile : a);
      return [profile, ...prev];
    });
    setNewAgent(profile);
    setShowSubmit(false);
  }

  const filtered = agents.filter(a => {
    if (filter !== "all" && a.agent_type !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.name.toLowerCase().includes(q) ||
             a.fullName.toLowerCase().includes(q) ||
             a.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#050508] font-mono pt-16">
        <div className="max-w-5xl mx-auto px-5 py-8">

          {/* ── Header ── */}
          <div className="mb-8">
            <Link href="/hub" className="font-mono text-[10px] text-slate-700 hover:text-slate-500 transition-colors tracking-widest">
              ← BLUE HUB
            </Link>
            <div className="flex items-start justify-between gap-4 mt-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" />
                  <span className="font-mono text-[10px] text-[#34D399] tracking-widest">AGENT REGISTRY · BASE</span>
                </div>
                <h1 className="font-mono text-3xl font-bold text-white tracking-tight">
                  AGENT<span className="text-[#4FC3F7]">REGISTRY</span>
                </h1>
                <p className="font-mono text-xs text-slate-600 mt-2 max-w-lg leading-relaxed">
                  Discover Base AI agents — automated audit by Blue Agent + Aeon + MiroShark.
                  Submit your repo, get graded.
                </p>
              </div>
              <button
                onClick={() => setShowSubmit(s => !s)}
                className="shrink-0 px-4 py-2 bg-[#4FC3F7]/10 hover:bg-[#4FC3F7]/20 border border-[#4FC3F7]/20 hover:border-[#4FC3F7]/40 text-[#4FC3F7] font-mono text-xs rounded-lg transition-all"
              >
                {showSubmit ? "✕ cancel" : "+ submit agent"}
              </button>
            </div>
          </div>

          {/* ── Submit form ── */}
          {showSubmit && (
            <SubmitForm onSubmitted={handleSubmitted} onClose={() => setShowSubmit(false)} />
          )}

          {/* ── New agent toast ── */}
          {newAgent && (
            <div className="mb-6 px-4 py-3 border border-[#34D399]/20 bg-[#34D399]/5 rounded-xl flex items-center gap-3">
              <span className="font-mono text-[10px] text-[#34D399]">✓ submitted</span>
              <span className="font-mono text-xs text-white">{newAgent.name}</span>
              <span className={`font-mono text-[10px] px-1.5 py-0.5 border rounded ${GRADE_COLORS[newAgent.grade] ?? ""}`}>
                {newAgent.grade}
              </span>
              <span className="font-mono text-[10px] text-slate-600">{newAgent.health_score}/100</span>
              <Link href={`/hub/registry/${newAgent.handle}`}
                className="ml-auto font-mono text-[10px] text-[#4FC3F7] hover:underline">
                view profile →
              </Link>
              <button onClick={() => setNewAgent(null)} className="font-mono text-[10px] text-slate-700 hover:text-slate-400">✕</button>
            </div>
          )}

          {/* ── Stats ── */}
          <div className="flex items-center gap-6 mb-6 border-b border-[#1A1A2E] pb-4">
            <div>
              <span className="font-mono text-xl font-bold text-white">{agents.length}</span>
              <span className="font-mono text-[10px] text-slate-600 ml-2">agents</span>
            </div>
            <div>
              <span className="font-mono text-xl font-bold text-[#34D399]">{agents.filter(a => a.grade === "A").length}</span>
              <span className="font-mono text-[10px] text-slate-600 ml-2">grade A</span>
            </div>
            <div>
              <span className="font-mono text-xl font-bold text-[#A78BFA]">{agents.filter(a => a.verified).length}</span>
              <span className="font-mono text-[10px] text-slate-600 ml-2">verified</span>
            </div>
            <div className="ml-auto">
              <p className="font-mono text-[10px] text-slate-700">3-agent consensus · Blue · Aeon · MiroShark</p>
            </div>
          </div>

          {/* ── Filters ── */}
          <div className="flex items-center gap-4 mb-6 flex-wrap">
            {/* Type filter */}
            <div className="flex gap-1 flex-wrap">
              {TYPES.map(t => (
                <button key={t} onClick={() => setFilter(t)}
                  className={`font-mono text-[10px] px-2 py-1 rounded transition-colors capitalize ${
                    filter === t
                      ? "bg-[#4FC3F7]/15 text-[#4FC3F7]"
                      : "text-slate-600 hover:text-slate-300"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
            {/* Search */}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search agents…"
              className="ml-auto bg-[#0D0D1A] border border-[#1A1A2E] focus:border-[#4FC3F7]/30 rounded-lg px-3 py-1.5 font-mono text-xs text-white placeholder-slate-700 focus:outline-none transition-colors w-44"
            />
          </div>

          {/* ── Grid ── */}
          {loading ? (
            <div className="text-center py-20">
              <p className="font-mono text-xs text-slate-700 animate-pulse">loading registry…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 border border-[#1A1A2E] rounded-xl">
              <p className="font-mono text-xs text-slate-700 mb-4">
                {agents.length === 0 ? "no agents registered yet — be the first" : "no agents match filter"}
              </p>
              {agents.length === 0 && (
                <button onClick={() => setShowSubmit(true)}
                  className="font-mono text-xs text-[#4FC3F7] hover:underline">
                  → submit your agent
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(agent => (
                <AgentCard key={agent.handle} agent={agent} />
              ))}
            </div>
          )}

          {/* ── Footer ── */}
          <div className="mt-12 pt-4 border-t border-[#1A1A2E] flex items-center justify-between">
            <p className="font-mono text-[10px] text-slate-700">Blue Hub Agent Registry · Base chain</p>
            <Link href="/hub" className="font-mono text-[10px] text-slate-700 hover:text-slate-500 transition-colors">
              ← back to hub
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
