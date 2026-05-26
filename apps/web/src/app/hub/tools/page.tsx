"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import type { AgentTool, AgentToolInput } from "@/lib/agent-tools";

// ─── Design tokens ────────────────────────────────────────────────────────────

const AGENT_COLORS: Record<string, string> = {
  "Aeon":        "#A78BFA",
  "Blue Agent":  "#4FC3F7",
  "MiroShark":   "#34D399",
  "Blue + Aeon": "#F59E0B",
};

const CAT_LABELS: Record<string, string> = {
  all:      "All",
  market:   "Market",
  defi:     "DeFi",
  builder:  "Builder",
  research: "Research",
  security: "Security",
};

// ─── Scan log animation ───────────────────────────────────────────────────────

type LogLine = { text: string; color: string };

function ScanLog({ tool }: { tool: AgentTool }) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [cursor, setCursor] = useState(true);

  useEffect(() => {
    const agentColor = AGENT_COLORS[tool.agentName] ?? "#4FC3F7";
    const scripts: LogLine[] = tool.isComposite && tool.compositeSkills
      ? [
          { text: `[sys] initializing composite tool: ${tool.name}`, color: "#475569" },
          { text: `[sys] spawning ${tool.compositeSkills.length} agents...`, color: "#475569" },
          ...tool.compositeSkills.map(cs => ({
            text: `[aeon] running skill: ${cs.skillId}`,
            color: AGENT_COLORS["Aeon"],
          })),
          { text: `[sys] waiting for parallel results...`, color: "#475569" },
          { text: `[blue] synthesizing ${tool.compositeSkills.length} outputs...`, color: AGENT_COLORS["Blue Agent"] },
          { text: `[blue] building unified intelligence brief...`, color: AGENT_COLORS["Blue Agent"] },
          { text: `[sys] composite run complete`, color: "#34D399" },
        ]
      : [
          { text: `[sys] loading skill: ${tool.skillId ?? tool.id}`, color: "#475569" },
          { text: `[${tool.agentName.toLowerCase()}] fetching skill file...`, color: agentColor },
          { text: `[${tool.agentName.toLowerCase()}] analyzing input...`, color: agentColor },
          { text: `[${tool.agentName.toLowerCase()}] generating output...`, color: agentColor },
          { text: `[sys] processing response...`, color: "#475569" },
          { text: `[sys] done`, color: "#34D399" },
        ];

    let i = 0;
    const timer = setInterval(() => {
      if (i < scripts.length) {
        setLines(prev => [...prev, scripts[i]]);
        i++;
      } else {
        clearInterval(timer);
      }
    }, 520);

    const cursorTimer = setInterval(() => setCursor(p => !p), 500);
    return () => { clearInterval(timer); clearInterval(cursorTimer); };
  }, [tool]);

  return (
    <div className="bg-[#050508] border border-[#1A1A2E] rounded-xl overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#1A1A2E]">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        <span className="font-mono text-[10px] text-slate-700 ml-2">
          {tool.isComposite ? "composite-runner" : `${tool.agentName?.toLowerCase()}-skill`}
        </span>
      </div>
      <div className="p-4 min-h-[140px] font-mono text-[11px] space-y-1">
        {lines.map((l, i) => (
          <p key={i} style={{ color: l.color }} className="animate-fadeIn">{l.text}</p>
        ))}
        {lines.length < 7 && (
          <span className="inline-block w-1.5 h-3 bg-[#4FC3F7]" style={{ opacity: cursor ? 1 : 0 }} />
        )}
      </div>
    </div>
  );
}

// ─── Result renderer ──────────────────────────────────────────────────────────

function ToolResult({ result, tool }: { result: string; tool: AgentTool }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    try {
      navigator.clipboard?.writeText(result).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    } catch {
      // clipboard not available
    }
  }

  return (
    <div className="bg-[#050508] border border-[#1A1A2E] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1A1A2E]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
        <span className="font-mono text-[10px] text-[#34D399] tracking-widest">OUTPUT · {tool.agentName.toUpperCase()}</span>
        {tool.isComposite && (
          <span className="font-mono text-[9px] px-1.5 py-0.5 border border-[#F59E0B]/30 text-[#F59E0B] rounded ml-1">
            ✦ composite
          </span>
        )}
        <button onClick={copy} className="ml-auto font-mono text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
      <div className="p-4 max-h-[480px] overflow-y-auto">
        <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{result}</pre>
      </div>
    </div>
  );
}

// ─── Tool runner panel ────────────────────────────────────────────────────────

function ToolRunner({ tool, onBack }: { tool: AgentTool; onBack: () => void }) {
  const [values, setValues]   = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState<string | null>(null);
  const [error, setError]     = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  function setValue(key: string, val: string) {
    setValues(prev => ({ ...prev, [key]: val }));
  }

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setResult(null); setRunning(true);

    const inputParts = tool.inputs
      .map((inp: AgentToolInput) => values[inp.key] ? `${inp.label}: ${values[inp.key]}` : "")
      .filter(Boolean);
    const userInput = inputParts.join("\n") || "";

    try {
      const res = await fetch("/api/tool-runner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: tool.id, input: userInput }),
      });
      const data = await res.json() as { result?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      setResult(data.result ?? "");
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  const agentColor = AGENT_COLORS[tool.agentName] ?? "#4FC3F7";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1A1A2E] flex items-center gap-3">
        <button onClick={onBack} className="font-mono text-[10px] text-slate-700 hover:text-slate-400 transition-colors">
          ← back
        </button>
        <div className="w-px h-4 bg-[#1A1A2E]" />
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: agentColor }} />
          <span className="font-mono text-xs text-white">{tool.name}</span>
          {tool.isComposite && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 border border-[#F59E0B]/30 text-[#F59E0B] rounded">✦ composite</span>
          )}
        </div>
        <span className="ml-auto font-mono text-[10px] text-slate-600">by {tool.agentName}</span>
      </div>

      {/* 2-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: form */}
        <div className="w-[380px] shrink-0 border-r border-[#1A1A2E] flex flex-col overflow-y-auto">
          <div className="p-5 flex-1">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-1">// DESCRIPTION</p>
            <p className="font-mono text-xs text-slate-400 leading-relaxed mb-5">{tool.description}</p>

            {tool.isComposite && tool.compositeSkills && (
              <div className="mb-5">
                <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-2">// COMPOSITE SKILLS</p>
                <div className="space-y-1">
                  {tool.compositeSkills.map((cs, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[#A78BFA]">{i + 1}.</span>
                      <span className="font-mono text-[10px] text-slate-400">{cs.label}</span>
                      <span className="font-mono text-[9px] text-slate-700 ml-auto">{cs.agentType}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[10px] text-[#4FC3F7]">→</span>
                    <span className="font-mono text-[10px] text-[#4FC3F7]">Blue Agent synthesis</span>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleRun} className="space-y-3">
              <p className="font-mono text-[10px] text-slate-600 tracking-widest">// INPUT</p>
              {tool.inputs.map((inp: AgentToolInput) => (
                <div key={inp.key}>
                  <label className="block font-mono text-[10px] text-slate-600 mb-1">
                    {inp.label.toUpperCase()}{inp.required && " *"}
                  </label>
                  <input
                    value={values[inp.key] ?? ""}
                    onChange={e => setValue(inp.key, e.target.value)}
                    placeholder={inp.placeholder}
                    required={inp.required}
                    className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/30 rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-slate-700 focus:outline-none transition-colors"
                  />
                </div>
              ))}

              {error && <p className="font-mono text-[10px] text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={running}
                className="w-full py-2 font-mono text-xs border transition-all disabled:opacity-40 disabled:cursor-not-allowed rounded-lg"
                style={{
                  background: `${agentColor}15`,
                  borderColor: `${agentColor}30`,
                  color: agentColor,
                }}
              >
                {running ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin" />
                    {tool.isComposite ? `running ${tool.compositeSkills?.length} skills…` : "running…"}
                  </span>
                ) : `→ run ${tool.isComposite ? "composite" : tool.agentName.toLowerCase()}`}
              </button>

              <p className="font-mono text-[10px] text-slate-700 text-center">
                {tool.isComposite
                  ? `${tool.compositeSkills?.length} skills run in parallel → Blue synthesis`
                  : `powered by ${tool.agentName}`}
              </p>
            </form>
          </div>
        </div>

        {/* Right: output */}
        <div className="flex-1 overflow-y-auto p-5">
          {running
            ? <ScanLog tool={tool} />
            : result !== null
            ? <div ref={resultRef}><ToolResult result={result} tool={tool} /></div>
            : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-2">// WAITING FOR INPUT</p>
                  <p className="font-mono text-xs text-slate-700">Fill the form and run →</p>
                </div>
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}

// ─── Tool card ────────────────────────────────────────────────────────────────

function ToolCard({ tool, onSelect }: { tool: AgentTool; onSelect: () => void }) {
  const agentColor = AGENT_COLORS[tool.agentName] ?? "#4FC3F7";
  return (
    <button
      onClick={onSelect}
      className="text-left w-full bg-[#0D0D1A] border border-[#1A1A2E] hover:border-[#4FC3F7]/20 rounded-xl p-4 transition-all group"
    >
      {/* Agent dot + composite badge */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: agentColor }} />
        <span className="font-mono text-[10px]" style={{ color: agentColor }}>{tool.agentName}</span>
        {tool.isComposite && (
          <span className="font-mono text-[9px] px-1 py-0.5 border border-[#F59E0B]/30 text-[#F59E0B] rounded ml-auto">✦</span>
        )}
        {tool.featured && !tool.isComposite && (
          <span className="font-mono text-[9px] text-[#A78BFA] ml-auto">★</span>
        )}
      </div>

      {/* Name */}
      <p className="font-mono text-sm text-white group-hover:text-[#4FC3F7] transition-colors mb-1.5">
        {tool.name}
      </p>

      {/* Description */}
      <p className="font-mono text-[11px] text-slate-600 line-clamp-2 leading-relaxed mb-3">
        {tool.description}
      </p>

      {/* Composite skills preview */}
      {tool.isComposite && tool.compositeSkills && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tool.compositeSkills.map((cs, i) => (
            <span key={cs.skillId ?? i} className="font-mono text-[9px] px-1.5 py-0.5 bg-[#050508] border border-[#1A1A2E] text-slate-600 rounded">
              {cs.label}
            </span>
          ))}
          <span className="font-mono text-[9px] text-[#4FC3F7]">→ synthesis</span>
        </div>
      )}

      {/* Run hint */}
      <p className="font-mono text-[9px] text-slate-700 group-hover:text-[#4FC3F7]/60 transition-colors">
        → run tool
      </p>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ToolsData = { tools: AgentTool[]; total: number; composite: number; agents: string[] };

const CATS = Object.entries(CAT_LABELS);

export default function ToolsPage() {
  const [tools, setTools]       = useState<AgentTool[]>([]);
  const [selected, setSelected] = useState<AgentTool | null>(null);
  const [cat, setCat]           = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [compositeOnly, setCompositeOnly] = useState(false);

  useEffect(() => {
    fetch("/api/tool-runner")
      .then(r => r.json())
      .then((d: ToolsData) => setTools(d.tools ?? []))
      .catch(() => setTools([]))
      .finally(() => setLoading(false));
  }, []);

  const agents = ["all", ...Array.from(new Set(tools.map(t => t.agentName)))];

  const filtered = tools.filter(t => {
    if (cat !== "all" && t.category !== cat) return false;
    if (agentFilter !== "all" && t.agentName !== agentFilter) return false;
    if (compositeOnly && !t.isComposite) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) &&
        !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const featured  = filtered.filter(t => t.featured);
  const composite = filtered.filter(t => t.isComposite);
  const regular   = filtered.filter(t => !t.isComposite && !t.featured);

  if (selected) {
    return (
      <>
        <Navbar />
        <div className="bg-[#050508] font-mono pt-16 h-screen flex flex-col">
          <ToolRunner tool={selected} onBack={() => setSelected(null)} />
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="flex bg-[#050508] font-mono pt-16">
          {/* ── Sidebar ── */}
          <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-[#1A1A2E]">
            <div className="px-5 pt-6 pb-4 border-b border-[#1A1A2E]">
              <Link href="/hub" className="font-mono text-[10px] text-slate-700 hover:text-slate-500 transition-colors tracking-widest">
                ← BLUE HUB
              </Link>
              <p className="font-mono text-[10px] text-[#F59E0B] tracking-widest mt-3">// AGENT TOOLS</p>
              <p className="font-mono text-[10px] text-slate-700 mt-1">{filtered.length} tools · {tools.filter(t=>t.isComposite).length} composite</p>
            </div>

            {/* Search */}
            <div className="px-4 pt-3 pb-2">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tools…"
                className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/30 rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-slate-700 focus:outline-none transition-colors"
              />
            </div>

            {/* Category */}
            <div className="px-4 pb-3">
              <p className="font-mono text-[10px] text-slate-700 mb-2 tracking-widest">CATEGORY</p>
              <div className="flex flex-wrap gap-1">
                {CATS.map(([key, label]) => (
                  <button key={key} onClick={() => setCat(key)}
                    className={`font-mono text-[10px] px-2 py-1 rounded transition-colors ${
                      cat === key ? "bg-[#4FC3F7]/15 text-[#4FC3F7]" : "text-slate-600 hover:text-slate-300"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Agent filter */}
            <div className="px-4 pb-3 border-t border-[#1A1A2E] pt-3">
              <p className="font-mono text-[10px] text-slate-700 mb-2 tracking-widest">AGENT</p>
              <div className="space-y-0.5">
                {agents.map(a => (
                  <button key={a} onClick={() => setAgentFilter(a)}
                    className={`w-full text-left font-mono text-[11px] px-2 py-1 rounded transition-colors flex items-center gap-2 ${
                      agentFilter === a ? "text-white" : "text-slate-600 hover:text-slate-300"
                    }`}>
                    {a !== "all" && (
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: AGENT_COLORS[a] ?? "#475569" }} />
                    )}
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* Composite toggle */}
            <div className="px-4 pb-3 border-t border-[#1A1A2E] pt-3">
              <button
                onClick={() => setCompositeOnly(p => !p)}
                className={`flex items-center gap-2 font-mono text-[10px] px-2 py-1 rounded transition-colors ${
                  compositeOnly ? "bg-[#F59E0B]/15 text-[#F59E0B]" : "text-slate-600 hover:text-slate-300"
                }`}>
                <span>✦ composite only</span>
              </button>
            </div>

            <div className="mt-auto px-4 py-4 border-t border-[#1A1A2E]">
              <Link href="/hub/registry"
                className="flex items-center gap-2 font-mono text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                Agent Registry
              </Link>
            </div>
          </aside>

          {/* ── Main ── */}
          <main className="flex-1 h-[calc(100vh-4rem)] overflow-y-auto px-6 py-8">

            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse" />
                <span className="font-mono text-[10px] text-[#F59E0B] tracking-widest">AGENT TOOLS · UNIFIED FEED</span>
              </div>
              <h1 className="font-mono text-3xl font-bold text-white tracking-tight">
                AGENT<span className="text-[#F59E0B]">TOOLS</span>
              </h1>
              <p className="font-mono text-xs text-slate-600 mt-2 max-w-lg leading-relaxed">
                Tools auto-generated from agent skills. Run any tool directly — single agent or composite multi-agent.
              </p>
            </div>

            {loading ? (
              <p className="font-mono text-xs text-slate-700 animate-pulse">loading tools…</p>
            ) : (
              <div className="space-y-8">

                {/* Composite tools */}
                {composite.length > 0 && !compositeOnly && (
                  <section>
                    <div className="flex items-center gap-3 mb-3">
                      <p className="font-mono text-[10px] text-[#F59E0B] tracking-widest">// COMPOSITE · MULTI-AGENT</p>
                      <div className="flex-1 h-px bg-[#F59E0B]/10" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {composite.map(t => <ToolCard key={t.id} tool={t} onSelect={() => setSelected(t)} />)}
                    </div>
                  </section>
                )}

                {/* Composite only view */}
                {compositeOnly && (
                  <section>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filtered.map(t => <ToolCard key={t.id} tool={t} onSelect={() => setSelected(t)} />)}
                    </div>
                  </section>
                )}

                {/* Featured */}
                {featured.length > 0 && !compositeOnly && (
                  <section>
                    <div className="flex items-center gap-3 mb-3">
                      <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest">// FEATURED</p>
                      <div className="flex-1 h-px bg-[#A78BFA]/10" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {featured.map(t => <ToolCard key={t.id} tool={t} onSelect={() => setSelected(t)} />)}
                    </div>
                  </section>
                )}

                {/* All tools */}
                {regular.length > 0 && !compositeOnly && (
                  <section>
                    <div className="flex items-center gap-3 mb-3">
                      <p className="font-mono text-[10px] text-slate-600 tracking-widest">// ALL TOOLS</p>
                      <div className="flex-1 h-px bg-[#1A1A2E]" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {regular.map(t => <ToolCard key={t.id} tool={t} onSelect={() => setSelected(t)} />)}
                    </div>
                  </section>
                )}

                {filtered.length === 0 && (
                  <div className="text-center py-20 border border-[#1A1A2E] rounded-xl">
                    <p className="font-mono text-xs text-slate-700">no tools match filter</p>
                  </div>
                )}
              </div>
            )}
          </main>
      </div>
    </>
  );
}
